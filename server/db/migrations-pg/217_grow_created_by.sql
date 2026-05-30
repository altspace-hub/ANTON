-- Migration 217: Grow ownership — add created_by to the entities that lacked it
-- (Phase 3 follow-up). grow_contacts + grow_opportunities already had it; this
-- closes the cross-user enumeration leak on the rest. grow_pipeline_stages is
-- shared workspace config (seeded defaults) and intentionally stays unscoped.
--
-- Existing rows are backfilled to 'solo' — the single-user owner in solo mode
-- (the default deployment), so no pre-existing data disappears after the upgrade.
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded by to_regclass.

DO $$
BEGIN
  IF to_regclass('public.grow_organisations') IS NOT NULL THEN
    ALTER TABLE grow_organisations ADD COLUMN IF NOT EXISTS created_by TEXT;
    UPDATE grow_organisations SET created_by = 'solo' WHERE created_by IS NULL;
  END IF;

  IF to_regclass('public.grow_interactions') IS NOT NULL THEN
    ALTER TABLE grow_interactions ADD COLUMN IF NOT EXISTS created_by TEXT;
    UPDATE grow_interactions SET created_by = 'solo' WHERE created_by IS NULL;
  END IF;

  IF to_regclass('public.grow_activities') IS NOT NULL THEN
    ALTER TABLE grow_activities ADD COLUMN IF NOT EXISTS created_by TEXT;
    UPDATE grow_activities SET created_by = 'solo' WHERE created_by IS NULL;
  END IF;

  IF to_regclass('public.grow_signals') IS NOT NULL THEN
    ALTER TABLE grow_signals ADD COLUMN IF NOT EXISTS created_by TEXT;
    UPDATE grow_signals SET created_by = 'solo' WHERE created_by IS NULL;
  END IF;

  IF to_regclass('public.grow_briefings') IS NOT NULL THEN
    ALTER TABLE grow_briefings ADD COLUMN IF NOT EXISTS created_by TEXT;
    UPDATE grow_briefings SET created_by = 'solo' WHERE created_by IS NULL;
  END IF;

  IF to_regclass('public.grow_relationships') IS NOT NULL THEN
    ALTER TABLE grow_relationships ADD COLUMN IF NOT EXISTS created_by TEXT;
    UPDATE grow_relationships SET created_by = 'solo' WHERE created_by IS NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_grow_organisations_owner ON grow_organisations(created_by);
CREATE INDEX IF NOT EXISTS idx_grow_interactions_owner ON grow_interactions(created_by);
CREATE INDEX IF NOT EXISTS idx_grow_activities_owner ON grow_activities(created_by);
CREATE INDEX IF NOT EXISTS idx_grow_signals_owner ON grow_signals(created_by);
CREATE INDEX IF NOT EXISTS idx_grow_briefings_owner ON grow_briefings(created_by);
