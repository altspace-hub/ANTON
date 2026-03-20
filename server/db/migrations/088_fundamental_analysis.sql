-- Migration 088: Fundamental Analysis — analyst notes, earnings calendar

CREATE TABLE IF NOT EXISTS market_analyst_notes (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  report_period TEXT NOT NULL,
  headline TEXT NOT NULL,
  full_analysis TEXT NOT NULL,
  analyst_rating INTEGER,
  key_metrics JSONB DEFAULT '{}',
  red_flags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analyst_notes_sym ON market_analyst_notes(symbol, created_at DESC);

-- Earnings calendar data source
INSERT INTO market_data_sources (id, name, source_type, provider, config, fetch_interval_hours, is_active) VALUES
('mds_fmp_earnings_cal', 'FMP Earnings Calendar', 'api', 'fmp',
 '{"api_key_env":"FMP_API_KEY","data_type":"earnings_calendar"}', 24, 1)
ON CONFLICT (id) DO NOTHING;
