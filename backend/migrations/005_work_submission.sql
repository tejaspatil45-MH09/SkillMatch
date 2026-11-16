-- Up Migration

-- Phase 9: work submission, company review and a conversation for every hiring.
-- Nothing here deletes or rewrites existing rows: hirings only gain a column with a default.

-- ===== Types =====
-- work_status lives on the hiring (where the work stands); submission_status lives on one submitted version.
CREATE TYPE work_status       AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED');
CREATE TYPE submission_status AS ENUM ('SUBMITTED', 'APPROVED', 'REVISION_REQUESTED');

-- New in-app notification kinds (the new values are not used inside this migration, so this is safe in a transaction on Postgres 12+)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'WORK_SUBMITTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'WORK_APPROVED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'MESSAGE';

-- ===== Hirings =====
-- Existing hirings start at IN_PROGRESS; their ACTIVE / COMPLETED / CANCELLED status is untouched.
ALTER TABLE hirings ADD COLUMN work_status work_status NOT NULL DEFAULT 'IN_PROGRESS';
-- Work can only be approved as part of completing the hiring
ALTER TABLE hirings ADD CONSTRAINT hirings_approved_work_is_completed CHECK (work_status <> 'APPROVED' OR status = 'COMPLETED');
-- Targets for composite foreign keys below ("this user IS the hired freelancer / the hiring company")
ALTER TABLE hirings ADD CONSTRAINT hirings_id_freelancer_key UNIQUE (id, freelancer_id);
ALTER TABLE hirings ADD CONSTRAINT hirings_id_company_key    UNIQUE (id, company_id);

-- ===== Submissions: an append-only history. A new attempt is a new row, never an edit. =====
CREATE TABLE work_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hiring_id    uuid NOT NULL,
  version      integer NOT NULL CHECK (version >= 1),
  title        text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  description  text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  repo_url     text CHECK (repo_url IS NULL OR (char_length(repo_url) <= 300 AND repo_url ~* '^https://(www\.)?github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/\S*)?$')),
  live_url     text CHECK (live_url IS NULL OR (char_length(live_url) <= 500 AND live_url ~* '^https?://\S+$')),
  status       submission_status NOT NULL DEFAULT 'SUBMITTED',
  feedback     text CHECK (feedback IS NULL OR char_length(btrim(feedback)) BETWEEN 10 AND 1000),
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  FOREIGN KEY (hiring_id, submitted_by) REFERENCES hirings (id, freelancer_id),   -- only the hired freelancer can submit
  FOREIGN KEY (hiring_id, reviewed_by)  REFERENCES hirings (id, company_id),      -- only the hiring company can review
  UNIQUE (hiring_id, version),
  -- something meaningful must be delivered: a link, or a real description
  CHECK (repo_url IS NOT NULL OR live_url IS NOT NULL OR char_length(btrim(description)) >= 20),
  CHECK ((status = 'SUBMITTED') = (reviewed_at IS NULL)),
  CHECK ((status = 'SUBMITTED') = (reviewed_by IS NULL)),
  CHECK ((status = 'REVISION_REQUESTED') = (feedback IS NOT NULL))               -- a revision request always carries its explanation
);
-- At most one submission waits for review per hiring, even if two requests arrive at the same moment
CREATE UNIQUE INDEX work_submissions_one_open_per_hiring ON work_submissions (hiring_id) WHERE status = 'SUBMITTED';
CREATE INDEX work_submissions_hiring_idx ON work_submissions (hiring_id, version DESC);

-- History is evidence: content can never be edited, a reviewed submission is frozen, and nothing is deleted.
CREATE FUNCTION work_submissions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Submission history cannot be deleted.' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'A reviewed submission can no longer be changed.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.hiring_id IS DISTINCT FROM OLD.hiring_id OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.repo_url IS DISTINCT FROM OLD.repo_url OR NEW.live_url IS DISTINCT FROM OLD.live_url
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'Submitted work cannot be edited; submit a new version instead.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_submissions_guard BEFORE UPDATE OR DELETE ON work_submissions FOR EACH ROW EXECUTE FUNCTION work_submissions_guard();

-- ===== Conversation: one thread per hiring, between its two parties only =====
CREATE TABLE hiring_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq        bigint GENERATED ALWAYS AS IDENTITY,        -- display order must not depend on timestamps or random uuids
  hiring_id  uuid NOT NULL REFERENCES hirings (id),
  sender_id  uuid NOT NULL REFERENCES users (id),
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz                                  -- set when the OTHER party has opened the conversation
);
CREATE INDEX hiring_messages_thread_idx ON hiring_messages (hiring_id, seq);
CREATE INDEX hiring_messages_unread_idx ON hiring_messages (hiring_id, sender_id) WHERE read_at IS NULL;

CREATE FUNCTION hiring_messages_sender_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hirings h WHERE h.id = NEW.hiring_id AND NEW.sender_id IN (h.freelancer_id, h.company_id)) THEN
    RAISE EXCEPTION 'Only the two parties of a hiring can post in its conversation.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hiring_messages_sender_guard BEFORE INSERT ON hiring_messages FOR EACH ROW EXECUTE FUNCTION hiring_messages_sender_guard();

-- Down Migration

-- Rolling back removes the Phase 9 tables, the column and the new notification kinds (and ONLY those notifications).
DROP TABLE IF EXISTS hiring_messages;
DROP FUNCTION IF EXISTS hiring_messages_sender_guard();
DROP TABLE IF EXISTS work_submissions;
DROP FUNCTION IF EXISTS work_submissions_guard();

ALTER TABLE hirings DROP CONSTRAINT IF EXISTS hirings_approved_work_is_completed;
ALTER TABLE hirings DROP COLUMN IF EXISTS work_status;
ALTER TABLE hirings DROP CONSTRAINT IF EXISTS hirings_id_freelancer_key;
ALTER TABLE hirings DROP CONSTRAINT IF EXISTS hirings_id_company_key;
DROP TYPE IF EXISTS submission_status;
DROP TYPE IF EXISTS work_status;

-- Postgres cannot remove enum values, so the type is rebuilt without them
DELETE FROM notifications WHERE type::text IN ('WORK_SUBMITTED', 'REVISION_REQUESTED', 'WORK_APPROVED', 'MESSAGE');
ALTER TYPE notification_type RENAME TO notification_type_old;
CREATE TYPE notification_type AS ENUM ('SHORTLISTED', 'REJECTED', 'DEMO', 'DEMO_VIEWED', 'HIRED', 'COMPLETED', 'CANCELLED', 'PROPOSAL', 'REVIEW', 'REPORT');
ALTER TABLE notifications ALTER COLUMN type TYPE notification_type USING type::text::notification_type;
DROP TYPE notification_type_old;
