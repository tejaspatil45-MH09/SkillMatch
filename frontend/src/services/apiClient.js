// The ONLY file that knows whether we are mocking. To go live: set VITE_USE_MOCK=false.
import { ApiError } from '../utils/ApiError'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const API_URL = import.meta.env.VITE_API_URL ?? '/api'
const SESSION_KEY = 'skillmatch_mock_session'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const readToken = () => { try { return localStorage.getItem(SESSION_KEY) } catch { return null } }
const writeToken = (t) => { try { t ? localStorage.setItem(SESSION_KEY, t) : localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ } }

async function mockRequest(method, path, { body, query }) {
  await sleep(300 + Math.random() * 400)
  const { handle } = await import('../data/mockServer')
  const res = handle(method, path, { body, query, token: readToken() })
  if (path === '/auth/login' || path === '/auth/register') writeToken(res.token)
  if (path === '/auth/logout') writeToken(null)
  return res
}

async function realRequest(method, path, { body, query }) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '')) : ''
  let res
  try {
    res = await fetch(`${API_URL}${path}${qs}`, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'NETWORK') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.message ?? 'Request failed.', data.code, data.fields)
  return data
}

// Plain-text download (the CSV export). Real backend only: the mock server has no analytics or export endpoints.
async function realText(path, query) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '')) : ''
  let res
  try { res = await fetch(`${API_URL}${path}${qs}`, { method: 'GET', credentials: 'include' }) } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection.', 'NETWORK') }
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new ApiError(res.status, data.message ?? 'Request failed.', data.code, data.fields) }
  return res.text()
}

const request = (method, path, opts = {}) => (USE_MOCK ? mockRequest : realRequest)(method, path, opts)

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  delete: (path) => request('DELETE', path),
  text: (path, query) => (USE_MOCK ? Promise.reject(new ApiError(404, `No route for GET ${path}`, 'NOT_FOUND')) : realText(path, query)),
}
export { ApiError }
