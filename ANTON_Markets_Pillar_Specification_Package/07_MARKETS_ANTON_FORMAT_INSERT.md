# ANTON Markets — .anton Export Format Extension

**Document type:** Specification insert for Claude Code
**Created:** March 15, 2026
**Author:** Daniel Bardun (via Claude strategic session)
**Status:** Active specification
**Depends on:** Existing `anton-bundler.ts`, `antonImport.ts`, `antonExport.ts`

---

## The Vision

Every piece of Markets intelligence — indexes, theses, atom chains, why chains, signal weights, correlation maps, investigation findings, consul calibration data, regime models — should be exportable in `.anton` format so that people worldwide can:

1. **Study** how a portfolio arrived at its decisions — full transparency from conclusion back to raw data
2. **Learn** from other users' intelligence models — import a proven signal weight configuration or correlation map
3. **Replicate** successful index strategies in their own ANTON instance — with full adaptation support
4. **Build on** others' work — import a thesis framework, adapt it to your geography, improve it, share the improved version
5. **Teach** — a university professor exports an ANTON index with its full why chain history as a case study for students

This is unique in the financial intelligence space. No Bloomberg terminal lets you export its intelligence model. No hedge fund shares its signal weights. ANTON's open-source philosophy extends to the intelligence layer itself.

---

## New Bundle Types

Extend the existing 17 bundle types with 7 Markets-specific types. These follow the same `.anton` ZIP structure (JSON + Markdown, no executable code, human-reviewable).

### Bundle Type 18: `market-index`

**What it exports:** A complete ANTON Index definition with its current holdings, performance history, rebalance history, and the reasoning behind every decision.

**Contents:**

```
market-index.anton/
├── manifest.json                    # Standard .anton manifest
├── README.md                        # Human-readable description
├── index/
│   ├── definition.json              # Index parameters (name, philosophy, universe, weighting, benchmark)
│   ├── current_holdings.json        # Active positions with weights, entry prices, conviction scores
│   ├── holdings_history.json        # All historical holdings including exited positions with returns
│   ├── nav_history.json             # Daily NAV values and benchmark comparison
│   └── performance_summary.json     # Key metrics: total return, excess return, Sharpe, max drawdown
├── rebalances/
│   ├── rebalance_001.json           # Each rebalance with additions, removals, reasoning, impact score
│   ├── rebalance_002.json
│   └── ...
├── theses/
│   ├── thesis_001.json              # Theses that drove index decisions (with atom chains)
│   └── ...
├── atoms/
│   └── supporting_atoms.json        # All atoms referenced by holdings and theses
└── attribution/
    ├── position_attribution.json    # Which holdings drove returns
    ├── atom_attribution.json        # Which atoms drove the best decisions
    └── consul_attribution.json      # Which consul perspectives were most valuable
```

**Import behaviour:** User can import as a template (create new index with same parameters but fresh data) or as a study package (read-only historical record for analysis and learning).

**Use case:** "The ANTON Nordic 30 beat OMXS30 for 6 months. Export the full index with reasoning. A finance student in Helsinki imports it and traces every decision back to its atom chain to understand how the intelligence engine works."

---

### Bundle Type 19: `market-thesis`

**What it exports:** A single thesis with its complete evidence chain, prediction outcomes, why chain analysis, and learning summary.

**Contents:**

```
market-thesis.anton/
├── manifest.json
├── README.md
├── thesis/
│   ├── thesis.json                  # Core thesis: claim, confidence, time horizon, success criteria
│   ├── supporting_atoms.json        # All supporting atoms with confidence scores
│   ├── contradicting_atoms.json     # All contradicting atoms
│   ├── consul_contributions.json    # Which consul contributed what perspective
│   └── net_confidence_calculation.json  # How net confidence was derived
├── predictions/
│   ├── prediction_001.json          # Concrete predictions with outcomes
│   └── ...
├── why_chains/
│   ├── why_chain_001.json           # 5 Whys analysis (if thesis was validated)
│   └── ...
├── entities/
│   └── referenced_entities.json     # Market entities involved in the thesis
└── learning/
    └── learning_summary.json        # What was learned from this thesis
```

**Import behaviour:** Can be imported as a study document or as a thesis template (reuse the analytical framework with fresh data).

**Use case:** "An analyst builds a thesis about ECB policy impact on Nordic banking. It plays out. They export the thesis with full reasoning, the why chain showing what they learned, and share it as a case study. Another analyst imports it, adapts the framework for BoE policy impact on UK banking."

---

### Bundle Type 20: `market-intelligence-model`

**What it exports:** The accumulated intelligence state — signal weights, correlation map, confidence calibration, consul performance data, regime history, and blind spot inventory. This is the system's "brain" at a point in time.

**Contents:**

```
market-intelligence-model.anton/
├── manifest.json
├── README.md
├── signal_weights/
│   └── weights.json                 # All signal type importance rankings with sample sizes
├── correlations/
│   └── correlation_map.json         # All discovered correlations with strength, sample size, confirmation count
├── calibration/
│   └── confidence_calibration.json  # Calibration buckets: stated confidence vs actual accuracy
├── consul_performance/
│   └── consul_accuracy.json         # Per-consul accuracy by context type and time horizon
├── regimes/
│   └── regime_history.json          # Historical regime detections with evidence
├── blind_spots/
│   └── known_blind_spots.json       # Acknowledged system limitations
├── meta_learning/
│   └── learning_effectiveness.json  # Which types of learning produce best improvements
└── statistics/
    └── model_summary.json           # Aggregate stats: total atoms, predictions, accuracy rate, etc.
```

**Import behaviour:** This is the most powerful and most sensitive export. On import, the system offers three modes:
1. **Study mode** — Read-only. Browse the model to understand how a mature ANTON instance has learned.
2. **Bootstrap mode** — Apply signal weights and correlation map to accelerate a new instance's cold start. Existing local intelligence is preserved and merged (higher-sample-size data takes priority).
3. **Selective import** — Pick specific components: "Import the correlation map but not the signal weights."

**Use case:** "A finance research group at a university runs ANTON Markets for a year, building a comprehensive intelligence model. They export it as a `.anton` package and publish it as a research dataset. Other researchers can study the model, reproduce findings, or bootstrap their own instances."

---

### Bundle Type 21: `market-investigation`

**What it exports:** A complete investigation with its trigger, 5 Whys chain, findings, atoms created, and process improvements identified.

**Contents:**

```
market-investigation.anton/
├── manifest.json
├── README.md
├── investigation/
│   ├── task.json                    # The investigation task: trigger, question, assignment, scope
│   └── findings.json                # The investigation findings narrative
├── why_chain/
│   ├── chain_summary.json           # Chain metadata: direction, levels, root cause type, impact
│   └── levels/
│       ├── level_1.json             # Each level with question, answer, evidence, atoms created
│       ├── level_2.json
│       ├── level_3.json
│       ├── level_4.json
│       └── level_5.json
├── atoms/
│   └── atoms_created.json           # All atoms generated by the investigation
├── learning/
│   ├── learning_summary.json        # What was learned
│   └── process_improvements.json    # Identified process improvements
└── context/
    ├── original_thesis.json         # The thesis that triggered the investigation (if applicable)
    └── original_prediction.json     # The prediction that triggered the investigation (if applicable)
```

**Import behaviour:** Read-only study document. Investigations are too context-specific to template, but they are incredibly valuable as learning material.

**Use case:** "ANTON predicted EU tech would outperform and was wrong. The 5 Whys chain drilled down to discover that the system was ignoring regulatory risk from the EU AI Act. The investigation is exported and shared. Every ANTON user worldwide can read the chain and learn from it — or import the new atoms created by the investigation."

---

### Bundle Type 22: `market-data-source-config`

**What it exports:** Data source configuration for connecting to financial data APIs.

**Contents:**

```
market-data-source-config.anton/
├── manifest.json
├── README.md
├── sources/
│   ├── source_001.json              # Source config (MINUS API keys — never exported)
│   ├── source_002.json
│   └── ...
└── schedules/
    └── fetch_schedule.json          # Recommended fetch intervals and rate limit config
```

**Import behaviour:** Standard import with adaptation. API keys must be configured by the user after import.

**Security note:** API keys are NEVER included in the export. The export includes the `api_key_env_var` field (which environment variable to set) but never the key value itself.

**Use case:** "A user in Sweden configures ANTON with Riksbanken RSS, Nordnet API, and Swedish Companies Registration Office data. They export the source configuration. Another Swedish user imports it and only needs to add their own API keys."

---

### Bundle Type 23: `market-atom-collection`

**What it exports:** A curated collection of market atoms — like a knowledge pack but for market intelligence.

**Contents:**

```
market-atom-collection.anton/
├── manifest.json
├── README.md
├── atoms/
│   ├── atoms.json                   # The atom collection with types, confidence, tags, temporal validity
│   └── relationships.json           # Relationships between atoms in the collection
├── entities/
│   └── entities.json                # Market entities referenced by the atoms
└── metadata/
    ├── collection_info.json         # What this collection covers, when it was created, data freshness
    └── source_quality.json          # Quality ratings for the data sources these atoms were extracted from
```

**Import behaviour:** Atoms are imported into the market atom store with a `source_type` of `imported_collection` and tagged with the collection name. Imported atoms start at slightly reduced confidence (90% of stated confidence) since the importing user hasn't independently verified them.

**Use case:** "A commodities analyst builds a comprehensive atom collection about the oil market — supply dynamics, OPEC policy atoms, shipping route disruptions, refinery capacity data. They export it. An energy sector investor imports the collection to bootstrap their ANTON's oil market knowledge."

---

### Bundle Type 24: `market-strategy-pack`

**What it exports:** A complete strategy package combining multiple components — the richest Markets export type.

**Contents:**

```
market-strategy-pack.anton/
├── manifest.json
├── README.md
├── index/
│   └── definition.json              # Index template (if the strategy includes an index)
├── theses/
│   └── thesis_templates.json        # Thesis frameworks (generalised, without time-specific data)
├── modules/
│   └── custom_modules.json          # Any custom Markets modules created for this strategy
├── signal_config/
│   └── signal_weights.json          # Signal weight configuration tuned for this strategy
├── data_sources/
│   └── sources.json                 # Recommended data sources (no API keys)
├── consul_config/
│   └── consul_weights.json          # How consul perspectives should be weighted for this strategy
├── radar_config/
│   └── market_radar.json            # Market radar source configuration
├── atoms/
│   └── seed_atoms.json              # Seed knowledge atoms to bootstrap the strategy
├── narratives/
│   └── key_narratives.json          # Important narratives the strategy tracks
└── guide/
    └── strategy_guide.md            # Human-readable guide: what this strategy does, how it works,
                                     # what to watch for, what the known limitations are
```

**Import behaviour:** Full guided adaptation session:
- "This strategy was designed for [original context]. Let's adapt it for your situation."
- Review and adjust universe filters, signal weights, radar sources
- Import seed atoms at reduced confidence
- Create index from template (if included)
- Configure data sources (user adds API keys)

**Use case:** "A quantitative analyst builds a complete 'Nordic Value Investing' strategy pack — ESG-screened, fundamentals-weighted, with custom radar sources monitoring Nordic regulatory changes. They export the full pack. A wealth manager in Copenhagen imports it, adapts the universe to include Danish stocks more heavily, and activates it."

---

## Integration with Existing Export Infrastructure

### Implementation Rule

Claude Code must extend the existing `anton-bundler.ts`, `antonImport.ts`, and `antonExport.ts` — NOT create parallel export systems. The Markets bundle types follow the same patterns:

1. Same manifest.json structure with `bundle_type` field extended to include the 7 new types
2. Same ZIP packaging via the existing archiving utility
3. Same import preview UI (show contents before applying)
4. Same audit logging (every export and import recorded)
5. Same security constraints (no executable code, human-reviewable text only)

### Export Entry Points

Add export buttons to:

| Page | What's Exportable | Bundle Type |
|---|---|---|
| `MarketIndexDetailPage` | Single index with full history | `market-index` |
| `MarketThesesPage` (thesis detail) | Single thesis with evidence chain | `market-thesis` |
| `MarketLearningPage` | Full intelligence model | `market-intelligence-model` |
| Investigation detail view | Single investigation with why chain | `market-investigation` |
| `MarketDataSourcesPage` | Data source configuration | `market-data-source-config` |
| Atom collection view (new) | Curated atom collection | `market-atom-collection` |
| Strategy overview (new) | Full strategy pack | `market-strategy-pack` |

### Import Flow

When a user imports a Markets `.anton` file:

1. Detect bundle type from manifest
2. Show full preview of contents (atoms, theses, entities, configurations)
3. Ask import mode (study/bootstrap/selective where applicable)
4. For atom imports: reduce confidence by 10% (imported atoms haven't been locally verified)
5. For intelligence model imports: offer merge strategy (local priority, import priority, highest sample size wins)
6. For data source imports: strip any accidentally included API keys, prompt user for their own keys
7. Log import in audit trail with full contents summary

### Marketplace Integration

Markets bundle types integrate with the planned marketplace:

- Users can share indexes with their full audit trails as public showcase items
- Intelligence models can be published as research datasets
- Strategy packs become the premium marketplace item — the most comprehensive and valuable export
- Investigation why chains become a unique educational content category: "Learn from ANTON's mistakes and successes"
- Community ratings include a "prediction accuracy" dimension for indexes and theses

---

## What This Means for the ANTON Ecosystem

The existing 17 bundle types cover professional work configuration. These 7 new types extend the `.anton` format into **intelligence distribution**. The combination is powerful:

| Existing Types | What They Share | Markets Types | What They Share |
|---|---|---|---|
| Module, Skill, Persona | How to think about a problem | Intelligence Model | What the system has learned |
| Workflow, Output Chain | How to structure work | Strategy Pack | How to approach a market |
| Compliance Ruleset, Quality Baseline | What standards to apply | Index | How decisions were made (with proof) |
| Radar Config | What to monitor | Data Source Config | Where to get market data |
| Project Template | How to run an engagement | Thesis, Investigation | How to reason about markets |

Together, the 24 bundle types create a complete knowledge transfer system: share not just how you work, but what you've learned, how you make decisions, and what evidence supports those decisions.

This is what makes ANTON Markets potentially more valuable than any closed-source competitor. Bloomberg charges $25k/year and your intelligence stays locked in their terminal. ANTON lets you export your entire intelligence model, share it with the world, and import others' learnings — all in a format that's human-readable, version-controllable, and works offline.

---

## Updated Bundle Type Count

| Category | Bundle Types | Range |
|---|---|---|
| Core Content (existing) | 4 | 1–4 |
| Professional Standards (existing) | 3 | 5–7 |
| Compound Packages (existing) | 5 | 8–12 |
| Coding Area (existing) | 5 | 13–17 |
| **Markets Intelligence (new)** | **7** | **18–24** |
| **Total** | **24** | |

---

*End of insert. This extends the `.anton` format specification and integrates with the existing export/import infrastructure in `anton-bundler.ts`.*
