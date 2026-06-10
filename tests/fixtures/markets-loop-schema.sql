-- ── markets-loop-schema.sql ─────────────────────────────────────────────────
-- Minimal DDL fixture for the Markets closed-loop integration suite
-- (tests/services/markets-loop.integration.test.ts).
--
-- Shapes captured from the LIVE database via pg_dump on 2026-06-10 — i.e. the
-- post-migration reality the services actually run against (050 base +
-- 105/106 TEXT→TIMESTAMPTZ + 154 pattern feedback + 156 verification
-- tracking + 157 symbol overrides). The traits that have bitten before are
-- deliberately preserved:
--   • market_predictions.deadline / created_at are TIMESTAMPTZ — the verifier
--     COALESCE crash (Wave-1C, plan 1.10a) was a timestamptz/text mismatch
--     exactly here. If this fixture drifted back to TEXT the regression test
--     would stop testing the real failure mode.
--   • NUMERIC(…) columns (confidence, brier_score, multiplier, …) — node-pg
--     returns these as JS strings, and COUNT()/SUM() aggregates come back as
--     strings too (the string-metadata deriver bug, plan 1.10b).
--   • workflow_runs.status CHECK — the real vocabulary. 'success' is invalid
--     by construction, which is exactly why the pre-Wave-1C watchdog never
--     matched a row.
--
-- If a future migration changes any of these tables, update this fixture to
-- match (re-dump with pg_dump --schema-only -t <table>).
--
-- Executed via a raw pg client (NOT the DatabaseAdapter), so no SQLite→PG
-- translation pipeline touches this file.

CREATE TABLE IF NOT EXISTS market_theses (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  thesis_type     TEXT NOT NULL DEFAULT 'investment',
  status          TEXT NOT NULL DEFAULT 'draft',
  confidence      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  time_horizon    TEXT NOT NULL DEFAULT 'medium',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_predictions (
  id                            TEXT PRIMARY KEY,
  thesis_id                     TEXT,
  title                         TEXT NOT NULL,
  description                   TEXT NOT NULL,
  prediction_type               TEXT NOT NULL DEFAULT 'directional',
  target_entity                 TEXT,
  target_symbol                 TEXT,
  predicted_outcome             TEXT NOT NULL,
  predicted_value               NUMERIC(16,6),
  predicted_direction           TEXT,
  confidence                    NUMERIC(10,6) NOT NULL DEFAULT 0.5,
  time_horizon_days             INTEGER,
  deadline                      TIMESTAMPTZ,           -- TIMESTAMPTZ since migration 105
  status                        TEXT NOT NULL DEFAULT 'active',
  actual_outcome                TEXT,
  actual_value                  NUMERIC(16,6),
  was_correct                   INTEGER,
  brier_score                   NUMERIC(10,6),
  key_assumptions               TEXT DEFAULT '[]',
  validated_at                  TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ DEFAULT NOW(),
  horizon                       TEXT DEFAULT 'this_month',
  strategy_context              TEXT,
  values_applied                JSONB DEFAULT '[]'::jsonb,
  temporal_consequences         JSONB,
  features                      JSONB DEFAULT '{}'::jsonb,
  verification_attempts         INTEGER NOT NULL DEFAULT 0,    -- migration 156
  last_verification_attempt_at  TIMESTAMPTZ,
  last_verification_failure     TEXT
);

-- The retry-sweep partial index from migration 156 (kept so the predicate the
-- verifier relies on is exercised against the same expression).
CREATE INDEX IF NOT EXISTS idx_market_predictions_retry_candidates
  ON market_predictions (last_verification_attempt_at)
  WHERE status = 'expired' AND was_correct IS NULL AND verification_attempts < 3;

CREATE TABLE IF NOT EXISTS market_prediction_feedback (
  id              SERIAL PRIMARY KEY,
  prediction_id   TEXT NOT NULL REFERENCES market_predictions(id) ON DELETE CASCADE,
  feedback_type   TEXT NOT NULL DEFAULT 'validation',
  predicted_value NUMERIC(16,6),
  actual_value    NUMERIC(16,6),
  accuracy_score  NUMERIC(10,6),
  explanation     TEXT,
  lessons_learned TEXT,
  atoms_created   TEXT DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_price_normalized (
  id              TEXT PRIMARY KEY,
  symbol          TEXT NOT NULL,
  price_date      TEXT NOT NULL,        -- 'YYYY-MM-DD' strings, as in prod
  open            DOUBLE PRECISION,
  high            DOUBLE PRECISION,
  low             DOUBLE PRECISION,
  close           DOUBLE PRECISION,
  adjusted_close  DOUBLE PRECISION,
  volume          BIGINT,
  source_id       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (symbol, price_date, source_id)
);

CREATE TABLE IF NOT EXISTS market_pattern_detections (
  id                     TEXT PRIMARY KEY,
  pattern_type           TEXT NOT NULL,
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  severity               TEXT NOT NULL DEFAULT 'medium',
  confidence             DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  affected_symbols       TEXT DEFAULT '[]',
  evidence_atoms         TEXT DEFAULT '[]',
  metadata               TEXT DEFAULT '{}',     -- TEXT JSON; pg aggregates serialize as STRINGS
  status                 TEXT NOT NULL DEFAULT 'new',
  detected_at            TIMESTAMPTZ DEFAULT NOW(),
  resolved_at            TIMESTAMPTZ,
  affected_entities      JSONB,
  applied_to_weights_at  TIMESTAMPTZ            -- migration 154 idempotency marker
);

CREATE TABLE IF NOT EXISTS market_signal_weights (
  id                  SERIAL PRIMARY KEY,
  signal_type         TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'general',
  weight              DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  sample_size         INTEGER NOT NULL DEFAULT 0,
  accuracy            DOUBLE PRECISION,
  last_calibrated_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_market_signal_weights_type_category UNIQUE (signal_type, category)
);

CREATE TABLE IF NOT EXISTS market_symbol_weight_overrides (
  symbol             TEXT PRIMARY KEY,
  weight_multiplier  NUMERIC(10,6) NOT NULL DEFAULT 1.0,
  last_pattern_id    TEXT,
  last_applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rationale          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_signal_weight_adjustments (
  id             BIGSERIAL PRIMARY KEY,
  pattern_id     TEXT NOT NULL,
  pattern_type   TEXT NOT NULL,
  signal_type    TEXT NOT NULL,
  category       TEXT NOT NULL,
  multiplier     NUMERIC(10,6) NOT NULL,
  weight_before  NUMERIC(10,6) NOT NULL,
  weight_after   NUMERIC(10,6) NOT NULL,
  rationale      TEXT NOT NULL,
  applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id             TEXT PRIMARY KEY,
  workflow_id    TEXT NOT NULL,
  trigger_source TEXT,
  status         TEXT DEFAULT 'running',
  current_step   INTEGER DEFAULT 0,
  error_message  TEXT,
  user_id        TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TEXT,
  CONSTRAINT workflow_runs_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])
  )
);

CREATE TABLE IF NOT EXISTS market_confidence_calibration (
  id                     SERIAL PRIMARY KEY,
  bucket_low             DOUBLE PRECISION NOT NULL,
  bucket_high            DOUBLE PRECISION NOT NULL,
  sample_size            INTEGER NOT NULL DEFAULT 0,
  actual_accuracy        DOUBLE PRECISION,
  stated_confidence_avg  DOUBLE PRECISION,
  calibration_error      DOUBLE PRECISION,
  is_overconfident       INTEGER,
  period_start           TEXT,   -- TEXT in prod; runCalibrationCheck inserts a timestamptz expression (assignment cast)
  period_end             TEXT,
  computed_at            TIMESTAMPTZ DEFAULT NOW()
);
