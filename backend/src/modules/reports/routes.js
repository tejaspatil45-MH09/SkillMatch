import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { reportSchema } from './schema.js'
import { createReport } from './service.js'

export function reportRoutes({ pool, limiters }) {
  const r = Router()
  r.use(requireAuth)
  r.post('/', ...limiters.report, validate(reportSchema), async (req, res) => res.status(201).json(await createReport(pool, req.user, req.body)))
  return r
}
