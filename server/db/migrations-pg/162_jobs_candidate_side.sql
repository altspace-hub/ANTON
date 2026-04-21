-- ── 162_jobs_candidate_side.sql ──────────────────────────────────────────────
-- Minimal schema additions for the candidate-side Jobs experience. Most
-- tables already exist from the recruiter-side build (talent_applications,
-- talent_campaigns, etc.); this migration adds only what the candidate
-- surface needs on top.

-- Link users to their portable .anton career-profile bundle (bundle type #44).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS career_profile_bundle_id UUID;

-- Saved searches on the candidate-side Jobs home. Lets applicants keep
-- frequent filters (location, jurisdiction, remote/hybrid, salary range)
-- without retyping. Stored in JSONB so the candidate UI can extend the
-- filter surface without migrations.
CREATE TABLE IF NOT EXISTS job_saved_searches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  filter_json    JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_saved_searches_user
  ON job_saved_searches (user_id, created_at DESC);

-- Candidate follow-up inbox: recruiter-side workflow sometimes asks up
-- to 3 clarifying questions. This row links a follow-up thread to an
-- application so the candidate dashboard can surface pending items.
CREATE TABLE IF NOT EXISTS job_follow_up_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  TEXT NOT NULL,         -- references talent_applications.id (TEXT PK)
  question_number INTEGER NOT NULL CHECK (question_number BETWEEN 1 AND 3),
  question_text   TEXT NOT NULL,
  answer_text     TEXT,
  asked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at     TIMESTAMPTZ,
  UNIQUE (application_id, question_number)
);

CREATE INDEX IF NOT EXISTS idx_jfu_application
  ON job_follow_up_questions (application_id, question_number);
