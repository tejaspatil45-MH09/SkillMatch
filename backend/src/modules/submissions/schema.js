import { z } from 'zod'

// ---- links. A blank string means "no link". Everything is checked here AND again by CHECK constraints in the database.
const looksLikeGithubRepo = (raw) => {
  try {
    const x = new URL(raw)
    if (x.protocol !== 'https:' || x.username || x.password || x.port) return false
    if (!['github.com', 'www.github.com'].includes(x.hostname.toLowerCase())) return false
    const [owner, repo] = x.pathname.split('/').filter(Boolean)
    const ok = (s) => typeof s === 'string' && /^[A-Za-z0-9_.-]+$/.test(s) && !/^\.+$/.test(s)
    return ok(owner) && ok(repo) && (x.origin + x.pathname).length <= 300
  } catch { return false }
}
// Plain http(s), a real host, no embedded credentials (https://user:pass@evil.com is a phishing trick)
const looksLikeWebLink = (raw) => {
  try {
    const x = new URL(raw)
    return ['http:', 'https:'].includes(x.protocol) && !x.username && !x.password && x.hostname.includes('.') && x.href.length <= 500
  } catch { return false }
}
const link = (valid, message) => z.string().trim().max(500, 'That link is too long.').refine((u) => u === '' || valid(u), message).nullish()

// The hiring, the version, the status, the author and every timestamp can never come from the client.
export const submitWorkSchema = z.strictObject({
  title: z.string().trim().min(3, 'Give the submission a title (at least 3 characters).').max(120, 'Keep the title under 120 characters.'),
  description: z.string().trim().max(5000, 'Keep the notes under 5000 characters.').nullish(),
  repoUrl: link(looksLikeGithubRepo, 'Enter a GitHub repository link, like https://github.com/owner/repository.'),
  liveUrl: link(looksLikeWebLink, 'Enter a full link starting with https:// (or http://), without a username or password.'),
}).superRefine((v, ctx) => {
  const hasLink = Boolean(v.repoUrl?.trim() || v.liveUrl?.trim())
  if (!hasLink && (v.description ?? '').trim().length < 20) {
    ctx.addIssue({ code: 'custom', path: ['description'], message: 'Add a repository or live link, or describe what you are delivering (at least 20 characters).' })
  }
})

export const requestRevisionSchema = z.strictObject({
  feedback: z.string().trim().min(10, 'Explain what needs to change (at least 10 characters).').max(1000, 'Keep the explanation under 1000 characters.'),
})

// Blank / missing -> null, otherwise the normalised link (so "a b" is stored as "a%20b" and always passes the database check).
// A repository link keeps only origin + path: a query string or #fragment adds nothing and is not allowed by the database check.
export const normaliseLink = (v) => (v && v.trim() ? new URL(v.trim()).href : null)
export const normaliseRepo = (v) => { if (!v || !v.trim()) return null; const x = new URL(v.trim()); return x.origin + x.pathname }
