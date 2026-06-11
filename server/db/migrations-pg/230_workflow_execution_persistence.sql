-- ═══════════════════════════════════════════════════════════════════
-- 230_workflow_execution_persistence.sql — Wave 4.1 (B7 fix)
--
-- Kills the "approval gates park runs forever" trap:
--
-- 1. Engine 2 (interactive /api/workflows/executions* engine): the live
--    WorkflowExecution objects were held ONLY in an in-memory Map and lost
--    on server restart. The workflow_executions table (created for the
--    collaborative canvas) gains the state columns needed to serialize the
--    full execution on every state change and rehydrate it after a restart.
--
-- 2. Engine 3 (headless scheduled executor): `awaiting_approval` was being
--    stashed as JSON inside error_message — AND the status value itself was
--    rejected by the workflow_runs CHECK constraint (silently swallowed by
--    updateRun's catch), so parked runs looked permanently 'running'.
--    Real columns + an extended CHECK + approve/reject decision tracking.
-- ═══════════════════════════════════════════════════════════════════

-- ── Engine 2: workflow_executions state columns ─────────────────────
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS step_states JSONB;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS workflow_definition JSONB;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
  ON workflow_executions(status);

-- ── Engine 3: workflow_runs awaiting_approval as a first-class state ─
ALTER TABLE workflow_runs DROP CONSTRAINT IF EXISTS workflow_runs_status_check;
ALTER TABLE workflow_runs ADD CONSTRAINT workflow_runs_status_check
  CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled',
    'awaiting_approval', 'rejected'
  ));

ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS awaiting_step INTEGER;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS awaiting_step_label TEXT;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS steps_completed INTEGER;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS steps_skipped INTEGER;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS approval_decision TEXT;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS approval_decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
  ON workflow_runs(status);
