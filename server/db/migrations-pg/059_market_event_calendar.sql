-- Migration 059 (PG): Market event calendar for event-driven triggers

CREATE TABLE IF NOT EXISTS market_event_calendar (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  symbol TEXT,
  entity_id TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  importance TEXT NOT NULL DEFAULT 'medium',
  pre_event_hours INTEGER DEFAULT 24,
  status TEXT NOT NULL DEFAULT 'pending',
  actual_outcome TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mec_scheduled ON market_event_calendar (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_mec_type ON market_event_calendar (event_type);
CREATE INDEX IF NOT EXISTS idx_mec_symbol ON market_event_calendar (symbol);
CREATE INDEX IF NOT EXISTS idx_mec_status ON market_event_calendar (status);
