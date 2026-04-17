-- Migration 128: Risk Atlas — pack_kind classifier
--
-- Distinguishes the three pack types that share atlas_industry_packs:
--   • industry  — sector / vertical packs (default; sme-general, fcp-bank, …)
--   • fcp-domain — FCP domain overlays (fcp-domain-amlcft, …)
--   • overlay   — cross-cutting universal overlays (universal-fcp-core, …)
--
-- Backfills existing rows to 'industry' so the API surface stays
-- backwards compatible. The pack-loader sets it from the manifest's
-- "pack_kind" field on the next seed.

ALTER TABLE atlas_industry_packs
  ADD COLUMN IF NOT EXISTS pack_kind TEXT NOT NULL DEFAULT 'industry'
  CHECK (pack_kind IN ('industry', 'fcp-domain', 'overlay'));

CREATE INDEX IF NOT EXISTS ix_atlas_packs_kind ON atlas_industry_packs(pack_kind);
