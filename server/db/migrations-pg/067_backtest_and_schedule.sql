-- Migration 067: Backtest infrastructure + historical data cache + schedule tracking

-- ── Extend market_backtests with execution state ──────────────────────────────
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS current_sim_date TEXT;
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS total_trading_days INTEGER DEFAULT 0;
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS completed_days INTEGER DEFAULT 0;
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS universe JSONB DEFAULT '[]';
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS initial_capital NUMERIC(16,6) DEFAULT 100000000;
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS final_nav NUMERIC(16,6);
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS total_return NUMERIC(10,6);
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS annualized_return NUMERIC(10,6);
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS sharpe_ratio NUMERIC(10,6);
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC(10,6);
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS total_predictions INTEGER DEFAULT 0;
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS correct_predictions INTEGER DEFAULT 0;
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS prediction_accuracy NUMERIC(10,6);

-- ── Backtest daily snapshots ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_backtest_days (
  id SERIAL PRIMARY KEY,
  backtest_id TEXT NOT NULL,
  sim_date TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  nav NUMERIC(16,6) NOT NULL,
  daily_return NUMERIC(10,6),
  cumulative_return NUMERIC(10,6),
  holdings JSONB DEFAULT '[]',
  atoms_created INTEGER DEFAULT 0,
  theses_active INTEGER DEFAULT 0,
  predictions_made INTEGER DEFAULT 0,
  predictions_validated INTEGER DEFAULT 0,
  predictions_correct INTEGER DEFAULT 0,
  intelligence_summary TEXT,
  rebalance_executed BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(backtest_id, sim_date)
);
CREATE INDEX IF NOT EXISTS idx_backtest_days_bt ON market_backtest_days(backtest_id, sim_date);

-- ── Backtest predictions (isolated from live) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS market_backtest_predictions (
  id TEXT PRIMARY KEY,
  backtest_id TEXT NOT NULL,
  sim_date_created TEXT NOT NULL,
  sim_date_deadline TEXT,
  title TEXT NOT NULL,
  prediction_type TEXT NOT NULL DEFAULT 'directional',
  target_symbol TEXT,
  predicted_direction TEXT,
  predicted_value NUMERIC(16,6),
  confidence NUMERIC(10,6) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'active',
  actual_value NUMERIC(16,6),
  was_correct INTEGER,
  brier_score NUMERIC(10,6),
  validated_at_sim_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bt_preds_bt ON market_backtest_predictions(backtest_id, status);
CREATE INDEX IF NOT EXISTS idx_bt_preds_deadline ON market_backtest_predictions(backtest_id, sim_date_deadline);

-- ── Historical price cache (for backtesting) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS market_historical_prices (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  price_date TEXT NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION,
  adjusted_close DOUBLE PRECISION,
  volume BIGINT,
  source TEXT DEFAULT 'fmp',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, price_date, source)
);
CREATE INDEX IF NOT EXISTS idx_hist_prices_sym_date ON market_historical_prices(symbol, price_date);

-- ── Historical fundamentals cache ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_historical_fundamentals (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  report_date TEXT NOT NULL,
  data_type TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT 'annual',
  data JSONB NOT NULL,
  source TEXT DEFAULT 'fmp',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, report_date, data_type, period, source)
);
CREATE INDEX IF NOT EXISTS idx_hist_fund_sym ON market_historical_fundamentals(symbol, report_date);

-- ── Schedule run log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_schedule_runs (
  id SERIAL PRIMARY KEY,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  items_fetched INTEGER DEFAULT 0,
  atoms_created INTEGER DEFAULT 0,
  error TEXT,
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_sched_runs_phase ON market_schedule_runs(phase, started_at DESC);
