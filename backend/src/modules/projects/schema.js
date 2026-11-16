import { z } from 'zod'

const money = z.number().int('Enter a whole number of rupees.').positive('Enter an amount above 0.').max(100_000_000, 'That amount is too large.')
const skills = z.array(z.string().trim().min(1).max(40)).min(1, 'Select at least one required skill.').max(15, 'Select at most 15 skills.')
const deadline = z.iso.datetime({ offset: true, error: 'Choose a valid deadline.' }).refine((d) => new Date(d) > new Date(), 'Deadline must be in the future.')
const base = {
  title: z.string().trim().min(5, 'Enter a project title (at least 5 characters).').max(100, 'Keep the title under 100 characters.'),
  description: z.string().trim().min(30, 'Describe the project in at least 30 characters.').max(5000),
  budgetMin: money, budgetMax: money, deadline, skills,
}
const budgetOrder = (d) => d.budgetMin === undefined || d.budgetMax === undefined || d.budgetMin <= d.budgetMax
const budgetIssue = { path: ['budgetMax'], message: 'Maximum budget must be at least the minimum.' }

// Only these fields can ever be set by a client: status, company and ids are never accepted from the request.
export const createProject = z.strictObject(base).refine(budgetOrder, budgetIssue)
export const updateProject = z.strictObject(base).partial().refine(budgetOrder, budgetIssue).refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update.' })

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  skills: z.string().max(500).optional(),
  minBudget: z.coerce.number().int().min(0).optional(),
  maxBudget: z.coerce.number().int().min(0).optional(),
  deadlineBefore: z.iso.datetime({ offset: true }).optional(),
  sort: z.enum(['match', 'newest', 'budget', 'deadline']).optional(),
})
