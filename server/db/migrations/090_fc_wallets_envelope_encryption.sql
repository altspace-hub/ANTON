-- Phase B3 (May 20 2026) — SQLite parallel of migrations-pg/211_*.sql.
-- See that file for the rationale.

ALTER TABLE fc_wallets ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_fc_wallets_key_version
  ON fc_wallets(key_version);
