-- Migration 124: Output Transformation System — review fixes
--
-- Adds missing indexes flagged by the post-Phase-1 review:
--   • idx_sessions_structured_hash — the extractor's DB cache lookup
--     (SELECT ... WHERE structured_hash = ? AND structured_status =
--     'extracted') was doing full scans; partial index catches it.

CREATE INDEX IF NOT EXISTS idx_sessions_structured_hash
  ON sessions(structured_hash)
  WHERE structured_hash IS NOT NULL;
