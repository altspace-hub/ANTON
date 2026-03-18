-- Migration 049: Markets Pillar — Phase 1 Foundation
-- Data sources, raw market data, market atoms, watchlist, computation log.
-- Market atoms are stored in separate tables from Work/School/Life atoms
-- to handle different volume, faster decay, and avoid cross-contamination.

-- ── Data Sources ────────────────────────────────────────────────────────────
-- API connections to market data providers (Alpha Vantage, Finnhub, Marketaux, etc.)

CREATE TABLE IF NOT EXISTS market_data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'api',         -- api, rss, manual, webhook
  provider TEXT NOT NULL,                           -- alpha_vantage, finnhub, marketaux, custom
  config TEXT NOT NULL DEFAULT '{}',                -- JSON: api_key ref, base_url, params (no raw keys)
  fetch_interval_hours INTEGER NOT NULL DEFAULT 6,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_fetch_at TEXT,
  last_fetch_status TEXT,                           -- success, error, rate_limited
  last_fetch_error TEXT,
  items_fetched_total INTEGER NOT NULL DEFAULT 0,
  quality_score REAL DEFAULT 1.0,                   -- 0.0 to 1.0
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── Raw Market Data ─────────────────────────────────────────────────────────
-- Raw ingested data: prices, news, events, fundamentals

CREATE TABLE IF NOT EXISTS market_data_raw (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  data_type TEXT NOT NULL,                          -- price, news, event, fundamental, sentiment
  symbol TEXT,                                      -- ticker symbol (e.g. AAPL, MSFT)
  title TEXT,
  content TEXT,                                     -- raw JSON payload or text content
  published_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now')),
  metadata TEXT DEFAULT '{}',                       -- JSON: extra provider-specific fields
  is_processed INTEGER NOT NULL DEFAULT 0,          -- 0 = pending atom extraction, 1 = done
  FOREIGN KEY (source_id) REFERENCES market_data_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_data_raw_source ON market_data_raw(source_id);
CREATE INDEX IF NOT EXISTS idx_market_data_raw_type ON market_data_raw(data_type, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_raw_symbol ON market_data_raw(symbol);
CREATE INDEX IF NOT EXISTS idx_market_data_raw_unprocessed ON market_data_raw(is_processed) WHERE is_processed = 0;

-- ── Market Atoms ────────────────────────────────────────────────────────────
-- Facts, signals, insights, events, predictions, outcomes extracted from raw data
-- Separate from knowledge_atoms to avoid cross-contamination

CREATE TABLE IF NOT EXISTS market_atoms (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  atom_type TEXT NOT NULL,                          -- fact, signal, insight, event, prediction, outcome
  confidence REAL NOT NULL DEFAULT 0.5,             -- 0.0 to 1.0
  category TEXT NOT NULL DEFAULT 'general',         -- equity, macro, sector, commodity, fx, crypto, general
  subcategory TEXT,
  sentiment TEXT,                                   -- bullish, bearish, neutral, mixed
  temporal_type TEXT DEFAULT 'point',               -- point, range, ongoing, recurring
  entities TEXT DEFAULT '[]',                       -- JSON array of {type, id, name}
  valid_from TEXT DEFAULT (datetime('now')),
  valid_until TEXT,                                 -- null = no explicit expiry
  decay_rate REAL NOT NULL DEFAULT 0.05,            -- daily confidence decay factor
  is_active INTEGER NOT NULL DEFAULT 1,
  superseded_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_market_atoms_type ON market_atoms(atom_type);
CREATE INDEX IF NOT EXISTS idx_market_atoms_category ON market_atoms(category);
CREATE INDEX IF NOT EXISTS idx_market_atoms_active ON market_atoms(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_atoms_confidence ON market_atoms(confidence DESC);

-- ── Market Atom Sources ─────────────────────────────────────────────────────
-- Links atoms back to the raw data they were extracted from (provenance chain)

CREATE TABLE IF NOT EXISTS market_atom_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atom_id TEXT NOT NULL,
  raw_data_id TEXT NOT NULL,
  extraction_method TEXT NOT NULL DEFAULT 'ai',     -- ai, manual, computation, rule
  extraction_model TEXT,                            -- e.g. claude-haiku-4-5-20251001
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (atom_id) REFERENCES market_atoms(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_data_id) REFERENCES market_data_raw(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_atom_sources_atom ON market_atom_sources(atom_id);
CREATE INDEX IF NOT EXISTS idx_market_atom_sources_raw ON market_atom_sources(raw_data_id);

-- ── Market Atom Tags ────────────────────────────────────────────────────────
-- Semantic tagging for filtering and grouping

CREATE TABLE IF NOT EXISTS market_atom_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atom_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (atom_id) REFERENCES market_atoms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_atom_tags_atom ON market_atom_tags(atom_id);
CREATE INDEX IF NOT EXISTS idx_market_atom_tags_tag ON market_atom_tags(tag);

-- ── Market Atom Relationships ───────────────────────────────────────────────
-- Supports, contradicts, extends relationships between atoms

CREATE TABLE IF NOT EXISTS market_atom_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_atom_id TEXT NOT NULL,
  target_atom_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,                  -- supports, contradicts, extends, supersedes, caused_by
  strength REAL NOT NULL DEFAULT 0.5,               -- 0.0 to 1.0
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source_atom_id) REFERENCES market_atoms(id) ON DELETE CASCADE,
  FOREIGN KEY (target_atom_id) REFERENCES market_atoms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_atom_rel_source ON market_atom_relationships(source_atom_id);
CREATE INDEX IF NOT EXISTS idx_market_atom_rel_target ON market_atom_relationships(target_atom_id);
CREATE INDEX IF NOT EXISTS idx_market_atom_rel_type ON market_atom_relationships(relationship_type);

-- ── Market Watchlist ────────────────────────────────────────────────────────
-- User's watched symbols/entities for focused monitoring

CREATE TABLE IF NOT EXISTS market_watchlist (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'equity',        -- equity, etf, index, commodity, fx, crypto
  notes TEXT,
  alert_config TEXT DEFAULT '{}',                   -- JSON: price thresholds, news triggers
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_market_watchlist_symbol ON market_watchlist(symbol);
CREATE INDEX IF NOT EXISTS idx_market_watchlist_active ON market_watchlist(is_active);

-- ── Market Computation Log ──────────────────────────────────────────────────
-- Audit trail for every Python computation template execution

CREATE TABLE IF NOT EXISTS market_computation_log (
  id TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,                      -- e.g. portfolio_nav, volatility_basic
  input_params TEXT NOT NULL DEFAULT '{}',           -- JSON: inputs passed to the template
  output_data TEXT,                                  -- JSON: results returned
  status TEXT NOT NULL DEFAULT 'running',            -- running, success, error, timeout
  error_message TEXT,
  execution_time_ms INTEGER,
  triggered_by TEXT DEFAULT 'manual',                -- manual, scheduled, workflow
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_market_computation_log_template ON market_computation_log(template_name);
CREATE INDEX IF NOT EXISTS idx_market_computation_log_status ON market_computation_log(status);
CREATE INDEX IF NOT EXISTS idx_market_computation_log_created ON market_computation_log(created_at DESC);
