-- Migration 121: ANTON Missions — review-fixes (post Phases 1-5 audit)
--
-- Adds indexes for hot query shapes that were missing or sub-optimal:
--   • mission_payments(task_id) WHERE NOT NULL — task cleanup paths
--   • mission_payments(fc_transaction_id) UNIQUE WHERE NOT NULL —
--     guarantees a single payment row per FC transaction even if retry
--     logic is added later
--   • mission_scheduled_tasks(status, execute_at) WHERE pending —
--     status-leading partial index for the due-task scan
--   • mission_event_queue(status, priority, created_at) WHERE pending —
--     same shape as the existing index but partial, so terminal rows
--     don't bloat the index over time

CREATE INDEX IF NOT EXISTS idx_mission_payments_task
  ON missions.mission_payments(task_id)
  WHERE task_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_payments_fc_tx
  ON missions.mission_payments(fc_transaction_id)
  WHERE fc_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due
  ON missions.mission_scheduled_tasks(status, execute_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_event_queue_pending
  ON missions.mission_event_queue(status, priority, created_at)
  WHERE status = 'pending';
