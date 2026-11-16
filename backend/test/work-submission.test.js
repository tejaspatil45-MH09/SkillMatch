import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { createApp } from '../src/app.js'
import { defaultLimits } from '../src/middleware/rateLimit.js'
import { app, db, expectPgError, inTx, loginAs, mkProject, mkProposal, mkUser } from './helpers.js'

// Phase 9: work submission, company review and the conversation attached to every hiring.
// Like the other suites these run against the REAL database (the throwaway TEST_DATABASE_URL one).

let aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
const future = (d) => new Date(Date.now() + d * 864e5).toISOString()
const letter = 'I have shipped similar work before and can deliver this project on time with clear communication.'
const H = (id, tail = '') => `/api/hirings/${id}${tail}`
let n = 0

// A brand-new ACTIVE hiring between TechNova and the given freelancer (same flow the real UI uses)
async function freshHiring(freelancer = aarav) {
  const p = await technova.post('/api/projects').send({ title: `Work Test Project ${++n}`, description: 'A throwaway project used to test work submission safely.', budgetMin: 1000, budgetMax: 2000, deadline: future(30), skills: ['React'] })
  if (!p.body.id) throw new Error(`freshHiring: project not created (${p.status} ${JSON.stringify(p.body)})`)
  const proposal = await freelancer.post(`/api/projects/${p.body.id}/proposals`).send({ coverLetter: letter, bidAmount: 1500, estimatedDays: 10 })
  if (!proposal.body.id) throw new Error(`freshHiring: ${freelancer.user.name} could not apply (${proposal.status} ${JSON.stringify(proposal.body)})`)
  const shortlisted = await technova.post(`/api/proposals/${proposal.body.id}/shortlist`)
  if (shortlisted.status >= 400) throw new Error(`freshHiring: shortlist refused (${shortlisted.status} ${JSON.stringify(shortlisted.body)})`)
  const accepted = await technova.post(`/api/proposals/${proposal.body.id}/accept`)
  if (!accepted.body.id) throw new Error(`freshHiring: accept refused (${accepted.status} ${JSON.stringify(accepted.body)})`)
  return { id: accepted.body.id, projectId: p.body.id, title: `Work Test Project ${n}` }
}
const delivery = (over = {}) => ({ title: 'First delivery', repoUrl: 'https://github.com/aarav/shop', liveUrl: 'https://shop.example.com', description: 'Everything on the brief, with notes on how to run it.', ...over })
const submit = (who, id, over) => who.post(H(id, '/submissions')).send(delivery(over))
const approve = (who, id, sid) => who.post(H(id, `/submissions/${sid}/approve`))
const revise = (who, id, sid, feedback = 'Please fix the checkout totals and add tests.') => who.post(H(id, `/submissions/${sid}/request-revision`)).send({ feedback })
const state = async (id) => (await db.query('SELECT h.status, h.work_status, h.completed_at, p.status AS project FROM hirings h JOIN projects p ON p.id = h.project_id WHERE h.id = $1', [id])).rows[0]
const rows = async (id) => (await db.query('SELECT version, status, title, feedback, reviewed_at FROM work_submissions WHERE hiring_id = $1 ORDER BY version', [id])).rows
const notes = async (email, type, id) => (await db.query("SELECT n.message, n.link, n.read FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = $2 AND n.link LIKE '%' || $3 ORDER BY n.created_at DESC, n.id", [email, type, id])).rows

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('hiring details', () => {
  it('both parties see the hiring with its work status and unread count; existing fields are unchanged', async () => {
    const h = await freshHiring()
    for (const who of [aarav, technova]) {
      const r = await who.get(H(h.id))
      expect(r.status, who.user.name).toBe(200)
      expect(r.body).toMatchObject({ id: h.id, status: 'ACTIVE', workStatus: 'IN_PROGRESS', unreadMessages: 0, project: { title: h.title }, freelancer: { name: 'Aarav Sharma' }, company: { name: 'TechNova Solutions' }, reviews: [] })
    }
    const list = (await aarav.get('/api/hirings')).body.find((x) => x.id === h.id)
    expect(list).toMatchObject({ workStatus: 'IN_PROGRESS', unreadMessages: 0, status: 'ACTIVE' })
  })
  it('legacy hirings (made before this phase) start at IN_PROGRESS', async () => {
    const k = (await kunal.get('/api/hirings')).body[0]
    expect(k).toMatchObject({ status: 'ACTIVE', workStatus: 'IN_PROGRESS' })
    const done = (await aarav.get('/api/hirings')).body.find((x) => x.status === 'COMPLETED' && x.project.title === 'Company Portfolio Website')
    expect(done.workStatus).toBe('IN_PROGRESS')
  })
  it('strangers, other companies, other freelancers and admins cannot open it', async () => {
    const h = await freshHiring()
    for (const who of [pixelcraft, innovate, rohan, priya, kunal]) { const r = await who.get(H(h.id)); expect([r.status, r.body.code], who.user.name).toEqual([404, 'NOT_FOUND']) }
    expect((await admin.get(H(h.id))).status).toBe(403)
    expect((await request(app).get(H(h.id))).status).toBe(401)
    expect((await aarav.get(H('00000000-0000-0000-0000-000000000000'))).status).toBe(404)
    expect((await aarav.get(H('not-a-uuid'))).status).toBe(404)
  })
})

describe('submitting work', () => {
  it('records version 1, keeps the hiring ACTIVE and the project IN_PROGRESS, and tells the company', async () => {
    const h = await freshHiring()
    const r = await submit(aarav, h.id)
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ hiringId: h.id, version: 1, status: 'SUBMITTED', title: 'First delivery', repoUrl: 'https://github.com/aarav/shop', liveUrl: 'https://shop.example.com/', feedback: null, reviewedAt: null, submittedBy: { id: aarav.user.id, name: 'Aarav Sharma' } })
    expect(await state(h.id)).toMatchObject({ status: 'ACTIVE', work_status: 'SUBMITTED', completed_at: null, project: 'IN_PROGRESS' })   // submitting never completes anything
    const [note] = await notes('hr@technova.dev', 'WORK_SUBMITTED', h.id)
    expect(note).toMatchObject({ message: `Aarav Sharma submitted work for "${h.title}".`, link: `/company/hirings/${h.id}`, read: false })
  })
  it('a description alone is enough (20+ characters), and blank links count as "no link"', async () => {
    const h = await freshHiring()
    const r = await submit(aarav, h.id, { repoUrl: '', liveUrl: null, description: 'Delivered as a zip emailed to your team; see notes.' })
    expect(r.status).toBe(201); expect(r.body).toMatchObject({ repoUrl: null, liveUrl: null })
  })
  it('links alone are enough, and a repository link is stored without query string or fragment', async () => {
    const h = await freshHiring()
    const r = await submit(aarav, h.id, { description: undefined, liveUrl: undefined, repoUrl: 'https://www.github.com/aarav/shop.git?tab=readme#top' })
    expect(r.status).toBe(201); expect(r.body).toMatchObject({ repoUrl: 'https://www.github.com/aarav/shop.git', description: '' })
  })
  it('requires a title and at least one meaningful deliverable, and checks every field on the server', async () => {
    const h = await freshHiring()
    const bad = [
      [{ title: '' }, 'title'], [{ title: 'ab' }, 'title'], [{ title: 'x'.repeat(121) }, 'title'], [{ title: undefined }, 'title'],
      [{ repoUrl: '', liveUrl: '', description: '' }, 'description'], [{ repoUrl: '', liveUrl: '', description: 'too short' }, 'description'], [{ repoUrl: '  ', liveUrl: '  ', description: undefined }, 'description'],
      [{ description: 'x'.repeat(5001) }, 'description'],
      [{ repoUrl: 'https://gitlab.com/a/b' }, 'repoUrl'], [{ repoUrl: 'https://github.com/onlyowner' }, 'repoUrl'], [{ repoUrl: 'http://github.com/a/b' }, 'repoUrl'],
      [{ repoUrl: 'https://github.com.evil.com/a/b' }, 'repoUrl'], [{ repoUrl: 'https://user:pass@github.com/a/b' }, 'repoUrl'], [{ repoUrl: 'https://github.com/../b' }, 'repoUrl'],
      [{ repoUrl: 'javascript:alert(1)' }, 'repoUrl'], [{ repoUrl: 'not a url' }, 'repoUrl'], [{ repoUrl: `https://github.com/a/${'b'.repeat(300)}` }, 'repoUrl'],
      [{ liveUrl: 'javascript:alert(1)' }, 'liveUrl'], [{ liveUrl: 'ftp://files.example.com/x' }, 'liveUrl'], [{ liveUrl: 'data:text/html,hi' }, 'liveUrl'], [{ liveUrl: 'file:///etc/passwd' }, 'liveUrl'],
      [{ liveUrl: 'https://user:pass@evil.com' }, 'liveUrl'], [{ liveUrl: 'https://localhost' }, 'liveUrl'], [{ liveUrl: 'example' }, 'liveUrl'], [{ liveUrl: `https://example.com/${'a'.repeat(500)}` }, 'liveUrl'],
    ]
    for (const [over, field] of bad) {
      const r = await submit(aarav, h.id, over)
      expect([r.status, r.body.code, Boolean(r.body.fields?.[field])], JSON.stringify(over).slice(0, 80)).toEqual([400, 'VALIDATION', true])
    }
    expect(await rows(h.id)).toEqual([])                                   // nothing was stored by any of them
    expect((await state(h.id)).work_status).toBe('IN_PROGRESS')
  })
  it('refuses fields the client must never control', async () => {
    const h = await freshHiring()
    for (const extra of [{ status: 'APPROVED' }, { version: 9 }, { hiringId: h.id }, { submittedBy: priya.user.id }, { submittedAt: '2020-01-01' }, { feedback: 'sneaky' }, { reviewedAt: new Date().toISOString() }]) {
      const r = await aarav.post(H(h.id, '/submissions')).send({ ...delivery(), ...extra })
      expect([r.status, r.body.code], JSON.stringify(extra)).toEqual([400, 'VALIDATION'])
    }
    expect(await rows(h.id)).toEqual([])
  })
  it('only the hired freelancer can submit; everyone else is refused and nothing is stored', async () => {
    const h = await freshHiring()
    expect([(await submit(technova, h.id)).status, (await submit(pixelcraft, h.id)).status, (await submit(admin, h.id)).status]).toEqual([403, 403, 403])   // wrong role
    for (const who of [rohan, priya, kunal]) { const r = await submit(who, h.id); expect([r.status, r.body.code], who.user.name).toEqual([404, 'NOT_FOUND']) }   // another freelancer
    expect((await submit(aarav, 'nope')).status).toBe(404)
    expect((await request(app).post(H(h.id, '/submissions')).send(delivery())).status).toBe(401)
    expect(await rows(h.id)).toEqual([])
    expect((await state(h.id)).work_status).toBe('IN_PROGRESS')
  })
  it('cannot submit a second time while the first still waits for review', async () => {
    const h = await freshHiring()
    expect((await submit(aarav, h.id)).status).toBe(201)
    const again = await submit(aarav, h.id, { title: 'Second try' })
    expect([again.status, again.body.code]).toEqual([409, 'INVALID_STATE'])
    expect(await rows(h.id)).toHaveLength(1)
  })
  it('cannot submit once the hiring is completed or cancelled', async () => {
    const done = await freshHiring(); await technova.post(H(done.id, '/complete'))
    const gone = await freshHiring(); await technova.post(H(gone.id, '/cancel')).send({ reason: 'Priorities changed for this project.' })
    for (const h of [done, gone]) { const r = await submit(aarav, h.id); expect([r.status, r.body.code]).toEqual([409, 'INVALID_STATE']); expect(await rows(h.id)).toEqual([]) }
  })
})

describe('listing submissions', () => {
  it('both parties see the same history, newest first; nobody else sees anything', async () => {
    const h = await freshHiring()
    const v1 = (await submit(aarav, h.id)).body
    await revise(technova, h.id, v1.id)
    const v2 = (await submit(aarav, h.id, { title: 'Second delivery' })).body
    for (const who of [aarav, technova]) {
      const r = await who.get(H(h.id, '/submissions'))
      expect(r.status).toBe(200)
      expect(r.body.map((s) => [s.version, s.status, s.title])).toEqual([[2, 'SUBMITTED', 'Second delivery'], [1, 'REVISION_REQUESTED', 'First delivery']])
    }
    expect(v2.version).toBe(2)
    for (const who of [pixelcraft, rohan, kunal]) expect((await who.get(H(h.id, '/submissions'))).status, who.user.name).toBe(404)
    expect((await admin.get(H(h.id, '/submissions'))).status).toBe(403)
    expect((await request(app).get(H(h.id, '/submissions'))).status).toBe(401)
  })
  it('an empty history is an empty list', async () => {
    const h = await freshHiring()
    expect((await technova.get(H(h.id, '/submissions'))).body).toEqual([])
  })
})

describe('company review', () => {
  it('requesting a revision needs an explanation, notifies the freelancer and keeps the hiring open', async () => {
    const h = await freshHiring()
    const v1 = (await submit(aarav, h.id)).body
    for (const feedback of [undefined, '', '   ', 'short', 'x'.repeat(1001)]) {
      const r = await technova.post(H(h.id, `/submissions/${v1.id}/request-revision`)).send(feedback === undefined ? {} : { feedback })
      expect([r.status, r.body.code, Boolean(r.body.fields?.feedback)], String(feedback).slice(0, 12)).toEqual([400, 'VALIDATION', true])
    }
    expect((await rows(h.id))[0].status).toBe('SUBMITTED')                  // refused requests changed nothing
    const r = await revise(technova, h.id, v1.id, 'Please fix the checkout totals and add tests.')
    expect(r.status).toBe(200)
    expect(r.body.submission).toMatchObject({ id: v1.id, status: 'REVISION_REQUESTED', feedback: 'Please fix the checkout totals and add tests.', reviewedAt: expect.any(String) })
    expect(r.body.hiring).toMatchObject({ status: 'ACTIVE', workStatus: 'REVISION_REQUESTED' })
    expect(await state(h.id)).toMatchObject({ status: 'ACTIVE', work_status: 'REVISION_REQUESTED', completed_at: null, project: 'IN_PROGRESS' })
    const [note] = await notes('aarav@skillmatch.dev', 'REVISION_REQUESTED', h.id)
    expect(note).toMatchObject({ message: `The company asked for changes to your work on "${h.title}".`, link: `/freelancer/hirings/${h.id}`, read: false })
  })
  it('the freelancer can resubmit after a revision request: a new version is added and version 1 is preserved', async () => {
    const h = await freshHiring()
    const v1 = (await submit(aarav, h.id)).body
    await revise(technova, h.id, v1.id)
    const v2 = await submit(aarav, h.id, { title: 'Second delivery', description: 'Totals fixed, tests added.' })
    expect(v2.status).toBe(201); expect(v2.body).toMatchObject({ version: 2, status: 'SUBMITTED' })
    const history = await rows(h.id)
    expect(history.map((s) => [s.version, s.status, s.title, s.feedback])).toEqual([[1, 'REVISION_REQUESTED', 'First delivery', 'Please fix the checkout totals and add tests.'], [2, 'SUBMITTED', 'Second delivery', null]])
    expect((await state(h.id)).work_status).toBe('SUBMITTED')
    expect((await notes('hr@technova.dev', 'WORK_SUBMITTED', h.id)).map((x) => x.message)).toEqual([`Aarav Sharma submitted a revised version (v2) for "${h.title}".`, `Aarav Sharma submitted work for "${h.title}".`])
  })
  it('approving completes the submission, the hiring and the project, notifies the freelancer and opens reviews', async () => {
    const h = await freshHiring()
    const s = (await submit(aarav, h.id)).body
    expect((await technova.post('/api/reviews').send({ hiringId: h.id, rating: 5, comment: 'Too early to review this one.' })).status).toBe(409)   // reviews wait for approval
    const r = await approve(technova, h.id, s.id)
    expect(r.status).toBe(200)
    expect(r.body.submission).toMatchObject({ id: s.id, status: 'APPROVED', feedback: null, reviewedAt: expect.any(String) })
    expect(r.body.hiring).toMatchObject({ status: 'COMPLETED', workStatus: 'APPROVED', completedAt: expect.any(String) })
    expect(await state(h.id)).toMatchObject({ status: 'COMPLETED', work_status: 'APPROVED', project: 'COMPLETED' })
    const [note] = await notes('aarav@skillmatch.dev', 'WORK_APPROVED', h.id)
    expect(note).toMatchObject({ message: `Your work for "${h.title}" was approved and the project is complete.`, link: `/freelancer/hirings/${h.id}` })
    expect((await technova.post('/api/reviews').send({ hiringId: h.id, rating: 5, comment: 'Delivered exactly what we needed.' })).status).toBe(201)
    expect((await aarav.post('/api/reviews').send({ hiringId: h.id, rating: 4, comment: 'Clear brief and fast feedback.' })).status).toBe(201)
  })
  it('a reviewed submission cannot be reviewed again, and nothing can be submitted after approval', async () => {
    const h = await freshHiring()
    const s = (await submit(aarav, h.id)).body
    expect((await approve(technova, h.id, s.id)).status).toBe(200)
    for (const r of [await approve(technova, h.id, s.id), await revise(technova, h.id, s.id)]) expect([r.status, r.body.code]).toEqual([409, 'INVALID_STATE'])
    const more = await submit(aarav, h.id, { title: 'After approval' })
    expect([more.status, more.body.code]).toEqual([409, 'INVALID_STATE'])
    expect(await rows(h.id)).toHaveLength(1)
    const h2 = await freshHiring()
    const s2 = (await submit(aarav, h2.id)).body
    await revise(technova, h2.id, s2.id)
    for (const r of [await approve(technova, h2.id, s2.id), await revise(technova, h2.id, s2.id)]) expect([r.status, r.body.code]).toEqual([409, 'INVALID_STATE'])   // already answered
  })
  it('only the hiring company can review; the freelancer, other companies and admins cannot, and nothing changes', async () => {
    const h = await freshHiring()
    const s = (await submit(aarav, h.id)).body
    for (const who of [aarav, admin]) { expect((await approve(who, h.id, s.id)).status, who.user.name).toBe(403); expect((await revise(who, h.id, s.id)).status, who.user.name).toBe(403) }
    for (const who of [pixelcraft, innovate]) { const a = await approve(who, h.id, s.id); expect([a.status, a.body.code], who.user.name).toEqual([404, 'NOT_FOUND']); expect((await revise(who, h.id, s.id)).status).toBe(404) }
    expect((await request(app).post(H(h.id, `/submissions/${s.id}/approve`))).status).toBe(401)
    expect(await state(h.id)).toMatchObject({ status: 'ACTIVE', work_status: 'SUBMITTED' })
    expect((await rows(h.id))[0].status).toBe('SUBMITTED')
  })
  it('a submission id from a different hiring, or one that does not exist, is not found and changes nothing', async () => {
    const a = await freshHiring(), b = await freshHiring()
    const sa = (await submit(aarav, a.id)).body, sb = (await submit(aarav, b.id)).body
    expect((await approve(technova, a.id, sb.id)).status).toBe(404)
    expect((await revise(technova, b.id, sa.id)).status).toBe(404)
    expect((await approve(technova, a.id, '00000000-0000-0000-0000-000000000000')).status).toBe(404)
    expect((await approve(technova, a.id, 'nope')).status).toBe(404)
    expect([(await rows(a.id))[0].status, (await rows(b.id))[0].status]).toEqual(['SUBMITTED', 'SUBMITTED'])
  })
  it('nothing to review before the freelancer has submitted', async () => {
    const h = await freshHiring()
    expect((await approve(technova, h.id, '00000000-0000-0000-0000-000000000000')).status).toBe(404)
    expect(await state(h.id)).toMatchObject({ status: 'ACTIVE', work_status: 'IN_PROGRESS' })
  })
  it('existing rules still hold: completing directly is allowed, and with a waiting submission it counts as the approval', async () => {
    const plain = await freshHiring()
    expect((await technova.post(H(plain.id, '/complete'))).status).toBe(200)
    expect(await state(plain.id)).toMatchObject({ status: 'COMPLETED', work_status: 'IN_PROGRESS', project: 'COMPLETED' })
    const pending = await freshHiring()
    await submit(aarav, pending.id)
    const r = await technova.post(H(pending.id, '/complete'))
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ status: 'COMPLETED', workStatus: 'APPROVED' })
    expect((await rows(pending.id))[0]).toMatchObject({ status: 'APPROVED', reviewed_at: expect.any(Date) })
  })
  it('cancelling a hiring that has a waiting submission leaves the history intact and blocks any review', async () => {
    const h = await freshHiring()
    const s = (await submit(aarav, h.id)).body
    expect((await technova.post(H(h.id, '/cancel')).send({ reason: 'Priorities changed for this project.' })).status).toBe(200)
    for (const r of [await approve(technova, h.id, s.id), await revise(technova, h.id, s.id)]) expect([r.status, r.body.code]).toEqual([409, 'INVALID_STATE'])
    expect(await rows(h.id)).toHaveLength(1)
    expect((await aarav.get(H(h.id, '/submissions'))).body).toHaveLength(1)   // still readable
  })
})

describe('history is protected by the database itself', () => {
  const base = async (c) => {
    const company = await mkUser(c, 'COMPANY'), freelancer = await mkUser(c, 'FREELANCER'), project = await mkProject(c, company, { status: 'IN_PROGRESS' })
    const proposal = await mkProposal(c, project, freelancer, 'ACCEPTED')
    const { rows: [hiring] } = await c.query('INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id) VALUES ($1,$2,$3,$4) RETURNING id', [proposal, project, freelancer, company])
    return { company, freelancer, hiring: hiring.id }
  }
  const insert = (c, b, over = {}) => c.query(
    "INSERT INTO work_submissions (hiring_id, version, title, description, repo_url, live_url, submitted_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [b.hiring, over.version ?? 1, over.title ?? 'Delivery', over.description ?? '', over.repo ?? 'https://github.com/o/r', over.live ?? null, over.by ?? b.freelancer])
  it('rejects submissions without a deliverable, with bad links, or from someone who is not the hired freelancer', () => inTx(async (c) => {
    const b = await base(c)
    await expectPgError(c, '23514', "INSERT INTO work_submissions (hiring_id, version, title, description, submitted_by) VALUES ($1,1,'Delivery','too short',$2)", [b.hiring, b.freelancer])
    for (const repo of ['https://gitlab.com/o/r', 'https://github.com/only', 'http://github.com/o/r', 'https://github.com.evil.com/o/r', 'ftp://github.com/o/r'])
      await expectPgError(c, '23514', "INSERT INTO work_submissions (hiring_id, version, title, repo_url, submitted_by) VALUES ($1,1,'Delivery',$2,$3)", [b.hiring, repo, b.freelancer])
    for (const live of ['javascript:alert(1)', 'ftp://x.example.com', 'https://has space.com'])
      await expectPgError(c, '23514', "INSERT INTO work_submissions (hiring_id, version, title, live_url, submitted_by) VALUES ($1,1,'Delivery',$2,$3)", [b.hiring, live, b.freelancer])
    await expectPgError(c, '23514', "INSERT INTO work_submissions (hiring_id, version, title, repo_url, submitted_by) VALUES ($1,0,'Delivery','https://github.com/o/r',$2)", [b.hiring, b.freelancer])
    await expectPgError(c, '23514', "INSERT INTO work_submissions (hiring_id, version, title, repo_url, submitted_by) VALUES ($1,1,'ab','https://github.com/o/r',$2)", [b.hiring, b.freelancer])
    await expectPgError(c, '23503', "INSERT INTO work_submissions (hiring_id, version, title, repo_url, submitted_by) VALUES ($1,1,'Delivery','https://github.com/o/r',$2)", [b.hiring, b.company])
    await expectPgError(c, '23503', "INSERT INTO work_submissions (hiring_id, version, title, repo_url, submitted_by) VALUES ($1,1,'Delivery','https://github.com/o/r',$2)", [b.hiring, await mkUser(c, 'FREELANCER')])
  }))
  it('allows one open submission per hiring and one row per version', () => inTx(async (c) => {
    const b = await base(c)
    const { rows: [v1] } = await insert(c, b)
    await expectPgError(c, '23505', "INSERT INTO work_submissions (hiring_id, version, title, repo_url, submitted_by) VALUES ($1,2,'Delivery','https://github.com/o/r',$2)", [b.hiring, b.freelancer])   // second open one
    await c.query("UPDATE work_submissions SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [v1.id, b.company])
    await expectPgError(c, '23505', "INSERT INTO work_submissions (hiring_id, version, title, repo_url, submitted_by) VALUES ($1,1,'Again','https://github.com/o/r',$2)", [b.hiring, b.freelancer])   // same version twice
  }))
  it('content can never be edited, reviewed rows are frozen, and nothing is deleted', () => inTx(async (c) => {
    const b = await base(c)
    const { rows: [s] } = await insert(c, b)
    for (const col of ["title = 'Changed'", "description = 'Changed after the fact'", "repo_url = 'https://github.com/x/y'", "live_url = 'https://x.example.com'", 'version = 7', 'submitted_at = now() + interval \'1 day\'', `hiring_id = '${b.hiring}'::uuid, submitted_by = '${b.freelancer}'::uuid, version = 2`])
      await expectPgError(c, '23514', `UPDATE work_submissions SET ${col} WHERE id = $1`, [s.id])
    await expectPgError(c, '23514', 'DELETE FROM work_submissions WHERE id = $1', [s.id])
    await c.query("UPDATE work_submissions SET status = 'REVISION_REQUESTED', feedback = 'Please add tests to this.', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [s.id, b.company])
    await expectPgError(c, '23514', "UPDATE work_submissions SET status = 'SUBMITTED', feedback = NULL, reviewed_by = NULL, reviewed_at = NULL WHERE id = $1", [s.id])
    await expectPgError(c, '23514', "UPDATE work_submissions SET feedback = 'Rewritten feedback text' WHERE id = $1", [s.id])
  }))
  it('a revision request always carries its explanation, and only the hiring company can review', () => inTx(async (c) => {
    const b = await base(c)
    const { rows: [s] } = await insert(c, b)
    await expectPgError(c, '23514', "UPDATE work_submissions SET status = 'REVISION_REQUESTED', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [s.id, b.company])
    await expectPgError(c, '23514', "UPDATE work_submissions SET status = 'REVISION_REQUESTED', feedback = 'too short', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [s.id, b.company])
    await expectPgError(c, '23514', "UPDATE work_submissions SET status = 'APPROVED', reviewed_by = $2 WHERE id = $1", [s.id, b.company])   // reviewed_at missing
    await expectPgError(c, '23503', "UPDATE work_submissions SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [s.id, await mkUser(c, 'COMPANY')])
  }))
  it('work can only be approved on a completed hiring', () => inTx(async (c) => {
    const b = await base(c)
    await expectPgError(c, '23514', "UPDATE hirings SET work_status = 'APPROVED' WHERE id = $1", [b.hiring])
    await c.query("UPDATE hirings SET status = 'COMPLETED', completed_at = now(), work_status = 'APPROVED' WHERE id = $1", [b.hiring])
  }))
  it('only the two parties of a hiring can post in its conversation, and messages cannot be empty', () => inTx(async (c) => {
    const b = await base(c), outsider = await mkUser(c, 'FREELANCER')
    await c.query("INSERT INTO hiring_messages (hiring_id, sender_id, body) VALUES ($1,$2,'Hello')", [b.hiring, b.freelancer])
    await c.query("INSERT INTO hiring_messages (hiring_id, sender_id, body) VALUES ($1,$2,'Hi back')", [b.hiring, b.company])
    await expectPgError(c, '23514', "INSERT INTO hiring_messages (hiring_id, sender_id, body) VALUES ($1,$2,'Let me in')", [b.hiring, outsider])
    await expectPgError(c, '23514', "INSERT INTO hiring_messages (hiring_id, sender_id, body) VALUES ($1,$2,'   ')", [b.hiring, b.company])
    await expectPgError(c, '23514', 'INSERT INTO hiring_messages (hiring_id, sender_id, body) VALUES ($1,$2,$3)', [b.hiring, b.company, 'x'.repeat(2001)])
  }))
})

describe('conversation', () => {
  it('the two parties exchange messages in order, with names and timestamps, and no contact details', async () => {
    const h = await freshHiring()
    const a = await aarav.post(H(h.id, '/messages')).send({ body: '  Hello! Quick question about the brief.  ' })
    expect(a.status).toBe(201); expect(a.body).toMatchObject({ hiringId: h.id, senderId: aarav.user.id, senderName: 'Aarav Sharma', body: 'Hello! Quick question about the brief.', readAt: null, createdAt: expect.any(String) })
    expect((await technova.post(H(h.id, '/messages')).send({ body: 'Sure, go ahead.' })).status).toBe(201)
    for (const who of [aarav, technova]) {
      const r = await who.get(H(h.id, '/messages'))
      expect(r.status).toBe(200)
      expect(r.body.map((m) => [m.senderName, m.body])).toEqual([['Aarav Sharma', 'Hello! Quick question about the brief.'], ['TechNova Solutions', 'Sure, go ahead.']])
      expect(JSON.stringify(r.body)).not.toMatch(/@|password|email/i)
    }
    expect((await aarav.get(H(h.id, '/messages'))).body.every((m) => !('seq' in m))).toBe(true)
  })
  it('validates the message and refuses fields the client must not set', async () => {
    const h = await freshHiring()
    for (const body of [{}, { body: '' }, { body: '   ' }, { body: 'x'.repeat(2001) }, { body: 5 }, { body: 'ok', senderId: priya.user.id }, { body: 'ok', hiringId: h.id }, { body: 'ok', readAt: new Date().toISOString() }]) {
      const r = await aarav.post(H(h.id, '/messages')).send(body)
      expect([r.status, r.body.code], JSON.stringify(body).slice(0, 50)).toEqual([400, 'VALIDATION'])
    }
    expect((await aarav.post(H(h.id, '/messages')).send({ body: 'x'.repeat(2000) })).status).toBe(201)   // the limit itself is fine
    expect((await aarav.get(H(h.id, '/messages'))).body).toHaveLength(1)
  })
  it('message text is stored as plain text and returned untouched (the page renders it as text, never as HTML)', async () => {
    const h = await freshHiring()
    const text = '<img src=x onerror=alert(1)> and <script>alert(2)</script> \'; DROP TABLE users;--'
    const r = await aarav.post(H(h.id, '/messages')).send({ body: text })
    expect(r.status).toBe(201); expect(r.body.body).toBe(text)
    expect((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBeGreaterThan(5)
  })
  it('strangers cannot read, post or mark messages as read, and nothing is stored', async () => {
    const h = await freshHiring()
    await aarav.post(H(h.id, '/messages')).send({ body: 'Private to the two of us.' })
    for (const who of [pixelcraft, innovate, rohan, priya, kunal]) {
      for (const r of [await who.get(H(h.id, '/messages')), await who.post(H(h.id, '/messages')).send({ body: 'Let me in' }), await who.post(H(h.id, '/messages/read'))])
        expect([r.status, r.body.code], who.user.name).toEqual([404, 'NOT_FOUND'])
    }
    for (const r of [await admin.get(H(h.id, '/messages')), await admin.post(H(h.id, '/messages')).send({ body: 'Admin here' }), await admin.post(H(h.id, '/messages/read'))]) expect(r.status).toBe(403)
    for (const r of [await request(app).get(H(h.id, '/messages')), await request(app).post(H(h.id, '/messages')).send({ body: 'hi' })]) expect(r.status).toBe(401)
    expect((await db.query('SELECT count(*)::int AS n FROM hiring_messages WHERE hiring_id = $1', [h.id])).rows[0].n).toBe(1)
    expect((await db.query('SELECT read_at FROM hiring_messages WHERE hiring_id = $1', [h.id])).rows[0].read_at).toBeNull()
  })
  it('unread counts follow the other party\'s messages, and opening the conversation clears them', async () => {
    const h = await freshHiring()
    await aarav.post(H(h.id, '/messages')).send({ body: 'First message' }); await aarav.post(H(h.id, '/messages')).send({ body: 'Second message' })
    expect((await technova.get(H(h.id))).body.unreadMessages).toBe(2)
    expect((await technova.get('/api/hirings')).body.find((x) => x.id === h.id).unreadMessages).toBe(2)
    expect((await aarav.get(H(h.id))).body.unreadMessages).toBe(0)           // your own messages are never "unread" for you
    expect((await aarav.post(H(h.id, '/messages/read'))).body).toEqual({ ok: true, marked: 0 })   // and reading your own side marks nothing
    expect((await technova.post(H(h.id, '/messages/read'))).body).toEqual({ ok: true, marked: 2 })
    expect((await technova.get(H(h.id))).body.unreadMessages).toBe(0)
    expect((await technova.post(H(h.id, '/messages/read'))).body).toEqual({ ok: true, marked: 0 })
    expect((await aarav.get(H(h.id, '/messages'))).body.map((m) => Boolean(m.readAt))).toEqual([true, true])   // the sender can see "seen"
    expect((await technova.get(H(h.id, '/messages'))).body.map((m) => Boolean(m.readAt))).toEqual([true, true])
  })
  it('notifies the other person once per burst, and again after they have opened the conversation', async () => {
    const h = await freshHiring()
    await aarav.post(H(h.id, '/messages')).send({ body: 'One' }); await aarav.post(H(h.id, '/messages')).send({ body: 'Two' }); await aarav.post(H(h.id, '/messages')).send({ body: 'Three' })
    let list = await notes('hr@technova.dev', 'MESSAGE', h.id)
    expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ message: `Aarav Sharma sent you a message about "${h.title}".`, link: `/company/hirings/${h.id}`, read: false })
    expect(await notes('aarav@skillmatch.dev', 'MESSAGE', h.id)).toEqual([])    // the sender is not notified of their own message
    await technova.post(H(h.id, '/messages/read'))
    expect((await notes('hr@technova.dev', 'MESSAGE', h.id))[0].read).toBe(true)   // the badge clears when they open it
    await technova.post(H(h.id, '/messages')).send({ body: 'Reply' })
    expect(await notes('aarav@skillmatch.dev', 'MESSAGE', h.id)).toHaveLength(1)
    expect((await notes('aarav@skillmatch.dev', 'MESSAGE', h.id))[0].link).toBe(`/freelancer/hirings/${h.id}`)
    await aarav.post(H(h.id, '/messages')).send({ body: 'Again' })
    expect(await notes('hr@technova.dev', 'MESSAGE', h.id)).toHaveLength(2)     // a new burst, a new notification
  })
  it('stays readable after completion, but a cancelled hiring closes the conversation for writing', async () => {
    const done = await freshHiring()
    await aarav.post(H(done.id, '/messages')).send({ body: 'Before completion' })
    await technova.post(H(done.id, '/complete'))
    expect((await aarav.post(H(done.id, '/messages')).send({ body: 'Thanks for the project!' })).status).toBe(201)   // congratulating each other is fine

    const gone = await freshHiring()
    await aarav.post(H(gone.id, '/messages')).send({ body: 'Before cancelling' })
    await technova.post(H(gone.id, '/cancel')).send({ reason: 'Priorities changed for this project.' })
    expect((await aarav.get(H(gone.id, '/messages'))).body).toHaveLength(1)
    for (const who of [aarav, technova]) { const r = await who.post(H(gone.id, '/messages')).send({ body: 'Hello?' }); expect([r.status, r.body.code]).toEqual([409, 'CONVERSATION_CLOSED']) }
  })
  // These two use their OWN freelancer (priya) and always put her back in `finally`, so a failure here can never leave
  // a shared account suspended and make unrelated tests fail.
  it('admin suspension ends the account\'s sessions at once (401, not 403), closes the conversation for the other party, and is undone by reinstating', async () => {
    const h = await freshHiring(priya)
    expect((await priya.post(H(h.id, '/messages')).send({ body: 'Before suspension' })).status).toBe(201)
    try {
      expect((await admin.post(`/api/admin/users/${priya.user.id}/suspend`)).status).toBe(200)
      // Suspending deletes every session in the same transaction, so the old session is simply "not logged in"
      for (const r of [await priya.get(H(h.id, '/messages')), await priya.post(H(h.id, '/messages')).send({ body: 'still here?' }), await priya.post(H(h.id, '/submissions')).send(delivery()), await priya.get(H(h.id))])
        expect([r.status, r.body.code]).toEqual([401, 'UNAUTHENTICATED'])
      // A new login is refused with the real reason once the password is proven
      const login = await request(app).post('/api/auth/login').send({ email: 'priya@skillmatch.dev', password: 'Password@123' })
      expect([login.status, login.body.code]).toEqual([403, 'SUSPENDED'])
      // The other party can still read, but not write, and nothing was stored
      const blocked = await technova.post(H(h.id, '/messages')).send({ body: 'Are you there?' })
      expect([blocked.status, blocked.body.code]).toEqual([409, 'CONVERSATION_CLOSED'])
      expect((await technova.get(H(h.id, '/messages'))).body.map((m) => m.body)).toEqual(['Before suspension'])
    } finally {
      expect((await admin.post(`/api/admin/users/${priya.user.id}/reinstate`)).status).toBe(200)
      priya = await loginAs('priya@skillmatch.dev')
    }
    expect((await technova.post(H(h.id, '/messages')).send({ body: 'Welcome back' })).status).toBe(201)
    expect((await priya.post(H(h.id, '/messages')).send({ body: 'Thanks' })).status).toBe(201)
  })
  it('a suspended account whose session is still alive is refused with 403 SUSPENDED on every new endpoint, and that ends the session', async () => {
    const h = await freshHiring(priya)
    const [a1, a2, a3] = await Promise.all([loginAs('priya@skillmatch.dev'), loginAs('priya@skillmatch.dev'), loginAs('priya@skillmatch.dev')])
    try {
      await db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [priya.user.id])   // flipped directly: the sessions survive
      for (const r of [await a1.get(H(h.id, '/messages')), await a2.post(H(h.id, '/submissions')).send(delivery()), await a3.post(H(h.id, '/messages')).send({ body: 'Hello' })])
        expect([r.status, r.body.code]).toEqual([403, 'SUSPENDED'])
      expect((await a1.get(H(h.id, '/messages'))).status).toBe(401)                       // the refusal destroyed that session
      expect(await rows(h.id)).toEqual([])                                                 // and nothing was stored
      expect((await db.query('SELECT count(*)::int AS n FROM hiring_messages WHERE hiring_id = $1', [h.id])).rows[0].n).toBe(0)
    } finally {
      await db.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [priya.user.id])
      priya = await loginAs('priya@skillmatch.dev')
    }
  })
  it('is rate limited per user, reads are not limited, and refused messages are not stored', async () => {
    const h = await freshHiring()
    const limited = createApp({ pool: db, mailer: { send: async () => {} }, limits: { ...defaultLimits, login: { windowMs: 60000, ip: 100, account: 100 }, message: { windowMs: 60000, limit: 3 } } })
    const login = async (email) => { const a = request.agent(limited); const r = await a.post('/api/auth/login').send({ email, password: 'Password@123' }); expect([r.status, email]).toEqual([200, email]); return a }
    const [freelancer, company] = [await login('aarav@skillmatch.dev'), await login('hr@technova.dev')]
    const codes = []; for (let i = 0; i < 5; i++) codes.push((await freelancer.post(H(h.id, '/messages')).send({ body: `Message ${i}` })).status)
    expect(codes).toEqual([201, 201, 201, 429, 429])
    expect((await freelancer.post(H(h.id, '/messages')).send({ body: 'Message 6' })).body.code).toBe('RATE_LIMITED')
    expect((await freelancer.get(H(h.id, '/messages'))).status).toBe(200)                  // only sending is limited
    expect((await company.post(H(h.id, '/messages')).send({ body: 'Reply from the company' })).status).toBe(201)   // the limit is per user, not shared
    expect((await db.query('SELECT count(*)::int AS n FROM hiring_messages WHERE hiring_id = $1', [h.id])).rows[0].n).toBe(4)   // 3 + 1: the refused ones were never stored
  })
})

describe('simultaneous actions (the database decides, exactly one wins)', () => {
  it('five simultaneous submissions create exactly one', async () => {
    for (let round = 0; round < 3; round++) {
      const h = await freshHiring()
      const res = await Promise.all([1, 2, 3, 4, 5].map((i) => submit(aarav, h.id, { title: `Racing submission ${i}` })))
      expect(res.map((r) => r.status).sort(), `round ${round}`).toEqual([201, 409, 409, 409, 409])
      expect(res.filter((r) => r.status === 409).every((r) => r.body.code === 'INVALID_STATE')).toBe(true)
      expect(await rows(h.id)).toHaveLength(1)
      expect((await notes('hr@technova.dev', 'WORK_SUBMITTED', h.id))).toHaveLength(1)
    }
  })
  it('approve and request-revision at the same moment: one wins and the hiring is never half-way between the two', async () => {
    for (let round = 0; round < 4; round++) {
      const h = await freshHiring(); const s = (await submit(aarav, h.id)).body
      const [a, r] = await Promise.all([approve(technova, h.id, s.id), revise(technova, h.id, s.id)])
      expect([a.status, r.status].sort(), `round ${round}`).toEqual([200, 409])
      const st = await state(h.id), [sub] = await rows(h.id)
      if (a.status === 200) { expect(st).toMatchObject({ status: 'COMPLETED', work_status: 'APPROVED', project: 'COMPLETED' }); expect(sub.status).toBe('APPROVED'); expect(sub.feedback).toBeNull() }
      else { expect(st).toMatchObject({ status: 'ACTIVE', work_status: 'REVISION_REQUESTED', project: 'IN_PROGRESS', completed_at: null }); expect(sub.status).toBe('REVISION_REQUESTED'); expect(sub.feedback).not.toBeNull() }
      expect((await notes('aarav@skillmatch.dev', a.status === 200 ? 'WORK_APPROVED' : 'REVISION_REQUESTED', h.id))).toHaveLength(1)
    }
  })
  it('approving twice at once completes once and notifies once', async () => {
    const h = await freshHiring(); const s = (await submit(aarav, h.id)).body
    const res = await Promise.all([1, 2, 3, 4].map(() => approve(technova, h.id, s.id)))
    expect(res.map((r) => r.status).sort()).toEqual([200, 409, 409, 409])
    expect(await notes('aarav@skillmatch.dev', 'WORK_APPROVED', h.id)).toHaveLength(1)
    expect(await state(h.id)).toMatchObject({ status: 'COMPLETED', work_status: 'APPROVED' })
  })
  it('approve versus cancel: whichever wins, the hiring, the project and the submission agree', async () => {
    for (let round = 0; round < 4; round++) {
      const h = await freshHiring(); const s = (await submit(aarav, h.id)).body
      const [a, c] = await Promise.all([approve(technova, h.id, s.id), technova.post(H(h.id, '/cancel')).send({ reason: 'Priorities changed for this project.' })])
      expect([a.status, c.status].sort(), `round ${round}`).toEqual([200, 409])
      const st = await state(h.id), [sub] = await rows(h.id)
      if (a.status === 200) expect([st.status, st.work_status, st.project, sub.status]).toEqual(['COMPLETED', 'APPROVED', 'COMPLETED', 'APPROVED'])
      else expect([st.status, st.project, sub.status]).toEqual(['CANCELLED', 'CANCELLED', 'SUBMITTED'])
    }
  })
  it('a submission racing a cancel: the cancel always lands, and the submission is either kept in the history or refused, never half-stored', async () => {
    for (let round = 0; round < 3; round++) {
      const h = await freshHiring()
      const [s, c] = await Promise.all([submit(aarav, h.id), technova.post(H(h.id, '/cancel')).send({ reason: 'Priorities changed for this project.' })])
      expect(c.status, `round ${round}`).toBe(200)
      expect([201, 409]).toContain(s.status)
      expect(await rows(h.id)).toHaveLength(s.status === 201 ? 1 : 0)
      expect((await state(h.id)).status).toBe('CANCELLED')
    }
  })
  it('many simultaneous messages are all stored, in a stable order, with one notification', async () => {
    const h = await freshHiring()
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? technova : aarav).post(H(h.id, '/messages')).send({ body: `Parallel ${i}` })))
    expect(res.every((r) => r.status === 201)).toBe(true)
    const list = (await aarav.get(H(h.id, '/messages'))).body
    expect(list).toHaveLength(8)
    expect((await technova.get(H(h.id, '/messages'))).body.map((m) => m.id)).toEqual(list.map((m) => m.id))   // same order for both sides
    expect((await db.query("SELECT count(*)::int AS n FROM notifications WHERE type = 'MESSAGE' AND link LIKE '%' || $1 AND NOT read", [h.id])).rows[0].n).toBe(2)   // exactly one unread notification per person, however many messages arrive at once
  })
})

describe('the whole journey, start to finish', () => {
  it('submit, ask for changes, resubmit, approve, then both review; history keeps every version', async () => {
    const h = await freshHiring()
    await aarav.post(H(h.id, '/messages')).send({ body: 'Starting work today.' })
    const v1 = (await submit(aarav, h.id, { title: 'Prototype', repoUrl: 'https://github.com/aarav/proto', liveUrl: undefined, description: undefined })).body
    await revise(technova, h.id, v1.id, 'The cart page crashes when it is empty; please fix.')
    const v2 = (await submit(aarav, h.id, { title: 'Fixed prototype', liveUrl: 'https://proto.example.com', description: 'Empty cart fixed and covered by a test.' })).body
    expect((await approve(technova, h.id, v2.id)).status).toBe(200)
    expect((await technova.post('/api/reviews').send({ hiringId: h.id, rating: 5, comment: 'Quick fixes and great communication.' })).status).toBe(201)
    const history = (await aarav.get(H(h.id, '/submissions'))).body
    expect(history.map((s) => [s.version, s.status, s.title, s.feedback])).toEqual([[2, 'APPROVED', 'Fixed prototype', null], [1, 'REVISION_REQUESTED', 'Prototype', 'The cart page crashes when it is empty; please fix.']])
    expect((await aarav.get(H(h.id))).body).toMatchObject({ status: 'COMPLETED', workStatus: 'APPROVED' })
  })
})
