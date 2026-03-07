-- ============================================================================
-- Migration 030: Compliance & AI Governance Audit Tables
-- GOV-01: system_prompts — versioned, immutable record of every system prompt
-- GOV-03: session_snapshots — full config snapshot at session completion
-- GOV-05: prompt_audit — every PromptEditor change logged
-- ============================================================================

-- ── system_prompts — versioned prompt registry (GOV-01) ────────────────────
-- Every time a module's system prompt is saved/changed, a new version is
-- inserted. The active version is the one with deprecated_at IS NULL.
-- Prompt text is stored as-is; hash allows dedup and tamper detection.

CREATE TABLE IF NOT EXISTS system_prompts (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  module_id    TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,          -- SHA-256 hex of content
  author       TEXT NOT NULL DEFAULT 'system',
  effective_date TEXT NOT NULL DEFAULT (date('now')),
  deprecated_at  TEXT,                 -- NULL = currently active
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_prompts_active
  ON system_prompts(module_id, version);
CREATE INDEX IF NOT EXISTS idx_system_prompts_module
  ON system_prompts(module_id, deprecated_at);

-- ── session_snapshots — immutable config record at session completion (GOV-03)
-- Written once when a session is closed/exported. Never updated.
-- Allows retrospective audit of exactly what config produced each output.

CREATE TABLE IF NOT EXISTS session_snapshots (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  module_id      TEXT,
  model_id       TEXT NOT NULL,
  thinking_level TEXT,
  creativity     TEXT,
  output_formats TEXT DEFAULT '[]',   -- JSON array of selected format IDs
  knowledge_config TEXT DEFAULT '{}', -- JSON: knowledgeSources config
  system_prompt_hash TEXT,            -- hash of the system prompt used
  system_prompt_version_id TEXT REFERENCES system_prompts(id),
  token_input    INTEGER,
  token_output   INTEGER,
  snapshotted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id)                  -- one snapshot per session
);

CREATE INDEX IF NOT EXISTS idx_session_snapshots_session
  ON session_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_session_snapshots_module
  ON session_snapshots(module_id, snapshotted_at DESC);

-- ── prompt_audit — every PromptEditor change (GOV-05) ─────────────────────
-- Records before/after for every manual edit to a module's system prompt.
-- Combined with system_prompts versioning, provides full change history.

CREATE TABLE IF NOT EXISTS prompt_audit (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  module_id       TEXT NOT NULL,
  session_id      TEXT,               -- session in which the edit was made (if any)
  original_hash   TEXT NOT NULL,
  edited_hash     TEXT NOT NULL,
  original_length INTEGER,
  edited_length   INTEGER,
  edited_by       TEXT NOT NULL DEFAULT 'user',
  edited_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_audit_module
  ON prompt_audit(module_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_audit_session
  ON prompt_audit(session_id);
