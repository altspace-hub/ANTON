-- 188_coding_session_history.sql — code-session history + per-step
-- audit log for the Coding area.
--
-- The Coding area drives multi-step engagements (discovery → architecture
-- → project → release) but the per-session activity hasn't had a proper
-- audit table — relying on engagement_history for everything. This adds
-- a coding-specific session register so coding sessions are first-class.

CREATE TABLE IF NOT EXISTS coding_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  engagement_id   TEXT,                            -- optional FK to engagements
  session_kind    TEXT NOT NULL,                   -- 'discovery' / 'architecture' / 'project' / 'release' / 'review' / 'fix'
  language        TEXT,                            -- 'typescript' / 'python' / 'go' / 'rust' / 'sql' / etc.
  repo_uri        TEXT,                            -- pointer to the repo (local path / git URL)
  branch          TEXT,
  started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at        TIMESTAMP,
  outcome         TEXT,                            -- 'completed' / 'paused' / 'abandoned' / 'review'
  summary_md      TEXT,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS coding_sessions_user_idx
  ON coding_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS coding_sessions_engagement_idx
  ON coding_sessions(engagement_id) WHERE engagement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS coding_sessions_kind_idx
  ON coding_sessions(session_kind, started_at DESC);

-- Per-step events within a coding session: file read, file write, diff
-- shown, test run, build run, error encountered, decision recorded.

CREATE TABLE IF NOT EXISTS coding_session_events (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  occurred_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  event_kind      TEXT NOT NULL,                   -- 'file_read' / 'file_write' / 'diff_shown' / 'test_run' / 'build_run' / 'error' / 'decision' / 'commit' / 'pr_created'
  target          TEXT,                            -- file path / test name / pr url / etc.
  payload         JSONB DEFAULT '{}',
  duration_ms     INTEGER
);

CREATE INDEX IF NOT EXISTS coding_session_events_session_idx
  ON coding_session_events(session_id, occurred_at);

CREATE INDEX IF NOT EXISTS coding_session_events_kind_idx
  ON coding_session_events(event_kind, occurred_at DESC);
