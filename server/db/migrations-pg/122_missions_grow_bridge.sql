-- Migration 122: ANTON Missions — Grow CRM bridge
--
-- Spec v2 §13.3: Sales-style mission outputs go to Grow tables, not to a
-- parallel mission_data_rows. This migration adds a `mission_id` column to
-- the three Grow target tables so we can filter "what did this mission
-- produce" without scraping `created_by` strings.
--
-- The column is a SOFT FK (no constraint to missions.missions) because Grow
-- rows must outlive the originating mission — a contact captured by a 30-day
-- mission still belongs to the user when the mission completes/aborts.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grow_contacts' AND column_name = 'mission_id'
  ) THEN
    ALTER TABLE grow_contacts ADD COLUMN mission_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_grow_contacts_mission ON grow_contacts(mission_id)
      WHERE mission_id IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grow_opportunities' AND column_name = 'mission_id'
  ) THEN
    ALTER TABLE grow_opportunities ADD COLUMN mission_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_grow_opportunities_mission ON grow_opportunities(mission_id)
      WHERE mission_id IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grow_signals' AND column_name = 'mission_id'
  ) THEN
    ALTER TABLE grow_signals ADD COLUMN mission_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_grow_signals_mission ON grow_signals(mission_id)
      WHERE mission_id IS NOT NULL;
  END IF;
END
$$;
