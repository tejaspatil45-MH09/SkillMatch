import 'dotenv/config'   // so TEST_DATABASE_URL can live in .env on any operating system
import { defineConfig } from 'vitest/config'

// Tests run against a REAL Postgres (set TEST_DATABASE_URL): constraints and transactions are
// exactly what an in-memory fake cannot prove. Files run one at a time because they share the database.
export default defineConfig({
  test: {
    globalSetup: ['./test/globalSetup.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
  },
})
