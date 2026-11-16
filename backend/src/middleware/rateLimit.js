import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { ApiError } from '../utils/ApiError.js'

const MIN = 60 * 1000
// Successful logins don't count against the limit. In-memory store: with several server instances, use a shared store (e.g. Redis).
export const defaultLimits = {
  login:    { windowMs: 15 * MIN, ip: 30, account: 8 },
  register: { windowMs: 60 * MIN, ip: 20 },
  forgot:   { windowMs: 60 * MIN, ip: 10, account: 3 },
  reset:    { windowMs: 60 * MIN, ip: 10 },
  report:   { windowMs: 60 * MIN, limit: 10 },     // per user: stops anyone spamming the admins
  global:   { windowMs: 1 * MIN, limit: 600 },      // every /api request, per IP: a coarse brake on scraping and floods
  demoAccess: { windowMs: 10 * MIN, limit: 30 },   // per signed-in user: keeps attempts (and the audit log) from being flooded
  message:  { windowMs: 1 * MIN, limit: 30 },      // per signed-in user: stops a conversation being used to flood the other person
}

const limited = (opts) => rateLimit({
  standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: !!opts.skipSuccessful,
  handler: (req, res, next) => next(new ApiError(429, 'Too many attempts. Please wait a while and try again.', 'RATE_LIMITED')),
  windowMs: opts.windowMs, limit: opts.limit, keyGenerator: opts.keyGenerator,
})
const email = (req) => String(req.body?.email ?? '').trim().toLowerCase()

// `limits: false` turns everything off (used by tests that aren't about rate limiting)
export function buildLimiters(limits) {
  const none = [(req, res, next) => next()]
  if (!limits) return { login: none, register: none, forgot: none, reset: none, demoAccess: none, report: none, message: none, global: none }
  const ip = (name, o, skipSuccessful = false) => limited({ windowMs: o.windowMs, limit: o.ip, skipSuccessful, keyGenerator: (req) => `${name}:ip:${ipKeyGenerator(req.ip)}` })
  // Per IP *and* account: stops guessing one account without letting a stranger lock the real owner out
  const acct = (name, o, skipSuccessful = false) => limited({ windowMs: o.windowMs, limit: o.account, skipSuccessful, keyGenerator: (req) => `${name}:acct:${ipKeyGenerator(req.ip)}:${email(req)}` })
  return {
    login: [ip('login', limits.login, true), acct('login', limits.login, true)],
    register: [ip('register', limits.register)],
    forgot: [ip('forgot', limits.forgot), acct('forgot', limits.forgot)],
    reset: [ip('reset', limits.reset)],
    global: [limited({ windowMs: (limits.global ?? defaultLimits.global).windowMs, limit: (limits.global ?? defaultLimits.global).limit, keyGenerator: (req) => `global:${ipKeyGenerator(req.ip)}` })],
    report: [limited({ windowMs: (limits.report ?? defaultLimits.report).windowMs, limit: (limits.report ?? defaultLimits.report).limit, keyGenerator: (req) => `report:${req.user?.id ?? ipKeyGenerator(req.ip)}` })],
    message: [limited({ windowMs: (limits.message ?? defaultLimits.message).windowMs, limit: (limits.message ?? defaultLimits.message).limit, keyGenerator: (req) => `message:${req.user?.id ?? ipKeyGenerator(req.ip)}` })],
    demoAccess: [limited({ windowMs: (limits.demoAccess ?? defaultLimits.demoAccess).windowMs, limit: (limits.demoAccess ?? defaultLimits.demoAccess).limit, keyGenerator: (req) => `demo:${req.user?.id ?? ipKeyGenerator(req.ip)}` })],
  }
}
