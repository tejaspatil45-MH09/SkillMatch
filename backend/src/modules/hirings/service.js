import { withTransaction } from '../../db/tx.js'
import { conflict, forbidden, notFound } from '../../utils/ApiError.js'
import { notify } from '../notifications/service.js'
import { hiringView, loadHirings, unreadCounts } from './queries.js'
import { requireParty } from './access.js'

export async function listMine(db, user) {
  const list = await loadHirings(db, { where: `h.${user.role === 'COMPANY' ? 'company_id' : 'freelancer_id'} = $1`, params: [user.id] })
  const unread = await unreadCounts(db, user.id, list.map((h) => h.id))
  return list.map((h) => ({ ...h, unreadMessages: unread[h.id] ?? 0 }))
}

// One hiring, for its two parties only (anyone else gets the same 404 as a hiring that does not exist)
export async function getOne(db, user, id) {
  await requireParty(db, user, id)
  const [h, unread] = await Promise.all([hiringView(db, id), unreadCounts(db, user.id, [id])])
  return { ...h, unreadMessages: unread[id] ?? 0 }
}

// Same lock order as accepting a proposal: project first, then the hiring. Status is read AFTER the locks are held,
// so a simultaneous complete/cancel is seen rather than overwritten.
async function lockHiring(c, id) {
  const { rows: [ref] } = await c.query('SELECT project_id FROM hirings WHERE id = $1', [id])
  if (!ref) throw notFound('Hiring')
  const { rows: [project] } = await c.query('SELECT id, title FROM projects WHERE id = $1 FOR UPDATE', [ref.project_id])
  const { rows: [h] } = await c.query('SELECT id, status, company_id, freelancer_id FROM hirings WHERE id = $1 FOR UPDATE', [id])
  return { h, project }
}

export async function complete(db, user, id) {
  await withTransaction(async (c) => {
    const { h, project } = await lockHiring(c, id)
    if (h.company_id !== user.id) throw forbidden('Only the hiring company can complete this project.')
    if (h.status !== 'ACTIVE') throw conflict('Only active hirings can be completed.', 'INVALID_STATE')
    // Completing directly stays available (existing rule). If a submission was waiting for review, completing it IS the approval.
    await c.query("UPDATE hirings SET status = 'COMPLETED', completed_at = now(), work_status = CASE WHEN work_status = 'SUBMITTED' THEN 'APPROVED'::work_status ELSE work_status END WHERE id = $1", [id])
    await c.query("UPDATE work_submissions SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now() WHERE hiring_id = $1 AND status = 'SUBMITTED'", [id, user.id])
    await c.query("UPDATE projects SET status = 'COMPLETED' WHERE id = $1", [project.id])
    await notify(c, h.freelancer_id, 'COMPLETED', `Project "${project.title}" has been marked completed.`, '/freelancer/hirings')
  }, db)
  return hiringView(db, id)
}

// Cancelling also cancels the project (the accepted proposal stays ACCEPTED as the record of who was hired)
export async function cancel(db, user, id, { reason }) {
  await withTransaction(async (c) => {
    const { h, project } = await lockHiring(c, id)
    if (h.company_id !== user.id) throw forbidden('Only the hiring company can cancel.')
    if (h.status !== 'ACTIVE') throw conflict('Only active hirings can be cancelled.', 'INVALID_STATE')
    await c.query("UPDATE hirings SET status = 'CANCELLED', cancel_reason = $2 WHERE id = $1", [id, reason])
    await c.query("UPDATE projects SET status = 'CANCELLED' WHERE id = $1", [project.id])
    await notify(c, h.freelancer_id, 'CANCELLED', `Your hiring for "${project.title}" was cancelled.`, '/freelancer/hirings')
  }, db)
  return hiringView(db, id)
}
