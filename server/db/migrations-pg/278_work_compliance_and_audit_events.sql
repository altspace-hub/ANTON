-- 278 — Work compliance rules and the request audit trail (Wave 6, 2026-09-17).
--
-- Compliance-as-Code had six recruitment rules and had never executed. Wave 6
-- seeds seven rules for Work deliverables (category 'work') and runs them
-- after every module answer; the category constraint did not allow 'work'.
--
-- audit_log is the per-model-call ledger. Mutating API requests (who changed
-- what, when, with which result) had no record at all — 168 of 171 route
-- files wrote nothing. audit_events holds one row per POST/PUT/PATCH/DELETE,
-- with the route pattern and never the body.

ALTER TABLE compliance_rules DROP CONSTRAINT IF EXISTS compliance_rules_category_check;
ALTER TABLE compliance_rules ADD CONSTRAINT compliance_rules_category_check
  CHECK (category IN ('kyc', 'transaction_monitoring', 'sanctions', 'reporting', 'governance', 'data_quality', 'operational', 'work'));

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  path_pattern TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_id TEXT,
  user_role TEXT,
  request_id TEXT,
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_pattern ON audit_events(path_pattern, occurred_at DESC);

-- The per-answer compliance lookup (GET /api/compliance/by-message/:id).
CREATE INDEX IF NOT EXISTS idx_rule_violations_affected_entity ON rule_violations(affected_entity);
CREATE INDEX IF NOT EXISTS idx_rule_executions_message_id ON rule_executions
  ((CASE WHEN execution_context LIKE '{%' THEN execution_context::jsonb ->> 'messageId' END));
