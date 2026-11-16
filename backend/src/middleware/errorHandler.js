import { z } from 'zod'
import { ApiError } from '../utils/ApiError.js'
import { logger } from '../logger.js'

export const notFoundHandler = (req, res, next) => next(new ApiError(404, 'Route not found.', 'NOT_FOUND'))

// Every error leaves the API as { message, code, fields? } with a sensible status.
// Anything unexpected becomes a generic 500: details are logged, never sent to the client.
export function errorHandler(err, req, res, _next) {
  let status = 500, body = { message: 'Something went wrong on our side.', code: 'INTERNAL' }

  if (err instanceof ApiError) { status = err.status; body = { message: err.message, code: err.code, ...(err.fields && { fields: err.fields }) } }
  else if (err instanceof z.ZodError) { status = 400; body = { message: 'Please check the highlighted fields.', code: 'VALIDATION', fields: z.flattenError(err).fieldErrors } }
  else if (err.type === 'entity.parse.failed') { status = 400; body = { message: 'The request body is not valid JSON.', code: 'INVALID_JSON' } }
  else if (err.type === 'entity.too.large') { status = 413; body = { message: 'The request is too large.', code: 'TOO_LARGE' } }
  else if (err.code === '23505') { status = 409; body = { message: 'That already exists.', code: 'CONFLICT' } }          // unique violation (services map specific cases first)
  else if (err.code === '23503') { status = 409; body = { message: 'This item is linked to other records.', code: 'CONFLICT' } } // foreign key
  else if (err.code === '23514' || err.code === '22P02') { status = 400; body = { message: 'Some values are not allowed.', code: 'VALIDATION' } } // check / enum
  else if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) { status = err.status; body = { message: 'The request could not be processed.', code: err.status === 415 ? 'UNSUPPORTED' : 'BAD_REQUEST' } }

  if (status >= 500) logger.error({ err, path: req.path }, 'unhandled error')
  res.status(status).json(body)
}
