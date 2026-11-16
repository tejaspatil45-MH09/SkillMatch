import { ApiError } from '../utils/ApiError.js'

// Defence in depth against CSRF (on top of SameSite=Lax cookies): a browser always sends Origin on
// cross-site writes, so refuse state-changing requests from an origin we don't trust.
export function originGuard(allowedOrigins) {
  const allowed = new Set(allowedOrigins)
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    const origin = req.get('origin')
    if (!origin) return next()   // non-browser clients (curl, server-to-server) send none
    if (allowed.has(origin) || origin === `${req.protocol}://${req.get('host')}`) return next()
    next(new ApiError(403, 'This request came from an untrusted origin.', 'CSRF_BLOCKED'))
  }
}
