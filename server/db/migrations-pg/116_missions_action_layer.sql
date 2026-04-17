-- Migration 116: ANTON Missions — Action Layer (Phase 2)
--
-- Adds the credential vault, browser automation tracking, and Service Pack
-- registry tables. All in the `missions` schema. Per ANTON_MISSIONS_SPEC_v2
-- §14, these enable the three interaction channels: API, Browser, MCP.
--
-- Cross-schema FK to public.users for credential_vault.created_by.
-- Browser action screenshots stored on the filesystem under
-- data/missions/screenshots/{mission_id}/{task_id}/ — only paths in DB.

-- ── credential_vault — encrypted credential storage ────────────────────────
-- Reuses the existing aes-256-gcm encrypt() helper from
-- server/services/credential-vault.ts. OAuth refresh tokens stored
-- separately so they can be rotated without touching the access token.

CREATE TABLE IF NOT EXISTS missions.credential_vault (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  credential_type             TEXT NOT NULL
    CHECK (credential_type IN ('api_key', 'oauth2', 'username_password',
                                'client_certificate', 'cookie_jar', 'bearer_token')),
  service_name                TEXT,
  encrypted_data              TEXT NOT NULL,           -- AES-256-GCM "iv:tag:cipher" string
  encryption_key_id           TEXT NOT NULL DEFAULT 'default',

  -- Scope (JSON arrays)
  allowed_mission_templates   JSONB NOT NULL DEFAULT '["*"]',
  allowed_services            JSONB NOT NULL DEFAULT '["*"]',

  -- OAuth-specific
  oauth_token_url             TEXT,
  oauth_refresh_token_encrypted TEXT,
  oauth_expires_at            TIMESTAMPTZ,
  oauth_scopes                TEXT,

  -- Metadata
  created_by                  TEXT NOT NULL REFERENCES public.users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at                TIMESTAMPTZ,
  expires_at                  TIMESTAMPTZ,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_credential_vault_service ON missions.credential_vault(service_name);
CREATE INDEX IF NOT EXISTS idx_credential_vault_active  ON missions.credential_vault(is_active);

-- ── credential_access_log — every read / refresh / rotate / revoke ─────────
-- Compliance requirement: 1-year retention.

CREATE TABLE IF NOT EXISTS missions.credential_access_log (
  id                          BIGSERIAL PRIMARY KEY,
  credential_id               TEXT NOT NULL REFERENCES missions.credential_vault(id) ON DELETE CASCADE,
  mission_id                  TEXT REFERENCES missions.missions(id) ON DELETE SET NULL,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  access_type                 TEXT NOT NULL
    CHECK (access_type IN ('read', 'refresh', 'rotate', 'revoke', 'create')),
  service_accessed            TEXT,
  success                     BOOLEAN NOT NULL DEFAULT TRUE,
  error_message               TEXT,
  timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cred_access_log_cred    ON missions.credential_access_log(credential_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cred_access_log_mission ON missions.credential_access_log(mission_id);

-- ── browser_sessions — Playwright session lifecycle ────────────────────────
-- Phase 2 will partition browser_actions by month; sessions stay unpartitioned.

CREATE TABLE IF NOT EXISTS missions.browser_sessions (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  browser                     TEXT NOT NULL DEFAULT 'chromium'
    CHECK (browser IN ('chromium', 'firefox', 'webkit')),
  headless                    BOOLEAN NOT NULL DEFAULT TRUE,
  status                      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'error')),

  -- Session data
  pages_visited               JSONB NOT NULL DEFAULT '[]',
  actions_count               INTEGER NOT NULL DEFAULT 0,
  screenshots_captured        JSONB NOT NULL DEFAULT '[]',
  cookies_snapshot_encrypted  TEXT,                                    -- encrypted cookie jar for session persistence

  -- Governance
  domains_allowed             JSONB NOT NULL DEFAULT '["*"]',
  forms_submitted             INTEGER NOT NULL DEFAULT 0,
  credential_ids_used         JSONB NOT NULL DEFAULT '[]',

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at                   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_browser_sessions_mission ON missions.browser_sessions(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_status  ON missions.browser_sessions(status);

-- ── browser_actions — every click / fill / navigate / extract ──────────────
-- Phase 2.5+ will convert this to a partitioned table by month.
-- Screenshots stored on filesystem; only paths in DB.

CREATE TABLE IF NOT EXISTS missions.browser_actions (
  id                          BIGSERIAL PRIMARY KEY,
  session_id                  TEXT NOT NULL REFERENCES missions.browser_sessions(id) ON DELETE CASCADE,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  action_type                 TEXT NOT NULL
    CHECK (action_type IN ('navigate', 'click', 'fill', 'select', 'upload', 'download',
                            'screenshot', 'extract', 'wait', 'scroll', 'evaluate', 'submit_form')),
  url                         TEXT,
  selector                    TEXT,
  value                       TEXT,                                    -- NEVER contains credentials (audit-verified)
  result_summary              TEXT,
  screenshot_before           TEXT,                                    -- relative path under data/missions/screenshots/
  screenshot_after            TEXT,
  success                     BOOLEAN NOT NULL DEFAULT TRUE,
  error_message               TEXT,
  llm_reasoning               TEXT                                     -- why the LLM chose this action (audit)
);

CREATE INDEX IF NOT EXISTS idx_browser_actions_session ON missions.browser_actions(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_browser_actions_mission ON missions.browser_actions(mission_id, timestamp DESC);

-- ── service_packs — registry of pre-built website knowledge ───────────────
-- A Service Pack tells ANTON exactly how a specific service works
-- (selectors, page maps, workflows). When loaded, ANTON skips LLM-guided
-- navigation for known sites.

CREATE TABLE IF NOT EXISTS missions.service_packs (
  id                          TEXT PRIMARY KEY,
  service_id                  TEXT NOT NULL UNIQUE,                    -- 'linkedin', 'eur-lex', 'google-ads'
  service_name                TEXT NOT NULL,
  version                     TEXT NOT NULL DEFAULT '1.0.0',
  author                      TEXT,
  description                 TEXT,
  category                    TEXT,                                    -- 'social' / 'regulatory' / 'advertising' / 'crm'
  interaction_type            TEXT NOT NULL DEFAULT 'browser'
    CHECK (interaction_type IN ('browser', 'api', 'mcp', 'hybrid')),

  -- Pack content (JSONB — full pack definition)
  service_info                JSONB NOT NULL DEFAULT '{}',
  pages                       JSONB NOT NULL DEFAULT '{}',
  workflows                   JSONB NOT NULL DEFAULT '{}',
  known_issues                JSONB NOT NULL DEFAULT '[]',
  fallback_hints              JSONB NOT NULL DEFAULT '{}',

  -- Health tracking
  last_verified               TIMESTAMPTZ,
  selectors_health            TEXT NOT NULL DEFAULT 'healthy'
    CHECK (selectors_health IN ('healthy', 'degraded', 'broken', 'unverified')),
  fallback_count              INTEGER NOT NULL DEFAULT 0,
  total_uses                  INTEGER NOT NULL DEFAULT 0,

  -- Source
  is_builtin                  BOOLEAN NOT NULL DEFAULT FALSE,
  anton_package_id            TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_packs_service ON missions.service_packs(service_id);
CREATE INDEX IF NOT EXISTS idx_service_packs_health  ON missions.service_packs(selectors_health, total_uses DESC);

-- ── service_pack_health — selector health + auto-heal proposals ────────────
-- When a Service Pack selector fails and the LLM fallback finds a working
-- replacement, it's recorded here as a proposed update for human review.

CREATE TABLE IF NOT EXISTS missions.service_pack_health (
  id                          BIGSERIAL PRIMARY KEY,
  pack_id                     TEXT NOT NULL REFERENCES missions.service_packs(id) ON DELETE CASCADE,
  page_id                     TEXT,
  element_id                  TEXT,
  old_selector                TEXT,
  proposed_selector           TEXT,
  screenshot_path             TEXT,
  llm_reasoning               TEXT,
  status                      TEXT NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'proposed', 'accepted', 'rejected')),
  detected_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pack_health_pack   ON missions.service_pack_health(pack_id, status);
CREATE INDEX IF NOT EXISTS idx_pack_health_status ON missions.service_pack_health(status, detected_at DESC);
