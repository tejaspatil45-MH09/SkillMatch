import { execFileSync } from 'node:child_process'
import path from 'node:path'

// Wipe the throwaway database and apply the backend's migrations (the backend refuses unless the name contains "test")
export default function setup() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('Set TEST_DATABASE_URL to a throwaway database (see README). These tests wipe it.')
  execFileSync('node', ['scripts/reset-test-db.js'], { cwd: path.resolve('../backend'), env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' })
}
