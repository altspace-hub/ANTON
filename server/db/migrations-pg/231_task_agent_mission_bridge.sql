-- ═══════════════════════════════════════════════════════════════════
-- 231_task_agent_mission_bridge.sql — Wave 5.1 (Core Experience Review
-- 2026-06): Task Agent ↔ Missions convergence, the linkage seam.
--
-- A completed Task Agent intake can now compile into a mission run
-- (see server/services/task-agent-mission-compiler.ts). This migration
-- adds ONLY the linkage — no other schema is unified yet:
--
--   • anton_tasks.linked_mission_id  — the mission executing this task
--     (NULL = classic per-step Task Agent execution, the default).
--   • missions.missions.source_task_id — back-link to the Task Agent
--     task whose intake produced this mission.
--
-- Both nullable TEXT, no FKs across the schema boundary (anton_tasks is
-- in public, missions.missions in the missions schema; either side may
-- be deleted independently and the bridge degrades gracefully).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS anton_tasks
  ADD COLUMN IF NOT EXISTS linked_mission_id TEXT;

ALTER TABLE IF EXISTS missions.missions
  ADD COLUMN IF NOT EXISTS source_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_missions_source_task
  ON missions.missions(source_task_id)
  WHERE source_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anton_tasks_linked_mission
  ON anton_tasks(linked_mission_id)
  WHERE linked_mission_id IS NOT NULL;
