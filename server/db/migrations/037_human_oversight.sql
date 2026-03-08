-- EUAI-02: Human oversight sign-off workflow
-- Required for EU AI Act Art. 14 (human oversight) compliance.
-- Covers high-risk FCP modules: gap-analysis, sanctions-advisory, investigation-support.

CREATE TABLE IF NOT EXISTS human_oversight_reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT    NOT NULL,
  module_id       TEXT    NOT NULL,
  user_id         TEXT    NOT NULL DEFAULT 'default',
  reviewer_name   TEXT    NOT NULL,
  reviewer_role   TEXT,                        -- e.g. "Chief Compliance Officer", "Senior AML Analyst"
  attestation     TEXT    NOT NULL,            -- full attestation text shown to and accepted by reviewer
  verdict         TEXT    NOT NULL CHECK (verdict IN ('approved', 'requires_amendment', 'rejected')),
  notes           TEXT,                        -- free-text notes from reviewer
  export_blocked  INTEGER NOT NULL DEFAULT 0, -- 1 if reviewer blocked export (verdict = rejected)
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_human_oversight_session
  ON human_oversight_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_human_oversight_user
  ON human_oversight_reviews(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_human_oversight_module
  ON human_oversight_reviews(module_id, created_at DESC);
