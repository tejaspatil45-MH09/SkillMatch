import { withTransaction } from '../../db/tx.js'
import { conflict, notFound } from '../../utils/ApiError.js'
import { revokeUserSessions } from '../auth/sessions.js'

const audit = (c, adminId, action, targetType, targetId, details = {}) =>
  c.query('INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)', [adminId, action, targetType, String(targetId), details])
const userRow = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, createdAt: u.created_at })

export async function stats(db) {
  const [users, projects, reports] = await Promise.all([
    db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE role = 'FREELANCER')::int AS freelancers, count(*) FILTER (WHERE role = 'COMPANY')::int AS companies FROM users"),
    db.query('SELECT status, count(*)::int AS n FROM projects GROUP BY status'),
    db.query("SELECT count(*)::int AS n FROM reports WHERE status = 'OPEN'"),
  ])
  const by = Object.fromEntries(projects.rows.map((r) => [r.status, r.n]))
  const projectsByStatus = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => ({ status, count: by[status] ?? 0 }))
  return {
    totalUsers: users.rows[0].total, freelancers: users.rows[0].freelancers, companies: users.rows[0].companies,
    projects: projectsByStatus.reduce((s, x) => s + x.count, 0), activeProjects: (by.OPEN ?? 0) + (by.IN_PROGRESS ?? 0),
    reports: reports.rows[0].n, projectsByStatus,
  }
}

export async function listUsers(db) {
  const { rows } = await db.query('SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC, id LIMIT 500')
  return rows.map(userRow)
}

// Suspending takes effect at once: the status changes and every session is deleted in the SAME transaction.
// The row is locked, so simultaneous suspends/reinstates queue up and only a real change is logged.
export async function setUserStatus(db, admin, id, status) {
  return withTransaction(async (c) => {
    const { rows: [u] } = await c.query('SELECT id, name, email, role, status, created_at FROM users WHERE id = $1 FOR UPDATE', [id])
    if (!u) throw notFound('User')
    if (status === 'SUSPENDED' && u.role === 'ADMIN') throw conflict('Admin accounts cannot be suspended.', 'INVALID_STATE')
    if (u.status !== status) {
      await c.query('UPDATE users SET status = $2 WHERE id = $1', [id, status])
      if (status === 'SUSPENDED') await revokeUserSessions(c, id)
      await audit(c, admin.id, status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REINSTATED', 'USER', id, { name: u.name, email: u.email })
    }
    return userRow({ ...u, status })
  }, db)
}

const REPORTS = `
SELECT r.id, r.reporter_id, ru.name AS reporter_name, r.target_user_id, r.target_project_id, r.reason, r.status, r.created_at, r.resolved_at, au.name AS resolved_by_name,
       tu.name AS target_user_name, tu.role AS target_user_role, tp.title AS target_project_title
FROM reports r JOIN users ru ON ru.id = r.reporter_id LEFT JOIN users tu ON tu.id = r.target_user_id LEFT JOIN projects tp ON tp.id = r.target_project_id LEFT JOIN users au ON au.id = r.resolved_by`
function reportRow(r) {
  const isUser = !!r.target_user_id, targetId = r.target_user_id ?? r.target_project_id
  return {
    id: r.id, reporterId: r.reporter_id, reporterName: r.reporter_name, targetType: isUser ? 'USER' : 'PROJECT', targetId,
    targetName: isUser ? r.target_user_name : r.target_project_title,
    targetLink: isUser ? `/${r.target_user_role === 'FREELANCER' ? 'freelancers' : 'companies'}/${targetId}` : `/projects/${targetId}`,
    reason: r.reason, status: r.status, createdAt: r.created_at, resolvedAt: r.resolved_at, resolvedByName: r.resolved_by_name,
  }
}
export async function listReports(db) {
  const { rows } = await db.query(`${REPORTS} ORDER BY r.created_at DESC, r.id LIMIT 500`)
  return rows.map(reportRow)
}
export async function resolveReport(db, admin, id) {
  await withTransaction(async (c) => {
    const { rows: [done] } = await c.query("UPDATE reports SET status = 'RESOLVED', resolved_at = now(), resolved_by = $2 WHERE id = $1 AND status = 'OPEN' RETURNING id", [id, admin.id])
    if (done) await audit(c, admin.id, 'REPORT_RESOLVED', 'REPORT', id)
  }, db)
  const { rows: [r] } = await db.query(`${REPORTS} WHERE r.id = $1`, [id])
  if (!r) throw notFound('Report')
  return reportRow(r)   // resolving twice is harmless: same answer, and only the first is logged
}

export async function listSkills(db) {
  const { rows } = await db.query(
    `SELECT s.id, s.name, (SELECT count(*)::int FROM project_skills ps WHERE ps.skill_id = s.id) + (SELECT count(*)::int FROM freelancer_skills fs WHERE fs.skill_id = s.id) AS usage
     FROM skills s WHERE s.active ORDER BY lower(s.name), s.name`)
  return rows
}
export async function addSkill(db, admin, name) {
  return withTransaction(async (c) => {
    const { rows: [existing] } = await c.query('SELECT id, name, active FROM skills WHERE lower(name) = lower($1) FOR UPDATE', [name])
    if (existing?.active) throw conflict('This skill already exists.', 'DUPLICATE_SKILL')
    if (existing) {   // a previously retired skill comes back as itself, so old profiles and projects line up again
      await c.query('UPDATE skills SET active = true WHERE id = $1', [existing.id])
      await audit(c, admin.id, 'SKILL_REACTIVATED', 'SKILL', existing.id, { name: existing.name })
      return { id: existing.id, name: existing.name }
    }
    let skill
    try { ;({ rows: [skill] } = await c.query('INSERT INTO skills (name) VALUES ($1) RETURNING id, name', [name])) }
    catch (e) { if (e.code === '23505') throw conflict('This skill already exists.', 'DUPLICATE_SKILL'); throw e }   // simultaneous adds
    await audit(c, admin.id, 'SKILL_ADDED', 'SKILL', skill.id, { name: skill.name })
    return skill
  }, db)
}
// Retiring is a soft delete: existing profiles and projects keep the skill, but it is no longer offered
export async function retireSkill(db, admin, id) {
  await withTransaction(async (c) => {
    const { rows: [s] } = await c.query('UPDATE skills SET active = false WHERE id = $1 AND active RETURNING name', [id])
    if (s) return audit(c, admin.id, 'SKILL_RETIRED', 'SKILL', id, { name: s.name })
    if (!(await c.query('SELECT 1 FROM skills WHERE id = $1', [id])).rowCount) throw notFound('Skill')
  }, db)
  return { ok: true }
}

// Who submitted, opened, was refused or re-issued each demo. Never the demo link.
export async function demoLog(db, demoId) {
  const { rows } = await db.query(
    `SELECT l.id, l.demo_id, l.outcome, host(l.ip) AS ip, l.created_at, u.id AS user_id, u.name AS user_name, p.id AS project_id, p.title, f.id AS freelancer_id, f.name AS freelancer_name
     FROM demo_access_log l JOIN demos d ON d.id = l.demo_id JOIN proposals pr ON pr.id = d.proposal_id JOIN projects p ON p.id = pr.project_id JOIN users f ON f.id = pr.freelancer_id LEFT JOIN users u ON u.id = l.user_id
     WHERE ($1::uuid IS NULL OR l.demo_id = $1) ORDER BY l.created_at DESC, l.id DESC LIMIT 200`, [demoId ?? null])
  return rows.map((r) => ({ id: r.id, demoId: r.demo_id, outcome: r.outcome, ip: r.ip, createdAt: r.created_at, user: r.user_id ? { id: r.user_id, name: r.user_name } : null, project: { id: r.project_id, title: r.title }, freelancer: { id: r.freelancer_id, name: r.freelancer_name } }))
}
export async function auditLog(db) {
  const { rows } = await db.query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, u.name AS admin_name
     FROM admin_audit_log a LEFT JOIN users u ON u.id = a.admin_id ORDER BY a.created_at DESC, a.id DESC LIMIT 200`)
  return rows.map((r) => ({ id: r.id, action: r.action, targetType: r.target_type, targetId: r.target_id, details: r.details, createdAt: r.created_at, adminName: r.admin_name }))
}
