-- ═══════════════════════════════════════════════════════════════════
-- 232_coding_workspace_loop.sql — Wave 5.2 (Coding Large verifiable loop)
--
-- Converts Coding Large from prompt-assembly theatre into a verifiable
-- loop: task execute → parse file blocks → deterministic diff → user
-- approves → files written to the bound workspace (with backups) → user
-- approves a REAL test run (execFile argv array, never a shell) → real
-- results land in coding_test_runs.
--
-- 1. coding_projects.test_command — the user-configured test command,
--    stored as a JSON argv ARRAY (e.g. ["node","--run","test"]). Never a
--    shell string; the server runs it via execFile in the workspace dir.
--
-- 2. coding_workspace_applications — every proposed/applied "apply the
--    LLM's file blocks to the workspace" event, with per-file content
--    hashes before/after, the backup dir, and the parse-format version.
--
-- 3. coding_test_runs gains real-execution columns. Pre-existing rows
--    keep executed = 0: they were LLM-claimed numbers no machinery ever
--    ran (the honest historical record).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Per-project test command (JSON argv array) ────────────────────
ALTER TABLE coding_projects ADD COLUMN IF NOT EXISTS test_command TEXT;

-- ── 2. Workspace application records ─────────────────────────────────
CREATE TABLE IF NOT EXISTS coding_workspace_applications (
  id TEXT PRIMARY KEY,
  coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
  coding_task_id TEXT REFERENCES coding_tasks(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','applied','rejected','failed')),
  kind TEXT NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial','revision')),
  -- The revise round that produced this application (one round per failure).
  revision_of_test_run_id TEXT,
  -- Parser contract version (e.g. 'anton-coding-file-blocks/v1').
  format_version TEXT NOT NULL,
  -- Resolved workspace dir the preview was computed against; approve
  -- re-validates and refuses if the project has been rebound elsewhere.
  workspace_path TEXT NOT NULL,
  -- [{ path, action, bytes, hash_new, hash_before, hash_after, content }]
  -- content is kept while 'proposed' so approve writes exactly what was
  -- reviewed; it is cleared once applied/rejected.
  files TEXT NOT NULL DEFAULT '[]',
  -- Blocks that carried a FILE header but were refused (path escapes, etc.)
  rejected_blocks TEXT NOT NULL DEFAULT '[]',
  -- { perFile: { [path]: stats }, totals: {...} } from the deterministic diff.
  diff_summary TEXT NOT NULL DEFAULT '{}',
  -- Workspace-relative backup dir ('.anton-coding-backup/<timestamp>').
  backup_dir TEXT,
  error_message TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cwa_project
  ON coding_workspace_applications(coding_project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cwa_task
  ON coding_workspace_applications(coding_task_id);

-- ── 3. Real-execution columns on coding_test_runs ────────────────────
-- executed = 1 means THIS SERVER ran the command and observed the exit
-- code; 0 (default, incl. all legacy rows) means the numbers were
-- self-reported by an LLM and never verified.
ALTER TABLE coding_test_runs ADD COLUMN IF NOT EXISTS executed INTEGER DEFAULT 0;
ALTER TABLE coding_test_runs ADD COLUMN IF NOT EXISTS command TEXT;          -- JSON argv array as run
ALTER TABLE coding_test_runs ADD COLUMN IF NOT EXISTS exit_code INTEGER;
ALTER TABLE coding_test_runs ADD COLUMN IF NOT EXISTS timed_out INTEGER DEFAULT 0;
ALTER TABLE coding_test_runs ADD COLUMN IF NOT EXISTS output_tail TEXT;      -- capped tail of stdout+stderr
