-- Migration 021: ANTON Orchestrator (Phase 1 — Observer Stage)
-- Adds the five core tables for the AI orchestration layer.

-- Orchestrator global configuration (singleton per org/user)
CREATE TABLE IF NOT EXISTS orchestrator_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  org_id TEXT,

  -- Heartbeat
  heartbeat_enabled INTEGER NOT NULL DEFAULT 1,
  heartbeat_interval_minutes INTEGER NOT NULL DEFAULT 30,
  briefing_schedule TEXT NOT NULL DEFAULT 'daily'
    CHECK(briefing_schedule IN ('manual','daily','weekly')),
  briefing_time TEXT NOT NULL DEFAULT '08:00',

  -- Thresholds
  radar_urgency_threshold REAL NOT NULL DEFAULT 0.7,
  quality_decline_threshold REAL NOT NULL DEFAULT 1.5,  -- points of decline to flag
  deadline_alert_days INTEGER NOT NULL DEFAULT 14,

  -- LLM model selection
  heartbeat_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  briefing_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  planning_model TEXT NOT NULL DEFAULT 'claude-opus-4-6',

  -- Kill switch
  orchestrator_paused INTEGER NOT NULL DEFAULT 0,
  paused_at TEXT,
  paused_by TEXT,
  fully_disabled INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO orchestrator_config (id) VALUES ('default');

-- Orchestrator stage tracking (Apprentice Model for the Orchestrator itself)
CREATE TABLE IF NOT EXISTS orchestrator_stage (
  id TEXT PRIMARY KEY DEFAULT 'default',
  org_id TEXT,
  current_stage INTEGER NOT NULL DEFAULT 1 CHECK(current_stage BETWEEN 1 AND 4),
  stage_entered_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Phase 1 metrics (Observer)
  total_briefings INTEGER NOT NULL DEFAULT 0,
  total_proposals INTEGER NOT NULL DEFAULT 0,
  proposals_rated INTEGER NOT NULL DEFAULT 0,
  proposals_good_or_relevant INTEGER NOT NULL DEFAULT 0,
  proposals_irrelevant_or_wrong INTEGER NOT NULL DEFAULT 0,

  -- Phase 2+ metrics (Proposal Manager)
  plans_approved INTEGER NOT NULL DEFAULT 0,
  plans_modified INTEGER NOT NULL DEFAULT 0,
  plans_rejected INTEGER NOT NULL DEFAULT 0,
  executions_completed INTEGER NOT NULL DEFAULT 0,
  executions_failed INTEGER NOT NULL DEFAULT 0,
  avg_quality_score REAL,

  -- Phase 3+ metrics (Supervised)
  auto_executions INTEGER NOT NULL DEFAULT 0,
  auto_overrides INTEGER NOT NULL DEFAULT 0,

  -- Audit trail
  stage_history TEXT NOT NULL DEFAULT '[]',  -- JSON [{stage,entered_at,exited_at,reason}]
  last_progression_check TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO orchestrator_stage (id) VALUES ('default');

-- Heartbeat run log
CREATE TABLE IF NOT EXISTS orchestrator_heartbeats (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  ran_at TEXT NOT NULL DEFAULT (datetime('now')),
  signals_checked INTEGER NOT NULL DEFAULT 0,
  signals_significant INTEGER NOT NULL DEFAULT 0,
  action_taken TEXT NOT NULL DEFAULT 'none'
    CHECK(action_taken IN ('none','briefing_generated','alert_sent')),
  duration_ms INTEGER,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK(status IN ('ok','error'))
);

CREATE INDEX IF NOT EXISTS idx_orch_heartbeats_ran_at ON orchestrator_heartbeats(ran_at DESC);

-- Orchestrator briefings (daily/weekly/on-demand reports)
CREATE TABLE IF NOT EXISTS orchestrator_briefings (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  user_id TEXT NOT NULL DEFAULT 'solo',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  period TEXT NOT NULL DEFAULT 'daily'
    CHECK(period IN ('heartbeat','daily','weekly','on_demand')),
  signals_read INTEGER NOT NULL DEFAULT 0,
  proposals_count INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,          -- Full markdown briefing
  signals_data TEXT NOT NULL DEFAULT '[]',  -- JSON: signal snapshot used
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK(status IN ('unread','read','actioned','dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_orch_briefings_created ON orchestrator_briefings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_briefings_status ON orchestrator_briefings(status, user_id);

-- Orchestrator proposals (one row per proposal within a briefing)
CREATE TABLE IF NOT EXISTS orchestrator_proposals (
  id TEXT PRIMARY KEY,
  briefing_id TEXT REFERENCES orchestrator_briefings(id) ON DELETE CASCADE,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Signal that generated this proposal
  signal_source TEXT NOT NULL
    CHECK(signal_source IN (
      'radar','deadline','quality','pattern','workflow','assignment',
      'compliance','apprentice','knowledge_graph','proactive'
    )),
  signal_id TEXT,          -- ID in the source table (e.g. radar_items.id)
  signal_summary TEXT NOT NULL,

  -- The proposal
  action_type TEXT NOT NULL
    CHECK(action_type IN (
      'workflow_trigger','workflow_chain','quality_intervention',
      'deadline_action','pattern_suggestion','maintenance'
    )),
  proposed_action TEXT NOT NULL,   -- Human-readable
  workflow_plan TEXT,              -- JSON (Phase 2+)
  confidence_score REAL NOT NULL DEFAULT 0.5 CHECK(confidence_score BETWEEN 0 AND 1),
  urgency_score REAL NOT NULL DEFAULT 0.5 CHECK(urgency_score BETWEEN 0 AND 1),
  rationale TEXT NOT NULL,
  estimated_effort TEXT,

  -- Human decision
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','approved','modified','rejected','auto_executed','expired')),
  human_rating TEXT
    CHECK(human_rating IN ('good_catch','relevant','low_priority','irrelevant','wrong')),
  human_feedback TEXT,
  decided_at TEXT,
  decided_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_orch_proposals_briefing ON orchestrator_proposals(briefing_id);
CREATE INDEX IF NOT EXISTS idx_orch_proposals_status ON orchestrator_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_proposals_source ON orchestrator_proposals(signal_source, created_at DESC);
