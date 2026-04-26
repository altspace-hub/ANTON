-- 195_beehive_signal_inbox.sql — weak-signal inbox + cross-instance
-- aggregation tables for the Beehive pillar.
--
-- One of Beehive's core flows: peer instances push weak signals (a
-- regulatory change, a market event, a vulnerability disclosure) to
-- the swarm; subscribed peers receive + can act on them. This is the
-- inbound side: signals received from peers + the local-instance's
-- aggregated view across all peers.

CREATE TABLE IF NOT EXISTS beehive_signal_inbox (
  id              TEXT PRIMARY KEY,
  from_peer_id    TEXT NOT NULL,
  received_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  signal_kind     TEXT NOT NULL,                  -- 'regulatory_change' / 'market_event' / 'vulnerability' / 'opportunity' / 'pattern_detection' / 'other'
  topic_tags      JSONB DEFAULT '[]',
  jurisdiction    TEXT,
  urgency         TEXT NOT NULL DEFAULT 'normal', -- 'low' / 'normal' / 'high' / 'critical'
  payload         JSONB NOT NULL,
  signature       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'unread', -- 'unread' / 'read' / 'actioned' / 'dismissed' / 'duplicate'
  read_at         TIMESTAMP,
  actioned_at     TIMESTAMP,
  action_ref      TEXT,                           -- pointer to whatever local action was taken
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS beehive_signal_inbox_unread_idx
  ON beehive_signal_inbox(received_at DESC) WHERE status = 'unread';

CREATE INDEX IF NOT EXISTS beehive_signal_inbox_kind_idx
  ON beehive_signal_inbox(signal_kind, received_at DESC);

CREATE INDEX IF NOT EXISTS beehive_signal_inbox_urgency_idx
  ON beehive_signal_inbox(urgency, received_at DESC) WHERE status IN ('unread', 'read');

CREATE INDEX IF NOT EXISTS beehive_signal_inbox_topic_gin_idx
  ON beehive_signal_inbox USING GIN (topic_tags);

-- Aggregation buckets: grouped views of the same signal across multiple
-- peers. When 5 peers all flag the same regulatory change within an hour,
-- the local instance sees ONE aggregated signal with 5 attestations,
-- not 5 separate inbox items.

CREATE TABLE IF NOT EXISTS beehive_signal_aggregates (
  id                  TEXT PRIMARY KEY,
  aggregate_key       TEXT NOT NULL UNIQUE,        -- canonical key (signal_kind + topic + payload-hash)
  first_seen_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  signal_kind         TEXT NOT NULL,
  topic_tags          JSONB DEFAULT '[]',
  representative_payload JSONB NOT NULL,           -- the canonical / most-detailed payload across peers
  attestation_count   INTEGER NOT NULL DEFAULT 1,
  weighted_score      NUMERIC,                     -- sum of (peer trust_score) for attestations
  status              TEXT NOT NULL DEFAULT 'open',  -- 'open' / 'investigating' / 'actioned' / 'noise' / 'closed'
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS beehive_signal_aggregates_open_idx
  ON beehive_signal_aggregates(weighted_score DESC, last_seen_at DESC) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS beehive_signal_aggregates_topic_gin_idx
  ON beehive_signal_aggregates USING GIN (topic_tags);

-- Edge table: which inbox signals roll up into which aggregate.
CREATE TABLE IF NOT EXISTS beehive_signal_attestations (
  id              TEXT PRIMARY KEY,
  aggregate_id    TEXT NOT NULL,
  inbox_signal_id TEXT NOT NULL,
  peer_id         TEXT NOT NULL,
  weight          NUMERIC NOT NULL DEFAULT 1.0,
  attested_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(aggregate_id, inbox_signal_id)
);

CREATE INDEX IF NOT EXISTS beehive_signal_attestations_aggregate_idx
  ON beehive_signal_attestations(aggregate_id);
