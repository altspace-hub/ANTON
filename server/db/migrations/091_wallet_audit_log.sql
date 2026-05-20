-- Phase B4 (May 20 2026) — SQLite parallel of migrations-pg/212_*.sql.

CREATE TABLE IF NOT EXISTS wallet_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL DEFAULT (datetime('now')),
  component   TEXT NOT NULL,
  action      TEXT NOT NULL,
  wallet_id   TEXT,
  actor       TEXT,
  request_id  TEXT,
  result      TEXT NOT NULL CHECK (result IN ('ok', 'denied', 'error')),
  error_code  TEXT,
  details     TEXT
);

CREATE INDEX IF NOT EXISTS idx_wallet_audit_log_ts
  ON wallet_audit_log(ts DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_audit_log_wallet_id_ts
  ON wallet_audit_log(wallet_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_audit_log_component_action_ts
  ON wallet_audit_log(component, action, ts DESC);
