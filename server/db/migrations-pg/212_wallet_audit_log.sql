-- Phase B4 (May 20 2026) — wallet-access audit log.
--
-- Every privkey decryption, wallet creation, transaction signing, and
-- restore writes a row here. Cross-instance correlation goes through
-- `request_id`. Two queries the auditor will ask for:
--
--   SELECT wallet_id, COUNT(*) FROM wallet_audit_log
--   WHERE action = 'get_decrypted_privkey' AND ts > NOW() - INTERVAL '1 hour'
--   GROUP BY wallet_id ORDER BY count DESC;
--
--   SELECT * FROM wallet_audit_log
--   WHERE wallet_id = $1 ORDER BY ts DESC LIMIT 100;
--
-- The `result` discriminator (ok | denied | error) lets dashboards
-- separate "normal signing" from "denied attempts" without parsing
-- error_code. `details` is reserved for non-PII metadata (amount,
-- recipient address — already public on-chain, never the plaintext key).

CREATE TABLE IF NOT EXISTS wallet_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  component   TEXT NOT NULL,
  action      TEXT NOT NULL,
  wallet_id   TEXT,
  actor       TEXT,
  request_id  TEXT,
  result      TEXT NOT NULL CHECK (result IN ('ok', 'denied', 'error')),
  error_code  TEXT,
  details     JSONB
);

CREATE INDEX IF NOT EXISTS idx_wallet_audit_log_ts
  ON wallet_audit_log(ts DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_audit_log_wallet_id_ts
  ON wallet_audit_log(wallet_id, ts DESC)
  WHERE wallet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_audit_log_component_action_ts
  ON wallet_audit_log(component, action, ts DESC);

COMMENT ON TABLE wallet_audit_log IS
  'Append-only audit trail of every wallet decryption / signing / creation event. Phase B4 (May 20 2026).';
