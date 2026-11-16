import { env } from '../src/config/env.js'
import { pool } from '../src/db/pool.js'
import { withTransaction } from '../src/db/tx.js'
import { seed, DEMO_PASSWORD } from '../src/db/seed.js'

if (env.NODE_ENV === 'production') { console.error('Refusing to seed demo data in production.'); process.exit(1) }
const { rows } = await pool.query('SELECT count(*)::int AS n FROM users')
if (rows[0].n > 0 && !process.argv.includes('--yes')) {
  console.error(`The database already has ${rows[0].n} users. Seeding REPLACES all data.\nRun again with:  npm run seed -- --yes`)
  await pool.end(); process.exit(1)
}
console.log('Seeded:', await withTransaction(seed))
console.log(`Demo logins use the password: ${DEMO_PASSWORD}  (e.g. aarav@skillmatch.dev, hr@technova.dev, admin@skillmatch.dev)`)
await pool.end()
