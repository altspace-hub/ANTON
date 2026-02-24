-- Migration 002: Pattern Scheduler Tables
-- Adds tables for pattern detection scheduler and run history

-- Pattern scheduler configuration (singleton table)
CREATE TABLE IF NOT EXISTS pattern_scheduler_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton: only one row allowed
  enabled INTEGER DEFAULT 1, -- 1 = enabled, 0 = disabled
  cron_expression TEXT NOT NULL DEFAULT '0 */6 * * *', -- Default: every 6 hours
  detector_types TEXT, -- JSON array of detector types to run (null = all)
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default configuration
INSERT OR IGNORE INTO pattern_scheduler_config (id, enabled, cron_expression)
VALUES (1, 1, '0 */6 * * *');

-- Pattern detection run history
CREATE TABLE IF NOT EXISTS pattern_detection_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_time TEXT NOT NULL,
  patterns_detected INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_message TEXT,
  is_manual INTEGER DEFAULT 0, -- 1 = manual run, 0 = scheduled run
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for efficient history queries
CREATE INDEX IF NOT EXISTS idx_detection_runs_time ON pattern_detection_runs(run_time DESC);
CREATE INDEX IF NOT EXISTS idx_detection_runs_status ON pattern_detection_runs(status);
