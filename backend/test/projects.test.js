import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, loginAs } from './helpers.js'

const T = { ecommerce: 'E-commerce Website', inventory: 'Inventory Management Dashboard', ui: 'Mobile App UI Redesign', forecast: 'Sales Forecasting Model', billing: 'Billing Microservice', portfolio: 'Company Portfolio Website', route: 'Warehouse Route Optimizer', chatbot: 'Customer Support Chatbot Backend' }
let P, aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
const titles = (res) => res.body.map((p) => p.title)
const future = (days) => new Date(Date.now() + days * 864e5).toISOString()
const valid = (over = {}) => ({ title: 'Supplier Portal', description: 'A portal where suppliers upload invoices and track payment status.', budgetMin: 30000, budgetMax: 45000, deadline: future(30), skills: ['React', 'Node.js'], ...over })
// The frontend's own formula, used to prove the SQL agrees with it
const jsMatch = (required, owned) => { const have = new Set(owned.map((s) => s.toLowerCase())); return required.length ? Math.round((100 * required.filter((s) => have.has(s.toLowerCase())).length) / required.length) : 0 }

beforeAll(async () => {
  await withTransaction(seed, db)
  P = Object.fromEntries((await db.query('SELECT id, title FROM projects')).rows.map((r) => [r.title, r.id]))
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('GET /api/projects (listing)', () => {
  it('requires login', async () => expect((await request(app).get('/api/projects')).status).toBe(401))

  it('lists only OPEN projects, with everything a card needs', async () => {
    const res = await aarav.get('/api/projects')
    expect(res.status).toBe(200)
    expect(titles(res)).toEqual([T.route, T.ecommerce, T.ui, T.inventory, T.forecast])   // default: newest first; no in-progress / completed / cancelled
    const p = res.body.find((x) => x.title === T.ecommerce)
    expect(p).toMatchObject({ id: P[T.ecommerce], status: 'OPEN', budgetMin: 25000, budgetMax: 40000, skills: ['Node.js', 'PostgreSQL', 'React'], proposalCount: 3 })
    expect(p.company).toMatchObject({ name: 'TechNova Solutions', location: 'Pune, Maharashtra', industry: 'Software', rating: null, reviewCount: 0 })
    expect(new Date(p.deadline) > new Date()).toBe(true)
  })

  it('freelancers get skillMatch, hasApplied and proposalId; companies do not', async () => {
    const mine = (await aarav.get('/api/projects')).body
    const pr1 = (await db.query("SELECT pr.id FROM proposals pr JOIN projects p ON p.id = pr.project_id JOIN users u ON u.id = pr.freelancer_id WHERE p.title = $1 AND u.email = 'aarav@skillmatch.dev'", [T.ecommerce])).rows[0].id
    expect(mine.find((p) => p.title === T.ecommerce)).toMatchObject({ skillMatch: 100, hasApplied: true, proposalId: pr1 })
    expect(mine.find((p) => p.title === T.ui)).toMatchObject({ skillMatch: 0, hasApplied: false, proposalId: null })
    const theirs = (await technova.get('/api/projects')).body[0]
    expect(theirs).not.toHaveProperty('skillMatch'); expect(theirs).not.toHaveProperty('hasApplied')
  })

  it('sort=match ranks by skill match, newest first on ties', async () => {
    expect(titles(await aarav.get('/api/projects?sort=match'))).toEqual([T.ecommerce, T.inventory, T.route, T.ui, T.forecast])
    const rohanList = (await rohan.get('/api/projects?sort=match')).body
    expect(rohanList.map((p) => [p.title, p.skillMatch])).toEqual([[T.forecast, 100], [T.route, 50], [T.ecommerce, 33], [T.inventory, 25], [T.ui, 0]])
    expect(titles(await priya.get('/api/projects?sort=match'))).toEqual([T.ui, T.inventory, T.ecommerce, T.route, T.forecast])
  })

  it("SQL skill-match equals the frontend's formula for every freelancer and project", async () => {
    for (const f of [aarav, rohan, priya, kunal]) {
      const owned = (await f.get('/api/auth/me')).body.user.profile.skills
      for (const p of (await f.get('/api/projects')).body) expect(p.skillMatch, `${f.user.name} / ${p.title}`).toBe(jsMatch(p.skills, owned))
    }
  })

  it('sort=match is meaningless for companies, so they get newest first', async () => {
    expect(titles(await technova.get('/api/projects?sort=match'))).toEqual([T.route, T.ecommerce, T.ui, T.inventory, T.forecast])
  })

  it('sorts by budget and by deadline', async () => {
    expect(titles(await aarav.get('/api/projects?sort=budget'))).toEqual([T.route, T.forecast, T.inventory, T.ecommerce, T.ui])
    expect(titles(await aarav.get('/api/projects?sort=deadline'))).toEqual([T.ui, T.ecommerce, T.forecast, T.inventory, T.route])
  })

  it('searches title and description, ignoring case, treating % and _ literally', async () => {
    expect(titles(await aarav.get('/api/projects?q=inventory'))).toEqual([T.inventory])
    expect(titles(await aarav.get('/api/projects?q=INVENTORY'))).toEqual([T.inventory])
    expect(titles(await aarav.get('/api/projects?q=e-commerce'))).toEqual([T.ecommerce])
    expect(titles(await aarav.get('/api/projects?q=low-stock'))).toEqual([T.inventory])       // found via the description
    expect((await aarav.get('/api/projects').query({ q: '%' })).body).toEqual([])               // not "match everything"
    expect((await aarav.get('/api/projects').query({ q: '_' })).body).toEqual([])
    expect((await aarav.get('/api/projects').query({ q: 'nothing like this' })).body).toEqual([])
  })

  it('filters by skill (any of), budget overlap and deadline', async () => {
    expect(titles(await aarav.get('/api/projects?skills=Figma'))).toEqual([T.ui])
    expect(titles(await aarav.get('/api/projects?skills=figma,PYTHON')).sort()).toEqual([T.forecast, T.route, T.ui].sort())
    expect(titles(await aarav.get('/api/projects?minBudget=50000')).sort()).toEqual([T.forecast, T.route].sort())
    expect(titles(await aarav.get('/api/projects?maxBudget=20000'))).toEqual([T.ui])
    expect(titles(await aarav.get(`/api/projects?deadlineBefore=${encodeURIComponent(future(25))}`))).toEqual([T.ui])
    expect(titles(await aarav.get('/api/projects?skills=React&maxBudget=26000&q=website'))).toEqual([T.ecommerce])   // filters combine
  })

  it('rejects bad parameters instead of guessing', async () => {
    for (const q of ['sort=random', 'sort=match;DROP', 'minBudget=abc', 'minBudget=-5', 'deadlineBefore=tomorrow']) expect((await aarav.get(`/api/projects?${q}`)).status, q).toBe(400)
  })

  it('is not injectable', async () => {
    const before = Number((await db.query('SELECT count(*) FROM projects')).rows[0].count)
    for (const q of ["'; DROP TABLE projects; --", "' OR '1'='1", '"; DELETE FROM users; --'])
      expect((await aarav.get('/api/projects').query({ q, skills: q })).status).toBe(200)
    expect(Number((await db.query('SELECT count(*) FROM projects')).rows[0].count)).toBe(before)
  })
})

describe('GET /api/projects/:id and /api/company/projects', () => {
  it('open projects are visible to everyone signed in', async () => {
    for (const a of [aarav, technova, admin]) expect((await a.get(`/api/projects/${P[T.ecommerce]}`)).status).toBe(200)
    expect((await request(app).get(`/api/projects/${P[T.ecommerce]}`)).status).toBe(401)
  })
  it('in-progress, completed and cancelled projects are visible only to the owner, admins, and freelancers who applied', async () => {
    const cases = [
      [T.billing, [[kunal, 200], [innovate, 200], [admin, 200], [aarav, 404], [technova, 404]]],
      [T.portfolio, [[aarav, 200], [pixelcraft, 200], [rohan, 404], [innovate, 404]]],
      [T.chatbot, [[innovate, 200], [admin, 200], [rohan, 404], [priya, 404]]],
    ]
    for (const [title, checks] of cases) for (const [who, status] of checks) expect((await who.get(`/api/projects/${P[title]}`)).status, `${who.user.name} -> ${title}`).toBe(status)
  })
  it('unknown and malformed ids are 404', async () => {
    expect((await aarav.get('/api/projects/00000000-0000-0000-0000-000000000000')).status).toBe(404)
    expect((await aarav.get('/api/projects/not-a-uuid')).status).toBe(404)
    expect((await aarav.get("/api/projects/1'%20OR%20'1'='1")).status).toBe(404)
  })
  it('a company lists its own projects in every status, and nobody else can', async () => {
    const mine = await technova.get('/api/company/projects')
    expect(titles(mine)).toEqual([T.route, T.ecommerce, T.inventory])
    expect(mine.body.find((p) => p.title === T.ecommerce).proposalCount).toBe(3)
    expect(innovate && (await innovate.get('/api/company/projects')).body.map((p) => [p.title, p.status])).toEqual([[T.forecast, 'OPEN'], [T.billing, 'IN_PROGRESS'], [T.chatbot, 'CANCELLED']])
    expect((await aarav.get('/api/company/projects')).status).toBe(403)
    expect((await request(app).get('/api/company/projects')).status).toBe(401)
  })
})

describe('POST /api/projects', () => {
  it('a company creates a project owned by itself', async () => {
    const res = await technova.post('/api/projects').send(valid({ skills: ['react', 'Node.js', 'REACT'] }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ title: 'Supplier Portal', status: 'OPEN', skills: ['Node.js', 'React'], proposalCount: 0, budgetMin: 30000, budgetMax: 45000 })
    expect(res.body.company.name).toBe('TechNova Solutions')
    expect((await db.query('SELECT company_id FROM projects WHERE id = $1', [res.body.id])).rows[0].company_id).toBe(technova.user.id)
    expect((await db.query('SELECT count(*)::int AS n FROM project_skills WHERE project_id = $1', [res.body.id])).rows[0].n).toBe(2)   // duplicates collapsed
    expect(titles(await aarav.get('/api/projects?q=supplier'))).toEqual(['Supplier Portal'])
  })
  it('only companies can post', async () => {
    expect((await aarav.post('/api/projects').send(valid())).status).toBe(403)
    expect((await admin.post('/api/projects').send(valid())).status).toBe(403)
    expect((await request(app).post('/api/projects').send(valid())).status).toBe(401)
  })
  it('validates every field', async () => {
    const bad = [
      [{ title: 'Hi' }, 'title'], [{ description: 'too short' }, 'description'], [{ budgetMin: 0 }, 'budgetMin'], [{ budgetMin: 1.5 }, 'budgetMin'],
      [{ budgetMin: 50000, budgetMax: 40000 }, 'budgetMax'], [{ budgetMax: 1e10 }, 'budgetMax'], [{ deadline: new Date(Date.now() - 864e5).toISOString() }, 'deadline'],
      [{ deadline: 'next week' }, 'deadline'], [{ skills: [] }, 'skills'], [{ skills: Array.from({ length: 16 }, (_, i) => `S${i}`) }, 'skills'], [{ skills: ['Underwater Basket Weaving'] }, 'skills'],
    ]
    for (const [over, field] of bad) { const r = await technova.post('/api/projects').send(valid(over)); expect(r.status, JSON.stringify(over)).toBe(400); expect(r.body.fields[field], JSON.stringify(over)).toBeDefined() }
  })
  it('refuses a retired skill and any smuggled fields (status, companyId, id)', async () => {
    await db.query("UPDATE skills SET active = false WHERE name = 'SEO'")
    expect((await technova.post('/api/projects').send(valid({ skills: ['SEO'] }))).status).toBe(400)
    await db.query("UPDATE skills SET active = true WHERE name = 'SEO'")
    for (const extra of [{ status: 'COMPLETED' }, { companyId: pixelcraft.user.id }, { id: '00000000-0000-0000-0000-000000000000' }, { proposalCount: 99 }]) expect((await technova.post('/api/projects').send(valid(extra))).status, JSON.stringify(extra)).toBe(400)
  })
})

describe('PUT /api/projects/:id', () => {
  it('the owner edits an open project (partial updates), including skills when no proposals exist', async () => {
    const created = (await technova.post('/api/projects').send(valid({ title: 'Editable Project' }))).body
    const res = await technova.put(`/api/projects/${created.id}`).send({ title: 'Editable Project v2', budgetMax: 60000, skills: ['Python'] })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'Editable Project v2', budgetMin: 30000, budgetMax: 60000, skills: ['Python'], description: created.description })
    expect((await technova.put(`/api/projects/${created.id}`).send({ deadline: future(90) })).status).toBe(200)
  })
  it('validates the merged result, not just the fields sent', async () => {
    const r = await technova.put(`/api/projects/${P[T.ecommerce]}`).send({ budgetMax: 1000 })    // existing min is 25000
    expect(r.status).toBe(400); expect(r.body.fields.budgetMax).toBeDefined()
    expect((await technova.put(`/api/projects/${P[T.ecommerce]}`).send({})).status).toBe(400)
    expect((await technova.put(`/api/projects/${P[T.ecommerce]}`).send({ deadline: new Date(Date.now() - 1000).toISOString() })).status).toBe(400)
    for (const extra of [{ status: 'COMPLETED' }, { companyId: pixelcraft.user.id }]) expect((await technova.put(`/api/projects/${P[T.ecommerce]}`).send(extra)).status).toBe(400)
  })
  it('required skills lock once proposals exist, but unchanged skills (any case or order) and other edits are fine', async () => {
    const locked = await technova.put(`/api/projects/${P[T.inventory]}`).send({ skills: ['React', 'Express'] })
    expect(locked.status).toBe(409); expect(locked.body.code).toBe('SKILLS_LOCKED')
    expect((await technova.put(`/api/projects/${P[T.inventory]}`).send({ skills: ['tailwind css', 'POSTGRESQL', 'express', 'React'] })).status).toBe(200)
    const renamed = await technova.put(`/api/projects/${P[T.inventory]}`).send({ title: 'Inventory Control Dashboard' })
    expect(renamed.body.title).toBe('Inventory Control Dashboard')
  })
  it('only the owning company, only while OPEN', async () => {
    expect((await pixelcraft.put(`/api/projects/${P[T.ecommerce]}`).send({ title: 'Stolen project title' })).status).toBe(403)
    expect((await aarav.put(`/api/projects/${P[T.ecommerce]}`).send({ title: 'Freelancer edit attempt' })).status).toBe(403)
    expect((await request(app).put(`/api/projects/${P[T.ecommerce]}`).send({ title: 'Anonymous edit attempt' })).status).toBe(401)
    const inProgress = await innovate.put(`/api/projects/${P[T.billing]}`).send({ title: 'Billing Microservice v2' })
    expect(inProgress.status).toBe(409); expect(inProgress.body.code).toBe('INVALID_STATE')
    expect((await technova.put('/api/projects/00000000-0000-0000-0000-000000000000').send({ title: 'Does not exist' })).status).toBe(404)
    expect((await db.query('SELECT title FROM projects WHERE id = $1', [P[T.ecommerce]])).rows[0].title).toBe(T.ecommerce)   // nothing changed
  })
})

describe('POST /api/projects/:id/close', () => {
  it('cancels the project, rejects waiting proposals and notifies exactly those freelancers', async () => {
    const notifs = async (email) => Number((await db.query("SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = 'REJECTED'", [email])).rows[0].count)
    const [a0, p0, k0] = [await notifs('aarav@skillmatch.dev'), await notifs('priya@skillmatch.dev'), await notifs('kunal@skillmatch.dev')]
    const res = await technova.post(`/api/projects/${P[T.ecommerce]}/close`)
    expect(res.status).toBe(200); expect(res.body.status).toBe('CANCELLED')
    const states = (await db.query('SELECT u.email, pr.status FROM proposals pr JOIN users u ON u.id = pr.freelancer_id WHERE pr.project_id = $1 ORDER BY u.email', [P[T.ecommerce]])).rows
    expect(states).toEqual([{ email: 'aarav@skillmatch.dev', status: 'REJECTED' }, { email: 'kunal@skillmatch.dev', status: 'REJECTED' }, { email: 'priya@skillmatch.dev', status: 'REJECTED' }])
    expect([await notifs('aarav@skillmatch.dev') - a0, await notifs('priya@skillmatch.dev') - p0, await notifs('kunal@skillmatch.dev') - k0]).toEqual([1, 1, 0])   // Kunal was already rejected
    const n = (await db.query("SELECT message, link FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'aarav@skillmatch.dev' ORDER BY n.created_at DESC LIMIT 1")).rows[0]
    expect(n.message).toBe('"E-commerce Website" was closed by the company.'); expect(n.link).toMatch(/^\/freelancer\/proposals\/[0-9a-f-]{36}$/)
  })
  it('a closed project leaves the listing, stays visible to those who applied, and cannot be closed again', async () => {
    expect(titles(await aarav.get('/api/projects'))).not.toContain(T.ecommerce)
    expect((await aarav.get(`/api/projects/${P[T.ecommerce]}`)).body.status).toBe('CANCELLED')
    expect((await rohan.get(`/api/projects/${P[T.ecommerce]}`)).status).toBe(404)
    const again = await technova.post(`/api/projects/${P[T.ecommerce]}/close`)
    expect(again.status).toBe(409); expect(again.body.code).toBe('INVALID_STATE')
  })
  it('only the owner can close, and only open projects', async () => {
    expect((await pixelcraft.post(`/api/projects/${P[T.route]}/close`)).status).toBe(403)
    expect((await aarav.post(`/api/projects/${P[T.route]}/close`)).status).toBe(403)
    expect((await innovate.post(`/api/projects/${P[T.billing]}/close`)).status).toBe(409)
    expect((await db.query('SELECT status FROM projects WHERE id = $1', [P[T.route]])).rows[0].status).toBe('OPEN')
  })
  it('two simultaneous closes: exactly one wins', async () => {
    const id = (await technova.post('/api/projects').send(valid({ title: 'Race Condition Project' }))).body.id
    const rs = await Promise.all([technova.post(`/api/projects/${id}/close`), technova.post(`/api/projects/${id}/close`)])
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409])
  })
})
