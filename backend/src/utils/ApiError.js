// Same shape the frontend expects: { status, message, code }
export class ApiError extends Error {
  constructor(status, message, code, fields) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}
export const notFound = (what = 'Resource') => new ApiError(404, `${what} not found.`, 'NOT_FOUND')
export const forbidden = (message = 'You do not have permission to do this.', code = 'FORBIDDEN') => new ApiError(403, message, code)
export const conflict = (message, code = 'CONFLICT') => new ApiError(409, message, code)
