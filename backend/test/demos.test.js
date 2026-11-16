import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { defaultLimits } from '../src/middleware/rateLimit.js'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, DEMO_PASSWORD, idOf, loginAs, mailSent } from './helpers.js'

let aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
const future = (d) => new Date(Date.now() + d * 864e5).toISOString()
const bid = { coverLetter: 'I have built similar systems before and can deliver this on time with clear updates.', bidAmount: 1500, estimatedDays: 10 }
const desc = 'A working prototype with sample data for the company to try.'
let n = 0

const seededDemo = (email, title) => idOf('SELECT d.id FROM demos d JOIN proposals pr ON pr.id = d.proposal_id JOIN users u ON u.id = pr.freelancer_id JOIN projects p ON p.id = pr.project_id WHERE u.email = $1 AND p.title = $2', [email, title])
const proposalOf = (email, title) => idOf('SELECT pr.id FROM proposals pr JOIN users u ON u.id = pr.freelancer_id JOIN projects p ON p.id = pr.project_id WHERE u.email = $1 AND p.title = $2', [email, title])
const logCount = async (demoId, outcome) => Number((await db.query('SELECT count(*) FROM demo_access_log WHERE demo_id = $1 AND outcome = $2', [demoId, outcome])).rows[0].count)
const viewedAt = async (demoId) => (await db.query('SELECT viewed_at FROM demos WHERE id = $1', [demoId])).rows[0].viewed_at
const access = (who, demoId) => who.post(`/api/demos/${demoId}/access`)
const notifCount = async (email, type) => Number((await db.query('SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = $2', [email, type])).rows[0].count)

// A project owned by TechNova with a SHORTLISTED proposal from `freelancer`, ready for a demo
async function freshProposal(freelancer = aarav) {
  const project = await technova.post('/api/projects').send({ title: `Demo Test Project ${++n}`, description: 'A throwaway project used to test the demo flow safely.', budgetMin: 1000, budgetMax: 2000, deadline: future(30), skills: ['React'] })
  const prId = (await freelancer.post(`/api/projects/${project.body.id}/proposals`).send(bid)).body.id
  await technova.post(`/api/proposals/${prId}/shortlist`)
  return { projectId: project.body.id, prId }
}
async function freshDemo(freelancer = aarav) {
  const { prId, projectId } = await freshProposal(freelancer)
  const url = `https://demo.example.com/secret-${++n}-${Math.random().toString(36).slice(2)}`
  const res = await freelancer.post(`/api/proposals/${prId}/demo`).send({ url, description: desc })
  return { prId, projectId, url, demoId: res.body.id }
}

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('submitting a demo', () => {
  it('stores it with a 24-hour window that starts now, logs it, notifies the company, and never echoes the URL', async () => {
    const { prId } = await freshProposal()
    const url = 'https://demo.example.com/my-private-demo'
    const res = await aarav.post(`/api/proposals/${prId}/demo`).send({ url, description: desc })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'AVAILABLE', viewedAt: null, description: desc })
    expect(JSON.stringify(res.body)).not.toContain('my-private-demo'); expect(res.body).not.toHaveProperty('url')
    expect(res.headers['cache-control']).toBe('no-store')
    const row = (await db.query("SELECT expires_at - submitted_at = interval '24 hours' AS exact, submitted_at > now() - interval '1 minute' AS fresh FROM demos WHERE id = $1", [res.body.id])).rows[0]
    expect(row).toEqual({ exact: true, fresh: true })
    expect(await logCount(res.body.id, 'SUBMITTED')).toBe(1)
    const note = (await db.query("SELECT message, link FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'hr@technova.dev' AND n.type = 'DEMO' ORDER BY n.created_at DESC LIMIT 1")).rows[0]
    expect(note.message).toMatch(/^Aarav Sharma submitted a demo for "Demo Test Project \d+"\.$/); expect(note.link).toBe(`/company/proposals/${prId}/demo`)
  })
  it('one demo per proposal, even when submitted twice at once', async () => {
    const { prId } = await freshProposal(priya)
    const rs = await Promise.all([1, 2, 3].map(() => priya.post(`/api/proposals/${prId}/demo`).send({ url: 'https://demo.example.com/a', description: desc })))
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409])
    expect(rs.find((r) => r.status === 409).body.code).toBe('DUPLICATE_DEMO')
    expect((await aarav.post(`/api/proposals/${await proposalOf('aarav@skillmatch.dev', 'E-commerce Website')}/demo`).send({ url: 'https://demo.example.com/b', description: desc })).body.code).toBe('DUPLICATE_DEMO')
  })
  it('only for your own SHORTLISTED proposal', async () => {
    const body = { url: 'https://demo.example.com/x', description: desc }
    const pending = await proposalOf('priya@skillmatch.dev', 'E-commerce Website'), rejected = await proposalOf('kunal@skillmatch.dev', 'E-commerce Website')
    expect((await priya.post(`/api/proposals/${pending}/demo`).send(body)).body.code).toBe('INVALID_STATE')
    expect((await kunal.post(`/api/proposals/${rejected}/demo`).send(body)).body.code).toBe('INVALID_STATE')
    const { prId } = await freshProposal()
    expect((await priya.post(`/api/proposals/${prId}/demo`).send(body)).status).toBe(403)        // someone else's proposal
    expect((await technova.post(`/api/proposals/${prId}/demo`).send(body)).status).toBe(403)     // a company
    expect((await request(app).post(`/api/proposals/${prId}/demo`).send(body)).status).toBe(401)
    expect((await aarav.post('/api/proposals/00000000-0000-0000-0000-000000000000/demo').send(body)).status).toBe(404)
    expect((await aarav.post('/api/proposals/nope/demo').send(body)).status).toBe(404)
  })
  it('rejects dangerous or malformed links and fields the client must never set', async () => {
    const { prId } = await freshProposal()
    const before = Number((await db.query('SELECT count(*) FROM demos')).rows[0].count)
    const urls = ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'ftp://files.example.com/x', 'https://user:pass@evil.example.com/login', 'not a url', '', 'https://localhost/x', 'https://' + 'a'.repeat(600) + '.com']
    for (const url of urls) expect((await aarav.post(`/api/proposals/${prId}/demo`).send({ url, description: desc })).status, url.slice(0, 40)).toBe(400)
    for (const extra of [{ description: 'short' }, { expiresAt: future(365) }, { viewedAt: null }, { proposalId: prId }, { id: '00000000-0000-0000-0000-000000000000' }])
      expect((await aarav.post(`/api/proposals/${prId}/demo`).send({ url: 'https://demo.example.com/ok', description: desc, ...extra })).status, JSON.stringify(extra)).toBe(400)
    expect(Number((await db.query('SELECT count(*) FROM demos')).rows[0].count)).toBe(before)
  })
})

describe('checking demo status (never reveals the link, never consumes anything)', () => {
  it('the freelancer sees status and their description; the company sees status only', async () => {
    const pr1 = await proposalOf('aarav@skillmatch.dev', 'E-commerce Website')
    const mine = await aarav.get(`/api/proposals/${pr1}/demo`)
    expect(mine.body).toMatchObject({ status: 'AVAILABLE', description: expect.stringContaining('Working cart'), viewedAt: null })
    const theirs = await technova.get(`/api/proposals/${pr1}/demo`)
    expect(theirs.status).toBe(200); expect(theirs.body.status).toBe('AVAILABLE'); expect(theirs.body).not.toHaveProperty('description')
    for (const r of [mine, theirs]) { expect(JSON.stringify(r.body)).not.toContain('kirana-hardware'); expect(r.headers['cache-control']).toBe('no-store') }
    expect(await viewedAt(await seededDemo('aarav@skillmatch.dev', 'E-commerce Website'))).toBeNull()   // checking does not consume
  })
  it('reports VIEWED and EXPIRED for the seeded demos', async () => {
    expect((await innovate.get(`/api/proposals/${await proposalOf('rohan@skillmatch.dev', 'Sales Forecasting Model')}/demo`)).body.status).toBe('VIEWED')
    expect((await pixelcraft.get(`/api/proposals/${await proposalOf('priya@skillmatch.dev', 'Mobile App UI Redesign')}/demo`)).body.status).toBe('EXPIRED')
  })
  it('strangers get one identical refusal, whether or not a demo exists', async () => {
    const withDemo = await proposalOf('aarav@skillmatch.dev', 'E-commerce Website'), without = await proposalOf('aarav@skillmatch.dev', 'Inventory Management Dashboard')
    const responses = []
    for (const who of [pixelcraft, priya, admin, innovate]) for (const id of [withDemo, without]) responses.push(await who.get(`/api/proposals/${id}/demo`))
    expect(responses.every((r) => r.status === 403 && r.body.code === 'ACCESS_DENIED')).toBe(true)
    expect(new Set(responses.map((r) => JSON.stringify(r.body))).size).toBe(1)
    expect((await request(app).get(`/api/proposals/${withDemo}/demo`)).status).toBe(401)
  })
  it('a participant asking about a proposal with no demo gets NO_DEMO', async () => {
    const without = await proposalOf('aarav@skillmatch.dev', 'Inventory Management Dashboard')
    for (const who of [aarav, technova]) { const r = await who.get(`/api/proposals/${without}/demo`); expect(r.status).toBe(404); expect(r.body.code).toBe('NO_DEMO') }
  })
})

describe('opening a demo: refusals', () => {
  it('only the owning company: everyone else gets the SAME 403, nothing is consumed, real attempts are logged', async () => {
    const d1 = await seededDemo('aarav@skillmatch.dev', 'E-commerce Website')
    const logRowsBefore = Number((await db.query('SELECT count(*) FROM demo_access_log')).rows[0].count)
    const attempts = [await access(pixelcraft, d1), await access(aarav, d1), await access(priya, d1), await access(admin, d1), await access(innovate, d1)]
    expect(attempts.every((r) => r.status === 403 && r.body.code === 'ACCESS_DENIED' && r.body.message === 'Access denied.')).toBe(true)
    expect(JSON.stringify(attempts.map((r) => r.body))).not.toContain('kirana-hardware')
    expect(await viewedAt(d1)).toBeNull()
    expect(await logCount(d1, 'DENIED')).toBe(5)
    const unknown = await access(technova, '00000000-0000-0000-0000-000000000000')   // a company asking about a demo that doesn't exist
    expect(unknown.status).toBe(403); expect(unknown.body).toEqual(attempts[0].body)   // indistinguishable from "not yours"
    expect(Number((await db.query('SELECT count(*) FROM demo_access_log')).rows[0].count)).toBe(logRowsBefore + 5)   // and nothing logged for a demo that isn't there
    expect((await request(app).post(`/api/demos/${d1}/access`)).status).toBe(401)
    expect((await technova.post('/api/demos/not-a-uuid/access')).status).toBe(404)
  })
  it('an expired demo is refused (410) without consuming anything, and a viewed one likewise', async () => {
    const d3 = await seededDemo('priya@skillmatch.dev', 'Mobile App UI Redesign'), d2 = await seededDemo('rohan@skillmatch.dev', 'Sales Forecasting Model')
    const expired = await access(pixelcraft, d3)
    expect(expired.status).toBe(410); expect(expired.body).toEqual({ message: 'The 24-hour access window has expired.', code: 'DEMO_EXPIRED' })
    const viewed = await access(innovate, d2)
    expect(viewed.status).toBe(410); expect(viewed.body).toEqual({ message: 'This demo has already been viewed.', code: 'DEMO_VIEWED' })
    expect(await viewedAt(d3)).toBeNull(); expect(await logCount(d3, 'EXPIRED')).toBe(1); expect(await logCount(d2, 'VIEWED')).toBe(1)
  })
  it('the 24-hour boundary is exact: open just before expiry, refused just after', async () => {
    const a = await freshDemo(), b = await freshDemo()
    await db.query("UPDATE demos SET expires_at = now() + interval '3 seconds' WHERE id = $1", [a.demoId])
    expect((await access(technova, a.demoId)).status).toBe(200)
    await db.query("UPDATE demos SET expires_at = now() + interval '1 second' WHERE id = $1", [b.demoId])
    await new Promise((r) => setTimeout(r, 1300))
    expect((await access(technova, b.demoId)).body.code).toBe('DEMO_EXPIRED')
    expect(await viewedAt(b.demoId)).toBeNull()
  })
  it('a demo is unavailable once its proposal is withdrawn or rejected (without being consumed), but fine after the company hires', async () => {
    const withdrawn = await freshDemo(), rejected = await freshDemo(), hired = await freshDemo()
    await aarav.post(`/api/proposals/${withdrawn.prId}/withdraw`)
    await technova.post(`/api/proposals/${rejected.prId}/reject`)
    for (const d of [withdrawn, rejected]) { const r = await access(technova, d.demoId); expect(r.status).toBe(410); expect(r.body.code).toBe('DEMO_UNAVAILABLE'); expect(await viewedAt(d.demoId)).toBeNull() }
    await technova.post(`/api/proposals/${hired.prId}/accept`)
    expect((await access(technova, hired.demoId)).status).toBe(200)
  })
  it('a suspended company cannot open anything', async () => {
    const d = await freshDemo()
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [technova.user.id])
    const r = await access(technova, d.demoId)
    expect(r.status).toBe(403); expect(r.body.code).toBe('SUSPENDED')
    await db.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [technova.user.id])
    expect(await viewedAt(d.demoId)).toBeNull()
    await technova.get('/api/auth/me')   // session was destroyed on suspension: log back in for later tests
    technova = await loginAs('hr@technova.dev')
  })
})

describe('opening a demo: the one successful view', () => {
  it('reveals the link exactly once, logs it with the caller IP, and tells the freelancer', async () => {
    const d1 = await seededDemo('aarav@skillmatch.dev', 'E-commerce Website'), pr1 = await proposalOf('aarav@skillmatch.dev', 'E-commerce Website')
    const before = await notifCount('aarav@skillmatch.dev', 'DEMO_VIEWED')
    const first = await access(technova, d1)
    expect(first.status).toBe(200)
    expect(first.body).toEqual({ url: 'https://demo.example.com/kirana-hardware', description: expect.stringContaining('Working cart'), viewedAt: expect.any(String) })
    expect(first.headers['cache-control']).toBe('no-store')
    expect(await viewedAt(d1)).not.toBeNull(); expect(await logCount(d1, 'GRANTED')).toBe(1)
    expect((await db.query("SELECT ip FROM demo_access_log WHERE demo_id = $1 AND outcome = 'GRANTED'", [d1])).rows[0].ip).not.toBeNull()
    expect(await notifCount('aarav@skillmatch.dev', 'DEMO_VIEWED')).toBe(before + 1)
    expect((await db.query("SELECT message, link FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'aarav@skillmatch.dev' AND n.type = 'DEMO_VIEWED' ORDER BY n.created_at DESC LIMIT 1")).rows[0]).toEqual({ message: 'Your demo for "E-commerce Website" was viewed.', link: `/freelancer/proposals/${pr1}` })
    const second = await access(technova, d1)
    expect(second.status).toBe(410); expect(second.body.code).toBe('DEMO_VIEWED'); expect(JSON.stringify(second.body)).not.toContain('kirana-hardware')
    expect((await technova.get(`/api/proposals/${pr1}/demo`)).body.status).toBe('VIEWED')
  })
  it('after the view, the link appears in NO other response anywhere in the API', async () => {
    const pr1 = await proposalOf('aarav@skillmatch.dev', 'E-commerce Website'), p1 = await idOf("SELECT id FROM projects WHERE title = 'E-commerce Website'")
    const sweep = [
      technova.get(`/api/proposals/${pr1}`), technova.get(`/api/projects/${p1}/proposals`), technova.get('/api/company/proposals'), technova.get('/api/company/dashboard'), technova.get('/api/notifications'),
      aarav.get(`/api/proposals/${pr1}`), aarav.get('/api/proposals/mine'), aarav.get('/api/notifications'), aarav.get('/api/freelancer/dashboard'), aarav.get('/api/auth/me'),
      admin.get(`/api/proposals/${pr1}`), technova.get(`/api/projects/${p1}`), technova.get('/api/projects'),
    ]
    for (const r of await Promise.all(sweep)) expect(JSON.stringify(r.body), r.req.path).not.toContain('kirana-hardware')
  })
  it('twenty simultaneous attempts on one demo: exactly one gets in', async () => {
    for (let i = 0; i < 3; i++) {
      const d = await freshDemo()
      const rs = await Promise.all(Array.from({ length: 20 }, () => access(technova, d.demoId)))
      const ok = rs.filter((r) => r.status === 200), refused = rs.filter((r) => r.status === 410)
      expect(ok, `iteration ${i}`).toHaveLength(1); expect(refused).toHaveLength(19)
      expect(ok[0].body.url).toBe(d.url)
      expect(refused.every((r) => r.body.code === 'DEMO_VIEWED')).toBe(true)
      expect(JSON.stringify(refused.map((r) => r.body))).not.toContain(d.url)
      expect(await logCount(d.demoId, 'GRANTED')).toBe(1); expect(await logCount(d.demoId, 'VIEWED')).toBe(19)
      expect(await notifCount('aarav@skillmatch.dev', 'DEMO_VIEWED')).toBeGreaterThanOrEqual(1)
    }
  })
  it('owner and strangers racing: the owner wins once and no stranger ever gets the link', async () => {
    const d = await freshDemo()
    const rs = await Promise.all([...Array.from({ length: 6 }, () => access(technova, d.demoId)), ...Array.from({ length: 6 }, () => access(pixelcraft, d.demoId)), ...Array.from({ length: 4 }, () => access(priya, d.demoId))])
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1)
    expect(rs.filter((r) => r.status === 403)).toHaveLength(10)
    expect(JSON.stringify(rs.filter((r) => r.status !== 200).map((r) => r.body))).not.toContain(d.url)
  })
})

describe('re-issuing a window', () => {
  it('opens exactly one more view after the last was used, and tells the company', async () => {
    const d1 = await seededDemo('aarav@skillmatch.dev', 'E-commerce Website')   // consumed above
    const res = await aarav.post(`/api/demos/${d1}/reissue`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'AVAILABLE', viewedAt: null })
    const hours = (new Date(res.body.expiresAt) - new Date(res.body.submittedAt)) / 36e5
    expect(hours).toBe(24)
    expect(await logCount(d1, 'REISSUED')).toBe(1)
    expect((await db.query("SELECT message FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'hr@technova.dev' AND n.type = 'DEMO' ORDER BY n.created_at DESC LIMIT 1")).rows[0].message).toBe('Aarav Sharma re-issued a demo for "E-commerce Website".')
    expect((await access(technova, d1)).status).toBe(200)
    expect((await access(technova, d1)).body.code).toBe('DEMO_VIEWED')
  })
  it('works for an expired demo too', async () => {
    const d3 = await seededDemo('priya@skillmatch.dev', 'Mobile App UI Redesign')
    expect((await priya.post(`/api/demos/${d3}/reissue`)).body.status).toBe('AVAILABLE')
    expect((await access(pixelcraft, d3)).status).toBe(200)
  })
  it('is refused while a window is still open (so a demo cannot be reset under the company)', async () => {
    const d = await freshDemo()
    const r = await aarav.post(`/api/demos/${d.demoId}/reissue`)
    expect(r.status).toBe(409); expect(r.body.code).toBe('INVALID_STATE')
  })
  it('only the freelancer who owns it, and only while still shortlisted', async () => {
    const d = await freshDemo()
    await access(technova, d.demoId)
    expect((await priya.post(`/api/demos/${d.demoId}/reissue`)).body.code).toBe('ACCESS_DENIED')
    expect((await technova.post(`/api/demos/${d.demoId}/reissue`)).status).toBe(403)
    expect((await aarav.post('/api/demos/00000000-0000-0000-0000-000000000000/reissue')).status).toBe(403)
    expect((await request(app).post(`/api/demos/${d.demoId}/reissue`)).status).toBe(401)
    await aarav.post(`/api/proposals/${d.prId}/withdraw`)
    expect((await aarav.post(`/api/demos/${d.demoId}/reissue`)).body.code).toBe('INVALID_STATE')
  })
  it('ten simultaneous re-issues: exactly one succeeds', async () => {
    const d = await freshDemo(); await access(technova, d.demoId)
    const rs = await Promise.all(Array.from({ length: 10 }, () => aarav.post(`/api/demos/${d.demoId}/reissue`)))
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1); expect(rs.filter((r) => r.status === 409)).toHaveLength(9)
    expect(await logCount(d.demoId, 'REISSUED')).toBe(1)
  })
})

describe('abuse protection and audit trail', () => {
  it('attempts are rate-limited per user, and a limited stranger does not affect the owner', async () => {
    const limited = createApp({ pool: db, mailer: { send: async () => {} }, limits: { ...defaultLimits, login: { windowMs: 60000, ip: 100, account: 100 }, demoAccess: { windowMs: 60000, limit: 3 } } })
    const asUser = async (email) => { const a = request.agent(limited); await a.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }); return a }
    const [stranger, owner] = [await asUser('team@pixelcraft.dev'), await asUser('hr@technova.dev')]
    const d = await freshDemo()
    const codes = []
    for (let i = 0; i < 4; i++) codes.push((await stranger.post(`/api/demos/${d.demoId}/access`)).status)
    expect(codes).toEqual([403, 403, 403, 429])
    expect((await stranger.post(`/api/demos/${d.demoId}/access`)).body.code).toBe('RATE_LIMITED')
    expect((await owner.post(`/api/demos/${d.demoId}/access`)).status).toBe(200)   // the owner is a different user: unaffected
  })
  it('the audit table records who and what, but never the link', async () => {
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'demo_access_log'")).rows.map((r) => r.column_name).sort()
    expect(cols).toEqual(['created_at', 'demo_id', 'id', 'ip', 'outcome', 'user_id'])
    const outcomes = new Set((await db.query('SELECT DISTINCT outcome FROM demo_access_log')).rows.map((r) => r.outcome))
    for (const o of ['SUBMITTED', 'GRANTED', 'DENIED', 'VIEWED', 'EXPIRED', 'REISSUED']) expect(outcomes.has(o), o).toBe(true)
  })
})
