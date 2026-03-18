-- Migration 051 (PG): Markets Pillar Phase 3 — Pattern Detection & Indexes
-- Automated pattern detection, paper-traded index portfolios, NAV tracking.

-- ── Pattern Detections ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_pattern_detections (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,                        -- momentum_divergence, volume_anomaly, correlation_break, sector_rotation, regime_change
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',            -- low, medium, high, critical
  confidence REAL NOT NULL DEFAULT 0.5,
  affected_entities TEXT DEFAULT '[]',               -- JSON array of entity IDs
  affected_symbols TEXT DEFAULT '[]',                -- JSON array of symbols
  evidence_atoms TEXT DEFAULT '[]',                  -- JSON array of atom IDs
  metadata TEXT DEFAULT '{}',                        -- JSON: detector-specific data
  status TEXT NOT NULL DEFAULT 'new',                -- new, acknowledged, investigating, resolved, false_positive
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_market_patterns_type ON market_pattern_detections(pattern_type);
CREATE INDEX IF NOT EXISTS idx_market_patterns_status ON market_pattern_detections(status);
CREATE INDEX IF NOT EXISTS idx_market_patterns_severity ON market_pattern_detections(severity);
CREATE INDEX IF NOT EXISTS idx_market_patterns_detected ON market_pattern_detections(detected_at DESC);

-- ── Correlation Map ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_correlation_map (
  id SERIAL PRIMARY KEY,
  entity_a TEXT NOT NULL,
  entity_b TEXT NOT NULL,
  correlation REAL NOT NULL,
  lag_days INTEGER NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'daily',
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_corr_entities ON market_correlation_map(entity_a, entity_b);

-- ── Market Indexes ──────────────────────────────────────────────────────────
-- Paper-traded synthetic benchmark portfolios

CREATE TABLE IF NOT EXISTS market_indexes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  index_type TEXT NOT NULL DEFAULT 'custom',          -- geographic, sector, philosophy, custom
  philosophy TEXT,                                    -- value, growth, momentum, contrarian, etc.
  status TEXT NOT NULL DEFAULT 'draft',               -- draft, active, paused, archived
  universe TEXT DEFAULT '[]',                         -- JSON: eligible symbols/sectors
  max_holdings INTEGER NOT NULL DEFAULT 20,
  rebalance_frequency TEXT NOT NULL DEFAULT 'monthly', -- weekly, monthly, quarterly
  weighting_method TEXT NOT NULL DEFAULT 'equal',     -- equal, market_cap, conviction, risk_parity
  inception_date TEXT,
  last_rebalance_at TEXT,
  total_return REAL DEFAULT 0.0,
  current_nav REAL DEFAULT 1000.0,                   -- starting NAV = 1000
  benchmark_symbol TEXT,                              -- e.g. SPY for comparison
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_indexes_status ON market_indexes(status);
CREATE INDEX IF NOT EXISTS idx_market_indexes_type ON market_indexes(index_type);

-- ── Index Holdings ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_index_holdings (
  id SERIAL PRIMARY KEY,
  index_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  weight REAL NOT NULL,                              -- target weight 0-1
  shares REAL NOT NULL DEFAULT 0,
  entry_price REAL,
  current_price REAL,
  unrealized_pnl REAL DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  removed_at TEXT,                                   -- null = still active
  FOREIGN KEY (index_id) REFERENCES market_indexes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_holdings_index ON market_index_holdings(index_id);
CREATE INDEX IF NOT EXISTS idx_market_holdings_symbol ON market_index_holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_market_holdings_active ON market_index_holdings(index_id, removed_at);

-- ── Index NAV History ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_index_nav_history (
  id SERIAL PRIMARY KEY,
  index_id TEXT NOT NULL,
  nav_date TEXT NOT NULL,
  nav_value REAL NOT NULL,
  daily_return REAL,
  cumulative_return REAL,
  benchmark_value REAL,
  benchmark_return REAL,
  excess_return REAL,
  volatility_30d REAL,
  sharpe_30d REAL,
  max_drawdown REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (index_id) REFERENCES market_indexes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_nav_index_date ON market_index_nav_history(index_id, nav_date DESC);

-- ── Index Rebalances ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_index_rebalances (
  id TEXT PRIMARY KEY,
  index_id TEXT NOT NULL,
  rebalance_type TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled, manual, threshold, event
  pre_holdings TEXT NOT NULL DEFAULT '[]',            -- JSON: holdings before
  post_holdings TEXT NOT NULL DEFAULT '[]',           -- JSON: holdings after
  trades TEXT NOT NULL DEFAULT '[]',                  -- JSON: buy/sell actions
  reasoning TEXT,                                     -- AI reasoning for changes
  nav_at_rebalance REAL,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (index_id) REFERENCES market_indexes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_rebalances_index ON market_index_rebalances(index_id);

-- ── Index Leaderboard ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_index_leaderboard (
  id SERIAL PRIMARY KEY,
  index_id TEXT NOT NULL,
  period TEXT NOT NULL,                              -- 1w, 1m, 3m, 6m, 1y, ytd, inception
  total_return REAL NOT NULL,
  annualized_return REAL,
  sharpe_ratio REAL,
  max_drawdown REAL,
  volatility REAL,
  alpha REAL,
  beta REAL,
  rank_position INTEGER,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (index_id) REFERENCES market_indexes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_leaderboard_index ON market_index_leaderboard(index_id);
CREATE INDEX IF NOT EXISTS idx_market_leaderboard_period ON market_index_leaderboard(period, total_return DESC);

-- ── Regime History ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_regime_history (
  id TEXT PRIMARY KEY,
  regime_type TEXT NOT NULL,                         -- low_vol_bull, high_vol_bull, range_bound, correction, crisis, recovery
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence TEXT DEFAULT '[]',                        -- JSON: supporting atoms/patterns
  impact_description TEXT,
  signal_weight_adjustments TEXT DEFAULT '{}',       -- JSON: how signal weights should change
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_regime_type ON market_regime_history(regime_type);
CREATE INDEX IF NOT EXISTS idx_market_regime_active ON market_regime_history(ended_at);
