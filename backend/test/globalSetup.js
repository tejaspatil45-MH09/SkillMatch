import pg from 'pg'
import { runner } from 'node-pg-migrate'

// Wipes the test database, then proves the migrations work in BOTH directions: up -> down -> up.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('Set TEST_DATABASE_URL to a throwaway database (see .env.example). Tests wipe it on every run.')
  if (!/test/i.test(new URL(url).pathname)) throw new Error('Refusing to run: the TEST_DATABASE_URL database name must contain "test".')

  const client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await client.end()

  const base = { databaseUrl: url, dir: 'migrations', migrationsTable: 'pgmigrations', log: () => {}, logger: { info() {}, warn() {}, error() {}, debug() {} } }
  await runner({ ...base, direction: 'up', count: Infinity })
  await runner({ ...base, direction: 'down', count: Infinity })
  await runner({ ...base, direction: 'up', count: Infinity })
}
