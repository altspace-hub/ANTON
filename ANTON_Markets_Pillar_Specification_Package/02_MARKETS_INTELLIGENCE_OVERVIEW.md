# ANTON Markets Intelligence — Overview & Vision

**Document type:** Explanation & Context for Claude Code
**Created:** March 15, 2026
**Author:** Daniel Bardun (via Claude strategic session)
**Status:** Reference document — read this BEFORE the spec

---

## What This Document Is

This document explains the vision, rationale, and strategic thinking behind ANTON's new **Markets** pillar — a self-learning financial intelligence and investigation system. It is written for Claude Code so that the implementation agent understands not just *what* to build but *why* each architectural decision was made.

Read this document first. Then read the companion `MARKETS_INTELLIGENCE_SPEC.md` for the technical specification and implementation instructions.

---

## 1. The Concept

We are building a new top-level pillar in ANTON called **Markets** — sitting alongside Work, School, Life, and Pathfinder in the main navigation. Markets is a self-learning financial intelligence system that:

1. **Ingests** open market data — stock prices, company fundamentals, news, events, macroeconomic indicators, earnings, regulatory filings, sector data, commodity prices, currency rates, and more
2. **Analyses** this data using ANTON's existing intelligence infrastructure — the 5-layer funnel, knowledge atoms, knowledge graph, pattern detection engine, and AI consuls
3. **Builds theses** — structured investment or market hypotheses composed of typed atoms with confidence scores, temporal validity, and supporting/contradicting evidence chains
4. **Makes predictions** — concrete, time-bounded, verifiable claims about markets, companies, sectors, or instruments
5. **Validates predictions** — when the predicted time window closes, the system checks reality against the prediction and scores the outcome
6. **Learns from outcomes** — the validation results feed back into the intelligence system, updating confidence scores, correlation weights, signal importance rankings, and the system's understanding of what matters and what doesn't
7. **Iterates continuously** — this is not a one-shot analysis tool. It is a living system that gets measurably better over time through a closed feedback loop

The key phrase is **"constant iteration of information coming in, analysing, going out to get more information, contemplating, building theses, checking theses, updating knowledge."** This cycle never stops. Every day the system ingests new data, every week it can validate short-term predictions, every month it can assess medium-term theses, and the compounding effect of this learning is the core value proposition.

---

## 2. Why This Is Different from Everything Else

### The competitive landscape (as of March 2026)

The AI financial intelligence market currently segments into three tiers:

**Institutional tier** — Bloomberg Terminal (~$25k/year/seat, 325k terminals), Refinitiv Eikon, S&P Capital IQ, Kensho (acquired by S&P). Massive data coverage, closed ecosystems, enterprise-only. These are data retrieval and presentation platforms with some AI augmentation bolted on.

**AI-native research tier** — AlphaSense, Reflexivity, Rogo, Hebbia, Fiscal.ai. Range from $200–$2,000/month. Target analysts and portfolio managers. Focus on document intelligence (NLP over earnings calls, filings, research reports) and data presentation. Reflexivity has a knowledge graph but no learning loop. Rogo does custom LLM training per firm but no self-improving prediction system.

**Consumer/prosumer tier** — AInvest, Magnifi, PortfolioPilot, FinChat.io, Kavout. Free to ~$50/month. Retail investor tools. Mostly GPT wrappers with financial data connections. No persistent knowledge, no learning, no thesis management.

### What none of them have

No existing platform combines all of the following:

1. **Typed knowledge atoms with confidence scoring and temporal validity** — every piece of intelligence is a discrete, typed, scored unit that can be traced to its source, related to other atoms, and invalidated when superseded
2. **A closed-loop prediction validation system** — where the system's own predictions are tracked, scored against reality, and the outcomes feed back into future analysis
3. **Multi-consul AI collaboration** — where multiple AI personas (macro analyst, sector specialist, devil's advocate, risk assessor) work together on a thesis with structured disagreement
4. **Open-source and model-agnostic** — can run on Claude, GPT, Mistral, or local Ollama. No vendor lock-in. Can be deployed air-gapped for sovereign/institutional use
5. **Professional context intelligence (APCI)** — the system doesn't just do statistical pattern matching like quantitative models. It understands *professional context* — what a regulatory change means for a sector, why a management change matters, how supply chain disruptions propagate

This is APCI applied to financial markets — and it's a category that doesn't exist yet in the competitive landscape.

### The Bloomberg Lite framing

Internally, we think of this as "Bloomberg Lite" — but the framing matters. We are NOT trying to compete with Bloomberg on data breadth or terminal features. Bloomberg's moat is its data network and institutional relationships. Our moat is the *intelligence layer* — the ability to learn, build theses, validate, and compound knowledge over time. Bloomberg gives you data. ANTON Markets gives you *understanding that improves*.

---

## 3. Why ANTON's Existing Architecture Makes This Possible

This is not a greenfield build. ANTON already has ~80% of the infrastructure needed. What's remarkable is how directly the existing systems map to financial intelligence requirements:

### 3.1 The 5-Layer Intelligence Funnel → Market Intelligence Pipeline

| Existing Layer | Financial Intelligence Application |
|---|---|
| **Layer 1: Raw Workflow Outputs** | Raw market data ingestion — prices, news, filings, events |
| **Layer 2: Knowledge Atoms** | Market atoms — extracted facts, insights, signals, predictions with confidence scores and temporal validity |
| **Layer 3: Knowledge Graph** | Market graph — companies, sectors, instruments, people, events, regulations, and the relationships between them |
| **Layer 4: Pattern Detection** | Market pattern detection — correlations, cascades, divergences, convergences, gaps across market data |
| **Layer 5: Actionable Intelligence** | Investment theses, predictions, risk alerts, opportunity signals surfaced on the Markets dashboard |

### 3.2 Knowledge Atoms → Market Atoms

The existing atom infrastructure (`knowledge_atoms`, `atom_sources`, `atom_tags`, `atom_relationships`) already supports exactly what we need:

- **Atom types** already include `fact`, `insight`, `conclusion`, `finding`, `recommendation` — all directly applicable to market intelligence
- **Confidence scoring** (0–1) already built in — essential for weighting market signals
- **Temporal validity** (permanent, date range, superseded) already built in — critical for time-sensitive market data
- **Atom relationships** (supports, contradicts, extends) already built in — this is how thesis evidence chains work

**BUT** — and this is a critical architectural decision — **market atoms must be stored separately from Work/School/Life/Pathfinder atoms**. The reasons:

1. **Volume** — Market data generates orders of magnitude more atoms than professional work sessions. A single day of market data could produce thousands of atoms. We don't want this flooding the Work pillar's intelligence.
2. **Temporal characteristics** — Market atoms decay and supersede much faster than professional atoms. A regulatory interpretation might be valid for years. A market price signal is valid for hours or days.
3. **Cross-contamination risk** — If market atoms feed into the Work pillar's pattern detection, you could get spurious correlations between, say, stock price movements and compliance gap analysis quality. The intelligence from each domain needs to stay clean.
4. **Query performance** — Keeping market atoms in separate tables means queries against either domain remain fast as volumes grow.

The spec document details the exact table structure for this separation.

### 3.3 Regulatory Radar → Market Radar

The existing Radar infrastructure is directly repurposable:

- `radar_sources` table → add financial data feeds alongside regulatory feeds
- Scheduled fetching (node-cron) → same mechanism, different sources
- AI-powered scoring (relevance/urgency/impact) → same scoring model, financial context
- Lifecycle management (New → Reviewed → Actioned → Dismissed → Archived) → same for market signals

### 3.4 External Data Integration → Financial Data Connections

The v3.0 External Data Integration Framework already supports REST APIs, which covers all the major financial data providers:

- **Alpha Vantage** — Free tier: 25 requests/day. Stocks, forex, crypto, commodities, economic indicators, news sentiment. NASDAQ-licensed.
- **Finnhub** — Free tier: 60 calls/minute. Real-time quotes, company fundamentals, earnings, SEC filings, news, economic data.
- **Marketaux** — Free tier: 100 requests/day. Financial news with entity recognition and sentiment scoring across 80+ markets and 5,000+ sources.
- **EODHD** — Free tier available. EOD/intraday prices for global exchanges, fundamentals, dividends, splits, macroeconomic data.
- **Twelve Data** — Free tier: 8 calls/minute. Real-time and historical data for stocks, forex, crypto. Technical indicators built in.
- **Financial Modeling Prep** — Free tier available. Financial statements, company profiles, SEC filings, analyst estimates.

All of these return JSON via REST — exactly what the existing connection framework already handles.

### 3.5 AI Orchestrator Consuls → Market Analysis Team

The AI Orchestrator's multi-consul architecture (specified in the v0.6.0 batch) creates a natural financial research team:

- **Macro Analyst consul** — focused on macroeconomic signals, central bank policy, geopolitical events, cross-market correlations
- **Sector Specialist consul** — deep knowledge of specific sectors, industry dynamics, competitive landscapes, supply chains
- **Contrarian / Devil's Advocate consul** — challenges every thesis, looks for disconfirming evidence, stress-tests assumptions
- **Risk Assessor consul** — evaluates downside scenarios, tail risks, correlation breakdowns, liquidity risks
- **Synthesis consul** — integrates the perspectives from other consuls into a coherent thesis with weighted evidence

### 3.6 Apprentice Model → Prediction Confidence Progression

The four-stage Apprentice Model (Observer → Guided → Supervised → Autonomous) maps perfectly to how trust should build in a financial prediction system:

- **Observer** — System ingests data and presents raw intelligence. No predictions. User makes all judgments.
- **Guided** — System suggests potential theses based on patterns detected. User evaluates and decides.
- **Supervised** — System builds theses and makes predictions that are flagged for user review before acting.
- **Autonomous** — System maintains and updates theses independently, alerting user to significant changes, with proven track record.

The progression between stages is earned through demonstrated prediction accuracy — exactly the "trust through process" philosophy.

---

## 4. The Prediction Feedback Loop — The Killer Feature

This is the architectural element that makes Markets fundamentally different from every competitor. Here's how it works:

### 4.1 The Loop

```
INGEST → ANALYSE → HYPOTHESISE → PREDICT → VALIDATE → LEARN → (repeat)
```

**Step 1: Ingest**
Market data feeds bring in prices, news, events, filings, economic indicators on configured schedules (real-time to daily depending on source and user tier).

**Step 2: Analyse**
The 5-layer intelligence funnel processes the raw data:
- Extract market atoms (facts, signals, insights)
- Update the market knowledge graph (entity relationships, strength changes)
- Run pattern detection (correlations, divergences, cascades)
- Surface actionable intelligence

**Step 3: Hypothesise**
AI consuls collaborate to build market theses. A thesis is a structured object containing:
- **Claim** — what the thesis asserts (e.g., "Nordic bank stocks will outperform EU banking index in Q2 2026")
- **Supporting atoms** — the evidence chain, each with confidence scores
- **Contradicting atoms** — known counterarguments, each with confidence scores
- **Net confidence** — weighted score based on supporting vs. contradicting evidence
- **Time horizon** — when the thesis should be validated
- **Success criteria** — specific, measurable conditions that determine if the thesis was correct
- **Consul contributions** — which consul contributed which perspective (for learning attribution)

**Step 4: Predict**
The thesis generates one or more concrete predictions — time-bounded, measurable claims. Each prediction has:
- Predicted outcome (direction, magnitude, timing)
- Confidence level
- Key assumptions that if violated would invalidate the prediction
- Linked atoms that form the basis

**Step 5: Validate**
When the prediction's time window closes, the system automatically:
- Fetches actual outcome data
- Compares predicted vs. actual
- Scores the prediction (correct, partially correct, incorrect, invalidated by assumption breach)
- Records the full validation with evidence

**Step 6: Learn**
The validation results feed back into the intelligence system:
- **Atom reweighting** — atoms that supported correct predictions get confidence boosts; atoms that supported incorrect predictions get confidence decreases
- **Signal importance ranking** — over time, the system learns which types of signals (earnings surprises, regulatory changes, macro indicators) have the strongest predictive power for which types of claims
- **Consul calibration** — track which consul perspectives were most valuable for which types of predictions. The macro analyst consul might be excellent at 3-month predictions but poor at weekly ones.
- **Correlation mapping** — discover and strengthen/weaken correlations between market events. "When X happens, Y follows within Z days" — these correlation atoms are created, tested, and refined over time.
- **Blind spot detection** — the gap detection pattern detector identifies what the system consistently misses. "The system has never correctly predicted crypto volatility events" → flag as known blind spot.

### 4.2 Why This Is Qualitatively Different

A traditional ML system for market prediction recalibrates numerical weights in a neural network. You know the prediction was wrong, you adjust weights, but you don't know *why* it was wrong in a way that's explainable.

ANTON's system knows why because every prediction is backed by typed atoms with source chains. When a prediction fails, you can trace back: "The thesis relied on Atom #4821 (insight: 'Central bank signalling hawkish pivot') which had confidence 0.82. That atom was extracted from three news articles. But the central bank actually held rates. Now we know: this type of news signal had a false positive rate of 40% — adjust future confidence scoring for this signal type."

This is APCI in action — professional context intelligence, not black-box pattern matching.

### 4.3 The Cold Start Problem — And How to Solve It

Every learning system needs a starting point. Solutions:

1. **Historical backtesting** — Seed the system with 6–12 months of historical market data. Let it build theses retroactively, then validate against known outcomes. This creates an initial corpus of atom confidence calibrations and correlation mappings.

2. **User-seeded intelligence** — Users can manually create market atoms from their own expertise. A financial analyst who knows their sector well can seed the system with high-confidence atoms that bootstrap the learning loop.

3. **Community knowledge packs** — Using the `.anton` package format, market intelligence packs (sector analyses, macro frameworks, correlation maps) can be shared through the marketplace.

---

## 5. Positioning & Disclaimers

### This is a research and intelligence tool, not an investment advisor

This distinction is critical for legal, regulatory, and user trust reasons. ANTON Markets:

- **DOES** aggregate and analyse open market data
- **DOES** identify patterns, correlations, and signals
- **DOES** build and test theses using AI-powered analysis
- **DOES** track prediction accuracy and learn from outcomes
- **DOES** present intelligence that helps users make more informed decisions

- **DOES NOT** provide buy/sell/hold recommendations
- **DOES NOT** execute trades or connect to brokerage accounts
- **DOES NOT** constitute financial advice
- **DOES NOT** guarantee prediction accuracy
- **DOES NOT** replace professional financial judgment

Every screen in the Markets pillar should include a persistent disclaimer: *"ANTON Markets is a research intelligence tool. All analysis is for informational purposes only and does not constitute financial advice. Past prediction accuracy does not guarantee future results. Always consult a qualified financial professional before making investment decisions."*

This aligns with the core ANTON philosophy: **augmentation over replacement**. The human is always the decision-maker.

---

## 6. Where This Sits in the ANTON Ecosystem

### Pillar structure after Markets

| Pillar | Purpose | Audience |
|---|---|---|
| **Work** | Professional expertise across 29+ domains | Professionals, consultants, enterprises |
| **School** | Education for ages 5+ with guardian/teacher infrastructure | Students, teachers, parents |
| **Life** | Personal tools — News, Finance basics, Travel, Community | Everyone |
| **Pathfinder** | Discovery and AI opportunity identification | Organisations, teams |
| **Markets** *(new)* | Self-learning financial intelligence and investigation | Investors, analysts, finance professionals, informed individuals |

### Cross-pillar connections

Markets connects to but stays separate from:

- **Work → Investment & Asset Management area** (4 modules) — Work modules produce professional analysis; Markets provides the intelligence feeds. A portfolio manager uses Work for client deliverables and Markets for market intelligence that informs those deliverables.
- **Work → Banking & Finance area** (10 modules) — Similar relationship. Banking professionals use Markets for market awareness; Work for formal outputs.
- **Life → Finance tab** — Life's Finance tab is about personal finance education (budgeting, saving, understanding investments). Markets is the active intelligence layer for people who want to go deeper.
- **Radar infrastructure** — Market radar sources coexist with regulatory radar sources but are tagged differently and feed into separate atom stores.

### Atom separation (critical)

Markets atoms live in **separate database tables** from Work/School/Life/Pathfinder atoms. This is a hard architectural boundary, not a soft filter. The reasons are explained in Section 3.2 above.

The system maintains two parallel intelligence domains:
- **Professional Intelligence Domain** — atoms from Work, School, Life, Pathfinder sessions
- **Market Intelligence Domain** — atoms from Markets data ingestion and analysis

These domains do NOT cross-pollinate automatically. A user can explicitly reference a professional atom in a market thesis (e.g., "My regulatory expertise tells me AMLR implementation costs will pressure bank margins") — but this is a conscious user action, not an automatic cross-feed.

---

## 7. Summary for Claude Code

When you read the companion spec document, keep these principles in mind:

1. **This is a new pillar, not a feature within an existing pillar.** It gets its own top-level navigation item, its own page structure, its own data domain.

2. **Atom separation is non-negotiable.** Market atoms cannot share tables with professional atoms. Separate tables, separate queries, separate pattern detection runs.

3. **The prediction feedback loop is the core value.** Everything else (data ingestion, visualisation, dashboard) is infrastructure in service of the loop. If a design decision ever conflicts with the loop's integrity, the loop wins.

4. **Extend, never duplicate.** The intelligence funnel architecture, pattern detection engine, radar infrastructure, and knowledge graph concepts should be reused — not rebuilt. The market-specific versions should follow the same patterns but operate on their own data domain.

5. **Investigation-first.** Before implementing anything, audit the existing codebase to understand how the current atom, graph, pattern, and radar systems work. Then extend them for the Markets domain.

6. **Open data first.** Design for free-tier data sources (Alpha Vantage, Finnhub, Marketaux). Premium data connections are future extensions, not launch requirements.

7. **Disclaimer everywhere.** This is a research tool, not financial advice. Every screen must make this clear.

---

*End of overview document. Proceed to `MARKETS_INTELLIGENCE_SPEC.md` for the technical specification.*
