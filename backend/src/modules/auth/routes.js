import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { SESSION_COOKIE, cookieOptions } from '../../middleware/session.js'
import { logger } from '../../logger.js'
import { userView } from '../users/view.js'
import { forgotSchema, loginSchema, registerSchema, resetSchema } from './schema.js'
import * as auth from './service.js'

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())))
const destroy = (req) => new Promise((resolve) => req.session.destroy(resolve))

export function authRoutes({ pool, limiters, mailer, appUrl, cookieSecure }) {
  const r = Router()

  // New session id on every login: blocks session fixation
  async function startSession(req, userId) { await regenerate(req); req.session.userId = userId }

  r.post('/register', ...limiters.register, validate(registerSchema), async (req, res) => {
    const id = await auth.register(pool, req.body)
    await startSession(req, id)
    res.status(201).json({ user: await userView(pool, id) })
  })

  r.post('/login', ...limiters.login, validate(loginSchema), async (req, res) => {
    const id = await auth.login(pool, req.body)
    await startSession(req, id)
    logger.info({ userId: id }, 'login')
    res.json({ user: await userView(pool, id) })
  })

  r.post('/logout', async (req, res) => {
    await destroy(req)   // server-side: a copied cookie is useless afterwards
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(cookieSecure), maxAge: undefined })
    res.json({ ok: true })
  })

  r.get('/me', requireAuth, async (req, res) => res.json({ user: await userView(pool, req.user.id) }))

  // Same answer whether or not the account exists; the work happens after the response is sent
  r.post('/forgot-password', ...limiters.forgot, validate(forgotSchema), async (req, res) => {
    res.json({ message: auth.FORGOT_MESSAGE })
    try { await auth.requestPasswordReset(pool, mailer, { email: req.body.email, appUrl }) }
    catch (e) { logger.error({ err: e }, 'password reset failed') }
  })

  r.post('/reset-password', ...limiters.reset, validate(resetSchema), async (req, res) => {
    await auth.resetPassword(pool, req.body)
    res.json({ message: 'Your password has been changed. Please log in.' })
  })

  return r
}
