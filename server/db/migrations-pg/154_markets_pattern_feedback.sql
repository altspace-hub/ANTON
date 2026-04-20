-- ── 154_markets_pattern_feedback.sql ─────────────────────────────────────────
-- Markets effectiveness M1 — close the pattern → signal-weight feedback loop.
--
-- The pattern detector has been writing to market_pattern_detections for
-- months (April 2026 audit: 46 confidence_miscalibration, 10 directional_bias,
-- 67 symbol_failure_cluster patterns detected). None were ever consumed —
-- signal weights stayed at their default 1.0. This migration adds the
-- bookkeeping the new feedback service needs to apply patterns exactly once
-- and to leave a clear audit trail of the weight adjustments.

-- 1. Idempotency marker on the pattern itself — stamp when the feedback
--    service successfully applied a pattern's implied weight delta.
ALTER TABLE market_pattern_detections
  ADD COLUMN IF NOT EXISTS applied_to_weights_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_market_pattern_detections_unapplied
  ON market_pattern_detections (pattern_type, detected_at DESC)
  WHERE applied_to_weights_at IS NULL AND status = 'active';

-- 2. Audit log: every weight adjustment records which pattern caused it, the
--    before/after weight, and the multiplier. Keeps the closed-loop observable
--    without needing to reconstruct history from pattern metadata.
CREATE TABLE IF NOT EXISTS market_signal_weight_adjustments (
  id                 BIGSERIAL PRIMARY KEY,
  pattern_id         TEXT NOT NULL,
  pattern_type       TEXT NOT NULL,
  signal_type        TEXT NOT NULL,
  category           TEXT NOT NULL,
  multiplier         NUMERIC(10, 6) NOT NULL,
  weight_before      NUMERIC(10, 6) NOT NULL,
  weight_after       NUMERIC(10, 6) NOT NULL,
  rationale          TEXT NOT NULL,
  applied_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_signal_weight_adjustments_pattern
  ON market_signal_weight_adjustments (pattern_id);
CREATE INDEX IF NOT EXISTS idx_market_signal_weight_adjustments_signal
  ON market_signal_weight_adjustments (signal_type, category, applied_at DESC);
