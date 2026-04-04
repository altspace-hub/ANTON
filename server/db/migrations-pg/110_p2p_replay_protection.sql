-- Migration 110: P2P replay protection — nonce deduplication table
-- Prevents replay attacks on encrypted P2P messages

CREATE TABLE IF NOT EXISTS p2p_message_nonces (
  sender_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sender_hash, nonce)
);

-- Auto-expire old nonces (older than 10 minutes)
CREATE INDEX IF NOT EXISTS idx_p2p_nonces_expiry ON p2p_message_nonces(created_at);
