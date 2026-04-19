-- ──────────────────────────────────────────────────────────────────────────────
-- 151_portal_lan_discovery.sql — Track B-LAN: cross-instance portal discovery.
--
-- Adds:
--   1. origin_endpoint TEXT on portal_descriptor_cache. NULL = local portal
--      (resolve from portal_pages / portals tables). Non-null = remote LAN
--      portal (proxy visit/invoke calls to that http://host:port). Lets the
--      portal-handler stay address-keyed without knowing whether the portal
--      lives in this DB or in a peer ANTON.
--   2. portal_lan_neighbors table — one row per ANTON instance discovered on
--      the LAN. Powers the "On your LAN" section of the discovery UI and is
--      the source-of-truth for which origins the proxy is willing to talk to.
--
-- mDNS browse + public-directory fetch is implemented in
-- server/services/portals/portal-lan-discovery.ts (no DB writes from this SQL).
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE portal_descriptor_cache
  ADD COLUMN IF NOT EXISTS origin_endpoint TEXT;

COMMENT ON COLUMN portal_descriptor_cache.origin_endpoint IS
  'NULL for portals owned by this instance; for LAN-discovered portals, the http://host:port of the peer ANTON serving them';

CREATE INDEX IF NOT EXISTS ix_portal_descriptor_cache_origin
  ON portal_descriptor_cache(origin_endpoint)
  WHERE origin_endpoint IS NOT NULL;

CREATE TABLE IF NOT EXISTS portal_lan_neighbors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- mDNS-advertised instance name + fingerprint (TXT.fp from mdns-advertiser).
  instance_name TEXT NOT NULL,
  fingerprint TEXT,
  -- Network endpoint we'll proxy through for this neighbor's portals.
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  endpoint TEXT NOT NULL,                          -- http://host:port (denormalised for fast lookup)

  portals_count INTEGER NOT NULL DEFAULT 0,        -- last known public directory size
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_scan_status TEXT,                           -- 'ok' | 'unreachable' | 'invalid_response'
  last_scan_error TEXT,

  CONSTRAINT uniq_neighbor_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS ix_portal_lan_neighbors_last_seen
  ON portal_lan_neighbors(last_seen_at DESC);
