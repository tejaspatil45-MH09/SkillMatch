import { withTransaction } from '../../db/tx.js'
import { ApiError, conflict, forbidden, notFound } from '../../utils/ApiError.js'
import { notify } from '../notifications/service.js'

// One message for every kind of refusal that could reveal whether a demo exists
const accessDenied = () => forbidden('Access denied.', 'ACCESS_DENIED')
const STATUS = "CASE WHEN d.viewed_at IS NOT NULL THEN 'VIEWED' WHEN d.expires_at < now() THEN 'EXPIRED' ELSE 'AVAILABLE' END"

// Metadata only: status and timing. The URL exists in exactly one response: a successful accessDemo().
// The freelancer's description is shown to the freelancer; the company gets it together with the URL.
const meta = (r, withDescription) => ({ id: r.id, status: r.status, submittedAt: r.submitted_at, expiresAt: r.expires_at, viewedAt: r.viewed_at, ...(withDescription && { description: r.description }) })
const log = (c, demoId, userId, outcome, ip) => c.query('INSERT INTO demo_access_log (demo_id, user_id, outcome, ip) VALUES ($1,$2,$3,$4)', [demoId, userId, outcome, ip ?? null])

async function loadMeta(db, demoId, withDescription) {
  const { rows: [r] } = await db.query(`SELECT d.id, d.description, d.submitted_at, d.expires_at, d.viewed_at, ${STATUS} AS status FROM demos d WHERE d.id = $1`, [demoId])
  return meta(r, withDescription)
}

export async function submitDemo(db, user, proposalId, input, ip) {
  const demoId = await withTransaction(async (c) => {
    // Lock the proposal and read its status AFTER the lock: a simultaneous withdraw/reject/accept is seen, not overwritten
    const { rows: [pr] } = await c.query(
      'SELECT pr.id, pr.status, pr.freelancer_id, p.company_id, p.title FROM proposals pr JOIN projects p ON p.id = pr.project_id WHERE pr.id = $1 FOR UPDATE OF pr', [proposalId])
    if (!pr) throw notFound('Proposal')
    if (pr.freelancer_id !== user.id) throw forbidden('You can only submit demos for your own proposals.')
    if (pr.status !== 'SHORTLISTED') throw conflict('Demos can only be submitted for shortlisted proposals.', 'INVALID_STATE')
    let demo
    try {
      // The 24-hour window starts now, at submission
      ;({ rows: [demo] } = await c.query("INSERT INTO demos (proposal_id, url, description, expires_at) VALUES ($1,$2,$3, now() + interval '24 hours') RETURNING id", [proposalId, input.url, input.description]))
    } catch (e) {
      if (e.code === '23505') throw conflict('A demo has already been submitted for this proposal.', 'DUPLICATE_DEMO')
      throw e
    }
    await log(c, demo.id, user.id, 'SUBMITTED', ip)
    await notify(c, pr.company_id, 'DEMO', `${user.name} submitted a demo for "${pr.title}".`, `/company/proposals/${proposalId}/demo`)
    return demo.id
  }, db)
  return loadMeta(db, demoId, true)
}

// Status check: safe to call repeatedly, never returns the URL, never consumes anything.
// Anyone who is not the freelancer or the owning company gets the same refusal whether or not a demo exists.
export async function getDemoStatus(db, user, proposalId) {
  const { rows: [r] } = await db.query(
    `SELECT d.id, d.description, d.submitted_at, d.expires_at, d.viewed_at, ${STATUS} AS status, pr.freelancer_id, p.company_id
     FROM proposals pr JOIN projects p ON p.id = pr.project_id LEFT JOIN demos d ON d.proposal_id = pr.id WHERE pr.id = $1`, [proposalId])
  if (!r || (r.freelancer_id !== user.id && r.company_id !== user.id)) throw accessDenied()
  if (!r.id) throw new ApiError(404, 'No demo has been submitted yet.', 'NO_DEMO')
  return meta(r, r.freelancer_id === user.id)
}

// THE guarantee. Owner + not yet viewed + not expired + proposal still eligible are checked AND the view is consumed
// in ONE statement, so there is no gap between "check" and "use" for two simultaneous requests to slip through:
// the database serialises them on the row, and everyone after the first sees it already used.
export async function accessDemo(db, user, demoId, ip) {
  const result = await withTransaction(async (c) => {
    if (user.role === 'COMPANY') {
      const { rows: [g] } = await c.query(
        `UPDATE demos d SET viewed_at = now()
         FROM proposals pr JOIN projects p ON p.id = pr.project_id JOIN users f ON f.id = pr.freelancer_id
         WHERE d.id = $1 AND pr.id = d.proposal_id AND p.company_id = $2
           AND pr.status IN ('SHORTLISTED', 'ACCEPTED') AND f.status = 'ACTIVE'
           AND d.viewed_at IS NULL AND d.expires_at > now()
         RETURNING d.url, d.description, d.viewed_at, pr.id AS proposal_id, pr.freelancer_id, p.title`, [demoId, user.id])
      if (g) {
        await log(c, demoId, user.id, 'GRANTED', ip)
        await notify(c, g.freelancer_id, 'DEMO_VIEWED', `Your demo for "${g.title}" was viewed.`, `/freelancer/proposals/${g.proposal_id}`)
        return { ok: true, data: { url: g.url, description: g.description, viewedAt: g.viewed_at } }
      }
      // Refused. Work out why, but only reveal it to the owning company.
      const { rows: [s] } = await c.query(
        `SELECT d.viewed_at IS NOT NULL AS viewed, d.expires_at <= now() AS expired FROM demos d JOIN proposals pr ON pr.id = d.proposal_id JOIN projects p ON p.id = pr.project_id WHERE d.id = $1 AND p.company_id = $2`, [demoId, user.id])
      if (s) {
        const [outcome, error] = s.viewed ? ['VIEWED', new ApiError(410, 'This demo has already been viewed.', 'DEMO_VIEWED')]
          : s.expired ? ['EXPIRED', new ApiError(410, 'The 24-hour access window has expired.', 'DEMO_EXPIRED')]
          : ['DENIED', new ApiError(410, 'This demo is no longer available.', 'DEMO_UNAVAILABLE')]   // e.g. the freelancer withdrew
        await log(c, demoId, user.id, outcome, ip)
        return { ok: false, error }
      }
    }
    // Not a company, not the owner, or no such demo: identical answer. Only log it if the demo is real.
    await c.query("INSERT INTO demo_access_log (demo_id, user_id, outcome, ip) SELECT $1, $2, 'DENIED', $3 WHERE EXISTS (SELECT 1 FROM demos WHERE id = $1)", [demoId, user.id, ip ?? null])
    return { ok: false, error: accessDenied() }
  }, db)
  if (!result.ok) throw result.error
  return result.data
}

// The freelancer opens a fresh 24-hour window after the previous one was used up or lapsed.
// Refused while a window is still open, so a freelancer cannot reset a demo the company hasn't viewed yet.
export async function reissueDemo(db, user, demoId, ip) {
  await withTransaction(async (c) => {
    const { rows: [r] } = await c.query(
      `SELECT pr.id AS proposal_id, pr.status, pr.freelancer_id, p.company_id, p.title
       FROM demos d JOIN proposals pr ON pr.id = d.proposal_id JOIN projects p ON p.id = pr.project_id WHERE d.id = $1 FOR UPDATE OF d, pr`, [demoId])
    if (!r || r.freelancer_id !== user.id) throw accessDenied()
    if (r.status !== 'SHORTLISTED') throw conflict('This proposal is no longer shortlisted.', 'INVALID_STATE')
    const { rowCount } = await c.query(
      "UPDATE demos SET submitted_at = now(), expires_at = now() + interval '24 hours', viewed_at = NULL WHERE id = $1 AND (viewed_at IS NOT NULL OR expires_at <= now())", [demoId])
    if (!rowCount) throw conflict('This demo is still available.', 'INVALID_STATE')
    await log(c, demoId, user.id, 'REISSUED', ip)
    await notify(c, r.company_id, 'DEMO', `${user.name} re-issued a demo for "${r.title}".`, `/company/proposals/${r.proposal_id}/demo`)
  }, db)
  return loadMeta(db, demoId, true)
}
