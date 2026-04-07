-- Migration 111: Specialized Agent System
-- Pre-configured AI personas for autonomous business functions.
-- Agents handle inbound tasks/queries with domain-specific knowledge, connectors, and routing.

-- ── Agent Profiles ────────────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_agent_profiles_status ON agent_profiles(status);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_slug ON agent_profiles(slug);

-- ── Agent Conversations ───────────────────────────────────────────────────────

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
  satisfaction_score INTEGER
    CHECK (satisfaction_score IS NULL OR (satisfaction_score >= 1 AND satisfaction_score <= 5)),
  metadata JSONB DEFAULT '{}',
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent ON agent_conversations(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_status ON agent_conversations(status);

-- ── Agent Messages ────────────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_agent_messages_conv ON agent_messages(conversation_id, created_at ASC);

-- ── Agent Connectors ──────────────────────────────────────────────────────────

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

CREATE INDEX IF NOT EXISTS idx_agent_connectors_agent ON agent_connectors(agent_id);

-- ── Agent Templates ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('support', 'sales', 'travel', 'hr', 'procurement', 'booking',
                         'legal', 'finance', 'compliance', 'general', 'custom')),
  description TEXT NOT NULL,
  icon TEXT DEFAULT 'Bot',
  default_config JSONB NOT NULL DEFAULT '{}',
  suggested_connectors JSONB DEFAULT '[]',
  suggested_knowledge JSONB DEFAULT '[]',
  setup_questions JSONB DEFAULT '[]',
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Agent Audit Log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  conversation_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_agent ON agent_audit_log(agent_id, created_at DESC);

-- ── Link agents to intent categories (app gateway integration) ────────────────

ALTER TABLE org_intent_categories ADD COLUMN IF NOT EXISTS agent_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL;

-- ── Seed built-in templates ───────────────────────────────────────────────────

INSERT INTO agent_templates (id, name, category, description, icon, default_config, is_system) VALUES
('tmpl_support', 'Support Agent', 'support',
 'Customer support specialist. Answers questions using knowledge base documents, escalates complex issues.',
 'Headset', '{"default_thinking": "think", "escalation_policy": "notify", "max_conversation_turns": 15, "routing_keywords": ["help", "support", "issue", "problem", "bug", "error", "broken", "fix"]}', TRUE),

('tmpl_sales', 'Sales Agent', 'sales',
 'Sales assistant with product knowledge. Handles inquiries, generates quotes, manages opportunities.',
 'TrendingUp', '{"default_thinking": "think", "routing_keywords": ["price", "quote", "buy", "order", "product", "demo", "trial", "discount", "pricing"]}', TRUE),

('tmpl_travel', 'Travel Agent', 'travel',
 'Travel coordinator. Helps with booking flights, trains, hotels, taxis, and travel planning.',
 'Plane', '{"default_thinking": "think", "routing_keywords": ["book", "flight", "train", "taxi", "hotel", "travel", "trip", "reservation"]}', TRUE),

('tmpl_hr', 'HR Agent', 'hr',
 'HR assistant. Handles employee queries about policies, benefits, leave, and onboarding.',
 'Users', '{"default_thinking": "think", "escalation_policy": "human_only", "routing_keywords": ["leave", "vacation", "policy", "benefits", "payroll", "onboarding", "holiday"]}', TRUE),

('tmpl_procurement', 'Procurement Agent', 'procurement',
 'Procurement specialist. Checks inventory, manages orders, tracks deliveries, handles vendor queries.',
 'ShoppingCart', '{"default_thinking": "think", "routing_keywords": ["order", "supplier", "inventory", "purchase", "delivery", "vendor", "stock"]}', TRUE),

('tmpl_booking', 'Meeting & Booking Agent', 'booking',
 'Scheduling assistant. Books meeting rooms, manages calendars, coordinates availability.',
 'Calendar', '{"default_thinking": "quick", "routing_keywords": ["meeting", "book", "schedule", "room", "calendar", "availability", "slot"]}', TRUE),

('tmpl_legal', 'Legal Assistant', 'legal',
 'Legal research assistant. Reviews documents, finds precedents, drafts summaries. Escalates for legal advice.',
 'Scale', '{"default_thinking": "think_hard", "escalation_policy": "human_only", "routing_keywords": ["contract", "legal", "compliance", "regulation", "clause", "liability"]}', TRUE),

('tmpl_finance', 'Finance Assistant', 'finance',
 'Financial analyst. Handles budget queries, expense reports, invoice processing, forecasting.',
 'Calculator', '{"default_thinking": "think", "routing_keywords": ["invoice", "expense", "budget", "forecast", "report", "payment", "cost"]}', TRUE)

ON CONFLICT (id) DO NOTHING;
