-- ── 156_markets_prediction_verification_tracking.sql ────────────────────────
-- Markets effectiveness M4 — track verification attempts so predictions that
-- fail verification once can be retried when conditions change (price data
-- backfills, LLM comes back online, thinking flag clears).
--
-- Context: the April 2026 audit found 70 of 338 predictions ended at
-- status='expired' with was_correct=NULL — they were marked unverifiable
-- on first try and never retried. This migration adds the counters the
-- new verifier logic needs to back off and retry instead of giving up.

ALTER TABLE market_predictions
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE market_predictions
  ADD COLUMN IF NOT EXISTS last_verification_attempt_at TIMESTAMPTZ;

ALTER TABLE market_predictions
  ADD COLUMN IF NOT EXISTS last_verification_failure TEXT;

-- Fast path for the retry sweep: find candidates in one index scan.
CREATE INDEX IF NOT EXISTS idx_market_predictions_retry_candidates
  ON market_predictions (last_verification_attempt_at)
  WHERE status = 'expired' AND was_correct IS NULL AND verification_attempts < 3;
