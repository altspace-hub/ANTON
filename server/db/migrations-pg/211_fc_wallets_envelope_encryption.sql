-- Phase B3 (May 20 2026) — Per-wallet envelope encryption.
--
-- Until this migration, fc-wallet-service encrypted every wallet's
-- privkey + mnemonic with the same INSTANCE_KEY_ENCRYPTION_KEY. A
-- compromise of the master key meant every wallet on the instance was
-- decryptable.
--
-- Phase B3 derives a per-wallet AES key:
--   wallet_key = PBKDF2(INSTANCE_KEY_ENCRYPTION_KEY,
--                       salt = sha256("fc_wallets:" || wallet_id),
--                       100_000 iterations,
--                       sha256,
--                       32 bytes)
--
-- The derivation salt is deterministic from the row's `id` so we don't
-- need a separate salt column. The master key never touches AES-GCM
-- directly — only as the PBKDF2 password.
--
-- `key_version` discriminates the decryption path:
--   1 = legacy: privkey_encrypted / mnemonic_encrypted were AES-GCM-
--       encrypted under the master key directly. All rows written by
--       migration 210 are version 1.
--   2 = envelope: AES-GCM under a PBKDF2-derived per-wallet key.
--       All NEW rows created by fc-wallet-service after this migration
--       lands are version 2.
--
-- Existing v1 rows remain readable via the legacy path in
-- at-rest-encryption.ts:decryptBlob. Re-creating a wallet automatically
-- produces a v2 row; a dedicated migrateWalletToV2(walletId) helper
-- exists for operators who want to re-key in-place.

ALTER TABLE fc_wallets
  ADD COLUMN IF NOT EXISTS key_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_fc_wallets_key_version
  ON fc_wallets(key_version);

COMMENT ON COLUMN fc_wallets.key_version IS
  'At-rest encryption envelope version: 1=direct master-key AES-GCM (legacy), 2=PBKDF2-derived per-wallet AES-GCM. See server/util/at-rest-encryption.ts.';
