import pg from 'pg'
import { env } from '../config/env.js'

// Money is stored as integer rupees and ids are uuids, so the default type parsers are fine.
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000,
  statement_timeout: 10000,                     // a runaway query is cut off after 10 s instead of hogging a connection
  idle_in_transaction_session_timeout: 30000,   // a transaction left open by a crash cannot hold row locks forever
})
export const query = (text, params) => pool.query(text, params)
