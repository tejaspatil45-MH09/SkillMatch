import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { uuidParam, validate } from '../../middleware/validate.js'
import { cancelSchema } from './schema.js'
import { requestRevisionSchema, submitWorkSchema } from '../submissions/schema.js'
import { sendMessageSchema } from '../messages/schema.js'
import * as svc from './service.js'
import * as work from '../submissions/service.js'
import * as chat from '../messages/service.js'

// Everything about a hiring lives here, so one requireAuth covers every route. Reads and writes about a hiring's
// work or conversation are for its two parties only (anyone else gets 404), and each write is limited to one role.
export function hiringRoutes({ pool, limiters }) {
  const r = Router()
  r.param('id', uuidParam)
  r.param('submissionId', uuidParam)
  r.use(requireAuth)
  r.get('/', requireRole('FREELANCER', 'COMPANY'), async (req, res) => res.json(await svc.listMine(pool, req.user)))
  r.get('/:id', requireRole('FREELANCER', 'COMPANY'), async (req, res) => res.json(await svc.getOne(pool, req.user, req.params.id)))
  r.post('/:id/complete', requireRole('COMPANY'), async (req, res) => res.json(await svc.complete(pool, req.user, req.params.id)))
  r.post('/:id/cancel', requireRole('COMPANY'), validate(cancelSchema), async (req, res) => res.json(await svc.cancel(pool, req.user, req.params.id, req.body)))

  // Work submission and review
  r.get('/:id/submissions', requireRole('FREELANCER', 'COMPANY'), async (req, res) => res.json(await work.listSubmissions(pool, req.user, req.params.id)))
  r.post('/:id/submissions', requireRole('FREELANCER'), validate(submitWorkSchema), async (req, res) => res.status(201).json(await work.submitWork(pool, req.user, req.params.id, req.body)))
  r.post('/:id/submissions/:submissionId/approve', requireRole('COMPANY'), async (req, res) => res.json(await work.approveWork(pool, req.user, req.params.id, req.params.submissionId)))
  r.post('/:id/submissions/:submissionId/request-revision', requireRole('COMPANY'), validate(requestRevisionSchema), async (req, res) => res.json(await work.requestRevision(pool, req.user, req.params.id, req.params.submissionId, req.body)))

  // Conversation
  r.get('/:id/messages', requireRole('FREELANCER', 'COMPANY'), async (req, res) => res.json(await chat.listMessages(pool, req.user, req.params.id)))
  r.post('/:id/messages', requireRole('FREELANCER', 'COMPANY'), ...limiters.message, validate(sendMessageSchema), async (req, res) => res.status(201).json(await chat.sendMessage(pool, req.user, req.params.id, req.body)))
  r.post('/:id/messages/read', requireRole('FREELANCER', 'COMPANY'), async (req, res) => res.json(await chat.markRead(pool, req.user, req.params.id)))
  return r
}
