-- Migration 114: BEEHIVE — concurrency safety constraints
--
-- Adds:
--   • UNIQUE (hive_id, contributor_hash, sequence) on beehive_contributions
--     so the per-(hive, contributor) monotonic sequence is enforced at the
--     DB level. Concurrent submitContribution calls that race on the
--     SELECT MAX → INSERT pattern now surface as constraint violations
--     instead of silent duplicates.
--
--   • INSERTs from the protocol layer can use ON CONFLICT (id) DO NOTHING
--     for idempotency on inbound replays. The PRIMARY KEY on
--     beehive_contributions.id and beehive_outputs.hive_id already enforce
--     uniqueness; this migration adds nothing for those — it's purely the
--     contribution sequence guard.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_beehive_contrib_hive_contrib_seq'
  ) THEN
    ALTER TABLE beehive_contributions
      ADD CONSTRAINT uq_beehive_contrib_hive_contrib_seq
      UNIQUE (hive_id, contributor_hash, sequence);
  END IF;
END
$$;
