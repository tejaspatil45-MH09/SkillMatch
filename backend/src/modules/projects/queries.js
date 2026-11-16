// One SELECT builds everything a project card needs. $1 is always the viewer's id.
// Skill match = matched required skills / total required skills, rounded: computed here, in the database,
// so it is correct for sorting and filtering and identical on every endpoint.
const SELECT = `
SELECT p.id, p.company_id, p.title, p.description, p.budget_min, p.budget_max, p.deadline, p.status, p.created_at,
  COALESCE((SELECT array_agg(s.name ORDER BY lower(s.name), s.name) FROM project_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.project_id = p.id), '{}') AS skills,
  (SELECT count(*)::int FROM proposals x WHERE x.project_id = p.id) AS proposal_count,
  COALESCE((SELECT round(100.0 * count(fs.skill_id) / NULLIF(count(*), 0))::int
            FROM project_skills ps LEFT JOIN freelancer_skills fs ON fs.skill_id = ps.skill_id AND fs.user_id = $1
            WHERE ps.project_id = p.id), 0) AS skill_match,
  mine.id AS my_proposal_id,
  u.name AS company_name, u.status AS company_status, cp.description AS company_description, cp.website AS company_website, cp.location AS company_location,
  cp.industry AS company_industry, cp.logo_url AS company_logo,
  (SELECT round(avg(r.rating), 1) FROM reviews r WHERE r.reviewee_id = p.company_id) AS company_rating,
  (SELECT count(*)::int FROM reviews r WHERE r.reviewee_id = p.company_id) AS company_review_count
FROM projects p
JOIN users u ON u.id = p.company_id
JOIN company_profiles cp ON cp.user_id = p.company_id
LEFT JOIN proposals mine ON mine.project_id = p.id AND mine.freelancer_id = $1`

const SORTS = {
  match: 'skill_match DESC, p.created_at DESC',
  newest: 'p.created_at DESC',
  budget: 'p.budget_max DESC, p.created_at DESC',
  deadline: 'p.deadline ASC, p.created_at DESC',
}
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`)   // a search for "50%" must find "50%", not everything

export function rowToProject(row, viewer) {
  const v = {
    id: row.id, companyId: row.company_id, title: row.title, description: row.description,
    budgetMin: row.budget_min, budgetMax: row.budget_max, deadline: row.deadline, status: row.status, createdAt: row.created_at,
    skills: row.skills, proposalCount: row.proposal_count,
    company: {
      id: row.company_id, name: row.company_name, description: row.company_description, website: row.company_website, location: row.company_location,
      industry: row.company_industry, logo: row.company_logo,
      rating: row.company_rating === null ? null : Number(row.company_rating), reviewCount: row.company_review_count,
    },
  }
  if (viewer.role === 'FREELANCER') Object.assign(v, { skillMatch: row.skill_match, hasApplied: !!row.my_proposal_id, proposalId: row.my_proposal_id ?? null })
  return v
}

export async function listOpen(db, viewer, f, { excludeApplied = false, limit = 200 } = {}) {
  const params = [viewer.id], where = ["p.status = 'OPEN'", "u.status = 'ACTIVE'"]
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)) }
  if (f.q) {
    params.push(`%${escapeLike(f.q)}%`)
    where.push(`(p.title ILIKE $${params.length} ESCAPE '\\' OR p.description ILIKE $${params.length} ESCAPE '\\')`)
  }
  if (f.skills) {
    const names = f.skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 15)
    if (names.length) add('EXISTS (SELECT 1 FROM project_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.project_id = p.id AND lower(s.name) = ANY(?::text[]))', names)
  }
  if (excludeApplied) where.push('mine.id IS NULL')
  if (f.minBudget !== undefined) add('p.budget_max >= ?', f.minBudget)
  if (f.maxBudget !== undefined) add('p.budget_min <= ?', f.maxBudget)
  if (f.deadlineBefore) add('p.deadline <= ?', f.deadlineBefore)
  // "match" only means something for freelancers; everyone else gets newest-first
  const order = SORTS[f.sort === 'match' && viewer.role !== 'FREELANCER' ? 'newest' : f.sort ?? 'newest']
  const { rows } = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${Number(limit)}`, params)
  return rows.map((r) => rowToProject(r, viewer))
}

// Every project in every status (admin view)
export async function listAll(db, viewer) {
  const { rows } = await db.query(`${SELECT} ORDER BY p.created_at DESC, p.id LIMIT 500`, [viewer.id])
  return rows.map((r) => rowToProject(r, viewer))
}

export async function findOne(db, viewer, id) {
  const { rows: [row] } = await db.query(`${SELECT} WHERE p.id = $2`, [viewer.id, id])
  return row
}

export async function listByCompany(db, viewer) {
  const { rows } = await db.query(`${SELECT} WHERE p.company_id = $1 ORDER BY p.created_at DESC LIMIT 200`, [viewer.id])
  return rows.map((r) => rowToProject(r, viewer))
}
