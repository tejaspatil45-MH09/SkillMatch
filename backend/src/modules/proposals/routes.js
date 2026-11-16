import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { uuidParam, validate } from '../../middleware/validate.js'
import { submitSchema } from './schema.js'
import * as svc from './service.js'

export function proposalRoutes({ pool }) {
  const r = Router()
  r.param('id', uuidParam)
  r.use(requireAuth)
  r.get('/mine', requireRole('FREELANCER'), async (req, res) => res.json(await svc.listMine(pool, req.user)))
  r.get('/:id', async (req, res) => res.json(await svc.getProposal(pool, req.user, req.params.id)))
  r.post('/:id/shortlist', requireRole('COMPANY'), async (req, res) => res.json(await svc.shortlist(pool, req.user, req.params.id)))
  r.post('/:id/reject', requireRole('COMPANY'), async (req, res) => res.json(await svc.reject(pool, req.user, req.params.id)))
  r.post('/:id/accept', requireRole('COMPANY'), async (req, res) => res.json(await svc.accept(pool, req.user, req.params.id)))
  r.post('/:id/withdraw', requireRole('FREELANCER'), async (req, res) => res.json(await svc.withdraw(pool, req.user, req.params.id)))
  return r
}

// Mounted under /api/projects
export function projectProposalRoutes({ pool }) {
  const r = Router()
  r.param('id', uuidParam)
  r.use(requireAuth)
  r.post('/:id/proposals', requireRole('FREELANCER'), validate(submitSchema), async (req, res) => res.status(201).json(await svc.submitProposal(pool, req.user, req.params.id, req.body)))
  r.get('/:id/proposals', requireRole('COMPANY'), async (req, res) => res.json(await svc.listForProject(pool, req.user, req.params.id)))
  return r
}
