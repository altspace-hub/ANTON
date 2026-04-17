-- Migration 129: Risk Atlas — Addendum review fixes
--
-- Closes the gaps surfaced by the multi-expert review of Phase 1f-1l:
--   • Race-safe company-wide appetite — partial UNIQUE on (atlas_id) WHERE
--     threat_path_id IS NULL, mirroring the per-path uq_atlas_appetite_path
--     index added in migration 126.
--   • Domain enum enforcement at the DB layer for bundle.primary_domain
--     and bundle_members.role_in_bundle, mirroring the API-layer Zod enum.
--
-- The service layer was patched in the same commit to fix tenancy and
-- the N+1 in computeCompanyAppetite.

-- ── atlas_appetite_statements — race-safe company-wide statement ─────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_appetite_company
  ON atlas_appetite_statements(atlas_id)
  WHERE threat_path_id IS NULL;

-- ── atlas_cross_domain_path_bundles.primary_domain — enum CHECK ──────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_xbundle_primary_domain'
  ) THEN
    ALTER TABLE atlas_cross_domain_path_bundles
      ADD CONSTRAINT chk_xbundle_primary_domain
      CHECK (
        primary_domain IS NULL OR
        primary_domain IN ('amlcft','sanctions','fraud','abc','market_abuse','tax_evasion_facilitation','export_controls','modern_slavery')
      );
  END IF;
END
$$;

-- ── atlas_cross_domain_path_bundle_members.role_in_bundle — enum CHECK ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_xbundle_member_role'
  ) THEN
    ALTER TABLE atlas_cross_domain_path_bundle_members
      ADD CONSTRAINT chk_xbundle_member_role
      CHECK (role_in_bundle IN ('entry','middle','exit','amplifier'));
  END IF;
END
$$;
