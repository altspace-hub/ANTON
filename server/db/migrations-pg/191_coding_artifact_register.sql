-- 191_coding_artifact_register.sql — generated artifact register +
-- artifact-to-session lineage for the Coding area.
--
-- A coding session generates artefacts: PRs, commits, individual files
-- written, scripts emitted. Without a register these get lost — the user
-- can't easily answer "what did I produce in last week's sessions?"

CREATE TABLE IF NOT EXISTS coding_artifacts (
  id              TEXT PRIMARY KEY,
  session_id      TEXT,
  user_id         TEXT NOT NULL DEFAULT 'default',
  artifact_kind   TEXT NOT NULL,                    -- 'file' / 'commit' / 'pr' / 'branch' / 'script' / 'patch' / 'docker_image' / 'release'
  uri             TEXT NOT NULL,                    -- file path / git ref / pr url / etc.
  display_name    TEXT,
  language        TEXT,
  size_bytes      INTEGER,
  generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  generated_by    TEXT NOT NULL DEFAULT 'ai',       -- 'ai' / 'user' / 'mixed'
  ai_model        TEXT,
  description_md  TEXT,
  status          TEXT NOT NULL DEFAULT 'active',   -- 'active' / 'superseded' / 'reverted' / 'merged' / 'closed'
  superseded_by   TEXT,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS coding_artifacts_user_idx
  ON coding_artifacts(user_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS coding_artifacts_session_idx
  ON coding_artifacts(session_id) WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS coding_artifacts_kind_idx
  ON coding_artifacts(artifact_kind, generated_at DESC);

CREATE INDEX IF NOT EXISTS coding_artifacts_active_idx
  ON coding_artifacts(uri, generated_at DESC) WHERE status = 'active';

-- Edges between artefacts: a PR contains commits, a commit modifies
-- files, a script generates a file. Lets us build a graph view.

CREATE TABLE IF NOT EXISTS coding_artifact_edges (
  id              TEXT PRIMARY KEY,
  parent_id       TEXT NOT NULL,
  child_id        TEXT NOT NULL,
  edge_kind       TEXT NOT NULL,                    -- 'contains' / 'modifies' / 'depends_on' / 'replaces' / 'reverts'
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_id, child_id, edge_kind)
);

CREATE INDEX IF NOT EXISTS coding_artifact_edges_parent_idx
  ON coding_artifact_edges(parent_id);

CREATE INDEX IF NOT EXISTS coding_artifact_edges_child_idx
  ON coding_artifact_edges(child_id);
