-- Migration 023: ANTON Orchestrator Reasoning Trails
-- Adds structured reasoning trail tables for full audit visibility.
-- Every heartbeat cycle / approval / execution creates a trail row.
-- Individual reasoning steps are stored as ordered entries.

CREATE TABLE IF NOT EXISTS orchestrator_reasoning_trails (
  id TEXT PRIMARY KEY,

  -- Source linkage (one of these will be set)
  heartbeat_id TEXT,                 -- References orchestrator_heartbeats.id
  briefing_id  TEXT,                 -- References orchestrator_briefings.id (if briefing generated)
  proposal_id  TEXT,                 -- References orchestrator_proposals.id (if approval/rejection)
  execution_id TEXT,                 -- References orchestrator_executions.id (Phase 2+)

  trigger_type TEXT NOT NULL DEFAULT 'heartbeat'
    CHECK(trigger_type IN ('heartbeat','on_demand','approval','rejection','auto_execution','chain')),

  -- Transparency level at time of trail creation (controls UI display, never capture)
  transparency_level INTEGER NOT NULL DEFAULT 1,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK(status IN ('in_progress','completed','failed','abandoned')),

  narrative_summary TEXT,            -- Plain-language summary (Sonnet generated post-completion)
  total_entries INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,

  -- Workspace file (markdown export)
  workspace_file_path TEXT,

  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS orchestrator_reasoning_entries (
  id TEXT PRIMARY KEY,
  trail_id TEXT NOT NULL REFERENCES orchestrator_reasoning_trails(id) ON DELETE CASCADE,

  entry_type TEXT NOT NULL CHECK(entry_type IN (
    'signal_detection','signal_assessment','context_gathering',
    'proposal_reasoning','module_selection','input_configuration',
    'execution_decision','quality_assessment','chain_reasoning',
    'escalation_reasoning','pattern_recognition','pdp_alignment',
    'completion_summary'
  )),

  sequence_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,           -- Main reasoning content
  thinking_content TEXT,           -- Extended thinking tokens (Level 2 only)
  confidence REAL,                 -- 0.0–1.0 where applicable
  duration_ms INTEGER,
  metadata TEXT,                   -- JSON blob for entry-specific data

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orch_trails_heartbeat  ON orchestrator_reasoning_trails(heartbeat_id);
CREATE INDEX IF NOT EXISTS idx_orch_trails_briefing   ON orchestrator_reasoning_trails(briefing_id);
CREATE INDEX IF NOT EXISTS idx_orch_trails_proposal   ON orchestrator_reasoning_trails(proposal_id);
CREATE INDEX IF NOT EXISTS idx_orch_trails_created    ON orchestrator_reasoning_trails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_entries_trail     ON orchestrator_reasoning_entries(trail_id, sequence_number);
