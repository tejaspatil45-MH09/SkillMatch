import { withTransaction } from '../../db/tx.js'
import { conflict, forbidden, notFound } from '../../utils/ApiError.js'
import { notify } from '../notifications/service.js'
import { assertCanViewUser } from '../profiles/service.js'

export async function createReview(db, user, { hiringId, rating, comment }) {
  return withTransaction(async (c) => {
    // FOR SHARE: a simultaneous complete/cancel waits for us, and we see its result if it got there first
    const { rows: [h] } = await c.query('SELECT id, status, company_id, freelancer_id FROM hirings WHERE id = $1 FOR SHARE', [hiringId])
    if (!h) throw notFound('Hiring')
    if (user.id !== h.company_id && user.id !== h.freelancer_id) throw forbidden('You are not part of this hiring.')
    if (h.status !== 'COMPLETED') throw conflict('Reviews open after the project is completed.', 'INVALID_STATE')
    const revieweeId = user.id === h.company_id ? h.freelancer_id : h.company_id
    let review
    try {
      ;({ rows: [review] } = await c.query(
        'INSERT INTO reviews (hiring_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1,$2,$3,$4,$5) RETURNING id, hiring_id AS "hiringId", reviewer_id AS "reviewerId", reviewee_id AS "revieweeId", rating, comment, created_at AS "createdAt"',
        [hiringId, user.id, revieweeId, rating, comment]))
    } catch (e) {
      if (e.code === '23505') throw conflict('You have already reviewed this hiring.', 'DUPLICATE_REVIEW')   // unique (hiring, reviewer): also settles simultaneous submits
      throw e
    }
    await notify(c, revieweeId, 'REVIEW', `${user.name} left you a ${rating}-star review.`, user.role === 'COMPANY' ? '/freelancer/profile' : '/company/profile')
    return review
  }, db)
}

// Reviews about a user, visible to whoever may see that user's profile
export async function listReviews(db, viewer, userId) {
  await assertCanViewUser(db, viewer, userId)
  const { rows } = await db.query(
    `SELECT r.id, r.hiring_id AS "hiringId", r.reviewer_id AS "reviewerId", r.reviewee_id AS "revieweeId", r.rating, r.comment, r.created_at AS "createdAt", u.name AS "reviewerName"
     FROM reviews r JOIN users u ON u.id = r.reviewer_id WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC, r.id`, [userId])
  return rows
}
