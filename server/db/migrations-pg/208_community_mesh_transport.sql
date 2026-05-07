-- 208_community_mesh_transport.sql — A2A mesh transport metadata.
--
-- Track A1: extends community_connections with the peer instance's mesh
-- identity + relay list so peer-transport.ts (Track A3) can decide whether
-- to deliver community mail / cross-instance agent queries via mesh or
-- HTTPS, with mesh as the default and HTTPS as the fallback.
--
-- The existing `endpoint` column (HTTPS URL) and `x25519_public_key` column
-- (E2E message encryption — separate concept from instance Noise keys)
-- stay as-is. This migration adds peer-instance fields purely for transport.
--
--   peer_instance_pubkey      raw 32-byte Ed25519 hex of the peer's instance
--                             identity; phone/peer/QR exchange this. The
--                             X25519 (Noise static) is derived deterministically
--                             via ed_pk_to_curve25519, so we don't store it
--                             separately — same pattern as instance_identity.
--   peer_relay_endpoints      ranked WSS URLs the peer is reachable on
--   preferred_transport       'mesh' (default), 'https', or 'auto' (try mesh,
--                             fall back). New rows default to 'auto' so existing
--                             pairings keep working over HTTPS until a peer
--                             upgrade is observed.
--   last_mesh_success_at      diagnostics + transport-health logic in A3
--   last_https_success_at     diagnostics + transport-health logic in A3
--   mesh_demoted_until        when a peer is unreachable on mesh repeatedly,
--                             A3 demotes that peer to HTTPS for a window
--                             rather than retrying every send

ALTER TABLE community_connections
  ADD COLUMN IF NOT EXISTS peer_instance_pubkey   TEXT,
  ADD COLUMN IF NOT EXISTS peer_relay_endpoints   JSONB,
  ADD COLUMN IF NOT EXISTS preferred_transport    TEXT NOT NULL DEFAULT 'auto'
    CHECK (preferred_transport IN ('mesh', 'https', 'auto')),
  ADD COLUMN IF NOT EXISTS last_mesh_success_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_https_success_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mesh_demoted_until     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_community_connections_mesh_ready
  ON community_connections(contact_hash)
  WHERE peer_instance_pubkey IS NOT NULL
    AND peer_relay_endpoints IS NOT NULL;
