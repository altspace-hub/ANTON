-- ═══════════════════════════════════════════════════════════════════
-- 241_coding_preview_servers.sql — ANTON Studio Phase 6 (parity polish).
--
-- The LIVE LOCAL PREVIEW SERVER's durable status row (CODING_STUDIO_DESIGN
-- 2026-06-13 §E "must invest in a real local preview server" — so the studio
-- feels as instant as bolt: a managed dev-server process per project with a
-- preview URL + start/stop/logs).
--
-- One row per coding project. The ACTUAL running process lives only as an
-- in-memory ChildProcess handle inside coding-preview-service.ts; THIS row is
-- the durable, honest mirror of its status the UI polls. Because the handle is
-- in-memory, a server restart loses it — at which point a row still marked
-- 'running' is reconciled to 'unknown' (we cannot prove the old process is
-- alive, and the operator's hard rule forbids scanning/killing by pid/port).
--
--   status:
--     starting   spawn issued, child not yet confirmed up
--     running    the tracked child handle is alive (pid+port+preview_url set)
--     stopped    the child exited 0, or was SIGTERM'd via its tracked handle,
--                or an orphaned row was honestly cleared
--     crashed    the child exited NON-zero
--     unknown    the DB says 'running' but no live in-memory handle exists
--                (server restarted) — surfaced honestly, never auto-killed
--
--   port         the localhost port the dev server was bound to
--   pid          the spawned child's pid (informational ONLY — the service
--                NEVER kills by this pid; it only ever kills the ChildProcess
--                handle it itself holds)
--   command      JSON argv array that was spawned (no shell, ever)
--   preview_url  http://localhost:<port>
--   last_log     a short tail of the most recent log line (full ring buffer is
--                in memory; this is just an at-a-glance honest hint)
--
-- Idempotent (CREATE TABLE IF NOT EXISTS). NOT folded into
-- schema.postgresql.sql — the central schema step owns that file.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coding_preview_servers (
  coding_project_id TEXT PRIMARY KEY
    REFERENCES coding_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'stopped'
    CHECK (status IN ('starting','running','stopped','crashed','unknown')),
  port INTEGER,
  pid INTEGER,
  command TEXT,           -- JSON argv array as spawned (never a shell string)
  preview_url TEXT,
  last_log TEXT,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
