import readline from 'node:readline'
import { z } from 'zod'
import { pool } from '../src/db/pool.js'
import { createAdmin } from '../src/modules/auth/service.js'
import { adminSchema } from '../src/modules/auth/schema.js'

// Admin accounts can ONLY be created here (there is no admin sign-up in the API).
// Usage: node scripts/create-admin.js --email you@example.com --name "Your Name"   (password is prompted, or set ADMIN_PASSWORD)
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined }

function promptHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s) }   // don't echo what is typed
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); process.stdout.write('\n'); resolve(a) }))
}

try {
  const password = process.env.ADMIN_PASSWORD ?? await promptHidden('Password: ')
  const data = adminSchema.parse({ name: arg('name'), email: arg('email'), password })
  await createAdmin(pool, data)
  console.log(`Admin created: ${data.email}`)
} catch (e) {
  if (e instanceof z.ZodError) console.error('Invalid input:\n' + Object.entries(z.flattenError(e).fieldErrors).map(([k, m]) => `  ${k}: ${m.join(', ')}`).join('\n'))
  else console.error(e.code === 'EMAIL_TAKEN' ? e.message : e)
  process.exitCode = 1
} finally {
  await pool.end()
}
