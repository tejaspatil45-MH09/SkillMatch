-- Up Migration

-- Server-side sessions (connect-pg-simple format). Keeping them in Postgres means a suspended user or a
-- password reset can revoke every session immediately, which a stateless JWT cannot do.
CREATE TABLE session (
  sid    varchar PRIMARY KEY,
  sess   jsonb NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);
CREATE INDEX session_user_idx ON session ((sess ->> 'userId'));

-- Down Migration

DROP TABLE IF EXISTS session;
