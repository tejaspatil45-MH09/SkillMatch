import { withTransaction } from '../../db/tx.js'
import { conflict, forbidden, notFound } from '../../utils/ApiError.js'
import { hiringView } from '../hirings/view.js'
import { notify } from '../notifications/service.js'
import { loadProposals } from './queries.js'

const ownerError = () => forbidden('This project belongs to another company.')
const one = async (db, viewer, id) => (await loadProposals(db, viewer, { where: 'pr.id = $1', params: [id] }))[0]

export async function getProposal(db, viewer, id) {
  const p = await one(db, viewer, id)
  if (!p) throw notFound('Proposal')
  if (p.freelancerId !== viewer.id && p.project.companyId !== viewer.id && viewer.role !== 'ADMIN') throw forbidden('You cannot view this proposal.')
  return p
}
export const listMine = (db, user) => loadProposals(db, user, { where: 'pr.freelancer_id = $1', params: [user.id] })
export const listForCompany = (db, user) => loadProposals(db, user, { where: 'p.company_id = $1', params: [user.id] })

export async function listForProject(db, user, projectId) {
  const { rows: [p] } = await db.query('SELECT company_id FROM projects WHERE id = $1', [projectId])
  if (!p) throw notFound('Project')
  if (p.company_id !== user.id) throw ownerError()
  return loadProposals(db, user, { where: 'pr.project_id = $1', params: [projectId], order: 'skill_match DESC, pr.created_at DESC' })
}

export async function submitProposal(db, user, projectId, input) {
  const id = await withTransaction(async (c) => {
    // FOR SHARE: a simultaneous "close project" (which needs FOR UPDATE) waits for us, then rejects our proposal too
    const { rows: [p] } = await c.query('SELECT p.id, p.company_id, p.status, p.title, u.status AS company_status FROM projects p JOIN users u ON u.id = p.company_id WHERE p.id = $1 FOR SHARE OF p', [projectId])
    if (!p) throw notFound('Project')
    if (p.status !== 'OPEN' || p.company_status === 'SUSPENDED') throw conflict('This project is no longer accepting proposals.', 'INVALID_STATE')
    let proposal
    try {
      ;({ rows: [proposal] } = await c.query('INSERT INTO proposals (project_id, freelancer_id, cover_letter, bid_amount, estimated_days) VALUES ($1,$2,$3,$4,$5) RETURNING id', [projectId, user.id, input.coverLetter, input.bidAmount, input.estimatedDays]))
    } catch (e) {
      // The unique (project, freelancer) constraint is the real guard, so two simultaneous submits can't both win
      if (e.code === '23505') throw conflict('You have already submitted a proposal for this project.', 'DUPLICATE_PROPOSAL')
      throw e
    }
    await notify(c, p.company_id, 'PROPOSAL', `${user.name} submitted a proposal for "${p.title}".`, `/company/projects/${p.id}/proposals`)
    return proposal.id
  }, db)
  return one(db, user, id)
}

// Lock the proposal row, THEN read its state: a concurrent action that got there first is seen, not overwritten.
async function lockProposal(c, id) {
  const { rows: [pr] } = await c.query(
    `SELECT pr.id, pr.status, pr.project_id, pr.freelancer_id, p.company_id, p.status AS project_status, p.title, fu.status AS freelancer_status
     FROM proposals pr JOIN projects p ON p.id = pr.project_id JOIN users fu ON fu.id = pr.freelancer_id WHERE pr.id = $1 FOR UPDATE OF pr`, [id])
  if (!pr) throw notFound('Proposal')
  return pr
}
const assertOwner = (pr, user) => { if (pr.company_id !== user.id) throw ownerError() }
// A suspended freelancer's proposals are out of reach: the company can't act on what it can't see
const assertActionable = (pr) => { if (pr.freelancer_status === 'SUSPENDED') throw notFound('Proposal') }

export async function shortlist(db, user, id) {
  await withTransaction(async (c) => {
    const pr = await lockProposal(c, id); assertOwner(pr, user); assertActionable(pr)
    if (pr.status !== 'PENDING') throw conflict('Only pending proposals can be shortlisted.', 'INVALID_STATE')
    if (pr.project_status !== 'OPEN') throw conflict('This project is not open.', 'INVALID_STATE')
    await c.query("UPDATE proposals SET status = 'SHORTLISTED' WHERE id = $1", [id])
    await notify(c, pr.freelancer_id, 'SHORTLISTED', `Your proposal for "${pr.title}" has been shortlisted.`, `/freelancer/proposals/${id}`)
  }, db)
  return one(db, user, id)
}

export async function reject(db, user, id) {
  await withTransaction(async (c) => {
    const pr = await lockProposal(c, id); assertOwner(pr, user); assertActionable(pr)
    if (!['PENDING', 'SHORTLISTED'].includes(pr.status)) throw conflict('This proposal can no longer be rejected.', 'INVALID_STATE')
    await c.query("UPDATE proposals SET status = 'REJECTED' WHERE id = $1", [id])
    await notify(c, pr.freelancer_id, 'REJECTED', `Your proposal for "${pr.title}" has been rejected.`, `/freelancer/proposals/${id}`)
  }, db)
  return one(db, user, id)
}

export async function withdraw(db, user, id) {
  await withTransaction(async (c) => {
    const pr = await lockProposal(c, id)
    if (pr.freelancer_id !== user.id) throw forbidden('You can only withdraw your own proposals.')
    if (!['PENDING', 'SHORTLISTED'].includes(pr.status)) throw conflict('This proposal can no longer be withdrawn.', 'INVALID_STATE')
    await c.query("UPDATE proposals SET status = 'WITHDRAWN' WHERE id = $1", [id])
  }, db)
  return one(db, user, id)
}

// Hire: accept this proposal, reject every other one, move the project to IN_PROGRESS and create the hiring, as ONE unit.
// Lock order is always project first, then proposals, so concurrent accepts queue up instead of deadlocking.
export async function accept(db, user, id) {
  const hiringId = await withTransaction(async (c) => {
    const { rows: [ref] } = await c.query('SELECT project_id FROM proposals WHERE id = $1', [id])
    if (!ref) throw notFound('Proposal')
    const { rows: [project] } = await c.query('SELECT id, company_id, status, title FROM projects WHERE id = $1 FOR UPDATE', [ref.project_id])
    if (project.company_id !== user.id) throw ownerError()
    const pr = await lockProposal(c, id)
    assertActionable(pr)
    if (pr.status !== 'SHORTLISTED') throw conflict('Only shortlisted proposals can be accepted.', 'INVALID_STATE')
    if (project.status !== 'OPEN') throw conflict('This project is not open.', 'INVALID_STATE')

    await c.query("UPDATE proposals SET status = 'ACCEPTED' WHERE id = $1", [id])
    await c.query("UPDATE projects SET status = 'IN_PROGRESS' WHERE id = $1", [project.id])
    const { rows: others } = await c.query("UPDATE proposals SET status = 'REJECTED' WHERE project_id = $1 AND id <> $2 AND status IN ('PENDING', 'SHORTLISTED') RETURNING id, freelancer_id", [project.id, id])
    for (const o of others) await notify(c, o.freelancer_id, 'REJECTED', `Your proposal for "${project.title}" has been rejected.`, `/freelancer/proposals/${o.id}`)
    let hiring
    try {
      ;({ rows: [hiring] } = await c.query('INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id) VALUES ($1,$2,$3,$4) RETURNING id', [id, project.id, pr.freelancer_id, user.id]))
    } catch (e) {
      if (e.code === '23505') throw conflict('This project already has a hiring.', 'INVALID_STATE')   // database backstop
      throw e
    }
    await notify(c, pr.freelancer_id, 'HIRED', `You have been hired for "${project.title}".`, '/freelancer/hirings')
    return hiring.id
  }, db)
  return hiringView(db, hiringId)
}
