-- 199_pathfinder_mode_calibration.sql — search-mode calibration + per-mode
-- accuracy tracking for the Pathfinder area.
--
-- Pathfinder offers different "search modes" (local / knowledge / news /
-- shopping / travel / fix / food). The mode determines which model
-- council runs and which downstream action types prioritise. This
-- migration adds the calibration loop: track which mode the user said
-- they wanted vs the mode the system inferred, so the inference engine
-- can improve.

CREATE TABLE IF NOT EXISTS pathfinder_mode_inferences (
  id              TEXT PRIMARY KEY,
  search_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL DEFAULT 'default',
  query           TEXT NOT NULL,
  inferred_mode   TEXT NOT NULL,
  inference_confidence NUMERIC,                   -- 0.0–1.0
  inference_method TEXT NOT NULL DEFAULT 'rule_based',  -- 'rule_based' / 'haiku_classifier' / 'user_explicit'
  user_corrected_to TEXT,                         -- if user changed the mode after inference
  corrected_at    TIMESTAMP,
  inferred_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS pathfinder_mode_inferences_search_idx
  ON pathfinder_mode_inferences(search_id);

CREATE INDEX IF NOT EXISTS pathfinder_mode_inferences_corrected_idx
  ON pathfinder_mode_inferences(inferred_mode, user_corrected_to)
  WHERE user_corrected_to IS NOT NULL;

-- Aggregate calibration table: per-mode accuracy stats updated nightly.
CREATE TABLE IF NOT EXISTS pathfinder_mode_calibration (
  inferred_mode   TEXT PRIMARY KEY,
  total_inferences INTEGER DEFAULT 0,
  user_accepted   INTEGER DEFAULT 0,
  user_corrected  INTEGER DEFAULT 0,
  accuracy_pct    NUMERIC,                        -- user_accepted / total_inferences
  most_common_correction TEXT,                    -- e.g. inferred='shopping' but corrected to 'travel' more often
  last_updated    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payload         JSONB DEFAULT '{}'
);

-- Per-mode result-quality feedback: did the user find the synthesis
-- useful? Captured via the thumbs-up/down on each search result panel.

CREATE TABLE IF NOT EXISTS pathfinder_quality_feedback (
  id              TEXT PRIMARY KEY,
  search_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL DEFAULT 'default',
  rated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  rating          TEXT NOT NULL,                  -- 'helpful' / 'not_helpful' / 'partial' / 'misleading'
  feedback_text   TEXT,
  feedback_kind   TEXT,                           -- 'too_shallow' / 'wrong_focus' / 'missing_context' / 'wrong_mode' / 'great' / 'other'
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS pathfinder_quality_feedback_search_idx
  ON pathfinder_quality_feedback(search_id);

CREATE INDEX IF NOT EXISTS pathfinder_quality_feedback_user_idx
  ON pathfinder_quality_feedback(user_id, rated_at DESC);
