# ANTON Indexes — Addendum to Markets Intelligence Specification

**Document type:** Specification addendum for Claude Code
**Created:** March 15, 2026
**Author:** Daniel Bardun (via Claude strategic session)
**Status:** Active specification — extends `MARKETS_INTELLIGENCE_SPEC.md`
**Read first:** `MARKETS_INTELLIGENCE_OVERVIEW.md` and `MARKETS_INTELLIGENCE_SPEC.md`

---

## 1. What ANTON Indexes Are

ANTON Indexes are **synthetic benchmark portfolios** — fictional, paper-traded baskets of securities that are composed, weighted, rebalanced, and tracked entirely by ANTON's intelligence engine. No real money is involved. No trades are executed. But the positions, weights, buy/sell decisions, and performance are real in the sense that they are recorded, timestamped, and verifiable against actual market data.

Think of them as ANTON's **public scorecard**. They answer the question: *"If ANTON's intelligence actually informed investment decisions, how would those decisions have performed?"*

Each index is a living experiment — a basket of securities selected and weighted based on a specific thesis, investment philosophy, or market view, with every decision traceable back to specific knowledge atoms, theses, and pattern detections. When the index outperforms its benchmark, we can trace exactly which atoms and signals drove the winning decisions. When it underperforms, we learn exactly where the intelligence was wrong.

---

## 2. Why This Matters Strategically

### 2.1 Proof of the Learning Loop

The prediction feedback loop described in the main spec is powerful but abstract. ANTON Indexes make it concrete and visible. A chart showing "ANTON Nordic 30 vs. OMX Stockholm 30" over six months is immediately understandable to anyone — from a retail investor to a Bloomberg journalist.

### 2.2 Marketing and PR Magnet

Imagine the headline: *"Open-source AI platform's Nordic banking index outperforms OMX for four consecutive months."* This is the kind of story financial media covers. The indexes become ANTON's most visible proof point — a continuously updated, publicly trackable demonstration that APCI creates real value.

### 2.3 Lessons from Renaissance Technologies / Medallion Fund

The Medallion Fund provides several relevant insights for ANTON Indexes:

**Small edges compound into extraordinary results.** Medallion was right on only ~50.75% of its trades. But across millions of trades over decades, that tiny edge — combined with disciplined position sizing, risk management, and continuous model improvement — produced a 66% annualised return before fees. ANTON doesn't need to be right 80% of the time. It needs to be right *slightly more often than wrong*, and it needs to learn from every outcome.

**One integrated model beats competing strategies.** Renaissance's edge wasn't just better maths — it was that all 200+ researchers worked on *one unified model* rather than competing internal teams. ANTON's architecture mirrors this: all consuls, all atoms, all pattern detectors feed into a single intelligence layer. The indexes are expressions of that unified intelligence, not competing sub-strategies.

**Capacity constraints are real but don't apply to paper portfolios.** Medallion caps at ~$10–15B because larger positions create market impact. ANTON Indexes are paper-traded, so there are no capacity constraints. An ANTON 100 index can track any number of positions without worrying about liquidity or slippage. This means the indexes can explore strategies that wouldn't work at institutional scale — and that's fine, because the purpose is demonstrating intelligence, not managing money.

**The public funds underperform the private one.** Renaissance's institutional funds (RIEF, RIDA) that are open to outside investors have much more modest returns than Medallion. The lesson: the strategies that work best are often the ones that don't scale. ANTON Indexes can explore high-conviction, concentrated strategies (5–10 stocks) that traditional funds can't.

### 2.4 Transparent Unlike Anyone Else

Every ANTON Index decision is fully traceable: "We added Company X on March 3 because Atom #7421 (earnings signal, confidence 0.84) combined with Atom #7398 (sector momentum insight, confidence 0.71) supported Thesis #312 (Nordic fintech rotation)." No other index provider offers this level of transparency. Bloomberg's indices are rule-based but opaque. Actively managed fund decisions are proprietary. ANTON Indexes are open-source intelligence with full audit trails.

---

## 3. Index Architecture

### 3.1 Index Types

ANTON supports multiple index categories, from broad market to highly thematic:

#### Geographic Indexes

| Index Name | Description | Benchmark | Holdings |
|---|---|---|---|
| **ANTON US 100** | ANTON's 100 highest-conviction US equities | S&P 500 | 100 |
| **ANTON EU 50** | ANTON's top European picks | EURO STOXX 50 | 50 |
| **ANTON Nordic 30** | Nordic market selections | OMX Nordic 40 | 30 |
| **ANTON Sweden 20** | Swedish market focus | OMXS30 | 20 |
| **ANTON Emerging 30** | Emerging market opportunities | MSCI Emerging Markets | 30 |
| **ANTON Global 50** | Best ideas worldwide | MSCI World | 50 |

#### Sector Indexes

| Index Name | Description | Benchmark | Holdings |
|---|---|---|---|
| **ANTON Tech 20** | Technology sector picks | NASDAQ-100 | 20 |
| **ANTON Financials 20** | Banking and financial services | KBW Bank Index | 20 |
| **ANTON Healthcare 15** | Healthcare and life sciences | S&P Health Care Select | 15 |
| **ANTON Energy 15** | Energy sector focus | S&P Energy Select | 15 |

#### Philosophy Indexes (the most interesting category)

| Index Name | Description | Philosophy | Holdings |
|---|---|---|---|
| **ANTON Value 20** | Warren Buffett-style value investing | Low P/E, strong moats, cash flow generation, durable competitive advantages | 20 |
| **ANTON Growth 20** | High-growth momentum picks | Revenue growth, TAM expansion, market share gains | 20 |
| **ANTON ESG Leaders 20** | Environmental, social, governance focus | Top ESG ratings, sustainability metrics, clean energy exposure | 20 |
| **ANTON NextGen 10** | Disruptive technology bets | AI, quantum, biotech, robotics, space — high risk, high conviction | 10 |
| **ANTON Dividend Kings 15** | Income-focused stable dividends | Consistent dividend growth, payout sustainability, yield above market | 15 |
| **ANTON Small Cap Gems 10** | Undiscovered small caps | Market cap < $2B, strong fundamentals, low analyst coverage, potential catalysts | 10 |
| **ANTON Contrarian 10** | Against-consensus picks | Most hated or overlooked stocks where ANTON's analysis disagrees with market sentiment | 10 |
| **ANTON Macro Shield 15** | Defensive/macro positioning | Positioned for ANTON's macro thesis (inflation hedge, rate sensitivity, geopolitical risk) | 15 |

#### Custom Indexes

Users can create their own ANTON-powered indexes by specifying:
- Universe (geography, market cap range, sector filter)
- Number of holdings
- Investment philosophy / selection criteria
- Rebalance frequency
- Benchmark to compare against

---

### 3.2 Index Lifecycle

```
DEFINE → COMPOSE → WEIGHT → ACTIVATE → MONITOR → REBALANCE → VALIDATE → LEARN → (repeat)
```

**Define:** Index parameters set — name, universe, philosophy, holdings count, benchmark, rebalance schedule.

**Compose:** AI consuls analyse the universe of eligible securities using the market intelligence engine. Each consul contributes picks with reasoning. The synthesis consul produces a ranked candidate list. Top N securities selected based on net conviction score.

**Weight:** Each holding receives a weight based on conviction level and risk management rules. Options include equal-weight, conviction-weighted (higher confidence = higher weight), market-cap-weighted, or risk-parity. Default: conviction-weighted with a per-position cap (e.g., max 10% for ANTON 100, max 20% for concentrated 10-stock indexes).

**Activate:** Index goes live. Starting NAV set to 1,000.00 (or 10,000.00 for broader indexes). All positions and weights recorded with timestamps. Benchmark comparison begins.

**Monitor:** Daily NAV calculation from actual market prices. Performance tracked against benchmark. Individual position attribution tracked (which holdings drove returns). Atom-level attribution maintained (which intelligence drove the holding decisions).

**Rebalance:** On schedule (weekly, monthly, quarterly depending on index type), the AI re-evaluates all holdings. Decisions: hold, increase weight, decrease weight, exit, add new. Every rebalance decision linked to specific atoms and theses. Transaction log records all fictional buys/sells with prices and reasoning.

**Validate:** After each rebalance period, review: did the changes improve or hurt performance? Which thesis-driven additions worked? Which exits were correct? This feeds into the main prediction feedback loop.

**Learn:** Rebalance outcomes update the intelligence engine — atom reweighting, signal importance, consul calibration. The next rebalance benefits from everything learned in the previous cycle.

---

## 4. Database Schema — Index Tables

Add these to the Markets database schema (extends Section 2 of the main spec):

### `market_indexes`

```sql
CREATE TABLE market_indexes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Identity
  name TEXT NOT NULL UNIQUE,               -- "ANTON US 100"
  short_name TEXT NOT NULL UNIQUE,          -- "ANTON-US100"
  description TEXT NOT NULL,
  
  -- Classification
  index_type TEXT NOT NULL,                -- 'geographic', 'sector', 'philosophy', 'custom'
  category TEXT,                           -- 'broad_market', 'concentrated', 'thematic', 'defensive'
  investment_philosophy TEXT,              -- Free-text description of the selection philosophy
  
  -- Universe & parameters
  universe_filter TEXT NOT NULL,           -- JSON: { "geography": "US", "market_cap_min": 1000000000, "sectors": [...] }
  target_holdings INTEGER NOT NULL,        -- Number of target positions
  benchmark_entity_id TEXT REFERENCES market_entities(id), -- Benchmark to compare against
  benchmark_name TEXT,                     -- Fallback: "S&P 500", "OMXS30", etc.
  
  -- Weighting
  weighting_method TEXT DEFAULT 'conviction', -- 'equal', 'conviction', 'market_cap', 'risk_parity'
  max_position_weight REAL DEFAULT 0.10,   -- Maximum weight for any single position (10% default)
  min_position_weight REAL DEFAULT 0.005,  -- Minimum weight (0.5% default)
  
  -- Rebalance
  rebalance_frequency TEXT DEFAULT 'monthly', -- 'weekly', 'biweekly', 'monthly', 'quarterly'
  last_rebalance TEXT,
  next_rebalance TEXT,
  
  -- Performance
  inception_date TEXT NOT NULL,
  inception_nav REAL DEFAULT 1000.00,
  current_nav REAL DEFAULT 1000.00,
  current_nav_date TEXT,
  total_return_pct REAL DEFAULT 0.0,
  benchmark_total_return_pct REAL DEFAULT 0.0,
  excess_return_pct REAL DEFAULT 0.0,      -- ANTON return minus benchmark return
  
  -- Track record
  total_rebalances INTEGER DEFAULT 0,
  winning_rebalances INTEGER DEFAULT 0,    -- Rebalances where changes improved performance
  total_trades INTEGER DEFAULT 0,          -- Total fictional buy/sell events
  
  -- Status
  status TEXT DEFAULT 'draft',             -- 'draft', 'active', 'paused', 'archived'
  is_public INTEGER DEFAULT 1,             -- Visible on public leaderboard
  is_system INTEGER DEFAULT 1,             -- System-managed (vs user-created custom)
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT DEFAULT 'system'
);

CREATE INDEX idx_market_indexes_type ON market_indexes(index_type);
CREATE INDEX idx_market_indexes_status ON market_indexes(status);
CREATE INDEX idx_market_indexes_excess_return ON market_indexes(excess_return_pct DESC);
CREATE INDEX idx_market_indexes_public ON market_indexes(is_public);
```

### `market_index_holdings`

Current and historical holdings for each index.

```sql
CREATE TABLE market_index_holdings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  index_id TEXT NOT NULL REFERENCES market_indexes(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES market_entities(id),
  
  -- Position
  ticker TEXT NOT NULL,
  weight REAL NOT NULL,                    -- Current weight (0.0–1.0)
  conviction_score REAL,                   -- ANTON's conviction level for this holding
  
  -- Entry
  entry_date TEXT NOT NULL,
  entry_price REAL,                        -- Price when added to index
  entry_reason TEXT,                       -- Human-readable: why was this added
  entry_thesis_id TEXT REFERENCES market_theses(id), -- Thesis that drove the inclusion
  
  -- Current
  current_price REAL,
  current_price_date TEXT,
  position_return_pct REAL DEFAULT 0.0,    -- Return since entry
  
  -- Exit (NULL if still held)
  exit_date TEXT,
  exit_price REAL,
  exit_reason TEXT,
  realised_return_pct REAL,
  
  -- Attribution
  supporting_atoms TEXT,                   -- JSON array of atom IDs supporting this holding
  
  -- Status
  is_active INTEGER DEFAULT 1,            -- 1 = currently in index, 0 = exited
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_index_holdings_index ON market_index_holdings(index_id);
CREATE INDEX idx_index_holdings_entity ON market_index_holdings(entity_id);
CREATE INDEX idx_index_holdings_active ON market_index_holdings(is_active);
CREATE INDEX idx_index_holdings_ticker ON market_index_holdings(ticker);
CREATE INDEX idx_index_holdings_entry ON market_index_holdings(entry_date);
```

### `market_index_nav_history`

Daily NAV tracking for each index.

```sql
CREATE TABLE market_index_nav_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  index_id TEXT NOT NULL REFERENCES market_indexes(id) ON DELETE CASCADE,
  
  -- NAV
  nav_date TEXT NOT NULL,
  nav_value REAL NOT NULL,
  daily_return_pct REAL,
  cumulative_return_pct REAL,
  
  -- Benchmark comparison
  benchmark_value REAL,
  benchmark_daily_return_pct REAL,
  benchmark_cumulative_return_pct REAL,
  excess_daily_return_pct REAL,
  excess_cumulative_return_pct REAL,
  
  -- Risk metrics (rolling)
  volatility_30d REAL,                    -- 30-day rolling volatility
  sharpe_ratio_30d REAL,                  -- 30-day rolling Sharpe
  max_drawdown REAL,                      -- Maximum drawdown from peak
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  
  UNIQUE(index_id, nav_date)
);

CREATE INDEX idx_nav_history_index ON market_index_nav_history(index_id);
CREATE INDEX idx_nav_history_date ON market_index_nav_history(nav_date);
CREATE INDEX idx_nav_history_index_date ON market_index_nav_history(index_id, nav_date);
```

### `market_index_rebalances`

Rebalance event log with full decision audit trail.

```sql
CREATE TABLE market_index_rebalances (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  index_id TEXT NOT NULL REFERENCES market_indexes(id) ON DELETE CASCADE,
  
  -- Timing
  rebalance_date TEXT NOT NULL,
  
  -- Changes
  additions TEXT NOT NULL,                 -- JSON: [{ "ticker": "AAPL", "weight": 0.05, "reason": "...", "thesis_id": "...", "atoms": [...] }]
  removals TEXT NOT NULL,                  -- JSON: [{ "ticker": "MSFT", "weight_was": 0.04, "reason": "...", "exit_return_pct": 0.12 }]
  weight_changes TEXT NOT NULL,            -- JSON: [{ "ticker": "GOOG", "old_weight": 0.03, "new_weight": 0.05, "reason": "..." }]
  
  -- Summary
  total_additions INTEGER DEFAULT 0,
  total_removals INTEGER DEFAULT 0,
  total_weight_changes INTEGER DEFAULT 0,
  turnover_pct REAL,                      -- What percentage of the portfolio changed
  
  -- Performance of previous period
  period_return_pct REAL,                 -- Index return since last rebalance
  benchmark_period_return_pct REAL,        -- Benchmark return over same period
  period_excess_return_pct REAL,           -- Excess return for the period
  
  -- AI reasoning
  market_assessment TEXT,                  -- AI summary of current market conditions
  rebalance_rationale TEXT,                -- AI explanation of why these changes were made
  consul_contributions TEXT,               -- JSON: which consuls influenced which decisions
  
  -- Post-hoc validation (filled in at next rebalance)
  rebalance_impact TEXT,                   -- Did these changes help or hurt? Filled in retrospectively
  impact_score REAL,                       -- -1.0 (terrible) to 1.0 (excellent)
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_rebalances_index ON market_index_rebalances(index_id);
CREATE INDEX idx_rebalances_date ON market_index_rebalances(rebalance_date);
```

### `market_index_leaderboard`

Aggregated performance data for the public leaderboard.

```sql
CREATE TABLE market_index_leaderboard (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  index_id TEXT NOT NULL REFERENCES market_indexes(id) ON DELETE CASCADE,
  
  -- Period
  period TEXT NOT NULL,                    -- '1d', '1w', '1m', '3m', '6m', '1y', 'ytd', 'inception'
  
  -- Performance
  index_return_pct REAL NOT NULL,
  benchmark_return_pct REAL,
  excess_return_pct REAL,
  
  -- Risk-adjusted
  sharpe_ratio REAL,
  sortino_ratio REAL,
  max_drawdown_pct REAL,
  volatility_pct REAL,
  
  -- Ranking
  rank_by_return INTEGER,                  -- Rank among all ANTON indexes for this period
  rank_by_sharpe INTEGER,
  
  -- Streak tracking
  consecutive_months_beating_benchmark INTEGER DEFAULT 0,
  
  -- Last updated
  calculated_at TEXT DEFAULT (datetime('now')),
  
  UNIQUE(index_id, period)
);

CREATE INDEX idx_leaderboard_index ON market_index_leaderboard(index_id);
CREATE INDEX idx_leaderboard_period ON market_index_leaderboard(period);
CREATE INDEX idx_leaderboard_excess ON market_index_leaderboard(excess_return_pct DESC);
CREATE INDEX idx_leaderboard_streak ON market_index_leaderboard(consecutive_months_beating_benchmark DESC);
```

### Table Summary — Indexes

| Table | Purpose |
|---|---|
| `market_indexes` | Index definitions, parameters, and current performance |
| `market_index_holdings` | Current and historical positions with entry/exit reasoning |
| `market_index_nav_history` | Daily NAV values and benchmark comparison |
| `market_index_rebalances` | Rebalance event log with full decision audit trail |
| `market_index_leaderboard` | Aggregated performance for public display |

**Additional tables: 5** (total Markets tables now: 21)

---

## 5. Backend Services — Index Extension

### `market-index-service.ts`

Core index management.

- `createIndex(definition)` — Create a new index with parameters
- `composeIndex(indexId)` — AI-driven initial composition: select holdings from universe
- `calculateWeights(indexId)` — Apply weighting method to holdings
- `activateIndex(indexId)` — Set index live, record inception NAV
- `calculateDailyNAV(indexId)` — Fetch current prices, calculate portfolio NAV
- `runDailyNAVUpdate()` — Calculate NAV for all active indexes (scheduled job)
- `getIndexPerformance(indexId, period)` — Return performance metrics for given period
- `getLeaderboard(period)` — Return all indexes ranked by performance

### `market-index-rebalance-service.ts`

Rebalance engine — the most intelligence-intensive service.

- `shouldRebalance(indexId)` — Check if index is due for rebalance
- `generateRebalanceProposal(indexId)` — AI consuls propose changes based on current intelligence
- `evaluateHoldings(indexId)` — Review each current holding: still conviction? Exit triggers?
- `screenUniverse(indexId)` — Scan eligible securities for new candidates
- `rankCandidates(indexId, candidates)` — Rank potential additions by conviction score
- `executeRebalance(indexId, proposal)` — Apply changes: add, remove, reweight. Record all decisions.
- `validatePreviousRebalance(indexId)` — Score the impact of the last rebalance (retrospective)
- `runScheduledRebalances()` — Check all indexes, execute those due

**Rebalance AI prompt template:**

```
You are ANTON's index management AI. You manage the {index_name} index.

INDEX PHILOSOPHY: {investment_philosophy}
UNIVERSE: {universe_filter}
BENCHMARK: {benchmark_name}

CURRENT HOLDINGS (with performance since entry):
{current_holdings_with_returns}

CURRENT MARKET INTELLIGENCE:
- Active theses relevant to this index: {relevant_theses}
- Recent high-confidence atoms: {recent_atoms}
- Active pattern detections: {active_patterns}
- Signal weight rankings for this asset class: {signal_weights}

PERFORMANCE SINCE LAST REBALANCE:
- Index return: {period_return}%
- Benchmark return: {benchmark_return}%
- Excess return: {excess_return}%
- Top contributors: {top_contributors}
- Worst performers: {worst_performers}

PREVIOUS REBALANCE LEARNINGS:
{previous_learnings}

Tasks:
1. Evaluate each current holding: maintain, increase weight, decrease weight, or exit? Provide specific reasoning linked to atoms/theses.
2. Screen the universe for new candidates. For each recommendation, provide: ticker, target weight, conviction score, and the specific atoms/theses/signals supporting the addition.
3. Propose weight adjustments for maintained holdings based on updated conviction levels.
4. Provide a brief market assessment and overall rationale for the proposed changes.
5. Flag any risk concerns or blind spots.

Constraints:
- Maximum position weight: {max_position_weight}
- Target number of holdings: {target_holdings}
- Turnover guidance: prefer lower turnover unless conviction is strong

Return structured JSON with your proposal.
```

### `market-index-attribution-service.ts`

Performance attribution — understanding *why* an index performed the way it did.

- `calculatePositionAttribution(indexId, period)` — Which holdings drove returns
- `calculateAtomAttribution(indexId, period)` — Which intelligence atoms led to the best/worst decisions
- `calculateConsulAttribution(indexId, period)` — Which consul perspectives contributed most to performance
- `calculateSectorAttribution(indexId, period)` — Sector-level contribution analysis
- `generatePerformanceNarrative(indexId, period)` — AI-generated plain-English performance summary

---

## 6. API Routes — Index Extension

Add under `/api/markets/indexes/`:

### Index CRUD
- `GET /api/markets/indexes` — List all indexes (with filters: type, status, category)
- `GET /api/markets/indexes/:id` — Get index with current holdings and performance
- `POST /api/markets/indexes` — Create custom index
- `PUT /api/markets/indexes/:id` — Update index parameters
- `DELETE /api/markets/indexes/:id` — Archive index

### Holdings & NAV
- `GET /api/markets/indexes/:id/holdings` — Current active holdings with weights and returns
- `GET /api/markets/indexes/:id/holdings/history` — All holdings including exited positions
- `GET /api/markets/indexes/:id/nav` — NAV history (with date range filter)
- `GET /api/markets/indexes/:id/nav/latest` — Latest NAV and daily change

### Rebalance
- `GET /api/markets/indexes/:id/rebalances` — Rebalance history
- `POST /api/markets/indexes/:id/rebalances` — Trigger manual rebalance
- `GET /api/markets/indexes/:id/rebalances/:rebalanceId` — Full rebalance detail with reasoning

### Performance & Attribution
- `GET /api/markets/indexes/:id/performance` — Performance metrics across time periods
- `GET /api/markets/indexes/:id/attribution/positions` — Position attribution
- `GET /api/markets/indexes/:id/attribution/atoms` — Atom-level attribution
- `GET /api/markets/indexes/:id/attribution/consuls` — Consul attribution

### Leaderboard
- `GET /api/markets/indexes/leaderboard` — All indexes ranked (with period filter)
- `GET /api/markets/indexes/leaderboard/streaks` — Indexes by consecutive months beating benchmark

---

## 7. Frontend Pages — Index Extension

### `MarketIndexesPage.tsx` — Index Overview & Leaderboard

The flagship page — where the indexes live.

**Leaderboard section:**
- Table showing all ANTON indexes ranked by excess return
- Period selector: 1 week, 1 month, 3 months, 6 months, YTD, 1 year, inception
- Columns: Index name, return, benchmark return, excess return, Sharpe ratio, streak (months beating benchmark)
- Visual highlights for indexes on winning streaks
- Filter by index type (geographic, sector, philosophy, custom)

**Index cards:**
- Card per index showing: name, philosophy tag, NAV chart (sparkline), current return vs benchmark, holdings count, next rebalance date
- Click through to detail page

### `MarketIndexDetailPage.tsx` — Single Index Deep Dive

Full detail page for a single index:

**Performance chart:**
- NAV line chart vs benchmark line (dual axis or rebased to 100)
- Period selector
- Drawdown chart
- Rolling Sharpe ratio

**Current holdings:**
- Table: ticker, company name, weight, entry date, entry price, current price, return, conviction score
- Sortable by any column
- Click through to entity detail in the knowledge graph

**Rebalance timeline:**
- Visual timeline of all rebalances with expandable detail
- Each rebalance shows: additions (green), removals (red), weight changes (amber)
- Reasoning text for each decision
- Impact score for previous rebalances (retrospective)

**Attribution panel:**
- Position attribution waterfall chart (which holdings contributed most/least)
- Atom attribution (which intelligence atoms drove the best decisions)
- Consul attribution pie chart (which consul perspective was most valuable)

**Intelligence trail:**
- Link to the theses and atoms that drove major decisions
- Full traceability from performance → decision → thesis → atoms → data sources

### `MarketIndexCreatePage.tsx` — Custom Index Builder

Guided flow for users to create their own ANTON-powered index:

1. **Name & Philosophy** — What's the investment thesis or strategy?
2. **Universe** — Geography, market cap range, sectors included/excluded
3. **Holdings** — Target number of positions (5–100)
4. **Weighting** — Equal, conviction, market-cap, risk-parity
5. **Benchmark** — Select comparison benchmark
6. **Rebalance** — Frequency: weekly, biweekly, monthly, quarterly
7. **Review & Activate** — Preview AI-generated initial composition, confirm, go live

---

## 8. Scheduled Jobs — Index Extension

Add to the existing scheduler:

| Job | Schedule | Description |
|---|---|---|
| `index-daily-nav` | Daily at 18:00 (after market close) | Calculate NAV for all active indexes |
| `index-leaderboard-update` | Daily at 18:30 | Recalculate leaderboard rankings |
| `index-rebalance-check` | Daily at 08:00 | Check which indexes are due for rebalance |
| `index-rebalance-execute` | When due (triggered by check) | Execute rebalance for due indexes |
| `index-attribution-update` | Weekly (Saturday 02:00) | Recalculate attribution for all active indexes |
| `index-previous-rebalance-validate` | At each rebalance | Score impact of previous rebalance decisions |

---

## 9. Default Seeded Indexes

On first run (or when Markets pillar is activated), seed these indexes in `draft` status so users can review and activate:

**Phase 1 seeds (activate immediately with composition):**
1. ANTON US 100 — broad US market, conviction-weighted, monthly rebalance, benchmark S&P 500
2. ANTON Nordic 30 — Nordic focus, conviction-weighted, monthly rebalance, benchmark OMX Nordic 40
3. ANTON Value 20 — Buffett philosophy, quarterly rebalance
4. ANTON ESG Leaders 20 — ESG-first selection, quarterly rebalance
5. ANTON NextGen 10 — Disruptive tech, monthly rebalance

**Phase 2 seeds (available as templates, user activates):**
6. ANTON EU 50
7. ANTON Tech 20
8. ANTON Financials 20
9. ANTON Contrarian 10
10. ANTON Small Cap Gems 10

---

## 10. Integration with Main Markets Intelligence Loop

### Indexes Feed the Learning Loop

Every index rebalance generates prediction-like events that feed into the main validation system:

- Adding a stock = implicit prediction: "This stock will outperform the universe over the next rebalance period"
- Removing a stock = implicit prediction: "This stock will underperform or the opportunity cost is too high"
- Increasing weight = implicit prediction: "Conviction has increased, this position will contribute positively"

Each of these implicit predictions is validated at the next rebalance, and the outcomes feed into atom reweighting, signal importance ranking, and consul calibration.

### Indexes Surface the Intelligence

The indexes are the most visible expression of the intelligence engine's output. They provide a natural entry point for users who want to see the system's intelligence in action before diving into theses, atoms, and pattern detections.

### Indexes Drive Community Engagement

Through the `.anton` package format, index templates can be shared on the marketplace. A user in Singapore can create an "ANTON ASEAN 20" index and share the template. Others can activate it and track it. Over time, the community creates a global network of ANTON-powered indexes covering every geography, sector, and investment philosophy.

---

## 11. Legal & Compliance Considerations

### Persistent Disclaimer (extends MarketDisclaimer component)

Every index page must include:

*"ANTON Indexes are synthetic benchmark portfolios for research and educational purposes only. No real money is invested. No trades are executed. Index performance is calculated using historical market prices and does not account for transaction costs, slippage, taxes, or other real-world factors that would affect actual investment returns. ANTON Indexes do not constitute investment advice, recommendations, or solicitations. Past performance does not guarantee future results. Always consult a qualified financial professional before making investment decisions."*

### No Brokerage Integration

ANTON Indexes MUST NOT connect to brokerage accounts or facilitate actual trading. This is a paper portfolio system. This boundary protects both users and FutureChain AB from financial regulatory obligations.

### Performance Reporting Standards

Index performance should be calculated using standard methodology: time-weighted returns, properly accounting for additions/removals during rebalance periods. NAV calculation uses closing prices on the NAV date. This ensures the numbers are credible and comparable to real benchmarks.

---

## 12. Implementation Phasing

This addendum is **Phase 3B** in the overall Markets implementation — it should be built after the core intelligence engine (Phases 1–3 of the main spec) is working, since the indexes depend on the atom, thesis, and prediction infrastructure.

**Phase 3B-1:** Database tables, index CRUD, initial seeded indexes
**Phase 3B-2:** NAV calculation, daily updates, performance tracking
**Phase 3B-3:** Rebalance engine with AI-driven composition
**Phase 3B-4:** Attribution system, leaderboard, public pages
**Phase 3B-5:** Custom index builder, `.anton` package export/import for index templates

---

*End of addendum. This extends `MARKETS_INTELLIGENCE_SPEC.md` — the main spec's database, service, route, and page structures should incorporate these additions.*
