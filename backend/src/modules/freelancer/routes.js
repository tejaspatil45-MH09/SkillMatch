import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { listOpen } from '../projects/queries.js'
import { profileCompletion } from '../profiles/service.js'
import { userView } from '../users/view.js'

export function freelancerRoutes({ pool }) {
  const r = Router()
  r.use(requireAuth, requireRole('FREELANCER'))
  r.get('/dashboard', async (req, res) => {
    const id = req.user.id
    const [me, proposals, hirings, opportunities, notifications] = await Promise.all([
      userView(pool, id),
      pool.query("SELECT count(*) FILTER (WHERE status = 'PENDING')::int AS pending, count(*) FILTER (WHERE status = 'SHORTLISTED')::int AS shortlisted FROM proposals WHERE freelancer_id = $1", [id]),
      pool.query("SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int AS active, count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed FROM hirings WHERE freelancer_id = $1", [id]),
      listOpen(pool, req.user, { sort: 'match' }, { excludeApplied: true, limit: 3 }),
      pool.query('SELECT id, user_id AS "userId", type, message, link, read, created_at AS "createdAt" FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 4', [id]),
    ])
    res.json({
      profileCompletion: profileCompletion(me.profile),
      activeProposals: proposals.rows[0].pending, shortlisted: proposals.rows[0].shortlisted,
      activeProjects: hirings.rows[0].active, completedProjects: hirings.rows[0].completed,
      opportunities, notifications: notifications.rows,
    })
  })
  return r
}
