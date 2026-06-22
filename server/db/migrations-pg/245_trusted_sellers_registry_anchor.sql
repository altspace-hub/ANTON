-- ═══════════════════════════════════════════════════════════════════
-- 245_trusted_sellers_registry_anchor.sql — Trusted Stores trust-root upgrade.
--
-- A pin can now be anchored to the relay registry's INDEPENDENTLY-verified
-- signing key (the relay verified it at KYC'd submit), not just the key embedded
-- in the (self-signed) descriptor. registry_verified=true means the relay's
-- record confirmed this key for this address at pin time; registry_key_mismatch
-- means the locally-cached descriptor carried a DIFFERENT key than the relay's
-- (possible cache poisoning) — the relay's authoritative key was pinned and the
-- discrepancy flagged. PostgreSQL only.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE trusted_sellers
  ADD COLUMN IF NOT EXISTS registry_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS registry_key_mismatch BOOLEAN NOT NULL DEFAULT FALSE;
