-- 283 — Single sign-on identities, and switching an account off (2026-09-23).
--
-- 1. An SSO user used to be found by the email claim alone. Email is mutable
--    and, in Microsoft Entra ID, optional — a renamed person got a second
--    account, a reassigned address inherited the old owner's data, and a user
--    without the claim could not sign in at all. An identity is now the
--    issuer + the provider's stable subject (Entra: the object id `oid`, with
--    the tenant `tid` kept beside it), bound to exactly one users row.
CREATE TABLE IF NOT EXISTS user_identities (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL,
  issuer         TEXT NOT NULL,
  subject        TEXT NOT NULL,
  tenant_id      TEXT,
  email_at_login TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ,
  UNIQUE (provider, issuer, subject)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);

-- 2. There was no way to switch a person off short of deleting the row — and
--    the next SSO sign-in simply created them again. A disabled account keeps
--    its data and cannot sign in or use an existing session.
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
