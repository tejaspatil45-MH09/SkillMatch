import { notFound } from '../../utils/ApiError.js'

// Only the two parties of a hiring may see or touch anything attached to it (submissions, messages).
// Everyone else, including other companies, other freelancers and admins, gets the same 404 a missing hiring gets,
// so the existence of someone else's hiring is never revealed. No lock is taken here, so outsiders cannot make
// anyone wait.
export async function requireParty(db, user, hiringId) {
  const { rows: [h] } = await db.query(
    'SELECT id, project_id, company_id, freelancer_id, status, work_status FROM hirings WHERE id = $1', [hiringId])
  if (!h || (h.company_id !== user.id && h.freelancer_id !== user.id)) throw notFound('Hiring')
  return h
}

// Same lock order as accepting a proposal and completing/cancelling a hiring: project first, then the hiring.
// The status is read AFTER the locks are held, so a simultaneous action is seen rather than overwritten.
export async function lockHiringRow(c, hiringId) {
  const { rows: [ref] } = await c.query('SELECT project_id FROM hirings WHERE id = $1', [hiringId])
  if (!ref) throw notFound('Hiring')
  const { rows: [project] } = await c.query('SELECT id, title FROM projects WHERE id = $1 FOR UPDATE', [ref.project_id])
  const { rows: [h] } = await c.query(
    'SELECT id, status, work_status, company_id, freelancer_id FROM hirings WHERE id = $1 FOR UPDATE', [hiringId])
  return { h, project }
}

// Where each side opens a hiring in the website (used for notification links)
export const hiringLink = (role, hiringId) => `/${role === 'COMPANY' ? 'company' : 'freelancer'}/hirings/${hiringId}`
