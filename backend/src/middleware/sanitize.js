import { ApiError } from '../utils/ApiError.js'

// PostgreSQL cannot store a NUL character in text and answers with an error, so a single "\u0000" in any field
// would otherwise surface as a 500. Refuse it (and absurd nesting) for every endpoint, whatever the schema says.
const unsafe = (v, depth = 0) => {
  if (depth > 32) return true
  if (typeof v === 'string') return v.includes('\u0000')
  if (Array.isArray(v)) return v.some((x) => unsafe(x, depth + 1))
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => k.includes('\u0000') || unsafe(x, depth + 1))
  return false
}
export function rejectUnsafeInput(req, res, next) {
  if (unsafe(req.body) || unsafe(req.query)) return next(new ApiError(400, 'The request contains data that is not allowed.', 'VALIDATION'))
  next()
}
