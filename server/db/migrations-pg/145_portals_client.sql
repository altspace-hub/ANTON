-- ──────────────────────────────────────────────────────────────────────────────
-- 145_portals_client.sql — Portals Phase 1: client-side tables.
--
-- Implements the local portal management surface per ANTON_Portals_Spec.md
-- v0.2 §H.1 + investigation/portals-investigation.md §C/D.
--
-- Four tables:
--   1. portals                        — user's own portals + sync state with registry
--   2. portal_resolution_cache        — cached registry name→hash resolutions
--   3. portal_descriptor_cache        — cached signed capability descriptors
--   4. portal_signed_envelope_nonces  — replay protection for outbound operations
--
-- The registry server's own schema (transparency log, STH history, abuse reports,
-- etc.) lives in the separate registry-server repo per Registry Server Ops Spec.
-- This migration is strictly client-side.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. portals — user's own portals ──────────────────────────────────────────
-- One row per portal owned by this ANTON instance. Bridges local state with the
-- registry's authoritative record via registry_portal_id + registry_log_id
-- (the latter feeds priorOperationId in subsequent envelopes per Registry
-- Protocol §4.1).

CREATE TABLE IF NOT EXISTS portals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT 'futurechain',

  -- Categorisation per Capability Schema §10.1 enum
  category TEXT NOT NULL,
  display_title TEXT,
  description TEXT,
  template TEXT,                                    -- e.g. 'personal-standard', 'commerce-catering'

  -- Identity bound to this portal. private_key_pem stays local — never leaves the box.
  contact_hash TEXT NOT NULL,
  public_key_hex TEXT NOT NULL,                     -- internal storage = SPKI DER hex (88 chars)
  private_key_pem TEXT NOT NULL,                    -- PKCS#8 PEM, local-only

  -- Registry sync state
  registered_at TIMESTAMPTZ,                        -- NULL until first successful register
  last_synced_at TIMESTAMPTZ,                       -- last successful registry write
  registry_portal_id UUID,                          -- registry's UUID
  registry_log_id BIGINT,                           -- log_id of most recent op (chain continuity)

  -- Discovery
  public_index BOOLEAN DEFAULT FALSE,
  capability_summary JSONB,                         -- flattened summary used for search
  descriptor_hash TEXT,                             -- SHA-256 of canonical descriptor

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft',             -- draft / publishing / active / suspended / revoked

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (namespace, name)
);

CREATE INDEX IF NOT EXISTS ix_portals_status ON portals(status);
CREATE INDEX IF NOT EXISTS ix_portals_public_index
  ON portals(public_index) WHERE public_index = TRUE;
CREATE INDEX IF NOT EXISTS ix_portals_contact_hash ON portals(contact_hash);

-- ── 2. portal_resolution_cache — cached registry resolutions ────────────────
-- Resolution responses cached per Registry Protocol §8.6:
--   active not-recently-updated: 6h
--   recently updated: 5min
--   not found: 5min (negative cache, is_negative=TRUE)
--   revoked: 24h

CREATE TABLE IF NOT EXISTS portal_resolution_cache (
  cache_key TEXT PRIMARY KEY,                       -- "<namespace>/<name>"
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,

  contact_hash TEXT,                                -- NULL for negative cache
  public_key_wire TEXT,                             -- base64url unpadded — wire format

  display_title TEXT,
  category TEXT,
  capability_summary JSONB,

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_negative BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_portal_resolution_cache_expires_at
  ON portal_resolution_cache(expires_at);

-- ── 3. portal_descriptor_cache — cached capability descriptors ──────────────
-- Per Capability Schema §14: default TTL 24h, invalidate when registry
-- descriptorHash changes for the portal.

CREATE TABLE IF NOT EXISTS portal_descriptor_cache (
  portal_address TEXT PRIMARY KEY,                  -- "<name>.<namespace>.portal"

  descriptor_hash TEXT NOT NULL,                    -- SHA-256 of canonical descriptor (binds to registry)
  descriptor JSONB NOT NULL,                        -- the full descriptor document
  signature TEXT NOT NULL,                          -- Ed25519 sig, base64url unpadded
  signing_key_fingerprint TEXT NOT NULL,            -- SHA-256 of portal's public key

  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cache_ttl_seconds INTEGER DEFAULT 86400
);

CREATE INDEX IF NOT EXISTS ix_portal_descriptor_cache_valid_until
  ON portal_descriptor_cache(valid_until);

-- ── 4. portal_signed_envelope_nonces — outbound replay protection ───────────
-- Mirrors app_signed_envelope_nonces (companion app). Every nonce we generate
-- for a registry envelope is recorded here so we can detect accidental reuse.
-- Periodic cleanup: DELETE WHERE seen_at < NOW() - interval '48 hours'
-- (matches Registry Protocol §4.5 nonce window).

CREATE TABLE IF NOT EXISTS portal_signed_envelope_nonces (
  actor_contact_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_contact_hash, nonce)
);

CREATE INDEX IF NOT EXISTS ix_portal_signed_envelope_nonces_seen_at
  ON portal_signed_envelope_nonces(seen_at);

-- ── 5. updated_at trigger for portals table ─────────────────────────────────
-- Standard touch-on-update so readers see fresh updated_at without app-side
-- bookkeeping. Mirrors patterns elsewhere in the codebase.

CREATE OR REPLACE FUNCTION touch_portals_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portals_touch_updated_at ON portals;
CREATE TRIGGER trg_portals_touch_updated_at
  BEFORE UPDATE ON portals
  FOR EACH ROW EXECUTE FUNCTION touch_portals_updated_at();
