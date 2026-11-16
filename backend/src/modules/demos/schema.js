import { z } from 'zod'

// Plain http(s) links only, with a real host and no embedded credentials (https://user:pass@evil.com is a phishing trick)
const safeUrl = z.string().trim().max(500, 'That link is too long.').refine((u) => {
  try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) && !x.username && !x.password && x.hostname.includes('.') } catch { return false }
}, 'Enter a full link starting with https:// (or http://), without a username or password.')

// The expiry, viewed state and proposal can never come from the client
export const submitDemoSchema = z.strictObject({
  url: safeUrl,
  description: z.string().trim().min(20, 'Describe what the company will see (at least 20 characters).').max(1000, 'Keep the description under 1000 characters.'),
})
