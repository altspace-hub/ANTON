-- Migration 103: Relay server message store
-- Store-and-forward for offline peers; messages are E2E encrypted (relay cannot read content)

CREATE TABLE IF NOT EXISTS relay_messages (
  id TEXT PRIMARY KEY,
  recipient_hash TEXT NOT NULL,
  sender_hash TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  message_type TEXT DEFAULT 'mail',
  ttl_days INTEGER NOT NULL DEFAULT 30,
  stored_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  collected_at TIMESTAMPTZ,
  collected_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_relay_recipient ON relay_messages(recipient_hash, collected_at)
  WHERE collected_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_relay_expires ON relay_messages(expires_at)
  WHERE collected_at IS NULL;
