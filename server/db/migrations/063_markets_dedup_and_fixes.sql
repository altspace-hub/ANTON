-- Migration 063: Markets — Deduplication, rate limits, price normalization, circuit breaker
-- Addresses data pipeline fixes from expert review.

-- ── Dedup index on market_data_raw ──────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_data_raw_dedup
  ON market_data_raw(source_id, symbol, data_type, published_at);

-- ── API rate limits table (persists FMP daily counter across restarts) ───────
CREATE TABLE IF NOT EXISTS api_rate_limits (
  provider TEXT PRIMARY KEY,
  daily_calls INTEGER DEFAULT 0,
  reset_date TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed FMP entry
INSERT OR IGNORE INTO api_rate_limits (provider, daily_calls, reset_date)
VALUES ('fmp', 0, date('now'));

-- ── Normalized price table (standard schema across all providers) ────────────
CREATE TABLE IF NOT EXISTS market_price_normalized (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  price_date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  adjusted_close REAL,
  volume INTEGER,
  source_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(symbol, price_date, source_id)
);

CREATE INDEX IF NOT EXISTS idx_market_price_norm_symbol ON market_price_normalized(symbol, price_date);

-- ── Drawdown alert column on market_indexes ──────────────────────────────────
-- SQLite ALTER TABLE ADD COLUMN is idempotent-safe (errors if exists, but we ignore)
ALTER TABLE market_indexes ADD COLUMN drawdown_alert TEXT DEFAULT NULL;
