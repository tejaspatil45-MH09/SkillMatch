// The user object the frontend expects from /auth/*, including a role-specific `profile`.
// Never selects password_hash. Phase 3 reuses this for profile endpoints.
// `includeEmail` is false when someone else is looking: an email address is only for its owner and admins.
export async function userView(db, id, { includeEmail = true } = {}) {
  const { rows: [u] } = await db.query('SELECT id, name, email, role, status, created_at FROM users WHERE id = $1', [id])
  if (!u) return null
  const view = { id: u.id, name: u.name, ...(includeEmail && { email: u.email }), role: u.role, status: u.status, createdAt: u.created_at, profile: {} }

  if (u.role === 'FREELANCER') {
    const [p, skills, portfolio, experience] = await Promise.all([
      db.query('SELECT headline, location, experience_years, bio, photo_url FROM freelancer_profiles WHERE user_id = $1', [id]),
      db.query('SELECT s.name FROM freelancer_skills fs JOIN skills s ON s.id = fs.skill_id WHERE fs.user_id = $1 ORDER BY lower(s.name), s.name', [id]),
      db.query('SELECT id, title, description, image_url AS image, url FROM portfolio_items WHERE user_id = $1 ORDER BY sort_order', [id]),
      db.query('SELECT id, role, org, period, summary FROM experiences WHERE user_id = $1 ORDER BY sort_order', [id]),
    ])
    const r = p.rows[0]
    view.profile = { headline: r.headline, location: r.location, experienceYears: r.experience_years, bio: r.bio, photo: r.photo_url,
      skills: skills.rows.map((s) => s.name), portfolio: portfolio.rows, experience: experience.rows }
  } else if (u.role === 'COMPANY') {
    const { rows: [r] } = await db.query('SELECT description, website, location, industry, logo_url FROM company_profiles WHERE user_id = $1', [id])
    view.profile = { description: r.description, website: r.website, location: r.location, industry: r.industry, logo: r.logo_url }
  }
  return view
}
