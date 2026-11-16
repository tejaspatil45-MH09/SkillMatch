import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { createApp } from '../src/app.js'
import { pool } from '../src/db/pool.js'
import { defaultLimits } from '../src/middleware/rateLimit.js'
import { app, db, idOf, loginAs } from './helpers.js'
import { discoverRoutes, key, PUBLIC, withId } from './routeTable.js'

const routes = discoverRoutes()
const NONE = '00000000-0000-0000-0000-000000000000'
let aarav, technova, admin

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, technova, admin] = await Promise.all(['aarav@skillmatch.dev', 'hr@technova.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('route discovery', () => {
  it('finds the whole API from the source', () => {
    expect(routes.length).toBeGreaterThanOrEqual(50)
    for (const k of ['post /api/auth/login', 'post /api/demos/:id/access', 'post /api/proposals/:id/accept', 'get /api/admin/stats', 'post /api/projects/:id/proposals', 'get /api/health', 'post /api/reports', 'get /api/company/dashboard', 'get /api/hirings/:id', 'post /api/hirings/:id/submissions', 'post /api/hirings/:id/submissions/:submissionId/approve', 'post /api/hirings/:id/submissions/:submissionId/request-revision', 'get /api/hirings/:id/messages', 'post /api/hirings/:id/messages', 'get /api/admin/analytics', 'get /api/admin/analytics/export'])
      expect(routes.map(key), k).toContain(k)
    expect(new Set(routes.map(key)).size).toBe(routes.length)   // no duplicate route definitions
    for (const p of PUBLIC) expect(routes.map(key), `stale public entry ${p}`).toContain(p)
  })
})

describe('authentication matrix (generated from the real routes)', () => {
  it('every non-public endpoint refuses an anonymous caller with 401', async () => {
    for (const r of routes.filter((x) => !PUBLIC.has(key(x)))) {
      const res = await request(app)[r.method](withId(r.template, NONE)).send({})
      expect([res.status, res.body.code], key(r)).toEqual([401, 'UNAUTHENTICATED'])
    }
  })
  it('every state-changing endpoint refuses a cross-site Origin, even from a signed-in browser', async () => {
    for (const r of routes.filter((x) => x.method !== 'get')) {
      for (const who of [request(app), aarav, admin]) {
        const res = await who[r.method](withId(r.template, NONE)).set('Origin', 'https://evil.example').send({})
        expect([res.status, res.body.code], key(r)).toEqual([403, 'CSRF_BLOCKED'])
      }
    }
  })
})

// ---- fuzzing: nothing a client sends may ever cause a 500 or leak internals
const BODIES = [
  ['empty', ''], ['empty object', '{}'], ['array', '[]'], ['null', 'null'], ['string', '"hello"'], ['number', '123'], ['boolean', 'true'],
  ['unknown field', '{"zzz":1}'], ['prototype pollution', '{"__proto__":{"role":"ADMIN"},"constructor":{"prototype":{"x":1}}}'],
  ['NUL byte in text', '{"name":"a\\u0000b","title":"a\\u0000b","reason":"a\\u0000b","comment":"a\\u0000b","email":"a\\u0000b@x.co","coverLetter":"a\\u0000b","description":"a\\u0000b","password":"a\\u0000b","url":"https://a\\u0000b.com"}'],
  ['NUL inside nested', '{"profile":{"headline":"a\\u0000b","skills":["a\\u0000b"],"portfolio":[{"title":"a\\u0000b","description":"aaaaaaaaaaaa"}]},"skills":["a\\u0000b"]}'],
  ['operators', '{"email":{"$ne":null},"password":{"$gt":""},"id":{"$or":[1]}}'], ['sql-ish', '{"email":"\' OR 1=1 --","name":"\'); DROP TABLE users; --","q":"\'","reason":"x\'--"}'],
  ['huge numbers', '{"rating":1e999,"bidAmount":9007199254740993,"estimatedDays":-1e308,"budgetMin":0.1e-400}'], ['deep nesting', `${'{"a":'.repeat(500)}1${'}'.repeat(500)}`],
  ['unicode', '{"name":"𝕏𝕐ℤ 🧨 \\ud800","title":"\\u202eevil","comment":"👨‍👩‍👧‍👦"}'], ['broken json', '{"a":'],
]
const QUERIES = ['?q[]=a&q[]=b', '?sort[$ne]=1', '?q=%00', '?userId=%00', '?demoId=%00', '?skills=' + 'a,'.repeat(500), '?minBudget=1e999', '?deadlineBefore=%00', '?limit=-1&offset=abc', '?__proto__[x]=1']
const IDS = ['not-a-uuid', '%00', '..%2F..%2Fetc%2Fpasswd', NONE, 'A'.repeat(3000), "'%3B%20DROP%20TABLE%20users%3B--", '%E0%A4%A']   // last one is malformed percent-encoding

describe('fuzzing every endpoint as every kind of user', () => {
  const personas = () => [['anonymous', request(app)], ['freelancer', aarav], ['company', technova], ['admin', admin]]
  const skip = (r) => r.template === '/api/auth/logout'   // would end the persona's session mid-run (covered in the auth tests)
  const leaks = (res) => /stack|node_modules|SELECT |INSERT |pg_|ECONN|at async|\.js:\d+/i.test(JSON.stringify(res.body))

  function check(res, label) {
    expect(res.status, `${label} -> ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toBeLessThan(500)
    if (res.status >= 400) { expect(typeof res.body.code, label).toBe('string'); expect(typeof res.body.message, label).toBe('string'); expect(leaks(res), `${label} leaked internals`).toBe(false) }
  }

  it('garbage bodies never cause a server error', async () => {
    for (const [who, agent] of personas())
      for (const r of routes.filter((x) => ['post', 'put'].includes(x.method) && !skip(x)))
        for (const [name, raw] of BODIES) check(await agent[r.method](withId(r.template, NONE)).set('Content-Type', 'application/json').send(raw), `${who} ${key(r)} body:${name}`)
  }, 180000)

  it('garbage query strings never cause a server error', async () => {
    for (const [who, agent] of personas())
      for (const r of routes.filter((x) => x.method === 'get'))
        for (const q of QUERIES) check(await agent.get(withId(r.template, NONE) + q), `${who} ${key(r)} query:${q.slice(0, 30)}`)
  }, 180000)

  it('garbage ids never cause a server error', async () => {
    for (const [who, agent] of personas())
      for (const r of routes.filter((x) => x.template.includes(':') && !skip(x)))
        for (const id of IDS) check(await agent[r.method](withId(r.template, id)).send({}), `${who} ${key(r)} id:${id.slice(0, 20)}`)
  }, 180000)

  it('wrong content types and wrong methods are handled cleanly', async () => {
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/xml'])
      check(await aarav.post('/api/projects').set('Content-Type', ct).send('title=x'), `content-type ${ct}`)
    for (const [m, p] of [['put', '/api/auth/login'], ['delete', '/api/projects'], ['patch', '/api/proposals/mine'], ['post', '/api/health'], ['get', '/api/nope'], ['get', '/nope']])
      expect((await request(app)[m](p)).status, `${m} ${p}`).toBeGreaterThanOrEqual(400)
  })
})

describe('input that PostgreSQL cannot store', () => {
  it('a NUL character is refused with a clear 400 wherever it appears', async () => {
    const nul = 'a\u0000b'
    const cases = [
      [() => aarav.put('/api/profiles/me').send({ profile: { headline: nul } }), 'profile headline'],
      [() => aarav.put('/api/profiles/me').send({ profile: { skills: [nul] } }), 'inside an array'],
      [() => aarav.put('/api/profiles/me').send({ profile: { portfolio: [{ title: nul, description: 'long enough description' }] } }), 'nested in an object in an array'],
      [() => aarav.get('/api/projects').query({ q: nul }), 'search query'],
      [() => request(app).post('/api/auth/register').send({ name: nul, email: 'nul@example.com', password: 'Str0ngPassw0rd', role: 'FREELANCER' }), 'registration name (before any hashing)'],
      [() => aarav.put('/api/profiles/me').set('Content-Type', 'application/json').send('{"profile":{"headline":"x"},"na\\u0000me":"y"}'), 'in an object KEY'],
    ]
    for (const [send, label] of cases) { const r = await send(); expect([r.status, r.body.code], label).toEqual([400, 'VALIDATION']) }
    expect((await db.query("SELECT 1 FROM users WHERE email = 'nul@example.com'")).rowCount).toBe(0)
  })
  it('absurdly deep nesting is refused too', async () => {
    const deep = JSON.parse(`${'{"a":'.repeat(40)}1${'}'.repeat(40)}`)
    expect((await aarav.put('/api/profiles/me').send(deep)).status).toBe(400)
  })
})

describe('malformed requests are 4xx, never 500', () => {
  it('bad percent-encoding, unreadable or unsupported encodings, and broken JSON', async () => {
    expect((await aarav.get('/api/profiles/%E0%A4%A')).body).toEqual({ message: 'The request could not be processed.', code: 'BAD_REQUEST' })
    const gz = await aarav.post('/api/projects').set('Content-Type', 'application/json').set('Content-Encoding', 'gzip').send(Buffer.from('this is not gzip data'))
    expect(gz.status).toBe(400)
    const unsupported = await aarav.post('/api/projects').set('Content-Type', 'application/json').set('Content-Encoding', 'compress').send(Buffer.from('{}'))
    expect([unsupported.status, unsupported.body.code]).toEqual([415, 'UNSUPPORTED'])
    expect((await aarav.post('/api/projects').set('Content-Type', 'application/json').send('{"a":')).body.code).toBe('INVALID_JSON')
  })
})

describe('response headers and caching', () => {
  it('API responses are never cacheable and carry the standard security headers', async () => {
    const p1 = await idOf("SELECT id FROM projects WHERE title = 'E-commerce Website'")
    for (const path of ['/api/projects', `/api/projects/${p1}`, '/api/auth/me', '/api/notifications', '/api/skills', '/api/nope']) {
      const r = await aarav.get(path)
      expect(r.headers['cache-control'], path).toBe('no-store')
      expect(r.headers['x-content-type-options'], path).toBe('nosniff')
      expect(r.headers['x-powered-by'], path).toBeUndefined()
    }
    const r = await request(app).post('/api/auth/login').send({ email: 'aarav@skillmatch.dev', password: 'WrongPassw0rd1' })
    expect(r.headers['cache-control']).toBe('no-store')   // errors too
    for (const h of ['strict-transport-security', 'x-frame-options', 'referrer-policy', 'content-security-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy']) expect(r.headers[h], h).toBeDefined()
  })
})

describe('abuse and resource limits', () => {
  it('a global per-IP limit stops floods, but the health check stays reachable for monitors', async () => {
    const limited = createApp({ pool: db, mailer: { send: async () => {} }, limits: { ...defaultLimits, global: { windowMs: 60000, limit: 5 } } })
    const codes = []
    for (let i = 0; i < 7; i++) codes.push((await request(limited).get('/api/skills')).status)
    expect(codes).toEqual([401, 401, 401, 401, 401, 429, 429])
    expect((await request(limited).get('/api/skills')).body.code).toBe('RATE_LIMITED')
    expect((await request(limited).get('/api/health')).status).toBe(200)
  })
  it('database queries have a timeout, and abandoned transactions cannot hold locks forever', async () => {
    expect((await pool.query('SHOW statement_timeout')).rows[0].statement_timeout).toBe('10s')
    expect((await pool.query('SHOW idle_in_transaction_session_timeout')).rows[0].idle_in_transaction_session_timeout).toBe('30s')
  })
  it('list endpoints are capped, newest first, however much data exists', async () => {
    const company = await idOf("SELECT id FROM users WHERE email = 'hr@technova.dev'"), user = await idOf("SELECT id FROM users WHERE email = 'aarav@skillmatch.dev'")
    await db.query(`INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline, created_at)
                    SELECT $1, 'Cap Test ' || g, 'A generated project used to test list limits safely.', 1000, 2000, now() + interval '30 days', now() + g * interval '1 second' FROM generate_series(1, 230) g`, [company])
    await db.query("INSERT INTO notifications (user_id, type, message, link, created_at) SELECT $1, 'PROPOSAL', 'Cap ' || g, '/x', now() + g * interval '1 second' FROM generate_series(1, 230) g", [user])
    const projects = (await aarav.get('/api/projects')).body, notes = (await aarav.get('/api/notifications')).body
    expect(projects).toHaveLength(200); expect(projects[0].title).toBe('Cap Test 230')
    expect(notes).toHaveLength(200); expect(notes[0].message).toBe('Cap 230')
    expect((await admin.get('/api/admin/projects')).body.length).toBeLessThanOrEqual(500)
    await db.query("DELETE FROM projects WHERE title LIKE 'Cap Test %'"); await db.query("DELETE FROM notifications WHERE message LIKE 'Cap %'")
  })
})
