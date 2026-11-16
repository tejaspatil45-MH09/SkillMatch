import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import request from 'supertest'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { requireAuth, requireRole } from '../src/middleware/auth.js'
import { revokeUserSessions } from '../src/modules/auth/sessions.js'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { db } from './helpers.js'

const run = promisify(execFile)
const sent = []
const mailer = { send: async (m) => { sent.push(m) } }
const app = createApp({
  pool: db, limits: false, mailer,
  routes: (a) => {
    a.get('/admin-only', requireAuth, requireRole('ADMIN'), (req, res) => res.json({ ok: true }))
    a.get('/any-user', requireAuth, (req, res) => res.json({ id: req.user.id, role: req.user.role }))
  },
})
const DEMO = 'Password@123'
let n = 0
const fresh = () => `newuser${++n}-${Date.now()}@example.com`
const signup = (a, over = {}) => request(a).post('/api/auth/register').send({ name: 'Test Person', email: fresh(), password: 'Str0ngPassw0rd', role: 'FREELANCER', ...over })
const login = (email, password = DEMO, a = app) => request(a).post('/api/auth/login').send({ email, password })
const cookieOf = (res) => res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ')
const sessionsFor = async (id) => Number((await db.query("SELECT count(*) FROM session WHERE sess ->> 'userId' = $1", [id])).rows[0].count)
const tokenFrom = (mail) => mail.text.match(/token=([\w-]+)/)[1]
const mailTo = (email) => vi.waitFor(() => { const m = [...sent].reverse().find((x) => x.to === email); expect(m).toBeTruthy(); return m })

beforeAll(async () => { await withTransaction(seed, db); await db.query('DELETE FROM session') })

describe('registration', () => {
  it('creates a freelancer, logs them in, and returns the frontend user shape', async () => {
    const email = fresh().toUpperCase()   // emails are normalised to lower case
    const res = await signup(app, { email, name: '  Asha Rao  ' })
    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ name: 'Asha Rao', email: email.toLowerCase(), role: 'FREELANCER', status: 'ACTIVE' })
    expect(res.body.user.profile).toMatchObject({ headline: '', skills: [], portfolio: [], experience: [], experienceYears: null })
    expect(res.body.user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2|hash/i)
    const me = await request(app).get('/api/auth/me').set('Cookie', cookieOf(res))
    expect(me.status).toBe(200)
    expect(me.body.user.id).toBe(res.body.user.id)
  })
  it('creates a company with a company profile', async () => {
    const res = await signup(app, { role: 'COMPANY', name: 'Orbit Systems' })
    expect(res.status).toBe(201)
    expect(res.body.user.profile).toEqual({ description: '', website: '', location: '', industry: '', logo: null })
  })
  it('stores an argon2id hash, never the password', async () => {
    const res = await signup(app, { password: 'Another0Password' })
    const { rows: [u] } = await db.query('SELECT password_hash FROM users WHERE id = $1', [res.body.user.id])
    expect(u.password_hash).toMatch(/^\$argon2id\$/)
    expect(u.password_hash).not.toContain('Another0Password')
  })
  it('sets an httpOnly, SameSite=Lax session cookie (and Secure in production)', async () => {
    const res = await signup(app)
    const c = res.headers['set-cookie'][0]
    expect(c).toMatch(/^sm\.sid=/); expect(c).toContain('HttpOnly'); expect(c).toContain('SameSite=Lax'); expect(c).toContain('Path=/'); expect(c).not.toContain('Secure')
    const prod = createApp({ pool: db, limits: false, mailer, cookieSecure: true })
    const p = await signup(prod).set('X-Forwarded-Proto', 'https')
    expect(p.headers['set-cookie'][0]).toContain('Secure')
  })
  it('can NOT create an admin, even by asking', async () => {
    const before = Number((await db.query("SELECT count(*) FROM users WHERE role = 'ADMIN'")).rows[0].count)
    const res = await signup(app, { role: 'ADMIN' })
    expect(res.status).toBe(400); expect(res.body.code).toBe('VALIDATION'); expect(res.body.fields.role).toBeDefined()
    expect(Number((await db.query("SELECT count(*) FROM users WHERE role = 'ADMIN'")).rows[0].count)).toBe(before)
  })
  it('rejects unknown fields instead of ignoring them (mass-assignment guard)', async () => {
    const email = fresh()
    const res = await signup(app, { email, status: 'SUSPENDED', id: '00000000-0000-0000-0000-000000000000' })
    expect(res.status).toBe(400)
    expect((await db.query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount).toBe(0)
  })
  it('validates every field with readable messages', async () => {
    const bad = await signup(app, { name: 'A', email: 'nope', password: 'short', role: undefined })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body.fields).sort()).toEqual(['email', 'name', 'password', 'role'])
    expect((await signup(app, { password: 'allletters' })).body.fields.password[0]).toMatch(/number/)
    expect((await signup(app, { password: '12345678' })).body.fields.password[0]).toMatch(/letter/)
    expect((await signup(app, { password: 'a1' + 'x'.repeat(130) })).status).toBe(400)   // length cap protects the hasher
  })
  it('rejects a duplicate email, ignoring case, with EMAIL_TAKEN', async () => {
    const email = fresh()
    await signup(app, { email })
    const res = await signup(app, { email: email.toUpperCase() })
    expect(res.status).toBe(409); expect(res.body.code).toBe('EMAIL_TAKEN')
  })
  it('two simultaneous sign-ups with one email: exactly one wins', async () => {
    const email = fresh()
    const results = await Promise.all([signup(app, { email }), signup(app, { email })])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(results.find((r) => r.status === 409).body.code).toBe('EMAIL_TAKEN')
  })
})

describe('login and sessions', () => {
  it('logs in a seeded user and returns their full profile', async () => {
    const res = await login('aarav@skillmatch.dev')
    expect(res.status).toBe(200)
    expect(res.body.user.profile.skills).toEqual(['Express', 'JavaScript', 'Node.js', 'PostgreSQL', 'React', 'REST APIs', 'Tailwind CSS'])
    expect(res.body.user.profile.portfolio).toHaveLength(2)
    expect(res.body.user.profile.portfolio[0]).toMatchObject({ title: 'Kirana Cart', url: 'https://example.com/kirana-cart', image: null })
    expect(res.body.user.profile.experience).toHaveLength(1)
    expect(res.body.user.profile).toMatchObject({ headline: 'Full-stack developer', experienceYears: 3 })
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i)
  })
  it('is case-insensitive for email', async () => {
    expect((await login('AARAV@SkillMatch.DEV')).status).toBe(200)
  })
  it('gives the same answer for a wrong password and an unknown email (no account enumeration)', async () => {
    const wrong = await login('aarav@skillmatch.dev', 'WrongPassw0rd')
    const unknown = await login('nobody-here@example.com', 'WrongPassw0rd')
    expect(wrong.status).toBe(401); expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
    expect(wrong.body).toEqual({ message: 'Incorrect email or password.', code: 'INVALID_CREDENTIALS' })
  })
  it('requires both fields and rejects extras', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400)
    expect((await request(app).post('/api/auth/login').send({ email: 'aarav@skillmatch.dev', password: DEMO, remember: true })).status).toBe(400)
  })
  it('/me needs a session', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401); expect(res.body.code).toBe('UNAUTHENTICATED')
  })
  it('logout destroys the session server-side: a copied cookie stops working', async () => {
    const cookie = cookieOf(await login('rohan@skillmatch.dev'))
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200)
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(200)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401)   // replaying the old cookie fails
  })
  it('logging out when not logged in is harmless', async () => {
    expect((await request(app).post('/api/auth/logout')).body).toEqual({ ok: true })
  })
  it('issues a NEW session id on every login (session fixation)', async () => {
    const first = cookieOf(await login('priya@skillmatch.dev'))
    const second = await request(app).post('/api/auth/login').set('Cookie', first).send({ email: 'priya@skillmatch.dev', password: DEMO })
    expect(cookieOf(second)).not.toBe(first)
    expect((await request(app).get('/api/auth/me').set('Cookie', first)).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieOf(second))).status).toBe(200)
  })
  it('a session for a deleted user is rejected', async () => {
    const res = await signup(app)
    await db.query('DELETE FROM users WHERE id = $1', [res.body.user.id])
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieOf(res))).status).toBe(401)
  })
})

describe('suspension and revocation', () => {
  it('a suspended user is blocked immediately on their existing session, and the session is destroyed', async () => {
    const res = await signup(app)
    const cookie = cookieOf(res)
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [res.body.user.id])
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.status).toBe(403); expect(me.body.code).toBe('SUSPENDED')
    expect(await sessionsFor(res.body.user.id)).toBe(0)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401)
  })
  it('a suspended user cannot log in, but the reason is only revealed after the password is proven', async () => {
    const email = fresh()
    const u = await signup(app, { email })
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [u.body.user.id])
    const ok = await login(email, 'Str0ngPassw0rd')
    expect(ok.status).toBe(403); expect(ok.body.code).toBe('SUSPENDED')
    const wrong = await login(email, 'WrongPassw0rd1')
    expect(wrong.status).toBe(401); expect(wrong.body.code).toBe('INVALID_CREDENTIALS')
  })
  it('revokeUserSessions logs a user out of every device at once', async () => {
    const a = cookieOf(await login('kunal@skillmatch.dev')), b = cookieOf(await login('kunal@skillmatch.dev'))
    const { rows: [u] } = await db.query("SELECT id FROM users WHERE email = 'kunal@skillmatch.dev'")
    expect(await sessionsFor(u.id)).toBe(2)
    await revokeUserSessions(db, u.id)
    expect((await request(app).get('/api/auth/me').set('Cookie', a)).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set('Cookie', b)).status).toBe(401)
  })
})

describe('authorization middleware', () => {
  it('requireAuth / requireRole: anonymous 401, wrong role 403, right role 200', async () => {
    expect((await request(app).get('/admin-only')).status).toBe(401)
    const f = await request(app).get('/admin-only').set('Cookie', cookieOf(await login('aarav@skillmatch.dev')))
    expect(f.status).toBe(403); expect(f.body.code).toBe('FORBIDDEN')
    const a = await request(app).get('/admin-only').set('Cookie', cookieOf(await login('admin@skillmatch.dev')))
    expect(a.status).toBe(200)
  })
  it('the role comes from the database, not from anything the client sends', async () => {
    const res = await request(app).get('/any-user').set('Cookie', cookieOf(await login('hr@technova.dev'))).set('X-Role', 'ADMIN')
    expect(res.body.role).toBe('COMPANY')
  })
})

describe('CSRF and CORS', () => {
  it('blocks state-changing requests from an untrusted origin', async () => {
    const evil = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'aarav@skillmatch.dev', password: DEMO })
    expect(evil.status).toBe(403); expect(evil.body.code).toBe('CSRF_BLOCKED')
    expect(evil.headers['set-cookie']).toBeUndefined()
  })
  it('allows the configured frontend origin and non-browser clients', async () => {
    expect((await request(app).post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email: 'aarav@skillmatch.dev', password: 'WrongPassw0rd1' })).status).toBe(401)   // got past the guard
    expect((await login('aarav@skillmatch.dev')).status).toBe(200)   // no Origin header
  })
  it('CORS allows credentials for the frontend only', async () => {
    const ok = await request(app).options('/api/auth/login').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST')
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173'); expect(ok.headers['access-control-allow-credentials']).toBe('true')
    const bad = await request(app).options('/api/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST')
    expect(bad.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('password reset', () => {
  async function account() {
    const email = fresh(); const u = await signup(app, { email })
    return { email, id: u.body.user.id, cookie: cookieOf(u) }
  }
  it('answers identically for known and unknown emails', async () => {
    const { email } = await account()
    const known = await request(app).post('/api/auth/forgot-password').send({ email })
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' })
    expect(known.status).toBe(200); expect(unknown.status).toBe(200)
    expect(known.body).toEqual(unknown.body)
  })
  it('emails a link only to real, active accounts, and stores only a hash of the token', async () => {
    const { email, id } = await account()
    await request(app).post('/api/auth/forgot-password').send({ email })
    const mail = await mailTo(email)
    const token = tokenFrom(mail)
    expect(mail.text).toContain('/reset-password?token='); expect(token.length).toBeGreaterThanOrEqual(40)
    expect((await db.query('SELECT 1 FROM password_reset_tokens WHERE token_hash = $1', [token])).rowCount).toBe(0)   // raw token never stored
    expect((await db.query('SELECT 1 FROM password_reset_tokens WHERE user_id = $1', [id])).rowCount).toBe(1)
    const before = sent.length
    await request(app).post('/api/auth/forgot-password').send({ email: 'ghost2@example.com' })
    const s = await account(); await db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [s.id])
    await request(app).post('/api/auth/forgot-password').send({ email: s.email })
    await new Promise((r) => setTimeout(r, 400))
    expect(sent.length).toBe(before)   // nothing sent for unknown or suspended accounts
  })
  it('full flow: reset works once, changes the password, and logs out every session', async () => {
    const { email, cookie } = await account()
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = tokenFrom(await mailTo(email))
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200)
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'BrandNew1Password' })
    expect(res.status).toBe(200)
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401)      // old session revoked
    expect((await login(email, 'Str0ngPassw0rd')).status).toBe(401)                              // old password dead
    expect((await login(email, 'BrandNew1Password')).status).toBe(200)                           // new one works
    const again = await request(app).post('/api/auth/reset-password').send({ token, password: 'Another1Password' })
    expect(again.status).toBe(400); expect(again.body.code).toBe('INVALID_TOKEN')                // single use
  })
  it('rejects expired, tampered and unknown tokens', async () => {
    const { email, id } = await account()
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = tokenFrom(await mailTo(email))
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    for (const t of [tampered, 'x'.repeat(43)]) expect((await request(app).post('/api/auth/reset-password').send({ token: t, password: 'BrandNew1Password' })).body.code).toBe('INVALID_TOKEN')
    await db.query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [id])
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'BrandNew1Password' })).body.code).toBe('INVALID_TOKEN')
  })
  it('a weak new password is refused without burning the token', async () => {
    const { email } = await account()
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = tokenFrom(await mailTo(email))
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'weak' })).status).toBe(400)
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'BrandNew1Password' })).status).toBe(200)
  })
  it('asking again invalidates the earlier link', async () => {
    const { email } = await account()
    await request(app).post('/api/auth/forgot-password').send({ email }); const first = tokenFrom(await mailTo(email))
    const count = sent.length
    await request(app).post('/api/auth/forgot-password').send({ email }); await vi.waitFor(() => expect(sent.length).toBe(count + 1))
    const second = tokenFrom(sent.at(-1))
    expect(first).not.toBe(second)
    expect((await request(app).post('/api/auth/reset-password').send({ token: first, password: 'BrandNew1Password' })).status).toBe(400)
    expect((await request(app).post('/api/auth/reset-password').send({ token: second, password: 'BrandNew1Password' })).status).toBe(200)
  })
  it('two simultaneous uses of one token: exactly one succeeds', async () => {
    const { email } = await account()
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = tokenFrom(await mailTo(email))
    const r = await Promise.all([1, 2, 3].map((i) => request(app).post('/api/auth/reset-password').send({ token, password: `Concurrent${i}Pass` })))
    expect(r.map((x) => x.status).sort()).toEqual([200, 400, 400])
  })
})

describe('rate limiting', () => {
  const limits = { login: { windowMs: 60000, ip: 5, account: 2 }, register: { windowMs: 60000, ip: 50 }, forgot: { windowMs: 60000, ip: 50, account: 2 }, reset: { windowMs: 60000, ip: 50 } }
  it('limits failed logins per account, but successful logins do not count', async () => {
    const limited = createApp({ pool: db, limits, mailer })
    for (let i = 0; i < 4; i++) expect((await login('aarav@skillmatch.dev', DEMO, limited)).status).toBe(200)   // successes are free
    expect((await login('rohan@skillmatch.dev', 'WrongPassw0rd1', limited)).status).toBe(401)
    expect((await login('rohan@skillmatch.dev', 'WrongPassw0rd1', limited)).status).toBe(401)
    const blocked = await login('rohan@skillmatch.dev', 'WrongPassw0rd1', limited)
    expect(blocked.status).toBe(429); expect(blocked.body.code).toBe('RATE_LIMITED'); expect(blocked.headers['ratelimit']).toBeDefined()
    expect((await login('priya@skillmatch.dev', 'WrongPassw0rd1', limited)).status).toBe(401)   // a different account is unaffected
  })
  it('limits failures from one IP across many accounts', async () => {
    const limited = createApp({ pool: db, limits: { ...limits, login: { windowMs: 60000, ip: 3, account: 50 } }, mailer })
    for (let i = 0; i < 3; i++) expect((await login(`guess${i}@example.com`, 'WrongPassw0rd1', limited)).status).toBe(401)
    expect((await login('guess9@example.com', 'WrongPassw0rd1', limited)).status).toBe(429)
  })
  it('limits password-reset requests per account', async () => {
    const limited = createApp({ pool: db, limits, mailer })
    const ask = () => request(limited).post('/api/auth/forgot-password').send({ email: 'spam@example.com' })
    expect((await ask()).status).toBe(200); expect((await ask()).status).toBe(200)
    expect((await ask()).status).toBe(429)
  })
})

describe('create-admin script', () => {
  const exec = (args, password) => run('node', ['scripts/create-admin.js', ...args], { env: { ...process.env, ADMIN_PASSWORD: password } }).then((r) => ({ code: 0, ...r }), (e) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }))
  it('creates an admin who can log in, with no profile', async () => {
    const email = fresh()
    const r = await exec(['--email', email, '--name', 'Site Admin'], 'Adm1nPassw0rd')
    expect(r.code).toBe(0)
    const res = await login(email, 'Adm1nPassw0rd')
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ role: 'ADMIN', profile: {} })
    expect((await request(app).get('/admin-only').set('Cookie', cookieOf(res))).status).toBe(200)
  })
  it('refuses weak passwords and duplicate emails', async () => {
    const email = fresh()
    const weak = await exec(['--email', email, '--name', 'Weak Admin'], 'short')
    expect(weak.code).toBe(1); expect(weak.stderr).toMatch(/password/)
    expect((await db.query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount).toBe(0)
    const dup = await exec(['--email', 'admin@skillmatch.dev', '--name', 'Second Admin'], 'Adm1nPassw0rd')
    expect(dup.code).toBe(1); expect(dup.stderr).toMatch(/already exists/)
  })
})
