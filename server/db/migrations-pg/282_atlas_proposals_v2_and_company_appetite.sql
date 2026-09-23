-- 282 — Risk Atlas: suggested changes and removals, and the Stage 7b statement (2026-09-23).
--
-- 1. A suggestion now says what it does to the Atlas: add a row (v1), change
--    one field of an existing row, or remove one. Changes and removals rewrite
--    audited records, so each is decided on its own — never in "accept all" —
--    and a change records the value it replaces, so it is refused if the row
--    has changed since the suggestion was made.
--
--    v1 stored the edits and removals a stage emitted as `skipped` additions;
--    they are relabelled here so the history says what they were. They stay
--    skipped: they were never checked against the Atlas.
ALTER TABLE atlas_proposals
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'add'
  CHECK (action IN ('add', 'edit', 'remove'));

UPDATE atlas_proposals SET action = 'edit'
 WHERE action = 'add' AND status = 'skipped' AND error LIKE 'edits of existing rows%';
UPDATE atlas_proposals SET action = 'remove'
 WHERE action = 'add' AND status = 'skipped' AND error LIKE 'removals of existing rows%';

-- 2. Stage 7b — the company-wide Risk Appetite Statement. As with the BWRA
--    (migration 280), code renders every position and count from the
--    deterministic worst-of rollup; the model writes only the narrative, and
--    any statement that contradicts the rollup is recorded. The rollup the
--    document was written from is kept with it.
CREATE TABLE IF NOT EXISTS atlas_company_appetite_documents (
  id                  TEXT PRIMARY KEY,
  atlas_id            TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  markdown            TEXT NOT NULL,
  snapshot_sha256     TEXT NOT NULL,
  overall_position    TEXT CHECK (overall_position IS NULL OR overall_position IN ('within', 'boundary', 'outside', 'unacceptable')),
  rollup              JSONB NOT NULL,
  approver_name       TEXT,
  approver_role       TEXT,
  review_cadence      TEXT CHECK (review_cadence IS NULL OR review_cadence IN ('annual', 'semi-annual', 'quarterly')),
  model_requested     TEXT,
  model_served        TEXT,
  consistency_issues  JSONB NOT NULL DEFAULT '[]',
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_company_appetite_documents_atlas
  ON atlas_company_appetite_documents (atlas_id, created_at DESC);
