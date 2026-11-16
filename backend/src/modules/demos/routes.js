import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { uuidParam, validate } from '../../middleware/validate.js'
import { submitDemoSchema } from './schema.js'
import * as svc from './service.js'

// Demo responses must never be stored by a browser, proxy or CDN
const noStore = (req, res, next) => { res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }); next() }

// Mounted under /api/proposals
export function proposalDemoRoutes({ pool }) {
  const r = Router()
  r.param('id', uuidParam)
  r.use(requireAuth, noStore)
  r.get('/:id/demo', async (req, res) => res.json(await svc.getDemoStatus(pool, req.user, req.params.id)))
  r.post('/:id/demo', requireRole('FREELANCER'), validate(submitDemoSchema), async (req, res) => res.status(201).json(await svc.submitDemo(pool, req.user, req.params.id, req.body, req.ip)))
  return r
}

// Mounted under /api/demos. The role check lives inside the service so every refusal reads the same ("Access denied").
export function demoRoutes({ pool, limiters }) {
  const r = Router()
  r.param('id', uuidParam)
  r.use(requireAuth, noStore)
  r.post('/:id/access', ...limiters.demoAccess, async (req, res) => res.json(await svc.accessDemo(pool, req.user, req.params.id, req.ip)))
  r.post('/:id/reissue', async (req, res) => res.json(await svc.reissueDemo(pool, req.user, req.params.id, req.ip)))
  return r
}
