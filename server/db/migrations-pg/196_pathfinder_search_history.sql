-- 196_pathfinder_search_history.sql — search-feedback log + per-thread
-- snapshot tracking for the Pathfinder area.
--
-- The base pathfinder_searches table (mig 047) records search runs.
-- This migration adds two complementary tables:
--   1) pathfinder_search_feedback — user-supplied feedback per search
--      (was the synthesis useful? what was missing?)
--   2) pathfinder_thread_snapshots — point-in-time snapshots of a thread's
--      accumulated context for debugging "why did this follow-up search
--      get this context?"

CREATE TABLE IF NOT EXISTS pathfinder_search_feedback (
  id              TEXT PRIMARY KEY,
  search_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL DEFAULT 'default',
  given_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  rating          TEXT NOT NULL,                   -- 'helpful' / 'partial' / 'not_helpful' / 'misleading'
  comment         TEXT,
  feedback_kind   TEXT,                            -- 'too_shallow' / 'wrong_focus' / 'missing_context' / 'wrong_mode' / 'great' / 'other'
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS pathfinder_search_feedback_search_idx
  ON pathfinder_search_feedback(search_id);

CREATE INDEX IF NOT EXISTS pathfinder_search_feedback_user_idx
  ON pathfinder_search_feedback(user_id, given_at DESC);

-- Per-thread accumulated context snapshot.
-- Useful for debugging "why did this follow-up search ground in document X?"
-- when the thread context drifted across multiple searches.

CREATE TABLE IF NOT EXISTS pathfinder_thread_snapshots (
  id                  TEXT PRIMARY KEY,
  thread_id           TEXT NOT NULL,
  taken_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  trigger             TEXT NOT NULL,               -- 'pre_search' / 'post_search' / 'manual'
  search_id           TEXT,                        -- the search that prompted this snapshot
  documents_count     INTEGER DEFAULT 0,
  searches_in_scope   INTEGER DEFAULT 0,
  context_payload     JSONB NOT NULL,              -- the full thread-context object
  retention           TEXT NOT NULL DEFAULT 'keep_30d',  -- 'keep_indefinitely' / 'keep_30d' / 'keep_7d'
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS pathfinder_thread_snapshots_thread_idx
  ON pathfinder_thread_snapshots(thread_id, taken_at DESC);

CREATE INDEX IF NOT EXISTS pathfinder_thread_snapshots_search_idx
  ON pathfinder_thread_snapshots(search_id) WHERE search_id IS NOT NULL;
