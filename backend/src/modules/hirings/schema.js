import { z } from 'zod'
export const cancelSchema = z.strictObject({ reason: z.string().trim().min(10, 'Please give a reason (at least 10 characters).').max(500, 'Keep the reason under 500 characters.') })
