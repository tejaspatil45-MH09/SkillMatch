import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, idOf, loginAs } from './helpers.js'

let aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
const future = (d) => new Date(Date.now() + d * 864e5).toISOString()
const letter = 'I have shipped similar work before and can deliver this project on time with clear communication.'
const hiringOf = (email, title) => idOf('SELECT h.id FROM hirings h JOIN users u ON u.id = h.freelancer_id JOIN projects p ON p.id = h.project_id WHERE u.email = $1 AND p.title = $2', [email, title])
const hiringStatus = async (id) => (await db.query('SELECT status FROM hirings WHERE id = $1', [id])).rows[0].status
const projectStatusOf = async (hiringId) => (await db.query('SELECT p.status FROM hirings h JOIN projects p ON p.id = h.project_id WHERE h.id = $1', [hiringId])).rows[0].status
const countNotifications = async (email, type) => Number((await db.query('SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = $2', [email, type])).rows[0].count)
const lastNote = async (email, type) => (await db.query('SELECT message, link FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = $2 ORDER BY n.created_at DESC, n.id LIMIT 1', [email, type])).rows[0]
let n = 0
// A brand-new ACTIVE hiring: TechNova posts, the freelancer applies, TechNova shortlists and accepts
async function freshHiring(freelancer = aarav) {
  const p = await technova.post('/api/projects').send({ title: `Hiring Test Project ${++n}`, description: 'A throwaway project used to test hirings and reviews safely.', budgetMin: 1000, budgetMax: 2000, deadline: future(30), skills: ['React'] })
  const prId = (await freelancer.post(`/api/projects/${p.body.id}/proposals`).send({ coverLetter: letter, bidAmount: 1500, estimatedDays: 10 })).body.id
  await technova.post(`/api/proposals/${prId}/shortlist`)
  const hiring = (await technova.post(`/api/proposals/${prId}/accept`)).body
  return { id: hiring.id, projectId: p.body.id, title: `Hiring Test Project ${n}` }
}
const review = (who, hiringId, over = {}) => who.post('/api/reviews').send({ hiringId, rating: 5, comment: 'Clear communication and quality work throughout.', ...over })

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('listing hirings', () => {
  it('each side sees only its own, with the project, both parties and any reviews', async () => {
    const mine = await aarav.get('/api/hirings')
    expect(mine.status).toBe(200); expect(mine.body).toHaveLength(1)
    expect(mine.body[0]).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(String), cancelReason: null, project: { title: 'Company Portfolio Website' }, freelancer: { name: 'Aarav Sharma' }, company: { name: 'PixelCraft Technologies' } })
    expect(mine.body[0].reviews).toEqual([expect.objectContaining({ reviewerId: pixelcraft.user.id, revieweeId: aarav.user.id, rating: 5 })])
    const k = (await kunal.get('/api/hirings')).body[0]
    expect(k).toMatchObject({ status: 'ACTIVE', completedAt: null, cancelReason: null, project: { title: 'Billing Microservice' }, reviews: [] })
    expect((await pixelcraft.get('/api/hirings')).body.map((h) => h.id)).toEqual([mine.body[0].id])
    expect((await innovate.get('/api/hirings')).body.map((h) => h.id)).toEqual([k.id])
    expect((await technova.get('/api/hirings')).body).toEqual([])
    expect((await rohan.get('/api/hirings')).body).toEqual([])
  })
  it('is for freelancers and companies only', async () => {
    expect((await admin.get('/api/hirings')).status).toBe(403)
    expect((await request(app).get('/api/hirings')).status).toBe(401)
  })
})

describe('completing a project', () => {
  it('only the hiring company may, and unknown ids are 404', async () => {
    const h1 = await hiringOf('kunal@skillmatch.dev', 'Billing Microservice')
    for (const who of [kunal, technova, pixelcraft]) { const r = await who.post(`/api/hirings/${h1}/complete`); expect(r.status, who.user.name).toBe(403) }
    expect((await kunal.post(`/api/hirings/${h1}/complete`)).status).toBe(403)
    expect((await request(app).post(`/api/hirings/${h1}/complete`)).status).toBe(401)
    expect((await innovate.post('/api/hirings/00000000-0000-0000-0000-000000000000/complete')).status).toBe(404)
    expect((await innovate.post('/api/hirings/nope/complete')).status).toBe(404)
    expect(await hiringStatus(h1)).toBe('ACTIVE')
  })
  it('completes the hiring AND the project, and tells the freelancer', async () => {
    const h1 = await hiringOf('kunal@skillmatch.dev', 'Billing Microservice')
    const res = await innovate.post(`/api/hirings/${h1}/complete`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(String), project: { title: 'Billing Microservice' } })
    expect(await projectStatusOf(h1)).toBe('COMPLETED')
    expect(await lastNote('kunal@skillmatch.dev', 'COMPLETED')).toEqual({ message: 'Project "Billing Microservice" has been marked completed.', link: '/freelancer/hirings' })
    const again = await innovate.post(`/api/hirings/${h1}/complete`)
    expect(again.status).toBe(409); expect(again.body.code).toBe('INVALID_STATE')
    expect((await innovate.post(`/api/hirings/${h1}/cancel`).send({ reason: 'Changed my mind afterwards.' })).status).toBe(409)
  })
  it('six simultaneous completions: exactly one wins and the freelancer is notified once', async () => {
    for (let i = 0; i < 3; i++) {
      const h = await freshHiring(rohan)
      const before = await countNotifications('rohan@skillmatch.dev', 'COMPLETED')
      const rs = await Promise.all(Array.from({ length: 6 }, () => technova.post(`/api/hirings/${h.id}/complete`)))
      expect(rs.map((r) => r.status).sort(), `iteration ${i}`).toEqual([200, 409, 409, 409, 409, 409])
      expect(await countNotifications('rohan@skillmatch.dev', 'COMPLETED')).toBe(before + 1)
      expect(await projectStatusOf(h.id)).toBe('COMPLETED')
    }
  })
})

describe('cancelling a hiring', () => {
  it('needs a real reason and rejects extra fields', async () => {
    const h = await freshHiring()
    for (const body of [{}, { reason: '' }, { reason: 'short' }, { reason: 'x'.repeat(501) }, { reason: 'A perfectly good reason here', status: 'COMPLETED' }])
      expect((await technova.post(`/api/hirings/${h.id}/cancel`).send(body)).status, JSON.stringify(body).slice(0, 50)).toBe(400)
    expect(await hiringStatus(h.id)).toBe('ACTIVE')
  })
  it('only the hiring company; cancelling also cancels the project and tells the freelancer', async () => {
    const h = await freshHiring()
    const body = { reason: '  Scope was put on hold internally.  ' }
    for (const who of [aarav, pixelcraft, admin]) expect((await who.post(`/api/hirings/${h.id}/cancel`).send(body)).status, who.user.name).toBe(403)
    const res = await technova.post(`/api/hirings/${h.id}/cancel`).send(body)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Scope was put on hold internally.', completedAt: null })
    expect(await projectStatusOf(h.id)).toBe('CANCELLED')
    expect(await lastNote('aarav@skillmatch.dev', 'CANCELLED')).toEqual({ message: `Your hiring for "${h.title}" was cancelled.`, link: '/freelancer/hirings' })
    expect((await technova.post(`/api/hirings/${h.id}/cancel`).send(body)).status).toBe(409)
    expect((await technova.post(`/api/hirings/${h.id}/complete`)).status).toBe(409)
    expect((await aarav.get('/api/hirings')).body.find((x) => x.id === h.id).cancelReason).toBe('Scope was put on hold internally.')   // the freelancer sees why
  })
  it('completing and cancelling at the same moment: one wins and project/hiring never disagree', async () => {
    for (let i = 0; i < 4; i++) {
      const h = await freshHiring()
      const rs = await Promise.all([technova.post(`/api/hirings/${h.id}/complete`), technova.post(`/api/hirings/${h.id}/cancel`).send({ reason: 'Cancelling at the same instant.' })])
      expect(rs.map((r) => r.status).sort(), `iteration ${i}`).toEqual([200, 409])
      const status = await hiringStatus(h.id)
      expect(['COMPLETED', 'CANCELLED']).toContain(status)
      expect(await projectStatusOf(h.id)).toBe(status)
    }
  })
})

describe('reviews', () => {
  it('are impossible before completion, and after a cancellation', async () => {
    const active = await freshHiring()
    for (const who of [technova, aarav]) { const r = await review(who, active.id); expect(r.status).toBe(409); expect(r.body).toMatchObject({ code: 'INVALID_STATE', message: 'Reviews open after the project is completed.' }) }
    await technova.post(`/api/hirings/${active.id}/cancel`).send({ reason: 'No longer needed by the company.' })
    expect((await review(technova, active.id)).status).toBe(409)
    expect((await db.query('SELECT 1 FROM reviews WHERE hiring_id = $1', [active.id])).rowCount).toBe(0)
  })
  it('after completion each side reviews the other, once, and the other side is notified', async () => {
    const h = await freshHiring()
    await technova.post(`/api/hirings/${h.id}/complete`)
    const fromCompany = await review(technova, h.id, { rating: 4, comment: 'Solid work, delivered on the agreed date.' })
    expect(fromCompany.status).toBe(201)
    expect(fromCompany.body).toMatchObject({ hiringId: h.id, reviewerId: technova.user.id, revieweeId: aarav.user.id, rating: 4, comment: 'Solid work, delivered on the agreed date.' })
    expect(await lastNote('aarav@skillmatch.dev', 'REVIEW')).toEqual({ message: 'TechNova Solutions left you a 4-star review.', link: '/freelancer/profile' })
    const fromFreelancer = await review(aarav, h.id, { rating: 3, comment: 'Requirements changed a couple of times.' })
    expect(fromFreelancer.status).toBe(201); expect(fromFreelancer.body).toMatchObject({ reviewerId: aarav.user.id, revieweeId: technova.user.id })
    expect(await lastNote('hr@technova.dev', 'REVIEW')).toEqual({ message: 'Aarav Sharma left you a 3-star review.', link: '/company/profile' })
    const dup = await review(technova, h.id)
    expect(dup.status).toBe(409); expect(dup.body.code).toBe('DUPLICATE_REVIEW')
  })
  it('only the two parties may review, and unknown hirings are 404', async () => {
    const h = await freshHiring(); await technova.post(`/api/hirings/${h.id}/complete`)
    for (const who of [rohan, pixelcraft, innovate, admin]) expect((await review(who, h.id)).status, who.user.name).toBe(403)
    expect((await review(technova, '00000000-0000-0000-0000-000000000000')).status).toBe(404)
    expect((await review(technova, 'not-a-uuid')).status).toBe(400)
    expect((await request(app).post('/api/reviews').send({ hiringId: h.id, rating: 5, comment: 'Anonymous review attempt.' })).status).toBe(401)
    expect((await db.query('SELECT 1 FROM reviews WHERE hiring_id = $1', [h.id])).rowCount).toBe(0)
  })
  it('validates the rating and comment and refuses fields only the server may set', async () => {
    const h = await freshHiring(); await technova.post(`/api/hirings/${h.id}/complete`)
    const bad = [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: '5' }, { rating: undefined }, { comment: 'short' }, { comment: 'x'.repeat(501) }, { comment: undefined },
      { reviewerId: aarav.user.id }, { revieweeId: technova.user.id }, { createdAt: '2020-01-01T00:00:00Z' }]
    for (const over of bad) expect((await review(technova, h.id, over)).status, JSON.stringify(over)).toBe(400)
    expect((await db.query('SELECT 1 FROM reviews WHERE hiring_id = $1', [h.id])).rowCount).toBe(0)
  })
  it('feed the ratings shown on profiles and project cards', async () => {
    const a = await freshHiring(priya), b = await freshHiring(priya)
    for (const h of [a, b]) await technova.post(`/api/hirings/${h.id}/complete`)
    await review(technova, a.id, { rating: 4 }); await review(technova, b.id, { rating: 5 })
    const profile = (await technova.get(`/api/profiles/${priya.user.id}`)).body
    expect(profile).toMatchObject({ rating: 4.5, reviewCount: 2 })
    expect(profile.reviews.map((r) => [r.rating, r.reviewerName])).toEqual(expect.arrayContaining([[4, 'TechNova Solutions'], [5, 'TechNova Solutions']]))
    await review(priya, a.id, { rating: 2, comment: 'Late payments on the milestones.' })
    const avg = Number((await db.query('SELECT round(avg(rating), 1) AS r FROM reviews WHERE reviewee_id = $1', [technova.user.id])).rows[0].r)
    expect((await aarav.get('/api/projects')).body.find((p) => p.company.id === technova.user.id).company.rating).toBe(avg)
  })
  it('the same person reviewing six times at once: exactly one counts', async () => {
    const h = await freshHiring(); await technova.post(`/api/hirings/${h.id}/complete`)
    const rs = await Promise.all(Array.from({ length: 6 }, () => review(technova, h.id)))
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409, 409])
    expect(rs.filter((r) => r.status === 409).every((r) => r.body.code === 'DUPLICATE_REVIEW')).toBe(true)
    expect((await db.query('SELECT 1 FROM reviews WHERE hiring_id = $1', [h.id])).rowCount).toBe(1)
  })
  it('both parties reviewing at once: both succeed', async () => {
    const h = await freshHiring(); await technova.post(`/api/hirings/${h.id}/complete`)
    const rs = await Promise.all([review(technova, h.id), review(aarav, h.id)])
    expect(rs.map((r) => r.status)).toEqual([201, 201])
  })
  it('reviewing while the project is being completed never produces a review on an unfinished hiring', async () => {
    for (let i = 0; i < 5; i++) {
      const h = await freshHiring()
      const [done, rev] = await Promise.all([technova.post(`/api/hirings/${h.id}/complete`), review(aarav, h.id)])
      expect(done.status).toBe(200); expect([201, 409]).toContain(rev.status)
      expect(await hiringStatus(h.id)).toBe('COMPLETED')
      expect((await db.query('SELECT 1 FROM reviews WHERE hiring_id = $1', [h.id])).rowCount, `iteration ${i}`).toBe(rev.status === 201 ? 1 : 0)
    }
  })
})

describe('GET /api/reviews', () => {
  it('lists reviews about a user for anyone who may see that profile', async () => {
    const res = await technova.get(`/api/reviews?userId=${aarav.user.id}`)
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ reviewerName: expect.any(String), rating: expect.any(Number), revieweeId: aarav.user.id })
    expect(res.body.map((r) => r.reviewerName)).toContain('PixelCraft Technologies')
    expect((await rohan.get(`/api/reviews?userId=${aarav.user.id}`)).status).toBe(404)   // another freelancer may not see it
    for (const q of ['', '?userId=nope']) expect((await technova.get(`/api/reviews${q}`)).status, q).toBe(400)
    expect((await request(app).get(`/api/reviews?userId=${aarav.user.id}`)).status).toBe(401)
  })
})

describe('data integrity after all of the above', () => {
  const none = async (sql) => expect((await db.query(sql)).rows).toEqual([])
  it('every review is on a COMPLETED hiring and runs between its two parties', async () => {
    await none("SELECT r.id FROM reviews r JOIN hirings h ON h.id = r.hiring_id WHERE h.status <> 'COMPLETED'")
    await none('SELECT r.id FROM reviews r JOIN hirings h ON h.id = r.hiring_id WHERE NOT ((r.reviewer_id = h.company_id AND r.reviewee_id = h.freelancer_id) OR (r.reviewer_id = h.freelancer_id AND r.reviewee_id = h.company_id))')
  })
  it('a hiring and its project always agree, and every ACCEPTED proposal has exactly one hiring', async () => {
    await none("SELECT h.id FROM hirings h JOIN projects p ON p.id = h.project_id WHERE (h.status = 'ACTIVE' AND p.status <> 'IN_PROGRESS') OR (h.status = 'COMPLETED' AND p.status <> 'COMPLETED') OR (h.status = 'CANCELLED' AND p.status <> 'CANCELLED')")
    await none("SELECT pr.id FROM proposals pr LEFT JOIN hirings h ON h.proposal_id = pr.id WHERE (pr.status = 'ACCEPTED') <> (h.id IS NOT NULL)")
    await none("SELECT project_id FROM hirings WHERE status IN ('ACTIVE', 'COMPLETED') GROUP BY project_id HAVING count(*) > 1")
  })
})
