// Creates an in-app notification. Always pass the transaction client so the notification commits (or rolls back) with the change it describes.
export const notify = (db, userId, type, message, link) =>
  db.query('INSERT INTO notifications (user_id, type, message, link) VALUES ($1,$2,$3,$4)', [userId, type, message, link])
