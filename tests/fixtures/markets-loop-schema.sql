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

-- ── NAV engine ──────────────────────────────────────────────────────────────
-- Column types are load-bearing here, not incidental. published_at is
-- TIMESTAMPTZ, which node-postgres hands back as a JS Date; nav_date is TEXT.
-- A guard that compared String(published_at).slice(0,10) against a
-- 'YYYY-MM-DD' nav_date silently passed for every row ("Mon Aug 17" sorts
-- above "2026-08-18") and a mocked adapter returning strings could not see it.
CREATE TABLE IF NOT EXISTS market_indexes (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  index_type         TEXT NOT NULL DEFAULT 'custom',
  status             TEXT NOT NULL DEFAULT 'draft',
  max_holdings       INTEGER NOT NULL DEFAULT 20,
  rebalance_frequency TEXT NOT NULL DEFAULT 'monthly',
  weighting_method   TEXT NOT NULL DEFAULT 'equal',
  total_return       NUMERIC(16,6) DEFAULT 0.0,
  current_nav        NUMERIC(16,6) DEFAULT 1000.0,
  currency           TEXT DEFAULT 'USD',
  drawdown_alert     TEXT,
  -- Gates the LIVE rebalance path. Shadow runs must never write it, so the
  -- column has to exist here for that invariant to be testable at all.
  last_rebalance_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_index_holdings (
  id             SERIAL PRIMARY KEY,
  index_id       TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  name           TEXT,
  weight         NUMERIC NOT NULL DEFAULT 0,
  shares         DOUBLE PRECISION NOT NULL DEFAULT 0,
  entry_price    NUMERIC,
  current_price  NUMERIC,
  unrealized_pnl NUMERIC DEFAULT 0,
  added_at       TIMESTAMPTZ DEFAULT NOW(),
  removed_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS market_index_nav_history (
  id                SERIAL PRIMARY KEY,
  index_id          TEXT NOT NULL,
  nav_date          TEXT NOT NULL,
  nav_value         NUMERIC(16,6) NOT NULL,
  daily_return      NUMERIC(10,6),
  cumulative_return DOUBLE PRECISION,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_data_raw (
  id           TEXT PRIMARY KEY,
  source_id    TEXT NOT NULL,
  data_type    TEXT NOT NULL,
  symbol       TEXT,
  title        TEXT,
  content      TEXT,
  published_at TIMESTAMPTZ,
  fetched_at   TIMESTAMPTZ DEFAULT NOW(),
  metadata     TEXT DEFAULT '{}',
  is_processed INTEGER NOT NULL DEFAULT 0
);

-- ── Historical price sync target ────────────────────────────────────────────
-- The UNIQUE is (symbol, price_date, source) — three columns, not two. The
-- sync INSERT omits `source`, so every row takes the default and duplicate
-- (symbol, price_date) pairs from different feeds collide on ONE conflict key
-- inside a single statement. price_date is TEXT here, matching production.
CREATE TABLE IF NOT EXISTS market_historical_prices (
  id             SERIAL PRIMARY KEY,
  symbol         TEXT NOT NULL,
  price_date     TEXT NOT NULL,
  open           DOUBLE PRECISION,
  high           DOUBLE PRECISION,
  low            DOUBLE PRECISION,
  close          DOUBLE PRECISION,
  adjusted_close DOUBLE PRECISION,
  volume         BIGINT,
  source         TEXT DEFAULT 'fmp',
  fetched_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (symbol, price_date, source)
);

-- ── Prediction -> portfolio attribution ─────────────────────────────────────
-- executed_at is TIMESTAMPTZ, which pg returns as a JS Date. The sweep used to
-- call .slice(0, 10) on it (and on predictions.validated_at) and threw on every
-- row for four months. Keeping the real types here is what makes that testable.
CREATE TABLE IF NOT EXISTS market_index_rebalances (
  id                 TEXT PRIMARY KEY,
  index_id           TEXT NOT NULL,
  rebalance_type     TEXT DEFAULT 'scheduled',
  reasoning          TEXT,
  nav_at_rebalance   NUMERIC,
  executed_at        TIMESTAMPTZ DEFAULT NOW(),
  pre_holdings       JSONB,
  post_holdings      JSONB,
  trades             JSONB,
  prediction_signals JSONB DEFAULT '[]'::jsonb,
  trigger_type       TEXT DEFAULT 'scheduled'
);

CREATE TABLE IF NOT EXISTS market_prediction_attribution (
  id                SERIAL PRIMARY KEY,
  prediction_id     TEXT NOT NULL,
  rebalance_id      TEXT NOT NULL,
  signal_score      DOUBLE PRECISION,
  weight_change     DOUBLE PRECISION,
  subsequent_return DOUBLE PRECISION,
  attribution_pnl   DOUBLE PRECISION,
  computed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Investigations + why-chains ─────────────────────────────────────────────
-- The auto-dispatch step re-scans EVERY validated prediction on every run, so
-- creation must be idempotent on (trigger_type, trigger_reference). It was not:
-- 21 anomalous predictions became 1,419 investigations, 67.6 copies each.
CREATE TABLE IF NOT EXISTS market_investigation_tasks (
  id                   TEXT PRIMARY KEY,
  trigger_type         TEXT NOT NULL,
  trigger_reference    TEXT,
  title                TEXT NOT NULL,
  question             TEXT NOT NULL,
  status               TEXT DEFAULT 'open',
  assigned_consul      TEXT,
  findings             TEXT DEFAULT '[]',
  atoms_created        TEXT DEFAULT '[]',
  process_improvements TEXT DEFAULT '[]',
  root_cause           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS market_why_chains (
  id                     TEXT PRIMARY KEY,
  investigation_id       TEXT,
  prediction_id          TEXT,
  title                  TEXT,
  root_cause_type        TEXT,
  root_cause_description TEXT,
  impact_assessment      TEXT,
  num_levels             INTEGER DEFAULT 0,
  status                 TEXT DEFAULT 'in_progress',
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,
  direction              TEXT DEFAULT 'failure_analysis',
  root_cause_reached     INTEGER DEFAULT 0,
  chain_data             TEXT DEFAULT '[]',
  root_cause_summary     TEXT,
  atoms_created          TEXT DEFAULT '[]',
  correlations_updated   TEXT DEFAULT '[]',
  signal_weights_updated TEXT DEFAULT '[]',
  blind_spots_identified TEXT DEFAULT '[]',
  process_improvements   TEXT DEFAULT '[]',
  investigation_tasks_spawned TEXT,
  systemic_impact        TEXT,
  theses_affected        INTEGER,
  indexes_affected       INTEGER
);

CREATE TABLE IF NOT EXISTS market_why_chain_levels (
  id                     SERIAL PRIMARY KEY,
  chain_id               TEXT NOT NULL,
  level_number           INTEGER,
  question               TEXT,
  answer                 TEXT,
  evidence_atoms         TEXT DEFAULT '[]',
  atom_created           TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  level_type             TEXT DEFAULT 'symptom',
  atoms_created_at_level TEXT DEFAULT '[]',
  research_performed     TEXT,
  key_insight            TEXT
);

-- Conditional accuracy: the aggregates, and the ledger that keeps the roll-up
-- idempotent (migration 258). Without the ledger the roll-up counts the same
-- prediction on every pass over its 7-day window.
CREATE TABLE IF NOT EXISTS market_conditional_accuracy (
  id              SERIAL PRIMARY KEY,
  feature_key     TEXT NOT NULL,
  feature_value   TEXT NOT NULL,
  scope           TEXT DEFAULT 'live',
  total           INTEGER NOT NULL DEFAULT 0,
  correct         INTEGER NOT NULL DEFAULT 0,
  accuracy        NUMERIC(10,6),
  avg_brier       NUMERIC(10,6),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (feature_key, feature_value, scope)
);

CREATE TABLE IF NOT EXISTS market_conditional_accuracy_applied (
  prediction_id TEXT PRIMARY KEY,
  scope         TEXT NOT NULL DEFAULT 'live',
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
