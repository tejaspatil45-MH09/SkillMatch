import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { listCompanyProjects } from '../projects/service.js'
import { listForCompany } from '../proposals/service.js'

// Company-only views
export function companyRoutes({ pool }) {
  const r = Router()
  r.use(requireAuth, requireRole('COMPANY'))
  r.get('/projects', async (req, res) => res.json(await listCompanyProjects(pool, req.user)))
  r.get('/proposals', async (req, res) => res.json(await listForCompany(pool, req.user)))
  r.get('/dashboard', async (req, res) => {
    const id = req.user.id
    const [projects, proposals, hirings, activity] = await Promise.all([
      pool.query("SELECT count(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS active, count(*) FILTER (WHERE status = 'OPEN')::int AS open, count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed FROM projects WHERE company_id = $1", [id]),
      pool.query("SELECT count(*)::int AS received, count(*) FILTER (WHERE pr.status = 'SHORTLISTED')::int AS shortlisted FROM proposals pr JOIN projects p ON p.id = pr.project_id JOIN users fu ON fu.id = pr.freelancer_id WHERE p.company_id = $1 AND fu.status = 'ACTIVE'", [id]),
      pool.query("SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int AS active FROM hirings WHERE company_id = $1", [id]),
      pool.query('SELECT id, user_id AS "userId", type, message, link, read, created_at AS "createdAt" FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 6', [id]),
    ])
    res.json({ activeProjects: projects.rows[0].active, openProjects: projects.rows[0].open, receivedProposals: proposals.rows[0].received, shortlisted: proposals.rows[0].shortlisted,
      activeHirings: hirings.rows[0].active, completedProjects: projects.rows[0].completed, recentActivity: activity.rows })
  })
  return r
}
