import { env } from './config/env.js'
import { createApp } from './app.js'
import { pool } from './db/pool.js'
import { logger } from './logger.js'

const server = createApp().listen(env.PORT, () => logger.info(`SkillMatch API listening on :${env.PORT} (${env.NODE_ENV})`))

// Don't let slow or stalled clients tie up connections
server.headersTimeout = 15000
server.requestTimeout = 30000

// Finish in-flight requests, then close the pool, before exiting
function shutdown(signal) {
  logger.info(`${signal} received, shutting down`)
  server.close(async () => { await pool.end(); process.exit(0) })
  setTimeout(() => process.exit(1), 10000).unref()
}
// An unexpected error leaves the process in an unknown state: log it and exit so the supervisor restarts a clean one
for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, (err) => { logger.fatal({ err }, event); process.exit(1) })
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
