import request from 'supertest'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'
import { ApiError } from '../src/utils/ApiError.js'
import { db } from './helpers.js'

const app = createApp({
  pool: db,
  routes: (a) => {
    a.get('/boom', () => { throw new Error('secret internal detail: password=hunter2') })
    a.get('/async-boom', async () => { await Promise.resolve(); throw new Error('async failure') })
    a.get('/teapot', () => { throw new ApiError(418, 'Short and stout.', 'TEAPOT') })
    a.get('/zod', () => z.object({ email: z.email() }).parse({}))
    a.get('/dup', () => { throw Object.assign(new Error('duplicate key value violates unique constraint "x"'), { code: '23505' }) })
    a.get('/check', () => { throw Object.assign(new Error('violates check constraint'), { code: '23514' }) })
    a.post('/echo', (req, res) => res.json(req.body))
  },
})

describe('health and plumbing', () => {
  it('GET /api/health is ok when the database answers', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' })
  })
  it('reports 503 DB_DOWN (not a crash) when the database is unreachable', async () => {
    const down = createApp({ pool: { query: async () => { throw new Error('ECONNREFUSED') } } })
    const res = await request(down).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('DB_DOWN')
  })
  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['content-security-policy']).toBeDefined()
  })
  it('parses JSON bodies', async () => {
    const res = await request(app).post('/echo').send({ hello: 'world' })
    expect(res.body).toEqual({ hello: 'world' })
  })
})

describe('error handling', () => {
  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ message: 'Route not found.', code: 'NOT_FOUND' })
  })
  it('malformed JSON returns 400 INVALID_JSON', async () => {
    const res = await request(app).post('/echo').set('Content-Type', 'application/json').send('{"broken":')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_JSON')
  })
  it('oversized bodies return 413', async () => {
    const res = await request(app).post('/echo').send({ big: 'x'.repeat(200_000) })
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('TOO_LARGE')
  })
  it('unexpected errors become a generic 500 and never leak details', async () => {
    for (const path of ['/boom', '/async-boom']) {   // async errors are forwarded by Express 5
      const res = await request(app).get(path)
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ message: 'Something went wrong on our side.', code: 'INTERNAL' })
      expect(JSON.stringify(res.body)).not.toMatch(/hunter2|secret|stack|async failure/)
    }
  })
  it('ApiError keeps its status, message and code', async () => {
    const res = await request(app).get('/teapot')
    expect(res.status).toBe(418)
    expect(res.body).toEqual({ message: 'Short and stout.', code: 'TEAPOT' })
  })
  it('validation errors list the offending fields', async () => {
    const res = await request(app).get('/zod')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION')
    expect(res.body.fields.email).toBeInstanceOf(Array)
  })
  it('database constraint errors map to 409 / 400 without exposing SQL details', async () => {
    const dup = await request(app).get('/dup')
    expect(dup.status).toBe(409); expect(dup.body.code).toBe('CONFLICT'); expect(JSON.stringify(dup.body)).not.toMatch(/constraint/)
    const chk = await request(app).get('/check')
    expect(chk.status).toBe(400); expect(chk.body.code).toBe('VALIDATION')
  })
})

describe('environment validation', () => {
  const ok = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' }
  it('applies defaults', () => {
    const e = loadEnv(ok)
    expect(e).toMatchObject({ NODE_ENV: 'development', PORT: 5000, CORS_ORIGIN: 'http://localhost:5173' })
  })
  it('requires DATABASE_URL, with a readable message', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/)
  })
  it('requires a long SESSION_SECRET in production', () => {
    expect(() => loadEnv({ ...ok, NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/)
    expect(() => loadEnv({ ...ok, NODE_ENV: 'production', SESSION_SECRET: 'short' })).toThrow(/at least 32/)
    expect(loadEnv({ ...ok, NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) }).NODE_ENV).toBe('production')
  })
  it('rejects bad values', () => {
    expect(() => loadEnv({ ...ok, PORT: 'abc' })).toThrow(/PORT/)
    expect(() => loadEnv({ ...ok, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })
})
