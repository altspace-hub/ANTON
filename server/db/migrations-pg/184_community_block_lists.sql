-- 184_community_block_lists.sql — block list + spam-report tracking +
-- federated reputation hints for the Community pillar.
--
-- The base community tables (mig 077-080) cover identity + messaging +
-- trails. This adds the moderation layer: per-user block lists, abuse
-- reports, and a federated reputation hint that peers can advertise to
-- warn each other about persistent abusers.

CREATE TABLE IF NOT EXISTS community_block_list (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  blocked_pubkey  TEXT NOT NULL,
  blocked_hash    TEXT NOT NULL,         -- contact-hash form, for display
  reason          TEXT,
  scope           TEXT NOT NULL DEFAULT 'all',   -- 'all' / 'messages' / 'shares' / 'queries'
  blocked_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at      TIMESTAMP,                     -- nullable = permanent
  UNIQUE(user_id, blocked_pubkey, scope)
);

CREATE INDEX IF NOT EXISTS community_block_list_user_idx
  ON community_block_list(user_id, blocked_pubkey);

-- Note: a partial index with a now()/CURRENT_TIMESTAMP predicate isn't
-- allowed (function not IMMUTABLE) — filter on expires_at IS NULL only.
CREATE INDEX IF NOT EXISTS community_block_list_active_idx
  ON community_block_list(blocked_pubkey)
  WHERE expires_at IS NULL;

-- Per-message abuse report. The reporter is always identified; the
-- report itself is signed so it can be relayed to other instances if
-- the user opts to share their reports for federated reputation.

CREATE TABLE IF NOT EXISTS community_abuse_reports (
  id              TEXT PRIMARY KEY,
  reporter_pubkey TEXT NOT NULL,
  reported_pubkey TEXT NOT NULL,
  message_id      TEXT,
  report_kind     TEXT NOT NULL,         -- 'spam' / 'harassment' / 'csam' / 'illegal' / 'impersonation' / 'other'
  description     TEXT,
  evidence        JSONB DEFAULT '{}',
  reported_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  signature       TEXT NOT NULL,          -- Ed25519 sig over the report payload
  status          TEXT NOT NULL DEFAULT 'open',  -- 'open' / 'reviewed' / 'actioned' / 'dismissed'
  reviewed_at     TIMESTAMP,
  reviewer_notes  TEXT,
  shared_with_peers BOOLEAN DEFAULT FALSE -- did the user opt to share this report federated?
);

CREATE INDEX IF NOT EXISTS community_abuse_reports_reported_idx
  ON community_abuse_reports(reported_pubkey, reported_at DESC);

-- Federated reputation hints: signed advisories from trusted peers
-- about specific pubkeys. Inbound only — local instance can choose to
-- weight them or ignore based on the originating peer's trust score.

CREATE TABLE IF NOT EXISTS community_reputation_hints (
  id              TEXT PRIMARY KEY,
  origin_pubkey   TEXT NOT NULL,          -- the peer who sent the hint
  subject_pubkey  TEXT NOT NULL,          -- the pubkey the hint is *about*
  hint_kind       TEXT NOT NULL,          -- 'spam' / 'verified' / 'high_trust' / 'low_trust' / 'caution'
  payload         JSONB DEFAULT '{}',
  received_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at      TIMESTAMP,
  signature       TEXT NOT NULL,
  origin_trust    NUMERIC,                -- snapshot of origin trust at receipt
  applied_locally BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS community_reputation_hints_subject_idx
  ON community_reputation_hints(subject_pubkey);
