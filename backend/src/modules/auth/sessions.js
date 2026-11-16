// Revoke every session a user has (suspension, password reset). This is what server-side sessions buy us.
export const revokeUserSessions = (db, userId) => db.query("DELETE FROM session WHERE sess ->> 'userId' = $1", [String(userId)])
