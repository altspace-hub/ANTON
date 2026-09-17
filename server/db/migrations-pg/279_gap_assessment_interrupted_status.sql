-- 279 — a gap assessment can say it was interrupted (Wave 5, 2026-09-17).
--
-- A server restart used to leave an assessment 'assessing' for ever with no
-- signal to the page. run-recovery.ts now marks orphaned runs at boot; the
-- status constraint did not allow the value, so it could only stamp
-- interrupted_at. Allow 'interrupted' so the row itself tells the truth.
ALTER TABLE gap_assessments DROP CONSTRAINT IF EXISTS gap_assessments_status_check;
ALTER TABLE gap_assessments ADD CONSTRAINT gap_assessments_status_check
  CHECK (status IN ('draft', 'assessing', 'scoring', 'synthesising', 'complete', 'paused', 'interrupted'));
