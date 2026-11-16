import { z } from 'zod'

// .strict() everywhere: unknown fields (e.g. "status", "role: ADMIN" smuggled into other endpoints) are rejected, not ignored
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.'))
export const password = z.string().max(128, 'Use at most 128 characters.').min(8, 'Use at least 8 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.').regex(/\d/, 'Include at least one number.')
const name = z.string().trim().min(2, 'Enter your name.').max(100, 'Keep the name under 100 characters.')

export const registerSchema = z.strictObject({ name, email, password, role: z.enum(['FREELANCER', 'COMPANY'], { error: 'Choose Freelancer or Company.' }) })
export const loginSchema = z.strictObject({ email, password: z.string().min(1, 'Enter your password.').max(128) })   // no policy on login: only on creation
export const forgotSchema = z.strictObject({ email })
export const resetSchema = z.strictObject({ token: z.string().min(20).max(200), password })
export const adminSchema = z.strictObject({ name, email, password })
