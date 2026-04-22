-- ── 167_portal_surface_mode.sql ─────────────────────────────────────────────
-- Portals "bring-your-own-site" — adds surface_mode to the portals table.
--
-- Two modes:
--   'managed'  — ANTON hosts the HTML pages (existing default path).
--   'external' — user points at their self-hosted site at
--                external_primary_url. ANTON continues to host + sign
--                the capability descriptor and continues to proxy every
--                AAP verb invocation, so the trust chain is preserved
--                regardless of mode.

ALTER TABLE portals
  ADD COLUMN IF NOT EXISTS surface_mode TEXT NOT NULL DEFAULT 'managed';

-- CHECK constraint added as a separate statement so the ADD COLUMN stays
-- idempotent on re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portals_surface_mode_check'
  ) THEN
    ALTER TABLE portals
      ADD CONSTRAINT portals_surface_mode_check
      CHECK (surface_mode IN ('managed', 'external'));
  END IF;
END $$;

ALTER TABLE portals
  ADD COLUMN IF NOT EXISTS external_primary_url TEXT;

ALTER TABLE portals
  ADD COLUMN IF NOT EXISTS external_url_verified_at TIMESTAMPTZ;

-- Integrity: when surface_mode='external', external_primary_url must be set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portals_external_url_required'
  ) THEN
    ALTER TABLE portals
      ADD CONSTRAINT portals_external_url_required
      CHECK (surface_mode = 'managed' OR external_primary_url IS NOT NULL);
  END IF;
END $$;
