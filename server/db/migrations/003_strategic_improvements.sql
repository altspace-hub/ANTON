-- ============================================================================
-- Migration 003: Strategic Improvements + Event-Driven Workflow Triggers
-- ANTON Strategic Improvements Spec + Event-Driven Workflow Triggers Spec
-- ============================================================================

-- ── IMPROVEMENT 1: SESSION RESUME ─────────────────────────────────────────────
-- Snapshot of session state for rich resume (not just message history)

CREATE TABLE IF NOT EXISTS session_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('auto', 'manual', 'pause', 'checkpoint')),
  title TEXT,
  summary TEXT NOT NULL,
  key_decisions TEXT DEFAULT '[]',
  open_questions TEXT DEFAULT '[]',
  next_steps TEXT DEFAULT '[]',
  context_state TEXT DEFAULT '{}',
  token_count INTEGER DEFAULT 0,
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_session_snapshots_session ON session_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_session_snapshots_type ON session_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_session_snapshots_created ON session_snapshots(created_at DESC);

-- ── IMPROVEMENT 3: PROACTIVE INTELLIGENCE ─────────────────────────────────────
-- Surfaced insights generated from cross-session pattern analysis

CREATE TABLE IF NOT EXISTS proactive_insights (
  id TEXT PRIMARY KEY,
  insight_type TEXT NOT NULL CHECK(insight_type IN ('pattern', 'gap', 'conflict', 'opportunity', 'risk', 'trend')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK(severity IN ('info', 'low', 'medium', 'high', 'critical')),
  source_session_ids TEXT DEFAULT '[]',
  source_atom_ids TEXT DEFAULT '[]',
  area_id TEXT,
  module_id TEXT,
  user_id TEXT DEFAULT 'default',
  dismissed INTEGER DEFAULT 0,
  dismissed_at TEXT,
  read INTEGER DEFAULT 0,
  read_at TEXT,
  action_taken TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_proactive_insights_user ON proactive_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_insights_type ON proactive_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_proactive_insights_severity ON proactive_insights(severity);
CREATE INDEX IF NOT EXISTS idx_proactive_insights_dismissed ON proactive_insights(dismissed);

-- ── IMPROVEMENT 4: ORGANISATIONAL CONTEXT LAYER ───────────────────────────────
-- Persistent organisational context injected into every prompt (layer 2a)

CREATE TABLE IF NOT EXISTS org_context (
  id TEXT PRIMARY KEY DEFAULT 'default',
  org_name TEXT,
  org_type TEXT,
  jurisdiction TEXT,
  regulatory_perimeter TEXT DEFAULT '[]',
  risk_appetite TEXT,
  key_systems TEXT DEFAULT '[]',
  key_relationships TEXT DEFAULT '[]',
  current_priorities TEXT DEFAULT '[]',
  regulatory_calendar TEXT DEFAULT '[]',
  preferred_language TEXT DEFAULT 'en',
  custom_context TEXT,
  user_id TEXT DEFAULT 'default',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS org_context_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_context_id TEXT NOT NULL REFERENCES org_context(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_org_context_history_ctx ON org_context_history(org_context_id);

-- ── IMPROVEMENT 5: ORGANISATIONAL CONTINUITY ──────────────────────────────────
-- Key-person risk: maintain continuity context across staff changes

CREATE TABLE IF NOT EXISTS continuity_profiles (
  id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL,
  role TEXT NOT NULL,
  area_ids TEXT DEFAULT '[]',
  expertise_summary TEXT,
  active_projects TEXT DEFAULT '[]',
  key_decisions TEXT DEFAULT '[]',
  critical_knowledge TEXT,
  handover_notes TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'transitioning', 'archived')),
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_continuity_profiles_user ON continuity_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_continuity_profiles_status ON continuity_profiles(status);

-- ── EVENT-DRIVEN WORKFLOW TRIGGERS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_triggers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('webhook', 'git_push', 'slack_event', 'teams_event', 'mcp_event', 'internal')),
  workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  endpoint_path TEXT NOT NULL UNIQUE,
  auth_config TEXT NOT NULL DEFAULT '{}',
  filter_config TEXT DEFAULT '{}',
  payload_mapping TEXT DEFAULT '{}',
  rate_limit_max INTEGER DEFAULT 60,
  rate_limit_window_seconds INTEGER DEFAULT 60,
  cooldown_seconds INTEGER DEFAULT 300,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'error')),
  user_id TEXT DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_triggers_workflow ON webhook_triggers(workflow_id);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_status ON webhook_triggers(status);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_type ON webhook_triggers(trigger_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_triggers_endpoint ON webhook_triggers(endpoint_path);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL REFERENCES webhook_triggers(id) ON DELETE CASCADE,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL CHECK(status IN ('received', 'validated', 'filtered_out', 'rate_limited', 'deduplicated', 'triggered', 'failed')),
  payload TEXT,
  mapped_variables TEXT,
  dedup_signature TEXT,
  workflow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  error_message TEXT,
  processing_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_trigger ON webhook_events(trigger_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_dedup ON webhook_events(trigger_id, dedup_signature);
-- Covering index for rate-limit checks (trigger_id + status + received_at avoids post-filter scan)
CREATE INDEX IF NOT EXISTS idx_webhook_events_rate_limit ON webhook_events(trigger_id, status, received_at DESC);

CREATE TABLE IF NOT EXISTS webhook_trigger_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_id TEXT NOT NULL REFERENCES webhook_triggers(id) ON DELETE CASCADE,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  events_received INTEGER DEFAULT 0,
  events_triggered INTEGER DEFAULT 0,
  events_filtered INTEGER DEFAULT 0,
  events_rate_limited INTEGER DEFAULT 0,
  events_failed INTEGER DEFAULT 0,
  avg_processing_ms REAL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_webhook_metrics_trigger ON webhook_trigger_metrics(trigger_id, window_start DESC);
