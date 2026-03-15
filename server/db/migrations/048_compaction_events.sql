-- Migration 048: Context compaction audit trail
-- Tracks when automatic context compaction occurs during long sessions.
-- Supports the compact-2026-01-12 beta for Opus 4.6 and Sonnet 4.6.

CREATE TABLE IF NOT EXISTS compaction_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  compaction_number INTEGER NOT NULL,           -- 1st, 2nd, 3rd compaction in this session
  model_id TEXT NOT NULL,
  trigger_threshold INTEGER NOT NULL,           -- Token threshold that triggered compaction
  input_tokens_at_trigger INTEGER,              -- Tokens when compaction fired
  tokens_after_compaction INTEGER,              -- Tokens in the compacted summary
  tokens_saved INTEGER,                         -- input_tokens_at_trigger - tokens_after_compaction
  estimated_cost_saved_usd REAL,                -- Cost savings from reduced context
  session_type TEXT DEFAULT 'interactive',       -- interactive, orchestrator, workflow, etc.
  summary_preview TEXT,                         -- First 500 chars of compaction summary (for audit)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compaction_events_session ON compaction_events(session_id);
CREATE INDEX IF NOT EXISTS idx_compaction_events_created ON compaction_events(created_at);
