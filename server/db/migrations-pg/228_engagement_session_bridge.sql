-- Migration 228: Engagement → session bridge + per-engagement model choice
-- (CORE_EXPERIENCE_REVIEW 2026-06, item 4.4)
--
-- 1. engagements.exec_model — the model chosen in the Expert Config phase.
--    NULL = "Auto": resolve via the product default (default-model-store,
--    Settings > env DEFAULT_MODEL) and finally the legacy thinking-level
--    mapping (quick → Haiku, else Opus). Kills the hardcoded Opus/Haiku
--    pair at engagements.ts execute.
--
-- 2. engagement_iterations.session_id — every workstream execution also
--    creates a real session (module_id 'engagement') + user/assistant
--    message pair, so the iteration output gets the session world for
--    free: version history, share links, My Work, the 4.3 timeline.
--    ON DELETE SET NULL: deleting the bridged session keeps the iteration.

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS exec_model TEXT;

ALTER TABLE engagement_iterations
  ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_engagement_iterations_session
  ON engagement_iterations(session_id);

-- The 4.3 timeline uses MAX(created_at) per engagement; cover it.
CREATE INDEX IF NOT EXISTS idx_engagement_iterations_eng_created
  ON engagement_iterations(engagement_id, created_at DESC);
