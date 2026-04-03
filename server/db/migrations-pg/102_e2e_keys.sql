-- Migration 102: X25519 key columns for E2E message encryption
-- Stored alongside Ed25519 identity keys; used for Diffie-Hellman shared secret derivation

ALTER TABLE community_identity
  ADD COLUMN IF NOT EXISTS x25519_public_key TEXT,
  ADD COLUMN IF NOT EXISTS x25519_private_key_encrypted TEXT;

ALTER TABLE community_connections
  ADD COLUMN IF NOT EXISTS x25519_public_key TEXT;
