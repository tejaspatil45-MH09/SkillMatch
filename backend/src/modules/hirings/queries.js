// Builds the hiring objects the frontend expects, reviews included, in two queries however many hirings there are.
export async function loadHirings(db, { where = 'TRUE', params = [] } = {}) {
  const { rows } = await db.query(
    `SELECT h.id, h.proposal_id, h.project_id, h.freelancer_id, h.company_id, h.status, h.start_date, h.completed_at, h.cancel_reason, h.work_status,
            p.title, f.name AS freelancer_name, c.name AS company_name
     FROM hirings h JOIN projects p ON p.id = h.project_id JOIN users f ON f.id = h.freelancer_id JOIN users c ON c.id = h.company_id
     WHERE ${where} ORDER BY h.start_date DESC, h.id LIMIT 200`, params)
  if (!rows.length) return []
  const { rows: reviews } = await db.query(
    'SELECT id, hiring_id AS "hiringId", reviewer_id AS "reviewerId", reviewee_id AS "revieweeId", rating, comment, created_at AS "createdAt" FROM reviews WHERE hiring_id = ANY($1) ORDER BY created_at, id', [rows.map((r) => r.id)])
  return rows.map((h) => ({
    id: h.id, proposalId: h.proposal_id, projectId: h.project_id, freelancerId: h.freelancer_id, companyId: h.company_id,
    status: h.status, workStatus: h.work_status, startDate: h.start_date, completedAt: h.completed_at, cancelReason: h.cancel_reason,
    project: { id: h.project_id, title: h.title }, freelancer: { id: h.freelancer_id, name: h.freelancer_name }, company: { id: h.company_id, name: h.company_name },
    reviews: reviews.filter((r) => r.hiringId === h.id),
  }))
}
export const hiringView = async (db, id) => (await loadHirings(db, { where: 'h.id = $1', params: [id] }))[0] ?? null

// How many messages from the OTHER party this user has not opened yet, per hiring (hirings with none are simply absent)
export async function unreadCounts(db, userId, hiringIds) {
  if (!hiringIds.length) return {}
  const { rows } = await db.query(
    'SELECT hiring_id, count(*)::int AS n FROM hiring_messages WHERE hiring_id = ANY($1) AND sender_id <> $2 AND read_at IS NULL GROUP BY hiring_id', [hiringIds, userId])
  return Object.fromEntries(rows.map((r) => [r.hiring_id, r.n]))
}
