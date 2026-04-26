-- 194_beehive_quorum_voting.sql — quorum-vote requests + per-peer
-- response tracking for the Beehive pillar.
--
-- For high-stakes decisions where a single LLM evaluation is insufficient,
-- the local instance can request N peers to evaluate independently and
-- aggregate the votes. This migration adds the request + per-peer-vote
-- + aggregation tables.

CREATE TABLE IF NOT EXISTS beehive_quorum_requests (
  id                  TEXT PRIMARY KEY,
  request_kind        TEXT NOT NULL,                  -- 'safety_review' / 'classification' / 'edge_case' / 'release_gate' / 'other'
  payload             JSONB NOT NULL,
  payload_sha256      TEXT NOT NULL,                  -- so we can dedupe identical re-requests
  requested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  requested_by        TEXT,
  quorum_size         INTEGER NOT NULL,               -- target N peer responses
  min_quorum          INTEGER NOT NULL,               -- min responses needed to declare a result
  expires_at          TIMESTAMP NOT NULL,
  selected_peer_ids   JSONB NOT NULL,                 -- which peers we asked
  status              TEXT NOT NULL DEFAULT 'pending', -- 'pending' / 'collecting' / 'reached' / 'failed_quorum' / 'expired' / 'cancelled'
  resolved_at         TIMESTAMP,
  aggregate_result    JSONB,                          -- { vote_counts, winning_value, agreement_pct, dissent_payloads }
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS beehive_quorum_requests_pending_idx
  ON beehive_quorum_requests(expires_at) WHERE status IN ('pending', 'collecting');

CREATE INDEX IF NOT EXISTS beehive_quorum_requests_kind_idx
  ON beehive_quorum_requests(request_kind, requested_at DESC);

CREATE INDEX IF NOT EXISTS beehive_quorum_requests_dedupe_idx
  ON beehive_quorum_requests(payload_sha256);

CREATE TABLE IF NOT EXISTS beehive_quorum_responses (
  id                  TEXT PRIMARY KEY,
  request_id          TEXT NOT NULL,
  peer_id             TEXT NOT NULL,
  responded_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  vote_value          TEXT NOT NULL,                  -- the categorical vote ('approve'/'reject'/'investigate', or arbitrary classification)
  confidence          NUMERIC,                        -- peer's self-reported confidence 0.0–1.0
  rationale_md        TEXT,
  evidence_refs       JSONB DEFAULT '[]',
  signature           TEXT NOT NULL,                  -- Ed25519 sig over the response payload
  payload             JSONB DEFAULT '{}',
  UNIQUE(request_id, peer_id)
);

CREATE INDEX IF NOT EXISTS beehive_quorum_responses_request_idx
  ON beehive_quorum_responses(request_id);

CREATE INDEX IF NOT EXISTS beehive_quorum_responses_peer_idx
  ON beehive_quorum_responses(peer_id, responded_at DESC);

-- Audit-trail of quorum decisions actually applied locally. Distinct
-- from the request itself — this is "we trusted the quorum result and
-- did X with it".

CREATE TABLE IF NOT EXISTS beehive_quorum_decisions (
  id              TEXT PRIMARY KEY,
  request_id      TEXT NOT NULL UNIQUE,
  decided_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_by      TEXT,                           -- who in the local instance accepted the quorum
  applied         BOOLEAN NOT NULL,               -- true = we acted on it; false = overrode
  override_reason TEXT,                           -- when applied = false
  applied_to      TEXT                            -- pointer into the relevant table (e.g. release id, classification record id)
);

CREATE INDEX IF NOT EXISTS beehive_quorum_decisions_request_idx
  ON beehive_quorum_decisions(request_id);
