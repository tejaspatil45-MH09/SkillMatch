import argon2 from 'argon2'
import { beforeAll, describe, expect, it } from 'vitest'
import { seed, counts, DEMO_PASSWORD } from '../src/db/seed.js'
import { withTransaction } from '../src/db/tx.js'
import { db } from './helpers.js'

const q = async (sql, params) => (await db.query(sql, params)).rows

describe('seed data (mirrors the frontend demo)', () => {
  beforeAll(() => withTransaction(seed, db))

  it('has the same counts as the frontend mock', async () => {
    expect(await counts(db)).toEqual({ users: 8, skills: 24, projects: 8, proposals: 9, demos: 3, hirings: 2, reviews: 1, notifications: 6, reports: 2 })
  })

  it('stores only argon2id hashes, and the documented demo password verifies', async () => {
    const users = await q('SELECT email, password_hash FROM users')
    expect(users.every((u) => u.password_hash.startsWith('$argon2id$'))).toBe(true)
    expect(users.some((u) => u.password_hash.includes(DEMO_PASSWORD))).toBe(false)
    for (const email of ['aarav@skillmatch.dev', 'hr@technova.dev', 'admin@skillmatch.dev']) {
      const u = users.find((x) => x.email === email)
      expect(await argon2.verify(u.password_hash, DEMO_PASSWORD)).toBe(true)
      expect(await argon2.verify(u.password_hash, 'wrong-password')).toBe(false)
    }
  })

  it('exactly one admin, seeded rather than registered', async () => {
    expect((await q("SELECT email FROM users WHERE role='ADMIN'")).map((r) => r.email)).toEqual(['admin@skillmatch.dev'])
  })

  it('skill-match % computed in SQL agrees with the frontend (matched / required, rounded)', async () => {
    const rows = await q(`
      SELECT f.name AS freelancer, p.title AS project,
             round(100.0 * count(fs.skill_id) / count(ps.skill_id))::int AS match
      FROM proposals pr
      JOIN users f ON f.id = pr.freelancer_id
      JOIN projects p ON p.id = pr.project_id
      JOIN project_skills ps ON ps.project_id = pr.project_id
      LEFT JOIN freelancer_skills fs ON fs.user_id = pr.freelancer_id AND fs.skill_id = ps.skill_id
      GROUP BY f.name, p.title`)
    const m = (f, p) => rows.find((r) => r.freelancer === f && r.project === p).match
    expect(m('Aarav Sharma', 'E-commerce Website')).toBe(100)
    expect(m('Priya Deshmukh', 'E-commerce Website')).toBe(33)
    expect(m('Kunal Joshi', 'E-commerce Website')).toBe(33)
    expect(m('Rohan Patil', 'Warehouse Route Optimizer')).toBe(50)
    expect(m('Priya Deshmukh', 'Mobile App UI Redesign')).toBe(100)
  })

  it('demo states are: one available, one viewed, one expired, all with a 24-hour window', async () => {
    const rows = await q(`SELECT CASE WHEN viewed_at IS NOT NULL THEN 'VIEWED' WHEN expires_at < now() THEN 'EXPIRED' ELSE 'AVAILABLE' END AS state,
                                 expires_at - submitted_at = interval '24 hours' AS window_ok FROM demos`)
    expect(rows.map((r) => r.state).sort()).toEqual(['AVAILABLE', 'EXPIRED', 'VIEWED'])
    expect(rows.every((r) => r.window_ok)).toBe(true)
    const [avail] = await q("SELECT extract(epoch FROM (expires_at - now())) / 3600 AS hours_left FROM demos WHERE viewed_at IS NULL AND expires_at > now()")
    expect(Number(avail.hours_left)).toBeGreaterThan(7)
    expect(Number(avail.hours_left)).toBeLessThan(9)
  })

  it('demo audit log records submissions and the one grant', async () => {
    const rows = await q('SELECT outcome, count(*)::int AS n FROM demo_access_log GROUP BY outcome')
    expect(Object.fromEntries(rows.map((r) => [r.outcome, r.n]))).toEqual({ SUBMITTED: 3, GRANTED: 1 })
  })

  it('status invariants hold across tables', async () => {
    // every ACCEPTED proposal has exactly one hiring; nothing else does
    expect(await q("SELECT 1 FROM proposals p LEFT JOIN hirings h ON h.proposal_id = p.id WHERE (p.status = 'ACCEPTED') <> (h.id IS NOT NULL)")).toEqual([])
    // project status follows its hiring
    expect(await q("SELECT 1 FROM projects p JOIN hirings h ON h.project_id = p.id WHERE (p.status='IN_PROGRESS') <> (h.status='ACTIVE')")).toEqual([])
    expect((await q("SELECT title FROM projects WHERE status='COMPLETED'")).map((r) => r.title)).toEqual(['Company Portfolio Website'])
    // demos exist only for shortlisted or accepted proposals
    expect(await q("SELECT 1 FROM demos d JOIN proposals p ON p.id = d.proposal_id WHERE p.status NOT IN ('SHORTLISTED','ACCEPTED')")).toEqual([])
    // no OPEN project has an accepted proposal
    expect(await q("SELECT 1 FROM projects p JOIN proposals pr ON pr.project_id = p.id WHERE p.status='OPEN' AND pr.status='ACCEPTED'")).toEqual([])
  })

  it('has the seeded rating and reports with exactly one target each', async () => {
    expect(await q("SELECT rating FROM reviews")).toEqual([{ rating: 5 }])
    expect((await q('SELECT count(*)::int AS n FROM reports WHERE num_nonnulls(target_user_id, target_project_id) = 1'))[0].n).toBe(2)
  })

  it('re-seeding is idempotent (replaces data rather than duplicating it)', async () => {
    await withTransaction(seed, db)
    expect(await counts(db)).toEqual({ users: 8, skills: 24, projects: 8, proposals: 9, demos: 3, hirings: 2, reviews: 1, notifications: 6, reports: 2 })
  })
})
