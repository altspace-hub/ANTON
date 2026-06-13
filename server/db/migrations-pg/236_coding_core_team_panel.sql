-- 236_coding_core_team_panel.sql
-- ANTON Studio Phase 2 — the single-model 7-expert core-team panel WITH AN
-- ENFORCED GATE (CODING_STUDIO_DESIGN_2026-06-13.md §C-req2 / §D.5 / §F-P2).
--
-- Additive + history-preserving. Two changes:
--
-- 1. coding_reviews gets a `gate` column (start|build|testing|finish) so the
--    same verdict table records one row per expert per gate, AND the
--    review_type CHECK is widened to admit the 4 NEW core-team personas'
--    review kinds (project_management, design, ux, devsecops) alongside the
--    existing architecture/security/compliance/product/technical/... values.
--    Existing rows (gate NULL) are untouched.
--
-- 2. A new `coding_panel_decisions` table holds the PANEL-LEVEL record: the
--    full PanelVerdict JSON + the CODE-COMPUTED rollup (panel_verdict) and the
--    CODE-COMPUTED blocking flag — the LLM never sets these. UNIQUE(project,
--    gate) so the latest decision per gate is the live gate state; the
--    phase-advancement guard reads blocking from here.
--
-- Idempotent.

-- ── 1. coding_reviews: gate column + widened review_type ───────────────────

ALTER TABLE coding_reviews
  ADD COLUMN IF NOT EXISTS gate TEXT CHECK (gate IN ('start','build','testing','finish'));

ALTER TABLE coding_reviews
  DROP CONSTRAINT IF EXISTS coding_reviews_review_type_check;

ALTER TABLE coding_reviews
  ADD CONSTRAINT coding_reviews_review_type_check
  CHECK (review_type IN (
    -- pre-existing values (must remain valid — history preserved)
    'architecture','security','compliance','product','technical',
    'goal_alignment','operational',
    -- NEW core-team persona review kinds (the 4 net-new personas + PM/business)
    'project_management','design','ux','devsecops','business','engineering'
  ));

CREATE INDEX IF NOT EXISTS idx_coding_reviews_project_gate
  ON coding_reviews (coding_project_id, gate);

-- ── 2. coding_panel_decisions: the code-computed gate record ───────────────

CREATE TABLE IF NOT EXISTS coding_panel_decisions (
  id TEXT PRIMARY KEY,
  coding_project_id TEXT NOT NULL REFERENCES coding_projects(id) ON DELETE CASCADE,
  gate TEXT NOT NULL CHECK (gate IN ('start','build','testing','finish')),
  -- CODE-COMPUTED worst-of rollup (dissent > flag > endorse). Never set by the LLM.
  panel_verdict TEXT NOT NULL CHECK (panel_verdict IN ('endorse','flag','dissent')),
  -- CODE-COMPUTED: TRUE iff any MANDATORY role for this gate dissented.
  blocking BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'fast' CHECK (mode IN ('fast','balanced','thorough')),
  -- full PanelVerdict (experts[], agreements, dissents, open_questions, synthesis)
  verdict_json JSONB NOT NULL,
  -- the EXPERT-deliberation model id (resolveCodingModel('expert'))
  model TEXT,
  -- the CHAIR/orchestrator model id when a synthesis pass ran (thorough mode)
  chair_model TEXT,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (coding_project_id, gate)
);

CREATE INDEX IF NOT EXISTS idx_coding_panel_decisions_project
  ON coding_panel_decisions (coding_project_id);
