-- Migration 080: D3 Signed Reasoning Trails + D6 Delegation Compliance Rules

-- ═══ D3: Signed Reasoning Trails ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS community_signed_trail_entries (
  id TEXT PRIMARY KEY,
  trail_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  entry_index INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  prev_hash TEXT,
  entry_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  signer_hash TEXT NOT NULL,
  signer_public_key TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signed_trail_task ON community_signed_trail_entries(task_id, entry_index);
CREATE INDEX IF NOT EXISTS idx_signed_trail_trail ON community_signed_trail_entries(trail_id);

CREATE TABLE IF NOT EXISTS community_trail_verifications (
  id TEXT PRIMARY KEY,
  trail_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  verification_result TEXT NOT NULL CHECK(verification_result IN ('valid','invalid','partial')),
  entries_checked INTEGER NOT NULL,
  entries_valid INTEGER NOT NULL,
  failure_details JSONB,
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trail_verifications_task ON community_trail_verifications(task_id);

-- Key encryption metadata on identity
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS key_encryption_salt TEXT;
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS key_encryption_iv TEXT;

-- ═══ D6: Delegation Compliance Rules ═════════════════════════════════════════

CREATE TABLE IF NOT EXISTS delegation_compliance_rules (
  id TEXT PRIMARY KEY,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK(rule_type IN (
    'block_data_sharing', 'require_review', 'restrict_modules',
    'restrict_contacts', 'restrict_trust_level', 'content_filter', 'custom'
  )),
  condition JSONB NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('block', 'flag', 'require_approval')),
  action_message TEXT,
  scope_type TEXT NOT NULL DEFAULT 'all' CHECK(scope_type IN ('all', 'contact', 'module', 'group')),
  scope_value TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delegation_compliance_active ON delegation_compliance_rules(active, priority);

CREATE TABLE IF NOT EXISTS delegation_compliance_evaluations (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  rule_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
  evaluation_result TEXT NOT NULL CHECK(evaluation_result IN ('allowed', 'blocked', 'flagged', 'approval_required')),
  reason TEXT,
  context_snapshot JSONB,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_eval_task ON delegation_compliance_evaluations(task_id);

-- Seed prebuilt compliance rules
INSERT INTO delegation_compliance_rules (id, rule_name, rule_type, condition, action, action_message, priority) VALUES
('dcr_no_client_names', 'Never share client names externally', 'content_filter',
 '{"type":"pattern","field":"description","pattern":"\\b(client|customer)\\s+(name|id|account)","flags":"i"}',
 'block', 'Task description contains client identifying information', 10),
('dcr_regulatory_review', 'Regulatory interpretations require human review', 'restrict_modules',
 '{"type":"module_list","modules":["amlr-gap","regulatory-analysis","compliance-assessment"],"mode":"deny"}',
 'require_approval', 'Regulatory module tasks require human approval before delegation', 20),
('dcr_min_trust', 'Minimum trust level for delegation', 'restrict_trust_level',
 '{"type":"trust_level","minimum":"suggested"}',
 'block', 'Contact must have at least suggested trust level', 30),
('dcr_pii_filter', 'Flag tasks containing PII patterns', 'content_filter',
 '{"type":"pattern","field":"description","pattern":"\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b|\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b","flags":"i"}',
 'flag', 'Task description may contain personal identifiable information', 40)
ON CONFLICT (id) DO NOTHING;
