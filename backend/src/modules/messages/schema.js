import { z } from 'zod'
// The hiring and the sender always come from the URL and the session, never from the body.
export const sendMessageSchema = z.strictObject({
  body: z.string().trim().min(1, 'Write a message first.').max(2000, 'Keep messages under 2000 characters.'),
})
