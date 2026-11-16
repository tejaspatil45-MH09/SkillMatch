import fs from 'node:fs'
import path from 'node:path'

// Builds the list of every API route by READING THE SOURCE (app.js mounts + each routes.js), so the generated
// checks below always cover the real API, including endpoints added in the future.
const SRC = path.resolve('src')

export function discoverRoutes() {
  const app = fs.readFileSync(`${SRC}/app.js`, 'utf8')
  const files = {}   // exported router function -> its file
  for (const m of app.matchAll(/import \{([^}]+)\} from '\.\/(modules\/[^']+)'/g)) for (const n of m[1].split(',')) files[n.trim()] = m[2]
  const routes = []
  for (const m of app.matchAll(/app\.use\('(\/api\/[^']*)',\s*(\w+)\(/g)) {
    const [, mount, fn] = m
    const src = fs.readFileSync(`${SRC}/${files[fn]}`, 'utf8')
    const start = src.indexOf(`export function ${fn}(`)
    const end = src.indexOf('export function ', start + 1)
    const body = src.slice(start, end === -1 ? undefined : end)
    for (const r of body.matchAll(/\br\.(get|post|put|delete)\('([^']*)'/g)) routes.push({ method: r[1], template: mount + (r[2] === '/' ? '' : r[2]) })
  }
  for (const m of app.matchAll(/app\.(get|post|put|delete)\('(\/api\/[^']*)'/g)) routes.push({ method: m[1], template: m[2] })
  return routes
}

// The only endpoints reachable without signing in
export const PUBLIC = new Set(['get /api/health', 'post /api/auth/register', 'post /api/auth/login', 'post /api/auth/logout', 'post /api/auth/forgot-password', 'post /api/auth/reset-password'])
export const key = (r) => `${r.method} ${r.template}`
export const withId = (template, id) => template.replace(/:\w+/g, id)
