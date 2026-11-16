// Same shape the real Express API will return: { status, message, code }
export class ApiError extends Error {
  constructor(status, message, code, fields) { super(message); this.status = status; this.code = code; if (fields) this.fields = fields }
}
