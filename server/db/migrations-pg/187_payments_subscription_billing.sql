-- 187_payments_subscription_billing.sql — recurring subscription billing
-- + dunning state for the Payments pillar.
--
-- One-shot invoices (mig 185) handle ad-hoc transactions. This migration
-- adds the recurring-billing model so an instance can sell a monthly /
-- quarterly / annual subscription to its expertise / agent / pack.

CREATE TABLE IF NOT EXISTS fc_subscription_plans (
  id                  TEXT PRIMARY KEY,
  plan_code           TEXT NOT NULL UNIQUE,        -- e.g. 'expert-monthly-50' / 'agent-pro-annual-500'
  display_name        TEXT NOT NULL,
  description         TEXT,
  context_kind        TEXT NOT NULL,               -- 'agent_access' / 'module_access' / 'pack_access' / 'instance_compute' / 'other'
  context_ref         TEXT,                        -- pointer into the relevant table
  cadence             TEXT NOT NULL,               -- 'monthly' / 'quarterly' / 'annual'
  amount_per_period   NUMERIC NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'FTC',
  trial_days          INTEGER DEFAULT 0,
  min_term_periods    INTEGER DEFAULT 1,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS fc_subscription_plans_active_idx
  ON fc_subscription_plans(context_kind) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS fc_subscriptions (
  id                  TEXT PRIMARY KEY,
  plan_id             TEXT NOT NULL,
  subscriber_pubkey   TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',  -- 'trial' / 'active' / 'past_due' / 'paused' / 'cancelled' / 'expired'
  started_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_period_start TIMESTAMP,
  current_period_end  TIMESTAMP,
  next_invoice_at     TIMESTAMP,
  cancelled_at        TIMESTAMP,
  cancellation_reason TEXT,
  payment_method      TEXT,                        -- e.g. 'fc_channel_xxx' / 'manual'
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS fc_subscriptions_subscriber_idx
  ON fc_subscriptions(subscriber_pubkey, status);

CREATE INDEX IF NOT EXISTS fc_subscriptions_due_idx
  ON fc_subscriptions(next_invoice_at) WHERE status IN ('active', 'trial');

-- Dunning: when a subscription payment fails, track the recovery
-- attempts before final cancellation. A typical sequence is 3 attempts
-- spread over 14 days with grace-period messaging at each step.

CREATE TABLE IF NOT EXISTS fc_dunning_attempts (
  id                  TEXT PRIMARY KEY,
  subscription_id     TEXT NOT NULL,
  attempt_no          INTEGER NOT NULL,
  attempted_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  outcome             TEXT NOT NULL,               -- 'paid' / 'failed_insufficient_funds' / 'failed_other' / 'manually_resolved'
  failure_reason      TEXT,
  next_attempt_at     TIMESTAMP,
  notification_sent_at TIMESTAMP,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS fc_dunning_attempts_subscription_idx
  ON fc_dunning_attempts(subscription_id, attempt_no);
