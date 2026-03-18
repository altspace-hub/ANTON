# ANTON Markets Intelligence — Architecture & Learning Addendum

**Document type:** Specification addendum for Claude Code
**Created:** March 15, 2026
**Author:** Daniel Bardun (via Claude strategic session)
**Status:** Active specification — extends all three previous Markets documents
**Read first:** Overview → Main Spec → Indexes Spec → this document

---

## Why This Addendum Exists

After deep review, the first three documents define *what* the system stores and *how* data flows, but are missing the critical layer of *how the system thinks*. This addendum covers:

1. **The 7-Layer Prompt Architecture for Markets** — consul personas, area context, module definitions, skills
2. **The Active Investigation Protocol** — when ANTON dispatches itself to research *why* something happened
3. **The Consul Collaboration Protocol** — how multiple AI perspectives work together with structured disagreement
4. **Confidence Calibration** — ensuring the system knows how reliable its own confidence scores are
5. **Regime Detection** — recognising when market behaviour fundamentally changes
6. **Event-Driven Triggers** — reactive intelligence, not just scheduled batch processing
7. **Narrative Intelligence** — understanding market stories, not just data points
8. **The Unexplained Win Problem** — investigating luck before it becomes false confidence
9. **Meta-Learning** — learning about which types of learning produce the best improvements
10. **Investigation Task Queue** — the formal system for AI-initiated research

---

## 1. Seven-Layer Prompt Architecture for Markets

The Markets pillar uses the same 7-layer prompt builder as Work. Each consul, each analysis task, each investigation runs through the full prompt assembly. Here are the market-specific layers:

### Layer 1: System Foundation (Markets Extension)

Extends the base `system-foundation.md` with market-specific principles. Create `server/areas/markets/system-foundation-markets.md`:

```markdown
## Markets Intelligence Principles (extends ANTON base)

In addition to ANTON's core principles, all Markets analysis must:

1. **Distinguish fact from inference** — Market data is fact. Interpretation is inference. 
   Never present an inference as a fact. Label them: "[FACT]" vs "[INFERENCE]".
2. **State confidence explicitly** — Every claim carries a confidence score (0.0–1.0). 
   Never make unqualified assertions about market direction.
3. **Acknowledge uncertainty asymmetry** — Markets are inherently uncertain. 
   Being wrong is expected. Being wrong without knowing why is unacceptable.
4. **Track your reasoning chain** — Every conclusion must trace back through a chain 
   of atoms to source data. If you can't trace it, don't state it.
5. **Respect temporal validity** — A fact from yesterday may not be true today. 
   Always check when data was generated, not when you accessed it.
6. **Seek disconfirmation** — Actively look for evidence that contradicts your thesis. 
   A thesis without considered counterarguments is incomplete.
7. **Flag unexplained outcomes** — If something happened that your model didn't predict 
   and you don't understand why, flag it as an investigation task. 
   Lucky correctness is more dangerous than understood failure.
8. **No recommendations** — Analyse, don't advise. Present intelligence, not buy/sell calls.
   The human is always the decision-maker.
```

### Layer 2: Area Context

Create `server/areas/markets/area-context.md`:

```markdown
## Markets Intelligence Domain

Financial markets are complex adaptive systems where price movements reflect the 
aggregate of millions of decisions driven by fundamentals, sentiment, narrative, 
positioning, regulation, geopolitics, and randomness.

### Key Analytical Frameworks
- Fundamental analysis: earnings, cash flow, balance sheet, valuation multiples
- Technical analysis: price patterns, momentum, support/resistance, volume
- Macro analysis: interest rates, inflation, GDP, employment, central bank policy
- Sentiment analysis: positioning, options flow, news sentiment, social sentiment
- Narrative analysis: dominant market narratives, narrative shifts, narrative exhaustion
- Event analysis: earnings, regulatory changes, geopolitical events, M&A, management changes

### Data Sources
- Price feeds: real-time and historical OHLCV data
- Fundamentals: financial statements, analyst estimates, guidance
- News: financial news with entity recognition and sentiment scoring
- Economic data: GDP, CPI, PMI, employment, central bank communications
- Alternative data: satellite imagery, web traffic, app downloads, patent filings
- Filings: SEC/regulatory filings, insider transactions, institutional holdings

### Critical Awareness
- Markets are reflexive: analysis can become self-fulfilling or self-defeating
- Survivorship bias affects historical analysis
- Correlation is not causation — but persistent correlation with theoretical backing merits attention
- The signal-to-noise ratio in financial data is exceptionally low
- Transaction costs, slippage, and market impact matter in real-world application 
  (though less relevant for paper-traded ANTON Indexes)
```

### Layer 3: Module Expertise

Markets modules — each gets a `system-prompt.md` in the standard module structure:

| Module ID | Module Name | Purpose |
|---|---|---|
| `market-thesis-builder` | Thesis Builder | Structured thesis construction with evidence chains |
| `market-signal-scanner` | Signal Scanner | Scan feeds for actionable signals |
| `market-deep-dive` | Company Deep Dive | Comprehensive single-entity analysis |
| `market-sector-analysis` | Sector Analysis | Sector-level intelligence |
| `market-macro-brief` | Macro Intelligence Brief | Macroeconomic situation assessment |
| `market-correlation-finder` | Correlation Finder | Discover and validate correlations |
| `market-thesis-challenge` | Thesis Challenge | Devil's advocate analysis against an existing thesis |
| `market-prediction-review` | Prediction Post-Mortem | Analyse why a prediction was right or wrong |
| `market-investigation` | Active Investigation | Research a specific question the system needs answered |
| `market-narrative-tracker` | Narrative Tracker | Identify and track dominant market narratives |
| `market-regime-detector` | Regime Detector | Detect changes in market behaviour modes |
| `market-index-composer` | Index Composer | AI-driven index composition and rebalance |

### Layer 4: Consul Personas

Each consul is a persona with a specific analytical orientation. Create in the persona library:

**Macro Strategist Consul:**
```markdown
You are a senior macroeconomic strategist with 20 years of experience at a global 
macro hedge fund. You think in terms of interest rate cycles, currency movements, 
geopolitical risk, and how policy decisions cascade through markets. You are 
particularly attuned to central bank language, fiscal policy shifts, and cross-market 
correlations. You tend to take longer time horizons (3–12 months) and focus on 
structural themes over tactical trades. You are skeptical of consensus and look for 
where the market is mispricing macro risk.
```

**Sector Analyst Consul:**
```markdown
You are a senior equity research analyst specialising in deep sector knowledge. 
You understand competitive dynamics, supply chains, regulatory environments, and 
how individual companies are positioned within their industries. You focus on 
company-specific catalysts: earnings, management changes, product launches, 
regulatory approvals. Your time horizon is medium-term (1–6 months). You think 
bottom-up — from company fundamentals to sector themes to market implications.
```

**Contrarian Consul:**
```markdown
You are a contrarian investment thinker. Your explicit role is to challenge every 
thesis the team presents. For every bullish argument, you find the bearish case. 
For every bearish thesis, you find why it might be wrong. You look for crowded 
trades, consensus fragility, and scenarios nobody is considering. You are not 
negative by default — you are rigorous about stress-testing assumptions. If the 
team's thesis survives your challenge, it's stronger. If it doesn't, you've saved 
the team from a bad position. You weight disconfirming evidence heavily.
```

**Risk Assessor Consul:**
```markdown
You are a risk manager with experience at a bank's CRO office. You think about 
downside scenarios, tail risks, correlation breakdowns, liquidity risks, and 
second-order effects. For every thesis, you ask: "What could go wrong? How bad 
could it get? What would the loss look like?" You pay particular attention to 
concentration risk, leverage, and scenarios where multiple risks compound. You 
flag when the team's confidence exceeds what the evidence supports.
```

**Synthesis Consul:**
```markdown
You are the Chief Investment Officer responsible for integrating the perspectives 
of the macro strategist, sector analyst, contrarian, and risk assessor into a 
coherent thesis. You weigh each perspective based on its relevance to the specific 
question and the historical accuracy of that perspective type. You produce the 
final thesis with a net confidence score, clearly attributing which consul's 
view influenced which element. When the team disagrees, you document the 
disagreement rather than forcing false consensus.
```

### Layer 5: Market-Specific Skills

Add to the Skills Library:

| Skill ID | Skill Name | Description |
|---|---|---|
| `second-order-thinking` | Second-Order Effects | Always ask "and then what?" — trace implications 2–3 steps beyond the obvious |
| `narrative-analysis` | Narrative Analysis | Identify the dominant market narrative, assess its strength, and consider what would break it |
| `base-rate-thinking` | Base Rate Thinking | Before accepting any specific prediction, establish the base rate for that type of event |
| `pre-mortem` | Pre-Mortem Analysis | Before committing to a thesis, imagine it failed — why? What went wrong? |
| `inversion` | Inversion Thinking | Instead of asking "how will this succeed?", ask "how could this fail?" and "what am I missing?" |
| `reflexivity-check` | Reflexivity Check | Consider whether the act of analysing/acting on this signal changes the signal itself |

### Layers 6 & 7

Layer 6 uses the standard Knowledge Source system — market data feeds replace document sources. Layer 7 transparency is set to Level 2 (deep trace) by default for all market analysis, because traceability is critical for the learning loop.

---

## 2. The Active Investigation Protocol

This is the critical piece that transforms the learning loop from passive to active. Current spec has: prediction wrong → log outcome → reweight atoms. What's missing: prediction wrong → **dispatch investigation** → find out why → generate new atoms from the investigation → reweight based on understanding, not just outcome.

### 2.1 Investigation Triggers

An investigation is triggered whenever the system encounters an **unexplained outcome** — either a failure it doesn't understand or a success it can't attribute to its reasoning chain.

**Trigger types:**

| Trigger | When | Priority |
|---|---|---|
| `prediction_wrong_unexplained` | Prediction was incorrect AND the supporting atom chain appeared strong (confidence > 0.7) | High |
| `prediction_right_unexplained` | Prediction was correct BUT the atom chain was weak (confidence < 0.4) or the reasoning trail can't explain the magnitude of the move | High |
| `assumption_breached` | A key assumption underlying a thesis was violated — need to understand the new reality | High |
| `pattern_anomaly` | Pattern detection found something novel that doesn't match any known correlation | Medium |
| `blind_spot_detected` | The system realises it lacks knowledge in an area relevant to an active thesis | Medium |
| `regime_shift_suspected` | Market behaviour has changed in a way that invalidates historical correlations | Critical |
| `narrative_shift` | A dominant market narrative appears to be breaking down or a new one emerging | Medium |
| `consul_disagreement_unresolved` | The consuls strongly disagree and the synthesis consul can't reconcile | Medium |

### 2.2 Investigation Task Structure

```sql
CREATE TABLE market_investigation_tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Trigger
  trigger_type TEXT NOT NULL,              -- See trigger types above
  trigger_source_id TEXT,                  -- ID of prediction, thesis, pattern, or atom that triggered this
  trigger_source_type TEXT,                -- 'prediction', 'thesis', 'pattern', 'atom', 'rebalance'
  
  -- Question
  investigation_question TEXT NOT NULL,    -- The specific question to answer
  context TEXT NOT NULL,                   -- JSON: relevant background — the thesis, prediction, atoms involved
  
  -- Assignment
  assigned_consul TEXT,                    -- Which consul persona should lead the investigation
  assigned_module TEXT,                    -- Which module to use for the investigation
  
  -- Scope
  research_directions TEXT,                -- JSON array: specific areas to investigate
  data_sources_to_query TEXT,              -- JSON array: which APIs/sources to query for new data
  search_queries TEXT,                     -- JSON array: web search queries to run
  
  -- Priority & scheduling
  priority TEXT DEFAULT 'medium',          -- 'critical', 'high', 'medium', 'low'
  status TEXT DEFAULT 'queued',            -- 'queued', 'in_progress', 'completed', 'failed', 'cancelled'
  due_date TEXT,                           -- When this should be completed by
  
  -- Results
  findings TEXT,                           -- AI-generated investigation findings (Markdown)
  new_atoms_created TEXT,                  -- JSON array of atom IDs created from findings
  atoms_updated TEXT,                      -- JSON array of atom IDs whose confidence was adjusted
  correlations_discovered TEXT,            -- JSON array of new correlation IDs
  learning_summary TEXT,                   -- What was learned from this investigation
  
  -- Impact
  thesis_impact TEXT,                      -- How do findings affect the originating thesis
  confidence_impact REAL,                  -- Net change in related thesis confidence
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT DEFAULT 'system'
);

CREATE INDEX idx_investigations_status ON market_investigation_tasks(status);
CREATE INDEX idx_investigations_priority ON market_investigation_tasks(priority);
CREATE INDEX idx_investigations_trigger ON market_investigation_tasks(trigger_type);
CREATE INDEX idx_investigations_source ON market_investigation_tasks(trigger_source_id);
```

### 2.3 Investigation Workflow

```
TRIGGER → FORMULATE QUESTION → ASSIGN CONSUL → RESEARCH → ANALYSE → CREATE ATOMS → UPDATE INTELLIGENCE → CLOSE
```

**Step 1: Trigger detected.** The validation service or pattern detection engine identifies an unexplained outcome.

**Step 2: Formulate question.** The system generates a specific, answerable investigation question. Example: "Prediction #1847 (Nordic bank stocks to outperform in March) was incorrect despite strong supporting evidence. The atom chain pointed to ECB dovish shift and improving credit quality. What happened between February 28 and March 15 that invalidated these signals?"

**Step 3: Assign consul.** Route to the most appropriate consul. A macro-level failure goes to the Macro Strategist. A company-specific surprise goes to the Sector Analyst. When unsure, assign to the Contrarian — they're trained to find what others miss.

**Step 4: Research.** The assigned consul:
- Queries market data APIs for the investigation period
- Runs web search for relevant news and events
- Scans existing market atoms for related signals that may have been underweighted
- Checks if any other predictions were affected by the same factor

**Step 5: Analyse.** The consul produces a structured investigation report:
- What actually drove the outcome?
- Was the original reasoning fundamentally flawed, or was there an unpredictable external factor?
- Were there signals available at the time of prediction that should have been weighted differently?
- What specific lesson applies going forward?

**Step 6: Create atoms.** The investigation creates new atoms:
- New facts discovered during research
- New insights about signal reliability
- New correlations or correlation failures
- Updated confidence for existing atoms
- New blind spot atoms if the system discovers a systematic weakness

**Step 7: Update intelligence.** The new atoms and findings feed into:
- Signal weight adjustments
- Correlation map updates
- Consul calibration (if one consul's perspective would have been more useful)
- Thesis confidence recalculation for related active theses

**Step 8: Close.** Investigation marked complete with full audit trail.

### 2.4 The Unexplained Win Problem

This deserves special attention. When a prediction is correct but ANTON's reasoning chain can't explain why — or can't explain the magnitude — that's *more dangerous than an understood loss*. Because:

- The system might increase confidence in atoms that were actually irrelevant
- The system might attribute success to signals that happened to correlate but aren't causal
- Future predictions might be built on a foundation of false confidence

The investigation protocol treats unexplained wins with the same urgency as unexplained losses. The investigation question becomes: "Prediction #2034 was correct (OMX30 rose 3.2% as predicted), but our thesis was based on ECB signals that turned out to be neutral. What actually drove the move? If we can't identify the real driver, we must not increase confidence in the original atom chain."

---

## 3. Consul Collaboration Protocol

### 3.1 The Structured Disagreement Process

When building a thesis or making an index rebalance decision, the consuls don't work in isolation — they follow a structured protocol:

**Round 1: Independent Analysis.** Each consul analyses the question independently, without seeing other consuls' outputs. This prevents anchoring bias. Each produces:
- Their assessment with evidence chain
- Confidence level
- Key assumptions
- Biggest risk to their view

**Round 2: Cross-Examination.** Each consul reads the others' Round 1 outputs. The Contrarian consul is specifically tasked with challenging the most confident assessment. Each consul produces:
- Response to challenges from other consuls
- Updated confidence (may go up or down)
- Identified areas of agreement and disagreement

**Round 3: Synthesis.** The Synthesis consul integrates all perspectives:
- Identifies areas of genuine consensus (all consuls agree)
- Identifies productive disagreements (consuls disagree with good reasoning on both sides)
- Identifies unresolved uncertainties (nobody has a clear answer)
- Produces the final thesis with weighted attribution

**The key principle: disagreement is signal, not noise.** When the Macro Strategist sees a buying opportunity but the Risk Assessor flags a tail risk, the correct response isn't to pick a winner — it's to document both perspectives, adjust position sizing accordingly, and create an investigation task to resolve the disagreement as new data arrives.

### 3.2 Consul Accuracy Tracking

Over time, each consul's accuracy is tracked by context type:

```sql
CREATE TABLE market_consul_performance (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  consul_id TEXT NOT NULL,                 -- 'macro', 'sector', 'contrarian', 'risk', 'synthesis'
  
  -- Context
  context_type TEXT NOT NULL,              -- 'thesis_creation', 'rebalance', 'investigation', 'challenge'
  time_horizon TEXT,                       -- 'short', 'medium', 'long'
  asset_class TEXT,
  
  -- Performance
  total_contributions INTEGER DEFAULT 0,
  correct_contributions INTEGER DEFAULT 0,
  accuracy_rate REAL,
  
  -- Value-add
  times_correctly_challenged INTEGER DEFAULT 0,  -- Contrarian: how often their challenge was vindicated
  times_correctly_warned INTEGER DEFAULT 0,      -- Risk: how often their warning was justified
  times_key_insight INTEGER DEFAULT 0,           -- When this consul's unique perspective was the decisive factor
  
  -- Calibration
  average_confidence_when_correct REAL,
  average_confidence_when_incorrect REAL,
  
  -- Metadata
  last_updated TEXT DEFAULT (datetime('now'))
);
```

This data feeds back into the Synthesis consul's weighting: "The Macro Strategist has 73% accuracy on medium-term theses but only 48% on short-term calls — weight accordingly."

---

## 4. Confidence Calibration System

A critical gap: the system tracks confidence scores but never checks if they're *calibrated*. Calibration means: when the system says 80% confident, is it actually right about 80% of the time?

### 4.1 Calibration Table

```sql
CREATE TABLE market_confidence_calibration (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Bucket
  confidence_bucket TEXT NOT NULL,         -- '0.0-0.1', '0.1-0.2', ... '0.9-1.0'
  context_type TEXT DEFAULT 'all',         -- 'thesis', 'prediction', 'atom', 'signal', 'all'
  time_horizon TEXT DEFAULT 'all',         -- 'short', 'medium', 'long', 'all'
  
  -- Counts
  total_predictions INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  actual_accuracy REAL,                    -- correct / total
  
  -- Calibration quality
  calibration_error REAL,                  -- |stated_confidence - actual_accuracy|
  is_overconfident INTEGER,                -- 1 if actual_accuracy < stated_confidence
  
  -- Metadata
  last_updated TEXT DEFAULT (datetime('now')),
  sample_period_start TEXT,
  sample_period_end TEXT
);
```

### 4.2 Calibration Check

Run monthly: for each confidence bucket, compare stated confidence vs actual accuracy. If the system says 80% confident and is right only 60% of the time, the system is systematically overconfident — all future 80%-confidence claims should be treated as ~60% internally until the calibration improves.

The calibration data is exposed on the Learning Dashboard as a reliability diagram (expected confidence on X axis, observed accuracy on Y axis, perfect calibration = diagonal line).

---

## 5. Regime Detection

Markets don't behave the same way in all conditions. A "bull market" and a "crisis" have fundamentally different correlation structures, volatility patterns, and signal reliability. The system must detect regime shifts because:

- Correlations that work in one regime break in another
- Signal weights learned in a calm market may not apply during a crisis
- Theses built during one regime may become invalid when the regime changes

### 5.1 Regime Types

| Regime | Characteristics | Signal Implications |
|---|---|---|
| `low_vol_bull` | Low volatility, steady uptrend, risk-on | Momentum signals strong, mean-reversion weak |
| `high_vol_bull` | Rising with high volatility | Momentum signals unreliable, sector rotation matters |
| `range_bound` | Sideways, moderate volatility | Mean-reversion signals strong, momentum weak |
| `correction` | Declining 5–20%, rising volatility | Risk signals dominant, growth signals weak |
| `crisis` | Declining >20%, correlation spikes, liquidity dries up | Correlations break, most signals unreliable, cash is king |
| `recovery` | Transitioning from correction/crisis to growth | Turnaround signals valuable, lagging indicators misleading |

### 5.2 Regime Detection Table

```sql
CREATE TABLE market_regime_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  detected_regime TEXT NOT NULL,
  previous_regime TEXT,
  confidence REAL NOT NULL,
  
  -- Evidence
  evidence TEXT NOT NULL,                  -- JSON: volatility levels, correlation changes, breadth metrics
  key_indicators TEXT,                     -- JSON: which indicators triggered the detection
  
  -- Impact
  signal_weights_adjusted INTEGER DEFAULT 0,  -- Were signal weights adjusted for the new regime?
  theses_flagged INTEGER DEFAULT 0,        -- How many active theses were flagged for review
  investigations_spawned INTEGER DEFAULT 0, -- How many investigations triggered
  
  -- Validity
  detected_at TEXT DEFAULT (datetime('now')),
  confirmed_at TEXT,                       -- When enough evidence accumulated to confirm
  ended_at TEXT,                           -- When the next regime was detected
  duration_days INTEGER
);
```

When a regime shift is detected, the system:
1. Flags all active theses for review (their assumptions may no longer hold)
2. Temporarily adjusts signal weights toward the new regime's historical patterns
3. Spawns investigation tasks to understand what's driving the shift
4. Alerts the user that market conditions have changed

---

## 6. Event-Driven Triggers

The main spec is too batch-oriented. Markets don't wait for scheduled jobs. When a major event occurs, the system should react within minutes, not hours.

### 6.1 Event Types and Response Times

| Event Type | Detection Method | Response Time | Action |
|---|---|---|---|
| Earnings surprise (>5% beat/miss) | API feed | Within 30 min of release | Create event atom, flag affected theses, trigger sector-level reassessment |
| Central bank rate decision | News feed + API | Within 15 min | Create event atom, trigger macro consul assessment, review all rate-sensitive theses |
| Geopolitical shock | News feed sentiment spike | Within 1 hour | Create event atom, trigger regime check, flag all geographically exposed theses |
| Flash crash (>3% index drop in 1 hour) | Price feed anomaly | Within 5 min | Create warning atom, trigger risk consul assessment, flag all active theses |
| Major M&A announcement | News feed | Within 30 min | Create event atom, update entity graph, assess sector implications |
| Regulatory announcement | Radar feed | Within 2 hours | Create event atom, trigger investigation of affected sectors/companies |

### 6.2 Implementation

Extend the Radar's websocket/polling infrastructure. Marketaux and Finnhub support webhook-style notifications. When the news feed detects a high-impact event (sentiment spike, named entity with significant price move), trigger an immediate mini intelligence cycle on just the affected entities rather than waiting for the scheduled batch run.

---

## 7. Narrative Intelligence

Markets are driven by narratives as much as data. "AI is going to change everything" is a narrative. "Interest rates will stay higher for longer" is a narrative. Narratives drive capital flows, which drive prices, which generate more narrative.

### 7.1 Narrative Tracking

```sql
CREATE TABLE market_narratives (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  -- Narrative content
  title TEXT NOT NULL,                     -- "AI infrastructure buildout"
  description TEXT NOT NULL,               -- Full narrative description
  narrative_type TEXT NOT NULL,            -- 'macro_theme', 'sector_thesis', 'risk_narrative', 'policy_narrative', 'sentiment_shift'
  
  -- Strength
  strength REAL DEFAULT 0.5,              -- 0.0–1.0, how dominant this narrative is
  momentum TEXT DEFAULT 'stable',          -- 'strengthening', 'stable', 'weakening', 'collapsing'
  
  -- Beneficiaries and casualties
  beneficiary_entities TEXT,               -- JSON array of entity IDs that benefit
  threatened_entities TEXT,                -- JSON array of entity IDs that are threatened
  
  -- Evidence
  supporting_atoms TEXT,                   -- JSON array of atom IDs
  earliest_detection TEXT,                 -- When ANTON first identified this narrative
  peak_strength_date TEXT,
  
  -- Lifecycle
  status TEXT DEFAULT 'active',            -- 'emerging', 'active', 'mature', 'declining', 'exhausted', 'broken'
  
  -- Counter-narrative
  counter_narrative TEXT,                  -- What would break this narrative
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Narratives are tracked by scanning news sentiment over time for persistent themes. When a narrative strengthens or breaks, it generates atoms and can trigger investigation tasks.

---

## 8. Meta-Learning

The system should learn about *which types of learning produce the best improvement in future predictions*. This is learning about learning.

Track for each learning event:
- What type of learning was it? (signal reweight, correlation update, blind spot discovery, consul calibration)
- How much did prediction accuracy improve in the following 30/60/90 days for related theses?
- Was the improvement sustained or temporary?

Over time, this tells the system: "Blind spot discovery produces 3x more improvement than incremental signal reweighting — prioritise investigation tasks that uncover blind spots."

```sql
CREATE TABLE market_meta_learning (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  learning_event_id TEXT NOT NULL,         -- ID from market_prediction_feedback
  learning_type TEXT NOT NULL,
  
  -- Impact measurement
  accuracy_before_30d REAL,                -- Prediction accuracy in the 30 days before
  accuracy_after_30d REAL,                 -- Prediction accuracy in the 30 days after
  accuracy_delta_30d REAL,                 -- Change
  
  accuracy_before_90d REAL,
  accuracy_after_90d REAL,
  accuracy_delta_90d REAL,
  
  -- Classification
  impact_magnitude TEXT,                   -- 'transformative', 'significant', 'moderate', 'minimal', 'negative'
  was_sustained INTEGER,                   -- Did the improvement last beyond 90 days?
  
  -- Metadata
  measured_at TEXT DEFAULT (datetime('now'))
);
```

---

## 9. Improvements to Existing Specs

### 9.1 Missing: Watchlist System

Users need to track specific entities they care about without creating full theses. Add:

```sql
CREATE TABLE market_watchlist (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  entity_id TEXT NOT NULL REFERENCES market_entities(id),
  
  -- User config
  alert_on_price_change_pct REAL,          -- Alert if price moves more than X%
  alert_on_news INTEGER DEFAULT 1,         -- Alert on news mentions
  alert_on_thesis_relevance INTEGER DEFAULT 1, -- Alert when entity becomes relevant to a thesis
  
  notes TEXT,                              -- User's own notes on why they're watching
  
  -- Metadata
  added_at TEXT DEFAULT (datetime('now')),
  created_by TEXT
);
```

### 9.2 Missing: Backtesting Framework

The cold start solution needs a formal structure. The system should be able to:
1. Load historical market data for a specified period
2. Run the intelligence engine as if operating in real-time (no future data leakage)
3. Generate theses and predictions at historical dates
4. Validate against known outcomes
5. Produce a backtesting performance report

This is essential for both initial calibration and for validating new signal types before they go live.

```sql
CREATE TABLE market_backtests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Period
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  
  -- Scope
  asset_classes TEXT,                      -- JSON array
  geographies TEXT,                        -- JSON array
  
  -- Results
  predictions_generated INTEGER DEFAULT 0,
  predictions_correct INTEGER DEFAULT 0,
  accuracy_rate REAL,
  
  -- Comparison
  benchmark_return_pct REAL,
  strategy_return_pct REAL,
  excess_return_pct REAL,
  sharpe_ratio REAL,
  
  -- Status
  status TEXT DEFAULT 'pending',           -- 'pending', 'running', 'completed', 'failed'
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
```

### 9.3 Missing: Atom Decay System

Market atoms should decay in confidence over time unless refreshed. A fact about Q1 earnings is fresh in April, stale in July, and nearly useless in December. The current spec stores `valid_until` but doesn't have an automatic decay mechanism.

Add a scheduled job: `market-atom-decay` (daily). For atoms without explicit `valid_until`, apply decay based on atom type:
- `fact` (earnings data): half-life = 90 days
- `signal` (market signals): half-life = 7 days
- `sentiment`: half-life = 3 days
- `insight`: half-life = 180 days
- `correlation`: half-life = 365 days (but reset when re-confirmed)
- `event`: no decay (historical record)
- `prediction` / `outcome`: no decay (learning record)

Decay formula: `current_confidence = initial_confidence * (0.5 ^ (days_since_creation / half_life))`

### 9.4 Missing: Data Quality Scoring

Not all data sources are equally reliable. Track source quality and weight atoms from higher-quality sources more heavily:

```sql
ALTER TABLE market_data_sources ADD COLUMN quality_score REAL DEFAULT 0.7;
ALTER TABLE market_data_sources ADD COLUMN accuracy_track_record REAL DEFAULT 0.7;
ALTER TABLE market_data_sources ADD COLUMN latency_rating TEXT DEFAULT 'medium';
```

When atoms are extracted, their initial confidence is modulated by the source quality score: `atom_confidence = extraction_confidence * source_quality_score`.

### 9.5 Improvement: Cross-Pillar Reference Protocol

The main spec says users can "explicitly reference a professional atom in a market thesis" but doesn't specify *how*. Define:

When creating or editing a thesis, the thesis builder UI should include a "Cross-Reference" action that lets the user search Work-pillar atoms and attach them to the market thesis. These cross-references are stored with a `cross_pillar_reference` flag and do NOT update the Work-pillar atom's confidence — they are read-only references that add professional context to a market thesis.

Example: A compliance consultant's Work atom "AMLR implementation costs estimated at €5-15M per institution" gets cross-referenced into a market thesis about EU bank stock performance. The market thesis benefits from the professional insight, but the professional atom isn't affected by market outcomes.

---

## 10. Updated Table Count

The complete Markets database schema now includes:

| Category | Tables | From |
|---|---|---|
| Core Market Intelligence | 16 | Main Spec |
| Index System | 5 | Indexes Addendum |
| Investigation Tasks | 1 | This addendum |
| Consul Performance | 1 | This addendum |
| Confidence Calibration | 1 | This addendum |
| Regime History | 1 | This addendum |
| Narratives | 1 | This addendum |
| Meta-Learning | 1 | This addendum |
| Watchlist | 1 | This addendum |
| Backtests | 1 | This addendum |

**Total new tables: 29**

---

## 11. Updated Implementation Phasing

Revised to incorporate this addendum:

| Phase | Focus | Tables | Key Deliverables |
|---|---|---|---|
| **1: Foundation** | Data, atoms, navigation | 8 | Pillar registration, data feeds, atom storage, basic dashboard |
| **2: Intelligence** | Graph, patterns, narratives | 6 | Entity graph, pattern detection, narrative tracking, event triggers |
| **3A: Thesis Engine** | Theses, predictions, consuls | 5 | Thesis builder, consul collaboration, prediction generation, consul performance tracking |
| **3B: Indexes** | Index system | 5 | Index CRUD, NAV calculation, rebalance engine, leaderboard |
| **4: Learning Loop** | Validation, investigation, calibration | 6 | Prediction validation, active investigation, confidence calibration, atom decay, meta-learning |
| **5: Regime & Polish** | Regime detection, backtesting, watchlist, cross-pillar | 4 | Regime detector, backtest framework, watchlist, advanced visualisations |

---

*End of addendum. This document completes the four-document Markets Intelligence specification package.*
