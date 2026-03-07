-- Migration 024: Orchestrator Demo Mode + Pattern Recognition tables

-- Add demo_state column to orchestrator_config
ALTER TABLE orchestrator_config ADD COLUMN IF NOT EXISTS demo_state TEXT;

-- Pattern recognition table (Phase 3)
CREATE TABLE IF NOT EXISTS orchestrator_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,          -- 'workflow_recurrence', 'quality_drop', 'signal_cluster'
  name TEXT NOT NULL,
  description TEXT,
  detection_criteria TEXT NOT NULL,    -- JSON: conditions that trigger recognition
  suggested_action TEXT,               -- What ANTON proposes when pattern fires
  confidence_threshold REAL DEFAULT 0.7,
  auto_execute INTEGER DEFAULT 0,      -- 0=propose only, 1=auto-execute (Stage 3+)
  executions_count INTEGER DEFAULT 0,
  last_detected_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Pattern detection log
CREATE TABLE IF NOT EXISTS orchestrator_pattern_detections (
  id TEXT PRIMARY KEY,
  pattern_id TEXT NOT NULL REFERENCES orchestrator_patterns(id),
  detected_at TEXT DEFAULT (datetime('now')),
  signal_data TEXT,                    -- JSON: signals that triggered this detection
  proposal_id TEXT,                    -- Resulting proposal, if any
  auto_executed INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pattern_detections_pattern ON orchestrator_pattern_detections(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_detections_at ON orchestrator_pattern_detections(detected_at);
