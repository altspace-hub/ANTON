-- 043: Gap assessment iteration tracking
-- Allows users to re-run assessments with new evidence and compare progress across iterations

CREATE TABLE IF NOT EXISTS gap_iterations (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES gap_assessments(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'complete',
  context_snapshot TEXT NOT NULL DEFAULT '{}',
  evidence_summary TEXT,
  findings_snapshot TEXT NOT NULL DEFAULT '[]',
  capability_snapshot TEXT,
  board_snapshot TEXT,
  roadmap_snapshot TEXT,
  score_summary TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_gap_iterations_assessment ON gap_iterations(assessment_id, iteration_number);
