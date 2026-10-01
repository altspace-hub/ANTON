-- 292 — Accounts made by invitation (2026-10-01).
--
-- An administrator enters a person's email address; ANTON makes the account
-- with no password and a one-time link, and the person chooses their own
-- password at /welcome (server/services/account-invitations.ts). The same
-- link, issued again for an existing account, is how an administrator lets
-- someone who lost their password choose a new one (purpose 'reset').
--
-- Only the SHA-256 of the link's token is stored, so this table (or a backup
-- of it) cannot be turned into a working link. A link works once (used_at)
-- and until expires_at. Deleting the account deletes its links.
CREATE TABLE IF NOT EXISTS account_invitations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  purpose     TEXT NOT NULL DEFAULT 'invite' CHECK (purpose IN ('invite', 'reset')),
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_account_invitations_user ON account_invitations(user_id);
