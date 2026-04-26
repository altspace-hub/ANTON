-- 193_beehive_capability_advertising.sql — capability advertisement +
-- discovery indexes for the Beehive pillar.
--
-- Beehive base tables (mig 113-114) cover sessions / participants /
-- contributions / outputs. This migration adds the swarm-level
-- coordination tables: which peer instances exist, what they advertise,
-- and how queries get routed to them.

CREATE TABLE IF NOT EXISTS beehive_peers (
  id              TEXT PRIMARY KEY,
  peer_pubkey     TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  endpoint_url    TEXT NOT NULL,
  last_seen_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  trust_score     NUMERIC DEFAULT 0.5,            -- 0.0–1.0, derived from interaction history
  load_estimate   NUMERIC,                        -- 0.0–1.0, peer-self-reported capacity
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active' / 'inactive' / 'blocked' / 'suspect'
  blocked_reason  TEXT,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS beehive_peers_active_idx
  ON beehive_peers(trust_score DESC, last_seen_at DESC) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS beehive_peers_status_idx
  ON beehive_peers(status);

-- Capabilities advertised by each peer. A peer can advertise multiple
-- capabilities; each is independently queryable.

CREATE TABLE IF NOT EXISTS beehive_capabilities (
  id                  TEXT PRIMARY KEY,
  peer_id             TEXT NOT NULL,                -- 'self' for local-instance capabilities
  capability_kind     TEXT NOT NULL,                -- 'specialized_agent' / 'module' / 'knowledge_pack' / 'compute' / 'data_query' / 'other'
  capability_code     TEXT NOT NULL,                -- e.g. agent slug, module id, pack id
  display_name        TEXT NOT NULL,
  description         TEXT,
  topic_tags          JSONB DEFAULT '[]',
  cost_per_call       NUMERIC,                      -- optional FC cost
  cost_currency       TEXT DEFAULT 'FTC',
  qos_target          JSONB DEFAULT '{}',           -- e.g. { p50_ms, p99_ms, success_rate }
  advertised_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at          TIMESTAMP,
  is_active           BOOLEAN DEFAULT TRUE,
  signature           TEXT NOT NULL,                -- Ed25519 sig over the cap descriptor
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS beehive_capabilities_peer_idx
  ON beehive_capabilities(peer_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS beehive_capabilities_kind_idx
  ON beehive_capabilities(capability_kind, capability_code) WHERE is_active = TRUE;

-- Routing log: every cross-instance query routed via Beehive. Used for
-- analytics ("which capabilities are most-requested?") and debugging
-- ("why did we route to peer X?").

CREATE TABLE IF NOT EXISTS beehive_routing_log (
  id                  TEXT PRIMARY KEY,
  request_id          TEXT NOT NULL,
  routed_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  query_kind          TEXT NOT NULL,
  query_payload       JSONB,
  selected_peer_id    TEXT NOT NULL,
  selection_score     NUMERIC,                      -- composite ranking score
  candidate_peers     JSONB DEFAULT '[]',           -- the alternatives we considered
  outcome             TEXT,                         -- 'success' / 'timeout' / 'error' / 'rejected_by_peer'
  latency_ms          INTEGER,
  response_size_bytes INTEGER,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS beehive_routing_log_request_idx
  ON beehive_routing_log(request_id, routed_at DESC);

CREATE INDEX IF NOT EXISTS beehive_routing_log_recent_idx
  ON beehive_routing_log(routed_at DESC);
