-- Migration 025: Orchestrator Meta-Learning + Stage Demotion tracking

-- Meta-learning table: ANTON learns from human feedback over time
CREATE TABLE IF NOT EXISTS orchestrator_meta_learning (
  id TEXT PRIMARY KEY,
  learning_type TEXT NOT NULL,         -- 'proposal_feedback', 'execution_outcome', 'pattern_validation', 'quality_correlation'
  source_id TEXT NOT NULL,             -- proposal_id, execution_id, pattern_id etc.
  signal_context TEXT,                 -- JSON: signals that led to this event
  human_decision TEXT,                 -- 'approved', 'rejected', 'modified', 'good_catch', 'wrong' etc.
  outcome TEXT,                        -- 'success', 'failure', 'partial' (for executions)
  quality_score REAL,                  -- Post-execution quality score if available
  lesson TEXT,                         -- Human-readable learning extracted from this event
  applied INTEGER DEFAULT 0,           -- Has this learning been applied to future proposals?
  created_at TEXT DEFAULT (datetime('now'))
);

-- Stage demotion history
CREATE TABLE IF NOT EXISTS orchestrator_stage_demotions (
  id TEXT PRIMARY KEY,
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  reason TEXT NOT NULL,                -- Why demotion was triggered
  trigger_type TEXT NOT NULL,          -- 'auto_quality', 'admin_override', 'proposal_rejection_rate'
  triggered_by TEXT DEFAULT 'system',
  demoted_at TEXT DEFAULT (datetime('now'))
);

-- Workflow chain records (Phase 4: intelligent chaining)
CREATE TABLE IF NOT EXISTS orchestrator_workflow_chains (
  id TEXT PRIMARY KEY,
  trigger_execution_id TEXT NOT NULL,   -- Execution that triggered the chain
  chained_workflow_id TEXT NOT NULL,
  chain_depth INTEGER DEFAULT 1,
  chain_reason TEXT,                    -- Why this workflow was chained
  status TEXT DEFAULT 'pending',        -- pending, running, completed, failed, cancelled
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meta_learning_type ON orchestrator_meta_learning(learning_type);
CREATE INDEX IF NOT EXISTS idx_meta_learning_source ON orchestrator_meta_learning(source_id);
CREATE INDEX IF NOT EXISTS idx_chain_trigger ON orchestrator_workflow_chains(trigger_execution_id);
