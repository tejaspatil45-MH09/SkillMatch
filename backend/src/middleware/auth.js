import { ApiError, forbidden } from '../utils/ApiError.js'

const destroy = (req) => new Promise((resolve) => req.session.destroy(resolve))

// Loads the user from the database on EVERY request, so a suspension or role change takes effect immediately.
// UI role checks are cosmetic; this is where authorization actually starts.
export async function requireAuth(req, res, next) {
  const id = req.session?.userId
  if (!id) throw new ApiError(401, 'Please log in to continue.', 'UNAUTHENTICATED')
  const { rows: [u] } = await req.app.locals.pool.query('SELECT id, name, role, status FROM users WHERE id = $1', [id])
  if (!u) { await destroy(req); throw new ApiError(401, 'Please log in to continue.', 'UNAUTHENTICATED') }
  if (u.status === 'SUSPENDED') { await destroy(req); throw forbidden('This account has been suspended.', 'SUSPENDED') }
  req.user = u
  next()
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw forbidden()
  next()
}
