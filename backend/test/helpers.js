import pg from 'pg'
import { expect } from 'vitest'

export const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 })

// Run a test body inside a transaction that is always rolled back, so tests never leave data behind.
export async function inTx(fn) {
  const client = await db.connect()
  try { await client.query('BEGIN'); await fn(client) } finally { await client.query('ROLLBACK'); client.release() }
}

// Expect a statement to fail with a specific Postgres error code, without aborting the surrounding transaction.
export async function expectPgError(client, code, sql, params = []) {
  await client.query('SAVEPOINT expect_error')
  let error
  try { await client.query(sql, params) } catch (e) { error = e }
  await client.query('ROLLBACK TO SAVEPOINT expect_error')
  expect(error, `expected Postgres error ${code} from: ${sql.slice(0, 60)}`).toBeDefined()
  expect(error.code).toBe(code)
}

let n = 0
export async function mkUser(c, role, name = null) {
  n += 1
  const { rows } = await c.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id', [name ?? `${role} User ${n}`, `u${n}-${Date.now()}@test.dev`, 'x', role])
  const id = rows[0].id
  if (role === 'FREELANCER') await c.query('INSERT INTO freelancer_profiles (user_id) VALUES ($1)', [id])
  if (role === 'COMPANY') await c.query('INSERT INTO company_profiles (user_id) VALUES ($1)', [id])
  return id
}
export const mkProject = async (c, companyId, over = {}) => (await c.query(
  'INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline, status) VALUES ($1,$2,$3,$4,$5,now() + interval \'30 days\',$6) RETURNING id',
  [companyId, over.title ?? 'Test project', 'A test project description that is long enough to pass.', over.min ?? 1000, over.max ?? 2000, over.status ?? 'OPEN'])).rows[0].id
export const mkProposal = async (c, projectId, freelancerId, status = 'PENDING') => (await c.query(
  'INSERT INTO proposals (project_id, freelancer_id, cover_letter, bid_amount, estimated_days, status) VALUES ($1,$2,$3,1500,10,$4) RETURNING id',
  [projectId, freelancerId, 'x'.repeat(60), status])).rows[0].id

// ---- API helpers shared by endpoint tests
import request from 'supertest'
import { createApp } from '../src/app.js'
export const mailSent = []
export const app = createApp({ pool: db, limits: false, mailer: { send: async (m) => { mailSent.push(m) } } })
export const DEMO_PASSWORD = 'Password@123'
// A supertest agent that is already logged in (cookie kept between calls)
export async function loginAs(email, password = DEMO_PASSWORD) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/login').send({ email, password })
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  agent.user = res.body.user
  return agent
}
export const idOf = async (sql, params = []) => (await db.query(sql, params)).rows[0].id
