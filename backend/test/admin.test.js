import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, DEMO_PASSWORD, idOf, loginAs } from './helpers.js'

let aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin
const ids = {}
const auditFor = async (targetId) => (await db.query('SELECT action FROM admin_audit_log WHERE target_id = $1 ORDER BY id', [String(targetId)])).rows.map((r) => r.action)
const userStatus = async (id) => (await db.query('SELECT status FROM users WHERE id = $1', [id])).rows[0].status
const sessionCount = async (id) => Number((await db.query("SELECT count(*) FROM session WHERE sess ->> 'userId' = $1", [id])).rows[0].count)
const skillId = (name) => idOf('SELECT id FROM skills WHERE name = $1', [name])
const cookieOf = (res) => res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ')

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, kunal, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'kunal@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
  ids.report = await idOf("SELECT id FROM reports WHERE status = 'OPEN' LIMIT 1"); ids.skill = await skillId('SEO'); ids.demo = await idOf('SELECT id FROM demos LIMIT 1')
})

describe('access control: every admin endpoint, every other role', () => {
  const endpoints = () => [
    ['get', '/api/admin/stats'], ['get', '/api/admin/users'], ['post', `/api/admin/users/${rohan.user.id}/suspend`], ['post', `/api/admin/users/${rohan.user.id}/reinstate`],
    ['get', '/api/admin/projects'], ['get', '/api/admin/reports'], ['post', `/api/admin/reports/${ids.report}/resolve`], ['get', '/api/admin/skills'],
    ['post', '/api/admin/skills', { name: 'Sneaky Skill' }], ['delete', `/api/admin/skills/${ids.skill}`], ['get', '/api/admin/demo-log'], ['get', '/api/admin/audit-log'],
  ]
  it('freelancers and companies get 403 and anonymous callers 401, on all twelve endpoints', async () => {
    for (const [method, path, body] of endpoints()) {
      for (const who of [aarav, technova]) { const r = await who[method](path).send(body); expect([r.status, r.body.code], `${who.user.role} ${method} ${path}`).toEqual([403, 'FORBIDDEN']) }
      expect((await request(app)[method](path).send(body)).status, `anonymous ${method} ${path}`).toBe(401)
    }
  })
  it('and those refused attempts changed nothing', async () => {
    expect(await userStatus(rohan.user.id)).toBe('ACTIVE')
    expect((await db.query("SELECT 1 FROM reports WHERE status = 'OPEN'")).rowCount).toBe(2)
    expect((await db.query('SELECT active FROM skills WHERE name = $1', ['SEO'])).rows[0].active).toBe(true)
    expect((await db.query("SELECT 1 FROM skills WHERE name = 'Sneaky Skill'")).rowCount).toBe(0)
    expect((await db.query('SELECT 1 FROM admin_audit_log')).rowCount).toBe(0)
  })
  it('a suspended session or a forged role header gives no admin access', async () => {
    expect((await aarav.get('/api/admin/stats').set('X-Role', 'ADMIN').set('X-Admin', 'true')).status).toBe(403)
    expect((await aarav.get('/api/admin/stats?role=ADMIN')).status).toBe(403)
  })
})

describe('read endpoints', () => {
  it('stats match the platform', async () => {
    const res = await admin.get('/api/admin/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ totalUsers: 8, freelancers: 4, companies: 3, projects: 8, activeProjects: 6, reports: 2,
      projectsByStatus: [{ status: 'OPEN', count: 5 }, { status: 'IN_PROGRESS', count: 1 }, { status: 'COMPLETED', count: 1 }, { status: 'CANCELLED', count: 1 }] })
  })
  it('users: everyone, newest first, never any secrets', async () => {
    const res = await admin.get('/api/admin/users')
    expect(res.body.map((u) => u.name)).toEqual(['Kunal Joshi', 'Priya Deshmukh', 'Rohan Patil', 'Aarav Sharma', 'InnovateLabs', 'PixelCraft Technologies', 'TechNova Solutions', 'Meera Kulkarni'])
    expect(res.body[0]).toEqual({ id: expect.any(String), name: 'Kunal Joshi', email: 'kunal@skillmatch.dev', role: 'FREELANCER', status: 'ACTIVE', createdAt: expect.any(String) })
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2|hash/i)
  })
  it('projects: every project in every status, with company and proposal count', async () => {
    const res = await admin.get('/api/admin/projects')
    expect(res.body).toHaveLength(8)
    expect(new Set(res.body.map((p) => p.status))).toEqual(new Set(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']))
    const p = res.body.find((x) => x.title === 'E-commerce Website')
    expect(p).toMatchObject({ company: { name: 'TechNova Solutions' }, proposalCount: 3, budgetMin: 25000 })
    expect(p).not.toHaveProperty('skillMatch')
  })
  it('reports: who reported what, with a link to the target', async () => {
    const res = await admin.get('/api/admin/reports')
    expect(res.body).toHaveLength(2)
    const user = res.body.find((r) => r.targetType === 'USER'), project = res.body.find((r) => r.targetType === 'PROJECT')
    expect(user).toMatchObject({ reporterName: 'TechNova Solutions', targetName: 'Kunal Joshi', targetLink: `/freelancers/${kunal.user.id}`, status: 'OPEN', resolvedAt: null })
    expect(project).toMatchObject({ reporterName: 'Rohan Patil', targetName: 'Customer Support Chatbot Backend', status: 'OPEN' })
    expect(project.targetLink).toBe(`/projects/${project.targetId}`)
    expect(res.body[0].id).toBe(user.id)   // newest first
  })
  it('skills: active ones, alphabetical, with how many projects and profiles use them', async () => {
    const res = await admin.get('/api/admin/skills')
    expect(res.body).toHaveLength(24)
    expect(res.body.find((s) => s.name === 'React').usage).toBe(5)        // 3 projects + 2 freelancers
    expect(res.body.find((s) => s.name === 'PostgreSQL').usage).toBe(6)   // 3 projects + 3 freelancers
    expect(res.body.find((s) => s.name === 'SEO').usage).toBe(0)
    const names = res.body.map((s) => s.name.toLowerCase()); expect(names).toEqual([...names].sort())
  })
  it('demo log: the audit trail of demo access, and never the link', async () => {
    const res = await admin.get('/api/admin/demo-log')
    expect(res.body.map((e) => e.outcome)).toEqual(['GRANTED', 'SUBMITTED', 'SUBMITTED', 'SUBMITTED'])
    expect(res.body[0]).toMatchObject({ user: { name: 'InnovateLabs' }, project: { title: 'Sales Forecasting Model' }, freelancer: { name: 'Rohan Patil' } })
    expect(JSON.stringify(res.body)).not.toMatch(/demo\.example\.com|https?:\/\//)
    expect(res.headers['cache-control']).toBe('no-store')
    const one = await admin.get(`/api/admin/demo-log?demoId=${res.body[0].demoId}`)
    expect(one.body.map((e) => e.outcome).sort()).toEqual(['GRANTED', 'SUBMITTED'])
    expect((await admin.get('/api/admin/demo-log?demoId=nope')).status).toBe(400)
  })
})

describe('suspending and reinstating users', () => {
  it('suspension is immediate: every session dies, login is refused, other users are unaffected', async () => {
    const second = await loginAs('rohan@skillmatch.dev')   // a second device
    expect(await sessionCount(rohan.user.id)).toBe(2)
    const res = await admin.post(`/api/admin/users/${rohan.user.id}/suspend`)
    expect(res.status).toBe(200); expect(res.body).toMatchObject({ id: rohan.user.id, status: 'SUSPENDED', name: 'Rohan Patil' })
    expect(await sessionCount(rohan.user.id)).toBe(0)
    for (const a of [rohan, second]) expect((await a.get('/api/auth/me')).status).toBe(401)
    const login = await request(app).post('/api/auth/login').send({ email: 'rohan@skillmatch.dev', password: DEMO_PASSWORD })
    expect([login.status, login.body.code]).toEqual([403, 'SUSPENDED'])
    expect((await aarav.get('/api/auth/me')).status).toBe(200)   // someone else's session is untouched
    expect((await admin.get('/api/auth/me')).status).toBe(200)
    expect(await auditFor(rohan.user.id)).toEqual(['USER_SUSPENDED'])
  })
  it('suspending twice is harmless and logged once; reinstating restores login but not old sessions', async () => {
    expect((await admin.post(`/api/admin/users/${rohan.user.id}/suspend`)).status).toBe(200)
    expect(await auditFor(rohan.user.id)).toEqual(['USER_SUSPENDED'])
    const res = await admin.post(`/api/admin/users/${rohan.user.id}/reinstate`)
    expect(res.body.status).toBe('ACTIVE')
    expect((await rohan.get('/api/auth/me')).status).toBe(401)   // the old session stays dead
    expect((await request(app).post('/api/auth/login').send({ email: 'rohan@skillmatch.dev', password: DEMO_PASSWORD })).status).toBe(200)
    expect((await admin.post(`/api/admin/users/${rohan.user.id}/reinstate`)).status).toBe(200)
    expect(await auditFor(rohan.user.id)).toEqual(['USER_SUSPENDED', 'USER_REINSTATED'])
  })
  it('admin accounts cannot be suspended, including your own; unknown users are 404', async () => {
    for (const id of [admin.user.id]) { const r = await admin.post(`/api/admin/users/${id}/suspend`); expect([r.status, r.body.code]).toEqual([409, 'INVALID_STATE']) }
    expect(await userStatus(admin.user.id)).toBe('ACTIVE')
    expect((await admin.post('/api/admin/users/00000000-0000-0000-0000-000000000000/suspend')).status).toBe(404)
    expect((await admin.post('/api/admin/users/nope/suspend')).status).toBe(404)
  })
  it('five simultaneous suspensions leave one state change and one log entry', async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => admin.post(`/api/admin/users/${priya.user.id}/suspend`)))
    expect(rs.every((r) => r.status === 200 && r.body.status === 'SUSPENDED')).toBe(true)
    expect(await auditFor(priya.user.id)).toEqual(['USER_SUSPENDED'])
    expect(await sessionCount(priya.user.id)).toBe(0)
    await admin.post(`/api/admin/users/${priya.user.id}/reinstate`)
  })
  it('suspending while the same user logs in repeatedly: no session that slips in ever works', async () => {
    for (let i = 0; i < 3; i++) {
      await admin.post(`/api/admin/users/${kunal.user.id}/reinstate`)
      const logins = Array.from({ length: 6 }, () => request(app).post('/api/auth/login').send({ email: 'kunal@skillmatch.dev', password: DEMO_PASSWORD }))
      const [suspend, ...results] = await Promise.all([admin.post(`/api/admin/users/${kunal.user.id}/suspend`), ...logins])
      expect(suspend.status).toBe(200)
      for (const r of results.filter((x) => x.status === 200)) expect([401, 403], `iteration ${i}`).toContain((await request(app).get('/api/auth/me').set('Cookie', cookieOf(r))).status)
    }
  })
  it('suspending and reinstating at once ends in a state that matches the log', async () => {
    for (let i = 0; i < 4; i++) {
      await admin.post(`/api/admin/users/${priya.user.id}/reinstate`)
      await Promise.all([admin.post(`/api/admin/users/${priya.user.id}/suspend`), admin.post(`/api/admin/users/${priya.user.id}/reinstate`)])
      const actions = await auditFor(priya.user.id), last = actions.at(-1), status = await userStatus(priya.user.id)
      expect(status, `iteration ${i}`).toBe(last === 'USER_SUSPENDED' ? 'SUSPENDED' : 'ACTIVE')
      if (status === 'SUSPENDED') expect(await sessionCount(priya.user.id)).toBe(0)
    }
  })
})

describe('resolving reports', () => {
  it('marks it resolved with who and when, logs it once, and is harmless to repeat', async () => {
    const [open] = (await admin.get('/api/admin/reports')).body
    const res = await admin.post(`/api/admin/reports/${open.id}/resolve`)
    expect(res.status).toBe(200); expect(res.body).toMatchObject({ id: open.id, status: 'RESOLVED', resolvedByName: 'Meera Kulkarni', resolvedAt: expect.any(String) })
    expect((await admin.post(`/api/admin/reports/${open.id}/resolve`)).body.status).toBe('RESOLVED')
    expect(await auditFor(open.id)).toEqual(['REPORT_RESOLVED'])
    expect((await admin.get('/api/admin/stats')).body.reports).toBe(1)
    expect((await admin.post('/api/admin/reports/00000000-0000-0000-0000-000000000000/resolve')).status).toBe(404)
    expect((await admin.post('/api/admin/reports/nope/resolve')).status).toBe(404)
  })
  it('five simultaneous resolves: one log entry', async () => {
    const open = (await admin.get('/api/admin/reports')).body.find((r) => r.status === 'OPEN')
    const rs = await Promise.all(Array.from({ length: 5 }, () => admin.post(`/api/admin/reports/${open.id}/resolve`)))
    expect(rs.every((r) => r.status === 200)).toBe(true)
    expect(await auditFor(open.id)).toEqual(['REPORT_RESOLVED'])
  })
})

describe('managing skills', () => {
  it('adds a skill, refuses duplicates in any case, and validates the name', async () => {
    const res = await admin.post('/api/admin/skills').send({ name: '  GraphQL  ' })
    expect(res.status).toBe(201); expect(res.body).toEqual({ id: expect.any(String), name: 'GraphQL' })
    expect((await aarav.get('/api/skills')).body.map((s) => s.name)).toContain('GraphQL')
    for (const name of ['graphql', 'GRAPHQL', 'React']) { const r = await admin.post('/api/admin/skills').send({ name }); expect([r.status, r.body.code], name).toEqual([409, 'DUPLICATE_SKILL']) }
    for (const body of [{}, { name: 'X' }, { name: 'x'.repeat(41) }, { name: 'Valid Name', active: false }, { name: 123 }]) expect((await admin.post('/api/admin/skills').send(body)).status, JSON.stringify(body)).toBe(400)
  })
  it('five simultaneous adds of one new skill: exactly one is created', async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => admin.post('/api/admin/skills').send({ name: 'Rust' })))
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409])
    expect((await db.query("SELECT 1 FROM skills WHERE lower(name) = 'rust'")).rowCount).toBe(1)
  })
  it('retiring keeps history intact but stops the skill being offered, and re-adding revives the same skill', async () => {
    const figma = await skillId('Figma')
    expect((await admin.delete(`/api/admin/skills/${figma}`)).body).toEqual({ ok: true })
    expect((await admin.get('/api/admin/skills')).body.map((s) => s.name)).not.toContain('Figma')
    expect((await aarav.get('/api/skills')).body.map((s) => s.name)).not.toContain('Figma')
    // existing profiles and projects keep it...
    const uiProject = (await aarav.get('/api/projects?q=redesign')).body[0]
    expect(uiProject.skills).toContain('Figma')
    expect((await technova.get(`/api/profiles/${priya.user.id}`)).body.profile.skills).toContain('Figma')
    // ...but nobody can newly add it (Kunal was left suspended by an earlier test: reinstate him and sign in again)
    await admin.post(`/api/admin/users/${kunal.user.id}/reinstate`); kunal = await loginAs('kunal@skillmatch.dev')
    expect((await kunal.put('/api/profiles/me').send({ profile: { skills: ['Java', 'Figma'] } })).status).toBe(400)
    expect((await admin.delete(`/api/admin/skills/${figma}`)).body).toEqual({ ok: true })   // retiring again is harmless
    const back = await admin.post('/api/admin/skills').send({ name: 'figma' })
    expect(back.status).toBe(201); expect(back.body).toEqual({ id: figma, name: 'Figma' })   // the same skill, so old data lines up again
    expect((await kunal.put('/api/profiles/me').send({ profile: { skills: ['Java', 'Figma'] } })).status).toBe(200)
    expect(await auditFor(figma)).toEqual(['SKILL_RETIRED', 'SKILL_REACTIVATED'])
  })
  it('unknown skills are 404', async () => {
    expect((await admin.delete('/api/admin/skills/00000000-0000-0000-0000-000000000000')).status).toBe(404)
    expect((await admin.delete('/api/admin/skills/nope')).status).toBe(404)
  })
})

describe('admin audit log', () => {
  it('records each moderation action with who did it, newest first', async () => {
    const res = await admin.get('/api/admin/audit-log')
    expect(res.status).toBe(200)
    const actions = new Set(res.body.map((e) => e.action))
    for (const a of ['USER_SUSPENDED', 'USER_REINSTATED', 'REPORT_RESOLVED', 'SKILL_ADDED', 'SKILL_RETIRED', 'SKILL_REACTIVATED']) expect(actions.has(a), a).toBe(true)
    expect(res.body.every((e) => e.adminName === 'Meera Kulkarni')).toBe(true)
    const times = res.body.map((e) => Date.parse(e.createdAt)); expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(res.body.find((e) => e.action === 'SKILL_ADDED' && e.details.name === 'GraphQL')).toMatchObject({ targetType: 'SKILL' })
    expect(res.body.find((e) => e.action === 'USER_SUSPENDED' && e.details.email === 'rohan@skillmatch.dev')).toBeTruthy()
  })
})
