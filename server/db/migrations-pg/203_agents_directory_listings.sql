-- 203_agents_directory_listings.sql — public-facing agent directory +
-- subscription/contract registry for the Specialized Agents pillar.
--
-- The base specialized_agents schema is private to the operator. This
-- migration adds the public-listing layer: which agents are advertised
-- to other ANTON instances + the FC marketplace, plus the subscription
-- model for users who pay to consume them.

CREATE TABLE IF NOT EXISTS agent_directory_listings (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL UNIQUE,
  listing_handle      TEXT NOT NULL UNIQUE,          -- e.g. '@anton-tax-support' / portal-style address
  display_name        TEXT NOT NULL,
  short_description   TEXT NOT NULL,
  long_description_md TEXT,
  category            TEXT NOT NULL,                 -- 'support' / 'sales' / 'hr' / 'compliance' / 'travel' / 'research' / 'other'
  topic_tags          JSONB DEFAULT '[]',
  jurisdictions       JSONB DEFAULT '[]',
  service_languages   JSONB DEFAULT '[]',
  pricing_kind        TEXT NOT NULL DEFAULT 'free',  -- 'free' / 'per_call' / 'subscription' / 'contact_for_quote'
  pricing_payload     JSONB DEFAULT '{}',
  trust_score         NUMERIC,                       -- operator-curated, 0.0–1.0
  signature           TEXT,                          -- Ed25519 sig of the listing payload
  is_published        BOOLEAN DEFAULT FALSE,
  published_at        TIMESTAMP,
  unpublished_at      TIMESTAMP,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_directory_listings_published_idx
  ON agent_directory_listings(category, trust_score DESC NULLS LAST) WHERE is_published = TRUE;

CREATE INDEX IF NOT EXISTS agent_directory_listings_handle_idx
  ON agent_directory_listings(listing_handle);

-- Subscription registry: when a user (local or remote) subscribes to
-- consume an agent, this is the contract record.

CREATE TABLE IF NOT EXISTS agent_subscriptions (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  subscriber          TEXT NOT NULL,                 -- pubkey or 'local' for self-consumption
  subscription_kind   TEXT NOT NULL,                 -- 'trial' / 'usage_based' / 'monthly' / 'annual' / 'enterprise_contract'
  started_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ends_at             TIMESTAMP,
  call_limit          INTEGER,                        -- nullable = unlimited
  calls_used          INTEGER DEFAULT 0,
  reset_at            TIMESTAMP,                      -- when calls_used resets (e.g., monthly)
  status              TEXT NOT NULL DEFAULT 'active', -- 'trial' / 'active' / 'expired' / 'cancelled' / 'overage' / 'paused'
  payment_method      TEXT,
  cancellation_reason TEXT,
  cancelled_at        TIMESTAMP,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_subscriptions_agent_idx
  ON agent_subscriptions(agent_id, status);

CREATE INDEX IF NOT EXISTS agent_subscriptions_subscriber_idx
  ON agent_subscriptions(subscriber, status);

CREATE INDEX IF NOT EXISTS agent_subscriptions_active_idx
  ON agent_subscriptions(agent_id, ends_at) WHERE status = 'active';
