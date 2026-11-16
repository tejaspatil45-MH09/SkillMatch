import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { uuidParam } from '../../middleware/validate.js'
import { getProfile, updateProfile } from './service.js'
import { updateSchemaFor } from './schema.js'

export function profileRoutes({ pool }) {
  const r = Router()
  r.param('id', uuidParam)
  r.use(requireAuth)

  // Declared before /:id so "me" is never treated as an id. The schema is chosen by the caller's role, so a
  // freelancer cannot send company fields (or the reverse); unknown fields are rejected.
  r.put('/me', async (req, res) => {
    const input = updateSchemaFor(req.user.role).parse(req.body)
    res.json({ user: await updateProfile(pool, req.user, input) })
  })
  r.get('/:id', async (req, res) => res.json(await getProfile(pool, req.user, req.params.id)))
  return r
}
