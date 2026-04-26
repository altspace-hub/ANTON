-- 190_coding_quality_snapshots.sql — repo-level quality snapshots over
-- time + per-language breakdowns for the Coding area.
--
-- Lets the Coding area show "is this codebase getting healthier or
-- worse?" over weeks/months. A snapshot captures findings counts +
-- rough metrics (LOC, file count, test coverage if available).

CREATE TABLE IF NOT EXISTS coding_quality_snapshots (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL DEFAULT 'default',
  repo_uri            TEXT NOT NULL,
  taken_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  trigger             TEXT NOT NULL DEFAULT 'manual',  -- 'manual' / 'session_close' / 'scheduled' / 'pre_release'
  total_files         INTEGER,
  total_loc           INTEGER,
  primary_language    TEXT,
  languages           JSONB DEFAULT '{}',              -- { "typescript": 12000, "sql": 1500, ... }
  test_count          INTEGER,
  test_coverage_pct   NUMERIC,                         -- null when not measurable
  findings_critical   INTEGER DEFAULT 0,
  findings_high       INTEGER DEFAULT 0,
  findings_medium     INTEGER DEFAULT 0,
  findings_low        INTEGER DEFAULT 0,
  findings_info       INTEGER DEFAULT 0,
  notes               TEXT,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS coding_quality_snapshots_user_repo_idx
  ON coding_quality_snapshots(user_id, repo_uri, taken_at DESC);

CREATE INDEX IF NOT EXISTS coding_quality_snapshots_trigger_idx
  ON coding_quality_snapshots(trigger, taken_at DESC);

-- Per-snapshot per-language breakdown — lets us answer "which language
-- has the most outstanding criticals" without scanning findings each time.

CREATE TABLE IF NOT EXISTS coding_quality_snapshot_breakdown (
  id                  TEXT PRIMARY KEY,
  snapshot_id         TEXT NOT NULL,
  language            TEXT NOT NULL,
  loc                 INTEGER NOT NULL,
  file_count          INTEGER NOT NULL,
  findings_critical   INTEGER DEFAULT 0,
  findings_high       INTEGER DEFAULT 0,
  findings_medium     INTEGER DEFAULT 0,
  findings_low        INTEGER DEFAULT 0,
  findings_info       INTEGER DEFAULT 0,
  test_count          INTEGER,
  test_coverage_pct   NUMERIC
);

CREATE INDEX IF NOT EXISTS coding_quality_snapshot_breakdown_snapshot_idx
  ON coding_quality_snapshot_breakdown(snapshot_id);

CREATE INDEX IF NOT EXISTS coding_quality_snapshot_breakdown_language_idx
  ON coding_quality_snapshot_breakdown(language);
