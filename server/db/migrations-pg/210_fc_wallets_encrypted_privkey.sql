-- Phase 2 (May 20 2026) — replace fc-wallet-service stub with real
-- Ed25519 keys via @futurechain/sdk. Wallet privkey is stored encrypted
-- at rest using AES-256-GCM keyed off INSTANCE_KEY_ENCRYPTION_KEY
-- (the same env-var pattern instance_identity uses, see
-- server/util/at-rest-encryption.ts).
--
-- Columns added (all nullable for backward-compat with stub-mode rows):
--   pubkey                 — 32-byte Ed25519 public key
--   privkey_encrypted      — AES-256-GCM ciphertext ‖ 16-byte tag
--   privkey_iv             — 12-byte random IV (one per encrypt)
--   mnemonic_encrypted     — for human wallets only: BIP-39 24-word phrase
--                             encrypted at rest, surfaced ONCE to the UI
--                             for offline backup on wallet creation
--   mnemonic_iv            — 12-byte IV for the mnemonic ciphertext
--   sdk_schema_version     — 1 = legacy stub address only (pre-Phase-2)
--                             2 = real Ed25519 wallet (Phase 2 +)
--
-- All existing rows have sdk_schema_version DEFAULT 1; rows created by
-- the Phase 2 fc-wallet-service get version 2 + populated key columns.

ALTER TABLE fc_wallets ADD COLUMN IF NOT EXISTS pubkey             BYTEA;
ALTER TABLE fc_wallets ADD COLUMN IF NOT EXISTS privkey_encrypted  BYTEA;
ALTER TABLE fc_wallets ADD COLUMN IF NOT EXISTS privkey_iv         BYTEA;
ALTER TABLE fc_wallets ADD COLUMN IF NOT EXISTS mnemonic_encrypted BYTEA;
ALTER TABLE fc_wallets ADD COLUMN IF NOT EXISTS mnemonic_iv        BYTEA;
ALTER TABLE fc_wallets ADD COLUMN IF NOT EXISTS sdk_schema_version INTEGER NOT NULL DEFAULT 1;

-- Convenience index: query "all real wallets" without scanning the
-- legacy stub rows.
CREATE INDEX IF NOT EXISTS idx_fc_wallets_sdk_schema_version
  ON fc_wallets(sdk_schema_version);
