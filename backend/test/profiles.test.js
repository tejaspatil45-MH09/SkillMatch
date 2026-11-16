import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { app, db, idOf, loginAs } from './helpers.js'

const userId = (email) => idOf('SELECT id FROM users WHERE email = $1', [email])
let aarav, rohan, priya, technova, pixelcraft, admin

beforeAll(async () => {
  await withTransaction(seed, db)
  ;[aarav, rohan, priya, technova, pixelcraft, admin] = await Promise.all(['aarav@skillmatch.dev', 'rohan@skillmatch.dev', 'priya@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'admin@skillmatch.dev'].map((e) => loginAs(e)))
})

describe('GET /api/skills', () => {
  it('requires login', async () => expect((await request(app).get('/api/skills')).status).toBe(401))
  it('lists active skills alphabetically and hides retired ones', async () => {
    const all = (await aarav.get('/api/skills')).body
    expect(all).toHaveLength(24)
    const names = all.map((s) => s.name)
    expect(names).toEqual([...names].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)))   // case-insensitive, whatever the database collation
    expect(all[0]).toEqual({ id: expect.any(String), name: expect.any(String) })
    await db.query("UPDATE skills SET active = false WHERE name = 'SEO'")
    expect((await aarav.get('/api/skills')).body.map((s) => s.name)).not.toContain('SEO')
    await db.query("UPDATE skills SET active = true WHERE name = 'SEO'")
  })
})

describe('GET /api/profiles/:id', () => {
  it('a company sees a freelancer with rating, reviews and completion, but NOT their email', async () => {
    const res = await technova.get(`/api/profiles/${await userId('aarav@skillmatch.dev')}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Aarav Sharma', role: 'FREELANCER', rating: 5, reviewCount: 1, profileCompletion: 100 })
    expect(res.body.reviews[0]).toMatchObject({ rating: 5, reviewerName: 'PixelCraft Technologies', comment: expect.stringContaining('ahead of schedule') })
    expect(res.body.profile.skills).toContain('React')
    expect(res.body).not.toHaveProperty('email')
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2|@skillmatch/i)
  })
  it('the owner and admins see the email', async () => {
    const id = await userId('aarav@skillmatch.dev')
    expect((await aarav.get(`/api/profiles/${id}`)).body.email).toBe('aarav@skillmatch.dev')
    expect((await admin.get(`/api/profiles/${id}`)).body.email).toBe('aarav@skillmatch.dev')
  })
  it('a freelancer sees a company profile; unrated users have rating null', async () => {
    const res = await aarav.get(`/api/profiles/${await userId('hr@technova.dev')}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'TechNova Solutions', role: 'COMPANY', rating: null, reviewCount: 0, profileCompletion: null, reviews: [] })
    expect(res.body.profile).toMatchObject({ industry: 'Software', location: 'Pune, Maharashtra' })
  })
  it('visibility rules: same-role peers, admin accounts and malformed ids all look like "not found"', async () => {
    const rohanId = await userId('rohan@skillmatch.dev'), pixelId = await userId('team@pixelcraft.dev'), adminId = await userId('admin@skillmatch.dev')
    expect((await aarav.get(`/api/profiles/${rohanId}`)).status).toBe(404)      // freelancer -> freelancer
    expect((await technova.get(`/api/profiles/${pixelId}`)).status).toBe(404)   // company -> company
    expect((await aarav.get(`/api/profiles/${adminId}`)).status).toBe(404)      // anyone -> admin account
    expect((await aarav.get('/api/profiles/not-a-uuid')).status).toBe(404)
    expect((await aarav.get('/api/profiles/00000000-0000-0000-0000-000000000000')).status).toBe(404)
    expect((await admin.get(`/api/profiles/${rohanId}`)).status).toBe(200)
    expect((await rohan.get(`/api/profiles/${rohanId}`)).status).toBe(200)       // yourself
  })
  it('suspended accounts disappear for everyone except admins', async () => {
    const id = await userId('kunal@skillmatch.dev')
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [id])
    expect((await technova.get(`/api/profiles/${id}`)).status).toBe(404)
    expect((await admin.get(`/api/profiles/${id}`)).status).toBe(200)
    await db.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [id])
  })
  it('requires login', async () => expect((await request(app).get(`/api/profiles/${await userId('aarav@skillmatch.dev')}`)).status).toBe(401))
})

describe('PUT /api/profiles/me (freelancer)', () => {
  it('updates fields and returns the new user, and /auth/me agrees', async () => {
    const f = await loginAs('kunal@skillmatch.dev')
    const res = await f.put('/api/profiles/me').send({ name: 'Kunal J. Joshi', profile: { headline: 'Senior backend engineer', location: 'Pune', experienceYears: 7, bio: 'Reliable services in Java and C++.' } })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ name: 'Kunal J. Joshi', profile: { headline: 'Senior backend engineer', location: 'Pune', experienceYears: 7, bio: 'Reliable services in Java and C++.' } })
    expect((await f.get('/api/auth/me')).body.user.name).toBe('Kunal J. Joshi')
  })
  it('a partial edit leaves everything else untouched', async () => {
    const f = await loginAs('rohan@skillmatch.dev')
    const before = (await f.get('/api/auth/me')).body.user.profile
    const after = (await f.put('/api/profiles/me').send({ profile: { headline: 'Data engineer' } })).body.user.profile
    expect(after.headline).toBe('Data engineer')
    expect({ ...after, headline: before.headline }).toEqual(before)
  })
  it('replaces skills (case-insensitively), rejects unknown and retired ones, but lets existing retired skills stay', async () => {
    const f = await loginAs('priya@skillmatch.dev')
    expect((await f.put('/api/profiles/me').send({ profile: { skills: ['figma', 'REACT', 'Docker'] } })).body.user.profile.skills).toEqual(['Docker', 'Figma', 'React'])
    const unknown = await f.put('/api/profiles/me').send({ profile: { skills: ['React', 'Underwater Basket Weaving'] } })
    expect(unknown.status).toBe(400); expect(unknown.body.fields.skills[0]).toMatch(/not a skill/)
    await db.query("UPDATE skills SET active = false WHERE name IN ('SEO', 'Docker')")
    expect((await f.put('/api/profiles/me').send({ profile: { skills: ['Figma', 'SEO'] } })).status).toBe(400)                        // cannot ADD a retired skill
    expect((await f.put('/api/profiles/me').send({ profile: { skills: ['Figma', 'Docker'] } })).status).toBe(200)                     // can KEEP one already attached
    await db.query("UPDATE skills SET active = true WHERE name IN ('SEO', 'Docker')")
    expect((await f.put('/api/profiles/me').send({ profile: { skills: Array.from({ length: 31 }, (_, i) => `S${i}`) } })).status).toBe(400)
  })
  it('validates scalar fields and rejects unknown keys', async () => {
    const f = await loginAs('priya@skillmatch.dev')
    for (const body of [{ profile: { experienceYears: 51 } }, { profile: { experienceYears: -1 } }, { profile: { experienceYears: 2.5 } }, { profile: { bio: 'x'.repeat(1001) } }, { name: 'A' }, { profile: { photo: 'https://x.co/a.png' } }, { role: 'ADMIN' }, { status: 'ACTIVE' }, { profile: { website: 'https://x.co' } }])
      expect((await f.put('/api/profiles/me').send(body)).status, JSON.stringify(body)).toBe(400)
  })
  it('requires login', async () => expect((await request(app).put('/api/profiles/me').send({})).status).toBe(401))
})

describe('portfolio and experience', () => {
  it('adds with a client-made id (server assigns a real one), keeps existing ids, appends at the end', async () => {
    const f = await loginAs('aarav@skillmatch.dev')
    const before = (await f.get('/api/auth/me')).body.user.profile.portfolio
    const res = await f.put('/api/profiles/me').send({ profile: { portfolio: [...before, { id: 'pf-1700000000000', title: 'New Site', description: 'A freshly built website for a client.', url: 'https://example.com/new', image: null }] } })
    const after = res.body.user.profile.portfolio
    expect(after.map((p) => p.title)).toEqual(['Kirana Cart', 'Clinic Booking Portal', 'New Site'])
    expect(after.slice(0, 2).map((p) => p.id)).toEqual(before.map((p) => p.id))
    expect(after[2].id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('updates in place by id and deletes whatever is omitted', async () => {
    const f = await loginAs('aarav@skillmatch.dev')
    const [first, second, third] = (await f.get('/api/auth/me')).body.user.profile.portfolio
    const res = await f.put('/api/profiles/me').send({ profile: { portfolio: [{ ...first, title: 'Kirana Cart v2' }, third] } })
    const p = res.body.user.profile.portfolio
    expect(p.map((x) => x.title)).toEqual(['Kirana Cart v2', 'New Site'])
    expect(p[0].id).toBe(first.id)
    expect((await db.query('SELECT 1 FROM portfolio_items WHERE id = $1', [second.id])).rowCount).toBe(0)
  })
  it("cannot touch another user's items by sending their id (it just creates a new item for you)", async () => {
    const victim = await loginAs('rohan@skillmatch.dev'), attacker = await loginAs('priya@skillmatch.dev')
    const [theirs] = (await victim.get('/api/auth/me')).body.user.profile.portfolio
    const mine = (await attacker.get('/api/auth/me')).body.user.profile.portfolio
    const res = await attacker.put('/api/profiles/me').send({ profile: { portfolio: [...mine, { id: theirs.id, title: 'Hijacked title', description: 'Attempt to overwrite someone else.' }] } })
    expect(res.status).toBe(200)
    const row = (await db.query('SELECT title, user_id FROM portfolio_items WHERE id = $1', [theirs.id])).rows[0]
    expect(row.title).toBe(theirs.title)                                  // victim's row unchanged
    expect(row.user_id).toBe(victim.user.id)
    expect(res.body.user.profile.portfolio.at(-1).id).not.toBe(theirs.id) // attacker got a brand-new item
    expect((await victim.get('/api/auth/me')).body.user.profile.portfolio).toHaveLength(1)
  })
  it('validates items and limits', async () => {
    const f = await loginAs('priya@skillmatch.dev')
    const item = { title: 'T', description: 'A long enough description.' }
    for (const portfolio of [[{ ...item, url: 'javascript:alert(1)' }], [{ ...item, description: 'short' }], [{ ...item, title: '' }], [{ ...item, image: 'https://x.co/a.png' }], [{ ...item, owner: 'x' }], Array.from({ length: 21 }, () => item)])
      expect((await f.put('/api/profiles/me').send({ profile: { portfolio } })).status, JSON.stringify(portfolio).slice(0, 60)).toBe(400)
  })
  it('experience entries keep insertion order and can be replaced', async () => {
    const f = await loginAs('kunal@skillmatch.dev')
    const entries = ['A', 'B', 'C', 'D'].map((x) => ({ role: `Role ${x}`, org: 'Org', period: '2024', summary: `Did ${x}` }))
    const res = await f.put('/api/profiles/me').send({ profile: { experience: entries } })
    expect(res.body.user.profile.experience.map((e) => e.role)).toEqual(['Role A', 'Role B', 'Role C', 'Role D'])
    const next = await f.put('/api/profiles/me').send({ profile: { experience: [res.body.user.profile.experience[2]] } })
    expect(next.body.user.profile.experience.map((e) => e.role)).toEqual(['Role C'])
  })
})

describe('PUT /api/profiles/me (company and admin)', () => {
  it('a company edits its own fields, and only valid ones', async () => {
    const res = await pixelcraft.put('/api/profiles/me').send({ name: 'PixelCraft Studio', profile: { description: 'Design and brand studio.', website: 'https://pixelcraft.example.org', industry: 'Design', location: 'Mumbai' } })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ name: 'PixelCraft Studio', profile: { description: 'Design and brand studio.', website: 'https://pixelcraft.example.org' } })
    for (const body of [{ profile: { website: 'ftp://x.example.com' } }, { profile: { website: 'javascript:alert(1)' } }, { profile: { skills: ['React'] } }, { profile: { headline: 'x' } }, { profile: { logo: 'x' } }])
      expect((await pixelcraft.put('/api/profiles/me').send(body)).status, JSON.stringify(body)).toBe(400)
    expect((await pixelcraft.put('/api/profiles/me').send({ profile: { website: '' } })).status).toBe(200)   // clearing is allowed
  })
  it('an admin can only change their name', async () => {
    expect((await admin.put('/api/profiles/me').send({ name: 'Meera K.' })).body.user.name).toBe('Meera K.')
    expect((await admin.put('/api/profiles/me').send({ profile: { headline: 'x' } })).status).toBe(400)
  })
})
