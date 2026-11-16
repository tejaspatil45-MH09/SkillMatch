import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { reviewSchema, reviewsQuery } from './schema.js'
import * as svc from './service.js'

export function reviewRoutes({ pool }) {
  const r = Router()
  r.use(requireAuth)
  r.post('/', validate(reviewSchema), async (req, res) => res.status(201).json(await svc.createReview(pool, req.user, req.body)))
  r.get('/', validate(reviewsQuery, 'query'), async (req, res) => res.json(await svc.listReviews(pool, req.user, req.query.userId)))
  return r
}
