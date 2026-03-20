-- Migration 087: FutureChain Payment Gateway — config + audit log

CREATE TABLE IF NOT EXISTS fc_gateway_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  api_key TEXT NOT NULL DEFAULT '',
  allow_balance_check BOOLEAN NOT NULL DEFAULT TRUE,
  allow_contact_lookup BOOLEAN NOT NULL DEFAULT TRUE,
  allow_send_payment BOOLEAN NOT NULL DEFAULT FALSE,
  allow_create_transaction BOOLEAN NOT NULL DEFAULT FALSE,
  max_per_transaction_ftc DOUBLE PRECISION DEFAULT 10.0,
  max_daily_spend_ftc DOUBLE PRECISION DEFAULT 50.0,
  require_approval_above_ftc DOUBLE PRECISION DEFAULT 5.0,
  allowed_contacts_only BOOLEAN DEFAULT TRUE,
  total_requests INTEGER DEFAULT 0,
  total_payments_ftc DOUBLE PRECISION DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fc_gateway_audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  caller_id TEXT,
  request_data JSONB,
  response_status TEXT NOT NULL,
  amount_ftc DOUBLE PRECISION,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gateway_audit_created ON fc_gateway_audit_log(created_at DESC);
