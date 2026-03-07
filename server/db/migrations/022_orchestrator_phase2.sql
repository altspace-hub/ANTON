-- Migration 022: ANTON Orchestrator Phase 2 — Proposal Manager
-- Adds orchestrator_executions table linking proposals to workflow_runs.

CREATE TABLE IF NOT EXISTS orchestrator_executions (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES orchestrator_proposals(id),
  workflow_run_id TEXT,               -- References workflow_runs.id (may not exist in all deploys)
  org_id TEXT,

  initiated_by TEXT NOT NULL DEFAULT 'human_approved'
    CHECK(initiated_by IN ('human_approved','auto_executed')),
  initiated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Outcome
  outcome TEXT CHECK(outcome IN ('success','partial','failed','escalated','cancelled')),
  completed_at TEXT,
  quality_assessment TEXT,           -- JSON: 6-dim quality scores from Quality Ratchet

  -- Chain tracking (Phase 4)
  chain_triggered INTEGER NOT NULL DEFAULT 0,
  chained_from_execution_id TEXT REFERENCES orchestrator_executions(id),
  chained_to_execution_id TEXT REFERENCES orchestrator_executions(id),

  -- Human assessment
  human_satisfaction TEXT
    CHECK(human_satisfaction IN ('excellent','satisfactory','needs_improvement','unsatisfactory')),
  human_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_orch_executions_proposal ON orchestrator_executions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_orch_executions_initiated ON orchestrator_executions(initiated_at DESC);
