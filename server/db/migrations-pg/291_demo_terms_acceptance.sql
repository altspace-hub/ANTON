-- 291 — A demo account records the terms it accepted and the 18+ declaration
-- (public showcase privacy review, 2026-09-26, gate G7).
--
-- POST /api/auth/demo-signup (server/routes/auth.ts) refuses a sign-up that
-- does not confirm the visitor is 18 or over and accept the demo terms of the
-- current version (DEMO_TERMS_VERSION in server/middleware/demo-mode.ts), and
-- stores what was accepted and when, so acceptance can be shown later
-- (GDPR Art. 5(2)). The retention job deletes these with the account.
--
-- NULL on every other account: ordinary accounts never went through the demo
-- sign-up. Additive only: no existing row changes.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
