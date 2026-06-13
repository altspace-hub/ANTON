-- ═══════════════════════════════════════════════════════════════════
-- 242_coding_studio_goals.sql — ANTON Studio: the GOALS MODEL (goal-alignment).
--
-- The Kickoff Workshop now captures MEASURABLE GOALS (success-criteria) in the
-- Scope & MVP phase (CODING_STUDIO_DESIGN_2026-06-13.md §B step 6 — the FINISH
-- gate's "goal-alignment snapshot, blocking dissent = do not ship"). This
-- migration threads those goals from the charter, through the plan (each task
-- declares which goal ids it addresses), to a deterministic goal×coverage
-- snapshot the FINISH-gate panel reviews built-vs-intended.
--
-- The gate outcome stays code-computed (the panel's worst-of rollup) — the
-- snapshot only gives the panel the goal-coverage table; the LLM never decides
-- the gate (mirrors the Risk Atlas "deterministic engine + LLM rationale" rule).
--
-- All additive + history-preserving. Existing projects/tasks get the JSON
-- defaults ('[]') and keep flowing through the unchanged loop untouched.
--
--   coding_projects.goals       — the charter's CharterGoal[] (id/statement/
--                                 priority 'mvp'|'later'). The yardstick.
--   coding_tasks.goal_ids       — which charter goal ids this task addresses
--                                 (a JSON id array; '[]' = unmapped / infra).
--   coding_tasks.goal_alignment — a per-task alignment record the loop writes
--                                 when a task completes (which goals it advanced
--                                 + a short note). NULL until the task is done.
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE coding_projects
  ADD COLUMN IF NOT EXISTS goals TEXT DEFAULT '[]';

ALTER TABLE coding_tasks
  ADD COLUMN IF NOT EXISTS goal_ids TEXT DEFAULT '[]';

ALTER TABLE coding_tasks
  ADD COLUMN IF NOT EXISTS goal_alignment TEXT;
