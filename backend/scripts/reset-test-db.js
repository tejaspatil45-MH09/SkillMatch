import pg from 'pg'
import { runner } from 'node-pg-migrate'

// Wipes the database in TEST_DATABASE_URL (or DATABASE_URL) and applies every migration.
// Used by the frontend's integration tests. Refuses anything whose name does not contain "test".
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
if (!url || !/test/i.test(new URL(url).pathname)) { console.error('Refusing to wipe: the database name must contain "test".'); process.exit(1) }
const client = new pg.Client({ connectionString: url })
await client.connect()
await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
await client.end()
await runner({ databaseUrl: url, dir: 'migrations', migrationsTable: 'pgmigrations', direction: 'up', count: Infinity, log: () => {}, logger: { info() {}, warn() {}, error() {}, debug() {} } })
