import { z } from 'zod'
export const reportSchema = z.strictObject({
  targetType: z.enum(['USER', 'PROJECT'], { error: 'You can report a user or a project.' }),
  targetId: z.uuid('Choose a valid item to report.'),
  reason: z.string().trim().min(20, 'Please explain the problem (at least 20 characters).').max(1000, 'Keep the explanation under 1000 characters.'),
})
