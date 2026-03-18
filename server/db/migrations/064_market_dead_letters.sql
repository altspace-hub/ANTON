CREATE TABLE IF NOT EXISTS market_workflow_dead_letters (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  error TEXT,
  input_data TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_market_dead_letters_run ON market_workflow_dead_letters(run_id);
CREATE INDEX IF NOT EXISTS idx_market_dead_letters_created ON market_workflow_dead_letters(created_at);
