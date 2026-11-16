import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'

// Active skills only: retired skills stay on existing profiles and projects but aren't offered for new choices.
export function skillRoutes({ pool }) {
  const r = Router()
  r.use(requireAuth)
  r.get('/', async (req, res) => res.json((await pool.query('SELECT id, name FROM skills WHERE active ORDER BY lower(name), name')).rows))
  return r
}
