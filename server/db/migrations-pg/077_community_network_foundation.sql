-- Migration 077: Community Network Foundation — structured messages, capability cards, import policies, message queue

-- ═══ B0: Foundation tables ═══════════════════════════════════════════════════
-- These four tables were historically created ONLY by the runtime inline DDL in
-- server/routes/community.ts (which runs when the Express app boots), so a fresh
-- `pnpm run db:init` — which runs migrations WITHOUT booting the app — failed at
-- this migration's ALTER TABLE statements with "relation community_mail does not
-- exist". We create them here, idempotently, BEFORE the ALTERs below and before
-- every downstream migration (079, 080, 085, 086, 089, 100, 102, 208, 220) that
-- ALTERs them. Columns mirror the canonical post-migration set in
-- tests/fixtures/a2a-schema.sql; SQLite-isms (DATETIME / INTEGER booleans) from
-- the runtime DDL are translated to PostgreSQL types. Idempotent: IF NOT EXISTS
-- means existing installs (where the runtime already created these) are no-ops,
-- and on existing installs this migration is already recorded in
-- schema_migrations and is skipped entirely.

CREATE TABLE IF NOT EXISTS community_identity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default' UNIQUE,
  contact_hash TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT,
  activated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_connections (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL DEFAULT 'default',
  contact_hash TEXT NOT NULL,
  display_name TEXT,
  public_key TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_user_id, contact_hash)
);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_community_mail_folder ON community_mail(folder, sent_at DESC);

CREATE TABLE IF NOT EXISTS community_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  contact_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT 'Member',
  public_key TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, contact_hash)
);

-- ═══ B1: Structured Message Types ════════════════════════════════════════════
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT NULL;
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS payload_metadata JSONB DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_community_mail_type ON community_mail(message_type);

-- ═══ B2: Capability Cards ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS capability_cards (
  id TEXT PRIMARY KEY,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  card_data JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  is_current INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_capability_cards_current ON capability_cards(is_current) WHERE is_current = 1;

-- ═══ B3: Import Policies ═════════════════════════════════════════════════════
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS import_policy TEXT NOT NULL DEFAULT 'ask_first';
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS auto_accept_types JSONB DEFAULT '[]'::jsonb;

-- ═══ B4: Message Queue & Delivery Status ═════════════════════════════════════
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'local';
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER DEFAULT 0;
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS last_delivery_attempt TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE community_mail ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_queue_status ON community_message_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_message_queue_recipient ON community_message_queue(recipient_hash);
