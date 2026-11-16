import crypto from 'node:crypto'
import argon2 from 'argon2'
import { ApiError, conflict, forbidden } from '../../utils/ApiError.js'
import { withTransaction } from '../../db/tx.js'
import { logger } from '../../logger.js'

// Verifying against this when the email is unknown keeps "no such user" and "wrong password" equally slow.
const DUMMY_HASH = await argon2.hash('timing-equaliser-password-1')
const RESET_TTL_MINUTES = 60
export const FORGOT_MESSAGE = 'If an account exists for this email, a reset link has been sent.'
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

export const hashPassword = (p) => argon2.hash(p)   // argon2id with the library's current defaults

const emailTaken = () => conflict('An account with this email already exists.', 'EMAIL_TAKEN')

async function createUser(db, { name, email, password, role }) {
  const hash = await hashPassword(password)
  return withTransaction(async (c) => {
    try {
      const { rows: [u] } = await c.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id', [name, email, hash, role])
      if (role === 'FREELANCER') await c.query('INSERT INTO freelancer_profiles (user_id) VALUES ($1)', [u.id])
      if (role === 'COMPANY') await c.query('INSERT INTO company_profiles (user_id) VALUES ($1)', [u.id])
      return u.id
    } catch (e) {
      if (e.code === '23505' && e.constraint === 'users_email_lower_key') throw emailTaken()   // also covers two simultaneous sign-ups
      throw e
    }
  }, db)
}
export const register = createUser            // roles are validated upstream: only FREELANCER or COMPANY reach here
export const createAdmin = (db, d) => createUser(db, { ...d, role: 'ADMIN' })   // used only by the create-admin script

export async function login(db, { email, password }) {
  const { rows: [u] } = await db.query('SELECT id, password_hash, status FROM users WHERE lower(email) = $1', [email])
  const ok = await argon2.verify(u?.password_hash ?? DUMMY_HASH, password).catch(() => false)
  if (!u || !ok) throw new ApiError(401, 'Incorrect email or password.', 'INVALID_CREDENTIALS')   // identical for both cases
  // Only after the password is proven do we reveal the account is suspended
  if (u.status === 'SUSPENDED') throw forbidden('This account has been suspended.', 'SUSPENDED')
  if (argon2.needsRehash(u.password_hash)) await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), u.id]).catch(() => {})
  return u.id
}

// Called after the HTTP response has already been sent, so unknown and known emails respond in the same time.
export async function requestPasswordReset(db, mailer, { email, appUrl }) {
  const { rows: [u] } = await db.query("SELECT id, name FROM users WHERE lower(email) = $1 AND status = 'ACTIVE'", [email])
  if (!u) return
  const token = crypto.randomBytes(32).toString('base64url')   // 256 bits; only its hash is stored
  await withTransaction(async (c) => {
    await c.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [u.id])   // older links stop working
    await c.query("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1,$2, now() + make_interval(mins => $3))", [sha256(token), u.id, RESET_TTL_MINUTES])
  }, db)
  await mailer.send({
    to: email, subject: 'Reset your SkillMatch password',
    text: `Hi ${u.name},\n\nUse this link to choose a new password (valid for ${RESET_TTL_MINUTES} minutes):\n\n${appUrl}/reset-password?token=${token}\n\nIf you didn't ask for this, you can ignore this email.`,
  })
  logger.info({ userId: u.id }, 'password reset requested')
}

export async function resetPassword(db, { token, password }) {
  const hash = await hashPassword(password)
  return withTransaction(async (c) => {
    // One atomic statement: check not-used and not-expired AND mark used, so two simultaneous requests cannot both win
    const { rows: [t] } = await c.query('UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id', [sha256(token)])
    if (!t) throw new ApiError(400, 'This reset link is invalid or has expired.', 'INVALID_TOKEN')
    await c.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, t.user_id])
    await c.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [t.user_id])
    await c.query("DELETE FROM session WHERE sess ->> 'userId' = $1", [String(t.user_id)])   // log out everywhere
    return t.user_id
  }, db)
}
