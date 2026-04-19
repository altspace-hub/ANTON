-- ──────────────────────────────────────────────────────────────────────────────
-- 144_hardware_hardening.sql — Phase 10.1 hardening pass.
--
-- Bundles the database changes from the double-take expert review:
--   - Missing index on hw_patch_stages.status
--   - UNIQUE (case_id, resolution_id) on diagnostic_case_outcomes (idempotent
--     outcome logging)
--   - Soft FK on hardware_projects.current_phase_id (prevents orphan)
--   - LISTEN/NOTIFY trigger on hw_community_review_queue for real-time
--     reviewer dashboards (no polling needed)
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Index on hw_patch_stages.status ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS ix_hw_patch_stages_status_lookup
  ON hw_patch_stages(status);

-- ── 2. UNIQUE on diagnostic_case_outcomes (idempotent logging) ───────────────
-- Use a partial unique constraint keyed on (case_id, resolution_id, contributor_id)
-- so the same person can't double-log a single resolution attempt, but different
-- contributors can each log their own outcome on the same resolution.

CREATE UNIQUE INDEX IF NOT EXISTS uq_diagnostic_case_outcomes_per_contributor
  ON diagnostic_case_outcomes(case_id, resolution_id, contributor_id)
  WHERE contributor_id IS NOT NULL;

-- ── 3. Soft FK on hardware_projects.current_phase_id ─────────────────────────
-- Constraint is DEFERRABLE INITIALLY DEFERRED so initial project + phase
-- creation in the same transaction works (project row inserted before its
-- phase rows; current_phase_id set after).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_hardware_projects_current_phase'
  ) THEN
    ALTER TABLE hardware_projects
      ADD CONSTRAINT fk_hardware_projects_current_phase
      FOREIGN KEY (current_phase_id)
      REFERENCES hardware_project_phases(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- ── 4. NOTIFY trigger on hw_community_review_queue ──────────────────────────
-- Fires on INSERT or status UPDATE so subscribed reviewer dashboards can
-- refresh without polling. Payload: JSON with id + kind + status.

CREATE OR REPLACE FUNCTION notify_hw_review_queue_change() RETURNS trigger AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'id', NEW.id,
    'submission_kind', NEW.submission_kind,
    'status', NEW.status,
    'family_id', NEW.source_family_id,
    'changed_at', NOW()
  );
  PERFORM pg_notify('hw_review_queue_change', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hw_review_queue_notify ON hw_community_review_queue;
CREATE TRIGGER trg_hw_review_queue_notify
  AFTER INSERT OR UPDATE OF status ON hw_community_review_queue
  FOR EACH ROW EXECUTE FUNCTION notify_hw_review_queue_change();
