-- Migration 041: World-building lore ledger (LONE-09)
-- Per-session JSON ledger for fiction/creative writing consistency

CREATE TABLE IF NOT EXISTS lore_ledger_entries (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  session_id   TEXT,                           -- optional: link to a session
  project_id   TEXT,                           -- optional: named lore project
  entry_type   TEXT NOT NULL DEFAULT 'character', -- 'character'|'location'|'faction'|'event'|'item'|'world_rule'
  name         TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',        -- 1-3 sentence description
  properties   TEXT NOT NULL DEFAULT '{}',      -- JSON object — free-form key/value facts
  tags         TEXT NOT NULL DEFAULT '[]',      -- JSON string array
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lore_user       ON lore_ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_lore_project    ON lore_ledger_entries(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_lore_session    ON lore_ledger_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_lore_type       ON lore_ledger_entries(user_id, entry_type);
