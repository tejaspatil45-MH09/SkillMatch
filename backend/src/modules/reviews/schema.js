import { z } from 'zod'
// Reviewer, reviewee and timestamps are derived on the server; the client only chooses the hiring, rating and words
export const reviewSchema = z.strictObject({
  hiringId: z.uuid('Choose a valid hiring.'),
  rating: z.number({ error: 'Choose a rating from 1 to 5.' }).int('Rating must be a whole number.').min(1, 'Rating must be between 1 and 5.').max(5, 'Rating must be between 1 and 5.'),
  comment: z.string().trim().min(10, 'Write a short comment (at least 10 characters).').max(500, 'Keep the comment under 500 characters.'),
})
export const reviewsQuery = z.object({ userId: z.uuid('Choose a valid user.') })
