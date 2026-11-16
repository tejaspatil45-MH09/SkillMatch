import { withTransaction } from '../../db/tx.js'
import { ApiError, notFound } from '../../utils/ApiError.js'
import { isUuid } from '../../middleware/validate.js'
import { resolveSkills } from '../skills/service.js'
import { userView } from '../users/view.js'

// Same checks the frontend's mock used, so the progress bar means the same thing
export function profileCompletion(p) {
  const checks = [p.headline, p.bio, p.location, p.experienceYears != null, p.skills?.length >= 3, p.portfolio?.length >= 1]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

// Who may open a profile: yourself, admins, and the opposite side of the marketplace. Not other freelancers,
// not rival companies, not admin accounts. Suspended accounts are hidden. Everything else looks like "not found".
function canView(viewer, target) {
  if (viewer.id === target.id || viewer.role === 'ADMIN') return true
  if (target.status === 'SUSPENDED' || target.role === 'ADMIN') return false
  return viewer.role !== target.role
}

// Throws "not found" unless this viewer may see that user's profile (also used by reviews and reports)
export async function assertCanViewUser(db, viewer, id) {
  const { rows: [target] } = await db.query('SELECT id, name, role, status FROM users WHERE id = $1', [id])
  if (!target || !canView(viewer, target)) throw notFound('Profile')
  return target
}

export async function getProfile(db, viewer, id) {
  await assertCanViewUser(db, viewer, id)
  const view = await userView(db, id, { includeEmail: viewer.id === id || viewer.role === 'ADMIN' })
  const { rows: reviews } = await db.query(
    `SELECT r.id, r.hiring_id AS "hiringId", r.reviewer_id AS "reviewerId", r.reviewee_id AS "revieweeId", r.rating, r.comment, r.created_at AS "createdAt", u.name AS "reviewerName"
     FROM reviews r JOIN users u ON u.id = r.reviewer_id WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC`, [id])
  const rating = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null
  return { ...view, rating, reviewCount: reviews.length, profileCompletion: view.role === 'FREELANCER' ? profileCompletion(view.profile) : null, reviews }
}

// UPDATE only the columns that were actually sent (a partial edit never wipes the rest)
async function patch(c, table, key, id, fields) {
  const cols = Object.keys(fields).filter((k) => fields[k] !== undefined)
  if (!cols.length) return
  await c.query(`UPDATE ${table} SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE ${key} = $1`, [id, ...cols.map((k) => fields[k])])
}

// Make the stored list equal the submitted list. Items carrying one of THIS user's real ids are updated;
// everything else (client-made ids, or ids belonging to someone else) is inserted as new; unlisted items are deleted.
async function reconcile(c, { table, userId, items, columns }) {
  const { rows } = await c.query(`SELECT id FROM ${table} WHERE user_id = $1`, [userId])
  const mine = new Set(rows.map((r) => r.id))
  const keep = items.map((i) => i.id).filter((id) => isUuid(id) && mine.has(id))
  await c.query(`DELETE FROM ${table} WHERE user_id = $1 AND NOT (id = ANY($2::uuid[]))`, [userId, keep])
  for (const item of items) {
    const values = columns.map((col) => item[col.key] ?? col.default)
    if (isUuid(item.id) && mine.has(item.id))
      await c.query(`UPDATE ${table} SET ${columns.map((col, i) => `${col.column} = $${i + 3}`).join(', ')} WHERE id = $1 AND user_id = $2`, [item.id, userId, ...values])
    else
      await c.query(`INSERT INTO ${table} (user_id, ${columns.map((col) => col.column).join(', ')}) VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')})`, [userId, ...values])
  }
}

export async function updateProfile(db, user, input) {
  await withTransaction(async (c) => {
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [user.id])   // serialise concurrent edits by the same user
    await patch(c, 'users', 'id', user.id, { name: input.name })
    const p = input.profile ?? {}

    if (user.role === 'FREELANCER') {
      await patch(c, 'freelancer_profiles', 'user_id', user.id, { headline: p.headline, location: p.location, bio: p.bio, experience_years: p.experienceYears })
      if (p.skills) {
        const { rows } = await c.query('SELECT skill_id FROM freelancer_skills WHERE user_id = $1', [user.id])
        const ids = await resolveSkills(c, p.skills, { keepIds: rows.map((r) => r.skill_id) })
        await c.query('DELETE FROM freelancer_skills WHERE user_id = $1', [user.id])
        for (const id of ids) await c.query('INSERT INTO freelancer_skills (user_id, skill_id) VALUES ($1,$2)', [user.id, id])
      }
      if (p.portfolio) await reconcile(c, { table: 'portfolio_items', userId: user.id, items: p.portfolio,
        columns: [{ key: 'title', column: 'title' }, { key: 'description', column: 'description' }, { key: 'url', column: 'url', default: null }] })
      if (p.experience) await reconcile(c, { table: 'experiences', userId: user.id, items: p.experience,
        columns: [{ key: 'role', column: 'role' }, { key: 'org', column: 'org' }, { key: 'period', column: 'period' }, { key: 'summary', column: 'summary', default: '' }] })
    } else if (user.role === 'COMPANY') {
      await patch(c, 'company_profiles', 'user_id', user.id, { description: p.description, website: p.website, location: p.location, industry: p.industry })
    }
  }, db)
  return userView(db, user.id)
}
