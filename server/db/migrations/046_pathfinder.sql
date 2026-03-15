-- Migration 046: Pathfinder — AI-Powered Multi-Model Search
-- Council-of-models search with synthesis, threads, documents, and suggestions

-- ── Table 1: pathfinder_searches ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathfinder_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  thread_id TEXT,
  query TEXT NOT NULL,
  depth TEXT NOT NULL DEFAULT 'quick',  -- 'quick' | 'thorough' | 'deep'
  synthesis TEXT,
  thinking TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'searching' | 'synthesizing' | 'complete' | 'error'
  error_message TEXT,
  model_results TEXT,  -- JSON array of per-model results
  web_sources TEXT,    -- JSON array of deduplicated web sources
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  document_ids TEXT,   -- JSON array of document IDs used as context
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pathfinder_searches_user
  ON pathfinder_searches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pathfinder_searches_thread
  ON pathfinder_searches(thread_id);

-- ── Table 2: pathfinder_sources ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathfinder_sources (
  id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL,
  url TEXT,
  title TEXT,
  snippet TEXT,
  source_type TEXT NOT NULL DEFAULT 'web',  -- 'web' | 'local' | 'knowledge' | 'regulatory'
  model_id TEXT,
  relevance_score REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (search_id) REFERENCES pathfinder_searches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pathfinder_sources_search
  ON pathfinder_sources(search_id);

-- ── Table 3: pathfinder_threads ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathfinder_threads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  title TEXT NOT NULL DEFAULT 'New Thread',
  pinned INTEGER DEFAULT 0,
  document_ids TEXT,  -- JSON array of document IDs attached to thread
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pathfinder_threads_user
  ON pathfinder_threads(user_id, updated_at DESC);

-- ── Table 4: pathfinder_documents ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathfinder_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  thread_id TEXT,
  filename TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER DEFAULT 0,
  mime_type TEXT,
  extracted_text TEXT,
  word_count INTEGER DEFAULT 0,
  token_estimate INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES pathfinder_threads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pathfinder_documents_thread
  ON pathfinder_documents(thread_id);

-- ── Table 5: pathfinder_followups ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathfinder_followups (
  id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  thinking TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (search_id) REFERENCES pathfinder_searches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pathfinder_followups_search
  ON pathfinder_followups(search_id);

-- ── Table 6: pathfinder_suggestions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathfinder_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'solo',
  query TEXT NOT NULL,
  context TEXT,
  dismissed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pathfinder_suggestions_user
  ON pathfinder_suggestions(user_id, dismissed, expires_at);
