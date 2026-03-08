-- Migration 042: Iterative Reasoning Engine — revelation chains + steps
-- Tracks multi-phase Claude reasoning loops (analyse → reflect → deepen → synthesise)

CREATE TABLE IF NOT EXISTS revelation_chains (
  id                     TEXT    PRIMARY KEY,
  session_id             TEXT,
  message_id             TEXT,
  thinking_level         TEXT    NOT NULL,
  phase_count            INTEGER NOT NULL DEFAULT 0,
  total_input_tokens     INTEGER NOT NULL DEFAULT 0,
  total_output_tokens    INTEGER NOT NULL DEFAULT 0,
  total_duration_ms      INTEGER NOT NULL DEFAULT 0,
  synthesis_quality_score REAL,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS revelation_steps (
  id               TEXT    PRIMARY KEY,
  chain_id         TEXT    NOT NULL REFERENCES revelation_chains(id) ON DELETE CASCADE,
  session_id       TEXT,
  phase_index      INTEGER NOT NULL,
  phase_name       TEXT    NOT NULL,
  thinking_content TEXT    NOT NULL DEFAULT '',
  output_content   TEXT    NOT NULL DEFAULT '',
  confidence_score REAL,
  revision_needed  INTEGER,
  next_action      TEXT,
  input_tokens     INTEGER NOT NULL DEFAULT 0,
  output_tokens    INTEGER NOT NULL DEFAULT 0,
  duration_ms      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rev_chains_session ON revelation_chains(session_id);
CREATE INDEX IF NOT EXISTS idx_rev_chains_created ON revelation_chains(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rev_steps_chain    ON revelation_steps(chain_id, phase_index);
CREATE INDEX IF NOT EXISTS idx_rev_steps_session  ON revelation_steps(session_id);
