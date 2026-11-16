import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, idOf, loginAs } from './helpers.js'

let aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
// Re-seeding recreates every user (new ids), which correctly invalidates old sessions, so log in again afterwards
async function freshData() {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
}
beforeAll(freshData)

describe('notifications', () => {
  it('lists only your own, newest first, in the shape the frontend expects', async () => {
    const res = await aarav.get('/api/notifications')
    expect(res.status).toBe(200)
    expect(res.body.map((n) => n.message)).toEqual([
      'Your proposal for "E-commerce Website" has been shortlisted.',
      'Your proposal for "Inventory Management Dashboard" has been shortlisted.',
      'Project "Company Portfolio Website" has been marked completed.',
    ])
    expect(res.body[0]).toEqual({ id: expect.any(String), userId: aarav.user.id, type: 'SHORTLISTED', message: expect.any(String), link: expect.stringMatching(/^\/freelancer\/proposals\//), read: false, createdAt: expect.any(String) })
    expect(res.body.filter((n) => !n.read)).toHaveLength(2)
    expect((await priya.get('/api/notifications')).body).toEqual([])
    expect(res.body.every((n) => n.userId === aarav.user.id)).toBe(true)
  })
  it('requires login', async () => expect((await request(app).get('/api/notifications')).status).toBe(401))
  it('marks one as read; other people\'s notifications look like they do not exist', async () => {
    const mine = (await aarav.get('/api/notifications')).body[0]
    const read = await aarav.post(`/api/notifications/${mine.id}/read`)
    expect(read.status).toBe(200); expect(read.body).toMatchObject({ id: mine.id, read: true })
    const theirs = await idOf("SELECT n.id FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'hr@technova.dev' LIMIT 1")
    expect((await aarav.post(`/api/notifications/${theirs}/read`)).status).toBe(404)
    expect((await db.query('SELECT read FROM notifications WHERE id = $1', [theirs])).rows[0].read).toBe(false)   // untouched
    expect((await aarav.post('/api/notifications/not-a-uuid/read')).status).toBe(404)
    expect((await request(app).post(`/api/notifications/${mine.id}/read`)).status).toBe(401)
  })
  it('read-all affects only the caller', async () => {
    const unreadFor = async (email) => Number((await db.query('SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND NOT n.read', [email])).rows[0].count)
    const technovaBefore = await unreadFor('hr@technova.dev')
    expect(technovaBefore).toBeGreaterThan(0)
    expect((await aarav.post('/api/notifications/read-all')).body).toEqual({ ok: true })
    expect(await unreadFor('aarav@skillmatch.dev')).toBe(0)
    expect(await unreadFor('hr@technova.dev')).toBe(technovaBefore)
  })
})

describe('freelancer dashboard', () => {
  beforeAll(freshData)   // the notification tests above changed read flags
  it('counts proposals and hirings and recommends the best unapplied projects', async () => {
    const res = await aarav.get('/api/freelancer/dashboard')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ profileCompletion: 100, activeProposals: 0, shortlisted: 2, activeProjects: 0, completedProjects: 1 })
    expect(res.body.opportunities.map((p) => p.title)).toEqual(['Warehouse Route Optimizer', 'Mobile App UI Redesign', 'Sales Forecasting Model'])   // not the two already applied to
    expect(res.body.opportunities.every((p) => p.hasApplied === false && typeof p.skillMatch === 'number')).toBe(true)
    expect(res.body.notifications).toHaveLength(3)
  })
  it('opportunities are ranked by skill match', async () => {
    const r = await rohan.get('/api/freelancer/dashboard')
    expect(r.body.opportunities.map((p) => [p.title, p.skillMatch])).toEqual([['E-commerce Website', 33], ['Inventory Management Dashboard', 25], ['Mobile App UI Redesign', 0]])
    expect(r.body).toMatchObject({ activeProposals: 1, shortlisted: 1 })
    const k = await kunal.get('/api/freelancer/dashboard')
    expect(k.body).toMatchObject({ profileCompletion: 83, activeProjects: 1, completedProjects: 0 })   // no portfolio yet: 5 of 6 checks
    expect(k.body.opportunities.map((p) => [p.title, p.skillMatch])).toEqual([['Warehouse Route Optimizer', 50], ['Inventory Management Dashboard', 25], ['Mobile App UI Redesign', 0]])
  })
  it('is for freelancers only', async () => {
    expect((await technova.get('/api/freelancer/dashboard')).status).toBe(403)
    expect((await admin.get('/api/freelancer/dashboard')).status).toBe(403)
    expect((await request(app).get('/api/freelancer/dashboard')).status).toBe(401)
  })
})

describe('company dashboard', () => {
  it('counts projects, proposals and hirings per company, with recent activity newest first', async () => {
    const t = await technova.get('/api/company/dashboard')
    expect(t.status).toBe(200)
    expect(t.body).toMatchObject({ activeProjects: 0, openProjects: 3, receivedProposals: 5, shortlisted: 2, activeHirings: 0, completedProjects: 0 })
    expect(t.body.recentActivity.map((n) => n.type)).toEqual(['DEMO', 'PROPOSAL'])
    expect((await innovate.get('/api/company/dashboard')).body).toMatchObject({ activeProjects: 1, openProjects: 1, receivedProposals: 2, shortlisted: 1, activeHirings: 1, completedProjects: 0 })
    expect((await pixelcraft.get('/api/company/dashboard')).body).toMatchObject({ activeProjects: 0, openProjects: 1, receivedProposals: 2, shortlisted: 1, activeHirings: 0, completedProjects: 1 })
  })
  it('only counts a company\'s own data', async () => {
    const total = Number((await db.query('SELECT count(*) FROM proposals')).rows[0].count)
    const sum = (await Promise.all([technova, pixelcraft, innovate].map((c) => c.get('/api/company/dashboard')))).reduce((s, r) => s + r.body.receivedProposals, 0)
    expect(sum).toBe(total)   // every proposal belongs to exactly one company's dashboard
  })
  it('is for companies only', async () => {
    expect((await aarav.get('/api/company/dashboard')).status).toBe(403)
    expect((await admin.get('/api/company/dashboard')).status).toBe(403)
    expect((await request(app).get('/api/company/dashboard')).status).toBe(401)
  })
})
