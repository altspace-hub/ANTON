# ANTON Platform — New Tabs Implementation Specification

## For Claude Code Execution

**Version:** 1.0
**Date:** March 2026
**Purpose:** Complete implementation brief for Claude Code to build five new platform tabs
**Priority:** Read the ENTIRE spec before writing any code. Examine existing codebase thoroughly first.

---

## ⚠️ CRITICAL INSTRUCTIONS FOR CLAUDE CODE

1. **INVESTIGATE FIRST.** Before creating ANY new files, read the full directory structure. Open and read at least 5 existing pages, 5 existing services, and 5 existing route files to understand conventions.
2. **FOLLOW EXISTING PATTERNS.** Match naming conventions, file structure, import patterns, error handling, and TypeScript types used elsewhere in the codebase.
3. **DO NOT DUPLICATE.** The Regulatory Radar (`radar_sources`, `radar_items`, `regulatory-radar.ts`, `RadarPage.tsx`, `RadarWidget.tsx`) already exists. The News tab EXTENDS this — it does not rebuild it.
4. **DATABASE MIGRATIONS.** All new tables go through the existing migration pattern. Check `db/` or `migrations/` folder for how schema changes are applied.
5. **BUILD IN ORDER.** Follow the phased build order at the bottom of this document. Do not skip ahead.

---

## PART 0: EXISTING INFRASTRUCTURE AUDIT

Before building anything, Claude Code must examine and document:

```
READ these files/directories first:
- package.json (dependencies, scripts)
- tsconfig.json (TypeScript config)
- src/App.tsx or equivalent (main routing, tab/navigation structure)
- src/components/ (shared component library)
- src/pages/ (all 36+ existing pages — understand the pattern)
- src/services/ (all existing services — understand the API patterns)
- src/routes/ or src/api/ (all 41+ existing API routes)
- src/db/ or equivalent (database schema, migration system)
- src/data/areas/ (how 29 areas are structured — module.json, system-prompt.md)
- src/data/modules/ (module configuration pattern)
- src/services/regulatory-radar.ts (THIS IS THE FOUNDATION for News tab)
- src/pages/RadarPage.tsx (existing radar UI — News tab extends this)
- src/services/connection-manager.ts (LLM API connection — reuse for AI analysis)
```

Document findings before proceeding:
- What framework? (React + what? Vite? Next.js? CRA?)
- What CSS approach? (Tailwind? CSS modules? Styled-components?)
- What state management? (Context? Zustand? Redux?)
- What routing? (React Router? File-based?)
- How are tabs/navigation currently structured? (This determines where new tabs go)
- What icon library? (Lucide? HeroIcons? react-icons?)
- What database? (SQLite via better-sqlite3? Prisma?)
- How are API routes defined? (Express? Fastify? tRPC?)

---

## PART 1: NAVIGATION — THE TAB SYSTEM

### Current State
ANTON currently has tabs for **Work** and **School** (Education area). The new tabs sit alongside these.

### New Navigation Structure

```
┌─────────────────────────────────────────────────────────┐
│  🏢 Work  │  🎓 School  │  📰 News  │  💰 Finance  │  ✈️ Travel  │  👥 Community  │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**Find the existing navigation component** (likely in `src/components/Navigation.tsx`, `src/components/Sidebar.tsx`, `src/layouts/`, or `src/App.tsx`).

Add the new tabs using the same pattern as Work/School. Each tab routes to its own layout page:

```typescript
// Add to existing tab/route configuration — match existing pattern exactly
{ id: 'news', label: 'News', icon: 'Newspaper', path: '/news', component: NewsLayout },
{ id: 'finance', label: 'Finance', icon: 'TrendingUp', path: '/finance', component: FinanceLayout },
{ id: 'travel', label: 'Travel', icon: 'Plane', path: '/travel', component: TravelLayout },
{ id: 'community', label: 'Community', icon: 'Users', path: '/community', component: CommunityLayout, disabled: true, disabledReason: 'Enable in Settings → Community' },
```

Community tab renders as greyed-out/disabled by default with a tooltip explaining how to enable it.

---

## PART 2: DATABASE SCHEMA — ALL NEW TABLES

### Migration file: `XXX_new_tabs.sql`

Add all tables in a single migration. Total: **21 new tables**.

```sql
-- ============================================================
-- NEWS TAB TABLES (5 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS news_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  country TEXT,
  language TEXT DEFAULT 'en',
  source_type TEXT DEFAULT 'rss' CHECK(source_type IN ('rss','web_page','api','manual')),
  bias_rating TEXT DEFAULT 'unrated' CHECK(bias_rating IN ('far_left','left','lean_left','centre','lean_right','right','far_right','unrated')),
  bias_confidence REAL DEFAULT 0,
  factuality_score REAL DEFAULT 0,
  ownership_type TEXT DEFAULT 'unknown' CHECK(ownership_type IN ('independent','corporate_conglomerate','pe_owned','state_funded','nonprofit','individual','unknown')),
  owner_name TEXT,
  funding_model TEXT,
  founded_year INTEGER,
  wikipedia_url TEXT,
  fetch_url TEXT,            -- actual RSS/scrape URL (may differ from homepage)
  fetch_interval INTEGER DEFAULT 3600,  -- seconds between fetches
  last_fetched_at TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news_stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  topic_tags TEXT DEFAULT '[]',
  first_seen_at TEXT NOT NULL,
  first_source_id TEXT REFERENCES news_sources(id),
  story_cluster_id TEXT,
  article_count INTEGER DEFAULT 1,
  bias_distribution TEXT DEFAULT '{}',
  geographic_distribution TEXT DEFAULT '{}',
  blind_spot_type TEXT DEFAULT 'none' CHECK(blind_spot_type IN ('left_blind','right_blind','geographic_blind','none')),
  sentiment_score REAL,           -- -1.0 (negative) to 1.0 (positive)
  ai_analysis TEXT,
  ai_explainer TEXT,              -- "Explain This Story" generated content
  is_trending INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY,
  story_id TEXT REFERENCES news_stories(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES news_sources(id),
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  article_bias_score REAL,
  framing_analysis TEXT,
  is_original_reporting INTEGER DEFAULT 0,
  is_opinion INTEGER DEFAULT 0,
  content_snippet TEXT,
  language TEXT DEFAULT 'en',
  status TEXT DEFAULT 'new' CHECK(status IN ('new','read','saved','dismissed','archived')),
  user_id TEXT DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS truth_checks (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  input_type TEXT NOT NULL CHECK(input_type IN ('url','image','text','audio','hearsay')),
  input_content TEXT NOT NULL,
  input_source TEXT,
  extracted_claims TEXT DEFAULT '[]',
  trust_score_overall REAL,
  trust_scores TEXT DEFAULT '{}',
  scam_indicators TEXT DEFAULT '[]',
  ai_analysis TEXT,
  evidence_sources TEXT DEFAULT '[]',
  verdict TEXT CHECK(verdict IN ('likely_true','probably_true','unverified','questionable','likely_false','scam_warning')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news_user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  followed_topics TEXT DEFAULT '[]',
  followed_sources TEXT DEFAULT '[]',
  blocked_sources TEXT DEFAULT '[]',
  regions TEXT DEFAULT '[]',
  reading_history TEXT DEFAULT '[]',   -- article IDs for bias analysis
  bias_profile TEXT DEFAULT '{}',       -- computed reading bias breakdown
  diversity_score REAL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for News
CREATE INDEX IF NOT EXISTS idx_news_articles_story ON news_articles(story_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles(source_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_status ON news_articles(status, user_id);
CREATE INDEX IF NOT EXISTS idx_news_stories_trending ON news_stories(is_trending, created_at);
CREATE INDEX IF NOT EXISTS idx_truth_checks_user ON truth_checks(user_id, created_at);

-- ============================================================
-- FINANCE TAB TABLES (4 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  symbol TEXT NOT NULL,
  exchange TEXT,
  name TEXT NOT NULL,
  asset_type TEXT DEFAULT 'stock' CHECK(asset_type IN ('stock','etf','fund','index','crypto','commodity','currency_pair')),
  notes TEXT,
  alert_rules TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS finance_snapshots (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  price REAL,
  change_percent REAL,
  volume REAL,
  market_cap REAL,
  pe_ratio REAL,
  dividend_yield REAL,
  week_52_high REAL,
  week_52_low REAL,
  metadata TEXT DEFAULT '{}',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS finance_learning_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  topic_area TEXT NOT NULL,
  competency_level TEXT DEFAULT 'beginner' CHECK(competency_level IN ('beginner','intermediate','advanced')),
  modules_completed TEXT DEFAULT '[]',
  calculator_sessions INTEGER DEFAULT 0,
  last_accessed TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS finance_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  goal_type TEXT NOT NULL CHECK(goal_type IN ('savings','purchase','retirement','debt_payoff','emergency_fund','investment','custom')),
  title TEXT NOT NULL,
  target_amount REAL,
  current_amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'SEK',
  target_date TEXT,
  monthly_contribution REAL,
  parameters TEXT DEFAULT '{}',   -- JSON: goal-specific config (interest rate, etc.)
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','abandoned')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for Finance
CREATE INDEX IF NOT EXISTS idx_finance_watchlist_user ON finance_watchlist(user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_finance_snapshots_symbol ON finance_snapshots(symbol, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_finance_goals_user ON finance_goals(user_id, status);

-- ============================================================
-- SCHOOL TAB ENHANCEMENTS (3 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS school_curricula (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,       -- e.g., 'mathematics', 'history', 'biology', 'economics'
  level TEXT DEFAULT 'intermediate' CHECK(level IN ('beginner','intermediate','advanced','university')),
  source TEXT,                 -- 'custom', 'crashcourse', 'khan_academy', etc.
  lesson_count INTEGER DEFAULT 0,
  estimated_hours REAL,
  tags TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS school_lessons (
  id TEXT PRIMARY KEY,
  curriculum_id TEXT NOT NULL REFERENCES school_curricula(id) ON DELETE CASCADE,
  lesson_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_blocks TEXT NOT NULL DEFAULT '[]',  -- JSON array: the rich multimedia content blocks
  -- content_blocks format:
  -- [
  --   { "type": "text", "content": "markdown content here" },
  --   { "type": "video", "provider": "youtube", "video_id": "dQw4w9WgXcQ", "title": "...", "start_time": 0, "end_time": null, "channel": "CrashCourse" },
  --   { "type": "audio", "url": "https://...", "title": "Podcast episode" },
  --   { "type": "link", "url": "https://...", "title": "Interactive simulation", "description": "PhET simulation for circuits" },
  --   { "type": "image", "url": "...", "caption": "Diagram of..." },
  --   { "type": "exercise", "prompt": "Calculate the...", "hints": ["..."], "solution": "..." },
  --   { "type": "quiz", "questions": [...] },
  --   { "type": "ai_discussion", "module_id": "...", "prompt": "Discuss this concept with ANTON" },
  --   { "type": "embed", "url": "https://phet.colorado.edu/...", "title": "Interactive simulation" }
  -- ]
  learning_objectives TEXT DEFAULT '[]',
  prerequisites TEXT DEFAULT '[]',   -- lesson IDs that should be completed first
  estimated_minutes INTEGER DEFAULT 30,
  difficulty INTEGER DEFAULT 5,      -- 1-10 scale
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS school_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  curriculum_id TEXT NOT NULL REFERENCES school_curricula(id),
  lesson_id TEXT NOT NULL REFERENCES school_lessons(id),
  status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed','skipped')),
  score REAL,                  -- quiz/exercise score if applicable
  notes TEXT,                  -- student's own notes
  time_spent_minutes INTEGER DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for School
CREATE INDEX IF NOT EXISTS idx_school_lessons_curriculum ON school_lessons(curriculum_id, lesson_number);
CREATE INDEX IF NOT EXISTS idx_school_progress_user ON school_progress(user_id, curriculum_id);

-- ============================================================
-- TRAVEL TAB TABLES (4 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS travel_trips (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  destination_city TEXT,
  start_date TEXT,
  end_date TEXT,
  trip_type TEXT DEFAULT 'leisure' CHECK(trip_type IN ('leisure','business','adventure','family','solo','backpacking','road_trip','cultural','wellness')),
  budget_total REAL,
  budget_currency TEXT DEFAULT 'SEK',
  travel_party_size INTEGER DEFAULT 1,
  status TEXT DEFAULT 'planning' CHECK(status IN ('idea','planning','booked','active','completed','cancelled')),
  ai_briefing TEXT,             -- AI-generated country/city briefing
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS travel_itinerary_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  day_number INTEGER,
  time_slot TEXT,               -- '09:00', 'morning', 'afternoon', 'evening'
  item_type TEXT NOT NULL CHECK(item_type IN ('transport','accommodation','activity','food','sightseeing','rest','shopping','cultural','hidden_gem','practical')),
  title TEXT NOT NULL,
  description TEXT,
  location_name TEXT,
  location_address TEXT,
  latitude REAL,
  longitude REAL,
  estimated_cost REAL,
  cost_currency TEXT DEFAULT 'local',
  duration_minutes INTEGER,
  booking_url TEXT,
  booking_status TEXT DEFAULT 'not_booked' CHECK(booking_status IN ('not_booked','researching','booked','confirmed','cancelled')),
  ai_tip TEXT,                  -- "Hidden gem: locals come here for..."
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS travel_country_intel (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  -- Culture & Etiquette
  cultural_dos TEXT DEFAULT '[]',        -- JSON array of things to do
  cultural_donts TEXT DEFAULT '[]',      -- JSON array of things NOT to do
  greeting_customs TEXT,
  tipping_culture TEXT,
  dress_code_notes TEXT,
  -- Practical
  currency TEXT,
  language TEXT,
  english_proficiency TEXT CHECK(english_proficiency IN ('very_high','high','moderate','low','very_low')),
  visa_notes TEXT,                       -- general notes, user should verify
  power_plug_type TEXT,
  emergency_number TEXT,
  time_zone TEXT,
  -- Safety & Health
  safety_rating TEXT CHECK(safety_rating IN ('very_safe','safe','moderate','caution','high_risk')),
  safety_notes TEXT,
  health_notes TEXT,                     -- vaccinations, water safety, etc.
  common_scams TEXT DEFAULT '[]',        -- JSON array of known tourist scams
  -- Transport
  transport_notes TEXT,                  -- how to get around
  airport_tips TEXT,
  -- Food & Drink
  must_try_foods TEXT DEFAULT '[]',
  food_allergy_notes TEXT,
  drinking_water_safe INTEGER DEFAULT 1,
  alcohol_notes TEXT,
  -- Meta
  best_time_to_visit TEXT,
  peak_season TEXT,
  off_season TEXT,
  ai_generated INTEGER DEFAULT 1,
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS travel_packing_lists (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL,        -- 'documents', 'clothing', 'electronics', 'toiletries', 'medicine', 'misc'
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  is_packed INTEGER DEFAULT 0,
  is_essential INTEGER DEFAULT 0,
  notes TEXT
);

-- Indexes for Travel
CREATE INDEX IF NOT EXISTS idx_travel_trips_user ON travel_trips(user_id, status);
CREATE INDEX IF NOT EXISTS idx_travel_itinerary_trip ON travel_itinerary_items(trip_id, day_number, sort_order);
CREATE INDEX IF NOT EXISTS idx_travel_country_intel ON travel_country_intel(country_code);

-- ============================================================
-- COMMUNITY TAB TABLES (5 tables)
-- Note: Community is DISABLED by default. Tables are created
-- but the feature requires explicit activation in settings.
-- ============================================================

CREATE TABLE IF NOT EXISTS community_identity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  contact_hash TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_path TEXT,
  bio TEXT,
  public_modules TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  contact_hash TEXT NOT NULL,
  contact_public_key TEXT NOT NULL,
  display_name TEXT,
  connection_type TEXT DEFAULT 'individual' CHECK(connection_type IN ('individual','group')),
  group_id TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','blocked','removed')),
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_interaction TEXT
);

CREATE TABLE IF NOT EXISTS community_groups (
  id TEXT PRIMARY KEY,
  group_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  group_type TEXT DEFAULT 'closed' CHECK(group_type IN ('open','closed','secret')),
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  settings TEXT DEFAULT '{}',
  member_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_messages (
  id TEXT PRIMARY KEY,
  conversation_type TEXT NOT NULL CHECK(conversation_type IN ('direct','group')),
  conversation_id TEXT NOT NULL,    -- contact_hash for direct, group_id for group
  sender_hash TEXT NOT NULL,
  content_encrypted TEXT NOT NULL,  -- E2E encrypted message content
  content_type TEXT DEFAULT 'text' CHECK(content_type IN ('text','image','file','anton_package','system')),
  reply_to_id TEXT,
  is_ephemeral INTEGER DEFAULT 0,
  ephemeral_ttl INTEGER,            -- seconds until auto-delete
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_forum_posts (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  parent_id TEXT,                   -- NULL for top-level threads, post_id for replies
  author_hash TEXT NOT NULL,
  title TEXT,                       -- only for top-level threads
  content TEXT NOT NULL,            -- Markdown content
  content_type TEXT DEFAULT 'discussion' CHECK(content_type IN ('discussion','question','announcement','module_share','review','challenge')),
  attachments TEXT DEFAULT '[]',    -- JSON: [{type, path, name}]
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  is_removed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for Community
CREATE INDEX IF NOT EXISTS idx_community_connections_user ON community_connections(user_id, status);
CREATE INDEX IF NOT EXISTS idx_community_messages_conv ON community_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_forum_group ON community_forum_posts(group_id, parent_id, created_at);

-- ============================================================
-- SETTINGS EXTENSION
-- ============================================================

-- Add to existing settings/preferences table (find the actual table name first):
-- community_enabled INTEGER DEFAULT 0
-- news_bias_tracking_enabled INTEGER DEFAULT 1
-- finance_currency TEXT DEFAULT 'SEK'
-- travel_home_country TEXT DEFAULT 'SE'
```

---

## PART 3: NEWS TAB — SERVICES, ROUTES, PAGES

### 3.1 Services

**`src/services/news-feed.ts`** — Core news aggregation service
- `fetchNewsSources()` — Retrieves and parses all configured news sources (extend existing `regulatory-radar.ts` fetch logic)
- `clusterArticles(articles[])` — AI-powered story clustering: groups articles about the same event using semantic similarity of titles + entity extraction + temporal proximity. Returns story clusters.
- `scoreArticleBias(article)` — Sends article to LLM for bias analysis. Returns: loaded words identified, framing analysis, omissions detected, bias score (-1.0 left to +1.0 right)
- `analyseSourceBias(sourceId)` — Aggregate analysis of a source's historical bias patterns
- `generateStoryExplainer(storyId)` — AI generates plain-language explainer for a story cluster: what happened, why it matters, key perspectives, what might happen next
- `detectBlindSpots(userPrefs)` — Identifies stories the user's preferred sources aren't covering
- `computeUserBiasProfile(userId)` — Analyses reading history to compute personal bias breakdown

**`src/services/truth-engine.ts`** — Truth verification service
- `extractClaims(input)` — AI parses submitted content and extracts individual verifiable claims
- `traceSource(url)` — Traces URL to original source, checks domain age, WHOIS data, modification history
- `corroborateClaim(claim)` — Searches news database + web for confirming/contradicting sources
- `detectScamPatterns(input)` — Matches against known scam templates (investment, phishing, romance, fake charity, urgency tactics)
- `analyseImage(imageData)` — Checks for manipulation indicators, searches for earlier appearances
- `generateTrustScoreCard(checkId)` — Compiles all analyses into multi-dimensional trust score
- `renderVerdict(scores)` — Produces human-readable verdict with full reasoning chain

### 3.2 API Routes

Following existing route pattern (check naming convention: `/api/news/*` or `news.*`):

```
GET    /api/news/feed              — Paginated news feed (filtered by user prefs)
GET    /api/news/stories/:id       — Single story cluster with all articles
GET    /api/news/stories/:id/explain — AI explainer for a story
GET    /api/news/sources            — List all configured sources with bias/factuality data
POST   /api/news/sources            — Add a new source
PUT    /api/news/sources/:id        — Update source config
DELETE /api/news/sources/:id        — Remove source
POST   /api/news/fetch              — Trigger manual fetch of all sources
GET    /api/news/trending           — Currently trending stories
GET    /api/news/blindspots         — User's current blind spots

POST   /api/news/truth-check        — Submit content for truth verification
GET    /api/news/truth-check/:id    — Get truth check results
GET    /api/news/truth-checks       — List user's past truth checks

GET    /api/news/bias-profile       — User's reading bias analysis
PUT    /api/news/preferences        — Update followed topics, sources, regions

POST   /api/news/articles/:id/read      — Mark as read (updates bias profile)
POST   /api/news/articles/:id/save      — Save article
POST   /api/news/articles/:id/dismiss   — Dismiss article
```

### 3.3 React Pages

**`NewsLayout.tsx`** — Tab layout with sub-navigation:
- Feed | Trending | Blind Spots | Truth Check | Sources | My Bias

**`NewsFeedPage.tsx`** — Main news feed
- Story cards showing: headline, source count, bias bar, geographic indicators, sentiment
- Filter bar: topics, regions, time range, sources
- Each story card expandable to show all articles from different sources side-by-side
- "Explain This Story" button on each card

**`StoryDetailPage.tsx`** — Single story deep-dive
- All articles about this story, sorted by source bias rating
- Bias distribution bar (visual — colored segments for left/centre/right)
- Geographic map of coverage
- Timeline: who reported first, publication timestamps
- AI explainer panel
- Source ownership/funding badges on each article

**`TruthCheckPage.tsx`** — The "Is It True?" verification tool
- Input area: paste URL, upload image, type text, or describe what you heard
- Tabbed input: URL | Image | Text | "Something I Heard"
- Results page: Trust Score Card with traffic-light visualisation per dimension
- Detailed reasoning expandable per dimension
- Scam indicator warnings (prominent red banner if high risk)
- "Check Another" button

**`NewsSourcesPage.tsx`** — Source management
- All configured sources with bias/factuality ratings
- Add source form (URL, type, fetch interval)
- Source detail view: historical bias profile, ownership info, credibility track record
- Suggested sources by topic/region

**`MyBiasPage.tsx`** — Personal reading bias dashboard
- Pie chart: reading distribution across bias spectrum
- Top 10 sources by reading volume
- Blind spot summary
- Diversity score with trend line
- "Expand Your Perspective" recommendations

### 3.4 Seed Data — Default News Sources

```typescript
const DEFAULT_NEWS_SOURCES = [
  // International
  { name: 'Reuters', url: 'https://www.reuters.com', fetch_url: 'https://www.reuters.com/rssFeed/news', source_type: 'rss', bias_rating: 'centre', country: 'UK', language: 'en' },
  { name: 'Associated Press', url: 'https://apnews.com', source_type: 'rss', bias_rating: 'centre', country: 'US', language: 'en' },
  { name: 'BBC News', url: 'https://www.bbc.com/news', source_type: 'rss', bias_rating: 'centre', country: 'UK', language: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com', source_type: 'rss', bias_rating: 'lean_left', country: 'QA', language: 'en' },
  // Nordic
  { name: 'SVT Nyheter', url: 'https://www.svt.se/nyheter', source_type: 'rss', bias_rating: 'centre', country: 'SE', language: 'sv' },
  { name: 'Dagens Nyheter', url: 'https://www.dn.se', source_type: 'rss', bias_rating: 'lean_left', country: 'SE', language: 'sv' },
  { name: 'Svenska Dagbladet', url: 'https://www.svd.se', source_type: 'rss', bias_rating: 'lean_right', country: 'SE', language: 'sv' },
  { name: 'NRK', url: 'https://www.nrk.no', source_type: 'rss', bias_rating: 'centre', country: 'NO', language: 'no' },
  { name: 'Yle', url: 'https://yle.fi', source_type: 'rss', bias_rating: 'centre', country: 'FI', language: 'fi' },
  // Technology
  { name: 'Ars Technica', url: 'https://arstechnica.com', source_type: 'rss', bias_rating: 'lean_left', country: 'US', language: 'en' },
  { name: 'TechCrunch', url: 'https://techcrunch.com', source_type: 'rss', bias_rating: 'centre', country: 'US', language: 'en' },
  // Financial
  { name: 'Financial Times', url: 'https://www.ft.com', source_type: 'rss', bias_rating: 'centre', country: 'UK', language: 'en' },
  { name: 'Dagens Industri', url: 'https://www.di.se', source_type: 'rss', bias_rating: 'lean_right', country: 'SE', language: 'sv' },
  // Regulatory (extend existing radar sources)
  // EBA, ESMA, FATF, EUR-Lex, ECB — already in radar_sources, reuse them
];
```

---

## PART 4: FINANCE TAB — SERVICES, ROUTES, PAGES

### 4.1 Services

**`src/services/finance-data.ts`** — Market data service
- `fetchQuote(symbol, exchange?)` — Get current price/metrics for a symbol. Primary: Yahoo Finance API (free). Fallback: Alpha Vantage.
- `fetchHistorical(symbol, range)` — Price history (1d, 5d, 1m, 6m, 1y, 5y)
- `fetchPeers(symbol)` — Get industry peers for comparison
- `fetchMarketOverview()` — Major indices, movers, sector heatmap
- `snapshotWatchlist(userId)` — Save current prices for all watchlist items
- `generateMarketSummary()` — AI-generated plain-language market summary
- `generateCompanyBriefing(symbol)` — AI-generated company analysis (earnings, risks, opportunities)
- `translateJargon(text)` — AI rewrites financial text in plain language

**`src/services/finance-calculators.ts`** — All calculator logic (pure functions, no side effects)
- `calculateMortgage({ price, downPayment, rate, termYears, type })` → monthly payment, total interest, amortisation schedule
- `calculateCompoundInterest({ principal, rate, years, monthlyContribution })` → growth curve data points
- `calculatePensionProjection({ currentAge, retirementAge, currentSavings, monthlyContribution, expectedReturn })` → projected pension
- `calculateDebtPayoff({ debts[], strategy: 'snowball'|'avalanche', extraPayment })` → payoff timeline per debt
- `calculateAffordability({ income, debts, downPayment, rate })` → maximum affordable price
- `calculateBudget({ income, expenses[], method: '50_30_20'|'zero_based' })` → budget allocation
- `calculateCanIAffordThis({ purchase, monthlyIncome, monthlyExpenses, savings, financingRate? })` → impact analysis
- `calculateLoanComparison(loans[])` → side-by-side true cost comparison
- `calculateTaxSE({ income, municipality?, deductions[] })` → Swedish tax breakdown (kommunalskatt, statlig skatt, grundavdrag, jobbskatteavdrag)
- `adjustForInflation(amount, years, inflationRate)` → real vs nominal value

### 4.2 API Routes

```
GET    /api/finance/quote/:symbol        — Current quote
GET    /api/finance/historical/:symbol   — Price history
GET    /api/finance/peers/:symbol        — Peer companies
GET    /api/finance/market-overview      — Market summary

GET    /api/finance/watchlist             — User's watchlist
POST   /api/finance/watchlist             — Add to watchlist
DELETE /api/finance/watchlist/:id         — Remove from watchlist
PUT    /api/finance/watchlist/:id         — Update (notes, alerts)

GET    /api/finance/goals                 — User's financial goals
POST   /api/finance/goals                 — Create goal
PUT    /api/finance/goals/:id             — Update goal progress
DELETE /api/finance/goals/:id             — Delete goal

POST   /api/finance/calculate/:type       — Run any calculator (type = mortgage, compound, pension, etc.)
POST   /api/finance/explain               — AI jargon translator
POST   /api/finance/company-briefing/:symbol — AI company analysis

GET    /api/finance/learning/progress     — Learning progress across all topics
PUT    /api/finance/learning/progress/:topic — Update progress
GET    /api/finance/news/:symbol          — News for a specific stock (uses News tab infrastructure)
```

### 4.3 React Pages

**`FinanceLayout.tsx`** — Tab layout with sub-navigation:
- Learn | Market | Watchlist | Goals | Calculators

**`FinanceLearnPage.tsx`** — Financial literacy hub
- Topic cards: Budgeting, Mortgages, Pensions, Saving & Investing, Debt, Tax, International, Small Business, Insurance
- Each card shows: topic name, competency level badge (beginner/intermediate/advanced), progress bar
- Click into topic → `FinanceTopicPage.tsx` with AI-guided learning sessions using existing module architecture
- "Explain Like I'm New" toggle applies globally

**`FinanceMarketPage.tsx`** — Market overview dashboard
- Major indices cards (OMXS30, S&P 500, NASDAQ, FTSE, etc.)
- Market mood indicator (AI-generated sentence)
- Sector heatmap (green/red grid)
- Top movers (gainers/losers)
- Currency snapshot (SEK vs EUR, USD, GBP, NOK, DKK)

**`FinanceWatchlistPage.tsx`** — Personal portfolio tracking
- Watchlist items in card/table view
- Each item: name, price, daily change (color-coded), sparkline chart, P/E, yield
- Click item → detail view with full chart, peer comparison, AI briefing, related news (from News tab)
- "Add to Watchlist" search with autocomplete

**`FinanceGoalsPage.tsx`** — Goal-based planning
- Goal cards with progress rings
- "Create New Goal" wizard: select type → fill in parameters → ANTON calculates trajectory
- Each goal: progress, monthly contribution needed, projected completion date
- "What If" scenario toggles on each goal

**`FinanceCalculatorsPage.tsx`** — Interactive calculator hub
- Calculator selector (grid of cards)
- Each calculator: interactive form with sliders + number inputs → real-time result visualisation
- Charts: amortisation curves, compound growth, tax brackets, debt payoff waterfall
- "In Today's Money" toggle (inflation adjustment) on every calculator
- Export results as PDF or share to Finance goals

**⚠️ IMPORTANT: Every finance page must include a non-dismissible footer disclaimer:**
```
"ANTON provides educational information and calculation tools only. This is not financial advice.
Consult a qualified financial advisor for decisions about your personal finances."
```

---

## PART 5: SCHOOL TAB ENHANCEMENTS — MULTIMEDIA LESSONS

### 5.1 The Rich Lesson System

The School tab currently uses ANTON's module system for education. This enhancement adds a **Curriculum & Lesson layer** on top — structured learning paths that incorporate multimedia content.

### 5.2 Content Block Types

Each lesson is a sequence of **content blocks** (stored as JSON array in `school_lessons.content_blocks`):

```typescript
type ContentBlock =
  | { type: 'text'; content: string }                    // Markdown text
  | { type: 'video'; provider: 'youtube' | 'vimeo' | 'url'; video_id: string; title: string;
      channel?: string; start_time?: number; end_time?: number; description?: string }
  | { type: 'audio'; url: string; title: string; description?: string }
  | { type: 'link'; url: string; title: string; description?: string;
      link_type: 'interactive' | 'reading' | 'tool' | 'reference' }
  | { type: 'image'; url: string; caption?: string; alt?: string }
  | { type: 'embed'; url: string; title: string; height?: number }  // iframes for interactive sites
  | { type: 'exercise'; prompt: string; hints?: string[]; solution?: string;
      exercise_type: 'open' | 'calculation' | 'code' | 'essay' }
  | { type: 'quiz'; questions: QuizQuestion[] }
  | { type: 'ai_discussion'; module_id?: string; area_id?: string;
      prompt: string; description: string }                           // "Discuss with ANTON"
  | { type: 'checkpoint'; title: string; description: string }       // Progress marker
  | { type: 'divider' }
```

### 5.3 Video Integration — YouTube & Beyond

**YouTube Embed Component (`VideoPlayer.tsx`):**
- Uses YouTube IFrame API for embedded playback
- Privacy-enhanced mode: `youtube-nocookie.com` domain
- Parameters: `cc_load_policy=1` (show captions), `rel=0` (no unrelated videos after)
- Start/end time support for cueing specific segments
- Responsive sizing

**Curated Educational Channel Registry:**

The platform ships with a curated registry of high-quality educational YouTube channels. These are NOT auto-fetched — they're hand-curated references that lesson builders can search and embed from.

```typescript
const EDUCATIONAL_CHANNELS = [
  // Comprehensive / Multi-Subject
  { id: 'crashcourse', name: 'CrashCourse', youtube_id: 'UCX6b17PVsYBQ0ip5gyeme-Q',
    subjects: ['history','biology','chemistry','physics','economics','psychology','philosophy','literature','computer_science','ecology','sociology','statistics','engineering','organic_chemistry','anatomy_physiology'],
    level: 'high_school_to_university', language: 'en',
    description: '45+ courses, 1200+ videos. Fast-paced, animated. Founded by John & Hank Green. Partnership with ASU for college-level content.',
    quality_rating: 5, free: true },

  { id: 'khan_academy', name: 'Khan Academy', youtube_id: 'UC4a-Gbdw7vOaccHmFo40b9g',
    subjects: ['mathematics','algebra','geometry','calculus','statistics','physics','chemistry','biology','economics','computing','history','grammar','sat_prep'],
    level: 'elementary_to_university', language: 'en',
    description: 'Structured curriculum-aligned lessons. Step-by-step instruction. Mirrors formal education progression. 8.5M+ subscribers.',
    quality_rating: 5, free: true },

  { id: 'ted_ed', name: 'TED-Ed', youtube_id: 'UCsooa4yRKGN_zEE8iknghZA',
    subjects: ['science','history','philosophy','psychology','health','technology','arts','mathematics','language','literature'],
    level: 'all_ages', language: 'en',
    description: 'Short animated lessons (5-10 min). Thought-provoking. Created with educators worldwide.',
    quality_rating: 5, free: true },

  // Mathematics
  { id: '3blue1brown', name: '3Blue1Brown', youtube_id: 'UCYO_jab_esuFRV4b17AJtAw',
    subjects: ['mathematics','linear_algebra','calculus','neural_networks','differential_equations','topology'],
    level: 'university', language: 'en',
    description: 'Visual mathematics explanations using custom animation engine (Manim). Created by Grant Sanderson. MIT lecturer.',
    quality_rating: 5, free: true },

  { id: 'numberphile', name: 'Numberphile', youtube_id: 'UCoxcjq-8xIDTYp3uz647V5A',
    subjects: ['mathematics','number_theory','puzzles','recreational_math'],
    level: 'all_ages', language: 'en',
    description: 'Videos about numbers and mathematics. Features university professors and mathematicians.',
    quality_rating: 4, free: true },

  // Science
  { id: 'kurzgesagt', name: 'Kurzgesagt – In a Nutshell', youtube_id: 'UCsXVk37bltHxD1rDPwtNM8Q',
    subjects: ['science','physics','biology','space','philosophy','technology','environment'],
    level: 'high_school_to_adult', language: 'en',
    description: 'High-quality animation explaining complex scientific ideas. German production team. 22M+ subscribers.',
    quality_rating: 5, free: true },

  { id: 'veritasium', name: 'Veritasium', youtube_id: 'UCHnyfMqiRRG1u-2MsSQLbXA',
    subjects: ['physics','science','engineering','mathematics'],
    level: 'high_school_to_university', language: 'en',
    description: 'Science and engineering through experiments, demonstrations, and interviews. Created by Derek Muller.',
    quality_rating: 5, free: true },

  { id: 'scishow', name: 'SciShow', youtube_id: 'UCZYTClx2T1of7BRZ86-8fow',
    subjects: ['science','biology','chemistry','physics','psychology','health'],
    level: 'high_school_to_adult', language: 'en',
    description: 'Current science topics explained. Part of the Complexly network (same as CrashCourse).',
    quality_rating: 4, free: true },

  { id: 'smarter_every_day', name: 'Smarter Every Day', youtube_id: 'UC6107grRI4m0o2-emgoDnAA',
    subjects: ['physics','engineering','space','biology'],
    level: 'all_ages', language: 'en',
    description: 'Exploring the world using science. High-speed cameras, experiments, real-world demonstrations.',
    quality_rating: 5, free: true },

  // University Lectures
  { id: 'mit_ocw', name: 'MIT OpenCourseWare', youtube_id: 'UCEBb1b_L6zDS3xTUrIALZOw',
    subjects: ['mathematics','physics','chemistry','biology','computer_science','economics','engineering','philosophy'],
    level: 'university', language: 'en',
    description: 'Full MIT university lectures and course materials. Free. Includes Gilbert Strang linear algebra, Walter Lewin physics.',
    quality_rating: 5, free: true },

  // Programming
  { id: 'freecodecamp', name: 'freeCodeCamp', youtube_id: 'UC8butISFwT-Wl7EV0hUK0BQ',
    subjects: ['programming','web_development','data_science','machine_learning','python','javascript','devops'],
    level: 'beginner_to_advanced', language: 'en',
    description: 'Full-length programming courses (3-12 hours each). Completely free. Covers modern tech stack.',
    quality_rating: 5, free: true },

  // History
  { id: 'oversimplified', name: 'OverSimplified', youtube_id: 'UCNIuvl7V8zACPpTmmNIqP2A',
    subjects: ['history','world_history','wars'],
    level: 'all_ages', language: 'en',
    description: 'Humorous animated history. Makes complex wars and revolutions engaging.',
    quality_rating: 4, free: true },

  // Journalism & Media
  { id: 'vox', name: 'Vox', youtube_id: 'UCLXo7UDZvByw2ixzpQCufnA',
    subjects: ['politics','science','culture','design','history','economics','technology'],
    level: 'adult', language: 'en',
    description: 'Explanatory journalism with strong visual storytelling. Data visualisations and animations.',
    quality_rating: 4, free: true },

  // Philosophy & Big Questions
  { id: 'philosophy_tube', name: 'Philosophy Tube', youtube_id: 'UC2PA-AKmVpU6NKCGtZq_rKQ',
    subjects: ['philosophy','ethics','politics','social_theory'],
    level: 'university', language: 'en',
    description: 'Theatrical philosophy lessons. Complex ideas made accessible through performance.',
    quality_rating: 4, free: true },

  { id: 'vsauce', name: 'Vsauce', youtube_id: 'UC6nSFpj9HTCZ5t-N3Rm3-HA',
    subjects: ['philosophy','science','mathematics','psychology','physics'],
    level: 'all_ages', language: 'en',
    description: 'Deep explorations starting from simple questions. Interdisciplinary thinking.',
    quality_rating: 5, free: true },
];
```

**Interactive Resource Registry:**

```typescript
const INTERACTIVE_RESOURCES = [
  { id: 'phet', name: 'PhET Interactive Simulations', url: 'https://phet.colorado.edu',
    subjects: ['physics','chemistry','biology','mathematics','earth_science'],
    description: 'Free interactive math and science simulations from University of Colorado Boulder. Embeddable.',
    embeddable: true },
  { id: 'desmos', name: 'Desmos', url: 'https://www.desmos.com',
    subjects: ['mathematics','algebra','calculus','geometry'],
    description: 'Graphing calculator and math activities. Free. Embeddable.',
    embeddable: true },
  { id: 'geogebra', name: 'GeoGebra', url: 'https://www.geogebra.org',
    subjects: ['mathematics','geometry','algebra','calculus','statistics'],
    description: 'Dynamic mathematics software. Free. Embeddable interactive applets.',
    embeddable: true },
  { id: 'scratch', name: 'Scratch', url: 'https://scratch.mit.edu',
    subjects: ['programming','computer_science','creative_computing'],
    description: 'Visual programming language for beginners. MIT Media Lab. Embeddable projects.',
    embeddable: true },
  { id: 'codecademy', name: 'Codecademy', url: 'https://www.codecademy.com',
    subjects: ['programming','web_development','data_science','python','javascript'],
    description: 'Interactive coding lessons. Free tier available.', embeddable: false },
  { id: 'duolingo', name: 'Duolingo', url: 'https://www.duolingo.com',
    subjects: ['languages'], description: 'Language learning platform. Free tier.', embeddable: false },
];
```

### 5.4 API Routes for School Enhancements

```
GET    /api/school/curricula              — List curricula (user's + public)
POST   /api/school/curricula              — Create curriculum
PUT    /api/school/curricula/:id          — Update curriculum
DELETE /api/school/curricula/:id          — Delete curriculum

GET    /api/school/curricula/:id/lessons  — List lessons in curriculum
POST   /api/school/curricula/:id/lessons  — Add lesson
PUT    /api/school/lessons/:id            — Update lesson
DELETE /api/school/lessons/:id            — Delete lesson
PUT    /api/school/lessons/:id/reorder    — Reorder lessons

GET    /api/school/progress               — User's progress across all curricula
PUT    /api/school/progress/:lessonId     — Update progress for a lesson

GET    /api/school/channels               — List curated educational channels
GET    /api/school/channels/:id/playlists — Get playlists for a channel (YouTube API)
GET    /api/school/channels/:id/videos    — Search videos from a channel
GET    /api/school/interactive-resources   — List interactive resource registry

POST   /api/school/ai-generate-curriculum — AI generates curriculum from topic + level
POST   /api/school/ai-generate-lesson     — AI generates lesson with multimedia content blocks
```

### 5.5 React Pages for School

**`SchoolCurriculumPage.tsx`** — Curriculum browser
- Grid of curriculum cards showing: title, subject, level, progress, lesson count
- Filter by subject, level
- "Create Curriculum" (manual or AI-assisted)
- "Browse Public Curricula" for community-shared curricula

**`SchoolLessonPage.tsx`** — The rich lesson viewer (CRITICAL PAGE)
- Renders content blocks sequentially in a vertical scroll layout:
  - `text` → Rendered Markdown
  - `video` → YouTube IFrame embed (responsive, privacy-enhanced mode)
  - `audio` → HTML5 audio player with waveform visualisation
  - `link` → Styled card with title, description, "Open" button, type icon
  - `image` → Responsive image with optional caption
  - `embed` → Sandboxed iframe for interactive content (PhET, Desmos, etc.)
  - `exercise` → Expandable card with prompt, hint toggle, solution toggle
  - `quiz` → Interactive quiz component with immediate feedback
  - `ai_discussion` → Button that opens ANTON chat in context of this lesson topic
  - `checkpoint` → Visual progress marker with completion toggle
- Sidebar: curriculum outline showing current position, completed/incomplete lessons
- Bottom: Previous/Next navigation, progress bar
- "Take Notes" panel (collapsible, saves to `school_progress.notes`)

**`SchoolLessonBuilderPage.tsx`** — Drag-and-drop lesson creator
- Block palette on the left: drag text, video, link, exercise, quiz blocks onto the canvas
- Video block: search YouTube channels from the registry, preview, set start/end times
- Link block: paste URL, auto-fetch title and description
- Exercise/quiz builder with question types (multiple choice, fill-in, open)
- "AI Assist": "Generate a lesson on [topic] at [level] with videos and exercises"
- Preview mode: see the lesson as a student would
- Reorder blocks by drag-and-drop

---

## PART 6: TRAVEL TAB — SERVICES, ROUTES, PAGES

### 6.1 Services

**`src/services/travel-intel.ts`** — Travel intelligence service
- `generateCountryIntel(countryCode)` — AI generates comprehensive country intelligence (culture, etiquette, safety, practical info, food, transport). Stores in `travel_country_intel`. Refreshable.
- `generateTripBriefing(tripId)` — AI creates personalised trip briefing based on destination, dates, trip type, party size. Includes weather expectations, events happening during visit, seasonal considerations.
- `generateItinerary(tripId, preferences)` — AI generates day-by-day itinerary based on trip parameters. Includes hidden gems, local favourites, practical logistics.
- `identifyHiddenGems(destination)` — AI-powered search for off-the-beaten-path recommendations. Uses web search for local blogs, travel forums, insider tips.
- `generatePackingList(tripId)` — AI generates packing list based on destination, season, trip type, duration.
- `generateCulturalBriefing(countryCode)` — Detailed dos/don'ts, etiquette, customs, taboos. The "don't accidentally offend anyone" guide.
- `estimateBudget(tripId)` — AI estimates total trip cost based on destination, duration, travel style.
- `detectCommonScams(countryCode)` — Known tourist scams in destination (connects to Truth Engine patterns).

### 6.2 API Routes

```
GET    /api/travel/trips                    — User's trips
POST   /api/travel/trips                    — Create trip
PUT    /api/travel/trips/:id                — Update trip
DELETE /api/travel/trips/:id                — Delete trip

GET    /api/travel/trips/:id/itinerary      — Get itinerary items
POST   /api/travel/trips/:id/itinerary      — Add itinerary item
PUT    /api/travel/itinerary/:id            — Update item
DELETE /api/travel/itinerary/:id            — Delete item
PUT    /api/travel/trips/:id/itinerary/reorder — Reorder items

POST   /api/travel/trips/:id/generate-itinerary   — AI generates itinerary
POST   /api/travel/trips/:id/generate-packing-list — AI generates packing list
POST   /api/travel/trips/:id/generate-briefing     — AI generates trip briefing

GET    /api/travel/country/:code            — Country intelligence
POST   /api/travel/country/:code/generate   — Generate/refresh country intel

GET    /api/travel/trips/:id/packing-list   — Get packing list
PUT    /api/travel/packing/:id              — Toggle packed status

POST   /api/travel/estimate-budget          — AI budget estimation
```

### 6.3 React Pages

**`TravelLayout.tsx`** — Tab layout:
- My Trips | Explore | Country Guide

**`TravelTripsPage.tsx`** — Trip dashboard
- Trip cards: destination, dates, status badge, budget, party size
- Quick actions: Plan, View Itinerary, Packing List
- "Plan a New Trip" button → creation wizard

**`TravelPlannerPage.tsx`** — Single trip planning view
- Left panel: trip details (editable), AI briefing
- Centre: day-by-day itinerary (drag-and-drop reorderable)
  - Each item: time, type icon, title, location, estimated cost, booking status, AI tip
  - "Add Item" (manual) or "AI Suggest" for each day
- Right panel: map showing itinerary pins (uses existing map components if available)
- Bottom tabs: Itinerary | Budget | Packing List | Notes

**`TravelCountryGuidePage.tsx`** — Country intelligence deep-dive
- Country selector (search or click on map)
- Sections (collapsible):
  - Overview (flag, capital, language, currency, timezone, plug type)
  - Culture & Etiquette (dos and don'ts in clear green/red cards)
  - Safety (rating badge, specific warnings, common scams)
  - Food & Drink (must-try dishes, water safety, alcohol notes, allergy info)
  - Transport (how to get around, airport tips)
  - Practical (visa notes, emergency numbers, tipping, dress code)
  - Best Time to Visit (seasonal chart)
- "Refresh Intel" button (re-generates with AI + web search)
- "I'm Going Here" → creates trip pre-filled with this destination

**`TravelExplorePage.tsx`** — Inspiration browser
- "Where Should I Go?" quiz: budget, trip type, climate preference, interests → AI recommendations
- Featured destinations (AI-curated, rotates seasonally)
- "Hidden Gems" collection: off-the-beaten-path destinations
- "Trending Destinations" (from travel news in News tab)

**`TravelPackingListPage.tsx`** — Interactive packing checklist
- Categories: Documents, Clothing, Electronics, Toiletries, Medicine, Misc
- Checkboxes for each item
- Essential items highlighted
- AI-generated recommendations based on destination and season
- "Add Custom Item" for each category

---

## PART 7: COMMUNITY TAB — SERVICES, ROUTES, PAGES

**⚠️ COMMUNITY IS DISABLED BY DEFAULT.** All tables are created but the UI shows an activation screen until the user enables it in Settings.

### 7.1 Services

**`src/services/community-crypto.ts`** — Cryptographic identity service
- `generateIdentity()` — Creates Ed25519 keypair, derives contact hash, encrypts private key
- `exportContactCard()` — Generates .anton contact bundle
- `importContactCard(file)` — Validates and imports a contact
- `establishConnection(contactHash, publicKey)` — Creates bidirectional connection
- `encryptMessage(plaintext, recipientPublicKey)` — X25519 ECDH → AES-256-GCM
- `decryptMessage(ciphertext, senderPublicKey)` — Decrypt received message
- `encryptGroupMessage(plaintext, groupKey)` — Symmetric encryption for group messages

**`src/services/community-messaging.ts`** — Messaging service
- `sendDirectMessage(recipientHash, content)` — Encrypt and store locally
- `sendGroupMessage(groupId, content)` — Encrypt with group key
- `getConversation(contactHash, pagination)` — Retrieve message history
- `getGroupMessages(groupId, pagination)` — Retrieve group messages
- `createGroup(name, description, type)` — Generate group identity
- `inviteToGroup(groupId, contactHash)` — Generate group invite .anton file
- `leaveGroup(groupId)` — Remove self from group

**`src/services/community-forum.ts`** — Forum service
- `createThread(groupId, title, content, type)` — New discussion thread
- `replyToThread(threadId, content, parentPostId?)` — Reply (supports nesting)
- `votePost(postId, direction)` — Upvote/downvote
- `pinThread(threadId)` / `lockThread(threadId)` — Moderation actions
- `shareAntonPackage(groupId, packagePath)` — Share .anton file in forum

### 7.2 API Routes

```
-- Identity
POST   /api/community/identity/generate    — Generate cryptographic identity
GET    /api/community/identity              — Get own identity info
POST   /api/community/identity/export       — Export .anton contact card

-- Connections
GET    /api/community/connections            — List connections
POST   /api/community/connections/import     — Import .anton contact file
DELETE /api/community/connections/:hash      — Remove/block connection

-- Groups
GET    /api/community/groups                 — List groups
POST   /api/community/groups                 — Create group
PUT    /api/community/groups/:id             — Update group settings
DELETE /api/community/groups/:id             — Delete group (owner only)
POST   /api/community/groups/:id/invite      — Generate invite .anton file
POST   /api/community/groups/:id/join        — Join with invite

-- Messaging
GET    /api/community/messages/:conversationId — Get messages (paginated)
POST   /api/community/messages                 — Send message

-- Forums
GET    /api/community/groups/:id/threads       — List threads
POST   /api/community/groups/:id/threads       — Create thread
GET    /api/community/threads/:id              — Get thread with replies
POST   /api/community/threads/:id/reply        — Reply to thread
PUT    /api/community/posts/:id/vote           — Vote on post
PUT    /api/community/threads/:id/pin          — Pin/unpin thread
PUT    /api/community/threads/:id/lock         — Lock/unlock thread
```

### 7.3 React Pages

**`CommunityActivationPage.tsx`** — Shown when Community is disabled
- Explanation of what Community does
- Privacy & security explanation
- "Enable Community" button → generates identity
- Clear warning: "This creates a cryptographic identity on your device"

**`CommunityLayout.tsx`** — Tab layout (shown after activation):
- Contacts | Messages | Groups | My Identity

**`CommunityContactsPage.tsx`** — Contact management
- Contact list with display names, last interaction, connection status
- "Add Contact" → import .anton file or enter hash manually
- "Share My Contact" → export .anton file or display QR code with hash
- Contact detail: bio, shared modules, message button, block button

**`CommunityMessagesPage.tsx`** — Messaging interface
- Left: conversation list (contacts + groups)
- Right: message thread with chat-style UI
- Message input with attachment support (.anton files, images)
- Encryption indicator (lock icon) always visible

**`CommunityGroupPage.tsx`** — Group detail view
- Group info header (name, description, member count)
- Sub-tabs: Discussion | Members | Shared Modules
- Discussion: forum-style threaded posts
- Members: member list with roles
- Shared Modules: .anton packages shared in this group

**`CommunityIdentityPage.tsx`** — Identity management
- Your contact hash (large, copyable)
- QR code for in-person sharing
- Display name, avatar, bio (editable)
- Public module portfolio (what you've published)
- "Export Contact Card" button
- "Delete Identity" (destructive, with confirmation)

---

## PART 8: CROSS-TAB INTEGRATION POINTS

These are NOT separate features — they're wiring between existing components:

1. **News → Finance:** When a `news_article` mentions a symbol on the user's `finance_watchlist`, surface it in the watchlist detail view. Implementation: run symbol extraction on news articles, match against watchlist.

2. **News → Work (Radar):** News articles with `topic_tags` matching a user's active Work areas (e.g., "financial_regulation", "aml") should appear in the existing RadarWidget. Implementation: add a `source_tab` field to `radar_items` allowing items sourced from the News tab.

3. **Finance → News:** `FinanceWatchlistPage` company detail view includes a "Related News" section that queries `news_articles` for the company name/symbol.

4. **Travel → News:** `TravelCountryGuidePage` includes a "Recent News from [Country]" section filtering news by `news_sources.country`.

5. **School → All Tabs:** Lesson content blocks can reference Finance calculators (`{ type: 'embed', calculator: 'compound_interest' }`) and News truth checks as learning exercises.

6. **Community → News:** Forum posts can include shared news stories. Community trust scores can feed into truth check results as additional signal.

---

## PART 9: BUILD ORDER

**⚠️ Follow this order strictly. Each phase builds on the previous.**

### Phase 1: Foundation (do first)
1. Audit existing codebase (PART 0)
2. Add navigation tabs (PART 1)
3. Run database migration (PART 2)
4. Create placeholder layout pages for all 5 tabs

### Phase 2: News Tab (builds on existing Radar)
1. `news-feed.ts` service (extend `regulatory-radar.ts`)
2. News API routes
3. Seed default news sources
4. `NewsFeedPage.tsx` with story clustering
5. `StoryDetailPage.tsx` with bias bar
6. `NewsSourcesPage.tsx`
7. `truth-engine.ts` service
8. `TruthCheckPage.tsx`
9. `MyBiasPage.tsx`

### Phase 3: Finance Tab
1. `finance-calculators.ts` (pure calculation functions — write tests)
2. `finance-data.ts` service
3. Finance API routes
4. `FinanceLearnPage.tsx` + `FinanceTopicPage.tsx`
5. `FinanceCalculatorsPage.tsx` with interactive calculator components
6. `FinanceMarketPage.tsx`
7. `FinanceWatchlistPage.tsx`
8. `FinanceGoalsPage.tsx`

### Phase 4: School Enhancements
1. School database tables
2. `SchoolLessonPage.tsx` (rich content block renderer — CRITICAL)
3. `VideoPlayer.tsx` component (YouTube embed with privacy mode)
4. `SchoolLessonBuilderPage.tsx` (drag-and-drop editor)
5. `SchoolCurriculumPage.tsx`
6. Seed educational channel registry
7. AI curriculum/lesson generation endpoints

### Phase 5: Travel Tab
1. `travel-intel.ts` service
2. Travel API routes
3. `TravelTripsPage.tsx` + trip creation wizard
4. `TravelPlannerPage.tsx` with itinerary builder
5. `TravelCountryGuidePage.tsx` with AI-generated intel
6. `TravelExplorePage.tsx`
7. `TravelPackingListPage.tsx`

### Phase 6: Community Tab (last — requires most security care)
1. `community-crypto.ts` service (Ed25519 keypair generation, encryption)
2. Community API routes
3. `CommunityActivationPage.tsx`
4. `CommunityIdentityPage.tsx`
5. `CommunityContactsPage.tsx` with .anton contact import/export
6. `CommunityMessagesPage.tsx` with E2E encryption
7. `CommunityGroupPage.tsx` with forums

### Phase 7: Cross-Tab Integration
1. News → Finance symbol matching
2. News → Work radar bridge
3. Finance → News company lookup
4. Travel → News country filter
5. School → Finance calculator embeds

---

## PART 10: TESTING CHECKLIST

After each phase, verify:

- [ ] All new tables exist and are queryable
- [ ] All API routes return expected data shapes
- [ ] All new pages render without errors
- [ ] Navigation to new tabs works
- [ ] Back/forward browser navigation works
- [ ] Existing functionality (Work, School, all 29 areas) still works correctly
- [ ] News: story clustering groups related articles correctly
- [ ] News: bias bar renders proportionally
- [ ] News: truth check produces multi-dimensional score card
- [ ] Finance: all calculators produce mathematically correct results
- [ ] Finance: disclaimer visible on every finance page
- [ ] School: video embeds load in privacy-enhanced mode
- [ ] School: all content block types render correctly
- [ ] School: lesson builder drag-and-drop works
- [ ] Travel: AI-generated country intel is accurate and comprehensive
- [ ] Travel: packing list checkbox state persists
- [ ] Community: disabled by default, activation flow works
- [ ] Community: keypair generation succeeds
- [ ] Community: .anton contact export/import creates mutual connection
- [ ] Community: messages are encrypted (verify ciphertext in database)
- [ ] Community: forum threading and nesting works correctly
