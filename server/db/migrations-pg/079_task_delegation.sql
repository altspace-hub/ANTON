-- Migration 079: AAP Layer 2 — Task Delegation

-- Core task tracking table
CREATE TABLE IF NOT EXISTS community_delegated_tasks (
  id TEXT PRIMARY KEY,
  requester_hash TEXT NOT NULL,
  provider_hash TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  required_modules JSONB DEFAULT '[]',
  required_capabilities JSONB DEFAULT '[]',
  context TEXT,
  expected_output_format TEXT DEFAULT 'markdown',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN (
    'submitted','accepted','declined','in_progress',
    'clarification_needed','partial','completed','cancelled','failed'
  )),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('low','normal','high','critical')),
  deadline TIMESTAMPTZ,
  mail_id TEXT,
  response_mail_id TEXT,
  requester_capability_card JSONB,
  provider_capability_card JSONB,
  result_content TEXT,
  result_artifacts JSONB DEFAULT '[]',
  result_quality_score DOUBLE PRECISION,
  progress_percent INTEGER DEFAULT 0,
  current_step TEXT,
  steps_total INTEGER DEFAULT 0,
  steps_completed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delegated_tasks_status ON community_delegated_tasks(status);
CREATE INDEX IF NOT EXISTS idx_delegated_tasks_direction ON community_delegated_tasks(direction, status);
CREATE INDEX IF NOT EXISTS idx_delegated_tasks_requester ON community_delegated_tasks(requester_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegated_tasks_provider ON community_delegated_tasks(provider_hash, created_at DESC);

-- Task conversation messages
CREATE TABLE IF NOT EXISTS community_task_messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  sender_hash TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK(message_type IN (
    'status_change','clarification_request','clarification_response',
    'progress_update','partial_result','note'
  )),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task ON community_task_messages(task_id, created_at ASC);

-- Delegation trust on connections
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS delegation_trust_level TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS delegation_policy JSONB DEFAULT '{}';
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS tasks_delegated INTEGER DEFAULT 0;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS tasks_completed INTEGER DEFAULT 0;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS avg_task_quality DOUBLE PRECISION;
