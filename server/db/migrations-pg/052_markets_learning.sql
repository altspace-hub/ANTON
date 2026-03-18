-- Migration 052 (PG): Markets Pillar Phase 4 — Self-Learning & Investigation
-- Confidence calibration, narratives, meta-learning, investigations, consul performance, backtests.

CREATE TABLE IF NOT EXISTS market_confidence_calibration (
  id SERIAL PRIMARY KEY,
  bucket_low REAL NOT NULL,
  bucket_high REAL NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  actual_accuracy REAL,
  stated_confidence_avg REAL,
  calibration_error REAL,
  is_overconfident INTEGER,                         -- 1 if stated > actual
  period_start TEXT,
  period_end TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_narratives (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  narrative_type TEXT NOT NULL DEFAULT 'thematic',   -- thematic, sector, macro, geopolitical, sentiment
  strength REAL NOT NULL DEFAULT 0.5,               -- 0-1
  momentum TEXT NOT NULL DEFAULT 'stable',           -- emerging, strengthening, stable, weakening, broken
  lifecycle TEXT NOT NULL DEFAULT 'emerging',         -- emerging, active, mature, declining, exhausted, broken
  beneficiary_entities TEXT DEFAULT '[]',
  counter_narrative TEXT,
  supporting_atoms TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_narratives_lifecycle ON market_narratives(lifecycle);
CREATE INDEX IF NOT EXISTS idx_market_narratives_strength ON market_narratives(strength DESC);

CREATE TABLE IF NOT EXISTS market_meta_learning (
  id TEXT PRIMARY KEY,
  learning_type TEXT NOT NULL,                       -- signal_reweight, correlation_update, blind_spot_discovery, consul_calibration, narrative_shift, regime_detection
  description TEXT NOT NULL,
  source_prediction_id TEXT,
  accuracy_delta_30d REAL,
  accuracy_delta_60d REAL,
  accuracy_delta_90d REAL,
  impact TEXT NOT NULL DEFAULT 'unknown',            -- high, medium, low, unknown
  is_sustained INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_meta_learning_type ON market_meta_learning(learning_type);

CREATE TABLE IF NOT EXISTS market_investigation_tasks (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,                        -- prediction_wrong, unexplained_win, assumption_breach, pattern_anomaly, blind_spot, regime_shift, narrative_shift, consul_disagreement
  trigger_reference TEXT,                            -- ID of the prediction/pattern that triggered this
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',               -- open, in_progress, completed, abandoned
  assigned_consul TEXT,                              -- macro_strategist, sector_analyst, contrarian, risk_assessor, synthesis
  findings TEXT DEFAULT '[]',                        -- JSON: findings from investigation
  atoms_created TEXT DEFAULT '[]',                   -- JSON: new atoms created
  process_improvements TEXT DEFAULT '[]',            -- JSON: systemic improvements identified
  root_cause TEXT,                                   -- data_gap, model_limitation, signal_weakness, process_gap, assumption_flaw, external_shock
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_market_investigations_status ON market_investigation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_market_investigations_trigger ON market_investigation_tasks(trigger_type);

CREATE TABLE IF NOT EXISTS market_consul_performance (
  id SERIAL PRIMARY KEY,
  consul_name TEXT NOT NULL,                         -- macro_strategist, sector_analyst, contrarian, risk_assessor, synthesis
  context_type TEXT NOT NULL DEFAULT 'general',      -- general, earnings, macro, geopolitical, sector
  time_horizon TEXT NOT NULL DEFAULT 'medium',       -- short, medium, long
  total_predictions INTEGER NOT NULL DEFAULT 0,
  correct_predictions INTEGER NOT NULL DEFAULT 0,
  accuracy REAL,
  avg_confidence REAL,
  calibration_error REAL,
  last_evaluated_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_consul_perf_name ON market_consul_performance(consul_name);

CREATE TABLE IF NOT EXISTS market_backtests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  strategy_config TEXT NOT NULL DEFAULT '{}',        -- JSON: strategy parameters
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  results TEXT DEFAULT '{}',                         -- JSON: performance metrics
  status TEXT NOT NULL DEFAULT 'pending',             -- pending, running, completed, failed
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_market_backtests_status ON market_backtests(status);
