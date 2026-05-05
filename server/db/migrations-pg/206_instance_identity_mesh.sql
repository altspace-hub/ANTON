-- 206_instance_identity_mesh.sql — cache raw mesh-format keys on instance_identity.
--
-- The existing instance_identity row stores Ed25519 keys in DER format
-- (SPKI public + PKCS8 private) per the legacy public_https pairing flow.
-- ANTON Mesh (docs/ANTON_MESH_SPEC.md §3.2) needs:
--
--   - raw 32-byte Ed25519 public key
--   - raw 32-byte X25519 public key (= ed_pk_to_curve25519(ed_pk))
--   - raw 32-byte X25519 private key (encrypted with the same KEK)
--   - binding_sig: Ed25519(ed_priv) over (BINDING_DOMAIN || ed_pk || x_pk)
--   - instance_id: sha256(x_pk)[0..16)
--
-- These are deterministic from the existing Ed25519 keypair, so the columns
-- are populated lazily on first read by getOrCreateInstanceIdentity. The
-- migration just adds the storage; no data migration required.

ALTER TABLE instance_identity
  ADD COLUMN IF NOT EXISTS ed25519_pubkey_raw TEXT NULL;

ALTER TABLE instance_identity
  ADD COLUMN IF NOT EXISTS x25519_pubkey TEXT NULL;

ALTER TABLE instance_identity
  ADD COLUMN IF NOT EXISTS x25519_privkey_encrypted BYTEA NULL;

ALTER TABLE instance_identity
  ADD COLUMN IF NOT EXISTS x25519_privkey_iv BYTEA NULL;

ALTER TABLE instance_identity
  ADD COLUMN IF NOT EXISTS binding_sig TEXT NULL;

ALTER TABLE instance_identity
  ADD COLUMN IF NOT EXISTS mesh_instance_id TEXT NULL;
