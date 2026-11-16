import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, idOf, loginAs } from './helpers.js'

let aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
const pid = (title) => idOf('SELECT id FROM projects WHERE title = $1', [title])
const prop = (email, title) => idOf('SELECT pr.id FROM proposals pr JOIN users u ON u.id = pr.freelancer_id JOIN projects p ON p.id = pr.project_id WHERE u.email = $1 AND p.title = $2', [email, title])
const status = async (id) => (await db.query('SELECT status FROM proposals WHERE id = $1', [id])).rows[0].status
const projectStatus = async (id) => (await db.query('SELECT status FROM projects WHERE id = $1', [id])).rows[0].status
const hiringCount = async (projectId) => Number((await db.query('SELECT count(*) FROM hirings WHERE project_id = $1', [projectId])).rows[0].count)
const lastNotification = async (email, type) => (await db.query('SELECT n.message, n.link FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = $2 ORDER BY n.created_at DESC LIMIT 1', [email, type])).rows[0]
const countNotifications = async (email, type) => Number((await db.query('SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = $2', [email, type])).rows[0].count)
const letter = 'I have shipped similar work before and can deliver this project on time with clear communication.'
const bid = (over = {}) => ({ coverLetter: letter, bidAmount: 40000, estimatedDays: 20, ...over })
const future = (d) => new Date(Date.now() + d * 864e5).toISOString()
const newProject = async (title = 'Concurrency Test Project') => (await technova.post('/api/projects').send({ title, description: 'A throwaway project used to test simultaneous actions safely.', budgetMin: 1000, budgetMax: 2000, deadline: future(30), skills: ['React'] })).body.id
const submit = (who, projectId, over) => who.post(`/api/projects/${projectId}/proposals`).send(bid(over))

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('submitting a proposal', () => {
  it('creates a PENDING proposal, returns the full view and notifies the company', async () => {
    const p7 = await pid('Warehouse Route Optimizer')
    const res = await submit(aarav, p7)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'PENDING', bidAmount: 40000, estimatedDays: 20, skillMatch: 0, demo: null, projectId: p7, freelancerId: aarav.user.id })
    expect(res.body.project).toMatchObject({ title: 'Warehouse Route Optimizer', status: 'OPEN', companyName: 'TechNova Solutions', skills: ['C++', 'Python'] })
    expect(res.body.freelancer).toMatchObject({ name: 'Aarav Sharma', headline: 'Full-stack developer' })
    expect(await lastNotification('hr@technova.dev', 'PROPOSAL')).toEqual({ message: 'Aarav Sharma submitted a proposal for "Warehouse Route Optimizer".', link: `/company/projects/${p7}/proposals` })
  })
  it('only one proposal per project, even when asked twice at once', async () => {
    expect((await submit(aarav, await pid('E-commerce Website'))).body.code).toBe('DUPLICATE_PROPOSAL')       // already applied in the seed
    expect((await submit(aarav, await pid('Warehouse Route Optimizer'))).status).toBe(409)                      // and the one just made
    const p4 = await pid('Sales Forecasting Model')
    const rs = await Promise.all([submit(priya, p4), submit(priya, p4), submit(priya, p4)])
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409])
    expect(rs.filter((r) => r.status === 409).every((r) => r.body.code === 'DUPLICATE_PROPOSAL')).toBe(true)
    expect(Number((await db.query('SELECT count(*) FROM proposals WHERE project_id = $1 AND freelancer_id = $2', [p4, priya.user.id])).rows[0].count)).toBe(1)
  })
  it('validates input and rejects fields a client must never set', async () => {
    const p3 = await pid('Mobile App UI Redesign')
    const before = Number((await db.query('SELECT count(*) FROM proposals')).rows[0].count)
    for (const over of [{ coverLetter: 'too short' }, { coverLetter: 'x'.repeat(2001) }, { bidAmount: 0 }, { bidAmount: 1.5 }, { bidAmount: 1e10 }, { bidAmount: '5000' }, { estimatedDays: 0 }, { estimatedDays: 366 }, { estimatedDays: 2.5 },
      { status: 'ACCEPTED' }, { freelancerId: kunal.user.id }, { projectId: p3 }])
      expect((await submit(rohan, p3, over)).status, JSON.stringify(over)).toBe(400)
    expect(Number((await db.query('SELECT count(*) FROM proposals')).rows[0].count)).toBe(before)
  })
  it('refuses closed projects, unknown projects, other roles and anonymous callers', async () => {
    const r1 = await submit(priya, await pid('Billing Microservice'))
    expect(r1.status).toBe(409); expect(r1.body.code).toBe('INVALID_STATE')
    expect((await submit(priya, await pid('Customer Support Chatbot Backend'))).status).toBe(409)
    expect((await submit(priya, '00000000-0000-0000-0000-000000000000')).status).toBe(404)
    expect((await submit(priya, 'nope')).status).toBe(404)
    const p3 = await pid('Mobile App UI Redesign')
    expect((await submit(technova, p3)).status).toBe(403)
    expect((await submit(admin, p3)).status).toBe(403)
    expect((await request(app).post(`/api/projects/${p3}/proposals`).send(bid())).status).toBe(401)
  })
  it('submitting while the company closes the project never leaves a live proposal on a closed project', async () => {
    for (let i = 0; i < 6; i++) {
      const id = await newProject(`Close Race ${i}`)
      const [s, c] = await Promise.all([submit(aarav, id), technova.post(`/api/projects/${id}/close`)])
      expect(c.status).toBe(200)
      expect([201, 409]).toContain(s.status)
      expect(await projectStatus(id)).toBe('CANCELLED')
      const live = await db.query("SELECT 1 FROM proposals WHERE project_id = $1 AND status IN ('PENDING', 'SHORTLISTED')", [id])
      expect(live.rowCount, `iteration ${i}`).toBe(0)
    }
  })
})

describe('reading proposals', () => {
  it("a freelancer sees only their own, newest first; companies can't use this endpoint", async () => {
    const mine = await aarav.get('/api/proposals/mine')
    expect(mine.status).toBe(200)
    expect(mine.body.every((p) => p.freelancerId === aarav.user.id)).toBe(true)
    expect(mine.body.map((p) => p.project.title)).toContain('E-commerce Website')
    const dates = mine.body.map((p) => Date.parse(p.createdAt)); expect(dates).toEqual([...dates].sort((a, b) => b - a))
    expect((await technova.get('/api/proposals/mine')).status).toBe(403)
    expect((await request(app).get('/api/proposals/mine')).status).toBe(401)
  })
  it('a company sees its project proposals ranked by skill match, with rich freelancer data and demo METADATA only', async () => {
    const res = await technova.get(`/api/projects/${await pid('E-commerce Website')}/proposals`)
    expect(res.status).toBe(200)
    expect(res.body.map((p) => [p.freelancer.name, p.skillMatch])).toEqual([['Aarav Sharma', 100], ['Priya Deshmukh', 33], ['Kunal Joshi', 33]])
    const a = res.body[0]
    expect(a.freelancer).toMatchObject({ headline: 'Full-stack developer', experienceYears: 3, rating: 5, reviewCount: 1 })
    expect(a.freelancer.skills).toContain('React'); expect(a.freelancer.portfolio.map((p) => p.title)).toEqual(['Kirana Cart', 'Clinic Booking Portal'])
    expect(a).toMatchObject({ viewerIsOwner: true, project: { companyName: 'TechNova Solutions' } })
    expect(a.demo).toMatchObject({ status: 'AVAILABLE' })
    expect(a.demo).not.toHaveProperty('url'); expect(a.demo).not.toHaveProperty('description')   // the secret never travels in a list
    expect(JSON.stringify(res.body)).not.toContain('demo.example.com')
  })
  it("the freelancer sees their own demo description; the company and admins don't", async () => {
    const pr1 = await prop('aarav@skillmatch.dev', 'E-commerce Website')
    expect((await aarav.get(`/api/proposals/${pr1}`)).body.demo.description).toContain('Working cart')
    expect((await technova.get(`/api/proposals/${pr1}`)).body.demo).not.toHaveProperty('description')
    expect((await admin.get(`/api/proposals/${pr1}`)).body.demo).not.toHaveProperty('description')
  })
  it('only participants (and admins) can open a proposal', async () => {
    const pr1 = await prop('aarav@skillmatch.dev', 'E-commerce Website')
    for (const [who, status] of [[aarav, 200], [technova, 200], [admin, 200], [priya, 403], [pixelcraft, 403]]) expect((await who.get(`/api/proposals/${pr1}`)).status, who.user.name).toBe(status)
    expect((await request(app).get(`/api/proposals/${pr1}`)).status).toBe(401)
    expect((await aarav.get('/api/proposals/not-a-uuid')).status).toBe(404)
    expect((await aarav.get('/api/proposals/00000000-0000-0000-0000-000000000000')).status).toBe(404)
  })
  it("one company can't list another's proposals, and the inbox spans all of a company's projects", async () => {
    const p1 = await pid('E-commerce Website')
    expect((await pixelcraft.get(`/api/projects/${p1}/proposals`)).status).toBe(403)
    expect((await aarav.get(`/api/projects/${p1}/proposals`)).status).toBe(403)
    expect((await technova.get('/api/projects/00000000-0000-0000-0000-000000000000/proposals')).status).toBe(404)
    const inbox = (await technova.get('/api/company/proposals')).body
    const expected = Number((await db.query('SELECT count(*) FROM proposals pr JOIN projects p ON p.id = pr.project_id WHERE p.company_id = $1', [technova.user.id])).rows[0].count)
    expect(inbox).toHaveLength(expected)
    expect(expected).toBeGreaterThanOrEqual(6)   // at least the seeded five plus Aarav's new one on the route optimizer
    expect(inbox.map((p) => p.project.title)).toEqual(expect.arrayContaining(['E-commerce Website', 'Inventory Management Dashboard', 'Warehouse Route Optimizer']))
    expect(new Set(inbox.map((p) => p.project.companyName))).toEqual(new Set(['TechNova Solutions']))
    expect((await aarav.get('/api/company/proposals')).status).toBe(403)
  })
})

describe('shortlist, reject, withdraw', () => {
  it('shortlist: only the owning company, only PENDING, and the freelancer is notified', async () => {
    const pr2 = await prop('priya@skillmatch.dev', 'E-commerce Website')
    expect((await pixelcraft.post(`/api/proposals/${pr2}/shortlist`)).status).toBe(403)
    expect((await priya.post(`/api/proposals/${pr2}/shortlist`)).status).toBe(403)
    const res = await technova.post(`/api/proposals/${pr2}/shortlist`)
    expect(res.status).toBe(200); expect(res.body.status).toBe('SHORTLISTED')
    expect(await lastNotification('priya@skillmatch.dev', 'SHORTLISTED')).toEqual({ message: 'Your proposal for "E-commerce Website" has been shortlisted.', link: `/freelancer/proposals/${pr2}` })
    expect((await technova.post(`/api/proposals/${pr2}/shortlist`)).body.code).toBe('INVALID_STATE')                                    // again
    expect((await technova.post(`/api/proposals/${await prop('kunal@skillmatch.dev', 'E-commerce Website')}/shortlist`)).status).toBe(409)  // rejected one
    expect((await technova.post('/api/proposals/not-a-uuid/shortlist')).status).toBe(404)
  })
  it('reject: PENDING or SHORTLISTED only, with a notification', async () => {
    const mine = await prop('aarav@skillmatch.dev', 'Warehouse Route Optimizer')
    expect((await technova.post(`/api/proposals/${mine}/reject`)).body.status).toBe('REJECTED')
    expect(await lastNotification('aarav@skillmatch.dev', 'REJECTED')).toEqual({ message: 'Your proposal for "Warehouse Route Optimizer" has been rejected.', link: `/freelancer/proposals/${mine}` })
    expect((await technova.post(`/api/proposals/${mine}/reject`)).status).toBe(409)
    expect((await pixelcraft.post(`/api/proposals/${await prop('aarav@skillmatch.dev', 'Company Portfolio Website')}/reject`)).status).toBe(409)   // accepted: can't be rejected
  })
  it('withdraw: only your own, only PENDING or SHORTLISTED; a withdrawn proposal is dead', async () => {
    const pr9 = await prop('rohan@skillmatch.dev', 'Warehouse Route Optimizer')
    expect((await aarav.post(`/api/proposals/${pr9}/withdraw`)).status).toBe(403)
    expect((await technova.post(`/api/proposals/${pr9}/withdraw`)).status).toBe(403)
    expect((await rohan.post(`/api/proposals/${pr9}/withdraw`)).body.status).toBe('WITHDRAWN')
    expect((await rohan.post(`/api/proposals/${pr9}/withdraw`)).status).toBe(409)
    expect((await technova.post(`/api/proposals/${pr9}/shortlist`)).status).toBe(409)
    expect((await aarav.post(`/api/proposals/${await prop('aarav@skillmatch.dev', 'Company Portfolio Website')}/withdraw`)).status).toBe(409)   // accepted
    expect((await priya.post(`/api/proposals/${await prop('priya@skillmatch.dev', 'Mobile App UI Redesign')}/withdraw`)).body.status).toBe('WITHDRAWN')   // shortlisted can withdraw too
  })
})

describe('accepting (hiring)', () => {
  it('only shortlisted proposals, only by the owning company', async () => {
    const pr3 = await prop('kunal@skillmatch.dev', 'E-commerce Website'), pr1 = await prop('aarav@skillmatch.dev', 'E-commerce Website')
    const r = await technova.post(`/api/proposals/${pr3}/accept`)   // rejected
    expect(r.status).toBe(409); expect(r.body.code).toBe('INVALID_STATE')
    expect((await pixelcraft.post(`/api/proposals/${pr1}/accept`)).status).toBe(403)
    expect((await aarav.post(`/api/proposals/${pr1}/accept`)).status).toBe(403)
    expect((await request(app).post(`/api/proposals/${pr1}/accept`)).status).toBe(401)
    expect(await status(pr1)).toBe('SHORTLISTED')   // nothing happened
  })
  it('one transaction: accepts it, rejects every other live proposal, starts the project, creates the hiring, notifies everyone concerned', async () => {
    const p1 = await pid('E-commerce Website')
    const [pr1, pr2, pr3] = await Promise.all(['aarav', 'priya', 'kunal'].map((n) => prop(`${n}@skillmatch.dev`, 'E-commerce Website')))
    const kunalBefore = await countNotifications('kunal@skillmatch.dev', 'REJECTED')
    const res = await technova.post(`/api/proposals/${pr1}/accept`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ACTIVE', proposalId: pr1, projectId: p1, completedAt: null, project: { title: 'E-commerce Website' }, freelancer: { name: 'Aarav Sharma' }, company: { name: 'TechNova Solutions' }, reviews: [] })
    expect([await status(pr1), await status(pr2), await status(pr3)]).toEqual(['ACCEPTED', 'REJECTED', 'REJECTED'])
    expect(await projectStatus(p1)).toBe('IN_PROGRESS'); expect(await hiringCount(p1)).toBe(1)
    expect(await lastNotification('aarav@skillmatch.dev', 'HIRED')).toEqual({ message: 'You have been hired for "E-commerce Website".', link: '/freelancer/hirings' })
    expect((await lastNotification('priya@skillmatch.dev', 'REJECTED')).message).toBe('Your proposal for "E-commerce Website" has been rejected.')
    expect(await countNotifications('kunal@skillmatch.dev', 'REJECTED')).toBe(kunalBefore)   // already rejected: no second notification
  })
  it('afterwards the project is closed to further action', async () => {
    const p1 = await pid('E-commerce Website'), pr1 = await prop('aarav@skillmatch.dev', 'E-commerce Website')
    expect((await technova.post(`/api/proposals/${pr1}/accept`)).status).toBe(409)
    expect((await submit(rohan, p1)).body.code).toBe('INVALID_STATE')
    expect((await technova.post(`/api/projects/${p1}/close`)).status).toBe(409)
    expect((await aarav.get('/api/projects')).body.map((p) => p.id)).not.toContain(p1)
  })
})

describe('concurrency: simultaneous actions never corrupt state', () => {
  const hiringMatchesStatus = async (proposalId) => {
    const hired = (await db.query('SELECT 1 FROM hirings WHERE proposal_id = $1', [proposalId])).rowCount === 1
    expect(hired).toBe((await status(proposalId)) === 'ACCEPTED')
  }
  it('two proposals accepted at the same moment: exactly one hire', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await newProject(`Double Accept ${i}`)
      const a = (await submit(aarav, id)).body.id, b = (await submit(priya, id)).body.id
      await technova.post(`/api/proposals/${a}/shortlist`); await technova.post(`/api/proposals/${b}/shortlist`)
      const rs = await Promise.all([technova.post(`/api/proposals/${a}/accept`), technova.post(`/api/proposals/${b}/accept`)])
      expect(rs.map((r) => r.status).sort(), `iteration ${i}`).toEqual([200, 409])
      expect(await hiringCount(id)).toBe(1)
      expect([await status(a), await status(b)].sort()).toEqual(['ACCEPTED', 'REJECTED'])
      expect(await projectStatus(id)).toBe('IN_PROGRESS')
    }
  })
  it('accepting while rejecting the same proposal: one wins, state stays consistent', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await newProject(`Accept Vs Reject ${i}`)
      const a = (await submit(aarav, id)).body.id
      await technova.post(`/api/proposals/${a}/shortlist`)
      const rs = await Promise.all([technova.post(`/api/proposals/${a}/accept`), technova.post(`/api/proposals/${a}/reject`)])
      expect(rs.map((r) => r.status).sort(), `iteration ${i}`).toEqual([200, 409])
      await hiringMatchesStatus(a)
      expect(await projectStatus(id)).toBe((await status(a)) === 'ACCEPTED' ? 'IN_PROGRESS' : 'OPEN')
    }
  })
  it('accepting while the freelancer withdraws: one wins, state stays consistent', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await newProject(`Accept Vs Withdraw ${i}`)
      const a = (await submit(aarav, id)).body.id
      await technova.post(`/api/proposals/${a}/shortlist`)
      const rs = await Promise.all([technova.post(`/api/proposals/${a}/accept`), aarav.post(`/api/proposals/${a}/withdraw`)])
      expect(rs.map((r) => r.status).sort(), `iteration ${i}`).toEqual([200, 409])
      await hiringMatchesStatus(a)
    }
  })
  it('accepting while another proposal is being shortlisted never strands a live proposal on a started project', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await newProject(`Accept Vs Shortlist ${i}`)
      const a = (await submit(aarav, id)).body.id, b = (await submit(priya, id)).body.id
      await technova.post(`/api/proposals/${a}/shortlist`)
      await Promise.all([technova.post(`/api/proposals/${a}/accept`), technova.post(`/api/proposals/${b}/shortlist`)])
      expect(await projectStatus(id)).toBe('IN_PROGRESS')
      expect(await status(b), `iteration ${i}`).toBe('REJECTED')   // whichever order they ran in
      expect((await db.query("SELECT 1 FROM proposals WHERE project_id = $1 AND status IN ('PENDING','SHORTLISTED')", [id])).rowCount).toBe(0)
    }
  })
})
