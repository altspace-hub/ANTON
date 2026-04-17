-- Migration 126: Risk Atlas — review fixes
--
-- Fixes flagged by the post-Phase-1e multi-expert review:
--   • atlas_appetite_statements: per-(atlas, threat_path) uniqueness was
--     only enforced at app layer; concurrent upsertAppetite calls could
--     produce duplicate rows. Add a partial unique index so ON CONFLICT
--     can take over.
--   • atlas_industry_packs.parent_pack_id: was a soft FK; deleting a
--     parent silently leaves children with dangling refs. Convert to
--     a proper FK with ON DELETE SET NULL.
--   • risk_atlases.industry_pack_id: same pattern. SET NULL on delete
--     rather than dangling.

-- ── atlas_appetite_statements — partial unique index ─────────────────────
-- Ensures one appetite statement per (atlas, threat_path). Company-wide
-- statements (threat_path_id IS NULL) are intentionally excluded so an
-- atlas can carry multiple Stage 7b rollups over time.

CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_appetite_path
  ON atlas_appetite_statements(atlas_id, threat_path_id)
  WHERE threat_path_id IS NOT NULL;

-- ── atlas_industry_packs.parent_pack_id — proper FK ──────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_atlas_packs_parent'
  ) THEN
    ALTER TABLE atlas_industry_packs
      ADD CONSTRAINT fk_atlas_packs_parent
      FOREIGN KEY (parent_pack_id) REFERENCES atlas_industry_packs(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ── risk_atlases.industry_pack_id — proper FK ────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_risk_atlases_pack'
  ) THEN
    ALTER TABLE risk_atlases
      ADD CONSTRAINT fk_risk_atlases_pack
      FOREIGN KEY (industry_pack_id) REFERENCES atlas_industry_packs(id)
      ON DELETE SET NULL;
  END IF;
END
$$;
