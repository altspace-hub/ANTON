-- ── 161_pathfinder_visitor.sql ───────────────────────────────────────────────
-- Visitor-scoped Pathfinder analytics. Two tables:
--   pathfinder_search_log     — one row per submitted query, privacy-hashed
--   pathfinder_result_feedback — per-result signals (helpful/wrong/etc.)
-- Used by the /trending endpoint (time-windowed frequency, no ML ranking)
-- and the feedback buttons on each result card.

CREATE TABLE IF NOT EXISTS pathfinder_search_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,   -- nullable: anonymous allowed
  query_hash        TEXT NOT NULL,         -- sha256(query||user_salt) so raw text never leaves the row
  mode              TEXT NOT NULL,         -- pathfinder SearchMode
  scope             TEXT,                  -- optional category-scope facet
  result_count      INTEGER NOT NULL,
  clicked_result_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pfsl_recent
  ON pathfinder_search_log (created_at DESC);

CREATE TABLE IF NOT EXISTS pathfinder_result_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  search_log_id   UUID REFERENCES pathfinder_search_log(id) ON DELETE CASCADE,
  result_ref      TEXT NOT NULL,         -- portal_address / bundle_id / job_id / etc.
  signal          TEXT NOT NULL CHECK (signal IN ('helpful', 'wrong-match', 'low-quality', 'spam')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pfrf_result
  ON pathfinder_result_feedback (result_ref, signal);
