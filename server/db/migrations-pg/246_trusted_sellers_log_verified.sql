-- ═══════════════════════════════════════════════════════════════════
-- 246_trusted_sellers_log_verified.sql — Trusted Stores transparency-log proof.
--
-- log_verified is strictly STRONGER than registry_verified:
--   registry_verified  = the relay SAID this is the key (we trusted its answer).
--   log_verified       = the relay cryptographically PROVED it — a signed tree
--                        head (signed by the operator key we pin client-side)
--                        plus an inclusion proof whose leaf we recomputed from
--                        the resolved descriptor ourselves. Zero-trust-in-relay:
--                        even a compromised relay cannot equivocate without
--                        breaking the operator signature or the Merkle proof.
--
-- log_verified ⊂ registry_verified (no proof exists without a relay resolve).
-- PostgreSQL only.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE trusted_sellers
  ADD COLUMN IF NOT EXISTS log_verified BOOLEAN NOT NULL DEFAULT FALSE;
