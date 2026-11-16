import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { logger } from '../logger.js'

// With SMTP configured, send real email. Otherwise print it, so password-reset works in development with no setup.
export function createMailer() {
  if (!env.SMTP_HOST) return { send: async ({ to, subject, text }) => logger.info({ to, subject, text }, 'EMAIL (SMTP not configured, printed instead of sent)') }
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined })
  return { send: ({ to, subject, text }) => transport.sendMail({ from: env.MAIL_FROM, to, subject, text }) }
}
