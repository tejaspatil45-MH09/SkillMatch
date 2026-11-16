import { withTransaction } from '../../db/tx.js'
import { conflict, forbidden, notFound } from '../../utils/ApiError.js'
import { notify } from '../notifications/service.js'
import { hiringView } from '../hirings/queries.js'
import { hiringLink, lockHiringRow, requireParty } from '../hirings/access.js'
import { normaliseLink, normaliseRepo } from './schema.js'

const SELECT = `SELECT s.id, s.hiring_id, s.version, s.title, s.description, s.repo_url, s.live_url, s.status, s.feedback,
  s.submitted_by, u.name AS submitted_by_name, s.submitted_at, s.reviewed_at
  FROM work_submissions s JOIN users u ON u.id = s.submitted_by`
const view = (r) => ({
  id: r.id, hiringId: r.hiring_id, version: r.version, title: r.title, description: r.description,
  repoUrl: r.repo_url, liveUrl: r.live_url, status: r.status, feedback: r.feedback,
  submittedBy: { id: r.submitted_by, name: r.submitted_by_name }, submittedAt: r.submitted_at, reviewedAt: r.reviewed_at,
})
const loadOne = async (db, id) => view((await db.query(`${SELECT} WHERE s.id = $1`, [id])).rows[0])

// Newest version first. Both parties see the same history; nobody else can see it at all.
export async function listSubmissions(db, user, hiringId) {
  await requireParty(db, user, hiringId)
  const { rows } = await db.query(`${SELECT} WHERE s.hiring_id = $1 ORDER BY s.version DESC LIMIT 200`, [hiringId])
  return rows.map(view)
}

// Freelancer submits (or resubmits) work. Always adds a NEW version; earlier versions are never touched.
// Submission, hiring work status and the company's notification commit together or not at all.
export async function submitWork(db, user, hiringId, input) {
  await requireParty(db, user, hiringId)
  const id = await withTransaction(async (c) => {
    const { h, project } = await lockHiringRow(c, hiringId)
    if (h.freelancer_id !== user.id) throw forbidden('Only the hired freelancer can submit work for this hiring.')
    if (h.status !== 'ACTIVE') throw conflict('Work can only be submitted while the hiring is active.', 'INVALID_STATE')
    if (h.work_status === 'SUBMITTED') throw conflict('Your last submission is still waiting for the company to review it.', 'INVALID_STATE')
    if (!['IN_PROGRESS', 'REVISION_REQUESTED'].includes(h.work_status)) throw conflict('Work cannot be submitted in the current state.', 'INVALID_STATE')

    const { rows: [{ next }] } = await c.query('SELECT coalesce(max(version), 0) + 1 AS next FROM work_submissions WHERE hiring_id = $1', [hiringId])
    const { rows: [s] } = await c.query(
      'INSERT INTO work_submissions (hiring_id, version, title, description, repo_url, live_url, submitted_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [hiringId, next, input.title, input.description ?? '', normaliseRepo(input.repoUrl), normaliseLink(input.liveUrl), user.id])
    await c.query("UPDATE hirings SET work_status = 'SUBMITTED' WHERE id = $1", [hiringId])
    await notify(c, h.company_id, 'WORK_SUBMITTED',
      `${user.name} submitted ${next > 1 ? `a revised version (v${next})` : 'work'} for "${project.title}".`, hiringLink('COMPANY', hiringId))
    return s.id
  }, db)
  return loadOne(db, id)
}

// Shared by approve and request-revision: the submission must belong to THIS hiring and still be waiting for review.
async function lockOpenSubmission(c, hiringId, submissionId, h) {
  const { rows: [s] } = await c.query('SELECT id, status FROM work_submissions WHERE id = $1 AND hiring_id = $2 FOR UPDATE', [submissionId, hiringId])
  if (!s) throw notFound('Submission')
  if (h.status !== 'ACTIVE') throw conflict('This hiring is no longer active.', 'INVALID_STATE')
  if (s.status !== 'SUBMITTED' || h.work_status !== 'SUBMITTED') throw conflict('This submission has already been reviewed.', 'INVALID_STATE')
}

// Company approves. Approval is what completes the hiring (and the project), in the same transaction, so a
// submission alone never completes anything and reviews open exactly when the work is accepted.
export async function approveWork(db, user, hiringId, submissionId) {
  await requireParty(db, user, hiringId)
  await withTransaction(async (c) => {
    const { h, project } = await lockHiringRow(c, hiringId)
    if (h.company_id !== user.id) throw forbidden('Only the hiring company can approve work.')
    await lockOpenSubmission(c, hiringId, submissionId, h)
    await c.query("UPDATE work_submissions SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [submissionId, user.id])
    await c.query("UPDATE hirings SET status = 'COMPLETED', completed_at = now(), work_status = 'APPROVED' WHERE id = $1", [hiringId])
    await c.query("UPDATE projects SET status = 'COMPLETED' WHERE id = $1", [project.id])
    await notify(c, h.freelancer_id, 'WORK_APPROVED', `Your work for "${project.title}" was approved and the project is complete.`, hiringLink('FREELANCER', hiringId))
  }, db)
  return { submission: await loadOne(db, submissionId), hiring: await hiringView(db, hiringId) }
}

// Company asks for changes. The explanation is required; the freelancer is notified and may submit a new version.
export async function requestRevision(db, user, hiringId, submissionId, { feedback }) {
  await requireParty(db, user, hiringId)
  await withTransaction(async (c) => {
    const { h, project } = await lockHiringRow(c, hiringId)
    if (h.company_id !== user.id) throw forbidden('Only the hiring company can request a revision.')
    await lockOpenSubmission(c, hiringId, submissionId, h)
    await c.query("UPDATE work_submissions SET status = 'REVISION_REQUESTED', feedback = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1", [submissionId, feedback, user.id])
    await c.query("UPDATE hirings SET work_status = 'REVISION_REQUESTED' WHERE id = $1", [hiringId])
    await notify(c, h.freelancer_id, 'REVISION_REQUESTED', `The company asked for changes to your work on "${project.title}".`, hiringLink('FREELANCER', hiringId))
  }, db)
  return { submission: await loadOne(db, submissionId), hiring: await hiringView(db, hiringId) }
}
