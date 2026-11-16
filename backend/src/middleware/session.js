import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { env } from '../config/env.js'

export const SESSION_COOKIE = 'sm.sid'
const PgStore = connectPgSimple(session)
const WEEK = 7 * 24 * 60 * 60 * 1000

export function cookieOptions(secure) {
  // httpOnly: scripts can't read it. sameSite=lax: not sent on cross-site POSTs. secure: HTTPS only in production.
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: WEEK }
}

export function sessionMiddleware({ pool, secure }) {
  return session({
    name: SESSION_COOKIE,
    // A fixed development secret keeps you logged in across restarts; production must set a real one (enforced in env.js)
    secret: env.SESSION_SECRET ?? 'development-only-secret-do-not-use-in-production',
    store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: env.NODE_ENV === 'test' ? false : 900 }),
    resave: false,
    saveUninitialized: false,   // no cookie until someone actually logs in
    rolling: true,              // activity extends the session
    cookie: cookieOptions(secure),
  })
}
