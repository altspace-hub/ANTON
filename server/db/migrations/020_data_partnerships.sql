-- Migration 020: Data Partnership Connectors (Roaring + Dow Jones)
-- Supports the entity intelligence layer for FCP modules

CREATE TABLE IF NOT EXISTS data_connectors (
  id TEXT PRIMARY KEY,
  connector_type TEXT NOT NULL,   -- 'roaring' | 'dowjones'
  display_name TEXT NOT NULL,
  status TEXT DEFAULT 'mock',     -- 'mock' | 'live' | 'error'
  api_key_set BOOLEAN DEFAULT FALSE,
  last_successful_call TEXT,
  total_calls INTEGER DEFAULT 0,
  config JSON,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_screens (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  entity_name TEXT NOT NULL,
  org_number TEXT,
  connector TEXT NOT NULL,        -- 'roaring' | 'dowjones' | 'combined'
  result JSON NOT NULL,
  risk_score TEXT,                -- 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAR'
  hit_count INTEGER DEFAULT 0,
  screened_at TEXT DEFAULT (datetime('now')),
  cached_until TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS entity_monitoring (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  connector TEXT NOT NULL,
  registered_at TEXT DEFAULT (datetime('now')),
  last_alert TEXT,
  alert_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'    -- 'active' | 'paused' | 'cancelled'
);

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id TEXT PRIMARY KEY,
  entity_monitoring_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  details JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  acknowledged BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (entity_monitoring_id) REFERENCES entity_monitoring(id) ON DELETE CASCADE
);

-- Indexes for frequent query patterns
CREATE INDEX IF NOT EXISTS idx_entity_screens_connector ON entity_screens(connector);
CREATE INDEX IF NOT EXISTS idx_entity_screens_org_number ON entity_screens(org_number);
CREATE INDEX IF NOT EXISTS idx_entity_screens_cache_lookup ON entity_screens(org_number, connector, cached_until);
CREATE INDEX IF NOT EXISTS idx_entity_screens_screened_at ON entity_screens(screened_at);
CREATE INDEX IF NOT EXISTS idx_entity_monitoring_status ON entity_monitoring(connector, status);
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_entity ON monitoring_alerts(entity_monitoring_id);

-- Seed default connector records
INSERT OR IGNORE INTO data_connectors (id, connector_type, display_name, status, api_key_set) VALUES
  ('roaring-default', 'roaring', 'Roaring — Nordic Entity Registry', 'mock', FALSE),
  ('dowjones-default', 'dowjones', 'Dow Jones Risk & Compliance', 'mock', FALSE);
