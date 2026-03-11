-- Migration 027: Task Execution Engine
-- Adds intake questionnaire state and execution results storage to anton_tasks.
-- Enables ANTON to gather context before executing, stream the actual deliverable,
-- and track multi-step progress.

ALTER TABLE anton_tasks ADD COLUMN IF NOT EXISTS intake_answers TEXT DEFAULT '{}';
-- JSON object: gathered key-value context from intake Q&A (entity, jurisdiction, etc.)

ALTER TABLE anton_tasks ADD COLUMN IF NOT EXISTS execution_results TEXT DEFAULT '[]';
-- JSON array of {step, name, output, at} objects — one per completed execution step

ALTER TABLE anton_tasks ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
-- Index of the next step to execute (0-based into approach.execution_steps)

ALTER TABLE anton_tasks ADD COLUMN IF NOT EXISTS intake_ready INTEGER DEFAULT 0;
-- 1 when ANTON has signalled <intake_complete> and is ready to execute current_step
