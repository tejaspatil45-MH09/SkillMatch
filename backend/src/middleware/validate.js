import { ApiError } from '../utils/ApiError.js'

// Parse and replace req[source] with the validated data. ZodError -> 400 VALIDATION via the error handler.
// (Express 5 makes req.query read-only, so the parsed value is defined over it instead of assigned.)
export const validate = (schema, source = 'body') => (req, res, next) => {
  const parsed = schema.parse(req[source] ?? {})
  Object.defineProperty(req, source, { value: parsed, writable: true, configurable: true, enumerable: true })
  next()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v) => typeof v === 'string' && UUID.test(v)
// router.param handler: a malformed id is simply "not found" (and never reaches Postgres as a bad uuid cast)
export const uuidParam = (req, res, next, value) => (isUuid(value) ? next() : next(new ApiError(404, 'Not found.', 'NOT_FOUND')))
