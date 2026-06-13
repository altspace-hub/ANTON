-- ═══════════════════════════════════════════════════════════════════
-- 240_coding_studio_runs.sql — ANTON Studio Phase 5.
--
-- The SERVER-SIDE autonomous iterate-to-finish ORCHESTRATOR's job-runner row
-- (CODING_STUDIO_DESIGN_2026-06-13.md §B / §C-req6 / §D.2 / §F-P5 +
--  LOCKED DECISION 6 "MORE AUTONOMOUS").
--
-- One row per Studio project drives its build from the charter to finish:
-- the orchestrator advances it tick-by-tick (mirroring the mission-runner job
-- pattern the design cites), the UI polls `status`, and a STOP control sets
-- stop_requested which the loop checks each tick. The panel gates (P2) and the
-- revise-round cap are ALWAYS enforced regardless of autonomy.
--
--   status:
--     pending        created, not yet started
--     running        the advancer is actively working a task
--     awaiting_plan  the release/task plan is the human checkpoint (plan-approval)
--     awaiting_gate  a panel gate must be run/cleared before advancing
--     blocked        a BLOCKING panel dissent halted the run (assertGatePassed)
--     done           every task finished + the FINISH gate passed
--     stopped        the STOP control halted the run mid-loop
--     failed         a task exhausted the revise cap, or a fatal error
--
--   plan JSONB   — the orchestrator-produced release + task plan (the charter →
--                  plan step; the plan-approval checkpoint reviews THIS).
--   autonomy     — 'more' (the locked default) | 'ask' (conservative — checkpoint
--                  before each task's first write). The panel gates + revise cap
--                  are on for BOTH.
--   revise_cap   — the REVISE-ROUND CAP: after N failed revise rounds on a task
--                  the loop gives up and marks the task failed (honest).
--
-- One run per coding project (UNIQUE) so re-starting RESUMES the same row.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coding_studio_runs (
  id TEXT PRIMARY KEY,
  coding_project_id TEXT NOT NULL UNIQUE
    REFERENCES coding_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending','running','awaiting_plan','awaiting_gate','blocked','done','stopped','failed'
    )),
  -- The coding_tasks.id the loop is currently working (NULL when between tasks
  -- or before the plan is approved).
  current_task TEXT,
  -- Autonomy budget (LOCKED DECISION 6). 'more' = write+run+revise across tasks
  -- without per-edit checkpoints; 'ask' = checkpoint before each task's first
  -- write. The panel gates + the revise cap are ALWAYS on for both.
  autonomy TEXT NOT NULL DEFAULT 'more' CHECK (autonomy IN ('more','ask')),
  -- The revise-round cap (per task). After this many failed revise rounds the
  -- loop gives up on the task and marks it failed honestly.
  revise_cap INTEGER NOT NULL DEFAULT 4 CHECK (revise_cap >= 1 AND revise_cap <= 20),
  -- The STOP flag — the loop checks this each tick and halts (status=stopped).
  stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
  -- The orchestrator-produced release + task plan (the plan-approval checkpoint).
  plan JSONB,
  -- When awaiting_gate: which gate the loop is parked on (start|build|testing|finish).
  awaiting_gate TEXT CHECK (awaiting_gate IN ('start','build','testing','finish')),
  -- The last error / blocking reason surfaced to the UI (honest state).
  last_error TEXT,
  -- A bounded JSON log of the loop's steps for the UI timeline (plan/gate/
  -- codegen/apply/test/revise/atom events). Capped in code.
  step_log JSONB NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coding_studio_runs_status
  ON coding_studio_runs (status);
