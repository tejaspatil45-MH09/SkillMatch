import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { defaultLimits } from '../src/middleware/rateLimit.js'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, DEMO_PASSWORD, idOf, loginAs } from './helpers.js'

let aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
const reason = 'The profile makes claims that look misleading to me.'
const pid = (title) => idOf('SELECT id FROM projects WHERE title = $1', [title])
const report = (who, targetType, targetId, over = {}) => who.post('/api/reports').send({ targetType, targetId, reason, ...over })
const reportCount = async () => Number((await db.query('SELECT count(*) FROM reports')).rows[0].count)

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('POST /api/reports', () => {
  it('files a report about a project, and every active admin is notified', async () => {
    const p3 = await pid('Mobile App UI Redesign')
    const res = await report(aarav, 'PROJECT', p3, { reason: '  The project asks for unpaid design work before hiring.  ' })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: expect.any(String), reporterId: aarav.user.id, targetType: 'PROJECT', targetId: p3, reason: 'The project asks for unpaid design work before hiring.', status: 'OPEN', createdAt: expect.any(String) })
    const note = (await db.query("SELECT message, link FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.role = 'ADMIN' AND n.type = 'REPORT' ORDER BY n.created_at DESC LIMIT 1")).rows[0]
    expect(note).toEqual({ message: 'New report about Mobile App UI Redesign.', link: '/admin/reports' })
    const row = (await db.query('SELECT target_user_id, target_project_id FROM reports WHERE id = $1', [res.body.id])).rows[0]
    expect(row).toEqual({ target_user_id: null, target_project_id: p3 })
  })
  it('files a report about a user the reporter is allowed to see', async () => {
    expect((await report(technova, 'USER', kunal.user.id)).body.code).toBe('DUPLICATE_REPORT')   // the seed data already has TechNova's open report about Kunal
    const res = await report(technova, 'USER', rohan.user.id)
    expect(res.status).toBe(201); expect(res.body).toMatchObject({ targetType: 'USER', targetId: rohan.user.id })
    expect((await db.query('SELECT message FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.role = \'ADMIN\' AND n.type = \'REPORT\' ORDER BY n.created_at DESC LIMIT 1')).rows[0].message).toBe('New report about Rohan Patil.')
    expect((await report(aarav, 'USER', technova.user.id)).status).toBe(201)   // freelancer -> company
  })
  it('one open report per reporter per target, even when sent five times at once', async () => {
    const p4 = await pid('Sales Forecasting Model')
    const rs = await Promise.all(Array.from({ length: 5 }, () => report(priya, 'PROJECT', p4)))
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409])
    expect(rs.find((r) => r.status === 409).body.code).toBe('DUPLICATE_REPORT')
    expect((await db.query('SELECT 1 FROM reports WHERE reporter_id = $1 AND target_project_id = $2', [priya.user.id, p4])).rowCount).toBe(1)
  })
  it('can be repeated once the earlier report has been resolved', async () => {
    const p4 = await pid('Sales Forecasting Model')
    expect((await report(priya, 'PROJECT', p4)).status).toBe(409)
    await db.query("UPDATE reports SET status = 'RESOLVED', resolved_at = now() WHERE reporter_id = $1", [priya.user.id])
    expect((await report(priya, 'PROJECT', p4)).status).toBe(201)
  })
  it("you cannot report yourself or your own project", async () => {
    const own = await report(technova, 'PROJECT', await pid('E-commerce Website'))
    expect(own.status).toBe(400); expect(own.body.message).toBe("You can't report your own profile or project.")
    expect((await report(aarav, 'USER', aarav.user.id)).status).toBe(400)
    expect((await report(technova, 'USER', technova.user.id)).status).toBe(400)
  })
  it("you cannot report what you aren't allowed to see (reports can't be used to probe)", async () => {
    expect((await report(aarav, 'USER', rohan.user.id)).status).toBe(404)                          // another freelancer
    expect((await report(technova, 'USER', pixelcraft.user.id)).status).toBe(404)                  // a rival company
    expect((await report(aarav, 'USER', admin.user.id)).status).toBe(404)                          // an admin account
    expect((await report(aarav, 'PROJECT', await pid('Billing Microservice'))).status).toBe(404)  // in-progress project he has no stake in
    expect((await report(aarav, 'PROJECT', '00000000-0000-0000-0000-000000000000')).status).toBe(404)
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [rohan.user.id])
    expect((await report(technova, 'USER', rohan.user.id)).status).toBe(404)                       // suspended users are hidden
    await db.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [rohan.user.id])
    expect((await report(aarav, 'PROJECT', await pid('Company Portfolio Website'))).status).toBe(201)   // but a project he worked on is fine
  })
  it('validates the type, id and reason, and refuses extra fields', async () => {
    const before = await reportCount()
    const p3 = await pid('Mobile App UI Redesign')
    for (const over of [{ reason: 'too short' }, { reason: 'x'.repeat(1001) }, { reason: undefined }, { targetType: 'HIRING' }, { targetType: undefined }, { targetId: 'nope' }, { targetId: undefined }, { status: 'RESOLVED' }, { reporterId: priya.user.id }])
      expect((await report(kunal, 'PROJECT', p3, over)).status, JSON.stringify(over)).toBe(400)
    expect(await reportCount()).toBe(before)
  })
  it('is for signed-in non-admin users only', async () => {
    const p3 = await pid('Mobile App UI Redesign')
    expect((await report(admin, 'PROJECT', p3)).status).toBe(403)
    expect((await request(app).post('/api/reports').send({ targetType: 'PROJECT', targetId: p3, reason })).status).toBe(401)
  })
  it('is rate-limited per user', async () => {
    const limited = createApp({ pool: db, mailer: { send: async () => {} }, limits: { ...defaultLimits, report: { windowMs: 60000, limit: 2 } } })
    const agent = request.agent(limited)
    await agent.post('/api/auth/login').send({ email: 'projects@innovatelabs.dev', password: DEMO_PASSWORD })
    const targets = [aarav.user.id, rohan.user.id, priya.user.id, kunal.user.id]
    const codes = []
    for (const t of targets) codes.push((await agent.post('/api/reports').send({ targetType: 'USER', targetId: t, reason })).status)
    expect(codes).toEqual([201, 201, 429, 429])
  })
})
