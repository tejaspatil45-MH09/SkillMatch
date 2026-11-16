import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, loginAs, mkUser } from './helpers.js'

// Admin reports & analytics, against the REAL database (the throwaway TEST_DATABASE_URL one, never a development database).
//
// Accuracy is proven two ways:
//   1. A small committed fixture set in the year 2001 (the seed never touches 2001), with every expected number worked out by hand.
//      It includes the awkward cases: records exactly on the range start (counted) and exactly on the exclusive end (not counted),
//      a hiring whose project is outside the range, a hiring dated BEFORE its own project, and a company named like a spreadsheet formula.
//   2. Cross-checks of the all-time report against separately written plain SQL over the seeded data.

let admin, aarav, technova
const EVIL = '=HYPERLINK("http://evil.example","x")'
const WINDOW = { range: 'custom', from: '2001-03-01', to: '2001-05-31' }       // March, April and May 2001
const analytics = (params = {}, who = admin) => who.get('/api/admin/analytics').query(params)
const exportCsv = (params = {}, who = admin) => who.get('/api/admin/analytics/export').query(params)

async function buildWorld(c) {
  const user = async (role, name, createdAt, status = 'ACTIVE') => {
    const id = await mkUser(c, role, name)
    await c.query('UPDATE users SET created_at = $2, status = $3 WHERE id = $1', [id, createdAt, status])
    return id
  }
  const skill = async (name) => (await c.query('SELECT id FROM skills WHERE name = $1', [name])).rows[0].id
  const project = async (company, title, status, createdAt, skills = []) => {
    const id = (await c.query(
      "INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline, status, created_at) VALUES ($1,$2,$3,1000,2000,'2002-01-01T00:00:00Z',$4,$5) RETURNING id",
      [company, title, 'An analytics fixture project with a long enough description.', status, createdAt])).rows[0].id
    for (const s of skills) await c.query('INSERT INTO project_skills (project_id, skill_id) VALUES ($1,$2)', [id, await skill(s)])
    return id
  }
  const proposal = async (projectId, freelancer, status, createdAt) => (await c.query(
    'INSERT INTO proposals (project_id, freelancer_id, cover_letter, bid_amount, estimated_days, status, created_at) VALUES ($1,$2,$3,1500,10,$4,$5) RETURNING id',
    [projectId, freelancer, 'x'.repeat(60), status, createdAt])).rows[0].id
  const hiring = async (proposalId, projectId, freelancer, company, status, start, completed = null, reason = null) => (await c.query(
    'INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id, status, start_date, completed_at, cancel_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [proposalId, projectId, freelancer, company, status, start, completed, reason])).rows[0].id
  const review = (hiringId, reviewer, reviewee, rating, createdAt) => c.query(
    "INSERT INTO reviews (hiring_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES ($1,$2,$3,$4,'Fixture review.',$5)", [hiringId, reviewer, reviewee, rating, createdAt])

  // accounts: registered in the window = Ann, Cy (freelancers) and Alpha, the formula company (companies)
  const CA = await user('COMPANY', 'Alpha Fixture Co', '2001-03-02T00:00:00Z')
  const CB = await user('COMPANY', EVIL, '2001-04-01T00:00:00Z')
  const CC = await user('COMPANY', 'Gamma Fixture Ltd', '2001-06-10T00:00:00Z', 'SUSPENDED')
  const FA = await user('FREELANCER', 'Ann Fixture', '2001-03-02T00:00:00Z')
  const FB = await user('FREELANCER', 'Bob Fixture', '2001-01-15T00:00:00Z')
  const FC = await user('FREELANCER', 'Cy Fixture', '2001-05-20T00:00:00Z', 'SUSPENDED')

  // projects: P1..P6 are inside the window; P7 is just before it; P8 is exactly on the exclusive end
  const P1 = await project(CA, 'Fixture P1 open', 'OPEN', '2001-03-01T00:00:00Z', ['React', 'Node.js'])            // exactly on the inclusive start
  const P2 = await project(CA, 'Fixture P2 progress', 'IN_PROGRESS', '2001-03-20T00:00:00Z', ['React'])
  const P3 = await project(CA, 'Fixture P3 done', 'COMPLETED', '2001-04-10T00:00:00Z', ['React', 'PostgreSQL'])
  const P4 = await project(CB, 'Fixture P4 done', 'COMPLETED', '2001-04-15T00:00:00Z', ['Node.js'])
  const P5 = await project(CB, 'Fixture P5 cancelled', 'CANCELLED', '2001-05-02T00:00:00Z', ['Python'])
  const P6 = await project(CC, 'Fixture P6 open', 'OPEN', '2001-04-28T00:00:00Z')
  const P7 = await project(CA, 'Fixture P7 before', 'COMPLETED', '2001-02-27T00:00:00Z', ['React'])               // outside: before the window
  const P8 = await project(CA, 'Fixture P8 boundary', 'OPEN', '2001-06-01T00:00:00Z')                              // outside: exactly the exclusive end

  // proposals: PR1..PR10 are created inside the window; PR11, PR12, PR13 are not
  await proposal(P1, FA, 'PENDING', '2001-03-02T00:00:00Z')
  await proposal(P1, FB, 'SHORTLISTED', '2001-03-03T00:00:00Z')
  const PR3 = await proposal(P2, FA, 'ACCEPTED', '2001-03-21T00:00:00Z')
  await proposal(P2, FB, 'REJECTED', '2001-03-22T00:00:00Z')
  const PR5 = await proposal(P3, FB, 'ACCEPTED', '2001-04-11T00:00:00Z')
  await proposal(P3, FA, 'REJECTED', '2001-04-12T00:00:00Z')
  const PR7 = await proposal(P4, FA, 'ACCEPTED', '2001-04-16T00:00:00Z')
  await proposal(P4, FC, 'WITHDRAWN', '2001-04-17T00:00:00Z')
  const PR9 = await proposal(P5, FB, 'ACCEPTED', '2001-05-03T00:00:00Z')
  await proposal(P5, FA, 'PENDING', '2001-05-04T00:00:00Z')
  const PR11 = await proposal(P7, FB, 'ACCEPTED', '2001-02-28T00:00:00Z')
  await proposal(P6, FA, 'PENDING', '2001-06-05T00:00:00Z')                                                        // project in the window, proposal after it
  const PR13 = await proposal(P8, FC, 'ACCEPTED', '2001-06-02T00:00:00Z')

  // hirings: all six START inside the window (H5's project and H6's date are the odd ones)
  await hiring(PR3, P2, FA, CA, 'ACTIVE', '2001-03-25T00:00:00Z')                                                  // 5 days after P2
  const H2 = await hiring(PR5, P3, FB, CA, 'COMPLETED', '2001-04-14T00:00:00Z', '2001-05-10T00:00:00Z')              // 4 days
  const H3 = await hiring(PR7, P4, FA, CB, 'COMPLETED', '2001-04-20T00:00:00Z', '2001-05-15T00:00:00Z')              // 5 days
  await hiring(PR9, P5, FB, CB, 'CANCELLED', '2001-05-05T00:00:00Z', null, 'Client changed direction entirely')       // 3 days
  const H5 = await hiring(PR11, P7, FB, CA, 'COMPLETED', '2001-03-10T00:00:00Z', '2001-03-30T00:00:00Z')            // 11 days; its project is outside the window
  await hiring(PR13, P8, FC, CA, 'ACTIVE', '2001-05-25T00:00:00Z')                                                  // starts BEFORE its project was posted

  // reviews: two freelancer ratings in the window (5 and 2), one outside it, and one rating of a company (never a freelancer rating)
  await review(H2, CA, FB, 5, '2001-05-12T00:00:00Z')
  await review(H2, FB, CA, 4, '2001-05-12T00:00:00Z')
  await review(H3, CB, FA, 2, '2001-05-16T00:00:00Z')
  await review(H5, CA, FB, 4, '2001-06-15T00:00:00Z')
}

beforeAll(async () => {
  await withTransaction(seed, db)
  await withTransaction(buildWorld, db)
  ;[admin, aarav, technova] = await Promise.all(['admin@skillmatch.dev', 'aarav@skillmatch.dev', 'hr@technova.dev'].map((e) => loginAs(e)))
})
afterAll(() => withTransaction(seed, db))     // leave the throwaway test database exactly as the seed makes it

// a tiny CSV reader (quotes, doubled quotes, commas and newlines inside cells) so the tests check what a spreadsheet would see
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false; else cell += ch }
    else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\r' && s[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++ }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

describe('who may see the reports', () => {
  it('only a signed-in admin: everyone else is refused and no data is returned', async () => {
    for (const path of ['/api/admin/analytics', '/api/admin/analytics/export']) {
      const anon = await request(app).get(path); expect([anon.status, anon.body.code]).toEqual([401, 'UNAUTHENTICATED'])
      for (const who of [aarav, technova]) { const r = await who.get(path); expect([r.status, r.body.code], `${who.user.name} ${path}`).toEqual([403, 'FORBIDDEN']); expect(JSON.stringify(r.body)).not.toMatch(/projects|hirings/i) }
      expect((await admin.get(path)).status).toBe(200)
    }
  })
  it('responses are never cached, and the export is a CSV download', async () => {
    const json = await analytics(); expect(json.headers['cache-control']).toBe('no-store'); expect(json.headers['content-type']).toMatch(/application\/json/)
    const csv = await exportCsv(WINDOW)
    expect(csv.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/)
    expect(csv.headers['cache-control']).toBe('no-store')
    expect(csv.headers['content-disposition']).toMatch(/^attachment; filename="skillmatch-analytics-custom-\d{8}\.csv"$/)
    expect(csv.text.charCodeAt(0)).toBe(0xFEFF)
  })
  it('reading reports changes nothing: no rows are added, and nothing is written to the audit log', async () => {
    const snapshot = async () => (await db.query("SELECT (SELECT count(*) FROM projects) p, (SELECT count(*) FROM hirings) h, (SELECT count(*) FROM users) u, (SELECT count(*) FROM admin_audit_log) a, (SELECT count(*) FROM notifications) n")).rows[0]
    const before = await snapshot()
    await analytics(WINDOW); await exportCsv(WINDOW); await analytics({ range: '7d' })
    expect(await snapshot()).toEqual(before)
  })
})

describe('filters are validated (a bad filter is a clear 400, never ignored and never a server error)', () => {
  const bad = [
    { range: 'forever' }, { range: 'custom' }, { range: 'custom', from: '2001-03-01' }, { range: 'custom', to: '2001-03-01' },
    { range: 'custom', from: '2001-03-05', to: '2001-03-01' }, { range: 'custom', from: '2001-02-30', to: '2001-03-01' }, { range: 'custom', from: '2001-3-1', to: '2001-03-05' },
    { range: 'custom', from: '1999-12-31', to: '2001-01-01' }, { range: 'custom', from: '2001-01-01', to: '2007-01-01' },
    { range: '30d', from: '2001-03-01' }, { from: '2001-03-01', to: '2001-03-02' },
    { projectStatus: 'DONE' }, { hiringStatus: 'OPEN' }, { projectStatus: '' }, { projectStatus: 'completed' },
    { unknown: '1' }, { range: ['7d', '30d'] }, { range: '30d; DROP TABLE users' }, { projectStatus: "OPEN' OR '1'='1" },
  ]
  it('rejects every malformed combination on both endpoints', async () => {
    for (const q of bad) for (const call of [analytics, exportCsv]) {
      const r = await call(q)
      expect([r.status, r.body.code], `${call === analytics ? 'json' : 'csv'} ${JSON.stringify(q)}`).toEqual([400, 'VALIDATION'])
      expect(r.headers['content-type']).toMatch(/json/)       // an error is never sent as a file
    }
  })
  it('accepts every valid range, a one-day range, and both status filters', async () => {
    for (const q of [{}, { range: '7d' }, { range: '30d' }, { range: '3m' }, { range: '1y' }, { range: 'all' }, { range: 'custom', from: '2001-03-01', to: '2001-03-01' },
      { range: 'custom', from: '2000-01-01', to: '2005-01-01' }, { projectStatus: 'OPEN', hiringStatus: 'ACTIVE' }, { range: '30d', projectStatus: 'COMPLETED', hiringStatus: 'CANCELLED' }])
      expect((await analytics(q)).status, JSON.stringify(q)).toBe(200)
  })
})

describe('the numbers are right (hand-computed fixture, March to May 2001)', () => {
  let r
  beforeAll(async () => { r = (await analytics(WINDOW)).body })

  it('echoes the filters it applied', () => {
    expect(r.filters).toEqual({ range: 'custom', label: '2001-03-01 to 2001-05-31', from: '2001-03-01T00:00:00.000Z', to: '2001-06-01T00:00:00.000Z', projectStatus: null, hiringStatus: null })
    expect(r.unavailable.length).toBeGreaterThan(0)
  })
  it('projects: 6 posted (the one on the start instant counts, the one on the end instant does not), by status and by month', () => {
    expect(r.projects).toEqual({
      total: 6, open: 2, inProgress: 1, active: 3, completed: 2, cancelled: 1,
      byStatus: [{ status: 'OPEN', count: 2 }, { status: 'IN_PROGRESS', count: 1 }, { status: 'COMPLETED', count: 2 }, { status: 'CANCELLED', count: 1 }],
      monthly: [{ month: '2001-03', count: 2 }, { month: '2001-04', count: 3 }, { month: '2001-05', count: 1 }],
    })
  })
  it('hirings: counted by when they started, success rate ignores ongoing ones, time to hire ignores an impossible date', () => {
    expect(r.hirings).toMatchObject({ total: 6, successful: 3, ongoing: 2, cancelled: 1, concluded: 4, successRate: 75 })
    expect(r.hirings.timeToHire).toEqual({ seconds: 483840, sampleSize: 5, excluded: 1 })      // (5 + 4 + 5 + 3 + 11) / 5 = 5.6 days; the hiring that starts before its project is left out and reported
    expect(r.hirings.monthly).toEqual([
      { month: '2001-03', completed: 1, ongoing: 1, cancelled: 0, total: 2 },
      { month: '2001-04', completed: 2, ongoing: 0, cancelled: 0, total: 2 },
      { month: '2001-05', completed: 0, ongoing: 1, cancelled: 1, total: 2 },
    ])
  })
  it('proposals: counted by when they were submitted; the acceptance rate is accepted / submitted', () => {
    expect(r.proposals).toEqual({ total: 10, accepted: 4, rejected: 2, pending: 2, shortlisted: 1, withdrawn: 1, acceptanceRate: 40 })
    expect(r.proposals.accepted + r.proposals.rejected + r.proposals.pending + r.proposals.shortlisted + r.proposals.withdrawn).toBe(r.proposals.total)
  })
  it('freelancers: registrations in the period, ranking, average rating (ratings of companies are not counted)', () => {
    expect(r.freelancers.registeredInRange).toBe(2)
    expect(r.freelancers.topByCompleted.map((x) => [x.name, x.count, x.suspended])).toEqual([['Bob Fixture', 2, false], ['Ann Fixture', 1, false]])
    expect(r.freelancers.averageRating).toEqual({ value: 3.5, reviews: 2, freelancers: 2 })      // (5 + 2) / 2; the 4-star review dated June and the rating of a company are excluded
  })
  it('companies: registrations in the period and both rankings (suspended companies are flagged, not hidden)', () => {
    expect(r.companies.registeredInRange).toBe(2)
    expect(r.companies.topByProjects.map((x) => [x.name, x.count, x.suspended])).toEqual([['Alpha Fixture Co', 3, false], [EVIL, 2, false], ['Gamma Fixture Ltd', 1, true]])
    expect(r.companies.topByHirings.map((x) => [x.name, x.count])).toEqual([['Alpha Fixture Co', 2], [EVIL, 1]])
  })
  it('skills: demand is the number of projects asking for the skill, ties broken by name', () => {
    expect(r.skills.demand.map((x) => [x.name, x.projects])).toEqual([['React', 3], ['Node.js', 2], ['PostgreSQL', 1], ['Python', 1]])
  })
  it('account totals are a current snapshot that adds up, and match a plain count', async () => {
    for (const [key, role] of [['freelancers', 'FREELANCER'], ['companies', 'COMPANY']]) {
      const [row] = (await db.query("SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int AS a, count(*) FILTER (WHERE status = 'SUSPENDED')::int AS s FROM users WHERE role = $1", [role])).rows
      expect([r[key].active, r[key].suspended, r[key].total], key).toEqual([row.a, row.s, row.a + row.s])
      expect(r[key].suspended).toBeGreaterThanOrEqual(1)      // the fixture's suspended account
    }
  })
})

describe('the status filters narrow the right things', () => {
  it('project status COMPLETED: projects, the proposals and hirings on them, and the skills of those projects', async () => {
    const r = (await analytics({ ...WINDOW, projectStatus: 'COMPLETED' })).body
    expect(r.projects).toMatchObject({ total: 2, completed: 2, open: 0, inProgress: 0, cancelled: 0 })
    expect(r.hirings).toMatchObject({ total: 3, successful: 3, ongoing: 0, cancelled: 0, successRate: 100 })
    expect(r.hirings.timeToHire).toEqual({ seconds: 576000, sampleSize: 3, excluded: 0 })      // (4 + 5 + 11) / 3 days
    expect(r.proposals).toEqual({ total: 4, accepted: 2, rejected: 1, pending: 0, shortlisted: 0, withdrawn: 1, acceptanceRate: 50 })
    expect(r.skills.demand.map((x) => [x.name, x.projects])).toEqual([['Node.js', 1], ['PostgreSQL', 1], ['React', 1]])
    expect(r.freelancers.averageRating).toEqual({ value: 3.5, reviews: 2, freelancers: 2 })
  })
  it('hiring status CANCELLED: only cancelled hirings; a rate of 0% is reported as 0, not as "no data"; projects are unaffected', async () => {
    const r = (await analytics({ ...WINDOW, hiringStatus: 'CANCELLED' })).body
    expect(r.hirings).toMatchObject({ total: 1, successful: 0, ongoing: 0, cancelled: 1, concluded: 1, successRate: 0 })
    expect(r.projects.total).toBe(6); expect(r.proposals.total).toBe(10)
    expect(r.freelancers.topByCompleted).toEqual([]); expect(r.companies.topByHirings).toEqual([])
    expect(r.freelancers.averageRating).toEqual({ value: null, reviews: 0, freelancers: 0 })
  })
  it('hiring status ACTIVE: no finished hirings means the success rate is unknown (null), never 0 or NaN', async () => {
    const r = (await analytics({ ...WINDOW, hiringStatus: 'ACTIVE' })).body
    expect(r.hirings).toMatchObject({ total: 2, ongoing: 2, concluded: 0, successRate: null })
    expect(r.hirings.timeToHire).toEqual({ seconds: 432000, sampleSize: 1, excluded: 1 })
  })
  it('both filters together only combine (they never widen the result)', async () => {
    const r = (await analytics({ ...WINDOW, projectStatus: 'COMPLETED', hiringStatus: 'CANCELLED' })).body
    expect(r.hirings).toMatchObject({ total: 0, successRate: null })
    expect(r.projects.total).toBe(2)
  })
})

describe('date ranges', () => {
  it('a range with no activity returns zeros, null rates and every month listed, without errors', async () => {
    const r = (await analytics({ range: 'custom', from: '2000-01-01', to: '2000-02-15' })).body
    expect(r.projects).toMatchObject({ total: 0, active: 0, completed: 0, cancelled: 0, monthly: [{ month: '2000-01', count: 0 }, { month: '2000-02', count: 0 }] })
    expect(r.hirings).toMatchObject({ total: 0, successful: 0, ongoing: 0, cancelled: 0, successRate: null })
    expect(r.hirings.timeToHire).toEqual({ seconds: null, sampleSize: 0, excluded: 0 })
    expect(r.proposals).toMatchObject({ total: 0, acceptanceRate: null })
    expect(r.freelancers).toMatchObject({ registeredInRange: 0, topByCompleted: [], averageRating: { value: null, reviews: 0, freelancers: 0 } })
    expect(r.companies).toMatchObject({ registeredInRange: 0, topByProjects: [], topByHirings: [] })
    expect(r.skills.demand).toEqual([])
    expect(JSON.stringify(r)).not.toMatch(/NaN|undefined/)
    const csv = (await exportCsv({ range: 'custom', from: '2000-01-01', to: '2000-01-31' })).text
    expect(csv).not.toMatch(/NaN|undefined|null/)
  })
  it('both ends of a one-day range are respected (inclusive start, exclusive next midnight)', async () => {
    expect((await analytics({ range: 'custom', from: '2001-03-01', to: '2001-03-01' })).body.projects.total).toBe(1)    // P1 at 00:00:00 on that day
    expect((await analytics({ range: 'custom', from: '2001-06-01', to: '2001-06-01' })).body.projects).toMatchObject({ total: 1, open: 1 })   // P8 at 00:00:00 on 1 June
    expect((await analytics({ range: 'custom', from: '2001-02-27', to: '2001-02-27' })).body.projects).toMatchObject({ total: 1, completed: 1 })
    expect((await analytics({ range: 'custom', from: '2001-02-28', to: '2001-02-28' })).body.projects.total).toBe(0)
  })
  it('splitting a range in two adds back up to the whole (nothing is lost or counted twice at the seam)', async () => {
    const [a, b, whole] = (await Promise.all([{ range: 'custom', from: '2001-03-01', to: '2001-04-14' }, { range: 'custom', from: '2001-04-15', to: '2001-05-31' }, WINDOW].map((q) => analytics(q)))).map((x) => x.body)
    for (const pick of [(x) => x.projects.total, (x) => x.hirings.total, (x) => x.proposals.total, (x) => x.proposals.accepted]) expect(pick(a) + pick(b)).toBe(pick(whole))
  })
  it('the preset ranges are nested: 7 days within 30 days within 3 months within 1 year within all time', async () => {
    const totals = []
    for (const range of ['7d', '30d', '3m', '1y', 'all']) { const b = (await analytics({ range })).body; totals.push([b.projects.total, b.hirings.total, b.proposals.total]) }
    for (let i = 1; i < totals.length; i++) for (let k = 0; k < 3; k++) expect(totals[i][k], `range #${i} metric #${k}`).toBeGreaterThanOrEqual(totals[i - 1][k])
  })
  it('monthly series add up to the total, in order, with no gaps and the same months for projects and hirings', async () => {
    for (const q of [{ range: '3m' }, { range: '1y' }, WINDOW, { ...WINDOW, projectStatus: 'OPEN' }, { ...WINDOW, hiringStatus: 'CANCELLED' }]) {
      const b = (await analytics(q)).body
      expect(b.monthsTruncated, JSON.stringify(q)).toBe(false)
      expect(b.projects.monthly.reduce((s, m) => s + m.count, 0), JSON.stringify(q)).toBe(b.projects.total)
      expect(b.hirings.monthly.reduce((s, m) => s + m.total, 0), JSON.stringify(q)).toBe(b.hirings.total)
      const keys = b.projects.monthly.map((m) => m.month)
      expect(keys, JSON.stringify(q)).toEqual([...keys].sort())
      expect(new Set(keys).size).toBe(keys.length)
      expect(b.hirings.monthly.map((m) => m.month)).toEqual(keys)
      for (let i = 1; i < keys.length; i++) { const [y0, m0] = keys[i - 1].split('-').map(Number), [y1, m1] = keys[i].split('-').map(Number); expect((y1 - y0) * 12 + (m1 - m0), `${keys[i - 1]} -> ${keys[i]}`).toBe(1) }
    }
  })
  it('all time is capped at the most recent 60 months and says so (the 2001 fixture is older than that)', async () => {
    const b = (await analytics({})).body
    expect(b.monthsTruncated).toBe(true)
    expect(b.projects.monthly).toHaveLength(60)
    expect(b.projects.monthly.at(-1).month).toBe(new Date().toISOString().slice(0, 7))      // ends at the current month (UTC)
    expect(b.projects.monthly.reduce((s, m) => s + m.count, 0)).toBeLessThanOrEqual(b.projects.total)
    expect(b.hirings.monthly.map((m) => m.month)).toEqual(b.projects.monthly.map((m) => m.month))
    expect(parseCsv((await exportCsv({})).text).some((x) => x[0] === 'Report' && x[1] === 'Note')).toBe(true)      // the export carries the same warning
  })
})

describe('the all-time report agrees with plain SQL over the data', () => {
  let r
  beforeAll(async () => { r = (await analytics({})).body })
  it('projects, hirings and proposals by status', async () => {
    const count = async (table, status) => (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE status = $1`, [status])).rows[0].n
    for (const s of r.projects.byStatus) expect(s.count, `projects ${s.status}`).toBe(await count('projects', s.status))
    expect([r.hirings.ongoing, r.hirings.successful, r.hirings.cancelled]).toEqual([await count('hirings', 'ACTIVE'), await count('hirings', 'COMPLETED'), await count('hirings', 'CANCELLED')])
    expect(r.proposals).toMatchObject({ accepted: await count('proposals', 'ACCEPTED'), rejected: await count('proposals', 'REJECTED'), pending: await count('proposals', 'PENDING'), shortlisted: await count('proposals', 'SHORTLISTED'), withdrawn: await count('proposals', 'WITHDRAWN') })
    expect(r.projects.total).toBe((await db.query('SELECT count(*)::int AS n FROM projects')).rows[0].n)
    expect(r.proposals.total).toBe((await db.query('SELECT count(*)::int AS n FROM proposals')).rows[0].n)
    expect(r.proposals.acceptanceRate).toBe(Math.round((r.proposals.accepted / r.proposals.total) * 1000) / 10)
  })
  it('the success rate, average time to hire and average rating', async () => {
    const [done] = (await db.query("SELECT count(*) FILTER (WHERE status = 'COMPLETED')::int AS c, count(*) FILTER (WHERE status IN ('COMPLETED','CANCELLED'))::int AS f FROM hirings")).rows
    expect(r.hirings.successRate).toBe(done.f ? Math.round((done.c / done.f) * 1000) / 10 : null)
    const [t] = (await db.query('SELECT avg(extract(epoch FROM h.start_date - p.created_at))::float8 AS s, count(*)::int AS n FROM hirings h, projects p WHERE p.id = h.project_id AND h.start_date >= p.created_at')).rows
    expect(r.hirings.timeToHire.sampleSize).toBe(t.n)
    expect(r.hirings.timeToHire.seconds).toBe(Math.round(t.s))
    const [a] = (await db.query("SELECT avg(rating)::float8 AS avg, count(*)::int AS n FROM reviews WHERE reviewee_id IN (SELECT id FROM users WHERE role = 'FREELANCER')")).rows
    expect(r.freelancers.averageRating).toMatchObject({ reviews: a.n, value: Math.round(a.avg * 100) / 100 })
  })
  it('skill demand and the rankings', async () => {
    const skills = (await db.query('SELECT s.name, count(DISTINCT ps.project_id)::int AS n FROM skills s JOIN project_skills ps ON ps.skill_id = s.id GROUP BY s.name ORDER BY n DESC, s.name LIMIT 10')).rows
    expect(r.skills.demand.map((x) => [x.name, x.projects])).toEqual(skills.map((x) => [x.name, x.n]))
    const freelancers = (await db.query("SELECT u.name, count(*)::int AS n FROM hirings h JOIN users u ON u.id = h.freelancer_id WHERE h.status = 'COMPLETED' GROUP BY u.id, u.name ORDER BY n DESC, u.name, u.id LIMIT 10")).rows
    expect(r.freelancers.topByCompleted.map((x) => [x.name, x.count])).toEqual(freelancers.map((x) => [x.name, x.n]))
    const companies = (await db.query('SELECT u.name, count(*)::int AS n FROM projects p JOIN users u ON u.id = p.company_id GROUP BY u.id, u.name ORDER BY n DESC, u.name, u.id LIMIT 10')).rows
    expect(r.companies.topByProjects.map((x) => [x.name, x.count])).toEqual(companies.map((x) => [x.name, x.n]))
    expect(r.freelancers.topByCompleted.length).toBeLessThanOrEqual(10)
    expect(r.companies.topByProjects.length).toBeLessThanOrEqual(10)
  })
  it('every ranking is sorted, non-negative and names no email addresses', () => {
    for (const list of [r.freelancers.topByCompleted, r.companies.topByProjects, r.companies.topByHirings, r.skills.demand]) {
      const counts = list.map((x) => x.count ?? x.projects)
      expect(counts).toEqual([...counts].sort((a, b) => b - a))
      expect(counts.every((n) => Number.isInteger(n) && n > 0)).toBe(true)
    }
    expect(JSON.stringify(r)).not.toMatch(/@[a-z0-9-]+\.[a-z]/i)
  })
})

describe('CSV export', () => {
  let csv, rows
  beforeAll(async () => { csv = (await exportCsv(WINDOW)).text; rows = parseCsv(csv) })
  const cell = (section, metric, group = '') => rows.find((x) => x[0] === section && x[1] === metric && x[2] === group)?.[3]

  it('is one table with the same four columns on every row', () => {
    expect(rows[0]).toEqual(['Section', 'Metric', 'Group', 'Value'])
    expect(rows.every((x) => x.length === 4), 'every row has 4 cells').toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  it('contains the same numbers as the dashboard for the same filters', async () => {
    const j = (await analytics(WINDOW)).body
    expect(cell('Projects', 'Total projects posted')).toBe(String(j.projects.total))
    expect(cell('Projects', 'Active projects (open + in progress)')).toBe(String(j.projects.active))
    expect(cell('Hirings', 'Total hirings')).toBe('6'); expect(cell('Hirings', 'Successful hires (completed)')).toBe('3'); expect(cell('Hirings', 'Ongoing hirings')).toBe('2'); expect(cell('Hirings', 'Cancelled hirings')).toBe('1')
    expect(cell('Hirings', 'Hiring success rate (%, completed / (completed + cancelled))')).toBe('75')
    expect(cell('Hirings', 'Average days from project posted to hire', 'based on 5 hirings')).toBe('5.6')
    expect(cell('Proposals', 'Proposal acceptance rate (%, accepted / submitted)')).toBe('40')
    expect(cell('Freelancers', 'Average freelancer rating (1-5)', '2 reviews of 2 freelancers')).toBe('3.5')
    expect(cell('Projects posted per month', '2001-04')).toBe('3')
    expect(cell('Hirings started per month', '2001-05', 'Cancelled')).toBe('1')
    expect(cell('Top freelancers by completed projects', 'Bob Fixture', '#1')).toBe('2')
    expect(cell('Most demanded skills (projects requiring the skill)', 'React', '#1')).toBe('3')
    expect(cell('Report', 'Date range', 'custom')).toBe('2001-03-01 to 2001-05-31')
    expect(rows.filter((x) => x[0] === 'Not available').length).toBe(j.unavailable.length)
  })
  it('a company named like a spreadsheet formula is exported as text, with quotes escaped', () => {
    expect(cell('Top companies by projects posted', `'${EVIL}`, '#2')).toBe('2')                                    // leading apostrophe: the cell cannot run as a formula
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")",#2,2`)
    for (const x of rows.slice(1)) for (const c of x.slice(0, 3)) expect(c, JSON.stringify(x)).not.toMatch(/^[=+\-@\t]/)
  })
  it('applies the status filters, and leaves unknown values blank instead of inventing them', async () => {
    const filtered = parseCsv((await exportCsv({ ...WINDOW, hiringStatus: 'ACTIVE' })).text)
    const find = (m) => filtered.find((x) => x[1] === m)
    expect(find('Hiring success rate (%, completed / (completed + cancelled))')[3]).toBe('')
    expect(find('Hiring status filter')[3]).toBe('ACTIVE')
    expect(find('Total hirings')[3]).toBe('2')
  })
})

describe('simultaneous requests', () => {
  it('several admins can load the report at once; each gets a complete, consistent answer', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? exportCsv(WINDOW) : analytics(WINDOW))))
    expect(results.map((x) => x.status)).toEqual([200, 200, 200, 200, 200, 200])
    const bodies = results.filter((_, i) => i % 2 === 0).map((x) => x.body)
    for (const b of bodies) { expect(b.projects).toEqual(bodies[0].projects); expect(b.hirings).toEqual(bodies[0].hirings); expect(b.proposals).toEqual(bodies[0].proposals) }
  })
  it('a report is one consistent snapshot even while projects are being added underneath it', async () => {
    const [{ id: company }] = (await db.query("SELECT id FROM users WHERE name = 'Alpha Fixture Co'")).rows
    const writer = (async () => {
      for (let i = 0; i < 12; i++) await db.query(
        "INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline, status, created_at) VALUES ($1, $2, 'Snapshot probe description that is long enough.', 1000, 2000, '2002-01-01T00:00:00Z', 'OPEN', '2001-04-05T00:00:00Z')", [company, `Snapshot probe ${i}`])
    })()
    try {
      const reads = await Promise.all(Array.from({ length: 6 }, () => analytics(WINDOW)))
      await writer
      for (const x of reads) {
        expect(x.status).toBe(200)
        const p = x.body.projects      // the by-status query and the by-month query are separate statements: only a shared snapshot makes them agree
        expect([p.byStatus.reduce((s, y) => s + y.count, 0), p.monthly.reduce((s, m) => s + m.count, 0)], 'by status vs by month').toEqual([p.total, p.total])
        expect(p.total).toBeGreaterThanOrEqual(6); expect(p.total).toBeLessThanOrEqual(18)
      }
      expect((await analytics(WINDOW)).body.projects.total).toBe(18)      // once the writer is done, every probe is counted
    } finally {
      await writer.catch(() => {})
      await db.query("DELETE FROM projects WHERE title LIKE 'Snapshot probe %'")
    }
    expect((await analytics(WINDOW)).body.projects.total).toBe(6)
  })
})
