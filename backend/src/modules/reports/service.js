import { withTransaction } from '../../db/tx.js'
import { ApiError, conflict, forbidden, notFound } from '../../utils/ApiError.js'
import { notify } from '../notifications/service.js'
import { assertCanViewUser } from '../profiles/service.js'
import { findOne } from '../projects/queries.js'
import { isProjectVisible } from '../projects/service.js'

const own = () => new ApiError(400, "You can't report your own profile or project.", 'VALIDATION')

// You can only report what you are allowed to see: a report can't be used to probe hidden profiles or projects.
export async function createReport(db, user, { targetType, targetId, reason }) {
  if (user.role === 'ADMIN') throw forbidden()
  let label
  if (targetType === 'USER') {
    const target = await assertCanViewUser(db, user, targetId)
    if (target.id === user.id) throw own()
    label = target.name
  } else {
    const row = await findOne(db, user, targetId)
    if (!isProjectVisible(user, row)) throw notFound('Item')
    if (row.company_id === user.id) throw own()
    label = row.title
  }
  return withTransaction(async (c) => {
    let report
    try {
      ;({ rows: [report] } = await c.query(
        `INSERT INTO reports (reporter_id, target_user_id, target_project_id, reason) VALUES ($1,$2,$3,$4)
         RETURNING id, reporter_id AS "reporterId", reason, status, created_at AS "createdAt"`,
        [user.id, targetType === 'USER' ? targetId : null, targetType === 'PROJECT' ? targetId : null, reason]))
    } catch (e) {
      if (e.code === '23505') throw conflict('You have already reported this. Our team will review it.', 'DUPLICATE_REPORT')   // one open report per reporter per target
      throw e
    }
    const { rows: admins } = await c.query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'")
    for (const a of admins) await notify(c, a.id, 'REPORT', `New report about ${label}.`, '/admin/reports')
    return { ...report, targetType, targetId }
  }, db)
}
