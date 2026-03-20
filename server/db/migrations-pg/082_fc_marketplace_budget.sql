-- Migration 082: FutureChain Marketplace, Budget Controls, Payment Terms

-- ═══ E5: Budget Controls ═════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fc_budget_rules (
  id TEXT PRIMARY KEY DEFAULT 'default',
  max_per_transaction_ftc DOUBLE PRECISION NOT NULL DEFAULT 20.0,
  max_daily_transactions INTEGER NOT NULL DEFAULT 3,
  max_daily_spend_ftc DOUBLE PRECISION NOT NULL DEFAULT 50.0,
  max_monthly_spend_ftc DOUBLE PRECISION NOT NULL DEFAULT 500.0,
  auto_approve_below_ftc DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  per_contact_monthly_limit_ftc DOUBLE PRECISION DEFAULT NULL,
  address_whitelist JSONB DEFAULT '[]',
  require_approval_above_ftc DOUBLE PRECISION NOT NULL DEFAULT 10.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO fc_budget_rules (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS fc_spending_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  transactions_today INTEGER NOT NULL DEFAULT 0,
  total_spent_today_ftc DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  total_spent_month_ftc DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  last_daily_reset DATE NOT NULL DEFAULT CURRENT_DATE,
  last_monthly_reset TEXT NOT NULL DEFAULT TO_CHAR(NOW(), 'YYYY-MM'),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO fc_spending_state (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS fc_spending_log (
  id TEXT PRIMARY KEY,
  transaction_id TEXT,
  task_id TEXT,
  amount_ftc DOUBLE PRECISION NOT NULL,
  recipient_address TEXT,
  check_result TEXT NOT NULL CHECK(check_result IN ('approved', 'requires_approval', 'blocked')),
  block_reason TEXT,
  rule_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fc_spending_log_created ON fc_spending_log(created_at DESC);

-- ═══ E6: Service Marketplace ═════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fc_service_listings (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_ftc DOUBLE PRECISION NOT NULL,
  pricing_model TEXT NOT NULL DEFAULT 'fixed' CHECK(pricing_model IN ('fixed', 'per_hour', 'per_token', 'quality_linked')),
  quality_threshold_full DOUBLE PRECISION DEFAULT 8.0,
  quality_threshold_partial DOUBLE PRECISION DEFAULT 6.0,
  partial_pay_percent INTEGER DEFAULT 50,
  max_turnaround_hours INTEGER DEFAULT 24,
  is_active BOOLEAN DEFAULT TRUE,
  capability_card_snapshot JSONB,
  total_completions INTEGER DEFAULT 0,
  avg_quality_score DOUBLE PRECISION,
  total_revenue_ftc DOUBLE PRECISION DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fc_service_active ON fc_service_listings(is_active, module_id);

-- ═══ E7: Payment Terms on Tasks ══════════════════════════════════════════════
ALTER TABLE community_delegated_tasks ADD COLUMN IF NOT EXISTS payment_amount_ftc DOUBLE PRECISION;
ALTER TABLE community_delegated_tasks ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'none';
ALTER TABLE community_delegated_tasks ADD COLUMN IF NOT EXISTS payment_terms JSONB DEFAULT NULL;
ALTER TABLE community_delegated_tasks ADD COLUMN IF NOT EXISTS payment_tx_id TEXT;
ALTER TABLE community_delegated_tasks ADD COLUMN IF NOT EXISTS service_listing_id TEXT;
ALTER TABLE community_delegated_tasks ADD COLUMN IF NOT EXISTS quality_linked_terms JSONB DEFAULT NULL;
