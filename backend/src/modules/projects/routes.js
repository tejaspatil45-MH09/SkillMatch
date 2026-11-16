import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { uuidParam, validate } from '../../middleware/validate.js'
import { createProject, listQuery, updateProject } from './schema.js'
import * as svc from './service.js'

export function projectRoutes({ pool }) {
  const r = Router()
  r.param('id', uuidParam)
  r.use(requireAuth)

  r.get('/', validate(listQuery, 'query'), async (req, res) => res.json(await svc.listProjects(pool, req.user, req.query)))
  r.get('/:id', async (req, res) => res.json(await svc.getProject(pool, req.user, req.params.id)))
  r.post('/', requireRole('COMPANY'), validate(createProject), async (req, res) => res.status(201).json(await svc.createProject(pool, req.user, req.body)))
  r.put('/:id', requireRole('COMPANY'), validate(updateProject), async (req, res) => res.json(await svc.updateProject(pool, req.user, req.params.id, req.body)))
  r.post('/:id/close', requireRole('COMPANY'), async (req, res) => res.json(await svc.closeProject(pool, req.user, req.params.id)))
  return r
}
