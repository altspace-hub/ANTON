-- Migration 023b: Orchestrator reasoning trail enrichment
-- Adds missing spec fields to reasoning_entries and Stage 2 metric columns.

-- Add missing spec fields to orchestrator_reasoning_entries
ALTER TABLE orchestrator_reasoning_entries ADD COLUMN IF NOT EXISTS evidence TEXT DEFAULT '{}';
ALTER TABLE orchestrator_reasoning_entries ADD COLUMN IF NOT EXISTS model_used TEXT;
ALTER TABLE orchestrator_reasoning_entries ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE orchestrator_reasoning_entries ADD COLUMN IF NOT EXISTS cost_usd REAL;
ALTER TABLE orchestrator_reasoning_entries ADD COLUMN IF NOT EXISTS proposal_id TEXT;
ALTER TABLE orchestrator_reasoning_entries ADD COLUMN IF NOT EXISTS execution_id TEXT;

-- Add cost tracking to orchestrator_reasoning_trails
ALTER TABLE orchestrator_reasoning_trails ADD COLUMN IF NOT EXISTS total_reasoning_tokens INTEGER DEFAULT 0;
ALTER TABLE orchestrator_reasoning_trails ADD COLUMN IF NOT EXISTS total_reasoning_cost_usd REAL DEFAULT 0;
ALTER TABLE orchestrator_reasoning_trails ADD COLUMN IF NOT EXISTS proposal_ids TEXT DEFAULT '[]';
ALTER TABLE orchestrator_reasoning_trails ADD COLUMN IF NOT EXISTS execution_ids TEXT DEFAULT '[]';

-- Add workflow_plan storage to orchestrator_proposals
ALTER TABLE orchestrator_proposals ADD COLUMN IF NOT EXISTS workflow_plan TEXT;

-- Add Stage 2+ metric columns to orchestrator_stage
ALTER TABLE orchestrator_stage ADD COLUMN IF NOT EXISTS plans_approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orchestrator_stage ADD COLUMN IF NOT EXISTS plans_modified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orchestrator_stage ADD COLUMN IF NOT EXISTS plans_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orchestrator_stage ADD COLUMN IF NOT EXISTS executions_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orchestrator_stage ADD COLUMN IF NOT EXISTS executions_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orchestrator_stage ADD COLUMN IF NOT EXISTS avg_quality_score REAL;
ALTER TABLE orchestrator_stage ADD COLUMN IF NOT EXISTS auto_executions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orchestrator_stage ADD COLUMN IF NOT EXISTS auto_overrides INTEGER NOT NULL DEFAULT 0;

-- Add indexes for common trail entry queries
CREATE INDEX IF NOT EXISTS idx_orch_entries_proposal  ON orchestrator_reasoning_entries(proposal_id);
CREATE INDEX IF NOT EXISTS idx_orch_entries_execution ON orchestrator_reasoning_entries(execution_id);
CREATE INDEX IF NOT EXISTS idx_orch_entries_type      ON orchestrator_reasoning_entries(entry_type);
