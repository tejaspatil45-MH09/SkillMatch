import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { uuidParam } from '../../middleware/validate.js'
import { notFound } from '../../utils/ApiError.js'

const COLUMNS = 'id, user_id AS "userId", type, message, link, read, created_at AS "createdAt"'

// Every query is scoped to the signed-in user: you can only ever read or change your own notifications.
export function notificationRoutes({ pool }) {
  const r = Router()
  r.param('id', uuidParam)
  r.use(requireAuth)
  r.get('/', async (req, res) => res.json((await pool.query(`SELECT ${COLUMNS} FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 200`, [req.user.id])).rows))
  r.post('/read-all', async (req, res) => { await pool.query('UPDATE notifications SET read = true WHERE user_id = $1 AND NOT read', [req.user.id]); res.json({ ok: true }) })
  r.post('/:id/read', async (req, res) => {
    const { rows: [n] } = await pool.query(`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`, [req.params.id, req.user.id])
    if (!n) throw notFound('Notification')
    res.json(n)
  })
  return r
}
