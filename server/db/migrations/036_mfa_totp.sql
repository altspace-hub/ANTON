-- AUTH-03: Add TOTP multi-factor authentication support
-- Adds mfa_secret and mfa_enabled columns to the users table.
-- The mfa_secret stores the base32-encoded TOTP seed (encrypted at rest in production via DATA_ENCRYPTION_KEY).

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT DEFAULT NULL;

-- Pending MFA setups (before user confirms the QR scan is working)
CREATE TABLE IF NOT EXISTS mfa_pending (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mfa_pending_user ON mfa_pending(user_id);
