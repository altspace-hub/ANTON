-- ═══════════════════════════════════════════════════════════════════
-- 238_coding_project_commands.sql — ANTON Studio Phase 3.
--
-- Workspace + per-project DATABASE provisioning + multi-language commands
-- (CODING_STUDIO_DESIGN_2026-06-13.md §C-req4 / §C-req5 / §D.7 / §F-P3).
--
-- LOCKED DECISION 3: a SEPARATE Postgres DATABASE per project (proj_<slug>)
-- owned by a least-privilege role (studio_<slug>) — NOT schema-per-project.
-- The actual CREATE/DROP DATABASE + CREATE/DROP ROLE is RUNTIME-provisioned by
-- coding-studio-provisioner.ts (CREATE DATABASE cannot run inside a migration
-- transaction and is per-project, not global). This migration only adds the
-- per-project COLUMNS + the vault table that hold the provisioning STATE.
--
-- Three additive, history-preserving changes:
--
-- 1. coding_projects: setup_command / build_command / test_command argv arrays.
--    test_command already exists (migration 232) as the single command; we add
--    setup + build so a project carries the full per-language command SET
--    (each a JSON argv ARRAY, run via execFile through the same approve gate).
--    A studio_language hint records which preset the project is using.
--
-- 2. coding_studio_databases: the per-project scoped-DSN vault row. One row per
--    coding project, keyed by coding_project_id. scoped_dsn_encrypted holds the
--    AES-256-GCM-encrypted DSN that points at proj_<slug> AS studio_<slug>;
--    the plaintext NEVER reaches an LLM prompt, an API response, or a log.
--    Dropped (and the real DATABASE + ROLE torn down) on project delete.
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Per-project command set (JSON argv arrays) ────────────────────
-- test_command was added in 232; add the rest of the set + a language hint.
ALTER TABLE coding_projects ADD COLUMN IF NOT EXISTS setup_command TEXT;
ALTER TABLE coding_projects ADD COLUMN IF NOT EXISTS build_command TEXT;
-- Which language preset the project is configured for (typescript|python|rust|node).
-- Free-text hint only — the commands themselves are the source of truth.
ALTER TABLE coding_projects ADD COLUMN IF NOT EXISTS studio_language TEXT;

-- ── 2. Per-project scoped-DSN vault ──────────────────────────────────
CREATE TABLE IF NOT EXISTS coding_studio_databases (
  coding_project_id TEXT PRIMARY KEY
    REFERENCES coding_projects(id) ON DELETE CASCADE,
  -- proj_<slug> — the provisioned per-project database name.
  db_name TEXT NOT NULL,
  -- studio_<slug> — the least-privilege owner role name.
  role_name TEXT NOT NULL,
  -- AES-256-GCM-encrypted scoped DSN (studio_<slug>@…/proj_<slug>).
  -- NEVER decrypted into an API response, an LLM prompt, or a log line.
  scoped_dsn_encrypted TEXT NOT NULL,
  provisioned_at TIMESTAMPTZ DEFAULT NOW()
);

-- The ON DELETE CASCADE above removes the vault row when the coding project is
-- deleted; the DELETE route ALSO runs DROP DATABASE proj_<slug> + DROP ROLE
-- studio_<slug> (the real Postgres objects can't be dropped by a FK cascade).
