-- ═══════════════════════════════════════════════════════════════════
-- 233_workflow_coding_race_guards.sql — adversarial-review fixes
-- (workflows / timeline / coding / task-agent surfaces, 2026-06).
--
-- Two small, additive race-guard columns. No data backfill required —
-- both default to a benign value and are forward-only.
--
-- 1. coding_test_runs.revision_requested — a one-shot atomic marker so the
--    single AI revision round per failed test run is claimed via a
--    conditional UPDATE (… SET revision_requested = 1 WHERE id = ? AND
--    COALESCE(revision_requested,0) = 0) instead of by counting application
--    rows that don't exist yet at /revise time. Closes the check-then-act
--    race where two concurrent /revise calls both seeded a round.
--
-- 2. workflow_executions already carries user_id + created_by in the base
--    schema (schema.postgresql.sql) — the store simply never persisted them.
--    This migration is a no-op safety net for older deploys whose table
--    predates those columns, so the per-user timeline scoping + approvals
--    IDOR fix have the columns they read/write.
-- ═══════════════════════════════════════════════════════════════════

-- 1. One-shot revision marker on real test runs.
ALTER TABLE coding_test_runs ADD COLUMN IF NOT EXISTS revision_requested INTEGER DEFAULT 0;

-- 2. Owner columns on workflow_executions (idempotent safety net).
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS created_by TEXT;

CREATE INDEX IF NOT EXISTS idx_workflow_executions_owner
  ON workflow_executions(user_id, created_by);
