-- Migration 094: App Gateway — Companion App Infrastructure
-- Turns every ANTON deployment into an organisational intelligence hub.
-- Organisations run ANTON; people they serve connect via a lightweight companion app.

-- ── 1. Organisation Profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  org_type TEXT NOT NULL CHECK (org_type IN ('school', 'ngo', 'sports_club', 'consulting', 'consulting_firm', 'company', 'community', 'government', 'healthcare', 'other')),
  description TEXT,
  welcome_message TEXT,
  logo_path TEXT,
  primary_color TEXT DEFAULT '#2A6459',
  branding JSONB DEFAULT '{}',
  default_model TEXT DEFAULT 'claude-sonnet-4-5-20250929',
  default_thinking TEXT DEFAULT 'think' CHECK (default_thinking IN ('quick', 'think', 'think_hard', 'investigate', 'plan_first')),
  max_thinking_level TEXT DEFAULT 'think_hard' CHECK (max_thinking_level IN ('quick', 'think', 'think_hard', 'investigate', 'plan_first')),
  allow_reasoning_view BOOLEAN DEFAULT FALSE,
  allow_file_upload BOOLEAN DEFAULT FALSE,
  allow_voice_input BOOLEAN DEFAULT FALSE,
  max_tokens_per_query INTEGER DEFAULT 4096,
  max_queries_per_day INTEGER DEFAULT 100,
  default_output_language TEXT DEFAULT 'en',
  supported_languages JSONB DEFAULT '["en"]',
  force_output_language BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Intent Categories (per-org routing config) ────────────────────────────
CREATE TABLE IF NOT EXISTS org_intent_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  allowed_areas JSONB DEFAULT '[]',
  allowed_modules JSONB DEFAULT '[]',
  default_module_id TEXT,
  system_prompt_addon TEXT,
  persona_id TEXT,
  knowledge_scope JSONB DEFAULT '{}',
  icon TEXT DEFAULT 'MessageSquare',
  max_thinking_level TEXT CHECK (max_thinking_level IS NULL OR max_thinking_level IN ('quick', 'think', 'think_hard', 'investigate', 'plan_first')),
  required_output_language TEXT,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Connected Users (app users) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connected_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  contact_hash TEXT NOT NULL UNIQUE,
  public_key TEXT,
  display_name TEXT,
  metadata JSONB DEFAULT '{}',
  preferred_language TEXT DEFAULT 'en',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Connected User ↔ Org junction (M:N) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS connected_user_orgs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  connected_user_id TEXT NOT NULL REFERENCES connected_users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (connected_user_id, org_id)
);

-- ── 5. Invitations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  invitation_type TEXT DEFAULT 'single' CHECK (invitation_type IN ('single', 'multi', 'permanent')),
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  label TEXT,
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. App Sessions (conversations) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  connected_user_id TEXT NOT NULL REFERENCES connected_users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  intent_category_id TEXT REFERENCES org_intent_categories(id) ON DELETE SET NULL,
  resolved_area_id TEXT,
  resolved_module_id TEXT,
  title TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_thinking_tokens INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  output_language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. App Messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  session_id TEXT NOT NULL REFERENCES app_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  thinking_content TEXT,
  content_blocks JSONB,
  voice_input BOOLEAN DEFAULT FALSE,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. App Analytics (daily aggregates) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_analytics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_queries INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  intent_breakdown JSONB DEFAULT '{}',
  topic_clusters JSONB DEFAULT '{}',
  avg_response_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, date)
);

-- ── 9. Auth Nonces (challenge-response) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_auth_nonces (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  nonce TEXT NOT NULL UNIQUE,
  contact_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 10. Session Tokens (authenticated app users) ─────────────────────────────
CREATE TABLE IF NOT EXISTS app_session_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  token TEXT NOT NULL UNIQUE,
  connected_user_id TEXT NOT NULL REFERENCES connected_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 11. Announcements (pinned org messages for app users) ────────────────────
CREATE TABLE IF NOT EXISTS org_announcements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  is_pinned BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── RBAC: connected_user role ─────────────────────────────────────────────────
-- The `roles` and `permissions` tables are not yet migrated to PostgreSQL.
-- App user authorization is enforced by the app-auth middleware + per-org
-- membership checks. When RBAC tables are migrated, seed with:
--   INSERT INTO roles (id, name, description, is_system)
--     VALUES ('connected_user', 'Connected App User', 'Companion app user with scoped access', 1)
--     ON CONFLICT (name) DO NOTHING;
--   INSERT INTO permissions (id, name, resource, action, description)
--     VALUES ('perm_module_execute', 'module.execute', 'module', 'execute', 'Execute modules via app gateway'),
--            ('perm_session_read', 'session.read', 'session', 'read', 'Read own app sessions')
--     ON CONFLICT (resource, action) DO NOTHING;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_org_intent_categories_org ON org_intent_categories(org_id);
CREATE INDEX IF NOT EXISTS idx_connected_users_contact_hash ON connected_users(contact_hash);
CREATE INDEX IF NOT EXISTS idx_connected_user_orgs_user ON connected_user_orgs(connected_user_id);
CREATE INDEX IF NOT EXISTS idx_connected_user_orgs_org ON connected_user_orgs(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(connected_user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_org ON app_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_app_messages_session ON app_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_app_auth_nonces_nonce ON app_auth_nonces(nonce);
CREATE INDEX IF NOT EXISTS idx_app_session_tokens_token ON app_session_tokens(token);
CREATE INDEX IF NOT EXISTS idx_app_analytics_org_date ON app_analytics(org_id, date);
CREATE INDEX IF NOT EXISTS idx_org_announcements_org ON org_announcements(org_id);
