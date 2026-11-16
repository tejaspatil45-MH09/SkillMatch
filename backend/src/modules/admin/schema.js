import { z } from 'zod'
export const skillSchema = z.strictObject({ name: z.string().trim().min(2, 'Enter a skill name (at least 2 characters).').max(40, 'Keep skill names under 40 characters.') })
export const demoLogQuery = z.object({ demoId: z.uuid('Choose a valid demo.').optional() })

// ---- Reports & analytics filters. Strict: unknown or repeated parameters are a 400, never silently ignored.
export const RANGES = ['7d', '30d', '3m', '1y', 'all', 'custom']
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100
}, 'Enter a real date between 2000 and 2100.')
export const analyticsQuery = z.strictObject({
  range: z.enum(RANGES).default('all'),
  from: DAY.optional(),
  to: DAY.optional(),
  projectStatus: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  hiringStatus: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
}).superRefine((v, ctx) => {
  const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })
  if (v.range !== 'custom') { for (const k of ['from', 'to']) if (v[k] !== undefined) issue(k, 'Dates are only used with a custom range.'); return }
  for (const k of ['from', 'to']) if (v[k] === undefined) issue(k, 'Choose both a start and an end date for a custom range.')
  if (v.from && v.to) {
    if (v.from > v.to) issue('to', 'The end date must be on or after the start date.')
    else if ((Date.parse(v.to) - Date.parse(v.from)) / 864e5 > 1830) issue('to', 'Choose a range of 5 years or less.')
  }
})
