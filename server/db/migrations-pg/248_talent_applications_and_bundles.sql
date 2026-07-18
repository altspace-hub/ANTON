-- Migration 248: the two tables the candidate-side Jobs API (routes/jobs.ts) and
-- migration 162 assumed already existed but never did.
--
-- 162's header claimed "talent_applications ... already exist from the recruiter-side
-- build" — but the recruiter side (migration 107) created talent_candidates, not
-- talent_applications, and anton_bundles was never created anywhere. Every
-- candidate-side apply / dashboard / profile-import call therefore hit a missing
-- table. This migration creates both so the Jobs surface actually works.

-- ── Candidate applications ───────────────────────────────────────────────────
-- One row per (user, campaign) application. Distinct from talent_candidates, which
-- is the recruiter's manually-managed candidate pool; talent_applications is the
-- self-service surface where an authenticated user applies to a live campaign.
CREATE TABLE IF NOT EXISTS talent_applications (
  id                        TEXT PRIMARY KEY,
  campaign_id               TEXT NOT NULL REFERENCES talent_campaigns(id) ON DELETE CASCADE,
  candidate_user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                    TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'shortlisted', 'rejected', 'withdrawn', 'offer', 'hired')),
  cv_text                   TEXT,
  career_profile_bundle_id  TEXT,           -- optional pointer into anton_bundles.id (no hard FK: best-effort)
  answers_json              JSONB DEFAULT '[]',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_applications_candidate
  ON talent_applications (candidate_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_talent_applications_campaign
  ON talent_applications (campaign_id, created_at DESC);

-- ── Portable .anton bundles (generic store) ──────────────────────────────────
-- Used here for career-profile bundles (bundle_type = 'career-profile'); kept
-- generic so other bundle types can share the table. users.career_profile_bundle_id
-- (migration 162) points at a row here.
CREATE TABLE IF NOT EXISTS anton_bundles (
  id             TEXT PRIMARY KEY,
  bundle_type    TEXT NOT NULL,
  owner_user_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
  payload        JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anton_bundles_owner
  ON anton_bundles (owner_user_id, bundle_type);
