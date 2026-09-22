-- 280 — business-wide risk assessments generated from a Risk Atlas (2026-09-22).
--
-- "Generate BWRA" in the Atlas workspace writes a regulator-ready document:
-- every score table is rendered by code from the Atlas (the calculator owns
-- the numbers), the model writes only the narrative around them, and a check
-- records any narrative that contradicts a stored score. Each generated
-- document is kept, with the snapshot hash it was written from, so a later
-- reader can tell which state of the register a given BWRA describes.
CREATE TABLE IF NOT EXISTS atlas_bwra_documents (
  id                  TEXT PRIMARY KEY,
  atlas_id            TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  markdown            TEXT NOT NULL,
  snapshot_sha256     TEXT NOT NULL,
  paths_total         INTEGER NOT NULL DEFAULT 0,
  model_requested     TEXT,
  model_served        TEXT,
  consistency_issues  JSONB NOT NULL DEFAULT '[]',
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_bwra_documents_atlas
  ON atlas_bwra_documents (atlas_id, created_at DESC);
