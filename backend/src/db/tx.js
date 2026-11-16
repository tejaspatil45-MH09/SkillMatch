import { pool } from './pool.js'

// Run `fn(client)` in one transaction; any throw rolls everything back.
export async function withTransaction(fn, db = pool) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
