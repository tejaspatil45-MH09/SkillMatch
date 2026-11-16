// In-browser stand-in for the Express API. Every rule here (ownership, demo access,
// status transitions) is something the real backend must enforce. Do not trust the UI.
import { getDb, save, uid, resetDb } from './mockDb'
import { DEMO_PASSWORD } from './mockUsers'
import { ApiError } from '../utils/ApiError'
import { skillMatch } from '../utils/skillMatch'

const DEMO_WINDOW_MS = 24 * 36e5
const now = () => new Date().toISOString()
const fail = (status, message, code) => { throw new ApiError(status, message, code) }
const byId = (list, id) => list.find((x) => x.id === id)
const publicUser = ({ password: _password, ...u }) => u
const requireRole = (u, ...roles) => { if (!roles.includes(u.role)) fail(403, 'You do not have permission to do this.', 'FORBIDDEN') }

function notify(db, userId, type, message, link) {
  db.notifications.unshift({ id: uid('n'), userId, type, message, link, read: false, createdAt: now() })
}
const demoStatus = (d) => (d.viewedAt ? 'VIEWED' : Date.parse(d.expiresAt) < Date.now() ? 'EXPIRED' : 'AVAILABLE')
// Metadata only. The demo URL is never included here.
const demoMeta = (d) => d && { id: d.id, status: demoStatus(d), submittedAt: d.submittedAt, expiresAt: d.expiresAt, viewedAt: d.viewedAt, description: d.description }
const avgRating = (db, userId) => {
  const r = db.reviews.filter((x) => x.revieweeId === userId)
  return { rating: r.length ? +(r.reduce((s, x) => s + x.rating, 0) / r.length).toFixed(1) : null, reviewCount: r.length }
}
const companyCard = (db, id) => { const c = byId(db.users, id); return { id, name: c.name, ...c.profile, ...avgRating(db, id) } }

function projectView(db, p, user) {
  const v = { ...p, company: companyCard(db, p.companyId), proposalCount: db.proposals.filter((x) => x.projectId === p.id).length }
  if (user.role === 'FREELANCER') {
    const mine = db.proposals.find((x) => x.projectId === p.id && x.freelancerId === user.id)
    v.skillMatch = skillMatch(p.skills, byId(db.users, user.id).profile.skills)
    v.hasApplied = !!mine; v.proposalId = mine?.id ?? null
  }
  return v
}
function proposalView(db, pr, user) {
  const project = byId(db.projects, pr.projectId), f = byId(db.users, pr.freelancerId)
  const demo = db.demos.find((d) => d.proposalId === pr.id)
  return { ...pr,
    project: { id: project.id, title: project.title, status: project.status, skills: project.skills, companyId: project.companyId, companyName: byId(db.users, project.companyId).name },
    freelancer: { id: f.id, name: f.name, ...f.profile, ...avgRating(db, f.id) },
    skillMatch: skillMatch(project.skills, f.profile.skills), demo: demoMeta(demo), viewerIsOwner: project.companyId === user.id }
}
function hiringView(db, h) {
  return { ...h, project: { id: h.projectId, title: byId(db.projects, h.projectId).title },
    freelancer: { id: h.freelancerId, name: byId(db.users, h.freelancerId).name }, company: { id: h.companyId, name: byId(db.users, h.companyId).name },
    reviews: db.reviews.filter((r) => r.hiringId === h.id) }
}
const ownProject = (db, id, user) => {
  const p = byId(db.projects, id) ?? fail(404, 'Project not found.', 'NOT_FOUND')
  if (p.companyId !== user.id) fail(403, 'This project belongs to another company.', 'FORBIDDEN')
  return p
}
const ownProposalAsCompany = (db, id, user) => {
  const pr = byId(db.proposals, id) ?? fail(404, 'Proposal not found.', 'NOT_FOUND')
  ownProject(db, pr.projectId, user); return pr
}
const profileCompletion = (p) => {
  const checks = [p.headline, p.bio, p.location, p.experienceYears != null, p.skills?.length >= 3, p.portfolio?.length >= 1]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}
const REQUIRED = (body, ...keys) => keys.forEach((k) => { if (body[k] === undefined || body[k] === '') fail(400, `${k} is required.`, 'VALIDATION') })

// ---------- routes: [method, path, handler({db, user, params, query, body})] ----------
const routes = [
  // Auth
  ['POST', '/auth/login', ({ db, body }) => {
    const u = db.users.find((x) => x.email.toLowerCase() === (body.email ?? '').toLowerCase())
    if (!u || (body.password !== (u.password ?? DEMO_PASSWORD))) fail(401, 'Incorrect email or password.', 'INVALID_CREDENTIALS')
    if (u.status === 'SUSPENDED') fail(403, 'This account has been suspended.', 'SUSPENDED')
    return { user: publicUser(u), token: u.id }
  }, true],
  ['POST', '/auth/register', ({ db, body }) => {
    REQUIRED(body, 'name', 'email', 'password', 'role')
    if (!['FREELANCER', 'COMPANY'].includes(body.role)) fail(400, 'Role must be Freelancer or Company.', 'VALIDATION')
    if (db.users.some((x) => x.email.toLowerCase() === body.email.toLowerCase())) fail(409, 'An account with this email already exists.', 'EMAIL_TAKEN')
    const u = { id: uid('u'), name: body.name, email: body.email, password: body.password, role: body.role, status: 'ACTIVE', createdAt: now(),
      profile: body.role === 'FREELANCER' ? { headline: '', location: '', experienceYears: null, bio: '', photo: null, skills: [], portfolio: [], experience: [] } : { description: '', website: '', location: '', industry: '', logo: null } }
    db.users.push(u); return { user: publicUser(u), token: u.id }
  }, true],
  ['POST', '/auth/forgot-password', () => ({ message: 'If an account exists for this email, a reset link has been sent.' }), true],
  // Mock mode sends no email; a token of the form "mock-<email>" stands in for the emailed link
  ['POST', '/auth/reset-password', ({ db, body }) => {
    const u = db.users.find((x) => `mock-${x.email}` === body.token)
    if (!u) fail(400, 'This reset link is invalid or has expired.', 'INVALID_TOKEN')
    u.password = body.password
    return { message: 'Your password has been changed. Please log in.' }
  }, true],
  ['GET', '/auth/me', ({ user }) => ({ user: publicUser(user) })],
  ['POST', '/auth/logout', () => ({ ok: true })],

  // Profiles and skills
  ['GET', '/profiles/:id', ({ db, params }) => {
    const u = byId(db.users, params.id) ?? fail(404, 'Profile not found.', 'NOT_FOUND')
    return { ...publicUser(u), ...avgRating(db, u.id), profileCompletion: u.role === 'FREELANCER' ? profileCompletion(u.profile) : null,
      reviews: db.reviews.filter((r) => r.revieweeId === u.id).map((r) => ({ ...r, reviewerName: byId(db.users, r.reviewerId).name })) }
  }],
  ['PUT', '/profiles/me', ({ db, user, body }) => { const u = byId(db.users, user.id); if (body.name) u.name = body.name; u.profile = { ...u.profile, ...body.profile }; return { user: publicUser(u) } }],
  ['GET', '/skills', ({ db }) => db.skills],

  // Projects
  ['GET', '/projects', ({ db, user, query }) => {
    let list = db.projects.filter((p) => p.status === 'OPEN')
    if (query.q) list = list.filter((p) => (p.title + p.description).toLowerCase().includes(query.q.toLowerCase()))
    if (query.skills) { const s = query.skills.split(',').map((x) => x.toLowerCase()); list = list.filter((p) => p.skills.some((k) => s.includes(k.toLowerCase()))) }
    if (query.minBudget) list = list.filter((p) => p.budgetMax >= +query.minBudget)
    if (query.maxBudget) list = list.filter((p) => p.budgetMin <= +query.maxBudget)
    if (query.deadlineBefore) list = list.filter((p) => Date.parse(p.deadline) <= Date.parse(query.deadlineBefore))
    list = list.map((p) => projectView(db, p, user))
    const sorts = { match: (a, b) => (b.skillMatch ?? 0) - (a.skillMatch ?? 0), newest: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      budget: (a, b) => b.budgetMax - a.budgetMax, deadline: (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline) }
    return list.sort(sorts[query.sort] ?? sorts.newest)
  }],
  ['GET', '/projects/:id', ({ db, user, params }) => {
    const p = byId(db.projects, params.id) ?? fail(404, 'Project not found.', 'NOT_FOUND')
    if (p.status !== 'OPEN' && user.role === 'FREELANCER' && !db.proposals.some((x) => x.projectId === p.id && x.freelancerId === user.id)) fail(404, 'Project not found.', 'NOT_FOUND')
    return projectView(db, p, user)
  }],
  ['GET', '/company/projects', ({ db, user }) => { requireRole(user, 'COMPANY'); return db.projects.filter((p) => p.companyId === user.id).map((p) => projectView(db, p, user)) }],
  ['POST', '/projects', ({ db, user, body }) => {
    requireRole(user, 'COMPANY'); REQUIRED(body, 'title', 'description', 'budgetMin', 'budgetMax', 'deadline')
    if (!body.skills?.length) fail(400, 'Select at least one required skill.', 'VALIDATION')
    if (+body.budgetMin > +body.budgetMax) fail(400, 'Minimum budget cannot exceed maximum budget.', 'VALIDATION')
    const p = { id: uid('p'), companyId: user.id, title: body.title, description: body.description, budgetMin: +body.budgetMin, budgetMax: +body.budgetMax, deadline: body.deadline, skills: body.skills, status: 'OPEN', createdAt: now() }
    db.projects.unshift(p); return p
  }],
  ['PUT', '/projects/:id', ({ db, user, params, body }) => {
    const p = ownProject(db, params.id, user)
    if (p.status !== 'OPEN') fail(409, 'Only open projects can be edited.', 'INVALID_STATE')
    const hasProposals = db.proposals.some((x) => x.projectId === p.id)
    if (hasProposals && body.skills && JSON.stringify(body.skills) !== JSON.stringify(p.skills)) fail(409, 'Required skills are locked once proposals exist.', 'SKILLS_LOCKED')
    Object.assign(p, ['title', 'description', 'budgetMin', 'budgetMax', 'deadline', 'skills'].reduce((o, k) => (body[k] !== undefined ? { ...o, [k]: body[k] } : o), {}))
    return p
  }],
  ['POST', '/projects/:id/close', ({ db, user, params }) => {
    const p = ownProject(db, params.id, user)
    if (p.status !== 'OPEN') fail(409, 'Only open projects can be closed.', 'INVALID_STATE')
    p.status = 'CANCELLED'
    db.proposals.filter((x) => x.projectId === p.id && ['PENDING', 'SHORTLISTED'].includes(x.status)).forEach((x) => { x.status = 'REJECTED'; notify(db, x.freelancerId, 'REJECTED', `"${p.title}" was closed by the company.`, `/freelancer/proposals/${x.id}`) })
    return p
  }],

  // Proposals
  ['POST', '/projects/:id/proposals', ({ db, user, params, body }) => {
    requireRole(user, 'FREELANCER'); REQUIRED(body, 'coverLetter', 'bidAmount', 'estimatedDays')
    const p = byId(db.projects, params.id) ?? fail(404, 'Project not found.', 'NOT_FOUND')
    if (p.status !== 'OPEN') fail(409, 'This project is no longer accepting proposals.', 'INVALID_STATE')
    if (db.proposals.some((x) => x.projectId === p.id && x.freelancerId === user.id)) fail(409, 'You have already submitted a proposal for this project.', 'DUPLICATE_PROPOSAL')
    const pr = { id: uid('pr'), projectId: p.id, freelancerId: user.id, coverLetter: body.coverLetter, bidAmount: +body.bidAmount, estimatedDays: +body.estimatedDays, status: 'PENDING', createdAt: now() }
    db.proposals.push(pr); notify(db, p.companyId, 'PROPOSAL', `${user.name} submitted a proposal for "${p.title}".`, `/company/projects/${p.id}/proposals`)
    return proposalView(db, pr, user)
  }],
  ['GET', '/proposals/mine', ({ db, user }) => { requireRole(user, 'FREELANCER'); return db.proposals.filter((x) => x.freelancerId === user.id).map((x) => proposalView(db, x, user)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) }],
  ['GET', '/company/proposals', ({ db, user }) => { requireRole(user, 'COMPANY'); return db.proposals.filter((x) => byId(db.projects, x.projectId).companyId === user.id).map((x) => proposalView(db, x, user)) }],
  ['GET', '/projects/:id/proposals', ({ db, user, params }) => { ownProject(db, params.id, user); return db.proposals.filter((x) => x.projectId === params.id).map((x) => proposalView(db, x, user)).sort((a, b) => b.skillMatch - a.skillMatch) }],
  ['GET', '/proposals/:id', ({ db, user, params }) => {
    const pr = byId(db.proposals, params.id) ?? fail(404, 'Proposal not found.', 'NOT_FOUND')
    const isOwnerCompany = byId(db.projects, pr.projectId).companyId === user.id
    if (pr.freelancerId !== user.id && !isOwnerCompany && user.role !== 'ADMIN') fail(403, 'You cannot view this proposal.', 'FORBIDDEN')
    return proposalView(db, pr, user)
  }],
  ['POST', '/proposals/:id/shortlist', ({ db, user, params }) => {
    const pr = ownProposalAsCompany(db, params.id, user)
    if (pr.status !== 'PENDING') fail(409, 'Only pending proposals can be shortlisted.', 'INVALID_STATE')
    pr.status = 'SHORTLISTED'; notify(db, pr.freelancerId, 'SHORTLISTED', `Your proposal for "${byId(db.projects, pr.projectId).title}" has been shortlisted.`, `/freelancer/proposals/${pr.id}`)
    return proposalView(db, pr, user)
  }],
  ['POST', '/proposals/:id/reject', ({ db, user, params }) => {
    const pr = ownProposalAsCompany(db, params.id, user)
    if (!['PENDING', 'SHORTLISTED'].includes(pr.status)) fail(409, 'This proposal can no longer be rejected.', 'INVALID_STATE')
    pr.status = 'REJECTED'; notify(db, pr.freelancerId, 'REJECTED', `Your proposal for "${byId(db.projects, pr.projectId).title}" has been rejected.`, `/freelancer/proposals/${pr.id}`)
    return proposalView(db, pr, user)
  }],
  ['POST', '/proposals/:id/withdraw', ({ db, user, params }) => {
    const pr = byId(db.proposals, params.id) ?? fail(404, 'Proposal not found.', 'NOT_FOUND')
    if (pr.freelancerId !== user.id) fail(403, 'You can only withdraw your own proposals.', 'FORBIDDEN')
    if (!['PENDING', 'SHORTLISTED'].includes(pr.status)) fail(409, 'This proposal can no longer be withdrawn.', 'INVALID_STATE')
    pr.status = 'WITHDRAWN'; return proposalView(db, pr, user)
  }],
  // Accepting creates the hiring, rejects the others, and moves the project to IN_PROGRESS
  ['POST', '/proposals/:id/accept', ({ db, user, params }) => {
    const pr = ownProposalAsCompany(db, params.id, user), p = byId(db.projects, pr.projectId)
    if (pr.status !== 'SHORTLISTED') fail(409, 'Only shortlisted proposals can be accepted.', 'INVALID_STATE')
    if (p.status !== 'OPEN') fail(409, 'This project is not open.', 'INVALID_STATE')
    pr.status = 'ACCEPTED'; p.status = 'IN_PROGRESS'
    db.proposals.filter((x) => x.projectId === p.id && x.id !== pr.id && ['PENDING', 'SHORTLISTED'].includes(x.status))
      .forEach((x) => { x.status = 'REJECTED'; notify(db, x.freelancerId, 'REJECTED', `Your proposal for "${p.title}" has been rejected.`, `/freelancer/proposals/${x.id}`) })
    const h = { id: uid('h'), proposalId: pr.id, projectId: p.id, freelancerId: pr.freelancerId, companyId: user.id, status: 'ACTIVE', startDate: now(), completedAt: null }
    db.hirings.push(h); notify(db, pr.freelancerId, 'HIRED', `You have been hired for "${p.title}".`, '/freelancer/hirings')
    return hiringView(db, h)
  }],

  // Secure demo access
  ['POST', '/proposals/:id/demo', ({ db, user, params, body }) => {
    const pr = byId(db.proposals, params.id) ?? fail(404, 'Proposal not found.', 'NOT_FOUND')
    if (pr.freelancerId !== user.id) fail(403, 'You can only submit demos for your own proposals.', 'FORBIDDEN')
    if (pr.status !== 'SHORTLISTED') fail(409, 'Demos can only be submitted for shortlisted proposals.', 'INVALID_STATE')
    if (db.demos.some((d) => d.proposalId === pr.id)) fail(409, 'A demo has already been submitted for this proposal.', 'DUPLICATE_DEMO')
    REQUIRED(body, 'url', 'description')
    // Only http(s) links: blocks javascript: and other schemes from ever being stored
    if (!/^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i.test(body.url)) fail(400, 'Enter a valid http or https URL.', 'VALIDATION')
    const d = { id: uid('d'), proposalId: pr.id, url: body.url, description: body.description, submittedAt: now(), expiresAt: new Date(Date.now() + DEMO_WINDOW_MS).toISOString(), viewedAt: null }
    db.demos.push(d); const p = byId(db.projects, pr.projectId)
    notify(db, p.companyId, 'DEMO', `${user.name} submitted a demo for "${p.title}".`, `/company/proposals/${pr.id}/demo`)
    return demoMeta(d)
  }],
  // Status check: safe to call repeatedly, never returns the URL, never consumes access
  ['GET', '/proposals/:id/demo', ({ db, user, params }) => {
    const pr = byId(db.proposals, params.id) ?? fail(404, 'Proposal not found.', 'NOT_FOUND')
    const isOwnerCompany = byId(db.projects, pr.projectId).companyId === user.id
    if (pr.freelancerId !== user.id && !isOwnerCompany) fail(403, 'Access denied.', 'ACCESS_DENIED')
    const d = db.demos.find((x) => x.proposalId === pr.id)
    return d ? demoMeta(d) : fail(404, 'No demo has been submitted yet.', 'NO_DEMO')
  }],
  // The single-use authorisation call: POST /api/demos/:demoId/access
  ['POST', '/demos/:id/access', ({ db, user, params }) => {
    const d = byId(db.demos, params.id) ?? fail(404, 'Demo not found.', 'NOT_FOUND')
    const pr = byId(db.proposals, d.proposalId), p = byId(db.projects, pr.projectId)
    if (user.role !== 'COMPANY' || p.companyId !== user.id) fail(403, 'Access denied.', 'ACCESS_DENIED')
    if (d.viewedAt) fail(410, 'This demo has already been viewed.', 'DEMO_VIEWED')
    if (Date.parse(d.expiresAt) < Date.now()) fail(410, 'The 24-hour access window has expired.', 'DEMO_EXPIRED')
    d.viewedAt = now()
    notify(db, pr.freelancerId, 'DEMO_VIEWED', `Your demo for "${p.title}" was viewed.`, `/freelancer/proposals/${pr.id}`)
    return { url: d.url, description: d.description, viewedAt: d.viewedAt }
  }],
  // Freelancer can issue a fresh window if the demo was viewed or expired (and the proposal is still shortlisted)
  ['POST', '/demos/:id/reissue', ({ db, user, params }) => {
    const d = byId(db.demos, params.id) ?? fail(404, 'Demo not found.', 'NOT_FOUND')
    const pr = byId(db.proposals, d.proposalId)
    if (pr.freelancerId !== user.id) fail(403, 'Access denied.', 'ACCESS_DENIED')
    if (pr.status !== 'SHORTLISTED') fail(409, 'This proposal is no longer shortlisted.', 'INVALID_STATE')
    if (demoStatus(d) === 'AVAILABLE') fail(409, 'This demo is still available.', 'INVALID_STATE')
    Object.assign(d, { submittedAt: now(), expiresAt: new Date(Date.now() + DEMO_WINDOW_MS).toISOString(), viewedAt: null })
    const p = byId(db.projects, pr.projectId); notify(db, p.companyId, 'DEMO', `${user.name} re-issued a demo for "${p.title}".`, `/company/proposals/${pr.id}/demo`)
    return demoMeta(d)
  }],

  // Hirings and reviews
  ['GET', '/hirings', ({ db, user }) => { requireRole(user, 'FREELANCER', 'COMPANY'); return db.hirings.filter((h) => (user.role === 'COMPANY' ? h.companyId : h.freelancerId) === user.id).map((h) => hiringView(db, h)) }],
  ['POST', '/hirings/:id/complete', ({ db, user, params }) => {
    const h = byId(db.hirings, params.id) ?? fail(404, 'Hiring not found.', 'NOT_FOUND')
    if (h.companyId !== user.id) fail(403, 'Only the hiring company can complete this project.', 'FORBIDDEN')
    if (h.status !== 'ACTIVE') fail(409, 'Only active hirings can be completed.', 'INVALID_STATE')
    h.status = 'COMPLETED'; h.completedAt = now(); const p = byId(db.projects, h.projectId); p.status = 'COMPLETED'
    notify(db, h.freelancerId, 'COMPLETED', `Project "${p.title}" has been marked completed.`, '/freelancer/hirings'); return hiringView(db, h)
  }],
  ['POST', '/hirings/:id/cancel', ({ db, user, params, body }) => {
    const h = byId(db.hirings, params.id) ?? fail(404, 'Hiring not found.', 'NOT_FOUND')
    if (h.companyId !== user.id) fail(403, 'Only the hiring company can cancel.', 'FORBIDDEN')
    if (h.status !== 'ACTIVE') fail(409, 'Only active hirings can be cancelled.', 'INVALID_STATE')
    if ((body.reason ?? '').trim().length < 10) fail(400, 'Please give a reason (at least 10 characters).', 'VALIDATION')
    h.status = 'CANCELLED'; h.cancelReason = body.reason.trim(); byId(db.projects, h.projectId).status = 'CANCELLED'
    notify(db, h.freelancerId, 'CANCELLED', `Your hiring for "${byId(db.projects, h.projectId).title}" was cancelled.`, '/freelancer/hirings'); return hiringView(db, h)
  }],
  ['POST', '/reviews', ({ db, user, body }) => {
    REQUIRED(body, 'hiringId', 'rating'); const h = byId(db.hirings, body.hiringId) ?? fail(404, 'Hiring not found.', 'NOT_FOUND')
    if (![h.companyId, h.freelancerId].includes(user.id)) fail(403, 'You are not part of this hiring.', 'FORBIDDEN')
    if (h.status !== 'COMPLETED') fail(409, 'Reviews open after the project is completed.', 'INVALID_STATE')
    if (db.reviews.some((r) => r.hiringId === h.id && r.reviewerId === user.id)) fail(409, 'You have already reviewed this hiring.', 'DUPLICATE_REVIEW')
    if (!(body.rating >= 1 && body.rating <= 5)) fail(400, 'Rating must be between 1 and 5.', 'VALIDATION')
    const r = { id: uid('rv'), hiringId: h.id, reviewerId: user.id, revieweeId: user.id === h.companyId ? h.freelancerId : h.companyId, rating: +body.rating, comment: body.comment ?? '', createdAt: now() }
    if (r.comment.length > 500) fail(400, 'Keep the comment under 500 characters.', 'VALIDATION')
    db.reviews.push(r); notify(db, r.revieweeId, 'REVIEW', `${user.name} left you a ${r.rating}-star review.`, user.role === 'COMPANY' ? '/freelancer/profile' : '/company/profile')
    return r
  }],
  ['GET', '/reviews', ({ db, query }) => db.reviews.filter((r) => r.revieweeId === query.userId).map((r) => ({ ...r, reviewerName: byId(db.users, r.reviewerId).name }))],

  // Notifications
  ['GET', '/notifications', ({ db, user }) => db.notifications.filter((n) => n.userId === user.id)],
  ['POST', '/notifications/read-all', ({ db, user }) => { db.notifications.filter((n) => n.userId === user.id).forEach((n) => { n.read = true }); return { ok: true } }],
  ['POST', '/notifications/:id/read', ({ db, user, params }) => { const n = byId(db.notifications, params.id); if (n?.userId === user.id) n.read = true; return n }],

  // Dashboards
  ['GET', '/freelancer/dashboard', ({ db, user }) => {
    requireRole(user, 'FREELANCER'); const mine = db.proposals.filter((x) => x.freelancerId === user.id), me = byId(db.users, user.id)
    const open = db.projects.filter((p) => p.status === 'OPEN' && !mine.some((x) => x.projectId === p.id)).map((p) => projectView(db, p, user)).sort((a, b) => b.skillMatch - a.skillMatch).slice(0, 3)
    const count = (s) => mine.filter((x) => x.status === s).length, h = db.hirings.filter((x) => x.freelancerId === user.id)
    return { profileCompletion: profileCompletion(me.profile), activeProposals: count('PENDING'), shortlisted: count('SHORTLISTED'),
      activeProjects: h.filter((x) => x.status === 'ACTIVE').length, completedProjects: h.filter((x) => x.status === 'COMPLETED').length,
      opportunities: open, notifications: db.notifications.filter((n) => n.userId === user.id).slice(0, 4) }
  }],
  ['GET', '/company/dashboard', ({ db, user }) => {
    requireRole(user, 'COMPANY'); const projects = db.projects.filter((p) => p.companyId === user.id), ids = projects.map((p) => p.id)
    const props = db.proposals.filter((x) => ids.includes(x.projectId)), h = db.hirings.filter((x) => x.companyId === user.id)
    return { activeProjects: projects.filter((p) => p.status === 'IN_PROGRESS').length, openProjects: projects.filter((p) => p.status === 'OPEN').length,
      receivedProposals: props.length, shortlisted: props.filter((x) => x.status === 'SHORTLISTED').length,
      activeHirings: h.filter((x) => x.status === 'ACTIVE').length, completedProjects: projects.filter((p) => p.status === 'COMPLETED').length,
      recentActivity: db.notifications.filter((n) => n.userId === user.id).slice(0, 6) }
  }],

  // Admin
  ['GET', '/admin/stats', ({ db, user }) => {
    requireRole(user, 'ADMIN')
    return { totalUsers: db.users.length, freelancers: db.users.filter((u) => u.role === 'FREELANCER').length, companies: db.users.filter((u) => u.role === 'COMPANY').length,
      projects: db.projects.length, activeProjects: db.projects.filter((p) => ['OPEN', 'IN_PROGRESS'].includes(p.status)).length, reports: db.reports.filter((r) => r.status === 'OPEN').length,
      projectsByStatus: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => ({ status: s, count: db.projects.filter((p) => p.status === s).length })) }
  }],
  ['GET', '/admin/users', ({ db, user }) => { requireRole(user, 'ADMIN'); return db.users.map(publicUser) }],
  ['POST', '/admin/users/:id/suspend', ({ db, user, params }) => { requireRole(user, 'ADMIN'); const u = byId(db.users, params.id); if (u.role === 'ADMIN') fail(409, 'Admin accounts cannot be suspended.', 'INVALID_STATE'); u.status = 'SUSPENDED'; return publicUser(u) }],
  ['POST', '/admin/users/:id/reinstate', ({ db, user, params }) => { requireRole(user, 'ADMIN'); const u = byId(db.users, params.id); u.status = 'ACTIVE'; return publicUser(u) }],
  ['GET', '/admin/projects', ({ db, user }) => { requireRole(user, 'ADMIN'); return db.projects.map((p) => projectView(db, p, user)) }],
  ['GET', '/admin/reports', ({ db, user }) => {
    requireRole(user, 'ADMIN')
    return db.reports.map((r) => {
      const t = r.targetType === 'USER' ? byId(db.users, r.targetId) : byId(db.projects, r.targetId)
      const link = !t ? null : r.targetType === 'PROJECT' ? `/projects/${t.id}` : t.role === 'FREELANCER' ? `/freelancers/${t.id}` : `/companies/${t.id}`
      return { ...r, reporterName: byId(db.users, r.reporterId).name, targetName: t?.name ?? t?.title ?? '(removed)', targetLink: link }
    })
  }],
  ['POST', '/reports', ({ db, user, body }) => {
    REQUIRED(body, 'targetType', 'targetId', 'reason')
    if (!['USER', 'PROJECT'].includes(body.targetType)) fail(400, 'You can report a user or a project.', 'VALIDATION')
    const t = body.targetType === 'USER' ? byId(db.users, body.targetId) : byId(db.projects, body.targetId)
    if (!t) fail(404, 'The item you are reporting could not be found.', 'NOT_FOUND')
    if (body.targetId === user.id || t.companyId === user.id) fail(400, "You can't report your own profile or project.", 'VALIDATION')
    if (body.reason.trim().length < 20) fail(400, 'Please explain the problem (at least 20 characters).', 'VALIDATION')
    if (db.reports.some((r) => r.reporterId === user.id && r.targetType === body.targetType && r.targetId === body.targetId && r.status === 'OPEN')) fail(409, 'You have already reported this. Our team will review it.', 'DUPLICATE_REPORT')
    const r = { id: uid('rp'), reporterId: user.id, targetType: body.targetType, targetId: body.targetId, reason: body.reason.trim(), status: 'OPEN', createdAt: now() }
    db.reports.unshift(r)
    db.users.filter((u) => u.role === 'ADMIN').forEach((a) => notify(db, a.id, 'REPORT', `New report about ${t.name ?? t.title}.`, '/admin/reports'))
    return r
  }],
  ['POST', '/admin/reports/:id/resolve', ({ db, user, params }) => { requireRole(user, 'ADMIN'); const r = byId(db.reports, params.id); r.status = 'RESOLVED'; return r }],
  ['GET', '/admin/skills', ({ db, user }) => {
    requireRole(user, 'ADMIN')
    const usage = (n) => db.projects.filter((p) => p.skills.includes(n)).length + db.users.filter((u) => u.role === 'FREELANCER' && u.profile.skills?.includes(n)).length
    return db.skills.map((s) => ({ ...s, usage: usage(s.name) }))
  }],
  ['POST', '/admin/skills', ({ db, user, body }) => {
    requireRole(user, 'ADMIN'); REQUIRED(body, 'name')
    if (db.skills.some((s) => s.name.toLowerCase() === body.name.toLowerCase())) fail(409, 'This skill already exists.', 'DUPLICATE_SKILL')
    const s = { id: uid('s'), name: body.name }; db.skills.push(s); return s
  }],
  ['DELETE', '/admin/skills/:id', ({ db, user, params }) => { requireRole(user, 'ADMIN'); db.skills = db.skills.filter((s) => s.id !== params.id); return { ok: true } }],
  ['POST', '/dev/reset', () => { resetDb(); return { ok: true } }, true],
]

const compiled = routes.map(([method, path, handler, isPublic]) => ({ method, handler, isPublic, re: new RegExp('^' + path.replace(/:\w+/g, '([^/]+)') + '$'), keys: [...path.matchAll(/:(\w+)/g)].map((m) => m[1]) }))

export function handle(method, path, { body = {}, query = {}, token } = {}) {
  const db = getDb()
  for (const r of compiled) {
    const m = r.method === method && path.match(r.re)
    if (!m) continue
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]))
    const user = token ? byId(db.users, token) : null
    if (!r.isPublic && !user) fail(401, 'Please log in to continue.', 'UNAUTHENTICATED')
    if (user?.status === 'SUSPENDED' && !r.isPublic) fail(403, 'This account has been suspended.', 'SUSPENDED')
    const result = r.handler({ db, user, params, query, body })
    save(); return JSON.parse(JSON.stringify(result))   // deep copy: callers never share references with the "database"
  }
  fail(404, `No route for ${method} ${path}`, 'NOT_FOUND')
}
