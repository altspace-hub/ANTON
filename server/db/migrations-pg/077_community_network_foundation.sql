-- Migration 077: Community Network Foundation — structured messages, capability cards, import policies, message queue

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
