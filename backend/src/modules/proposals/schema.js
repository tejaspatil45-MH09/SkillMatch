import { z } from 'zod'

// Only these three fields can come from the client. Status, freelancer and project are never accepted from the body.
export const submitSchema = z.strictObject({
  coverLetter: z.string().trim().min(50, 'Write at least 50 characters.').max(2000, 'Keep the cover letter under 2000 characters.'),
  bidAmount: z.number({ error: 'Enter your bid amount.' }).int('Enter a whole number of rupees.').positive('Bid must be above 0.').max(100_000_000, 'That amount is too large.'),
  estimatedDays: z.number({ error: 'Enter the estimated number of days.' }).int('Enter a whole number of days.').min(1, 'Enter at least 1 day.').max(365, 'Enter at most 365 days.'),
})
