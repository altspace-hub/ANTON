-- Migration 130: Companion App — security, pairing, push, checkpoints
--
-- Closes the spec gaps identified in the §1.6 audit:
--   • app_devices                — Ed25519-paired phones, one row per device
--   • app_enrollment_tokens       — short-lived (≤60s) pairing tokens with full
--                                   enrollment package per spec §5.2
--   • app_push_tokens             — APNs / FCM / web-push token registration
--                                   per device (spec §8.7)
--   • app_checkpoints             — pending approvals surfaced via push (§8.6)
--   • app_signed_envelope_nonces  — replay defence for signed envelopes (§5.3)
--
-- Backwards-compatible: the existing connected_users + app_session_tokens
-- flow keeps working. New devices register through the enrollment endpoints;
-- legacy 'register-simple' clients continue to operate without a device row.

-- ── 1. app_devices ────────────────────────────────────────────────────────
-- One paired phone per row. The device's Ed25519 pubkey identifies it; the
-- server-issued device_certificate (signed JWT-shape blob) authorises it.

CREATE TABLE IF NOT EXISTS app_devices (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  connected_user_id        TEXT NOT NULL REFERENCES connected_users(id) ON DELETE CASCADE,
  device_pubkey            TEXT NOT NULL,                 -- Ed25519 public key (hex)
  device_certificate       TEXT NOT NULL,                 -- server-signed cert blob
  device_name              TEXT,                          -- "Daniel's iPhone"
  device_model             TEXT,                          -- "iPhone 16 Pro"
  device_os                TEXT,                          -- "iOS 18.5"
  app_version              TEXT,                          -- "1.0.0"
  instance_cert_fingerprint TEXT,                         -- the cert the device pinned
  biometric_required       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at             TIMESTAMPTZ,
  revoked_at               TIMESTAMPTZ,                   -- unpair = revoke
  CONSTRAINT uq_app_devices_user_pubkey UNIQUE (connected_user_id, device_pubkey)
);

CREATE INDEX IF NOT EXISTS ix_app_devices_user ON app_devices(connected_user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_app_devices_pubkey ON app_devices(device_pubkey) WHERE revoked_at IS NULL;

-- ── 2. app_enrollment_tokens ──────────────────────────────────────────────
-- Issued by the instance during "Connect a device" — short-lived, single-use.
-- The full enrollment package travels via QR code; the token here is just
-- the lookup key. Ed25519 instance pubkey + cert fingerprint + endpoints
-- + intended user binding all live on this row.

CREATE TABLE IF NOT EXISTS app_enrollment_tokens (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  token               TEXT NOT NULL UNIQUE,             -- the URL-safe random
  nonce               TEXT NOT NULL,                    -- echoed by client in completion
  instance_pubkey     TEXT NOT NULL,                    -- the server's Ed25519 pubkey
  instance_cert_fp    TEXT,                             -- pinning material
  endpoints           JSONB NOT NULL DEFAULT '{}',      -- LAN URL, WAN URL, mDNS name
  intended_user_id    TEXT REFERENCES connected_users(id) ON DELETE CASCADE,
  org_id              TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
  intended_role       TEXT,                             -- 'member' | 'moderator' | 'admin'
  display_name_hint   TEXT,                             -- pre-filled name for the user
  language_hint       TEXT,                             -- pre-filled preferred language
  expires_at          TIMESTAMPTZ NOT NULL,             -- ≤60s after issuance
  used_at             TIMESTAMPTZ,                      -- set on completion
  used_by_device_id   TEXT REFERENCES app_devices(id),
  created_by_user_id  TEXT,                             -- the admin who issued it
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_enrollment_tokens_token ON app_enrollment_tokens(token) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_enrollment_tokens_expires ON app_enrollment_tokens(expires_at) WHERE used_at IS NULL;

-- ── 3. app_push_tokens ────────────────────────────────────────────────────
-- Per device, a push registration. A device can have multiple tokens (the
-- platform may rotate; we keep the last few enabled and prune on rotation).

CREATE TABLE IF NOT EXISTS app_push_tokens (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  device_id     TEXT NOT NULL REFERENCES app_devices(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('apns', 'fcm', 'web-push')),
  token         TEXT NOT NULL,
  environment   TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'development')),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  topic         TEXT,                                   -- for FCM topic dispatch
  endpoint      TEXT,                                   -- web-push endpoint URL
  p256dh_key    TEXT,                                   -- web-push subscription key
  auth_key      TEXT,                                   -- web-push auth secret
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  CONSTRAINT uq_push_tokens_platform_token UNIQUE (platform, token)
);

CREATE INDEX IF NOT EXISTS ix_push_tokens_device ON app_push_tokens(device_id) WHERE enabled = TRUE;

-- ── 4. app_checkpoints ────────────────────────────────────────────────────
-- A human-approval checkpoint that a workflow / mission / atlas integrity
-- finding raises for a specific connected user. Surfaced via push, drilled
-- from the in-app inbox.
--
-- Push payload contains only id + severity; the full payload + rationale
-- never crosses APNs/FCM (per spec §8.7 "End-to-end privacy").

CREATE TABLE IF NOT EXISTS app_checkpoints (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  org_id             TEXT NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
  connected_user_id  TEXT NOT NULL REFERENCES connected_users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  summary            TEXT,                                  -- one-line preview
  rationale          TEXT,                                  -- ANTON's reasoning
  severity           TEXT NOT NULL DEFAULT 'normal'
                       CHECK (severity IN ('low', 'normal', 'high', 'critical')),
  payload            JSONB NOT NULL DEFAULT '{}',           -- structured detail
  source_kind        TEXT,                                  -- 'mission' | 'atlas' | 'workflow' | 'manual'
  source_id          TEXT,                                  -- foreign id (no FK so any source works)
  deep_link          TEXT,                                  -- desktop URL to open on instance
  requires_biometric BOOLEAN NOT NULL DEFAULT FALSE,        -- enforces re-auth on critical
  expires_at         TIMESTAMPTZ,                           -- stale approvals are dangerous
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected', 'modified', 'expired')),
  response           JSONB,                                 -- the user's signed response
  responded_at       TIMESTAMPTZ,
  responded_device_id TEXT REFERENCES app_devices(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_checkpoints_user_pending
  ON app_checkpoints(connected_user_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS ix_checkpoints_org ON app_checkpoints(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_checkpoints_source ON app_checkpoints(source_kind, source_id);

-- ── 5. app_signed_envelope_nonces ─────────────────────────────────────────
-- Replay defence for spec §5.3 signed envelopes. Every signed request
-- carries a monotonically increasing nonce + a signature; the server
-- inserts the nonce here and rejects duplicates.

CREATE TABLE IF NOT EXISTS app_signed_envelope_nonces (
  nonce       TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL REFERENCES app_devices(id) ON DELETE CASCADE,
  seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL                       -- prune after, e.g., 24h
);

CREATE INDEX IF NOT EXISTS ix_signed_envelope_nonces_expires ON app_signed_envelope_nonces(expires_at);

-- ── 6. instance_identity ──────────────────────────────────────────────────
-- The instance's own Ed25519 keypair. Single-row table — created on first
-- boot if missing. The pubkey is what's burned into every enrollment QR.
-- (Keeping the privkey in the DB rather than the filesystem so it follows
-- the DB backup story; encrypt-at-rest is the operator's responsibility.)

CREATE TABLE IF NOT EXISTS instance_identity (
  singleton            TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (singleton = 'singleton'),
  pubkey               TEXT NOT NULL,
  privkey              TEXT NOT NULL,                    -- callers must protect at rest
  cert_fingerprint     TEXT,                             -- TLS cert fingerprint for pinning
  display_name         TEXT,                             -- user-facing instance name
  contact_hash         TEXT,                             -- ANTON-XXXX-XXXX-XXXX-XXXX
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at           TIMESTAMPTZ
);
