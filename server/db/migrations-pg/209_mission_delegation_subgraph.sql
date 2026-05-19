-- ── Phase B1 — sub-graph delegation ──────────────────────────────────────
--
-- A delegation can now carry a connected SET of tasks (a sub-graph), not
-- just a single brief. The task list and its internal dependencies are
-- stored as JSONB on the delegation; when the recipient accepts, the
-- sub-mission's tasks are pre-built from it, so no LLM decomposition is
-- needed — the delegated plan IS the plan.
--
-- Shape of brief_tasks:
--   [ { "title": "...", "description": "...", "taskType": "llm",
--       "dependsOn": [0, 1] }, ... ]
-- where dependsOn holds zero-based indices into the same array.
--
-- Nullable + IF NOT EXISTS — single-task delegations leave it NULL and are
-- unaffected.

ALTER TABLE missions.mission_delegations
  ADD COLUMN IF NOT EXISTS brief_tasks JSONB;
