-- Migration 073: Backtest intelligence pipeline tables

CREATE TABLE IF NOT EXISTS market_backtest_theses (
  id TEXT PRIMARY KEY,
  backtest_id TEXT NOT NULL,
  sim_date_created TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thesis_type TEXT NOT NULL DEFAULT 'investment',
  confidence NUMERIC(10,6) DEFAULT 0.5,
  time_horizon TEXT DEFAULT 'medium',
  target_entities JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bt_theses_bt ON market_backtest_theses(backtest_id, status);

ALTER TABLE market_backtest_predictions ADD COLUMN IF NOT EXISTS thesis_id TEXT;
ALTER TABLE market_backtest_predictions ADD COLUMN IF NOT EXISTS signal_source TEXT DEFAULT 'rule';

CREATE TABLE IF NOT EXISTS market_backtest_signal_weights (
  id SERIAL PRIMARY KEY,
  backtest_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  weight NUMERIC(10,6) NOT NULL DEFAULT 1.0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  accuracy NUMERIC(10,6),
  last_updated_sim_date TEXT,
  UNIQUE(backtest_id, signal_type, category)
);
CREATE INDEX IF NOT EXISTS idx_bt_sw ON market_backtest_signal_weights(backtest_id);
