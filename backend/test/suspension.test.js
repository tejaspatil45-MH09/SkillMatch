import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { db, idOf, loginAs } from './helpers.js'

let aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
const titles = (res) => res.body.map((p) => p.title)
const pid = (title) => idOf('SELECT id FROM projects WHERE title = $1', [title])
const prId = (email, title) => idOf('SELECT pr.id FROM proposals pr JOIN users u ON u.id = pr.freelancer_id JOIN projects p ON p.id = pr.project_id WHERE u.email = $1 AND p.title = $2', [email, title])
const setStatus = (who, action) => admin.post(`/api/admin/users/${who.user.id}/${action}`)
const future = (d) => new Date(Date.now() + d * 864e5).toISOString()
let n = 0
async function freshDemo(freelancer) {
  const p = await innovate.post('/api/projects').send({ title: `Suspension Demo ${++n}`, description: 'A throwaway project used to test suspension side effects.', budgetMin: 1000, budgetMax: 2000, deadline: future(30), skills: ['React'] })
  const proposal = (await freelancer.post(`/api/projects/${p.body.id}/proposals`).send({ coverLetter: 'I have shipped similar work before and can deliver this on time with clear communication.', bidAmount: 1500, estimatedDays: 10 })).body.id
  await innovate.post(`/api/proposals/${proposal}/shortlist`)
  return (await freelancer.post(`/api/proposals/${proposal}/demo`).send({ url: 'https://demo.example.com/suspension', description: 'A working prototype with sample data.' })).body.id
}

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('a suspended COMPANY: its projects disappear and stop taking proposals, until reinstated', () => {
  it('hides and blocks, without deleting anything', async () => {
    const before = titles(await aarav.get('/api/projects')), p1 = await pid('E-commerce Website'), p7 = await pid('Warehouse Route Optimizer')
    expect(before).toEqual(expect.arrayContaining(['E-commerce Website', 'Warehouse Route Optimizer']))
    expect((await setStatus(technova, 'suspend')).status).toBe(200)

    const after = await aarav.get('/api/projects')
    expect(titles(after)).toEqual(['Mobile App UI Redesign', 'Sales Forecasting Model'])   // TechNova's three are gone; others untouched
    expect((await aarav.get(`/api/projects/${p1}`)).status).toBe(404)                      // even for a freelancer who already applied
    expect((await admin.get(`/api/projects/${p1}`)).status).toBe(200)                      // admins still see everything
    const blocked = await priya.post(`/api/projects/${p7}/proposals`).send({ coverLetter: 'I have shipped similar work before and can deliver this on time.', bidAmount: 1500, estimatedDays: 10 })
    expect([blocked.status, blocked.body.code]).toEqual([409, 'INVALID_STATE'])
    expect((await aarav.post('/api/reports').send({ targetType: 'PROJECT', targetId: p1, reason: 'Reporting something I should no longer be able to see.' })).status).toBe(404)
    expect((await aarav.get('/api/freelancer/dashboard')).body.opportunities.map((p) => p.title)).toEqual(['Mobile App UI Redesign', 'Sales Forecasting Model'])
    expect((await aarav.get('/api/proposals/mine')).body.map((p) => p.project.title)).toContain('E-commerce Website')   // their own record remains
    expect((await db.query("SELECT 1 FROM projects WHERE company_id = $1 AND status = 'OPEN'", [technova.user.id])).rowCount).toBe(3)   // nothing was deleted or closed

    expect((await setStatus(technova, 'reinstate')).status).toBe(200)
    expect(titles(await aarav.get('/api/projects'))).toEqual(before)                       // exactly as it was
    expect((await aarav.get(`/api/projects/${p1}`)).status).toBe(200)
    technova = await loginAs('hr@technova.dev')
    expect((await priya.post(`/api/projects/${p7}/proposals`).send({ coverLetter: 'I have shipped similar work before and can deliver this on time.', bidAmount: 1500, estimatedDays: 10 })).status).toBe(201)
  })
})

describe('a suspended FREELANCER: their proposals vanish for companies and cannot be acted on, until reinstated', () => {
  it('hides, blocks and restores', async () => {
    const p7 = await pid('Warehouse Route Optimizer'), pr9 = await prId('rohan@skillmatch.dev', 'Warehouse Route Optimizer')
    const names = async () => (await technova.get(`/api/projects/${p7}/proposals`)).body.map((p) => p.freelancer.name)
    const dash = async () => (await technova.get('/api/company/dashboard')).body
    expect(await names()).toContain('Rohan Patil')
    const received = (await dash()).receivedProposals

    await setStatus(rohan, 'suspend')
    expect(await names()).not.toContain('Rohan Patil')
    expect((await technova.get('/api/company/proposals')).body.map((p) => p.freelancer.name)).not.toContain('Rohan Patil')
    expect((await dash()).receivedProposals).toBe(received - 1)
    expect((await technova.get(`/api/proposals/${pr9}`)).status).toBe(404)
    for (const action of ['shortlist', 'reject', 'accept']) expect((await technova.post(`/api/proposals/${pr9}/${action}`)).status, action).toBe(404)
    expect((await db.query('SELECT status FROM proposals WHERE id = $1', [pr9])).rows[0].status).toBe('PENDING')   // untouched
    expect((await admin.get(`/api/proposals/${pr9}`)).status).toBe(200)                                            // admins can still see it
    expect((await innovate.get(`/api/projects/${await pid('Sales Forecasting Model')}/proposals`)).body).toEqual([])   // Rohan's shortlisted proposal on the forecasting project

    await setStatus(rohan, 'reinstate')
    expect(await names()).toContain('Rohan Patil')
    expect((await dash()).receivedProposals).toBe(received)
    expect((await technova.post(`/api/proposals/${pr9}/shortlist`)).status).toBe(200)
  })
  it("a suspended freelancer's demo cannot be opened (and the view is not used up), but works again after reinstatement", async () => {
    const demoId = await freshDemo(priya)
    await setStatus(priya, 'suspend')
    const r = await innovate.post(`/api/demos/${demoId}/access`)
    expect([r.status, r.body.code]).toEqual([410, 'DEMO_UNAVAILABLE'])
    expect((await db.query('SELECT viewed_at FROM demos WHERE id = $1', [demoId])).rows[0].viewed_at).toBeNull()
    await setStatus(priya, 'reinstate')
    expect((await innovate.post(`/api/demos/${demoId}/access`)).status).toBe(200)
  })
  it('a company can still close out a hiring with a freelancer who was suspended', async () => {
    const h1 = await idOf("SELECT h.id FROM hirings h JOIN projects p ON p.id = h.project_id WHERE p.title = 'Billing Microservice'")
    await setStatus(kunal, 'suspend')
    expect((await innovate.get('/api/hirings')).body.map((h) => h.id)).toContain(h1)
    expect((await innovate.post(`/api/hirings/${h1}/complete`)).status).toBe(200)
    await setStatus(kunal, 'reinstate')
  })
})
