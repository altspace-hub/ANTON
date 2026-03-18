# ANTON Markets — 5 Whys Root Cause Protocol

**Document type:** Insert for `MARKETS_ARCHITECTURE_ADDENDUM.md` Section 2 (Active Investigation Protocol)
**Created:** March 15, 2026
**Author:** Daniel Bardun (via Claude strategic session)
**Status:** Active specification
**Integrates into:** The Active Investigation Protocol as the core analytical method

---

## The Principle

In IT incident management (and in lean manufacturing before that), the "5 Whys" technique is a root cause analysis method where you ask "why?" repeatedly — typically 3 to 5 times — until you move past the surface symptom and reach the systemic root cause. Daniel used this extensively at SEB for IT incidents: *Why is the transaction system down? → The server is down. → Why? → A maintenance patch was applied. → Why during business hours? → The scheduling was wrong. → Why? → The change management process didn't flag the dependency.*

The deeper you go, the more valuable the insight. The first "why" gives you a fact. The third "why" gives you a process failure. The fifth "why" gives you a systemic blind spot.

**ANTON applies this in both directions:**
- When a prediction **fails**: 5 Whys to understand the root cause of the failure
- When a prediction **succeeds unexpectedly**: 5 Whys to understand the real driver (not the surface correlation)

Both directions produce equally valuable learning. The failure chain prevents repeating mistakes. The success chain prevents building false confidence on misunderstood luck.

---

## How It Works in Practice

### Example 1: Prediction Failure — 5 Whys Chain

**Prediction:** "Nordic bank stocks will outperform EU banking index in Q2 2026" (confidence: 0.78)
**Outcome:** Nordic banks underperformed by 3.2%

```
WHY #1: Why did Nordic banks underperform?
→ Swedish banks fell sharply in the last two weeks of Q2 while EU banks held steady.
  [ATOM CREATED: fact — "Swedish bank stocks declined 4.8% in final two weeks of Q2 2026"]

WHY #2: Why did Swedish banks fall in the last two weeks?
→ Riksbanken unexpectedly signalled a hawkish pivot in their June communication,
  reversing market expectations of continued easing.
  [ATOM CREATED: event — "Riksbanken hawkish pivot June 2026"]
  [ATOM CREATED: insight — "Riksbanken communication shift was not anticipated 
   by ANTON's macro signals"]

WHY #3: Why didn't ANTON anticipate the Riksbanken pivot?
→ ANTON's macro consul was weighting ECB signals (dovish) and assuming Nordic 
  central banks would follow. The system had no independent Riksbanken 
  communication monitoring — it was inferring Nordic monetary policy from ECB direction.
  [ATOM CREATED: blind_spot — "System lacks independent Nordic central bank 
   monitoring — infers from ECB"]
  [CORRELATION UPDATED: "ECB direction → Riksbanken direction" correlation 
   downgraded from 0.82 to 0.55]

WHY #4: Why was the system inferring rather than monitoring directly?
→ The market data sources don't include Riksbanken RSS/API feeds. Only ECB and 
  Fed are in the default radar sources. Nordic central bank communications are 
  a gap in the data infrastructure.
  [INVESTIGATION TASK: "Add Riksbanken, Norges Bank, and Danish National Bank 
   as radar sources"]
  [ATOM CREATED: finding — "Nordic central bank data feed gap identified — 
   systemic infrastructure weakness"]

WHY #5: Why don't we have Nordic central bank feeds?
→ The default source seeding prioritised global/EU sources. No systematic review 
  was done to match data sources to geographic exposure of active theses. 
  When we have Nordic-focused theses, we need Nordic-focused data coverage.
  [LEARNING: "Data source coverage must match thesis geographic exposure. 
   Before activating any geographic thesis, verify that relevant local data 
   sources are configured."]
  [PROCESS IMPROVEMENT: "Add data coverage check to thesis activation workflow"]
```

**Root cause (Level 5):** Not "the prediction was wrong" but "the system has a structural gap between thesis geographic scope and data source coverage." This is a systemic insight that improves every future geographic thesis, not just Nordic bank predictions.

---

### Example 2: Unexplained Success — 5 Whys Chain

**Prediction:** "EU pharma sector will outperform in March 2026" (confidence: 0.45 — low)
**Outcome:** EU pharma outperformed by 5.1% — much better than expected

```
WHY #1: Why did EU pharma outperform so strongly?
→ Several large-cap EU pharma companies reported significantly better-than-expected 
  Q4 earnings in early March, plus an FDA approval for a major EU-developed drug.
  [ATOM CREATED: fact — "EU pharma Q4 earnings beat consensus by avg 12%"]
  [ATOM CREATED: event — "FDA approval of [drug] boosted EU pharma sentiment"]

WHY #2: Why didn't ANTON have higher confidence given these catalysts were approaching?
→ The earnings dates were known but the thesis was built on sector rotation logic, 
  not earnings catalysts. The system treated the upcoming earnings as background 
  noise rather than a potential positive catalyst.
  [ATOM CREATED: insight — "Upcoming earnings dates should modulate thesis 
   confidence for affected sectors — both upside and downside risk"]

WHY #3: Why did the system ignore earnings catalysts in a sector rotation thesis?
→ The sector analyst consul flagged earnings as a risk factor but the synthesis 
  consul treated it as a symmetric risk (could go either way) and didn't adjust 
  confidence. There was no mechanism to weight earnings consensus vs. actual 
  historical beat rates for this sector.
  [ATOM CREATED: finding — "EU pharma has historically beaten consensus by 
   avg 8% over last 8 quarters — a persistent positive bias"]
  [SIGNAL WEIGHT UPDATE: "earnings_beat_rate" signal type importance increased 
   for pharma sector"]

WHY #4: Why wasn't the historical beat rate pattern detected?
→ The pattern detection engine runs on ANTON's internal atom data. Since the system 
  is young, it hasn't accumulated enough earnings history to detect the pattern. 
  The data exists in external APIs but wasn't being systematically collected for 
  historical pattern analysis.
  [INVESTIGATION TASK: "Backfill quarterly earnings surprise data for tracked 
   sectors — minimum 3 years of history"]
  [ATOM CREATED: blind_spot — "Insufficient historical earnings data for pattern 
   detection on sector beat rates"]

WHY #5: Why don't we systematically collect historical earnings patterns?
→ The data ingestion was designed for forward-looking signals, not historical 
  pattern libraries. The system needs a historical data backfill capability 
  to bootstrap pattern detection.
  [LEARNING: "Pattern detection is only as good as its historical data. 
   New signal types need historical backfill before they can be trusted. 
   Add backfill step to signal onboarding process."]
  [PROCESS IMPROVEMENT: "When adding a new signal type, require minimum 
   3 years of historical data before it contributes to confidence scoring"]
```

**Root cause (Level 5):** Not "we got lucky" but "the system lacks a historical data onboarding process for new signal types." This insight prevents future false confidence by establishing that new signals need historical validation before they can be trusted.

---

## Database Schema

### `market_why_chains`

Stores the structured 5 Whys analysis for each investigation.

```sql
CREATE TABLE market_why_chains (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  investigation_id TEXT NOT NULL REFERENCES market_investigation_tasks(id) ON DELETE CASCADE,
  
  -- Chain metadata
  direction TEXT NOT NULL,                 -- 'failure_analysis' or 'success_analysis'
  total_levels INTEGER DEFAULT 0,          -- How many whys were needed (typically 3–5)
  root_cause_reached INTEGER DEFAULT 0,    -- 1 if the chain reached a systemic root cause
  
  -- The chain (stored as JSON array for flexibility, but also individual columns for querying)
  chain_data TEXT NOT NULL,                -- JSON: full chain with all levels
  
  -- Root cause summary
  root_cause_summary TEXT,                 -- Plain-text summary of the deepest why
  root_cause_type TEXT,                    -- 'data_gap', 'model_limitation', 'signal_weakness', 
                                           -- 'process_gap', 'assumption_flaw', 'external_shock',
                                           -- 'infrastructure_gap', 'consul_calibration', 'regime_mismatch'
  
  -- Learning output
  atoms_created TEXT,                      -- JSON array of atom IDs created across all levels
  correlations_updated TEXT,               -- JSON array of correlation IDs updated
  signal_weights_updated TEXT,             -- JSON array of signal weight IDs updated
  blind_spots_identified TEXT,             -- JSON array of blind spot atom IDs
  process_improvements TEXT,               -- JSON array: human-readable process improvements
  investigation_tasks_spawned TEXT,        -- JSON array of follow-up investigation IDs
  
  -- Impact assessment
  systemic_impact TEXT,                    -- 'high' (affects many theses), 'medium', 'low' (single thesis)
  theses_affected INTEGER DEFAULT 0,       -- How many active theses are impacted by this root cause
  indexes_affected INTEGER DEFAULT 0,      -- How many active indexes are impacted
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_why_chains_investigation ON market_why_chains(investigation_id);
CREATE INDEX idx_why_chains_direction ON market_why_chains(direction);
CREATE INDEX idx_why_chains_root_type ON market_why_chains(root_cause_type);
CREATE INDEX idx_why_chains_impact ON market_why_chains(systemic_impact);
```

### `market_why_chain_levels`

Individual levels within a why chain, enabling per-level queries and pattern detection across chains.

```sql
CREATE TABLE market_why_chain_levels (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  chain_id TEXT NOT NULL REFERENCES market_why_chains(id) ON DELETE CASCADE,
  
  -- Level
  level_number INTEGER NOT NULL,           -- 1, 2, 3, 4, 5
  
  -- Content
  question TEXT NOT NULL,                  -- "Why did X happen?"
  answer TEXT NOT NULL,                    -- The finding at this level
  evidence TEXT,                           -- JSON: data points, atoms, or sources supporting the answer
  
  -- Category
  level_type TEXT,                         -- 'symptom', 'proximate_cause', 'contributing_factor', 
                                           -- 'process_failure', 'systemic_root_cause'
  
  -- Actions taken at this level
  atoms_created_at_level TEXT,             -- JSON array of atom IDs created from this level's finding
  research_performed TEXT,                 -- What research was done to answer this why
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_why_levels_chain ON market_why_chain_levels(chain_id);
CREATE INDEX idx_why_levels_number ON market_why_chain_levels(level_number);
CREATE INDEX idx_why_levels_type ON market_why_chain_levels(level_type);
```

---

## Integration into the Investigation Protocol

The 5 Whys is the **core analytical method** within the Active Investigation Protocol (Section 2 of the Architecture Addendum). Update the investigation workflow:

### Updated Investigation Workflow

```
TRIGGER → FORMULATE QUESTION → ASSIGN CONSUL → 5 WHYS CHAIN → CREATE ATOMS → UPDATE INTELLIGENCE → CLOSE
```

The "Research → Analyse" steps from the original protocol are replaced by the 5 Whys chain, which is more structured and produces deeper insights:

**Step 4 (revised): Execute 5 Whys Chain.**

The assigned consul executes the chain iteratively:

1. **Why #1 (Surface):** What is the immediate, observable explanation? This usually produces a `fact` or `event` atom. The consul queries market data APIs and news feeds to establish what happened.

2. **Why #2 (Proximate cause):** What drove the surface observation? This usually requires research — scanning news, checking data, looking at related entities. Produces `insight` or `finding` atoms.

3. **Why #3 (Contributing factor):** What underlying condition or process allowed the proximate cause to have the observed effect? This is where the analysis moves from "what happened in the market" to "what's going on in our model." Often reveals signal weaknesses or assumption flaws.

4. **Why #4 (Process failure):** Why didn't the system anticipate or detect the contributing factor? This level almost always reveals something about ANTON's infrastructure — missing data sources, uncalibrated confidence, a consul whose perspective was underweighted. Produces `blind_spot` atoms and process improvement items.

5. **Why #5 (Systemic root cause):** Why does the process failure exist? This is the deepest level — it reveals architectural assumptions, design decisions, or systematic biases that affect not just this prediction but the entire class of similar predictions. This is where the gold is.

**Not every chain needs 5 levels.** Some root causes are reached at level 3 (the proximate cause was a genuinely unforeseeable external shock — a political assassination, a natural disaster). The consul should stop when one of these conditions is met:
- A genuine root cause has been identified (something systemic, not just a surface explanation)
- The chain reaches an unforeseeable external event (mark as `external_shock`)
- The chain starts going in circles (the same explanation at two consecutive levels)
- Five levels have been reached

**Every level produces artefacts.** The discipline of the method is that each "why" creates atoms, updates correlations, or spawns investigation tasks. By the time the chain completes, the system has not just understood the outcome — it has generated concrete intelligence improvements at every level of the analysis.

---

## The 5 Whys Prompt Template

For the consul executing the chain:

```markdown
You are conducting a 5 Whys root cause analysis on a market intelligence outcome.

CONTEXT:
- Direction: {failure_analysis | success_analysis}
- Original prediction: {prediction_description}
- Expected outcome: {expected}
- Actual outcome: {actual}
- Original confidence: {confidence}
- Supporting atom chain: {atoms}
- Thesis: {thesis_summary}

INSTRUCTIONS:
Execute a 5 Whys analysis. For each level:

1. State the "Why?" question clearly
2. Research the answer using available data (market APIs, news, existing atoms)
3. Classify the level: symptom, proximate_cause, contributing_factor, process_failure, 
   or systemic_root_cause
4. List any new atoms to create (with type and confidence)
5. List any existing atoms or correlations to update
6. List any investigation tasks to spawn for follow-up

IMPORTANT:
- Each level must go DEEPER than the previous one. Don't repeat yourself.
- Level 1 should address what happened in the market.
- Levels 2-3 should address why our analysis missed or misread the situation.
- Levels 4-5 should address what systemic issue in our process/data/model allowed 
  this gap to exist.
- If this is a SUCCESS analysis: treat it with equal rigour. Unexplained success 
  is dangerous. We need to know the REAL reason, not just take credit.
- Stop before level 5 only if you've genuinely reached a root cause or an 
  unforeseeable external event.

OUTPUT FORMAT:
Return structured JSON with the full chain, atoms created at each level, 
root cause classification, and systemic impact assessment.
```

---

## Pattern Detection Across Why Chains

Over time, the collection of why chains becomes its own intelligence source. Run pattern detection across completed chains to find:

**Recurring root cause types:** "60% of our prediction failures have `data_gap` as the root cause → invest more in data source coverage."

**Level distribution:** "Most of our root causes are found at level 3, not level 5 → our failures are usually at the contributing factor level, meaning our process design is sound but our signal calibration needs work."

**Direction asymmetry:** "We run more failure analyses (70%) than success analyses (30%) → we might be systematically under-investigating our wins, which could mask false confidence."

**Root cause → improvement tracking:** "Of the 15 process improvements identified through why chains, 8 have been implemented and 7 are still open → track implementation rate."

This is meta-analysis of root cause analysis — and it's immensely valuable for prioritising where to invest effort in improving the intelligence engine.

---

## Frontend Integration

### Investigation Detail Page — Why Chain Visualiser

When viewing an investigation task that has a completed 5 Whys chain, display it as a visual cascade:

```
┌─────────────────────────────────────────────────────────┐
│  WHY #1: [Surface — Symptom]                            │
│  Q: Why did Nordic banks underperform?                  │
│  A: Swedish banks fell sharply in final two weeks...    │
│  → 1 atom created | 0 updated                          │
├─────────────────────────────────────────────────────────┤
│  WHY #2: [Proximate Cause]                              │
│  Q: Why did Swedish banks fall?                         │
│  A: Riksbanken hawkish pivot...                         │
│  → 2 atoms created | 0 updated                         │
├─────────────────────────────────────────────────────────┤
│  WHY #3: [Contributing Factor]                          │
│  Q: Why didn't ANTON anticipate the pivot?              │
│  A: System was inferring Nordic policy from ECB...      │
│  → 1 blind spot atom | 1 correlation updated           │
├─────────────────────────────────────────────────────────┤
│  WHY #4: [Process Failure]                              │
│  Q: Why was the system inferring?                       │
│  A: No Nordic central bank data feeds configured...     │
│  → 1 investigation task spawned | 1 finding atom        │
├─────────────────────────────────────────────────────────┤
│  WHY #5: [Systemic Root Cause]                     ★    │
│  Q: Why don't we have Nordic central bank feeds?        │
│  A: No process to match data sources to thesis scope... │
│  → 1 process improvement | 1 learning atom              │
│                                                         │
│  ROOT CAUSE: data_gap | IMPACT: high (12 theses)       │
└─────────────────────────────────────────────────────────┘
```

### Learning Dashboard — Root Cause Distribution

Add a chart to the Learning Dashboard showing root cause type distribution across all completed why chains. This tells the user (and the system) where the systemic weaknesses are.

---

## Updated Table Count

Adding 2 tables to the Markets schema:

| Addition | Tables |
|---|---|
| Previous total | 29 |
| `market_why_chains` | +1 |
| `market_why_chain_levels` | +1 |
| **New total** | **31** |

---

*End of insert. This integrates into `MARKETS_ARCHITECTURE_ADDENDUM.md` Section 2 as the core analytical method within the Active Investigation Protocol.*
