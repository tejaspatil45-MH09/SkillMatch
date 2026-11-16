import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { uuidParam, validate } from '../../middleware/validate.js'
import { listAll } from '../projects/queries.js'
import { analyticsQuery, demoLogQuery, skillSchema } from './schema.js'
import * as svc from './service.js'
import * as analytics from './analytics.js'
import { csvFilename, toCsv } from './analyticsCsv.js'

// Everything here is admin-only, enforced once for the whole router: a new endpoint added below
// cannot be forgotten and left open to other roles.
export function adminRoutes({ pool }) {
  const r = Router()
  r.param('id', uuidParam)
  r.use(requireAuth, requireRole('ADMIN'))

  r.get('/stats', async (req, res) => res.json(await svc.stats(pool)))
  r.get('/users', async (req, res) => res.json(await svc.listUsers(pool)))
  r.post('/users/:id/suspend', async (req, res) => res.json(await svc.setUserStatus(pool, req.user, req.params.id, 'SUSPENDED')))
  r.post('/users/:id/reinstate', async (req, res) => res.json(await svc.setUserStatus(pool, req.user, req.params.id, 'ACTIVE')))
  r.get('/projects', async (req, res) => res.json(await listAll(pool, req.user)))
  r.get('/reports', async (req, res) => res.json(await svc.listReports(pool)))
  r.post('/reports/:id/resolve', async (req, res) => res.json(await svc.resolveReport(pool, req.user, req.params.id)))
  r.get('/skills', async (req, res) => res.json(await svc.listSkills(pool)))
  r.post('/skills', validate(skillSchema), async (req, res) => res.status(201).json(await svc.addSkill(pool, req.user, req.body.name)))
  r.delete('/skills/:id', async (req, res) => res.json(await svc.retireSkill(pool, req.user, req.params.id)))
  r.get('/demo-log', validate(demoLogQuery, 'query'), async (req, res) => { res.set('Cache-Control', 'no-store'); res.json(await svc.demoLog(pool, req.query.demoId)) })
  // Reports & analytics: read-only, admin-only (the router guard above), the same filters for the dashboard and the CSV
  r.get('/analytics', validate(analyticsQuery, 'query'), async (req, res) => { res.set('Cache-Control', 'no-store'); res.json(await analytics.report(pool, req.query)) })
  r.get('/analytics/export', validate(analyticsQuery, 'query'), async (req, res) => {
    const report = await analytics.report(pool, req.query)
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${csvFilename(report)}"`, 'Cache-Control': 'no-store' })
    res.send(toCsv(report))
  })
  r.get('/audit-log', async (req, res) => res.json(await svc.auditLog(pool)))
  return r
}
