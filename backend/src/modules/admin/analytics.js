// Reports & analytics for admins. Every number is computed from the live tables inside ONE read-only,
// repeatable-read transaction, so all figures describe the same instant (totals always add up).
//
// How the filters apply (also shown to the admin on the page and in the CSV):
//   * The date range selects records by when they were CREATED: project posted, proposal submitted,
//     hiring started, review written, account registered. Each record is counted with its CURRENT status.
//   * Project status filters projects, and the proposals and hirings that belong to those projects.
//   * Hiring status filters hirings, the rankings built from them, and the reviews of those hirings.
//   * Account totals (active / suspended) are a snapshot of now: an account stores only its current status.

const MONTH_CAP = 60

// Metrics the database cannot reliably provide, reported to the admin instead of being guessed
export const UNAVAILABLE = [
  { metric: 'Cancelled hirings by cancellation date', reason: 'A hiring stores why it was cancelled but not when, so cancellations are counted in the month the hiring started.' },
  { metric: 'Projects completed or cancelled per month', reason: 'A project stores its current status and posting date, not when the status changed, so projects are counted in the month they were posted.' },
  { metric: 'Active and suspended accounts for a past period', reason: 'An account stores only its current status, so these figures are a snapshot of now. The date range only changes "registered in period".' },
  { metric: 'Time from proposal to acceptance', reason: 'A proposal does not keep the moment it was accepted, so time to hire is measured from project posting to the start of the hiring.' },
]

const RANGE = (col) => `(@from::timestamptz IS NULL OR ${col} >= @from::timestamptz) AND (@to::timestamptz IS NULL OR ${col} < @to::timestamptz)`
const PROJECT_OK = '(@projectStatus::project_status IS NULL OR p.status = @projectStatus::project_status)'
const HIRING_OK = '(@hiringStatus::hiring_status IS NULL OR h.status = @hiringStatus::hiring_status)'
const HIRINGS_IN_SCOPE = `FROM hirings h JOIN projects p ON p.id = h.project_id WHERE ${RANGE('h.start_date')} AND ${PROJECT_OK} AND ${HIRING_OK}`

// "@name" markers -> $1, $2 ... in order of first use, passing only the values a query actually mentions
export function named(sql, values) {
  const order = []
  const text = sql.replace(/@([A-Za-z]+)/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown analytics parameter @${key}`)
    let i = order.indexOf(key)
    if (i < 0) { order.push(key); i = order.length - 1 }
    return `$${i + 1}`
  })
  return { text, values: order.map((k) => values[k]) }
}

const iso = (d) => (d ? d.toISOString() : null)
const day = (d) => d.toISOString().slice(0, 10)

// The selected range as concrete bounds: `from` inclusive, `to` exclusive, null = unbounded.
// Presets are open-ended on the right so a record created a moment ago is never missed.
export function resolveFilters(q, now = new Date()) {
  let from = null, to = null, label = 'All time'
  if (q.range === 'custom') {
    from = new Date(`${q.from}T00:00:00Z`); to = new Date(Date.parse(`${q.to}T00:00:00Z`) + 864e5)
    label = `${q.from} to ${q.to}`
  } else if (q.range === '7d' || q.range === '30d') {
    const days = q.range === '7d' ? 7 : 30
    from = new Date(now.getTime() - days * 864e5); label = `Last ${days} days`
  } else if (q.range === '3m') { from = new Date(now); from.setUTCMonth(from.getUTCMonth() - 3); label = 'Last 3 months' }
  else if (q.range === '1y') { from = new Date(now); from.setUTCFullYear(from.getUTCFullYear() - 1); label = 'Last year' }
  return { range: q.range, from, to, label, projectStatus: q.projectStatus ?? null, hiringStatus: q.hiringStatus ?? null }
}

// Every calendar month (UTC) from start to end, so months with no activity show as zero instead of vanishing
export function monthKeys(start, end) {
  if (!start || !end || start > end) return { months: [], truncated: false }
  const months = []
  let y = start.getUTCFullYear(), m = start.getUTCMonth()
  const ey = end.getUTCFullYear(), em = end.getUTCMonth()
  while (y < ey || (y === ey && m <= em)) { months.push(`${y}-${String(m + 1).padStart(2, '0')}`); m += 1; if (m === 12) { m = 0; y += 1 } }
  const truncated = months.length > MONTH_CAP
  return { months: truncated ? months.slice(-MONTH_CAP) : months, truncated }
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const countOf = (rows, status) => rows.find((r) => r.status === status)?.n ?? 0

async function snapshot(db, fn) {
  const client = await db.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e } finally { client.release() }
}

export async function report(db, query, now = new Date()) {
  const f = resolveFilters(query, now)
  const values = { from: f.from, to: f.to, projectStatus: f.projectStatus, hiringStatus: f.hiringStatus }
  return snapshot(db, async (c) => {
    const rows = async (sql) => { const q = named(sql, values); return (await c.query(q.text, q.values)).rows }

    const projectRows = await rows(`SELECT p.status, count(*)::int AS n FROM projects p WHERE ${RANGE('p.created_at')} AND ${PROJECT_OK} GROUP BY p.status`)
    const projectMonthly = await rows(`SELECT to_char(date_trunc('month', p.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month, count(*)::int AS n FROM projects p WHERE ${RANGE('p.created_at')} AND ${PROJECT_OK} GROUP BY 1`)
    const hiringRows = await rows(`SELECT h.status, count(*)::int AS n ${HIRINGS_IN_SCOPE} GROUP BY h.status`)
    const [timing] = await rows(`SELECT count(*) FILTER (WHERE h.start_date >= p.created_at)::int AS used, count(*) FILTER (WHERE h.start_date < p.created_at)::int AS excluded,
      avg(extract(epoch FROM (h.start_date - p.created_at))) FILTER (WHERE h.start_date >= p.created_at)::float8 AS seconds ${HIRINGS_IN_SCOPE}`)
    const hiringMonthly = await rows(`SELECT to_char(date_trunc('month', h.start_date AT TIME ZONE 'UTC'), 'YYYY-MM') AS month, h.status, count(*)::int AS n ${HIRINGS_IN_SCOPE} GROUP BY 1, 2`)
    const proposalRows = await rows(`SELECT pr.status, count(*)::int AS n FROM proposals pr JOIN projects p ON p.id = pr.project_id WHERE ${RANGE('pr.created_at')} AND ${PROJECT_OK} GROUP BY pr.status`)
    const userRows = await rows(`SELECT role, status, count(*)::int AS total, count(*) FILTER (WHERE ${RANGE('created_at')})::int AS in_range FROM users WHERE role IN ('FREELANCER', 'COMPANY') GROUP BY role, status`)
    const topFreelancers = await rows(`SELECT u.id, u.name, u.status, count(*)::int AS n FROM hirings h JOIN projects p ON p.id = h.project_id JOIN users u ON u.id = h.freelancer_id
      WHERE h.status = 'COMPLETED' AND ${RANGE('h.start_date')} AND ${PROJECT_OK} AND ${HIRING_OK} GROUP BY u.id, u.name, u.status ORDER BY n DESC, u.name, u.id LIMIT 10`)
    const skills = await rows(`SELECT s.id, s.name, count(*)::int AS n FROM project_skills ps JOIN skills s ON s.id = ps.skill_id JOIN projects p ON p.id = ps.project_id
      WHERE ${RANGE('p.created_at')} AND ${PROJECT_OK} GROUP BY s.id, s.name ORDER BY n DESC, s.name LIMIT 10`)
    const [rating] = await rows(`SELECT count(*)::int AS reviews, count(DISTINCT r.reviewee_id)::int AS freelancers, avg(r.rating)::float8 AS average
      FROM reviews r JOIN users u ON u.id = r.reviewee_id AND u.role = 'FREELANCER' JOIN hirings h ON h.id = r.hiring_id JOIN projects p ON p.id = h.project_id
      WHERE ${RANGE('r.created_at')} AND ${PROJECT_OK} AND ${HIRING_OK}`)
    const topByProjects = await rows(`SELECT u.id, u.name, u.status, count(*)::int AS n FROM projects p JOIN users u ON u.id = p.company_id
      WHERE ${RANGE('p.created_at')} AND ${PROJECT_OK} GROUP BY u.id, u.name, u.status ORDER BY n DESC, u.name, u.id LIMIT 10`)
    const topByHirings = await rows(`SELECT u.id, u.name, u.status, count(*)::int AS n FROM hirings h JOIN projects p ON p.id = h.project_id JOIN users u ON u.id = h.company_id
      WHERE h.status = 'COMPLETED' AND ${RANGE('h.start_date')} AND ${PROJECT_OK} AND ${HIRING_OK} GROUP BY u.id, u.name, u.status ORDER BY n DESC, u.name, u.id LIMIT 10`)

    // ---- months shown on the charts
    let monthStart = f.from
    if (!monthStart) {
      const [{ first }] = (await c.query('SELECT least((SELECT min(created_at) FROM projects), (SELECT min(start_date) FROM hirings)) AS first')).rows
      monthStart = first
    }
    const monthEnd = f.to ? new Date(f.to.getTime() - 1) : now
    const { months, truncated } = monthKeys(monthStart, monthEnd)
    const byMonth = (list) => Object.fromEntries(list.map((r) => [r.month, r.n]))

    // ---- projects
    const statusCounts = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => ({ status, count: countOf(projectRows, status) }))
    const pc = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]))
    const monthlyProjects = byMonth(projectMonthly)
    // ---- hirings
    const ongoing = countOf(hiringRows, 'ACTIVE'), successful = countOf(hiringRows, 'COMPLETED'), cancelled = countOf(hiringRows, 'CANCELLED')
    const concluded = successful + cancelled
    const hm = {}
    for (const r of hiringMonthly) (hm[r.month] ??= { completed: 0, ongoing: 0, cancelled: 0 })[{ COMPLETED: 'completed', ACTIVE: 'ongoing', CANCELLED: 'cancelled' }[r.status]] = r.n
    // ---- proposals
    const pr = Object.fromEntries(['PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'].map((s) => [s, countOf(proposalRows, s)]))
    const proposalsTotal = Object.values(pr).reduce((a, b) => a + b, 0)
    // ---- accounts
    const accounts = (role) => {
      const mine = userRows.filter((r) => r.role === role)
      const of = (s) => mine.find((r) => r.status === s)?.total ?? 0
      return { total: of('ACTIVE') + of('SUSPENDED'), active: of('ACTIVE'), suspended: of('SUSPENDED'), registeredInRange: mine.reduce((a, r) => a + r.in_range, 0) }
    }
    const ranked = (list) => list.map((r) => ({ id: r.id, name: r.name, suspended: r.status === 'SUSPENDED', count: r.n }))

    return {
      generatedAt: now.toISOString(),
      filters: { range: f.range, label: f.label, from: iso(f.from), to: iso(f.to), projectStatus: f.projectStatus, hiringStatus: f.hiringStatus },
      monthsTruncated: truncated,
      projects: {
        total: statusCounts.reduce((a, s) => a + s.count, 0), open: pc.OPEN, inProgress: pc.IN_PROGRESS, active: pc.OPEN + pc.IN_PROGRESS, completed: pc.COMPLETED, cancelled: pc.CANCELLED,
        byStatus: statusCounts, monthly: months.map((month) => ({ month, count: monthlyProjects[month] ?? 0 })),
      },
      hirings: {
        total: ongoing + successful + cancelled, successful, ongoing, cancelled, concluded, successRate: pct(successful, concluded),
        timeToHire: { seconds: timing.seconds === null ? null : Math.round(timing.seconds), sampleSize: timing.used, excluded: timing.excluded },
        monthly: months.map((month) => { const m = hm[month] ?? { completed: 0, ongoing: 0, cancelled: 0 }; return { month, ...m, total: m.completed + m.ongoing + m.cancelled } }),
      },
      proposals: { total: proposalsTotal, accepted: pr.ACCEPTED, rejected: pr.REJECTED, pending: pr.PENDING, shortlisted: pr.SHORTLISTED, withdrawn: pr.WITHDRAWN, acceptanceRate: pct(pr.ACCEPTED, proposalsTotal) },
      freelancers: {
        ...accounts('FREELANCER'), topByCompleted: ranked(topFreelancers),
        averageRating: { value: rating.average === null ? null : Math.round(rating.average * 100) / 100, reviews: rating.reviews, freelancers: rating.freelancers },
      },
      companies: { ...accounts('COMPANY'), topByProjects: ranked(topByProjects), topByHirings: ranked(topByHirings) },
      skills: { demand: skills.map((s) => ({ id: s.id, name: s.name, projects: s.n })) },
      unavailable: UNAVAILABLE,
    }
  })
}
