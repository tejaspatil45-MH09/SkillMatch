import { runner } from 'node-pg-migrate'
import { env } from '../src/config/env.js'

const direction = process.argv[2] === 'down' ? 'down' : 'up'
await runner({
  databaseUrl: env.DATABASE_URL, dir: 'migrations', migrationsTable: 'pgmigrations', direction,
  count: direction === 'down' ? 1 : Infinity,   // `down` reverts one migration at a time
  log: console.log,
})
console.log(`migrate ${direction}: done`)
