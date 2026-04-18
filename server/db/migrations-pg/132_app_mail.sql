-- ──────────────────────────────────────────────────────────────────────────────
-- 132_app_mail.sql — Companion App Unified Mail
--
-- Schema for the multi-provider mail surface in the companion app.
-- Provider-agnostic by design:
--   • app_mail_providers — per-user connection metadata + (encrypted) auth.
--     ANTON-native is auto-provisioned on first inbox load (no row needed
--     for it to work — the inbox endpoint synthesises rows from
--     app_messages + app_checkpoints).
--   • app_mail_messages  — cached unified inbox for external providers.
--     ANTON-native messages are NOT cached here; they are projected
--     on read so the chat / approvals surface remains the single source
--     of truth for those.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_mail_providers (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  connected_user_id     TEXT NOT NULL REFERENCES connected_users(id) ON DELETE CASCADE,
  org_id                TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('anton', 'm365', 'gmail', 'imap', 'exchange')),
  display_name          TEXT NOT NULL,                                   -- e.g. 'Work · M365'
  email_address         TEXT,                                            -- the canonical address
  -- Encrypted credentials (AES-256-GCM via INSTANCE_KEY_ENCRYPTION_KEY,
  -- same scheme as instance_identity.privkey_encrypted).
  oauth_tokens_encrypted BYTEA,
  oauth_tokens_iv        BYTEA,
  imap_config_encrypted  BYTEA,
  imap_config_iv         BYTEA,
  -- Status & sync
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'disconnected', 'error', 'pending')),
  last_sync_at          TIMESTAMPTZ,
  last_sync_error       TEXT,
  unread_count          INTEGER NOT NULL DEFAULT 0,
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A user can have at most one connection per provider per org per address
  UNIQUE (connected_user_id, org_id, provider, email_address)
);

CREATE INDEX IF NOT EXISTS idx_app_mail_providers_user
  ON app_mail_providers(connected_user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_app_mail_providers_status
  ON app_mail_providers(status, last_sync_at);

-- Cached unified inbox (external mail only; ANTON-native is projected at read)
CREATE TABLE IF NOT EXISTS app_mail_messages (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  provider_id           TEXT NOT NULL REFERENCES app_mail_providers(id) ON DELETE CASCADE,
  remote_id             TEXT NOT NULL,                                   -- provider-specific id
  thread_id             TEXT,                                            -- conversation/thread id if known
  from_name             TEXT,
  from_email            TEXT,
  to_addresses          JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject               TEXT,
  preview               TEXT,                                            -- first ~280 chars of body
  body_text             TEXT,                                            -- full body cache (optional)
  is_read               BOOLEAN NOT NULL DEFAULT FALSE,
  is_starred            BOOLEAN NOT NULL DEFAULT FALSE,
  is_external           BOOLEAN NOT NULL DEFAULT FALSE,                  -- sender outside the org
  -- ANTON's optional triage tag for the row (matches design pill set)
  ai_action             TEXT CHECK (ai_action IS NULL OR ai_action IN
                                    ('DRAFTED', 'SUMMARIZED', 'ARCHIVE?', 'YOUR ACTION')),
  ai_action_tone        TEXT CHECK (ai_action_tone IS NULL OR ai_action_tone IN
                                    ('teal', 'red', 'gold', 'neutral', 'blue')),
  received_at           TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, remote_id)
);

CREATE INDEX IF NOT EXISTS idx_app_mail_messages_provider
  ON app_mail_messages(provider_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_mail_messages_unread
  ON app_mail_messages(provider_id, is_read, received_at DESC);
