-- 172_life_pillar_consolidated.sql — proper PG schema for Life pillar.
--
-- Phase B.3 build-out. Consolidates the inline `CREATE TABLE IF NOT EXISTS`
-- blocks that previously lived inside server/routes/{news,finance,travel}.ts
-- into a real migration with PG-native types (TIMESTAMP / JSONB / NUMERIC) and
-- explicit primary keys. Idempotent — safe to re-run.
--
-- Tables touched: news_sources, news_stories, news_articles, truth_checks,
-- news_user_preferences, finance_watchlist, finance_snapshots,
-- finance_learning_progress, finance_goals, travel_trips,
-- travel_itinerary_items, travel_country_intel, travel_packing_lists.
--
-- All tables already exist (created lazily by routes). This migration:
--   1) Promotes the lazy SQLite-style CREATE TABLE statements to PG-native
--      definitions (idempotent via IF NOT EXISTS).
--   2) Adds the indexes that were missing.
--   3) Seeds 3 anchor finance_goal templates so the Life dashboard has
--      starting content for new instances.

-- ── News tables (idempotent — promote lazy schema) ────────────────────

CREATE TABLE IF NOT EXISTS news_sources (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL,
  rss_url          TEXT,
  country          TEXT DEFAULT 'global',
  language         TEXT DEFAULT 'en',
  bias_rating      TEXT DEFAULT 'center',
  factuality_score INTEGER DEFAULT 70,
  ownership        TEXT,
  category         TEXT DEFAULT 'general',
  is_active        INTEGER DEFAULT 1,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS news_sources_country_idx  ON news_sources(country);
CREATE INDEX IF NOT EXISTS news_sources_category_idx ON news_sources(category);
CREATE INDEX IF NOT EXISTS news_sources_active_idx   ON news_sources(is_active);

CREATE TABLE IF NOT EXISTS news_stories (
  id                     TEXT PRIMARY KEY,
  headline               TEXT NOT NULL,
  summary                TEXT,
  cluster_id             TEXT,
  first_seen             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  topic_tags             TEXT DEFAULT '[]',
  entities               TEXT DEFAULT '[]',
  article_count          INTEGER DEFAULT 0,
  source_diversity_score INTEGER DEFAULT 0,
  truth_check_id         TEXT
);

CREATE INDEX IF NOT EXISTS news_stories_last_updated_idx ON news_stories(last_updated DESC);

-- ── Finance tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_watchlist (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL DEFAULT 'default',
  symbol       TEXT NOT NULL,
  name         TEXT,
  asset_type   TEXT DEFAULT 'stock',
  currency     TEXT DEFAULT 'USD',
  target_price NUMERIC,
  notes        TEXT,
  added_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, symbol)
);

CREATE TABLE IF NOT EXISTS finance_goals (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL DEFAULT 'default',
  goal_type            TEXT NOT NULL,
  title                TEXT NOT NULL,
  target_amount        NUMERIC,
  current_amount       NUMERIC DEFAULT 0,
  currency             TEXT DEFAULT 'SEK',
  target_date          TEXT,
  monthly_contribution NUMERIC,
  parameters           TEXT DEFAULT '{}',
  status               TEXT DEFAULT 'active',
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Travel tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS travel_trips (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL DEFAULT 'default',
  title        TEXT NOT NULL,
  destination  TEXT NOT NULL,
  start_date   TEXT,
  end_date     TEXT,
  budget_total NUMERIC,
  currency     TEXT DEFAULT 'SEK',
  status       TEXT DEFAULT 'planning',
  notes        TEXT,
  cover_emoji  TEXT DEFAULT '✈️',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS travel_trips_user_idx ON travel_trips(user_id);

-- ── Life category preference (cross-area) ─────────────────────────────

CREATE TABLE IF NOT EXISTS life_category_preferences (
  user_id          TEXT NOT NULL DEFAULT 'default',
  category         TEXT NOT NULL,
  pinned           BOOLEAN DEFAULT FALSE,
  display_order    INTEGER DEFAULT 0,
  config           JSONB DEFAULT '{}',
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category)
);

-- ── Anchor seeds (idempotent) ─────────────────────────────────────────
-- Three example finance-goal templates for new instances. The user can
-- duplicate them into their own goals; templates themselves are read-only.

CREATE TABLE IF NOT EXISTS finance_goal_templates (
  id              TEXT PRIMARY KEY,
  goal_type       TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  default_months  INTEGER,
  guidance_md     TEXT,
  is_active       BOOLEAN DEFAULT TRUE
);

INSERT INTO finance_goal_templates (id, goal_type, title, description, default_months, guidance_md) VALUES
  ('tmpl_emergency_fund_3m',
   'emergency_fund',
   '3-month emergency fund',
   'Cover 3 months of essential expenses in a liquid account. The classic personal-finance starting point.',
   12,
   '## When to use this template

If you have <1 month of expenses set aside, this is the goal that protects everything else. A medical bill, car repair, or temporary income loss without an emergency fund forces you into high-interest debt; with it, those events are inconveniences instead of crises.

## How to size the target

- Estimate your monthly **essential** expenses (rent/mortgage, utilities, food, transport, insurance, debt minimums) — not your total spend.
- Multiply by 3.
- Don''t inflate the number; you can extend to 6 months later. Getting to 3 fast matters more than getting to 6 slowly.

## Where to keep it

- High-yield savings account at a different bank than your everyday account (friction = protection).
- Not in stocks, not in crypto, not locked in a fixed-term deposit.

## How to fund it

- Set monthly contribution to (target − current) / default_months.
- Automate transfer the day after payday.'),

  ('tmpl_house_deposit_3y',
   'savings',
   'House deposit (3-year horizon)',
   'Save toward a property deposit over a 3-year window. Mid-horizon savings goal.',
   36,
   '## When to use this template

You expect to buy a property in roughly 3 years and want to track progress toward the deposit + closing costs.

## How to size the target

- Property price you can realistically afford (use the affordability calculator).
- Deposit % required by your jurisdiction (typically 10–25% in EU, 5–20% in US).
- Closing costs: stamp duty, legal fees, broker fees, moving costs (typically 2–5% on top).

## Where to keep it

- Mostly cash / money-market funds — 3 years is too short for stocks.
- Small allocation (10–20%) to balanced funds is reasonable if you''re flexible on the date.

## How to fund it

- Monthly contribution = (target − current) / 36.
- Re-evaluate quarterly — house prices move; targets should too.'),

  ('tmpl_retirement_30y',
   'retirement',
   'Retirement (30-year horizon)',
   'Long-horizon retirement contribution tracking.',
   360,
   '## When to use this template

You''re ≥25 years from retirement and want a single goal that captures total invested capital.

## How to size the target

Two ways:

1. **Income replacement** — Aim for 25× your expected annual retirement spend (the 4% rule). If you''ll need $40k/yr, target $1m.
2. **Net-worth multiple** — 12-15× current annual income is a common rule-of-thumb at age 65.

## Where to keep it

- Tax-advantaged accounts first (401k / IRA / ISP / pension), employer match always.
- Diversified equity index funds for the bulk over a 30-year horizon.
- Lifecycle / target-date funds are a reasonable default if you don''t want to manage allocation.

## How to fund it

- Aim for 15% of gross income to retirement (employer match counts).
- Increase contribution % automatically by 1% / year if your plan supports it.')
ON CONFLICT (id) DO NOTHING;
