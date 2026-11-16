import { withTransaction } from '../../db/tx.js'
import { ApiError, conflict, forbidden, notFound } from '../../utils/ApiError.js'
import { notify } from '../notifications/service.js'
import { resolveSkills } from '../skills/service.js'
import { findOne, listByCompany, listOpen, rowToProject } from './queries.js'

export const listProjects = (db, viewer, filters) => listOpen(db, viewer, filters)
export const listCompanyProjects = (db, viewer) => listByCompany(db, viewer)

// Not found, and not allowed to see it, look the same: a closed project is invisible to people with no stake in it.
export const isProjectVisible = (viewer, row) => !!row && (row.company_status !== 'SUSPENDED' || viewer.role === 'ADMIN' || viewer.id === row.company_id) && (row.status === 'OPEN' || viewer.role === 'ADMIN' || viewer.id === row.company_id || (viewer.role === 'FREELANCER' && !!row.my_proposal_id))

export async function getProject(db, viewer, id) {
  const row = await findOne(db, viewer, id)
  if (!isProjectVisible(viewer, row)) throw notFound('Project')
  return rowToProject(row, viewer)
}

// Lock the row so edits, closing and (later) accepting a proposal cannot interleave, then check ownership
async function lockOwned(c, id, userId) {
  const { rows: [p] } = await c.query('SELECT id, company_id, status, title FROM projects WHERE id = $1 FOR UPDATE', [id])
  if (!p) throw notFound('Project')
  if (p.company_id !== userId) throw forbidden('This project belongs to another company.')
  return p
}
const setSkills = async (c, projectId, ids) => {
  await c.query('DELETE FROM project_skills WHERE project_id = $1', [projectId])
  for (const id of ids) await c.query('INSERT INTO project_skills (project_id, skill_id) VALUES ($1,$2)', [projectId, id])
}

export async function createProject(db, user, input) {
  const id = await withTransaction(async (c) => {
    const skillIds = await resolveSkills(c, input.skills)
    const { rows: [p] } = await c.query(
      'INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [user.id, input.title, input.description, input.budgetMin, input.budgetMax, input.deadline])
    await setSkills(c, p.id, skillIds)
    return p.id
  }, db)
  return getProject(db, user, id)
}

export async function updateProject(db, user, id, input) {
  await withTransaction(async (c) => {
    const p = await lockOwned(c, id, user.id)
    if (p.status !== 'OPEN') throw conflict('Only open projects can be edited.', 'INVALID_STATE')

    // Budget rule must hold for the merged result, not just the fields that were sent
    const { rows: [cur] } = await c.query('SELECT budget_min, budget_max FROM projects WHERE id = $1', [id])
    const min = input.budgetMin ?? cur.budget_min, max = input.budgetMax ?? cur.budget_max
    if (min > max) throw new ApiError(400, 'Please check the highlighted fields.', 'VALIDATION', { budgetMax: ['Maximum budget must be at least the minimum.'] })

    if (input.skills) {
      const { rows: current } = await c.query('SELECT skill_id FROM project_skills WHERE project_id = $1', [id])
      const currentIds = current.map((r) => r.skill_id)
      const nextIds = await resolveSkills(c, input.skills, { keepIds: currentIds })
      const changed = nextIds.length !== currentIds.length || nextIds.some((x) => !currentIds.includes(x))
      if (changed) {
        const { rows: [{ exists }] } = await c.query('SELECT EXISTS (SELECT 1 FROM proposals WHERE project_id = $1)', [id])
        if (exists) throw conflict('Required skills are locked once proposals exist.', 'SKILLS_LOCKED')
        await setSkills(c, id, nextIds)
      }
    }
    const cols = { title: input.title, description: input.description, budget_min: input.budgetMin, budget_max: input.budgetMax, deadline: input.deadline }
    const keys = Object.keys(cols).filter((k) => cols[k] !== undefined)
    if (keys.length) await c.query(`UPDATE projects SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...keys.map((k) => cols[k])])
  }, db)
  return getProject(db, user, id)
}

// Closing = CANCELLED. Everyone still waiting is rejected and told, in the same transaction.
export async function closeProject(db, user, id) {
  await withTransaction(async (c) => {
    const p = await lockOwned(c, id, user.id)
    if (p.status !== 'OPEN') throw conflict('Only open projects can be closed.', 'INVALID_STATE')
    await c.query("UPDATE projects SET status = 'CANCELLED' WHERE id = $1", [id])
    const { rows } = await c.query("UPDATE proposals SET status = 'REJECTED' WHERE project_id = $1 AND status IN ('PENDING', 'SHORTLISTED') RETURNING id, freelancer_id", [id])
    for (const r of rows) await notify(c, r.freelancer_id, 'REJECTED', `"${p.title}" was closed by the company.`, `/freelancer/proposals/${r.id}`)
  }, db)
  return getProject(db, user, id)
}
