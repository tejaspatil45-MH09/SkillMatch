// Builds the proposal objects the frontend expects, with a fixed number of queries however many proposals there are.
const BASE = `
SELECT pr.id, pr.project_id, pr.freelancer_id, pr.cover_letter, pr.bid_amount, pr.estimated_days, pr.status, pr.created_at,
  p.title AS project_title, p.status AS project_status, p.company_id, cu.name AS company_name,
  COALESCE((SELECT array_agg(s.name ORDER BY lower(s.name), s.name) FROM project_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.project_id = p.id), '{}') AS project_skills,
  COALESCE((SELECT round(100.0 * count(fs.skill_id) / NULLIF(count(*), 0))::int
            FROM project_skills ps LEFT JOIN freelancer_skills fs ON fs.skill_id = ps.skill_id AND fs.user_id = pr.freelancer_id
            WHERE ps.project_id = p.id), 0) AS skill_match,
  d.id AS demo_id, d.submitted_at AS demo_submitted_at, d.expires_at AS demo_expires_at, d.viewed_at AS demo_viewed_at, d.description AS demo_description,
  CASE WHEN d.id IS NULL THEN NULL WHEN d.viewed_at IS NOT NULL THEN 'VIEWED' WHEN d.expires_at < now() THEN 'EXPIRED' ELSE 'AVAILABLE' END AS demo_status,
  fu.name AS freelancer_name, fp.headline, fp.location, fp.experience_years, fp.bio, fp.photo_url
FROM proposals pr
JOIN projects p ON p.id = pr.project_id
JOIN users cu ON cu.id = p.company_id
JOIN users fu ON fu.id = pr.freelancer_id
JOIN freelancer_profiles fp ON fp.user_id = pr.freelancer_id
LEFT JOIN demos d ON d.proposal_id = pr.id`

const groupBy = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ??= []).push(r), m), {})

export async function loadProposals(db, viewer, { where = 'TRUE', params = [], order = 'pr.created_at DESC' } = {}) {
  // A suspended freelancer's proposals are invisible to everyone but themselves and admins
  const all = [...params, viewer.id, viewer.role === 'ADMIN']
  const guard = `(fu.status = 'ACTIVE' OR pr.freelancer_id = $${all.length - 1} OR $${all.length}::boolean)`
  const { rows } = await db.query(`${BASE} WHERE (${where}) AND ${guard} ORDER BY ${order} LIMIT 200`, all)
  if (!rows.length) return []
  const ids = [...new Set(rows.map((r) => r.freelancer_id))]
  const [skills, portfolio, experience, ratings] = await Promise.all([
    db.query('SELECT fs.user_id, array_agg(s.name ORDER BY lower(s.name), s.name) AS names FROM freelancer_skills fs JOIN skills s ON s.id = fs.skill_id WHERE fs.user_id = ANY($1) GROUP BY fs.user_id', [ids]),
    db.query('SELECT user_id, id, title, description, image_url AS image, url FROM portfolio_items WHERE user_id = ANY($1) ORDER BY sort_order', [ids]),
    db.query('SELECT user_id, id, role, org, period, summary FROM experiences WHERE user_id = ANY($1) ORDER BY sort_order', [ids]),
    db.query('SELECT reviewee_id, round(avg(rating), 1) AS rating, count(*)::int AS n FROM reviews WHERE reviewee_id = ANY($1) GROUP BY reviewee_id', [ids]),
  ])
  const sk = Object.fromEntries(skills.rows.map((r) => [r.user_id, r.names]))
  const pf = groupBy(portfolio.rows, 'user_id'), ex = groupBy(experience.rows, 'user_id')
  const rt = Object.fromEntries(ratings.rows.map((r) => [r.reviewee_id, r]))
  const strip = ({ user_id, ...rest }) => rest   // eslint-disable-line no-unused-vars

  return rows.map((r) => ({
    id: r.id, projectId: r.project_id, freelancerId: r.freelancer_id, coverLetter: r.cover_letter, bidAmount: r.bid_amount, estimatedDays: r.estimated_days, status: r.status, createdAt: r.created_at,
    project: { id: r.project_id, title: r.project_title, status: r.project_status, skills: r.project_skills, companyId: r.company_id, companyName: r.company_name },
    freelancer: {
      id: r.freelancer_id, name: r.freelancer_name, headline: r.headline, location: r.location, experienceYears: r.experience_years, bio: r.bio, photo: r.photo_url,
      skills: sk[r.freelancer_id] ?? [], portfolio: (pf[r.freelancer_id] ?? []).map(strip), experience: (ex[r.freelancer_id] ?? []).map(strip),
      rating: rt[r.freelancer_id] ? Number(rt[r.freelancer_id].rating) : null, reviewCount: rt[r.freelancer_id]?.n ?? 0,
    },
    skillMatch: r.skill_match,
    // Demo METADATA only: never the URL. The freelancer's description is shown to the freelancer, not to the company before access.
    demo: r.demo_id ? { id: r.demo_id, status: r.demo_status, submittedAt: r.demo_submitted_at, expiresAt: r.demo_expires_at, viewedAt: r.demo_viewed_at, ...(viewer.id === r.freelancer_id && { description: r.demo_description }) } : null,
    viewerIsOwner: r.company_id === viewer.id,
  }))
}
