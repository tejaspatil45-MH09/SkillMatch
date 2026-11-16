-- Up Migration

-- Every moderation action leaves a trace: who did what to what, and when.
CREATE TABLE admin_audit_log (
  id          bigserial PRIMARY KEY,
  admin_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL CHECK (action IN ('USER_SUSPENDED', 'USER_REINSTATED', 'REPORT_RESOLVED', 'SKILL_ADDED', 'SKILL_REACTIVATED', 'SKILL_RETIRED')),
  target_type text NOT NULL,
  target_id   text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);

-- Down Migration

DROP TABLE IF EXISTS admin_audit_log;
