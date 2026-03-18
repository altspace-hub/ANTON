# ANTON Markets Intelligence — Technical Specification

**Document type:** Implementation specification for Claude Code
**Created:** March 15, 2026
**Author:** Daniel Bardun (via Claude strategic session)
**Status:** Active specification
**Companion:** Read `MARKETS_INTELLIGENCE_OVERVIEW.md` first for context and rationale

---

## MANDATORY: Investigation Protocol

Before writing ANY code, Claude Code MUST:

1. Read the full directory structure of the existing codebase
2. Open and read the existing `knowledge_atoms`, `atom_sources`, `atom_tags`, `atom_relationships` table schemas and services
3. Open and read the existing `entity_nodes`, `entity_relationships` table schemas and services
4. Open and read the existing `pattern_detections`, `pattern_evidence`, `detector_configs` table schemas and services
5. Open and read the existing `radar_sources`, `radar_items` table schemas and services
6. Open and read the existing connection framework (`connections` table and related services)
7. Examine how the current top-level navigation (Work, School, Life, Pathfinder) is implemented — routing, layout, sidebar
8. Examine how the existing Intelligence Dashboard page aggregates data from multiple intelligence sources
9. Document findings before proceeding

**Rule: Extend existing patterns. Never duplicate infrastructure.**

---

## 1. Pillar Registration

### 1.1 Navigation

Markets is a new top-level pillar in the main navigation, at the same level as Work, School, Life, and Pathfinder.

**Navigation item:**
- Label: `Markets`
- Icon: Use `FaChartLine` or similar from react-icons (investigate what's already installed)
- Route: `/markets`
- Position: After Life, before or after Pathfinder (investigate current ordering)

### 1.2 Pillar Identifier

All Markets-domain data uses pillar identifier `markets` for scoping queries and separating concerns.

```typescript
type Pillar = 'work' | 'school' | 'life' | 'pathfinder' | 'markets';
```

Investigate how the existing pillars are registered and follow the same pattern.

---

## 2. Database Schema — Market Intelligence Domain

### CRITICAL: Atom Separation Architecture

Market atoms are stored in **separate tables** from the existing `knowledge_atoms` and related tables. This is a hard boundary. The reasons:

- Market data generates 10–100x more atoms per day than professional sessions
- Market atoms have much shorter temporal validity (hours/days vs. months/years)
- Cross-contamination between market signals and professional analysis would produce spurious correlations in pattern detection
- Query performance degrades if a single atom table serves both high-frequency market data and lower-frequency professional work

### 2.1 Core Market Tables

#### `market_atoms`

The parallel of `knowledge_atoms` for the Markets domain.

```sql
CREATE TABLE market_atoms (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Atom content
  content TEXT NOT NULL,                    -- The atomic knowledge unit
  atom_type TEXT NOT NULL,                  -- See atom types below
  
  -- Scoring
  confidence REAL NOT NULL DEFAULT 0.5,     -- 0.0–1.0, updated by feedback loop
  initial_confidence REAL NOT NULL DEFAULT 0.5, -- Original confidence at creation (never changes)
  confidence_adjustments INTEGER DEFAULT 0, -- How many times confidence has been adjusted by the learning loop
  
  -- Temporal validity
  valid_from TEXT,                          -- ISO datetime — when this atom became valid
  valid_until TEXT,                         -- ISO datetime — when this atom expires (NULL = no expiry)
  temporal_type TEXT DEFAULT 'point_in_time', -- 'permanent', 'point_in_time', 'time_range', 'superseded'
  superseded_by TEXT,                       -- ID of atom that replaced this one
  
  -- Source tracking
  source_type TEXT NOT NULL,               -- 'api_feed', 'news_extraction', 'ai_analysis', 'user_input', 'prediction_outcome', 'backtesting'
  source_provider TEXT,                    -- 'alpha_vantage', 'finnhub', 'marketaux', 'user', 'ai_consul', etc.
  source_reference TEXT,                   -- URL, API endpoint, or internal reference
  
  -- Domain tagging
  asset_class TEXT,                        -- 'equity', 'fixed_income', 'commodity', 'forex', 'crypto', 'macro', 'mixed'
  geography TEXT,                          -- 'US', 'EU', 'Nordic', 'Asia', 'Global', etc.
  sector TEXT,                             -- GICS sector or custom: 'technology', 'financials', 'healthcare', etc.
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,                          -- user ID or 'system'
  is_active INTEGER DEFAULT 1              -- soft delete
);

CREATE INDEX idx_market_atoms_type ON market_atoms(atom_type);
CREATE INDEX idx_market_atoms_confidence ON market_atoms(confidence DESC);
CREATE INDEX idx_market_atoms_valid_from ON market_atoms(valid_from);
CREATE INDEX idx_market_atoms_valid_until ON market_atoms(valid_until);
CREATE INDEX idx_market_atoms_asset_class ON market_atoms(asset_class);
CREATE INDEX idx_market_atoms_sector ON market_atoms(sector);
CREATE INDEX idx_market_atoms_source_type ON market_atoms(source_type);
CREATE INDEX idx_market_atoms_active ON market_atoms(is_active);
CREATE INDEX idx_market_atoms_created ON market_atoms(created_at);
```

**Market atom types** (extends the base atom types with financial-specific types):

| Type | Description | Example |
|---|---|---|
| `fact` | Verified factual data point | "Apple Q1 2026 revenue: $124.3B, +8% YoY" |
| `signal` | Detected market signal | "Unusual options activity in Nordic bank ETFs — put/call ratio 2.3x" |
| `insight` | AI-derived analytical observation | "Three consecutive quarters of margin compression in EU banking sector correlates with increased M&A activity within 6 months" |
| `correlation` | Discovered statistical relationship | "Brent crude price > $85 correlates with Nordic shipping stocks outperformance at r=0.72" |
| `sentiment` | Market sentiment measurement | "Aggregate analyst sentiment on Swedish fintech sector shifted from neutral to bearish over 14 days" |
| `event` | Market-moving event record | "ECB rate decision: held at 3.25%, dovish guidance language detected" |
| `prediction` | System-generated prediction | "Prediction: OMX Stockholm 30 will close above 2,400 by April 15, 2026" |
| `outcome` | Validated prediction result | "Outcome: OMX Stockholm 30 closed at 2,387 on April 15 — prediction INCORRECT (missed by 0.5%)" |
| `thesis_component` | Part of a structured thesis | "Supporting evidence: EU AI regulation creates compliance cost disadvantage for smaller banks" |
| `warning` | Risk/alert signal | "Divergence detected: credit spreads widening while equity vol remains suppressed — historical precursor to correction" |
| `blind_spot` | Known system limitation | "System has 28% accuracy on crypto volatility predictions — treat with low confidence" |

#### `market_atom_sources`

Links market atoms to their data sources (parallel of `atom_sources`).

```sql
CREATE TABLE market_atom_sources (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  atom_id TEXT NOT NULL REFERENCES market_atoms(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,               -- 'api_response', 'news_article', 'filing', 'ai_session', 'user_note'
  source_id TEXT,                          -- Reference to the specific source record
  source_url TEXT,                         -- Direct URL if applicable
  source_timestamp TEXT,                   -- When the source data was generated
  extraction_method TEXT,                  -- 'direct_quote', 'ai_extraction', 'calculation', 'inference'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_market_atom_sources_atom ON market_atom_sources(atom_id);
```

#### `market_atom_tags`

Tag system for market atoms (parallel of `atom_tags`).

```sql
CREATE TABLE market_atom_tags (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  atom_id TEXT NOT NULL REFERENCES market_atoms(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  tag_category TEXT,                       -- 'ticker', 'sector', 'theme', 'event_type', 'geography', 'instrument_type'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_market_atom_tags_atom ON market_atom_tags(atom_id);
CREATE INDEX idx_market_atom_tags_tag ON market_atom_tags(tag);
CREATE INDEX idx_market_atom_tags_category ON market_atom_tags(tag_category);
```

#### `market_atom_relationships`

Relationships between market atoms (parallel of `atom_relationships`).

```sql
CREATE TABLE market_atom_relationships (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  from_atom_id TEXT NOT NULL REFERENCES market_atoms(id) ON DELETE CASCADE,
  to_atom_id TEXT NOT NULL REFERENCES market_atoms(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,         -- 'supports', 'contradicts', 'extends', 'supersedes', 'caused_by', 'predicts', 'validates', 'invalidates'
  strength REAL DEFAULT 0.5,              -- 0.0–1.0
  created_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX idx_market_atom_rels_from ON market_atom_relationships(from_atom_id);
CREATE INDEX idx_market_atom_rels_to ON market_atom_relationships(to_atom_id);
CREATE INDEX idx_market_atom_rels_type ON market_atom_relationships(relationship_type);
```

**Note:** Market atom relationships include additional types beyond the base system: `caused_by`, `predicts`, `validates`, `invalidates` — essential for the prediction feedback loop.

---

### 2.2 Market Knowledge Graph Tables

#### `market_entities`

Entities in the market domain (parallel of `entity_nodes` but market-specific).

```sql
CREATE TABLE market_entities (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Identity
  name TEXT NOT NULL,                      -- Canonical name
  entity_type TEXT NOT NULL,               -- See entity types below
  
  -- Market-specific identifiers
  ticker TEXT,                             -- Stock ticker if applicable (e.g., 'AAPL', 'SEB-A.ST')
  isin TEXT,                               -- International Securities Identification Number
  lei TEXT,                                -- Legal Entity Identifier
  exchange TEXT,                           -- 'NASDAQ', 'NYSE', 'OMX', 'LSE', etc.
  
  -- Classification
  sector TEXT,                             -- GICS sector
  industry TEXT,                           -- GICS industry
  geography TEXT,                          -- Primary geography
  market_cap_tier TEXT,                    -- 'mega', 'large', 'mid', 'small', 'micro'
  
  -- Tracking
  interaction_count INTEGER DEFAULT 0,
  last_mentioned TEXT,
  first_mentioned TEXT,
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1
);

CREATE INDEX idx_market_entities_type ON market_entities(entity_type);
CREATE INDEX idx_market_entities_ticker ON market_entities(ticker);
CREATE INDEX idx_market_entities_sector ON market_entities(sector);
CREATE INDEX idx_market_entities_name ON market_entities(name);
```

**Market entity types:**

| Type | Description | Examples |
|---|---|---|
| `company` | Public or private company | Apple Inc., SEB, Advisense |
| `index` | Market index | S&P 500, OMX Stockholm 30, EURO STOXX 50 |
| `sector` | Industry sector | Nordic Banking, US Big Tech, EU Pharma |
| `instrument` | Financial instrument | "AAPL 150C 2026-06", "US 10Y Treasury" |
| `commodity` | Physical commodity | Brent Crude, Gold, Wheat |
| `currency` | Currency or currency pair | EUR/USD, SEK/EUR, BTC/USD |
| `central_bank` | Central bank entity | ECB, Fed, Riksbanken |
| `regulator` | Market/financial regulator | SEC, ESMA, FI (Finansinspektionen) |
| `person` | Key market figure | CEO, fund manager, central banker |
| `event` | Market event | "ECB March 2026 Meeting", "AAPL Q2 Earnings" |
| `theme` | Investment theme | "AI infrastructure buildout", "Nearshoring", "Green transition" |
| `geography` | Geographic market | "Nordic Markets", "Emerging Asia", "EU" |

#### `market_entity_relationships`

```sql
CREATE TABLE market_entity_relationships (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  from_entity_id TEXT NOT NULL REFERENCES market_entities(id) ON DELETE CASCADE,
  to_entity_id TEXT NOT NULL REFERENCES market_entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  strength REAL DEFAULT 0.5,
  co_occurrence_count INTEGER DEFAULT 1,
  first_observed TEXT DEFAULT (datetime('now')),
  last_observed TEXT DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX idx_market_entity_rels_from ON market_entity_relationships(from_entity_id);
CREATE INDEX idx_market_entity_rels_to ON market_entity_relationships(to_entity_id);
CREATE INDEX idx_market_entity_rels_type ON market_entity_relationships(relationship_type);
```

**Market relationship types:**

`competes_with`, `supplies_to`, `subsidiary_of`, `invests_in`, `regulates`, `correlates_with`, `inversely_correlates`, `member_of`, `leads`, `influences`, `trades_on`, `denominated_in`, `exposed_to`, `benefits_from`, `threatened_by`

#### `market_entity_aliases`

```sql
CREATE TABLE market_entity_aliases (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  entity_id TEXT NOT NULL REFERENCES market_entities(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_type TEXT DEFAULT 'name',          -- 'name', 'ticker', 'abbreviation', 'former_name'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_market_entity_aliases_entity ON market_entity_aliases(entity_id);
CREATE INDEX idx_market_entity_aliases_alias ON market_entity_aliases(alias);
```

---

### 2.3 Thesis & Prediction Tables

These are net-new tables — the existing system doesn't have a thesis/prediction infrastructure.

#### `market_theses`

```sql
CREATE TABLE market_theses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Thesis content
  title TEXT NOT NULL,                     -- Short title: "Nordic Banks Outperformance Q2 2026"
  description TEXT NOT NULL,               -- Full thesis narrative
  thesis_type TEXT NOT NULL,               -- 'directional', 'relative_value', 'event_driven', 'macro', 'sector', 'thematic'
  
  -- Status
  status TEXT DEFAULT 'draft',             -- 'draft', 'active', 'validating', 'validated', 'archived', 'invalidated'
  
  -- Confidence
  net_confidence REAL DEFAULT 0.5,         -- Calculated: weighted supporting vs. contradicting atoms
  
  -- Time bounds
  hypothesis_date TEXT NOT NULL,           -- When the thesis was created
  target_start TEXT,                       -- Start of prediction window
  target_end TEXT NOT NULL,                -- End of prediction window — when to validate
  
  -- Success criteria
  success_criteria TEXT NOT NULL,          -- JSON: specific measurable conditions
  
  -- Validation
  validation_date TEXT,                    -- When validation was performed
  validation_result TEXT,                  -- 'correct', 'partially_correct', 'incorrect', 'invalidated', 'expired'
  validation_score REAL,                   -- 0.0–1.0 accuracy score
  validation_notes TEXT,                   -- Human-readable validation narrative
  validation_data TEXT,                    -- JSON: actual outcome data
  
  -- Consul attribution
  primary_consul TEXT,                     -- Which AI consul perspective drove the thesis
  consul_contributions TEXT,               -- JSON: { "macro": 0.4, "sector": 0.3, "contrarian": 0.2, "risk": 0.1 }
  
  -- Learning impact
  atoms_created INTEGER DEFAULT 0,         -- How many new atoms this thesis generated
  atoms_reweighted INTEGER DEFAULT 0,      -- How many existing atoms were reweighted after validation
  learning_summary TEXT,                   -- AI-generated summary of what was learned
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT DEFAULT 'system'         -- 'system' or user ID
);

CREATE INDEX idx_market_theses_status ON market_theses(status);
CREATE INDEX idx_market_theses_type ON market_theses(thesis_type);
CREATE INDEX idx_market_theses_target_end ON market_theses(target_end);
CREATE INDEX idx_market_theses_validation_result ON market_theses(validation_result);
CREATE INDEX idx_market_theses_created ON market_theses(created_at);
```

#### `market_thesis_atoms`

Links theses to their supporting/contradicting atoms.

```sql
CREATE TABLE market_thesis_atoms (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  thesis_id TEXT NOT NULL REFERENCES market_theses(id) ON DELETE CASCADE,
  atom_id TEXT NOT NULL REFERENCES market_atoms(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                      -- 'supporting', 'contradicting', 'context', 'assumption'
  weight REAL DEFAULT 1.0,                -- How important this atom is to the thesis
  added_at TEXT DEFAULT (datetime('now')),
  added_by TEXT DEFAULT 'system'
);

CREATE INDEX idx_market_thesis_atoms_thesis ON market_thesis_atoms(thesis_id);
CREATE INDEX idx_market_thesis_atoms_atom ON market_thesis_atoms(atom_id);
CREATE INDEX idx_market_thesis_atoms_role ON market_thesis_atoms(role);
```

#### `market_predictions`

Concrete, verifiable predictions derived from theses.

```sql
CREATE TABLE market_predictions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  thesis_id TEXT NOT NULL REFERENCES market_theses(id) ON DELETE CASCADE,
  
  -- Prediction content
  description TEXT NOT NULL,               -- "OMX30 will close above 2,400 by April 15, 2026"
  prediction_type TEXT NOT NULL,           -- 'price_target', 'direction', 'relative', 'event', 'range', 'timing'
  
  -- Target
  target_entity_id TEXT REFERENCES market_entities(id), -- What entity is being predicted
  target_metric TEXT,                      -- 'close_price', 'market_cap', 'pe_ratio', 'revenue', 'spread', etc.
  predicted_value TEXT,                    -- The predicted value (string to handle different types)
  predicted_direction TEXT,                -- 'up', 'down', 'flat', 'outperform', 'underperform'
  predicted_magnitude TEXT,                -- 'significant (>5%)', 'moderate (2-5%)', 'minor (<2%)'
  
  -- Confidence
  confidence REAL NOT NULL DEFAULT 0.5,    -- 0.0–1.0
  
  -- Time bounds
  prediction_date TEXT NOT NULL,           -- When prediction was made
  target_date TEXT NOT NULL,               -- When to validate
  
  -- Key assumptions
  key_assumptions TEXT,                    -- JSON array: conditions that must hold for prediction to be valid
  
  -- Validation
  actual_value TEXT,                       -- What actually happened
  actual_direction TEXT,
  validation_result TEXT,                  -- 'correct', 'partially_correct', 'incorrect', 'assumption_breached'
  validation_score REAL,                   -- 0.0–1.0
  validated_at TEXT,
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1
);

CREATE INDEX idx_market_predictions_thesis ON market_predictions(thesis_id);
CREATE INDEX idx_market_predictions_target_date ON market_predictions(target_date);
CREATE INDEX idx_market_predictions_result ON market_predictions(validation_result);
CREATE INDEX idx_market_predictions_entity ON market_predictions(target_entity_id);
CREATE INDEX idx_market_predictions_active ON market_predictions(is_active);
```

---

### 2.4 Data Feed Tables

#### `market_data_sources`

Configuration for market data feeds (extends the radar_sources pattern).

```sql
CREATE TABLE market_data_sources (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Identity
  name TEXT NOT NULL,                      -- "Alpha Vantage — Stock Prices"
  provider TEXT NOT NULL,                  -- 'alpha_vantage', 'finnhub', 'marketaux', 'eodhd', 'twelve_data', 'fmp', 'custom'
  source_type TEXT NOT NULL,               -- 'price_feed', 'news_feed', 'fundamentals', 'economic_data', 'filings', 'sentiment'
  
  -- Connection
  base_url TEXT NOT NULL,
  api_key_env_var TEXT,                    -- Environment variable name holding API key (never store keys directly)
  auth_method TEXT DEFAULT 'query_param',  -- 'query_param', 'header', 'bearer', 'none'
  
  -- Scheduling
  fetch_interval TEXT DEFAULT 'daily',     -- 'realtime', 'hourly', 'every_6h', 'daily', 'weekly', 'manual'
  last_fetched TEXT,
  next_fetch TEXT,
  
  -- Configuration
  request_config TEXT,                     -- JSON: endpoint paths, query parameters, response parsing rules
  rate_limit_per_minute INTEGER,           -- Max requests per minute for this source
  rate_limit_per_day INTEGER,              -- Max requests per day for this source
  
  -- Scope
  asset_classes TEXT,                      -- JSON array: which asset classes this source covers
  geographies TEXT,                        -- JSON array: which geographies this source covers
  
  -- Status
  is_enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',            -- 'active', 'error', 'rate_limited', 'disabled'
  last_error TEXT,
  error_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_market_data_sources_provider ON market_data_sources(provider);
CREATE INDEX idx_market_data_sources_type ON market_data_sources(source_type);
CREATE INDEX idx_market_data_sources_enabled ON market_data_sources(is_enabled);
CREATE INDEX idx_market_data_sources_next_fetch ON market_data_sources(next_fetch);
```

#### `market_data_raw`

Raw data ingestion log — stores fetched data before atom extraction.

```sql
CREATE TABLE market_data_raw (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source_id TEXT NOT NULL REFERENCES market_data_sources(id) ON DELETE CASCADE,
  
  -- Data
  data_type TEXT NOT NULL,                 -- 'price', 'news', 'filing', 'economic_indicator', 'earnings', 'sentiment'
  raw_data TEXT NOT NULL,                  -- JSON: the raw API response or extracted data
  
  -- Processing
  processing_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'extracted', 'failed'
  atoms_extracted INTEGER DEFAULT 0,       -- How many atoms were extracted from this data
  
  -- Metadata
  fetched_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  data_timestamp TEXT                      -- The timestamp of the actual data (not when we fetched it)
);

CREATE INDEX idx_market_data_raw_source ON market_data_raw(source_id);
CREATE INDEX idx_market_data_raw_status ON market_data_raw(processing_status);
CREATE INDEX idx_market_data_raw_type ON market_data_raw(data_type);
CREATE INDEX idx_market_data_raw_fetched ON market_data_raw(fetched_at);
```

---

### 2.5 Learning & Feedback Tables

#### `market_prediction_feedback`

The core learning loop table — tracks what was learned from each prediction validation.

```sql
CREATE TABLE market_prediction_feedback (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  prediction_id TEXT NOT NULL REFERENCES market_predictions(id) ON DELETE CASCADE,
  thesis_id TEXT NOT NULL REFERENCES market_theses(id) ON DELETE CASCADE,
  
  -- What happened
  prediction_result TEXT NOT NULL,          -- 'correct', 'partially_correct', 'incorrect', 'assumption_breached'
  accuracy_score REAL,                     -- 0.0–1.0
  
  -- What we learned
  learning_type TEXT NOT NULL,             -- 'signal_reweight', 'correlation_update', 'blind_spot', 'new_correlation', 'consul_calibration'
  learning_description TEXT NOT NULL,      -- Human-readable description of what was learned
  
  -- Atoms affected
  atoms_boosted TEXT,                      -- JSON array of atom IDs whose confidence increased
  atoms_penalised TEXT,                    -- JSON array of atom IDs whose confidence decreased
  new_atoms_created TEXT,                  -- JSON array of new atom IDs created from this learning
  
  -- Consul calibration
  consul_accuracy TEXT,                    -- JSON: { "macro": 0.8, "sector": 0.6, "contrarian": 0.9 }
  
  -- Signal importance update
  signal_type TEXT,                        -- Which signal type was recalibrated
  signal_importance_before REAL,
  signal_importance_after REAL,
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_market_feedback_prediction ON market_prediction_feedback(prediction_id);
CREATE INDEX idx_market_feedback_thesis ON market_prediction_feedback(thesis_id);
CREATE INDEX idx_market_feedback_type ON market_prediction_feedback(learning_type);
CREATE INDEX idx_market_feedback_result ON market_prediction_feedback(prediction_result);
```

#### `market_signal_weights`

Accumulated signal importance rankings — the system's learned understanding of what matters.

```sql
CREATE TABLE market_signal_weights (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  signal_type TEXT NOT NULL,               -- 'earnings_surprise', 'central_bank_language', 'options_flow', 'insider_trading', etc.
  asset_class TEXT,                        -- Which asset class this weight applies to (NULL = all)
  time_horizon TEXT,                       -- 'short' (<1w), 'medium' (1w-3m), 'long' (>3m)
  
  -- Weight
  importance_score REAL NOT NULL DEFAULT 0.5, -- 0.0–1.0, updated by feedback loop
  sample_size INTEGER DEFAULT 0,           -- How many predictions this weight is based on
  accuracy_rate REAL,                      -- Historical accuracy when this signal type was a primary driver
  
  -- Metadata
  last_updated TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_market_signal_weights_type ON market_signal_weights(signal_type);
CREATE INDEX idx_market_signal_weights_class ON market_signal_weights(asset_class);
CREATE INDEX idx_market_signal_weights_importance ON market_signal_weights(importance_score DESC);
```

#### `market_correlation_map`

Discovered and tracked correlations between market events/entities.

```sql
CREATE TABLE market_correlation_map (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  entity_a_id TEXT REFERENCES market_entities(id),
  entity_b_id TEXT REFERENCES market_entities(id),
  entity_a_description TEXT,               -- Fallback if not a tracked entity
  entity_b_description TEXT,
  
  correlation_type TEXT NOT NULL,          -- 'positive', 'negative', 'leading', 'lagging', 'conditional'
  correlation_strength REAL NOT NULL,      -- -1.0 to 1.0
  
  -- Evidence
  sample_size INTEGER DEFAULT 0,
  confidence REAL DEFAULT 0.5,
  time_lag_days INTEGER,                   -- For leading/lagging correlations
  condition TEXT,                          -- For conditional correlations: "Only when VIX > 25"
  
  -- Tracking
  times_confirmed INTEGER DEFAULT 0,
  times_violated INTEGER DEFAULT 0,
  last_confirmed TEXT,
  last_violated TEXT,
  
  -- Metadata
  discovered_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 1
);

CREATE INDEX idx_market_correlations_entity_a ON market_correlation_map(entity_a_id);
CREATE INDEX idx_market_correlations_entity_b ON market_correlation_map(entity_b_id);
CREATE INDEX idx_market_correlations_strength ON market_correlation_map(correlation_strength);
CREATE INDEX idx_market_correlations_confidence ON market_correlation_map(confidence DESC);
```

---

### 2.6 Market Pattern Detection

#### `market_pattern_detections`

Parallel of the existing `pattern_detections` table, scoped to market data.

```sql
CREATE TABLE market_pattern_detections (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  detector_type TEXT NOT NULL,             -- Same 5 types as existing: 'temporal_correlation', 'entity_convergence', 'cascade', 'trend_divergence', 'gap'
  
  -- Pattern content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',          -- 'critical', 'high', 'medium', 'low', 'info'
  confidence REAL NOT NULL DEFAULT 0.5,
  
  -- Status
  status TEXT DEFAULT 'new',              -- 'new', 'investigating', 'confirmed', 'acted_on', 'dismissed', 'false_positive'
  
  -- Evidence
  evidence TEXT,                           -- JSON: array of atom IDs, entity IDs, and data points that constitute the pattern
  
  -- Market-specific
  affected_entities TEXT,                  -- JSON array of market_entity IDs
  affected_sectors TEXT,                   -- JSON array of sectors
  time_horizon TEXT,                       -- 'immediate', 'short', 'medium', 'long'
  
  -- Metadata
  detected_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT,
  resolved_at TEXT,
  created_by TEXT DEFAULT 'system'
);

CREATE INDEX idx_market_patterns_detector ON market_pattern_detections(detector_type);
CREATE INDEX idx_market_patterns_severity ON market_pattern_detections(severity);
CREATE INDEX idx_market_patterns_status ON market_pattern_detections(status);
CREATE INDEX idx_market_patterns_detected ON market_pattern_detections(detected_at);
```

---

### 2.7 Table Summary

| Table | Purpose | Parallel of |
|---|---|---|
| `market_atoms` | Market-domain knowledge atoms | `knowledge_atoms` |
| `market_atom_sources` | Source tracking for market atoms | `atom_sources` |
| `market_atom_tags` | Tag system for market atoms | `atom_tags` |
| `market_atom_relationships` | Relationships between market atoms | `atom_relationships` |
| `market_entities` | Market-domain entities (companies, indices, etc.) | `entity_nodes` |
| `market_entity_relationships` | Relationships between market entities | `entity_relationships` |
| `market_entity_aliases` | Alternate names for market entities | `entity_aliases` |
| `market_theses` | Structured investment/market theses | **NEW** |
| `market_thesis_atoms` | Links theses to supporting/contradicting atoms | **NEW** |
| `market_predictions` | Concrete, verifiable predictions | **NEW** |
| `market_data_sources` | Market data feed configuration | `radar_sources` |
| `market_data_raw` | Raw ingested data before atom extraction | **NEW** |
| `market_prediction_feedback` | Learning loop — what was learned from each validation | **NEW** |
| `market_signal_weights` | Accumulated signal importance rankings | **NEW** |
| `market_correlation_map` | Discovered correlations between entities/events | **NEW** |
| `market_pattern_detections` | Market-domain pattern detections | `pattern_detections` |

**Total new tables: 16**

---

## 3. Backend Services

### 3.1 Service Architecture

Create the following services in the existing service pattern (investigate `server/services/` for conventions):

#### `market-data-service.ts`

Handles data ingestion from configured feeds.

- `fetchFromSource(sourceId)` — Execute a single fetch from a configured data source
- `runScheduledFetches()` — Check all enabled sources, fetch those due for refresh
- `parseResponse(sourceId, rawData)` — Parse provider-specific response format into normalised data
- `storeRawData(sourceId, data)` — Store in `market_data_raw`
- `getSourceStatus()` — Return health/status of all configured sources
- `configureSeed sources()` — Set up default free-tier data sources on first run

**Default seeded sources (on first run):**

| Provider | Type | Free Tier Limits | Data |
|---|---|---|---|
| Alpha Vantage | Price + Fundamentals | 25 req/day | Stock prices, forex, crypto, economic indicators |
| Finnhub | News + Fundamentals | 60 req/min | Company news, filings, earnings, economic data |
| Marketaux | News + Sentiment | 100 req/day | Financial news with entity recognition and sentiment |

#### `market-atom-service.ts`

Handles atom extraction, storage, and retrieval for the market domain.

- `extractAtomsFromRawData(rawDataId)` — LLM-powered extraction of atoms from raw market data
- `createAtom(atom)` — Store a new market atom
- `getAtomsByType(type, filters)` — Query atoms with filtering
- `getAtomsByEntity(entityId)` — Get all atoms mentioning an entity
- `getActiveAtoms(filters)` — Get atoms that are currently valid (not expired/superseded)
- `updateConfidence(atomId, delta, reason)` — Adjust atom confidence (used by learning loop)
- `supersede(oldAtomId, newAtomId)` — Mark an atom as superseded
- `searchAtoms(query)` — Full-text search across market atoms
- `getAtomChain(atomId)` — Follow atom relationships to build evidence chains

**Atom extraction prompt template:**

```
You are a financial intelligence analyst. Extract discrete knowledge atoms from the following market data.

For each atom, provide:
- content: The atomic knowledge unit (one fact/insight/signal per atom)
- atom_type: One of [fact, signal, insight, correlation, sentiment, event, warning]
- confidence: Your confidence in this atom (0.0–1.0)
- temporal_type: 'point_in_time', 'time_range', or 'permanent'
- valid_from / valid_until: If time-bounded
- asset_class: The relevant asset class
- sector: The relevant sector (if applicable)
- tags: Array of relevant tags (tickers, themes, geographies)
- entities: Array of entities mentioned (name + type)

Focus on extracting actionable intelligence. Ignore noise. Prioritise signals that could affect market prices, risk assessments, or investment theses.

Data to extract from:
{raw_data}
```

#### `market-thesis-service.ts`

Handles thesis creation, management, and the prediction lifecycle.

- `createThesis(thesis)` — Create a new thesis with supporting atoms
- `updateThesis(thesisId, updates)` — Update thesis status, add/remove atoms
- `calculateNetConfidence(thesisId)` — Recalculate net confidence from weighted atoms
- `generatePredictions(thesisId)` — AI-powered generation of concrete predictions from a thesis
- `getActiveTheses()` — Get all theses in 'active' status
- `getThesesDueForValidation()` — Get theses whose target_end has passed
- `archiveThesis(thesisId)` — Move to archived status
- `getThesisPerformance()` — Aggregate statistics across all validated theses

#### `market-validation-service.ts`

The prediction validation engine — core of the feedback loop.

- `validatePrediction(predictionId)` — Fetch actual outcome data and score the prediction
- `runScheduledValidations()` — Check for predictions past their target date and validate
- `scorePrediction(predicted, actual)` — Calculate accuracy score
- `checkAssumptions(predictionId)` — Verify if key assumptions still held during the prediction window
- `generateLearning(predictionId)` — AI-powered analysis of what was learned from the outcome
- `applyLearning(feedbackId)` — Execute the learning: reweight atoms, update signal weights, update correlation map, calibrate consul accuracy

**Validation prompt template:**

```
You are a financial intelligence analyst reviewing a prediction outcome.

PREDICTION:
{prediction_description}
Made on: {prediction_date}
Target date: {target_date}
Predicted value/direction: {predicted}
Confidence: {confidence}

KEY ASSUMPTIONS:
{assumptions}

ACTUAL OUTCOME:
{actual_data}

SUPPORTING ATOMS (that backed this prediction):
{supporting_atoms}

CONTRADICTING ATOMS (that argued against):
{contradicting_atoms}

Analyse:
1. Was the prediction correct, partially correct, or incorrect?
2. What accuracy score (0.0–1.0) would you assign?
3. Were any key assumptions violated?
4. Which supporting atoms proved reliable? Which proved unreliable?
5. Were there contradicting atoms that correctly warned against the prediction?
6. What specific lesson should the system learn from this outcome?
7. What signal types proved most/least useful?
8. Were there blind spots — important signals the system should have considered but didn't?

Return structured JSON with your analysis.
```

#### `market-pattern-service.ts`

Market-domain pattern detection (extends the existing pattern detection engine for market data).

- `runDetectors(detectorTypes?)` — Run specified or all pattern detectors on market data
- `temporalCorrelation()` — Detect co-occurring market events
- `entityConvergence()` — Detect entities appearing together in unusual ways
- `cascadeDetection()` — Detect sequential market event patterns
- `trendDivergence()` — Detect anomalous divergences from established trends
- `gapDetection()` — Detect missing coverage in market intelligence
- `storePattern(pattern)` — Store detected pattern
- `getActivePatterns()` — Get unresolved patterns

#### `market-graph-service.ts`

Market knowledge graph management.

- `addEntity(entity)` — Add or update a market entity
- `addRelationship(fromId, toId, type, strength)` — Add or strengthen a relationship
- `resolveAlias(name)` — Find canonical entity for a name/alias
- `getEntityNetwork(entityId, depth)` — Get entity and its relationship network to specified depth
- `getRelatedEntities(entityId, relationshipType)` — Get entities connected by a specific relationship type
- `updateFromAtoms()` — Scan recent atoms for entity mentions and update the graph

#### `market-intelligence-service.ts`

High-level orchestration service — coordinates the full intelligence loop.

- `runIntelligenceCycle()` — Execute a full cycle: fetch → extract → analyse → detect patterns → update graph → surface intelligence
- `getDashboardData()` — Aggregate data for the Markets dashboard
- `getSystemPerformance()` — Overall prediction accuracy, atom counts, learning metrics
- `getSuggestedTheses()` — AI-generated thesis suggestions based on current patterns and signals
- `getBlindSpots()` — Known areas where the system performs poorly

---

## 4. API Routes

Create under `/api/markets/` (investigate existing route patterns):

### Data Sources
- `GET /api/markets/sources` — List configured data sources
- `POST /api/markets/sources` — Add new data source
- `PUT /api/markets/sources/:id` — Update source configuration
- `DELETE /api/markets/sources/:id` — Remove source
- `POST /api/markets/sources/:id/fetch` — Trigger manual fetch

### Atoms
- `GET /api/markets/atoms` — Query market atoms (with filters: type, asset_class, sector, date range, confidence range, tags)
- `GET /api/markets/atoms/:id` — Get single atom with sources and relationships
- `POST /api/markets/atoms` — Create atom (user-created)
- `PUT /api/markets/atoms/:id` — Update atom
- `GET /api/markets/atoms/:id/chain` — Get atom evidence chain
- `GET /api/markets/atoms/search` — Full-text search

### Entities
- `GET /api/markets/entities` — Query market entities
- `GET /api/markets/entities/:id` — Get entity with relationships and related atoms
- `GET /api/markets/entities/:id/network` — Get entity relationship network
- `POST /api/markets/entities` — Create entity (user-created)

### Theses
- `GET /api/markets/theses` — List theses (with filters: status, type, date range)
- `GET /api/markets/theses/:id` — Get thesis with atoms and predictions
- `POST /api/markets/theses` — Create thesis
- `PUT /api/markets/theses/:id` — Update thesis
- `POST /api/markets/theses/:id/predict` — Generate predictions for a thesis
- `GET /api/markets/theses/performance` — Aggregate thesis performance stats

### Predictions
- `GET /api/markets/predictions` — List predictions (with filters: status, result, date range)
- `GET /api/markets/predictions/:id` — Get prediction with validation data
- `POST /api/markets/predictions/:id/validate` — Trigger manual validation
- `GET /api/markets/predictions/due` — Get predictions due for validation

### Intelligence
- `GET /api/markets/intelligence/dashboard` — Dashboard aggregate data
- `GET /api/markets/intelligence/patterns` — Active market patterns
- `GET /api/markets/intelligence/signals` — Current signal weight rankings
- `GET /api/markets/intelligence/correlations` — Active correlation map
- `GET /api/markets/intelligence/performance` — System learning performance metrics
- `GET /api/markets/intelligence/blind-spots` — Known system limitations
- `POST /api/markets/intelligence/cycle` — Trigger manual intelligence cycle

### Learning
- `GET /api/markets/learning/feedback` — Learning feedback history
- `GET /api/markets/learning/signal-weights` — Signal importance rankings
- `GET /api/markets/learning/accuracy-trend` — Prediction accuracy over time

---

## 5. Frontend Pages

### 5.1 Page Structure

All pages under `/markets/` route. Investigate existing page component patterns.

#### `MarketsPage.tsx` — Main Dashboard

The landing page for the Markets pillar. Displays:

- **Market Overview Panel** — Key indices, today's movers, sentiment gauge (from latest atom analysis)
- **Active Theses Panel** — Cards showing active theses with confidence meters and time-to-validation countdowns
- **Prediction Scorecard** — Rolling accuracy statistics: last 7 days, 30 days, 90 days, all time
- **Market Radar Feed** — Scrolling feed of latest market signals/atoms ranked by relevance (reuses radar feed pattern)
- **Pattern Alerts** — Highlighted market patterns from the detection engine
- **Learning Progress** — Visual showing how the system's accuracy is trending over time

#### `MarketThesesPage.tsx` — Thesis Management

Full CRUD for theses with visualisation:

- Thesis cards with status, confidence gauge, supporting/contradicting atom counts
- Evidence chain visualiser — clickable graph showing how atoms connect to form the thesis
- Timeline view — showing thesis lifecycle from creation through validation
- Create new thesis flow with AI assistance (consul collaboration)
- Filter by status, type, time horizon, performance

#### `MarketPredictionsPage.tsx` — Prediction Tracker

- List of all predictions with status indicators (pending, validated, correct, incorrect)
- Calendar view showing when predictions are due for validation
- Historical performance charts
- Drill-down into validation details and learning outcomes

#### `MarketEntitiesPage.tsx` — Market Knowledge Graph

- Entity search and browse
- Interactive graph visualisation (consider existing knowledge graph page patterns)
- Entity detail panel showing all related atoms, theses, predictions, and relationships
- Relationship strength indicators

#### `MarketDataSourcesPage.tsx` — Source Management

- Configured sources with health status indicators
- Add/configure new sources
- Manual fetch trigger
- Data volume statistics per source

#### `MarketLearningPage.tsx` — System Intelligence & Performance

- Prediction accuracy trend over time (line chart)
- Signal weight rankings (sortable table)
- Correlation map visualisation
- Blind spot inventory
- Consul accuracy breakdown
- Atom confidence distribution
- Learning event timeline

### 5.2 Shared Components

#### `MarketDisclaimer.tsx`

Persistent disclaimer component displayed on every Markets page:

```
"ANTON Markets is a research intelligence tool. All analysis is for informational 
purposes only and does not constitute financial advice. Past prediction accuracy does 
not guarantee future results. Always consult a qualified financial professional before 
making investment decisions."
```

Investigate existing disclaimer/notice patterns in the codebase.

#### `ConfidenceMeter.tsx`

Visual confidence indicator (0–1 scale) reused across thesis cards, atom displays, predictions.

#### `AtomChainVisualiser.tsx`

Interactive visualisation of atom → atom → thesis evidence chains.

#### `ThesisCard.tsx`

Reusable thesis card component showing title, type, confidence, status, countdown, atom counts.

---

## 6. Scheduled Jobs

Extend the existing node-cron scheduler (investigate `server/scheduler/` or wherever cron jobs are registered):

| Job | Schedule | Description |
|---|---|---|
| `market-data-fetch` | Varies by source (hourly/6h/daily) | Fetch data from enabled market data sources |
| `market-atom-extraction` | Every 30 minutes | Process pending raw data into atoms |
| `market-pattern-detection` | Daily at 02:00 | Run all 5 pattern detectors on market data |
| `market-graph-update` | Daily at 03:00 | Scan recent atoms for entity mentions, update graph |
| `market-prediction-validation` | Daily at 06:00 | Check for predictions past target date, validate |
| `market-learning-cycle` | Daily at 07:00 | Process validation results, apply learning |
| `market-thesis-review` | Weekly (Monday 08:00) | AI review of all active theses — update confidence, flag stale theses |
| `market-atom-cleanup` | Weekly (Sunday 02:00) | Archive expired atoms, consolidate superseded chains |

---

## 7. Default Data Source Configuration

On first run, seed these free-tier sources:

### Alpha Vantage (Primary Price Data)

```json
{
  "name": "Alpha Vantage — Global Quotes",
  "provider": "alpha_vantage",
  "source_type": "price_feed",
  "base_url": "https://www.alphavantage.co/query",
  "api_key_env_var": "ALPHA_VANTAGE_API_KEY",
  "auth_method": "query_param",
  "fetch_interval": "daily",
  "rate_limit_per_day": 25,
  "request_config": {
    "endpoints": [
      { "function": "GLOBAL_QUOTE", "params": { "symbol": "{ticker}" } },
      { "function": "NEWS_SENTIMENT", "params": { "tickers": "{tickers}" } },
      { "function": "TIME_SERIES_DAILY", "params": { "symbol": "{ticker}", "outputsize": "compact" } }
    ]
  },
  "asset_classes": ["equity", "forex", "crypto", "commodity"],
  "geographies": ["US", "Global"]
}
```

### Finnhub (News + Fundamentals)

```json
{
  "name": "Finnhub — Market News & Fundamentals",
  "provider": "finnhub",
  "source_type": "news_feed",
  "base_url": "https://finnhub.io/api/v1",
  "api_key_env_var": "FINNHUB_API_KEY",
  "auth_method": "query_param",
  "fetch_interval": "every_6h",
  "rate_limit_per_minute": 60,
  "request_config": {
    "endpoints": [
      { "path": "/news", "params": { "category": "general" } },
      { "path": "/calendar/earnings", "params": {} },
      { "path": "/economic/calendar", "params": {} }
    ]
  },
  "asset_classes": ["equity", "macro"],
  "geographies": ["US", "Global"]
}
```

### Marketaux (Sentiment + Entity-Tagged News)

```json
{
  "name": "Marketaux — Sentiment News Feed",
  "provider": "marketaux",
  "source_type": "sentiment",
  "base_url": "https://api.marketaux.com/v1/news/all",
  "api_key_env_var": "MARKETAUX_API_KEY",
  "auth_method": "query_param",
  "fetch_interval": "daily",
  "rate_limit_per_day": 100,
  "request_config": {
    "params": { "language": "en", "filter_entities": "true" }
  },
  "asset_classes": ["equity", "macro"],
  "geographies": ["Global"]
}
```

---

## 8. Environment Variables

Add to `.env.example`:

```env
# Markets Intelligence — Data Source API Keys
# Get free keys from the respective providers
ALPHA_VANTAGE_API_KEY=
FINNHUB_API_KEY=
MARKETAUX_API_KEY=

# Optional premium sources (leave empty if not used)
EODHD_API_KEY=
TWELVE_DATA_API_KEY=
FMP_API_KEY=

# Markets Intelligence — Configuration
MARKETS_ENABLED=true
MARKETS_AUTO_FETCH=true
MARKETS_PATTERN_DETECTION_ENABLED=true
MARKETS_PREDICTION_VALIDATION_ENABLED=true
MARKETS_LEARNING_ENABLED=true
```

---

## 9. Implementation Phases

### Phase 1: Foundation (implement first)

1. Database schema — create all 16 tables with migrations
2. Pillar registration — add Markets to navigation, routing, pillar system
3. `market-data-service.ts` — data source configuration and fetching
4. `market-atom-service.ts` — atom creation, storage, basic queries
5. `market_data_sources` seeding — Alpha Vantage, Finnhub, Marketaux
6. `MarketsPage.tsx` — basic dashboard with market radar feed
7. `MarketDataSourcesPage.tsx` — source management UI
8. `MarketDisclaimer.tsx` — persistent disclaimer component
9. Scheduled data fetching jobs

### Phase 2: Intelligence Layer

1. `market-graph-service.ts` — entity management and graph operations
2. `market-pattern-service.ts` — market pattern detection (reuse detector logic)
3. `MarketEntitiesPage.tsx` — knowledge graph visualisation
4. Atom extraction from raw data (LLM-powered)
5. Graph auto-update from atoms

### Phase 3: Thesis & Prediction Engine

1. `market-thesis-service.ts` — thesis CRUD and management
2. `market-validation-service.ts` — prediction validation
3. `MarketThesesPage.tsx` — thesis management UI
4. `MarketPredictionsPage.tsx` — prediction tracker UI
5. AI-assisted thesis creation flow (multi-consul)
6. Prediction generation from theses

### Phase 4: Learning Loop

1. Prediction validation automation
2. Learning extraction (what was learned from each outcome)
3. Atom confidence reweighting
4. Signal importance tracking
5. Correlation map building and updating
6. Consul accuracy calibration
7. `MarketLearningPage.tsx` — system performance and learning dashboard
8. Blind spot detection

### Phase 5: Polish & Integration

1. Historical backtesting capability (seed system with historical data)
2. `.anton` package support for market intelligence packs
3. Cross-pillar reference (explicit user action to link professional atoms to market theses)
4. Advanced visualisations (correlation heatmaps, network graphs, prediction accuracy trends)
5. Watchlist functionality (track specific entities/tickers)
6. Alert system (notify user of significant signals, pattern detections, thesis updates)

---

## 10. Key Architectural Decisions — Summary

| Decision | Choice | Rationale |
|---|---|---|
| Atom separation | Hard boundary — separate tables | Volume, temporal characteristics, cross-contamination risk, query performance |
| Data sources | Free-tier REST APIs | Accessible, no vendor lock-in, sufficient for demonstration and individual use |
| Thesis structure | Typed atoms with evidence chains | Enables traceable learning — know *why* a prediction was right/wrong |
| Prediction validation | Automated with manual override | System checks reality on schedule; user can trigger early validation |
| Learning mechanism | Atom reweighting + signal ranking + correlation mapping | Multi-dimensional learning, not just numerical weight adjustment |
| Disclaimer | Persistent on every page | Legal/regulatory necessity — research tool, not investment advice |
| Cross-pillar | Opt-in explicit reference only | User consciously links professional knowledge to market thesis; no automatic cross-feed |
| Entity resolution | Alias system with ticker/ISIN/LEI identifiers | Financial entities have many names; need canonical resolution |
| Pattern detection | Reuse existing 5-detector architecture | Same patterns apply to market data; just different data domain |
| Consul collaboration | Multi-perspective thesis building | Macro, sector, contrarian, risk perspectives create more robust theses |

---

*End of technical specification. Begin with Phase 1 after completing the mandatory investigation protocol.*
