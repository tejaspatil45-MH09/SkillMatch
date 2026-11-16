import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import pinoHttp from 'pino-http'
import { env } from './config/env.js'
import { logger } from './logger.js'
import { pool as defaultPool } from './db/pool.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { originGuard } from './middleware/origin.js'
import { rejectUnsafeInput } from './middleware/sanitize.js'
import { buildLimiters, defaultLimits } from './middleware/rateLimit.js'
import { sessionMiddleware } from './middleware/session.js'
import { authRoutes } from './modules/auth/routes.js'
import { skillRoutes } from './modules/skills/routes.js'
import { profileRoutes } from './modules/profiles/routes.js'
import { projectRoutes } from './modules/projects/routes.js'
import { companyRoutes } from './modules/company/routes.js'
import { freelancerRoutes } from './modules/freelancer/routes.js'
import { proposalRoutes, projectProposalRoutes } from './modules/proposals/routes.js'
import { notificationRoutes } from './modules/notifications/routes.js'
import { demoRoutes, proposalDemoRoutes } from './modules/demos/routes.js'
import { hiringRoutes } from './modules/hirings/routes.js'
import { reviewRoutes } from './modules/reviews/routes.js'
import { reportRoutes } from './modules/reports/routes.js'
import { adminRoutes } from './modules/admin/routes.js'
import { createMailer } from './services/mailer.js'
import { ApiError } from './utils/ApiError.js'

const origins = (list) => list.split(',').map((o) => o.trim()).filter(Boolean)

// `routes` lets later phases (and tests) register routers before the 404 handler.
// `limits: false` disables rate limiting (tests). `mailer` is injectable so tests can read outgoing email.
export function createApp({ pool = defaultPool, routes, limits = defaultLimits, mailer = createMailer(), cookieSecure = env.NODE_ENV === 'production' } = {}) {
  const app = express()
  app.locals.pool = pool
  app.disable('x-powered-by')
  app.set('trust proxy', 1)   // correct client IPs and secure cookies behind a reverse proxy
  app.use(helmet())
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }))

  // Health first: it must work without a session or a database-backed middleware
  app.get('/api/health', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'up', time: new Date().toISOString() }) }
    catch (e) { logger.error({ err: e }, 'health check failed'); throw new ApiError(503, 'The database is not reachable.', 'DB_DOWN') }
  })

  const limiters = buildLimiters(limits)
  app.use('/api', ...limiters.global)
  // Responses can contain personal data: never let a browser or shared cache keep them
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  const allowed = origins(env.CORS_ORIGIN)
  app.use(cors({ origin: allowed, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(rejectUnsafeInput)
  app.use(originGuard(allowed))
  app.use(sessionMiddleware({ pool, secure: cookieSecure }))

  app.use('/api/auth', authRoutes({ pool, limiters, mailer, appUrl: env.APP_URL.replace(/\/$/, ''), cookieSecure }))
  app.use('/api/skills', skillRoutes({ pool }))
  app.use('/api/profiles', profileRoutes({ pool }))
  app.use('/api/projects', projectRoutes({ pool }))
  app.use('/api/projects', projectProposalRoutes({ pool }))
  app.use('/api/proposals', proposalRoutes({ pool }))
  app.use('/api/proposals', proposalDemoRoutes({ pool }))
  app.use('/api/demos', demoRoutes({ pool, limiters }))
  app.use('/api/notifications', notificationRoutes({ pool }))
  app.use('/api/hirings', hiringRoutes({ pool, limiters }))
  app.use('/api/reviews', reviewRoutes({ pool }))
  app.use('/api/reports', reportRoutes({ pool, limiters }))
  app.use('/api/freelancer', freelancerRoutes({ pool }))
  app.use('/api/company', companyRoutes({ pool }))
  app.use('/api/admin', adminRoutes({ pool }))
  routes?.(app)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
