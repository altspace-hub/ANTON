-- 198_pathfinder_proactive_suggestions.sql — proactive suggestion engine
-- + per-search follow-up tracker for the Pathfinder area.
--
-- After a search completes, Pathfinder generates proactive follow-up
-- suggestions ("you searched for X — here's a related angle Y"). This
-- migration tracks those suggestions, which were taken, and surfaces
-- the suggestion-acceptance rate for the engine to learn from.

CREATE TABLE IF NOT EXISTS pathfinder_proactive_suggestions (
  id              TEXT PRIMARY KEY,
  source_search_id TEXT NOT NULL,
  user_id         TEXT NOT NULL DEFAULT 'default',
  generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  suggestion_kind TEXT NOT NULL,                  -- 'related_angle' / 'deeper_dive' / 'opposing_view' / 'next_step' / 'temporal_followup'
  suggestion_text TEXT NOT NULL,
  pre_filled_query TEXT NOT NULL,                 -- the actual query that gets pre-filled in the search bar
  expected_search_mode TEXT,
  rationale_md    TEXT,                           -- why we generated this suggestion
  shown_at        TIMESTAMP,
  accepted_at     TIMESTAMP,
  accepted_search_id TEXT,                        -- if accepted, the resulting search
  dismissed_at    TIMESTAMP,
  dismissed_reason TEXT,                          -- 'not_relevant' / 'already_done' / 'too_broad' / 'other'
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS pathfinder_proactive_suggestions_source_idx
  ON pathfinder_proactive_suggestions(source_search_id);

CREATE INDEX IF NOT EXISTS pathfinder_proactive_suggestions_user_idx
  ON pathfinder_proactive_suggestions(user_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS pathfinder_proactive_suggestions_accepted_idx
  ON pathfinder_proactive_suggestions(suggestion_kind, accepted_at DESC) WHERE accepted_at IS NOT NULL;

-- Per-search follow-up chain: when a user runs a follow-up query within
-- the same thread, this table captures the parent → child relationship
-- so we can surface the search-tree view.

CREATE TABLE IF NOT EXISTS pathfinder_search_followups (
  id              TEXT PRIMARY KEY,
  parent_search_id TEXT NOT NULL,
  child_search_id  TEXT NOT NULL,
  followup_kind   TEXT NOT NULL DEFAULT 'manual', -- 'manual' / 'from_suggestion' / 'from_action'
  triggered_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payload         JSONB DEFAULT '{}',
  UNIQUE(parent_search_id, child_search_id)
);

CREATE INDEX IF NOT EXISTS pathfinder_search_followups_parent_idx
  ON pathfinder_search_followups(parent_search_id);

CREATE INDEX IF NOT EXISTS pathfinder_search_followups_child_idx
  ON pathfinder_search_followups(child_search_id);
