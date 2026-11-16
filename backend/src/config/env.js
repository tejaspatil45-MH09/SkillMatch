import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),
  // Comma-separated list of browser origins allowed to call the API with cookies (the frontend)
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Base URL of the frontend, used to build password-reset links
  APP_URL: z.string().default('http://localhost:5173'),
  // Email: when SMTP_HOST is unset, emails are printed to the server log instead of being sent
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().positive().default(587), SMTP_USER: z.string().optional(), SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('SkillMatch <no-reply@skillmatch.local>'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
}).superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production' && !v.SESSION_SECRET) ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'SESSION_SECRET is required in production' })
})

// Fail fast with a readable message instead of crashing later on `undefined`
export function loadEnv(source = process.env) {
  const r = schema.safeParse(source)
  if (!r.success) {
    const problems = Object.entries(z.flattenError(r.error).fieldErrors).map(([k, m]) => `  ${k}: ${m.join(', ')}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${problems}`)
  }
  return r.data
}
export const env = loadEnv()
