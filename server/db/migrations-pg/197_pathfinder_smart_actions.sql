-- 197_pathfinder_smart_actions.sql — smart-action register + execution
-- audit trail for the Pathfinder area.
--
-- Smart actions (call / directions / save_contact / open_module / etc.)
-- are extracted from search synthesis and surfaced in the action bar.
-- This migration adds persistent storage so users can see "what actions
-- have I taken from Pathfinder this week?" and audit the AI's action
-- recommendations.

CREATE TABLE IF NOT EXISTS pathfinder_smart_actions (
  id              TEXT PRIMARY KEY,
  search_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL DEFAULT 'default',
  generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action_type     TEXT NOT NULL,                  -- 'call' / 'directions' / 'website' / 'save_contact' / 'save_org' / 'create_task' / 'start_civic' / 'start_procure' / 'save_knowledge' / 'open_module' / 'task_agent'
  label           TEXT NOT NULL,
  description     TEXT,
  priority        TEXT NOT NULL DEFAULT 'medium', -- 'high' / 'medium' / 'low'
  data            JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'suggested',  -- 'suggested' / 'executed' / 'dismissed' / 'queued'
  executed_at     TIMESTAMP,
  result_ref      TEXT,                           -- pointer to the artifact created (task id, contact id, etc.)
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS pathfinder_smart_actions_search_idx
  ON pathfinder_smart_actions(search_id, priority);

CREATE INDEX IF NOT EXISTS pathfinder_smart_actions_user_idx
  ON pathfinder_smart_actions(user_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS pathfinder_smart_actions_executed_idx
  ON pathfinder_smart_actions(user_id, executed_at DESC) WHERE status = 'executed';

CREATE INDEX IF NOT EXISTS pathfinder_smart_actions_type_idx
  ON pathfinder_smart_actions(action_type, generated_at DESC);

-- Aggregated per-search action summary — denormalised for fast dashboard
-- rendering (count by type / status / priority without scanning all rows).

CREATE TABLE IF NOT EXISTS pathfinder_action_summary (
  search_id       TEXT PRIMARY KEY,
  total_actions   INTEGER DEFAULT 0,
  high_priority   INTEGER DEFAULT 0,
  executed        INTEGER DEFAULT 0,
  dismissed       INTEGER DEFAULT 0,
  last_updated    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  by_type         JSONB DEFAULT '{}'
);
