-- Migration 247: dedicated review store for the Instruction Builder wizard.
--
-- The /review + /generate endpoints reused `coding_reviews`, whose
-- coding_project_id is NOT NULL and REFERENCES coding_projects(id). Instruction
-- Builder projects are NOT coding_projects (and coding_projects itself requires a
-- projects(id) FK), so every expert-review INSERT threw an FK violation — AFTER a
-- paid Sonnet call had already completed — and /generate's read then crashed too.
-- Give the Instruction Builder its own review table keyed by its own project id.
CREATE TABLE IF NOT EXISTS instruction_builder_reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES instruction_builder_projects(id) ON DELETE CASCADE,
  reviewer_persona_id TEXT NOT NULL,
  review_type TEXT NOT NULL,
  verdict TEXT,
  findings TEXT,
  recommendations TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  review_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ib_reviews_project ON instruction_builder_reviews(project_id);
