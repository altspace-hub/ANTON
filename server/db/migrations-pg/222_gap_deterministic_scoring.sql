-- Migration 222: Gap Assessor deterministic scoring core (Wave 1 — items 1.1 / 1.2 / 1.5 / 1.7)
-- docs/CORE_EXPERIENCE_REVIEW_2026-06.md
--
-- 1.1  Per-finding structured criterion facts (JSONB) + rubric version.
--      score / numeric_score / priority remain the EFFECTIVE values the UI and
--      snapshots read; computed_* preserve the rubric output so overrides never
--      destroy the computed values. Legacy findings keep facts/rubric_version NULL
--      and are rendered with a "scored by legacy model assessment" note.
-- 1.2  Assessor override metadata (who / why / when / kind).
-- 1.5  Addressable evidence manifest per assessment (docId + sha256 per document).
-- 1.7  Carry-forward re-assessment markers (carried_forward + change_reason).

ALTER TABLE gap_findings
  ADD COLUMN IF NOT EXISTS facts JSONB,
  ADD COLUMN IF NOT EXISTS rubric_version INTEGER,
  ADD COLUMN IF NOT EXISTS computed_score TEXT,
  ADD COLUMN IF NOT EXISTS computed_numeric_score INTEGER,
  ADD COLUMN IF NOT EXISTS computed_priority TEXT,
  ADD COLUMN IF NOT EXISTS overridden_by TEXT,
  ADD COLUMN IF NOT EXISTS override_reason TEXT,
  ADD COLUMN IF NOT EXISTS overridden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS override_kind TEXT,
  ADD COLUMN IF NOT EXISTS carried_forward BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS change_reason TEXT;

-- override_kind: 'facts' (assessor edited criterion facts, score recomputed by rubric)
--                'manual' (assessor set an explicit numeric score)
ALTER TABLE gap_findings
  DROP CONSTRAINT IF EXISTS gap_findings_override_kind_check;
ALTER TABLE gap_findings
  ADD CONSTRAINT gap_findings_override_kind_check
  CHECK (override_kind IS NULL OR override_kind IN ('facts', 'manual'));

-- Evidence manifest: [{ docId, name, sha256, chars, kind: 'document'|'interview' }]
ALTER TABLE gap_assessments
  ADD COLUMN IF NOT EXISTS evidence_manifest JSONB;
