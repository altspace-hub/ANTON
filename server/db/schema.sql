-- FCP Workbench Database Schema

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  thinking_content TEXT,
  content_blocks TEXT,
  token_count INTEGER,
  cost REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registered_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  last_indexed TEXT
);

CREATE TABLE IF NOT EXISTS module_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(module_id, name)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_module ON sessions(module_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

-- Phase 2 tables

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0.0',
  author TEXT DEFAULT 'openEXPERT',
  category TEXT,
  prompt TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  review_mode TEXT NOT NULL,
  overall_rating TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Safe migrations (ignored if column already exists)
-- SQLite doesn't support IF NOT EXISTS on ALTER TABLE so we use a try-catch in init

CREATE INDEX IF NOT EXISTS idx_reviews_session ON reviews(session_id);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT,
  role TEXT,
  company TEXT,
  industry TEXT,
  expertise TEXT,
  experience_level TEXT,
  communication_preferences TEXT,
  team_context TEXT,
  current_focus TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Puzzle',
  area TEXT DEFAULT 'custom',
  system_prompt TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_modules_area ON custom_modules(area);

-- Community skills table (D1)
CREATE TABLE IF NOT EXISTS community_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  prompt_instruction TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Security audit tables (2.8)

-- Login attempts tracking (A07: Authentication Failures)
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  ip_address TEXT,
  success INTEGER NOT NULL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempted_at DESC);

-- Security events log (A09: Logging and Monitoring)
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK(event_type IN ('failed_login', 'unauthorized_access', 'budget_exceeded', 'rate_limit', 'suspicious_activity', 'invalid_input', 'ssrf_attempt')),
  user_id TEXT,
  ip_address TEXT,
  details TEXT,
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('low', 'medium', 'high', 'critical')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);

-- Dataset persistence system (Option D enhancement)
-- Stores transformed/imported datasets for reuse across workflows
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Schema & statistics
  schema TEXT NOT NULL,              -- JSON: Column[] from data-transformer
  row_count INTEGER NOT NULL,
  size_bytes INTEGER,

  -- Origin tracking
  created_by TEXT NOT NULL,
  session_id TEXT,                   -- NULL = global dataset, set = session-scoped
  workflow_id TEXT,
  source_type TEXT,                  -- 'import', 'transform', 'merge'

  -- Lifecycle management
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,                   -- NULL = no expiration, or TTL date
  last_accessed_at TEXT,
  access_count INTEGER DEFAULT 0,

  -- Storage location
  storage_type TEXT DEFAULT 'sqlite',     -- 'sqlite' | 'file' | 's3' (future)
  storage_path TEXT NOT NULL,             -- SQLite table name or file path

  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_datasets_session ON datasets(session_id);
CREATE INDEX IF NOT EXISTS idx_datasets_expires ON datasets(expires_at);
CREATE INDEX IF NOT EXISTS idx_datasets_created_by ON datasets(created_by);
CREATE INDEX IF NOT EXISTS idx_datasets_name ON datasets(name);

-- ── Counsel's Desk: legal research sessions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_research_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'deep-dive',
  expert_role TEXT DEFAULT 'eu-regulatory-lawyer',
  research_questions TEXT DEFAULT '[]',
  pinned_findings TEXT DEFAULT '[]',
  citations TEXT DEFAULT '[]',
  active_knowledge_packs TEXT DEFAULT '[]',
  user_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_legal_sessions_user ON legal_research_sessions(user_id, updated_at DESC);

-- ── Compliance Gap Assessor: assessment sessions ──────────────────────────────
CREATE TABLE IF NOT EXISTS gap_assessments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  frameworks TEXT NOT NULL DEFAULT '[]',
  scope_config TEXT NOT NULL DEFAULT '{}',
  context_config TEXT NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','assessing','scoring','synthesising','complete','paused')),
  current_step INTEGER DEFAULT 1,
  article_scores TEXT DEFAULT '{}',
  capability_view TEXT,
  board_summary TEXT,
  roadmap TEXT,
  session_id TEXT,
  user_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gap_assessments_user ON gap_assessments(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gap_assessments_status ON gap_assessments(status);

-- ── Compliance Gap Assessor: per-article findings ────────────────────────────
CREATE TABLE IF NOT EXISTS gap_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id TEXT NOT NULL REFERENCES gap_assessments(id) ON DELETE CASCADE,
  framework TEXT NOT NULL,
  article_id TEXT NOT NULL,
  article_title TEXT,
  requirement TEXT,
  current_state TEXT,
  score TEXT CHECK(score IN ('red','amber','yellow','green')),
  numeric_score INTEGER DEFAULT 0,
  priority TEXT CHECK(priority IN ('critical','high','medium','low')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gap_findings_assessment ON gap_findings(assessment_id);
CREATE INDEX IF NOT EXISTS idx_gap_findings_framework ON gap_findings(assessment_id, framework);
