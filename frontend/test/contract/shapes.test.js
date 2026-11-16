import fs from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { handle } from '../../src/data/mockServer.js'
import { resetDb } from '../../src/data/mockDb.js'
import { backend, freshDatabase, PASSWORD } from '../integration/harness.jsx'

// ---- two "worlds" that answer the same API: the frontend's in-browser mock, and the real Express + PostgreSQL backend
const mockWorld = {
  name: 'mock',
  async as(email) {
    const token = handle('POST', '/auth/login', { body: { email, password: PASSWORD } }).token
    return { call: async (method, path, body, query) => { try { return handle(method.toUpperCase(), path, { body, query, token }) } catch (e) { return { __error: { status: e.status, code: e.code } } } } }
  },
  anonymous: { call: async (method, path, body) => { try { return handle(method.toUpperCase(), path, { body }) } catch (e) { return { __error: { status: e.status, code: e.code } } } } },
}
const realWorld = {
  name: 'real',
  async as(email) {
    const agent = request.agent(backend)
    const login = await agent.post('/api/auth/login').set('Origin', 'http://localhost:5173').send({ email, password: PASSWORD })
    if (login.status !== 200) throw new Error(`real login failed for ${email}`)
    return makeCaller(agent)
  },
  get anonymous() { return makeCaller(request.agent(backend)) },
}
function makeCaller(agent) {
  return { call: async (method, path, body, query) => {
    let r = agent[method](`/api${path}`); if (method !== 'get') r = r.set('Origin', 'http://localhost:5173'); if (query) r = r.query(query)
    const res = await (body !== undefined ? r.send(body) : r)
    return res.status >= 400 ? { __error: { status: res.status, code: res.body.code } } : res.body
  } }
}

// ---- one scenario, run identically against both worlds
async function scenario(w) {
  const R = {}, rec = (name, v) => { R[name] = v; return v }
  const [aarav, priya, rohan, technova, pixelcraft, innovate, admin] = await Promise.all(['aarav@skillmatch.dev', 'priya@skillmatch.dev', 'rohan@skillmatch.dev', 'hr@technova.dev', 'team@pixelcraft.dev', 'projects@innovatelabs.dev', 'admin@skillmatch.dev'].map((e) => w.as(e)))
  const find = (list, f) => list.find(f)

  // reads: freelancer
  rec('GET /auth/me (freelancer)', await aarav.call('get', '/auth/me'))
  rec('GET /skills', await aarav.call('get', '/skills'))
  const projects = rec('GET /projects?sort=match', await aarav.call('get', '/projects', undefined, { sort: 'match' }))
  rec('GET /projects (search)', await aarav.call('get', '/projects', undefined, { q: 'inventory', skills: 'React', minBudget: 1000 }))
  const p1 = find(projects, (p) => p.title === 'E-commerce Website'), p3 = find(projects, (p) => p.title === 'Mobile App UI Redesign'), p7 = find(projects, (p) => p.title === 'Warehouse Route Optimizer')
  rec('GET /projects/:id', await aarav.call('get', `/projects/${p1.id}`))
  const mine = rec('GET /proposals/mine', await aarav.call('get', '/proposals/mine'))
  const pr1 = find(mine, (p) => p.project.title === 'E-commerce Website')
  rec('GET /proposals/:id (freelancer)', await aarav.call('get', `/proposals/${pr1.id}`))
  rec('GET /proposals/:id/demo (freelancer)', await aarav.call('get', `/proposals/${pr1.id}/demo`))
  rec('GET /hirings (freelancer)', await aarav.call('get', '/hirings'))
  rec('GET /notifications', await aarav.call('get', '/notifications'))
  rec('GET /freelancer/dashboard', await aarav.call('get', '/freelancer/dashboard'))
  rec('GET /profiles/:companyId', await aarav.call('get', `/profiles/${p1.company.id}`))
  rec('GET /profiles/:id (self)', await aarav.call('get', `/profiles/${(await aarav.call('get', '/auth/me')).user.id}`))
  // reads: company
  const cps = rec('GET /company/projects', await technova.call('get', '/company/projects'))
  rec('GET /projects/:id/proposals', await technova.call('get', `/projects/${p1.id}/proposals`))
  const inbox = rec('GET /company/proposals', await technova.call('get', '/company/proposals'))
  rec('GET /company/dashboard', await technova.call('get', '/company/dashboard'))
  const aaravId = find(inbox, (p) => p.freelancer.name === 'Aarav Sharma').freelancer.id
  rec('GET /profiles/:freelancerId', await technova.call('get', `/profiles/${aaravId}`))
  rec('GET /proposals/:id/demo (company)', await technova.call('get', `/proposals/${pr1.id}/demo`))
  rec('GET /hirings (company)', await pixelcraft.call('get', '/hirings'))
  rec('GET /reviews?userId', await technova.call('get', '/reviews', undefined, { userId: aaravId }))
  // reads: admin
  rec('GET /admin/stats', await admin.call('get', '/admin/stats'))
  const users = rec('GET /admin/users', await admin.call('get', '/admin/users'))
  rec('GET /admin/projects', await admin.call('get', '/admin/projects'))
  const reports = rec('GET /admin/reports', await admin.call('get', '/admin/reports'))
  rec('GET /admin/skills', await admin.call('get', '/admin/skills'))

  // the project lifecycle
  const created = rec('POST /projects', await technova.call('post', '/projects', { title: 'Contract Test Project', description: 'A project created by the contract test to compare shapes.', budgetMin: 10000, budgetMax: 20000, deadline: new Date(Date.now() + 30 * 864e5).toISOString(), skills: ['React'] }))
  rec('PUT /projects/:id', await technova.call('put', `/projects/${created.id}`, { title: 'Contract Test Project v2' }))
  const proposal = rec('POST /projects/:id/proposals', await aarav.call('post', `/projects/${created.id}/proposals`, { coverLetter: 'I can deliver this contract test project quickly and with clear communication throughout.', bidAmount: 15000, estimatedDays: 12 }))
  rec('ERR duplicate proposal', await aarav.call('post', `/projects/${created.id}/proposals`, { coverLetter: 'I can deliver this contract test project quickly and with clear communication throughout.', bidAmount: 15000, estimatedDays: 12 }))
  rec('ERR edit skills once proposals exist', await technova.call('put', `/projects/${created.id}`, { skills: ['Python'] }))
  rec('ERR accept a pending proposal', await technova.call('post', `/proposals/${proposal.id}/accept`))
  rec('ERR other company shortlists', await pixelcraft.call('post', `/proposals/${proposal.id}/shortlist`))
  rec('POST /proposals/:id/shortlist', await technova.call('post', `/proposals/${proposal.id}/shortlist`))
  const demo = rec('POST /proposals/:id/demo', await aarav.call('post', `/proposals/${proposal.id}/demo`, { url: 'https://demo.example.com/contract', description: 'A prototype used only by the contract test.' }))
  rec('ERR stranger opens demo', await pixelcraft.call('post', `/demos/${demo.id}/access`))
  rec('POST /demos/:id/access', await technova.call('post', `/demos/${demo.id}/access`))
  rec('ERR open demo twice', await technova.call('post', `/demos/${demo.id}/access`))
  rec('POST /demos/:id/reissue', await aarav.call('post', `/demos/${demo.id}/reissue`))
  const hiring = rec('POST /proposals/:id/accept', await technova.call('post', `/proposals/${proposal.id}/accept`))
  rec('ERR review before completion', await technova.call('post', '/reviews', { hiringId: hiring.id, rating: 5, comment: 'Too early to review this one.' }))
  rec('POST /hirings/:id/complete', await technova.call('post', `/hirings/${hiring.id}/complete`))
  rec('POST /reviews', await technova.call('post', '/reviews', { hiringId: hiring.id, rating: 5, comment: 'Delivered exactly what we needed.' }))
  rec('POST /reviews (other side)', await aarav.call('post', '/reviews', { hiringId: hiring.id, rating: 4, comment: 'Clear brief and fast feedback.' }))
  rec('ERR duplicate review', await technova.call('post', '/reviews', { hiringId: hiring.id, rating: 5, comment: 'Reviewing the same hiring twice.' }))
  const second = await technova.call('post', '/projects', { title: 'Contract Cancel Project', description: 'A project the contract test hires for and then cancels.', budgetMin: 10000, budgetMax: 20000, deadline: new Date(Date.now() + 30 * 864e5).toISOString(), skills: ['React'] })
  const sp = await priya.call('post', `/projects/${second.id}/proposals`, { coverLetter: 'I can deliver this contract test project quickly and with clear communication throughout.', bidAmount: 15000, estimatedDays: 12 })
  await technova.call('post', `/proposals/${sp.id}/shortlist`); const h2 = await technova.call('post', `/proposals/${sp.id}/accept`)
  rec('POST /hirings/:id/cancel', await technova.call('post', `/hirings/${h2.id}/cancel`, { reason: 'Priorities changed for this project.' }))
  rec('POST /projects/:id/close', await technova.call('post', `/projects/${(await technova.call('post', '/projects', { title: 'Contract Close Project', description: 'A project the contract test creates only to close it.', budgetMin: 10000, budgetMax: 20000, deadline: new Date(Date.now() + 30 * 864e5).toISOString(), skills: ['React'] })).id}/close`))
  rec('POST /proposals/:id/reject', await technova.call('post', `/proposals/${(await rohan.call('get', '/proposals/mine')).find((p) => p.project.title === 'Warehouse Route Optimizer').id}/reject`))
  rec('POST /proposals/:id/withdraw', await priya.call('post', `/proposals/${(await priya.call('get', '/proposals/mine')).find((p) => p.project.title === 'Mobile App UI Redesign').id}/withdraw`))

  // profile, notifications, reports, admin actions
  rec('PUT /profiles/me (freelancer)', await aarav.call('put', '/profiles/me', { name: 'Aarav Sharma', profile: { headline: 'Full-stack developer', skills: ['React', 'Node.js', 'PostgreSQL', 'Express'] } }))
  rec('PUT /profiles/me (company)', await technova.call('put', '/profiles/me', { profile: { industry: 'Software', website: 'https://technova.example.com' } }))
  const notes = await aarav.call('get', '/notifications')
  rec('POST /notifications/:id/read', await aarav.call('post', `/notifications/${notes[0].id}/read`))
  rec('POST /notifications/read-all', await aarav.call('post', '/notifications/read-all'))
  rec('POST /reports', await aarav.call('post', '/reports', { targetType: 'PROJECT', targetId: p3.id, reason: 'This project asks for unpaid sample work before hiring.' }))
  rec('ERR duplicate report', await aarav.call('post', '/reports', { targetType: 'PROJECT', targetId: p3.id, reason: 'This project asks for unpaid sample work before hiring.' }))
  const rohanId = find(users, (u) => u.email === 'rohan@skillmatch.dev').id
  rec('POST /admin/users/:id/suspend', await admin.call('post', `/admin/users/${rohanId}/suspend`))
  rec('POST /admin/users/:id/reinstate', await admin.call('post', `/admin/users/${rohanId}/reinstate`))
  rec('POST /admin/reports/:id/resolve', await admin.call('post', `/admin/reports/${reports[0].id}/resolve`))
  const skill = rec('POST /admin/skills', await admin.call('post', '/admin/skills', { name: 'GraphQL' }))
  rec('ERR duplicate skill', await admin.call('post', '/admin/skills', { name: 'graphql' }))
  rec('DELETE /admin/skills/:id', await admin.call('delete', `/admin/skills/${skill.id}`))
  // auth
  rec('ERR wrong password', await world(w).call('post', '/auth/login', { email: 'aarav@skillmatch.dev', password: 'WrongPassw0rd1' }))
  rec('ERR duplicate registration', await world(w).call('post', '/auth/register', { name: 'Another Aarav', email: 'AARAV@skillmatch.dev', password: 'Str0ngPassw0rd', role: 'FREELANCER' }))
  rec('POST /auth/register', await world(w).call('post', '/auth/register', { name: 'New Person', email: 'new.person@example.com', password: 'Str0ngPassw0rd', role: 'COMPANY' }))
  rec('POST /auth/login', await world(w).call('post', '/auth/login', { email: 'priya@skillmatch.dev', password: PASSWORD }))
  rec('POST /auth/forgot-password', await world(w).call('post', '/auth/forgot-password', { email: 'priya@skillmatch.dev' }))
  rec('ERR unauthenticated', await world(w).call('get', '/auth/me'))
  return R
}
const world = (w) => w.anonymous

// ---- shapes
const merge = (a, b) => {
  if (a === undefined) return b; if (b === undefined) return a
  if (a.kind === 'object' && b.kind === 'object') { const keys = { ...a.keys }; for (const [k, v] of Object.entries(b.keys)) keys[k] = merge(keys[k], v); return { kind: 'object', keys } }
  if (a.kind === 'array' && b.kind === 'array') return { kind: 'array', of: merge(a.of, b.of) }
  const types = new Set([...(a.types ?? [a.kind]), ...(b.types ?? [b.kind])]); return { kind: 'mixed', types }
}
const describe_ = (v) => v === null ? { kind: 'null' } : Array.isArray(v) ? { kind: 'array', of: v.map(describe_).reduce(merge, undefined) } : typeof v === 'object' ? { kind: 'object', keys: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, describe_(x)])) } : { kind: typeof v }
const typesOf = (d) => d.types ?? new Set([d.kind])
// Differences where the REAL response would break something the MOCK response supports: a missing key, or an incompatible type
function missing(m, r, path = '') {
  if (!m || !r) return m && !r ? [`${path || '(root)'}: missing in real`] : []
  if (m.kind === 'null' || r.kind === 'null') return []   // null is "no data here": compatible with anything
  if (m.kind === 'object' && r.kind === 'object') return Object.entries(m.keys).flatMap(([k, v]) => (k in r.keys ? missing(v, r.keys[k], `${path}.${k}`) : [`${path}.${k}: missing in real`]))
  if (m.kind === 'array' && r.kind === 'array') return missing(m.of, r.of, `${path}[]`)
  const mt = typesOf(m), rt = typesOf(r)
  return [...mt].every((t) => t === 'null' || rt.has(t)) || rt.has('null') ? [] : [`${path}: mock ${[...mt].join('|')} vs real ${[...rt].join('|')}`]
}

describe('API contract: the real backend answers everything the frontend\'s mock answers, in the same shape', () => {
  let mockR, realR
  beforeAll(async () => { await freshDatabase(); resetDb(); realR = await scenario(realWorld); mockR = await scenario(mockWorld) }, 120000)

  it('ran every step in both worlds', () => { expect(Object.keys(realR)).toEqual(Object.keys(mockR)); expect(Object.keys(realR).length).toBeGreaterThan(55) })

  it('error responses use the same status and code', () => {
    const diffs = Object.keys(mockR).filter((k) => k.startsWith('ERR')).filter((k) => JSON.stringify(mockR[k].__error) !== JSON.stringify(realR[k].__error))
      .map((k) => `${k}: mock ${JSON.stringify(mockR[k].__error)} vs real ${JSON.stringify(realR[k].__error)}`)
    expect(diffs).toEqual([])
  })
  // The ONLY places the real API deliberately gives less than the mock. Each is on purpose, and the static
  // check below proves the frontend does not read any of them.
  const KNOWN = {
    'GET /profiles/:companyId.email': "the real API never reveals another user's email address (owner and admins only)",
    'GET /profiles/:freelancerId.email': "the real API never reveals another user's email address (owner and admins only)",
    'GET /proposals/:id/demo (company).description': "a demo's description is released to the company together with the link, not before",
    'GET /admin/users[].profile': 'the admin user list is a lean list: no profile payload per user',
    'POST /admin/users/:id/suspend.profile': 'admin actions return the lean user, not the full profile',
    'POST /admin/users/:id/reinstate.profile': 'admin actions return the lean user, not the full profile',
    'POST /auth/register.token': 'the real API uses an httpOnly session cookie, never a token the page can read',
    'POST /auth/login.token': 'the real API uses an httpOnly session cookie, never a token the page can read',
  }
  it('every success response contains everything the mock provides, except the documented differences', () => {
    const diffs = Object.keys(mockR).filter((k) => !k.startsWith('ERR')).flatMap((k) => {
      expect(mockR[k]?.__error, `mock failed at ${k}`).toBeUndefined(); expect(realR[k]?.__error, `real failed at ${k}: ${JSON.stringify(realR[k]?.__error)}`).toBeUndefined()
      return missing(describe_(mockR[k]), describe_(realR[k])).map((d) => d.replace(': missing in real', '')).map((d) => `${k}${d}`)
    })
    expect(diffs.sort()).toEqual(Object.keys(KNOWN).sort())   // nothing new, and nothing on the list that has since gone away
  })

  it('the frontend never reads any of the fields the real API deliberately omits', () => {
    const files = []
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(jsx?|js)$/.test(e.name) && files.push(path.join(d, e.name))))
    walk(path.resolve('src'))
    const live = files.filter((f) => !/[\\/]data[\\/]/.test(f) && !f.endsWith('apiClient.js'))   // the mock server itself is allowed to know about them
    const text = (f) => fs.readFileSync(f, 'utf8')
    expect(live.filter((f) => /\.token\b/.test(text(f)))).toEqual([])                                 // no token handling anywhere
    expect(live.filter((f) => /(?<!\buser)\.profile\.email\b|profile\??\.email/.test(text(f)))).toEqual([])   // no email read from someone else's profile
    expect(live.filter((f) => /\bu\.profile\b/.test(text(f)))).toEqual([])                          // admin user rows don't use .profile
    const readsDemoDescription = live.filter((f) => /demo\??\.description/.test(text(f))).map((f) => path.basename(f))
    expect(readsDemoDescription).toEqual(['ProposalDetail.jsx'])                                        // only the freelancer's own proposal page, which does receive it
  })
})
