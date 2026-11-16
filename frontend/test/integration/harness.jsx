import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import request from 'supertest'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../src/context/ToastContext'
import { AuthProvider } from '../../src/context/AuthContext'
import { NotificationProvider } from '../../src/context/NotificationContext'
import AppRoutes from '../../src/routes/AppRoutes'
import { createApp } from '../../../backend/src/app.js'
import { pool } from '../../../backend/src/db/pool.js'
import { seed } from '../../../backend/src/db/seed.js'
import { withTransaction } from '../../../backend/src/db/tx.js'

// The REAL backend, in-process. Outgoing email is captured so tests can follow reset links.
export const mail = []
export const backend = createApp({ pool, limits: false, mailer: { send: async (m) => { mail.push(m) } } })
export const db = pool
export const freshDatabase = () => withTransaction(seed, pool)
export const PASSWORD = 'Password@123'
window.scrollTo = () => {}

// One "browser": its own cookie jar, and a fetch() that delivers the app's /api calls to Express exactly as the
// dev proxy would (including the Origin header a real browser sends on writes).
export class Browser {
  constructor() {
    this.agent = request.agent(backend)
    this.fetch = async (url, init = {}) => {
      const u = new URL(url, 'http://localhost')
      const method = (init.method ?? 'GET').toLowerCase()
      let req = this.agent[method](u.pathname + u.search)
      if (method !== 'get') req = req.set('Origin', 'http://localhost:5173')
      for (const [k, v] of Object.entries(init.headers ?? {})) req = req.set(k, v)
      const res = await (init.body ? req.send(init.body) : req)
      return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.body, text: async () => res.text ?? '' }
    }
  }
  // Direct API access for setting things up quickly (still through the real server and this browser's cookie)
  api(method, path, body) { let r = this.agent[method](`/api${path}`); if (method !== 'get') r = r.set('Origin', 'http://localhost:5173'); return body === undefined ? r : r.send(body) }
  async login(email, password = PASSWORD) { const r = await this.api('post', '/auth/login', { email, password }); if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`); this.user = r.body.user; return this }
  mount(path = '/') {
    cleanup(); globalThis.fetch = this.fetch
    return render(<MemoryRouter initialEntries={[path]}><ToastProvider><AuthProvider><NotificationProvider><AppRoutes /></NotificationProvider></AuthProvider></ToastProvider></MemoryRouter>)
  }
}

export const wait = (fn, ms = 10000) => waitFor(fn, { timeout: ms, interval: 40 })
// true when text (string or regex) appears at least once / disappears; false instead of throwing, so check() can report it
export const any = async (text) => { try { await wait(() => { if (!screen.queryAllByText(text).length) throw 0 }); return true } catch { return false } }
export const gone = async (text) => { try { await wait(() => { if (screen.queryAllByText(text).length) throw 0 }); return true } catch { return false } }
export const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
export const press = async (name, root = screen) => { const el = await (root === screen ? screen.findByRole('button', { name }, { timeout: 10000 }) : within(root).findByRole('button', { name }, { timeout: 10000 })); fireEvent.click(el) }
export const dialog = () => screen.findByRole('dialog', {}, { timeout: 10000 })
export const idOf = async (sql, params = []) => (await pool.query(sql, params)).rows[0].id
export { screen, within, fireEvent, cleanup }
