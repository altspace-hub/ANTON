-- 207_instance_relay_override.sql — operator-controlled mesh relay list.
--
-- Track C Slice 2: lets the instance operator change the canonical mesh
-- relay list at runtime without touching `.env` and restarting (e.g. moving
-- a fleet from relay.futurechain.eu to a corporate self-hosted relay).
--
-- NULL means "no override" → mesh-config-service falls back to ANTON_MESH_RELAYS.
-- Non-NULL is a JSON array of wss:// URLs that supersedes the env value.
--
-- Single-row table (instance_identity is keyed on the 'singleton' constant)
-- so this is genuinely an instance-wide setting, not per-pairing.

ALTER TABLE instance_identity
  ADD COLUMN IF NOT EXISTS relay_endpoints JSONB NULL;
