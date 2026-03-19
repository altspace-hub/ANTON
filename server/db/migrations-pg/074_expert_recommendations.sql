-- Migration 074: Expert panel recommendations — benchmark, circuit breaker,
-- fundamental scoring, conditional accuracy, onboarding

-- ═══ R1: Buy-and-Hold Benchmark ══════════════════════════════════════════════
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS benchmark_return NUMERIC(10,6);
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS benchmark_sharpe NUMERIC(10,6);
ALTER TABLE market_backtests ADD COLUMN IF NOT EXISTS alpha NUMERIC(10,6);
ALTER TABLE market_backtest_days ADD COLUMN IF NOT EXISTS benchmark_nav NUMERIC(16,6);
ALTER TABLE market_backtest_days ADD COLUMN IF NOT EXISTS benchmark_daily_return NUMERIC(10,6);

-- ═══ R2: Drawdown Circuit Breaker ════════════════════════════════════════════
ALTER TABLE market_backtest_days ADD COLUMN IF NOT EXISTS cash_allocation NUMERIC(10,6) DEFAULT 0;
ALTER TABLE market_backtest_days ADD COLUMN IF NOT EXISTS circuit_breaker_level TEXT DEFAULT 'none';
ALTER TABLE market_indexes ADD COLUMN IF NOT EXISTS cash_allocation NUMERIC(10,6) DEFAULT 0;
ALTER TABLE market_indexes ADD COLUMN IF NOT EXISTS circuit_breaker_level TEXT DEFAULT 'none';

-- ═══ R3: Fundamental Scoring ═════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS market_fundamental_scores (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  score_date TEXT NOT NULL,
  composite_score NUMERIC(10,4) NOT NULL,
  pe_rank NUMERIC(10,4),
  roe_score NUMERIC(10,4),
  gross_margin_score NUMERIC(10,4),
  debt_equity_score NUMERIC(10,4),
  revenue_growth_score NUMERIC(10,4),
  fcf_yield_score NUMERIC(10,4),
  data_source TEXT DEFAULT 'fmp',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, score_date)
);
CREATE INDEX IF NOT EXISTS idx_fund_scores_sym ON market_fundamental_scores(symbol, score_date DESC);

-- ═══ R4: Conditional Accuracy Tracking ═══════════════════════════════════════
ALTER TABLE market_predictions ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';
ALTER TABLE market_backtest_predictions ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS market_conditional_accuracy (
  id SERIAL PRIMARY KEY,
  feature_key TEXT NOT NULL,
  feature_value TEXT NOT NULL,
  scope TEXT DEFAULT 'live',
  total INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  accuracy NUMERIC(10,6),
  avg_brier NUMERIC(10,6),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feature_key, feature_value, scope)
);
CREATE INDEX IF NOT EXISTS idx_cond_acc_key ON market_conditional_accuracy(feature_key, feature_value);

-- ═══ R5: Onboarding Wizard ═══════════════════════════════════════════════════
ALTER TABLE goals_profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE goals_profiles ADD COLUMN IF NOT EXISTS risk_tolerance TEXT DEFAULT 'moderate';
ALTER TABLE goals_profiles ADD COLUMN IF NOT EXISTS investment_timeline TEXT DEFAULT '10y';
ALTER TABLE goals_profiles ADD COLUMN IF NOT EXISTS monthly_investment NUMERIC(16,2) DEFAULT 0;
