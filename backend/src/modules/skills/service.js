import { ApiError } from '../../utils/ApiError.js'

const fieldError = (message) => new ApiError(400, 'Please check the highlighted fields.', 'VALIDATION', { skills: [message] })

// Turn skill names into ids. Matching ignores case. Skills an admin has retired can be KEPT where already
// attached (`keepIds`) but not newly added.
export async function resolveSkills(db, names, { keepIds = [] } = {}) {
  const unique = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()]
  const { rows } = await db.query('SELECT id, name, active FROM skills WHERE lower(name) = ANY($1::text[])', [unique.map((n) => n.toLowerCase())])
  const byLower = new Map(rows.map((r) => [r.name.toLowerCase(), r]))
  for (const n of unique) {
    const s = byLower.get(n.toLowerCase())
    if (!s) throw fieldError(`"${n}" is not a skill on SkillMatch.`)
    if (!s.active && !keepIds.includes(s.id)) throw fieldError(`"${s.name}" is no longer available.`)
  }
  return unique.map((n) => byLower.get(n.toLowerCase()).id)
}
