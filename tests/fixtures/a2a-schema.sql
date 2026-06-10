-- a2a-schema.sql — minimal DDL for the two-instance A2A verification ladder
-- (tests/a2a/). Extracted from the canonical migrations so each in-process
-- "instance" gets exactly the tables the community / p2p / agents / missions
-- / beehive route factories touch, on an ISOLATED database.
--
-- Sources (keep in sync if these change):
--   community_identity / community_connections / community_mail
--       routes/community.ts inline DDL + migrations 077, 079, 085, 086,
--       089, 102, 208
--   community_message_queue        migration 077 + 089 + 220 (CHECK fix)
--   p2p_message_nonces             migration 110
--   agent_*                        migration 111
--   missions.*                     migrations 115, 120, 209, 220 (CHECK fix)
--   beehive_*                      migrations 113 + 114
--
-- NOTE: mission_delegation_log carries NO CHECK on event and
-- community_message_queue.delivery_method allows 'https'/'mesh' — this is the
-- post-migration-220 state. Migration 220 exists because the pre-220 CHECKs
-- broke the accept-notify loop and every successful remote delivery.

-- ── users (FK target for missions.missions.created_by) ─────────────────────

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst',
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO users (id, username, password_hash, role, display_name)
VALUES ('default', 'default', 'test-fixture', 'analyst', 'Default User')
ON CONFLICT (id) DO NOTHING;

-- ── Community identity + connections ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_identity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  contact_hash TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  x25519_public_key TEXT,
  x25519_private_key_encrypted TEXT,
  key_encryption_salt TEXT,
  key_encryption_iv TEXT,
  payment_address TEXT,
  payment_name TEXT,
  payment_country TEXT,
  agent_wallet_address TEXT,
  agent_wallet_name TEXT,
  auto_accept_connections INTEGER NOT NULL DEFAULT 0,
  profile_visibility TEXT NOT NULL DEFAULT 'private'
);

CREATE TABLE IF NOT EXISTS community_connections (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL DEFAULT 'default',
  contact_hash TEXT NOT NULL,
  display_name TEXT,
  public_key TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  import_policy TEXT NOT NULL DEFAULT 'ask_first',
  auto_accept_types JSONB DEFAULT '[]'::jsonb,
  delegation_trust_level TEXT NOT NULL DEFAULT 'manual',
  delegation_policy JSONB DEFAULT '{}'::jsonb,
  tasks_delegated INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  avg_task_quality DOUBLE PRECISION,
  payment_address TEXT,
  payment_name TEXT,
  payment_country TEXT,
  payment_street TEXT,
  payment_city TEXT,
  payment_postal_code TEXT,
  agent_wallet_address TEXT,
  agent_wallet_name TEXT,
  x25519_public_key TEXT,
  endpoint TEXT,
  peer_instance_pubkey TEXT,
  peer_relay_endpoints JSONB,
  preferred_transport TEXT NOT NULL DEFAULT 'auto'
    CHECK (preferred_transport IN ('mesh', 'https', 'auto')),
  last_mesh_success_at TIMESTAMPTZ,
  last_https_success_at TIMESTAMPTZ,
  mesh_demoted_until TIMESTAMPTZ,
  UNIQUE (owner_user_id, contact_hash)
);

-- ── Community mail + delivery queue + replay nonces ─────────────────────────

CREATE TABLE IF NOT EXISTS community_mail (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  from_hash TEXT NOT NULL,
  to_hashes TEXT NOT NULL DEFAULT '[]',
  cc_hashes TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '(no subject)',
  body TEXT NOT NULL DEFAULT '',
  thread_id TEXT,
  parent_id TEXT,
  folder TEXT NOT NULL DEFAULT 'inbox'
    CHECK (folder IN ('inbox', 'sent', 'drafts', 'starred', 'archive', 'trash')),
  starred INTEGER NOT NULL DEFAULT 0,
  draft INTEGER NOT NULL DEFAULT 0,
  read_by TEXT NOT NULL DEFAULT '[]',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_type TEXT NOT NULL DEFAULT 'text',
  payload JSONB,
  payload_metadata JSONB,
  delivery_status TEXT NOT NULL DEFAULT 'local',
  delivery_attempts INTEGER DEFAULT 0,
  last_delivery_attempt TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_community_mail_folder ON community_mail(folder, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_mail_type   ON community_mail(message_type);

CREATE TABLE IF NOT EXISTS community_message_queue (
  id TEXT PRIMARY KEY,
  mail_id TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  payload_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  delivery_method TEXT DEFAULT 'local'
    CHECK (delivery_method IN ('local', 'http', 'https', 'mesh', 'relay')),
  last_http_status INTEGER
);

CREATE INDEX IF NOT EXISTS idx_message_queue_status ON community_message_queue(status, next_retry_at);

CREATE TABLE IF NOT EXISTS p2p_message_nonces (
  sender_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sender_hash, nonce)
);

-- knowledge_atoms — best-effort context lookups in agent-processor / p2p
-- knowledge-query. Kept minimal; empty is fine.
CREATE TABLE IF NOT EXISTS knowledge_atoms (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  atom_type TEXT,
  category TEXT,
  confidence DOUBLE PRECISION DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  mission_id TEXT,
  mission_scope TEXT
);

-- ── Specialized agents (migration 111, minus seeds) ─────────────────────────

CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  role_description TEXT NOT NULL,
  avatar TEXT DEFAULT 'Bot',
  greeting_message TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  system_prompt TEXT NOT NULL,
  persona_id TEXT,
  default_model TEXT,
  default_thinking TEXT DEFAULT 'think'
    CHECK (default_thinking IN ('quick', 'think', 'think_hard', 'investigate', 'plan_first')),
  max_tokens INTEGER DEFAULT 16384,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  knowledge_collection_ids JSONB DEFAULT '[]',
  knowledge_pack_ids JSONB DEFAULT '[]',
  knowledge_atom_scopes JSONB DEFAULT '[]',
  rag_search_enabled BOOLEAN DEFAULT TRUE,
  web_search_enabled BOOLEAN DEFAULT FALSE,
  allowed_modules JSONB DEFAULT '[]',
  allowed_areas JSONB DEFAULT '[]',
  routing_keywords JSONB DEFAULT '[]',
  routing_patterns JSONB DEFAULT '[]',
  routing_priority INTEGER DEFAULT 0,
  fallback_agent_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  escalation_policy TEXT DEFAULT 'notify'
    CHECK (escalation_policy IN ('notify', 'redirect', 'human_only', 'queue')),
  escalation_conditions JSONB DEFAULT '{}',
  max_conversation_turns INTEGER DEFAULT 20,
  connectors JSONB DEFAULT '[]',
  availability_schedule JSONB DEFAULT '{}',
  offline_message TEXT,
  auto_response_enabled BOOLEAN DEFAULT TRUE,
  total_conversations INTEGER DEFAULT 0,
  total_messages_handled INTEGER DEFAULT 0,
  avg_satisfaction_score NUMERIC(3,2),
  total_escalations INTEGER DEFAULT 0,
  created_by TEXT DEFAULT 'default',
  org_id TEXT,
  template_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'direct'
    CHECK (source IN ('direct', 'p2p', 'app_gateway', 'task_delegation', 'webhook')),
  source_ref TEXT,
  requester_hash TEXT,
  requester_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'escalated', 'completed', 'abandoned')),
  escalated_to TEXT,
  escalation_reason TEXT,
  satisfaction_score INTEGER,
  metadata JSONB DEFAULT '{}',
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  thinking_content TEXT,
  tool_calls JSONB,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_connectors (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  connector_type TEXT NOT NULL
    CHECK (connector_type IN ('rest_api', 'webhook', 'database', 'email', 'calendar', 'crm', 'erp', 'custom')),
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  auth_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT DEFAULT 'Bot',
  default_config JSONB NOT NULL DEFAULT '{}',
  suggested_connectors JSONB DEFAULT '[]',
  suggested_knowledge JSONB DEFAULT '[]',
  setup_questions JSONB DEFAULT '[]',
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  conversation_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Missions schema (migrations 115 + 120 + 209 + 220) ──────────────────────

CREATE SCHEMA IF NOT EXISTS missions;

CREATE TABLE IF NOT EXISTS missions.mission_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  pillar TEXT NOT NULL DEFAULT 'work',
  category TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  parameters_schema JSONB NOT NULL DEFAULT '[]',
  task_graph_template JSONB NOT NULL DEFAULT '{}',
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS missions.missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  context TEXT,
  success_criteria TEXT NOT NULL,
  autonomy_level TEXT NOT NULL DEFAULT 'check_in'
    CHECK (autonomy_level IN ('check_in', 'briefing', 'full_autonomy')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'briefed', 'active', 'paused', 'review', 'completed', 'aborted')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  token_budget_max BIGINT NOT NULL DEFAULT 5000000,
  token_budget_consumed BIGINT NOT NULL DEFAULT 0,
  time_budget_max_seconds INTEGER NOT NULL DEFAULT 604800,
  time_active_max_seconds INTEGER NOT NULL DEFAULT 86400,
  time_active_consumed_seconds INTEGER NOT NULL DEFAULT 0,
  financial_budget_max NUMERIC(12,2) NOT NULL DEFAULT 0,
  financial_budget_consumed NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_scope JSONB NOT NULL DEFAULT '{}',
  notification_preferences JSONB NOT NULL DEFAULT '{}',
  model_strategy JSONB NOT NULL DEFAULT '{}',
  template_id TEXT REFERENCES missions.mission_templates(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deadline TIMESTAMPTZ,
  mission_summary TEXT,
  mission_summary_updated_at TIMESTAMPTZ,
  origin_delegation_id TEXT
);

CREATE TABLE IF NOT EXISTS missions.mission_tasks (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  parent_task_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL
    CHECK (task_type IN ('llm', 'research', 'analysis', 'export', 'review', 'notification',
                          'checkpoint', 'conditional', 'parallel_group', 'browser', 'api_call', 'database_query')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'active', 'completed', 'failed', 'skipped', 'blocked', 'paused')),
  priority INTEGER NOT NULL DEFAULT 0,
  module_id TEXT,
  area_id TEXT,
  module_config JSONB NOT NULL DEFAULT '{}',
  provider TEXT,
  model TEXT,
  model_tier TEXT,
  estimated_tokens INTEGER,
  actual_tokens_consumed INTEGER NOT NULL DEFAULT 0,
  estimated_duration_seconds INTEGER,
  actual_duration_seconds INTEGER,
  output_summary TEXT,
  output_full TEXT,
  quality_score NUMERIC(4,3),
  confidence_score NUMERIC(4,3),
  atoms_produced INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS missions.mission_task_dependencies (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES missions.mission_tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES missions.mission_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'blocking'
    CHECK (dependency_type IN ('blocking', 'informational')),
  UNIQUE (task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS missions.mission_activity (
  id BIGSERIAL PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activity_type TEXT NOT NULL,
  description TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  tokens_consumed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS missions.mission_delegations (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  mission_id TEXT REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  sub_mission_id TEXT REFERENCES missions.missions(id) ON DELETE SET NULL,
  peer_contact_hash TEXT NOT NULL,
  peer_display_name TEXT,
  peer_endpoint TEXT,
  brief_title TEXT NOT NULL,
  brief_objective TEXT NOT NULL,
  brief_context JSONB NOT NULL DEFAULT '{}',
  required_modules JSONB NOT NULL DEFAULT '[]',
  brief_tasks JSONB,
  expected_output TEXT,
  deadline TIMESTAMPTZ,
  payment_amount_ftc NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'received', 'accepted', 'declined', 'in_progress',
                       'completed', 'approved', 'rejected', 'cancelled', 'failed')),
  signed_payload JSONB,
  signature_verified BOOLEAN,
  signature_verified_at TIMESTAMPTZ,
  result_payload JSONB,
  result_files JSONB DEFAULT '[]',
  result_signed_payload JSONB,
  result_signature_verified BOOLEAN,
  rejection_reason TEXT,
  outbound_mail_id TEXT,
  outbound_queue_id TEXT,
  inbound_mail_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

-- Post-migration-220 state: no CHECK on event (append-only audit vocabulary).
CREATE TABLE IF NOT EXISTS missions.mission_delegation_log (
  id BIGSERIAL PRIMARY KEY,
  delegation_id TEXT NOT NULL REFERENCES missions.mission_delegations(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  actor TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Beehive (migrations 113 + 114) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beehive_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('deliberation', 'build', 'review', 'brainstorm')),
  status TEXT NOT NULL DEFAULT 'forming'
    CHECK (status IN ('forming', 'active', 'converging', 'concluded', 'archived')),
  governance JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 12,
  ttl_hours INTEGER,
  current_round INTEGER NOT NULL DEFAULT 0,
  consensus_temperature NUMERIC(4,3) NOT NULL DEFAULT 0.0
    CHECK (consensus_temperature >= 0.0 AND consensus_temperature <= 1.0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beehive_participants (
  id BIGSERIAL PRIMARY KEY,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  anton_contact_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('queen', 'worker', 'scout', 'observer')),
  disclosure_policy JSONB NOT NULL DEFAULT '{}',
  invitation_status TEXT NOT NULL DEFAULT 'invited'
    CHECK (invitation_status IN ('invited', 'joined', 'declined', 'left')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'idle', 'left')),
  contribution_count INTEGER NOT NULL DEFAULT 0,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  UNIQUE (hive_id, anton_contact_hash)
);

CREATE TABLE IF NOT EXISTS beehive_rounds (
  id BIGSERIAL PRIMARY KEY,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('opening', 'deliberation', 'convergence', 'dissent_capture')),
  summary TEXT,
  consensus_temperature NUMERIC(4,3) DEFAULT 0.0
    CHECK (consensus_temperature IS NULL OR (consensus_temperature >= 0.0 AND consensus_temperature <= 1.0)),
  contribution_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  UNIQUE (hive_id, round_number)
);

CREATE TABLE IF NOT EXISTS beehive_contributions (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  contributor_hash TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('position', 'evidence', 'challenge', 'synthesis', 'question', 'revision', 'dissent', 'build', 'review_note')),
  content TEXT NOT NULL,
  supporting_atoms JSONB DEFAULT '[]',
  references_contributions JSONB DEFAULT '[]',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  reasoning_trace TEXT,
  signature TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_beehive_contrib_hive_contrib_seq UNIQUE (hive_id, contributor_hash, sequence)
);

CREATE TABLE IF NOT EXISTS beehive_shared_atoms (
  id BIGSERIAL PRIMARY KEY,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  contribution_id TEXT REFERENCES beehive_contributions(id) ON DELETE CASCADE,
  source_anton_hash TEXT NOT NULL,
  original_atom_id TEXT,
  atom_type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence NUMERIC(4,3),
  domain TEXT,
  redacted BOOLEAN NOT NULL DEFAULT FALSE,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beehive_outputs (
  id TEXT PRIMARY KEY,
  hive_id TEXT NOT NULL UNIQUE REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  output_type TEXT NOT NULL
    CHECK (output_type IN ('synthesis_report', 'anton_bundle', 'artifact', 'raw_trail')),
  synthesis_text TEXT,
  dissents JSONB DEFAULT '[]',
  reasoning_trail JSONB DEFAULT '[]',
  convergence_path JSONB DEFAULT '[]',
  participant_approvals JSONB DEFAULT '{}',
  output_file_path TEXT,
  quality_score NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beehive_human_injections (
  id BIGSERIAL PRIMARY KEY,
  hive_id TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  applied_to_round INTEGER,
  injected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post-migration-220 state: NO FK on hive_id — inbound invites/state_syncs
-- are audited before the hive exists locally.
CREATE TABLE IF NOT EXISTS beehive_message_log (
  id BIGSERIAL PRIMARY KEY,
  hive_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  sender_hash TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  signature TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
