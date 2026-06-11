-- Migration 229: Marketplace listings store the actual bundle bytes (Wave 4.9)
--
-- Before this, marketplace_bundle_listings carried only bundle_hash +
-- bundle_size_bytes — POST /bundles/:id/download incremented a counter but
-- no bytes ever moved. BYTEA chosen over a file store for atomicity with the
-- listing row (same pattern as portal_assets.content, migration 146).
-- Size is capped in the service layer (~25 MB) with an honest error above.

ALTER TABLE marketplace_bundle_listings ADD COLUMN IF NOT EXISTS bundle_data BYTEA;
ALTER TABLE marketplace_bundle_listings ADD COLUMN IF NOT EXISTS bundle_stored_at TIMESTAMPTZ;
