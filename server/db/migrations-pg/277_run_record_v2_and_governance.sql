-- 277 — run record v2, tool calls, module access, per-user defaults, personas
-- (Waves 5 and 6, 2026-09-17).
--
-- Wave 5: a run record that every engine path can write — not only the chat
-- route — carrying the served model, the engine, the request parameters, the
-- hashes of what went in and what came out, and a table for the tool calls
-- an agentic run made. Wave 6: the tables per-role module access, per-user
-- module defaults and imported personas need. Services fill them in.

-- ── run_artifacts v2 ────────────────────────────────────────────────────────
-- An agentic run (gap batch, task step, engagement iteration, mission task)
-- has no assistant message; the parent columns say what the record belongs to.
ALTER TABLE run_artifacts ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS parent_kind TEXT NOT NULL DEFAULT 'message';
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS engine TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS engine_version TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS model_requested TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS model_served TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS request_params JSONB;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS user_message_sha256 TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS history_sha256 TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS output_sha256 TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS thinking_sha256 TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS usage JSONB;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS cost_usd NUMERIC;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS cost_basis TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS rerun_of TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS rerun_mode TEXT;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS transcript JSONB;
ALTER TABLE run_artifacts ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_run_artifacts_parent ON run_artifacts(parent_kind, parent_id);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_session_created ON run_artifacts(session_id, created_at DESC);

-- Backfill what the message rows already know (config_snapshot from waves 0–1).
UPDATE run_artifacts ra
   SET model_requested = COALESCE(ra.model_requested, m.model_id),
       output_sha256   = COALESCE(ra.output_sha256, encode(sha256(convert_to(m.content, 'UTF8')), 'hex')),
       finished_at     = COALESCE(ra.finished_at, m.created_at)
  FROM messages m
 WHERE m.id = ra.message_id
   AND (ra.model_requested IS NULL OR ra.output_sha256 IS NULL OR ra.finished_at IS NULL);

-- ── run_tool_calls: what an agentic run did, in order ───────────────────────
CREATE TABLE IF NOT EXISTS run_tool_calls (
  id TEXT PRIMARY KEY,
  run_artifact_id TEXT NOT NULL REFERENCES run_artifacts(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB,
  output_text TEXT,
  output_sha256 TEXT,
  output_chars INTEGER,
  is_error BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_run_tool_calls_run ON run_tool_calls(run_artifact_id, seq);

-- ── gap assessments: a restart can now say so ───────────────────────────────
ALTER TABLE gap_assessments ADD COLUMN IF NOT EXISTS interrupted_at TIMESTAMPTZ;

-- ── module access rules (Wave 6, team mode) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS module_access_rules (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  module_id TEXT,
  area_id TEXT,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_module_access_rules_role ON module_access_rules(role);

-- ── per-user module defaults: what this person used last time ───────────────
CREATE TABLE IF NOT EXISTS user_module_defaults (
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  output_formats TEXT,
  thinking TEXT,
  creativity TEXT,
  guided_inputs TEXT,
  used_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, module_id)
);

-- ── personas that travel inside a bundle ────────────────────────────────────
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  category TEXT,
  source TEXT NOT NULL DEFAULT 'import',
  user_id TEXT,
  org_id TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
