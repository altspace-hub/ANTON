-- Phase 1 customer-testing — reviewer feedback + share tokens (May 2026).
--
-- Until now every tabular-review run was a one-way street: the AI filled in
-- cells, the user looked at them, that was it. Real customer testing requires
-- a structured way for a reviewer (the user, or — more importantly — an
-- external MLRO / compliance officer / lawyer the user sends a link to) to
-- tell the system "the AI got this wrong" and have that feedback be
-- permanent + queryable + usable for per-column prompt iteration.
--
-- Two tables:
--
--   tabular_review_cell_feedback — one row per (cell × reviewer). Reviewer
--   marks the AI's answer ✓ correct / ✗ false positive / ✗ false negative /
--   🟡 partial / 🤷 unclear, optionally states what the right answer was,
--   optionally leaves a note. Upserted on the unique (run × doc × column ×
--   reviewer) key so the reviewer can change their mind.
--
--   tabular_review_share_tokens — opaque tokens granting external reviewers
--   (no ANTON account) access to a single run for read + feedback. Generated
--   by the owning user; expires (default 30 days); revocable.
--
-- The reviewer_id discipline:
--   - solo-mode self-review: reviewer_id = 'solo'
--   - team-mode user: reviewer_id = the user's id
--   - external (via share link): reviewer_id = 'share:' + the token (one
--     anonymous reviewer per token in v1 — multi-reviewer per token can be
--     added later via a per-browser anon-id if useful)

CREATE TABLE IF NOT EXISTS tabular_review_cell_feedback (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES tabular_review_runs(id) ON DELETE CASCADE,
  doc_id          TEXT NOT NULL,
  column_id       TEXT NOT NULL,
  reviewer_id     TEXT NOT NULL,
  reviewer_name   TEXT,                                                          -- optional display name
  verdict         TEXT NOT NULL CHECK (verdict IN
                    ('correct', 'false_positive', 'false_negative', 'partial', 'unclear')),
  -- What the reviewer thinks the right cell status should have been. Optional
  -- because for `correct` the reviewer agrees with the AI's status, and for
  -- `unclear` there is no agreed right answer.
  reviewer_status TEXT CHECK (reviewer_status IN
                    ('covered', 'partial', 'missing', 'not_applicable')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, doc_id, column_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_tabular_review_cell_feedback_run
  ON tabular_review_cell_feedback(run_id);

CREATE INDEX IF NOT EXISTS idx_tabular_review_cell_feedback_run_column
  ON tabular_review_cell_feedback(run_id, column_id);

CREATE TABLE IF NOT EXISTS tabular_review_share_tokens (
  token           TEXT PRIMARY KEY,                                              -- opaque (UUID v4 hex)
  run_id          TEXT NOT NULL REFERENCES tabular_review_runs(id) ON DELETE CASCADE,
  created_by      TEXT NOT NULL,                                                 -- user_id of the creator
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  allow_feedback  BOOLEAN NOT NULL DEFAULT TRUE,                                 -- false = read-only link
  message         TEXT,                                                          -- optional msg to reviewer
  revoked_at      TIMESTAMPTZ                                                    -- soft revoke
);

CREATE INDEX IF NOT EXISTS idx_tabular_review_share_tokens_run
  ON tabular_review_share_tokens(run_id);

COMMENT ON TABLE tabular_review_cell_feedback IS
  'Reviewer feedback on individual cells. One row per (cell × reviewer). Phase 1 customer-testing deepening — May 2026.';
COMMENT ON TABLE tabular_review_share_tokens IS
  'Opaque tokens granting external (no-auth) reviewers access to a single run for read + feedback. Default 30-day expiry; revocable.';
