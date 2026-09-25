-- 289 — Demo accounts expire (public showcase, 2026-09-25).
--
-- With DEMO_MODE=true a visitor signs up with an invite code
-- (POST /api/auth/demo-signup, server/routes/auth.ts). The account carries the
-- moment it ends: sign-in is refused from then on, its sessions end with it, and
-- the daily retention job (server/services/demo-retention.ts) deletes the
-- account and everything it wrote. NULL = an ordinary account, which never
-- expires and which the retention job never touches.
--
-- Additive only: no existing row changes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ;

-- The retention job looks up expired demo accounts; the sign-up cap counts
-- today's. Both read only demo rows.
CREATE INDEX IF NOT EXISTS idx_users_demo_expires ON users(demo_expires_at) WHERE demo_expires_at IS NOT NULL;
