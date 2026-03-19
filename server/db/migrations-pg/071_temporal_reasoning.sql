-- Migration 071: Temporal Reasoning, Goals Profile & Values Alignment

-- 1. Goals Profiles — one per user, time horizons per horizon level
CREATE TABLE IF NOT EXISTS goals_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL DEFAULT 'default',
  today_focus JSONB DEFAULT '[]'::jsonb,
  this_week_goals JSONB DEFAULT '[]'::jsonb,
  this_month_goals JSONB DEFAULT '[]'::jsonb,
  this_year_goals JSONB DEFAULT '[]'::jsonb,
  this_decade_vision TEXT DEFAULT '',
  today_updated_at TIMESTAMPTZ,
  week_updated_at TIMESTAMPTZ,
  month_updated_at TIMESTAMPTZ,
  year_updated_at TIMESTAMPTZ,
  decade_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_profiles_user ON goals_profiles(user_id);

-- 2. Domain Strategies — per user, per domain
CREATE TABLE IF NOT EXISTS domain_strategies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL DEFAULT 'default',
  domain TEXT NOT NULL,
  strategy_type TEXT NOT NULL,
  strategy_label TEXT,
  parameters JSONB DEFAULT '{}'::jsonb,
  atom_weights JSONB DEFAULT '{}'::jsonb,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_domain_strategies_user ON domain_strategies(user_id, domain);

-- 3. Values Constraints
CREATE TABLE IF NOT EXISTS values_constraints (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  description TEXT,
  constraint_type TEXT NOT NULL CHECK(constraint_type IN (
    'exclude_sector', 'exclude_entity', 'exclude_theme',
    'prefer_sector', 'prefer_theme', 'behaviour_rule', 'custom'
  )),
  scope TEXT DEFAULT 'all' CHECK(scope IN ('all', 'finance', 'work', 'school', 'life')),
  value TEXT NOT NULL,
  enforcement TEXT DEFAULT 'hard' CHECK(enforcement IN ('hard', 'soft')),
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_values_constraints_user ON values_constraints(user_id, scope);

-- 4. Conflict Resolution Rules
CREATE TABLE IF NOT EXISTS conflict_resolution_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL DEFAULT 'default',
  conflict_type TEXT NOT NULL CHECK(conflict_type IN (
    'short_vs_long_term', 'values_vs_optimisation', 'strategy_vs_urgency',
    'cross_domain', 'cross_horizon'
  )),
  resolution TEXT NOT NULL CHECK(resolution IN (
    'flag_and_ask', 'long_term_wins', 'short_term_wins',
    'values_always_win', 'urgency_critical_only', 'custom'
  )),
  custom_logic TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conflict_rules_user ON conflict_resolution_rules(user_id);

-- 5. Temporal Consequence Log
CREATE TABLE IF NOT EXISTS temporal_consequence_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL DEFAULT 'default',
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'recommendation', 'prediction', 'autonomous_action', 'module_output', 'manual_check'
  )),
  trigger_id TEXT,
  impact_today JSONB,
  impact_this_week JSONB,
  impact_this_month JSONB,
  impact_this_year JSONB,
  impact_this_decade JSONB,
  conflicts_detected INTEGER DEFAULT 0,
  conflict_details JSONB DEFAULT '[]'::jsonb,
  values_violated INTEGER DEFAULT 0,
  values_details JSONB DEFAULT '[]'::jsonb,
  strategy_aligned INTEGER DEFAULT 1,
  strategy_details TEXT,
  resolution TEXT,
  resolution_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_temporal_log_user ON temporal_consequence_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_temporal_log_trigger ON temporal_consequence_log(trigger_type, trigger_id);

-- 6. Extend market_atoms with horizon columns
ALTER TABLE market_atoms ADD COLUMN IF NOT EXISTS horizon TEXT;
ALTER TABLE market_atoms ADD COLUMN IF NOT EXISTS horizons_involved JSONB DEFAULT '[]'::jsonb;
ALTER TABLE market_atoms ADD COLUMN IF NOT EXISTS strategy_relevance JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_market_atoms_horizon ON market_atoms(horizon) WHERE horizon IS NOT NULL;

-- 7. Extend market_predictions with horizon and strategy context
ALTER TABLE market_predictions ADD COLUMN IF NOT EXISTS horizon TEXT DEFAULT 'this_month';
ALTER TABLE market_predictions ADD COLUMN IF NOT EXISTS strategy_context TEXT;
ALTER TABLE market_predictions ADD COLUMN IF NOT EXISTS values_applied JSONB DEFAULT '[]'::jsonb;
ALTER TABLE market_predictions ADD COLUMN IF NOT EXISTS temporal_consequences JSONB;
CREATE INDEX IF NOT EXISTS idx_market_predictions_horizon ON market_predictions(horizon);

-- 8. Seed default conflict resolution rules
INSERT INTO conflict_resolution_rules (user_id, conflict_type, resolution) VALUES
  ('default', 'short_vs_long_term', 'flag_and_ask'),
  ('default', 'values_vs_optimisation', 'values_always_win'),
  ('default', 'strategy_vs_urgency', 'flag_and_ask'),
  ('default', 'cross_domain', 'flag_and_ask'),
  ('default', 'cross_horizon', 'flag_and_ask')
ON CONFLICT DO NOTHING;
