import { withTransaction } from '../../db/tx.js'
import { conflict } from '../../utils/ApiError.js'
import { hiringLink, requireParty } from '../hirings/access.js'

const view = (r) => ({ id: r.id, hiringId: r.hiring_id, senderId: r.sender_id, senderName: r.sender_name, body: r.body, createdAt: r.created_at, readAt: r.read_at })
const COLS = 'm.id, m.hiring_id, m.sender_id, u.name AS sender_name, m.body, m.created_at, m.read_at, m.seq'

// The latest 200 messages, oldest first. Only the two parties of the hiring can read them.
// No email addresses or other contact details are ever part of a message payload.
export async function listMessages(db, user, hiringId) {
  await requireParty(db, user, hiringId)
  const { rows } = await db.query(
    `SELECT * FROM (SELECT ${COLS} FROM hiring_messages m JOIN users u ON u.id = m.sender_id WHERE m.hiring_id = $1 ORDER BY m.seq DESC LIMIT 200) t ORDER BY seq`, [hiringId])
  return rows.map(view)
}

// Cancelled hirings are read-only, and so is a conversation with an account that has been suspended.
// The refusal is the same in both cases, so a suspension is not revealed to the other party.
export async function sendMessage(db, user, hiringId, { body }) {
  await requireParty(db, user, hiringId)
  const id = await withTransaction(async (c) => {
    // A shared lock: many messages can be posted at once, but a simultaneous cancel waits for them (and vice versa)
    const { rows: [h] } = await c.query(
      `SELECT h.status, h.company_id, h.freelancer_id, p.title, o.status AS other_status
       FROM hirings h JOIN projects p ON p.id = h.project_id JOIN users o ON o.id = CASE WHEN h.company_id = $2 THEN h.freelancer_id ELSE h.company_id END
       WHERE h.id = $1 FOR SHARE OF h`, [hiringId, user.id])
    if (h.status === 'CANCELLED' || h.other_status === 'SUSPENDED') throw conflict('This conversation is not available right now.', 'CONVERSATION_CLOSED')
    const { rows: [m] } = await c.query('INSERT INTO hiring_messages (hiring_id, sender_id, body) VALUES ($1,$2,$3) RETURNING id', [hiringId, user.id, body])
    // One unread notification per conversation is enough: a burst of messages must not flood the other person
    const recipient = h.company_id === user.id ? h.freelancer_id : h.company_id
    const link = hiringLink(h.company_id === user.id ? 'FREELANCER' : 'COMPANY', hiringId)
    // Messages arriving at the same moment queue up here, so each one sees the previous one's notification (never two unread)
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`message-notice:${recipient}:${hiringId}`])
    await c.query(
      `INSERT INTO notifications (user_id, type, message, link)
       SELECT $1, 'MESSAGE', $2, $3 WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'MESSAGE' AND link = $3 AND NOT read)`,
      [recipient, `${user.name} sent you a message about "${h.title}".`, link])
    return m.id
  }, db)
  const { rows: [m] } = await db.query(`SELECT ${COLS} FROM hiring_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1`, [id])
  return view(m)
}

// Called when someone opens the conversation: marks THEIR unread messages (those sent by the other party) as read,
// and clears the matching notification so the unread badge stays honest.
export async function markRead(db, user, hiringId) {
  const h = await requireParty(db, user, hiringId)
  return withTransaction(async (c) => {
    const { rowCount } = await c.query('UPDATE hiring_messages SET read_at = now() WHERE hiring_id = $1 AND sender_id <> $2 AND read_at IS NULL', [hiringId, user.id])
    const link = hiringLink(h.company_id === user.id ? 'COMPANY' : 'FREELANCER', hiringId)
    await c.query("UPDATE notifications SET read = true WHERE user_id = $1 AND type = 'MESSAGE' AND link = $2 AND NOT read", [user.id, link])
    return { ok: true, marked: rowCount }
  }, db)
}
