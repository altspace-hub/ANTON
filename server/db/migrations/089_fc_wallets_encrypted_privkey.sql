-- Phase 2 (May 20 2026) — SQLite parallel of migrations-pg/210_*.sql.
-- See that file for the full rationale; this one just types-down to
-- SQLite (BYTEA → BLOB).

ALTER TABLE fc_wallets ADD COLUMN pubkey BLOB;
ALTER TABLE fc_wallets ADD COLUMN privkey_encrypted BLOB;
ALTER TABLE fc_wallets ADD COLUMN privkey_iv BLOB;
ALTER TABLE fc_wallets ADD COLUMN mnemonic_encrypted BLOB;
ALTER TABLE fc_wallets ADD COLUMN mnemonic_iv BLOB;
ALTER TABLE fc_wallets ADD COLUMN sdk_schema_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_fc_wallets_sdk_schema_version
  ON fc_wallets(sdk_schema_version);
