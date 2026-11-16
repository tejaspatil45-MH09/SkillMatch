-- Up Migration

-- ===== Enums =====
CREATE TYPE user_role         AS ENUM ('FREELANCER', 'COMPANY', 'ADMIN');
CREATE TYPE user_status       AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE project_status    AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE proposal_status   AS ENUM ('PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE hiring_status     AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE report_status     AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE notification_type AS ENUM ('SHORTLISTED', 'REJECTED', 'DEMO', 'DEMO_VIEWED', 'HIRED', 'COMPLETED', 'CANCELLED', 'PROPOSAL', 'REVIEW', 'REPORT');
CREATE TYPE demo_outcome      AS ENUM ('SUBMITTED', 'GRANTED', 'DENIED', 'VIEWED', 'EXPIRED', 'REISSUED');

-- updated_at maintenance
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ===== Users and profiles =====
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  email         text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text NOT NULL,
  role          user_role NOT NULL,
  status        user_status NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, role)                      -- lets other tables prove "this id belongs to a COMPANY / FREELANCER"
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE freelancer_profiles (
  user_id          uuid PRIMARY KEY,
  role             user_role NOT NULL DEFAULT 'FREELANCER' CHECK (role = 'FREELANCER'),
  headline         text NOT NULL DEFAULT '' CHECK (char_length(headline) <= 120),
  location         text NOT NULL DEFAULT '' CHECK (char_length(location) <= 120),
  experience_years integer CHECK (experience_years BETWEEN 0 AND 50),
  bio              text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 1000),
  photo_url        text,
  FOREIGN KEY (user_id, role) REFERENCES users (id, role) ON DELETE CASCADE
);

CREATE TABLE company_profiles (
  user_id     uuid PRIMARY KEY,
  role        user_role NOT NULL DEFAULT 'COMPANY' CHECK (role = 'COMPANY'),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  website     text NOT NULL DEFAULT '' CHECK (website = '' OR website ~* '^https?://'),
  location    text NOT NULL DEFAULT '' CHECK (char_length(location) <= 120),
  industry    text NOT NULL DEFAULT '' CHECK (char_length(industry) <= 80),
  logo_url    text,
  FOREIGN KEY (user_id, role) REFERENCES users (id, role) ON DELETE CASCADE
);

-- ===== Skills (soft-deleted: active = false keeps history intact) =====
CREATE TABLE skills (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 40),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX skills_name_lower_key ON skills (lower(name));

CREATE TABLE freelancer_skills (
  user_id  uuid NOT NULL REFERENCES freelancer_profiles (user_id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills (id),
  PRIMARY KEY (user_id, skill_id)
);
CREATE INDEX freelancer_skills_skill_idx ON freelancer_skills (skill_id);

CREATE TABLE portfolio_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES freelancer_profiles (user_id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 500),
  image_url   text,
  url         text CHECK (url IS NULL OR url = '' OR url ~* '^https?://'),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_items_user_idx ON portfolio_items (user_id);

CREATE TABLE experiences (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES freelancer_profiles (user_id) ON DELETE CASCADE,
  role    text NOT NULL, org text NOT NULL, period text NOT NULL, summary text NOT NULL DEFAULT ''
);
CREATE INDEX experiences_user_idx ON experiences (user_id);

-- ===== Projects =====
CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  company_role user_role NOT NULL DEFAULT 'COMPANY' CHECK (company_role = 'COMPANY'),
  title        text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 100),
  description  text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 30 AND 5000),
  budget_min   integer NOT NULL CHECK (budget_min > 0),
  budget_max   integer NOT NULL,
  deadline     timestamptz NOT NULL,
  status       project_status NOT NULL DEFAULT 'OPEN',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (budget_min <= budget_max),
  FOREIGN KEY (company_id, company_role) REFERENCES users (id, role),
  UNIQUE (id, company_id)
);
CREATE INDEX projects_status_created_idx ON projects (status, created_at DESC);
CREATE INDEX projects_company_idx ON projects (company_id);
CREATE TRIGGER projects_updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE project_skills (
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  skill_id   uuid NOT NULL REFERENCES skills (id),
  PRIMARY KEY (project_id, skill_id)
);
CREATE INDEX project_skills_skill_idx ON project_skills (skill_id);

-- ===== Proposals =====
CREATE TABLE proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects (id),
  freelancer_id   uuid NOT NULL,
  freelancer_role user_role NOT NULL DEFAULT 'FREELANCER' CHECK (freelancer_role = 'FREELANCER'),
  cover_letter    text NOT NULL CHECK (char_length(btrim(cover_letter)) BETWEEN 50 AND 2000),
  bid_amount      integer NOT NULL CHECK (bid_amount > 0),
  estimated_days  integer NOT NULL CHECK (estimated_days BETWEEN 1 AND 365),
  status          proposal_status NOT NULL DEFAULT 'PENDING',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (freelancer_id, freelancer_role) REFERENCES users (id, role),
  UNIQUE (project_id, freelancer_id),                       -- one proposal per freelancer per project, enforced even under races
  UNIQUE (id, project_id, freelancer_id)
);
CREATE INDEX proposals_project_idx ON proposals (project_id);
CREATE INDEX proposals_freelancer_idx ON proposals (freelancer_id);
CREATE TRIGGER proposals_updated BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===== Secure demos =====
CREATE TABLE demos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  uuid NOT NULL UNIQUE REFERENCES proposals (id),
  url          text NOT NULL CHECK (url ~* '^https?://\S+$'),     -- never javascript:, data:, file: ...
  description  text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 20 AND 1000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  viewed_at    timestamptz,
  CHECK (expires_at > submitted_at)
);

-- Audit trail: every submit, grant, denial and re-issue
CREATE TABLE demo_access_log (
  id         bigserial PRIMARY KEY,
  demo_id    uuid NOT NULL REFERENCES demos (id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  outcome    demo_outcome NOT NULL,
  ip         inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demo_access_log_demo_idx ON demo_access_log (demo_id, created_at DESC);

-- ===== Hirings =====
CREATE TABLE hirings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   uuid NOT NULL UNIQUE,
  project_id    uuid NOT NULL,
  freelancer_id uuid NOT NULL,
  company_id    uuid NOT NULL,
  status        hiring_status NOT NULL DEFAULT 'ACTIVE',
  start_date    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  cancel_reason text,
  -- A hiring must agree with its proposal and with the project's owner
  FOREIGN KEY (proposal_id, project_id, freelancer_id) REFERENCES proposals (id, project_id, freelancer_id),
  FOREIGN KEY (project_id, company_id) REFERENCES projects (id, company_id),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK (status <> 'CANCELLED' OR char_length(btrim(coalesce(cancel_reason, ''))) >= 10)
);
-- At most one live (active or completed) hiring per project
CREATE UNIQUE INDEX hirings_one_live_per_project ON hirings (project_id) WHERE status IN ('ACTIVE', 'COMPLETED');
CREATE INDEX hirings_company_idx ON hirings (company_id);
CREATE INDEX hirings_freelancer_idx ON hirings (freelancer_id);

-- ===== Reviews =====
CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hiring_id   uuid NOT NULL REFERENCES hirings (id),
  reviewer_id uuid NOT NULL REFERENCES users (id),
  reviewee_id uuid NOT NULL REFERENCES users (id),
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (reviewer_id <> reviewee_id),
  UNIQUE (hiring_id, reviewer_id)
);
CREATE INDEX reviews_reviewee_idx ON reviews (reviewee_id);

-- ===== Notifications =====
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  message    text NOT NULL,
  link       text NOT NULL,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- ===== Reports (two real foreign keys instead of a polymorphic id) =====
CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       uuid NOT NULL REFERENCES users (id),
  target_user_id    uuid REFERENCES users (id),
  target_project_id uuid REFERENCES projects (id),
  reason            text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 20 AND 1000),
  status            report_status NOT NULL DEFAULT 'OPEN',
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  CHECK (num_nonnulls(target_user_id, target_project_id) = 1),
  CHECK (target_user_id IS NULL OR target_user_id <> reporter_id)
);
CREATE UNIQUE INDEX reports_one_open_per_user_target    ON reports (reporter_id, target_user_id)    WHERE status = 'OPEN' AND target_user_id IS NOT NULL;
CREATE UNIQUE INDEX reports_one_open_per_project_target ON reports (reporter_id, target_project_id) WHERE status = 'OPEN' AND target_project_id IS NOT NULL;
CREATE INDEX reports_status_idx ON reports (status, created_at DESC);

-- ===== Password reset (only a hash of the token is stored) =====
CREATE TABLE password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens (user_id);

-- Down Migration

DROP TABLE IF EXISTS password_reset_tokens, reports, notifications, reviews, hirings, demo_access_log, demos, proposals,
  project_skills, projects, experiences, portfolio_items, freelancer_skills, skills, company_profiles, freelancer_profiles, users CASCADE;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TYPE IF EXISTS demo_outcome, notification_type, report_status, hiring_status, proposal_status, project_status, user_status, user_role;
