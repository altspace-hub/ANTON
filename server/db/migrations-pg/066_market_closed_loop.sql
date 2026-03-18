-- Track prediction-driven rebalance events
ALTER TABLE market_index_rebalances ADD COLUMN IF NOT EXISTS
  prediction_signals JSONB DEFAULT '[]';
ALTER TABLE market_index_rebalances ADD COLUMN IF NOT EXISTS
  trigger_type TEXT DEFAULT 'scheduled';

-- Track per-prediction portfolio impact
CREATE TABLE IF NOT EXISTS market_prediction_attribution (
  id SERIAL PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  rebalance_id TEXT NOT NULL,
  signal_score REAL NOT NULL,
  weight_change REAL NOT NULL,
  subsequent_return REAL,
  attribution_pnl REAL,
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pred_attr_prediction ON market_prediction_attribution(prediction_id);
CREATE INDEX IF NOT EXISTS idx_pred_attr_rebalance ON market_prediction_attribution(rebalance_id);
