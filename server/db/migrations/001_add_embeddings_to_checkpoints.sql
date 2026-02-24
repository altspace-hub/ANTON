-- Migration 001: Add embeddings and feedback to checkpoint_decisions
-- Purpose: Enable semantic similarity search and user feedback for Institutional Memory

-- The existing checkpoint_decisions table has workflow-specific columns:
-- (execution_id, workflow_id, step_index, ai_recommendation, ai_confidence, human_decision, human_reasoning, etc.)
-- We'll add embedding and feedback columns to this existing structure

PRAGMA foreign_keys=OFF;

-- Create new table with all existing columns + new ones
CREATE TABLE IF NOT EXISTS checkpoint_decisions_new (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  ai_recommendation TEXT,
  ai_confidence REAL,
  human_decision TEXT NOT NULL,
  human_reasoning TEXT,
  is_override INTEGER DEFAULT 0,
  override_category TEXT,
  context_snapshot JSON,
  decided_by TEXT NOT NULL,
  decided_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- New columns for Institutional Memory enhancements
  embedding TEXT DEFAULT NULL,
  user_feedback INTEGER DEFAULT NULL CHECK(user_feedback IN (NULL, -1, 1)),
  feedback_at TEXT DEFAULT NULL,
  cluster_id TEXT DEFAULT NULL,
  cluster_name TEXT DEFAULT NULL
);

-- Copy all existing data
INSERT INTO checkpoint_decisions_new
  (id, execution_id, workflow_id, step_index, ai_recommendation, ai_confidence,
   human_decision, human_reasoning, is_override, override_category, context_snapshot,
   decided_by, decided_at)
SELECT id, execution_id, workflow_id, step_index, ai_recommendation, ai_confidence,
       human_decision, human_reasoning, is_override, override_category, context_snapshot,
       decided_by, decided_at
FROM checkpoint_decisions;

-- Drop old table
DROP TABLE checkpoint_decisions;

-- Rename new table
ALTER TABLE checkpoint_decisions_new RENAME TO checkpoint_decisions;

PRAGMA foreign_keys=ON;

-- Create new indexes for enhanced queries
CREATE INDEX IF NOT EXISTS idx_checkpoint_workflow_step ON checkpoint_decisions(workflow_id, step_index);
CREATE INDEX IF NOT EXISTS idx_checkpoint_decided_at ON checkpoint_decisions(decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkpoint_decided_by ON checkpoint_decisions(decided_by);

-- Table for storing decision clusters (groups of similar decisions)
CREATE TABLE IF NOT EXISTS decision_clusters (
  id TEXT PRIMARY KEY,
  cluster_name TEXT NOT NULL,
  workflow_id TEXT,
  representative_decision TEXT NOT NULL,
  decision_count INTEGER DEFAULT 0,
  avg_confidence REAL DEFAULT 0.0,
  positive_feedback_count INTEGER DEFAULT 0,
  negative_feedback_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cluster_workflow ON decision_clusters(workflow_id);
CREATE INDEX IF NOT EXISTS idx_cluster_updated ON decision_clusters(updated_at DESC);
