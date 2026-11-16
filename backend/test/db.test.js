import { describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx.js'
import { db } from './helpers.js'

const count = async () => Number((await db.query("SELECT count(*) FROM skills WHERE name LIKE 'TxTest%'")).rows[0].count)

describe('withTransaction', () => {
  it('commits when the callback succeeds', async () => {
    await withTransaction((c) => c.query("INSERT INTO skills (name) VALUES ('TxTest Commit')"), db)
    expect(await count()).toBe(1)
    await db.query("DELETE FROM skills WHERE name LIKE 'TxTest%'")
  })
  it('rolls EVERYTHING back when anything throws', async () => {
    await expect(withTransaction(async (c) => {
      await c.query("INSERT INTO skills (name) VALUES ('TxTest One')")
      await c.query("INSERT INTO skills (name) VALUES ('TxTest Two')")
      throw new Error('boom')
    }, db)).rejects.toThrow('boom')
    expect(await count()).toBe(0)
  })
  it('rolls back on a database error and releases the connection', async () => {
    for (let i = 0; i < 6; i++)   // more iterations than the pool size: leaked connections would hang here
      await expect(withTransaction((c) => c.query("INSERT INTO skills (name) VALUES ('x')"), db)).rejects.toMatchObject({ code: '23514' })
    expect(await count()).toBe(0)
  })
})
