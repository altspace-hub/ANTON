# ANTON — Roadmap to Vision

**Author:** Daniel Bardun & Claude Code
**Date:** March 20, 2026
**Status:** Living document — updated as progress is made
**Purpose:** Maps the current state of ANTON against the full vision, identifies gaps, and provides a phased execution plan

---

## Vision Architecture — The Six Layers

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 6: THE ECONOMY                              0%       │
│  FutureChain payments · Expertise as income · AI salary     │
├─────────────────────────────────────────────────────────────┤
│  LAYER 5: THE MARKETPLACE                           0%       │
│  .anton trading · Rating & discovery · Premium expertise    │
├─────────────────────────────────────────────────────────────┤
│  LAYER 4: COLLABORATIVE INTELLIGENCE                0%       │
│  ANTON-to-ANTON problem solving · AAP protocol              │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3: THE NETWORK                              60%       │
│  Community · Contact hashes · E2E messaging · Trust         │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2.5: TEMPORAL REASONING                    100%       │
│  Goals · Values · Strategy · Cross-horizon reasoning        │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2: INTELLIGENT ANTON                        80%       │
│  Knowledge atoms · Pattern detection · Predictions          │
│  Calibration · Feedback loops · Markets Pillar proof        │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1: INDIVIDUAL ANTON                         95%       │
│  Three pillars · 238 modules · 29 areas · Local-first       │
└─────────────────────────────────────────────────────────────┘
```

---

## Current State — What Exists (March 20, 2026)

### Layer 1: Individual ANTON — 95% Complete
- 3 pillars (Work, School, Life) with full UI
- 29 expert areas, 238+ pre-configured modules
- 7-layer prompt architecture
- Iterative Reasoning Engine (6 thinking levels)
- AI Orchestrator (4-phase trust progression)
- Workflow Engine (12 step types)
- Export system (MD, DOCX, XLSX, PDF, PPTX)
- Script execution (Python, Node.js)
- Multi-LLM support (Claude, OpenAI, Gemini, Mistral, Ollama)
- PostgreSQL database (200+ tables)

### Layer 2: Intelligent ANTON — 80% Complete

#### Markets Pillar (the proof of concept)
| Component | Status | Details |
|---|---|---|
| Data Pipeline | ✅ Done | 18 sources (FMP, RSS), 6,600+ raw items, hourly fetching |
| Knowledge Atoms | ✅ Done | 2,700+ atoms with importance (0-100), entity links, decay |
| Entity Graph | ✅ Done | 340+ entities, 2,200+ atom-entity links, auto-populated |
| Pattern Detection | ⚠️ Partial | 5 detectors exist but not finding patterns (insufficient data) |
| Theses & Predictions | ✅ Done | 16 theses, 29 predictions with horizons + deadlines |
| Conviction Weighting | ✅ Done | Predictions → portfolio weight adjustments |
| Prediction Validation | ✅ Done | Weekly validation, signal calibration, why-chains |
| Backtesting | ✅ Done | Full pipeline runner, benchmark + circuit breaker |
| Fundamental Scoring | ⚠️ Service built, not wired | Income stmt, ratios, key metrics → composite score |
| Conditional Accuracy | ⚠️ Service built, not wired | Feature tracking at prediction time |
| 5 Active Indexes | ✅ Done | US 100, Growth 20, Momentum 10, ESG 20, Sweden 100 |

#### ANTON 100 Success Metrics
| Metric | Target | Current | Status |
|---|---|---|---|
| Prediction accuracy | >55% sustained over 200+ predictions | 51-54% | ⚠️ Below target |
| Calibration score | <0.10 | Not enough data yet | ⚠️ Needs time |
| Signal quality | Top types identified and ranked | Weights at 1.3 | ⚠️ Needs more validation |
| Pattern detector value | 3+ non-obvious patterns | 0 patterns found | ❌ Needs data |
| User learning | Improvement over 3-6 months | Day 2 | ⏳ Needs time |

#### Backtesting Results (validated)
| Backtest | Return | Sharpe | MaxDD | Alpha vs B&H | Predictions |
|---|---|---|---|---|---|
| Tech 5 (4yr, fast) | +144% | 0.99 | 34% | -1% | 432 (55%) |
| Tech 5 (4yr, AI) | +138% | 0.96 | 34% | -8% | 917 (53%) |
| Growth 12 (4yr) | +101% | 0.73 | 41% | — | 1326 (51%) |
| Non-Tech 5 (4yr) | +59% | 0.83 | 16% | — | 381 (51%) |
| ANTON 30 (4yr, benchmark) | +51% | 0.76 | 22% | -19% | — |
| Defensive 10 (4yr) | +35% | 0.61 | 14% | — | 976 (53%) |

**Key finding:** Active management underperforms buy-and-hold for tech-heavy universes but provides meaningful drawdown protection. The circuit breaker reduces max drawdown by ~8%.

### Layer 2.5: Temporal Reasoning — 100% Complete
- Goals profiles (5 time horizons)
- Domain strategies with atom weight multipliers
- Values constraints (hard/soft exclusions, ESG presets)
- Conflict resolution rules (5 types, user-configurable)
- Temporal consequence engine (checks actions against all horizons)
- Values filter + strategy weighting on atoms
- Temporal learning (creates pattern atoms from validated predictions)
- Prompt Layer 4.5 injection in every Claude call
- Orchestrator pre-action gate (blocks values violations)
- Onboarding wizard (5-step guided setup)
- Pending conflicts UI with accept/dismiss workflow
- Timeline visualization on dashboard
- Calibration tracking by horizon
- Watchlist enrichment with values filtering

### Layer 3: The Network — 60% Complete
- ✅ Ed25519 identity system
- ✅ Contact hashes (ANTON-XXXX-XXXX-XXXX-XXXX)
- ✅ Mutual-consent connection protocol
- ✅ E2E encrypted messaging (X25519 DH → AES-256-GCM)
- ✅ Group architecture with roles
- ✅ .anton bundle format (17 types)
- ❌ Structured message types (knowledge_share, bundle_push, task_request)
- ❌ Capability Cards (.anton bundle type)
- ❌ Auto-import policies
- ❌ Encrypted store-and-forward relay

### Layer 4: Collaborative Intelligence — 0% (Spec Written)
- ❌ AAP message format
- ❌ Task lifecycle (submitted → accepted → in_progress → completed)
- ❌ Signed Reasoning Trails (Ed25519 + hash chain)
- ❌ Delegation trust model
- ❌ Interactive clarification flow
- ❌ Multi-part task artifacts
- ❌ Compliance-as-Code delegation rules

### Layer 5: The Marketplace — 0%
- ❌ Service discovery via capability cards
- ❌ Quote-based pricing
- ❌ Quality-linked payment terms
- ❌ Delegation budget controls
- ❌ futurechain.solutions directory

### Layer 6: The Economy — 0%
- ❌ FutureChain light node integration
- ❌ Wallet creation + balance
- ❌ Payment settlement
- ❌ Expertise as tradeable asset
- ❌ AI salary concept

---

## Expert Panel Assessment (March 19, 2026)

Five expert reviewers evaluated the Markets Pillar:

| Expert | Domain | Rating | Key Verdict |
|---|---|---|---|
| Quant Finance | Signal quality | Not Yet | 51-54% accuracy barely above random; no alpha attribution |
| Value Investor | Fundamentals | Not Yet | Processes price noise, not business value; no valuation framework |
| Risk Manager | Risk controls | Not Yet | 34-41% drawdown with no circuit breaker → now fixed (22%) |
| AI/ML Engineer | Production | Almost | Architecture sound; learning doesn't compound |
| Product/UX | User experience | Almost | Values-aligned investing is differentiator; needs onboarding → now built |

### Expert Recommendations (all implemented)
1. ✅ Buy-and-hold benchmark in every backtest
2. ✅ Drawdown circuit breaker (15% → 50% cash, 25% → 80% cash)
3. ✅ Fundamental scoring module (composite quality/valuation score)
4. ✅ Conditional accuracy tracking (accuracy per feature combination)
5. ✅ Onboarding wizard for goals/values

---

## Phased Execution Plan

### Phase A: Complete Layer 2 Proof (Weeks 1-4)
**Goal:** Hit ANTON 100 success metrics. Prove the intelligence loop works.

#### A1: Wire Fundamental Scoring into Live Pipeline
- Connect `market-fundamental-scoring-service.ts` to conviction weighting
- Add fundamental scores as a signal layer in `computePredictionSignalScores()`
- Generate fundamental atoms with 90-day horizons
- In backtests: compute from cached historical fundamentals
- **Expected impact:** Push prediction accuracy toward 55% by adding non-momentum signals

#### A2: Wire Conditional Accuracy into Live Pipeline
- Connect `market-conditional-accuracy-service.ts` to prediction creation + validation
- Capture features at prediction time: regime, sector, signal_type, volatility
- Feed conditional accuracy into signal weight calibration
- **Expected impact:** System learns WHAT works WHERE, not just overall accuracy

#### A3: Activate S&P 100 Universe
- Enable the 3 S&P 100 source batches (100 stocks)
- Download full history for backtesting
- Run comprehensive backtests with benchmark + fundamental scoring
- **Expected impact:** Larger universe reveals sector patterns, improves diversification

#### A4: Fix Pattern Detectors for Market Data
- Wire the 5 pattern detectors to operate on market_atoms (not just knowledge_atoms)
- Expected patterns: temporal correlation (oil+war), entity convergence, cascade detection
- **Expected impact:** Hit the "3+ non-obvious patterns" success metric

#### A5: Build ANTON 100 Showcase Dashboard
- Prediction track record chart (accuracy over time)
- Calibration curve (predicted confidence vs actual accuracy)
- Signal weight evolution chart
- Alpha attribution per strategy
- **Expected impact:** Visual proof that the system learns and improves

#### A6: Process Backlog + Accumulate Data
- Process 2,600+ unprocessed news articles
- Run daily automation (7 phases + hourly fetching)
- Every Saturday: prediction validation + learning
- **Expected impact:** In 4 weeks: ~20-30 validated predictions, meaningful signal weight convergence

### Phase B: Network Foundation (Weeks 5-8)
**Goal:** Prepare Community tab for AAP

#### B1: Structured Message Types
- Extend Community messaging with typed payloads
- Types: `knowledge_share`, `bundle_push`, `bundle_request`, `capability_exchange`
- Use existing E2E encryption for all structured messages
- **Files:** `server/services/community-messaging.ts`, `server/routes/community.ts`

#### B2: Capability Cards
- New `.anton` bundle type: `capability-card`
- Auto-generate from installed modules, quality scores, execution counts
- Exchange on connection establishment
- Privacy controls: per-module opt-in/opt-out of advertising
- **Files:** `server/services/anton-bundler.ts`, new `server/services/capability-card-generator.ts`

#### B3: Auto-Import Policies
- Per-contact settings: "Accept all" / "Ask first" / "Block"
- Per-bundle-type granularity
- UI in contact detail view
- **Files:** `src/pages/community/ContactDetailPage.tsx`, `server/routes/community.ts`

#### B4: Encrypted Store-and-Forward Relay
- Optional self-hostable relay for offline message delivery
- Stores only opaque encrypted blobs
- Open source, runnable on Raspberry Pi
- **Files:** New separate service/package

### Phase C: AAP Layer 1 — Knowledge Sharing (Weeks 9-12)
**Goal:** Two ANTON instances sharing atoms and bundles automatically

#### C1: Knowledge Atom Sharing Protocol
- Share atoms with provenance, confidence, entity links
- Recipient can accept/reject/merge
- Conflict detection when shared atom contradicts local atom
- **Files:** New `server/services/aap-knowledge-sharing.ts`

#### C2: Bundle Push/Pull
- One ANTON pushes a knowledge pack to a contact
- Recipient previews and selectively imports
- Sync indicators showing updated content
- **Files:** Extend `server/services/anton-bundler.ts`, `server/routes/community.ts`

#### C3: Shared Knowledge View
- UI showing what's been exchanged within a connection
- Timeline of shared atoms, bundles, and updates
- **Files:** New `src/pages/community/SharedKnowledgePage.tsx`

### Phase D: AAP Layer 2 — Task Delegation (Weeks 13-20)
**Goal:** One ANTON requests work from another

#### D1: Task Request Message Format
- Structured: task description, required modules, context, deadline
- Orchestrator evaluates: capability match + trust level
- **Files:** New `server/services/aap-task-delegation.ts`

#### D2: Interactive Task Lifecycle
- States: submitted → accepted/declined → in_progress → clarification_needed → partial → completed → disputed
- Progress updates through encrypted channel (extends IRE Revelation Chain)
- Clarification cards for ambiguity resolution
- **Files:** Extend task delegation service + Community messaging

#### D3: Signed Reasoning Trails
- Ed25519 signatures on each trail entry
- Hash chain linking entries (tamper-evident)
- Verification on receipt using sender's public key
- **Files:** Extend `server/services/orchestrator-engine.ts`

#### D4: Delegation Trust Model
- Manual → Suggested → Pre-approved → Autonomous
- Trust earned through performance (Quality Ratchet scores)
- Per-contact, per-capability trust levels
- **Files:** New trust table, extend Orchestrator

#### D5: Multi-Part Task Artifacts
- Task results as structured .anton bundles
- Multiple typed artifacts per task (report + matrix + summary + presentation)
- Import preview before acceptance
- **Files:** Extend anton-bundler.ts

#### D6: Compliance-as-Code for Delegation
- Rules governing what can be delegated and to whom
- "Never share client names externally"
- "Regulatory interpretations require human review before sending"
- **Files:** Extend compliance rules engine

### Phase E: FutureChain + Marketplace (Weeks 21+)
**Goal:** ANTON instances transact

#### E1: FutureChain Light Node Integration
- Pull from `futurechain/anton-light` git branch
- Light node (send/receive only, no mining)
- Wallet manager + KYC/Identity module
- softHSM key management
- **Files:** New `futurechain/` directory, UI components

#### E2: Quote-Based Pricing
- Provider ANTON evaluates task → returns quote (amount, currency, terms)
- Requester approves → payment escrowed → work done → payment released
- Dynamic pricing based on complexity, urgency, capacity
- **Files:** Extend AAP task delegation

#### E3: Quality-Linked Payment Terms
- "Full payment if quality ≥ 8.0, 50% if ≥ 6.0, refund below 6.0"
- Quality Ratchet enforces automatically
- Signed Reasoning Trails as evidence for disputes
- **Files:** Extend payment settlement

#### E4: Delegation Budget Controls
- Monthly spending limits, per-task caps, per-contact budgets
- Auto-approve thresholds
- "My ANTON can spend up to 2,000 SEK/month, max 500 SEK/task"
- **Files:** New budget management service

#### E5: Marketplace Directory
- futurechain.solutions website
- Lists available ANTON services (opt-in only)
- Search by capability, area, quality score
- Not a gatekeeper — a directory
- **Files:** Separate web application

---

## Data Sources & Infrastructure

### Currently Active (18 sources)
| Provider | Sources | Data Types | Fetch Interval |
|---|---|---|---|
| FMP (Starter) | 8 | Prices, news, fundamentals, estimates, calendar | 4-24h |
| RSS | 9 | News (Bloomberg, CNBC, FT, Guardian, Economist, etc.) | 2-6h |
| Quiver Quant | 1 (inactive) | Congress trading | Needs API key |

### Available but Inactive
| Source | What's Needed |
|---|---|
| S&P 100 (3 batches) | Enable in DB, download history |
| EODHD (4 exchanges) | EODHD API key in .env |
| Quiver Quant Congress | Subscription ($10/mo) |
| Alpha Vantage | API key in .env |
| Finnhub | API key in .env |
| Marketaux | API key in .env |

### Desired Future Sources
| Source | Purpose | Priority |
|---|---|---|
| Congress/politician trading | Signal from insider knowledge | High |
| Earnings call transcripts | Fundamental analysis | Medium |
| SEC filings (13F, 10-K) | Institutional ownership changes | Medium |
| Social sentiment (Reddit, X) | Retail sentiment signal | Medium |
| Central bank speeches | Macro policy direction | Low |

---

## Trading Day Schedule (CET, Active)

```
04:00  Materialized view refresh
07:00  Phase 1: Morning Intelligence — fetch, atom decay, extract atoms
13:00  ┐
  :15  │ Hourly market-hours cycle (13:00-23:00):
  :30  │ Prices → News → Event triggers
14:30  Phase 2: Pre-Open Signal Scan
15:45  Phase 3: Market Open Capture (15 min after US open)
18:00  Phase 4: Mid-Day Intelligence — FULL 11-STEP CYCLE
       ├─ Fetch → Extract atoms → Signal scan (web search)
       ├─ 4 AI consuls → Auto thesis + prediction generation
       └─ Prediction rebalance check → Auto-execute if strong
22:15  Phase 5: Market Close — EOD prices, NAV for all indexes
23:00  Phase 6: Post-Market — process remaining, learning
23:30  Last hourly cycle
Sat 10:00  Phase 7: Weekend Deep Dive — prediction validation,
           signal calibration, temporal learning, why-chains
```

---

## Key Architecture Decisions

1. **PostgreSQL only** — no SQLite syntax in any new code
2. **Factory pattern** for all services — `createXxxService(db): Promise<XxxService>`
3. **Parameterized queries** only — never string concatenation in SQL
4. **All `db` calls awaited** — async PostgreSQL adapter requires it
5. **Atoms are the foundation** — everything flows through typed, scored, decaying atoms
6. **Values are HARD constraints** — override all optimisation
7. **Local-first** — data stays on machine, only API calls leave network
8. **The prediction loop is the teacher** — accuracy → calibration → better signals
9. **Finance proves the architecture** — measurable daily feedback validates everything
10. **Each layer independently valuable** — no "half-built" states

---

## Files Reference

### Core Markets Services
| File | Purpose |
|---|---|
| `server/services/market-workflow-orchestrator.ts` | Daily intelligence cycle (11 steps) |
| `server/services/market-backtest-runner.ts` | Historical backtesting with full pipeline |
| `server/services/market-index-rebalance-service.ts` | Conviction weighting + prediction signals |
| `server/services/market-nav-engine.ts` | Daily NAV calculation for all indexes |
| `server/services/market-atom-service.ts` | Atom CRUD, importance, entity linking |
| `server/services/market-data-service.ts` | 7 provider adapters, rate limiting |
| `server/services/market-thesis-service.ts` | Thesis + prediction CRUD |
| `server/services/market-validation-service.ts` | Signal weight calibration |
| `server/services/temporal-reasoning.ts` | Goals, values, strategy, consequences |
| `server/services/market-fundamental-scoring-service.ts` | Composite quality/valuation scores |
| `server/services/market-conditional-accuracy-service.ts` | Feature-conditional accuracy tracking |

### Migrations (049-075)
| Range | Content |
|---|---|
| 049-065 | Markets Pillar core tables |
| 066 | Closed-loop prediction attribution |
| 067 | Backtest infrastructure + historical cache |
| 068 | Expanded universe (S&P 100, sector ETFs) |
| 069 | FMP news sources (correct endpoints) |
| 070 | Importance scoring + entity links |
| 071 | Temporal reasoning (all 5 tables) |
| 072 | Strategic portfolio indexes |
| 073 | Backtest intelligence (theses, signal weights) |
| 074 | Expert recommendations (benchmark, circuit breaker, etc.) |
| 075 | Temporal conflict resolution |

### Key UI Pages
| Page | Purpose |
|---|---|
| `MarketsPage.tsx` | Dashboard with market overview + ANTON portfolios |
| `MarketGoalsProfilePage.tsx` | Goals, values, strategy management |
| `MarketOnboardingPage.tsx` | 5-step setup wizard |
| `MarketBacktestsPage.tsx` | Backtesting "time machine" |
| `MarketIndexesPage.tsx` | Portfolio index listing |
| `MarketIndexDetailPage.tsx` | Individual index with holdings, NAV, attribution |
| `MarketPredictionsPage.tsx` | Predictions + track record + calibration |
| `MarketThesesPage.tsx` | Investment theses listing |

---

## Success Criteria by Phase

### Phase A (Layer 2 proof): 4 weeks
- [ ] Prediction accuracy sustained >55% over 100+ predictions
- [ ] 3+ non-obvious patterns detected by pattern detectors
- [ ] Signal weights differentiated (not all at ~1.3)
- [ ] Fundamental scoring integrated into live conviction weighting
- [ ] Conditional accuracy showing which signal types work best
- [ ] ANTON 100 showcase dashboard with visual track record

### Phase B (Network foundation): 4 weeks
- [ ] Structured messages sent between two ANTON instances
- [ ] Capability cards auto-generated and exchanged
- [ ] Auto-import policies configurable per contact
- [ ] Store-and-forward relay operational

### Phase C (Knowledge sharing): 4 weeks
- [ ] Knowledge atoms shared between instances with provenance
- [ ] Bundle push/pull working through encrypted channel
- [ ] Shared Knowledge view showing exchange history

### Phase D (Task delegation): 8 weeks
- [ ] Task request → acceptance → execution → delivery working
- [ ] Signed Reasoning Trails with Ed25519 signatures
- [ ] Delegation trust model with 4 levels
- [ ] Interactive clarification flow operational

### Phase E (Marketplace): Ongoing
- [ ] FutureChain light node integrated
- [ ] First paid task completed between two ANTONs
- [ ] Quality-linked payment terms enforced
- [ ] Delegation budget controls operational

---

*"The prompt IS the product. The atom IS the signal. The network IS the economy."*

— Daniel Bardun, FutureChain AB
