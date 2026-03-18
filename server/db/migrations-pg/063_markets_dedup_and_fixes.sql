-- Migration 063 (PostgreSQL): Markets — Deduplication, rate limits, price normalization, circuit breaker

-- ── Dedup index on market_data_raw ──────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_data_raw_dedup
  ON market_data_raw(source_id, symbol, data_type, published_at);

-- ── API rate limits table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_rate_limits (
  provider TEXT PRIMARY KEY,
  daily_calls INTEGER DEFAULT 0,
  reset_date TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO api_rate_limits (provider, daily_calls, reset_date)
VALUES ('fmp', 0, CURRENT_DATE::TEXT)
ON CONFLICT (provider) DO NOTHING;

-- ── Normalized price table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_price_normalized (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  price_date TEXT NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION,
  adjusted_close DOUBLE PRECISION,
  volume BIGINT,
  source_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, price_date, source_id)
);

CREATE INDEX IF NOT EXISTS idx_market_price_norm_symbol ON market_price_normalized(symbol, price_date);

-- ── Drawdown alert column on market_indexes ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='market_indexes' AND column_name='drawdown_alert') THEN
    ALTER TABLE market_indexes ADD COLUMN drawdown_alert TEXT DEFAULT NULL;
  END IF;
END $$;
