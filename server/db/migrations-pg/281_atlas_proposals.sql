-- 281 — AI proposals for a Risk Atlas, accepted or rejected by a person (2026-09-22).
--
-- The seven atlas-* stage prompts have always ended in a fenced JSON diff, and
-- nothing ever read it. A proposal is one suggested addition: it is stored as
-- the model produced it, shown for review, and applied only on acceptance —
-- through the same atlas-service calls a person's own entry uses, so tenancy
-- checks, audit events and the deterministic calculator all still apply.
--
-- Statuses: pending → accepted | rejected; skipped (an edit/removal, out of
-- scope in v1), unresolved (a reference the Atlas does not have), failed (the
-- apply threw — the error is kept).
CREATE TABLE IF NOT EXISTS atlas_proposal_sets (
  id            TEXT PRIMARY KEY,
  atlas_id      TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  stage         TEXT NOT NULL,
  model_served  TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS atlas_proposals (
  id              TEXT PRIMARY KEY,
  set_id          TEXT NOT NULL REFERENCES atlas_proposal_sets(id) ON DELETE CASCADE,
  atlas_id        TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL,
  rationale       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'rejected', 'skipped', 'unresolved', 'failed')),
  applied_ref_id  TEXT,
  error           TEXT,
  decided_by      TEXT,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_proposals_atlas  ON atlas_proposals (atlas_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_proposals_set    ON atlas_proposals (set_id);
CREATE INDEX IF NOT EXISTS idx_atlas_proposal_sets_atlas ON atlas_proposal_sets (atlas_id, created_at DESC);
