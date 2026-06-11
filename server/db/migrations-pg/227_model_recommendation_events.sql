-- Migration 227: model recommendation accept/dismiss events
-- (CORE_EXPERIENCE_REVIEW 2026-06, item 3.7)
--
-- The provider-aware model recommender (ModelRecommendationBadge in the
-- module run bar + server/services/model-router.ts) logs every explicit
-- user reaction so its acceptance rate is measurable — the validation gate
-- for keeping/expanding the feature.
--
-- Acceptance rate query:
--   SELECT recommended_model,
--          COUNT(*) FILTER (WHERE event = 'accepted')::float / COUNT(*) AS acceptance
--   FROM model_recommendation_events
--   GROUP BY recommended_model;

CREATE TABLE IF NOT EXISTS model_recommendation_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event TEXT NOT NULL CHECK (event IN ('accepted', 'dismissed')),
  recommended_model TEXT NOT NULL,
  -- the model the user actually applied (may be an alternative, not the top pick)
  selected_model TEXT,
  provider TEXT,
  module_id TEXT,
  thinking_level TEXT
);

CREATE INDEX IF NOT EXISTS idx_model_reco_events_created
  ON model_recommendation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_reco_events_event
  ON model_recommendation_events(event);
