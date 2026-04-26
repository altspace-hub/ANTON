# ANTON — Current State Brief

**Document type:** Claude Code briefing + investigation protocol
**Authored by:** Claude (strategic thinking partner) for Daniel Bardun
**Date:** 21 April 2026
**Purpose:** Establish an accurate, current picture of what ANTON is today before any new architectural work (Portals, Pathfinder, Marketplace-as-portal, Recruitment/Candidate portals) is scoped.

---

## 0. How This Document Is Structured

This is not a spec for building something new. It is a **ground-truth alignment document**.

- **Part A** is Claude's best current picture of ANTON, synthesised from the project knowledge whitepapers (v2 / v3) plus the architectural decisions in memory (v0.5.0 → v0.6.0 build batch). Claude has NOT seen the live codebase.
- **Part B** is the investigation protocol for Claude Code — a structured codebase audit that validates Part A, flags deltas, and fills in gaps (especially the v0.5.0 / v0.6.0 work that the whitepapers predate).
- **Part C** defines the output Claude Code should produce when done: a single `ANTON_CURRENT_STATE_v1.md` file that becomes the authoritative reference for all downstream strategic work.

Read Part A first. Run Part B as an audit. Produce Part C.

---

# PART A — Claude's Current Picture of ANTON

*Everything in Part A is stated as what Claude believes to be true. Part B tests this against the actual code. Treat anything here that is not confirmed by the audit as provisional.*

## A.1 Identity & Versioning

- **Product:** ANTON (the flagship platform) under the openEXPERT foundation.
- **Company:** FutureChain AB. Creator: Daniel Bardun.
- **Whitepaper versions on record:** v2.0 (openEXPERT_Whitepaper_v2_MASTER, Feb 19 2026) and v3.0 (ANTON_Whitepaper_v3_*, Feb 23 2026).
- **Code version in memory:** v0.5.0 with current build batch targeting v0.6.0.
- **Licence:** Memory says Apache 2.0 (confirmed, not MIT). Whitepapers v2 and v3 still say "MIT." **One of these is wrong — Claude Code must verify from the actual LICENSE file in the repo.**
- **Repository:** `altspace-hub/ANTON` on GitHub (from memory).
- **Branch protection:** Rulesets, with `DB_Main_Rule` mentioned in memory.
- **Semver:** Unclear whether v0.5.0 and v3.0 refer to the same thing or the whitepaper version is independent of the code version. **Claude Code to reconcile.**

## A.2 Three Pillars (from memory; not yet in whitepapers)

Top-level product navigation is organised around three pillars:

| Pillar | Purpose | Status per memory |
|---|---|---|
| **Work** | Professional expertise, 29 areas, 238+ modules, original focus | Built; primary surface today |
| **School** | Education ages 5+, guardian/teacher infrastructure, voice-first for young learners | In progress as part of v0.6.0 batch |
| **Life** | News, Finance, Travel, Community tabs | In progress |

Additional pillars flagged in memory for future: **Procure, Civic, Grow**. These are top-level nav, not sub-modules.

**Verification:** Claude Code to confirm whether Work/School/Life are currently wired as top-level nav in the client, or whether this is still planned.

## A.3 The 29 Areas and 238 Modules (Work pillar)

Per v3.0 whitepaper:

| # | Area ID | Name | Modules |
|---|---|---|---|
| 1 | fcp | Financial Crime Prevention | 23 |
| 2 | legal | Legal & Regulatory | 12 |
| 3 | audit | Audit & Assurance | 12 |
| 4 | consulting | Client Consulting | 5 |
| 5 | banking | Banking & Finance | 10 |
| 6 | risk | Risk Management | 8 |
| 7 | data-analytics | Data & Analytics | 8 |
| 8 | esg | ESG & Sustainability | 11 |
| 9 | cyber | Cybersecurity | 5 |
| 10 | investment | Investment & Asset Mgmt | 4 |
| 11 | project-mgmt | Project Management | 12 |
| 12 | strategy | Strategy & Planning | 6 |
| 13 | ops | Operations & Process | 8 |
| 14 | hr | HR & People | 6 |
| 15 | software-eng | Software Engineering | 6 |
| 16 | accounting | Accounting & Finance | 7 |
| 17 | insurance | Insurance & Actuarial | 5 |
| 18 | comms-pr | Communication & PR | 5 |
| 19 | startups | Startups & Entrepreneurship | 7 |
| 20 | academic | Academic Research | 6 |
| 21 | personal-dev | Personal Development | 6 |
| 22 | branding | Branding & Creative | 5 |
| 23 | education | Education & Teaching | 5 |
| 24 | healthcare | Healthcare & Life Sciences | 5 |
| 25 | manufacturing | Manufacturing & Operations | 5 |
| 26 | consumer-legal | Consumer Legal | 5 |
| 27 | procurement | Procurement & Supply Chain | 5 |
| 28 | real-estate | Real Estate & Property | 4 |
| 29 | nonprofit | Nonprofit & Social Impact | 4 |

**Known correction noted in WHITEPAPER_CORRECTIONS_NEEDED.md:** The codebase may actually contain **41 areas** (not 29). Areas 30–41 are undocumented in the whitepaper. **Claude Code must produce the definitive list from `src/lib/constants.ts` (or equivalent).**

## A.4 The Seven-Layer Prompt Builder

Core assembly used for every module execution:

1. **System Foundation** — `server/areas/system-foundation.md` — baseline behaviour
2. **Area Context** — `server/areas/{area-id}/area-context.md` — domain background
3. **Module Expertise** — `server/areas/{area-id}/modules/{module-id}/system-prompt.md` — task methodology
4. **Persona Injection** (optional) — from the persona library
5. **Skills Attachment** (optional) — from the skills library (50+ frameworks per whitepaper)
6. **Knowledge Source Integration** — from the 4-mode resolver
7. **Transparency & Reasoning** — thinking level, creativity, reasoning trace config

**Implementation:** `server/services/prompt-builder.ts` (single orchestrator).

## A.5 Knowledge Source System — 4 Modes

| Mode | What | Services |
|---|---|---|
| 1 | AI knowledge + Web Search | LLM tool use |
| 2 | Online Reference Links (URL fetch) | `knowledge-source.ts` |
| 3 | Local Folder Integration (PDF, DOCX, XLSX, TXT, MD) | `folder-indexer.ts`, `file-processor.ts` |
| 4 | Combined (all sources simultaneously, with priority settings) | `knowledge-source.ts` |

**v3.0 extension:** External Data Integration framework adds PostgreSQL, MySQL, MSSQL, MongoDB, REST APIs, and MCP as knowledge sources (see A.10).

**Token management:** 180k limit enforced pre-flight; warnings at 150k; auto-summarise when tight.

## A.6 Multi-LLM Architecture

Per v3.0 whitepaper and memory, the provider set is:

| Provider | Models | Notes |
|---|---|---|
| **Anthropic Claude** (primary) | Opus 4.6, Sonnet 4.6, Sonnet 4.5, Haiku 4.5 | 1M context window per memory; compaction via `compact-2026-01-12` beta header; IRE depth raised to 25 iterations |
| **OpenAI GPT** | GPT-4, GPT-4 Turbo, GPT-3.5 Turbo | Seed param for reproducibility |
| **Google Gemini** | Gemini 2.0 Flash | Low-cost, high-volume |
| **Mistral** (direct) | Mistral Large 2411 | EU data residency; direct connection only — Azure-hosted Mistral is out of scope per memory |
| **Azure OpenAI** (new) | GPT-4o, o3, o4-mini | Separate provider identity `azure_openai` added per memory; Anthropic SDK min v0.78.0 |
| **Local Ollama** | Any Ollama-compatible model | Air-gapped deployment; $0 API costs |
| **MCP** (as client AND server) | — | Bidirectional Model Context Protocol integration |

**Key files:** `server/services/unified-llm-client.ts`, `model-adapter.ts`, `adapters/*.ts`.

**Prompt caching:** Claude-only; 90% cost reduction on repeated context.

## A.7 The Fourteen Transformative Features

Per IMPLEMENTATION_CHECKLIST.md (Feb 19 2026), all 14 are marked fully implemented with one partial. Claude Code to verify status has held and not regressed.

| # | Feature | Status (as of checklist) | Key tables / services |
|---|---|---|---|
| 1 | Institutional Memory Engine | ✅ Full | `checkpoint_decisions`, `institutional-memory.ts` |
| 2 | Apprentice Model (4 stages) | ✅ Full | `apprentice_profiles`, `apprentice.ts` |
| 3 | What-If Simulator | ⚠️ Partial | workflow branching works; scenario UI pending |
| 4 | Cross-Workflow Intelligence (5-layer funnel) | ✅ Full | `pattern-detection.ts`, `knowledge-graph.ts` |
| 5 | Explain-It-Different Layer (8 audiences) | ✅ Full | `BriefMePage`, `GuideMePage`, `ChallengeThisPage`, `DualInterpretationPage`, `SoundingBoardPage` |
| 6 | Quality Ratchet (6-dimensional) | ✅ Full | `quality_scores`, `quality-ratchet.ts` |
| 7 | Time Intelligence | ✅ Full | `deadlines`, `time-intelligence.ts` |
| 8 | Compliance-as-Code (8 seeded rules) | ✅ Full | `compliance_rules`, `compliance-rules.ts` |
| 9 | Collaborative Canvas | ✅ Full | `canvas_comments`, `collaborative-canvas.ts` |
| 10 | Living Regulatory Radar (5 default sources) | ✅ Full | `radar_items`, `regulatory-radar.ts` |
| 11 | Personal Development Tracker | ✅ Full | Integrated with Apprentice Model |
| 12 | Regulation-to-Implementation Accelerator | ✅ Full | Cross-module workflow |
| 13 | Output Versioning & Diff Engine | ✅ Full | `versions`, `version-diff.ts` |
| 14 | Natural Language Command Interface | ✅ Service-level | `command-parser.ts`; UI partial |

### Quality Ratchet — six dimensions
Completeness, Accuracy, Structure, Actionability, Citations, Overall (weighted composite). Per-module baselines with alerts on `below_baseline`, `significant_drop`, `persistent_low`, `improvement`.

### Apprentice Model — four stages
Observer → Guided (3 sessions) → Supervised (8 sessions) → Autonomous (20 sessions). Quality gates: 7.0 for Guided, 8.0 for Supervised.

### Pattern Detection — five detector types
Temporal Correlation, Entity Convergence, Cascade, Trend Divergence, Gap Detection. Severity: critical / warning / info / positive.

### Knowledge Graph — 11 entity types, 10 relationship types
Entities: client, regulation, control, risk, person, system, product, geography, organization, process, document.
Relationships: mentioned_with, precedes, caused, requires, contradicts, supports, implements, reports_to, owns, part_of.

### Regulatory Radar — 5 default sources
EBA (RSS), ESMA News (scrape), FATF Publications (scrape), EU AML/CFT via EUR-Lex API, ECB Banking Supervision (RSS).

### Compliance-as-Code — 8 seeded rules
TOKEN_LIMIT_001, OUTPUT_QUALITY_001, MODEL_WHITELIST_001, CITATION_REQ_001, TRANSPARENCY_001, DATA_SOURCE_001, REVIEW_CYCLE_001, SESSION_LENGTH_001.

## A.8 Interaction Modes (7)

All production per v3.0:

1. Standard Module Workspace
2. Brief Me — quick questions (`BriefMePage.tsx`)
3. Guide Me — 3-step wizard (`GuideMePage.tsx`)
4. Batch Create — CSV upload with variable substitution (`BatchCreatePage.tsx`)
5. Workflow Builder — 12 step types, CRON scheduling (`WorkflowBuilder.tsx`)
6. Collaborative Canvas — multi-user shared workspace (`SoundingBoardPage.tsx`)
7. Review Engine — 5 review modes: Devil's Advocate, Systems Thinking, Pragmatist, Optimist, Technical (`ReviewEnginePage.tsx`)

## A.9 Coding Area (v3.0 — four tiers)

Per `CODING_AREA_SPEC.md` and v3 whitepaper Part 7. **Build status unclear from project knowledge — Claude Code must check.**

| Tier | Name | Who | Core |
|---|---|---|---|
| 1 | Code Review & Explain | Product owners, CISOs, compliance | 3 explanation levels × multiple review lenses (dev, product, security, compliance) |
| 2 | Script Lite | Analysts, consultants | Python data scripts with guided brief → sandbox preview |
| 3 | Script Medium | Non-dev professionals | React / HTML / Python apps with iframe preview |
| 4 | Coding Large | Full delivery teams | Discovery → Architecture → Release Plan → Tasks → Tests, with expert panel review and goal-alignment checks |

**AI Code Instruction Builder** sits alongside — generates `.md` instruction files for Claude Code / Codex / Mistral Code.

**Project storage:** `~/coding/large/[project-name]/` with README, DISCOVERY, ARCHITECTURE, RELEASES, TASKS, TESTS, reviews/, src/.

## A.10 External Data Integration (v3.0)

Six connection types: PostgreSQL, MySQL, MSSQL, MongoDB, REST APIs, MCP.

- Encrypted credentials at rest
- Parameterised queries only
- Read-only default; write requires explicit admin elevation
- Every access logged to `connection_audit_log`
- Connection pooling for multi-user

Framework: `connection-manager.ts` + per-type adapters.

## A.11 Discovery Mode (v3.0)

Two formats:

- **Paper Workshop** — facilitator package (pre-read, guide, templates, post-processing synthesis)
- **Digital Guided Conversation** — adaptive questioning with structured output feeding downstream modules

Output = structured discovery document that becomes the anchor for subsequent analysis (gap analyses, roadmaps, action plans).

## A.12 The .anton Format — 17 Bundle Types

Open interchange standard. ZIP archive, JSON + Markdown only, **no executable code**. Apache 2.0 / CC BY 4.0 spec.

**Core Content (4):** module, skill, persona, workflow.

**Professional Standards (4):** compliance-ruleset, quality-baseline, review-panel, audience-profile.

**Compound Packages (5):** skill-pack, output-chain, radar-config, brand-template, project-template.

**Coding Area (4):** code-review-profile, script-template, application-template, coding-blueprint.

Total = 17. Services: `anton-bundler.ts`, `antonImport.ts`, `antonExport.ts`, `anton-importer.ts`.

**For Portals strategic work:** this is the file that will grow a `portal-manifest` as bundle type #18.

## A.13 Export Formats (5)

Markdown, DOCX, XLSX, PDF, PPTX (via pptxgenjs pipeline with AI content + QA loop).

**Memory flags an expansion in flight:** Output Format Expansion spec (Path C → B → A). Swedish SIE accounting format identified as near-term market differentiator. **Claude Code to check whether the expansion has landed in v0.5.0 or is still pending.**

## A.14 Database — 82 Tables, 16 Groups

Per `schema_enhanced.sql`:

| # | Group | Tables |
|---|---|---|
| 1 | Core Session & User Management | 13 |
| 2 | Authentication & RBAC | 5 |
| 3 | Security & Audit | 4 |
| 4 | Institutional Memory | 4 |
| 5 | Cross-Workflow Intelligence (Knowledge Atoms) | 4 |
| 6 | Knowledge Graph | 5 |
| 7 | Pattern Detection | 5 |
| 8 | Quality Ratchet | 4 |
| 9 | Apprentice Model | 4 |
| 10 | Time Intelligence | 4 |
| 11 | Regulatory Radar | 5 |
| 12 | Compliance-as-Code | 4 |
| 13 | Workflow Automation | 4 |
| 14 | Output Versioning | 2 |
| 15 | Collaborative Canvas | 4 |
| 16 | Budget & Cost Management | 3 |

Plus additional tables for connections, scripts, RAG, knowledge collections, brand templates, workflow schedules, user profiles. **Total ≈ 82 per whitepaper; Claude Code to produce the authoritative count.**

**Engine:** SQLite with WAL mode. **PostgreSQL migration pending** (on roadmap per memory; required before vector indexing for Pathfinder).

## A.15 Services / Routes / Pages

Per whitepaper v3.0:
- **Services:** 53 in `server/services/`
- **Route files:** 41 in `server/routes/` with ~224 HTTP endpoints
- **Pages:** 36 in `src/pages/`
- **Components:** 158 in `src/components/`

**Claude Code to produce fresh counts — these are likely higher now with v0.5.0 additions.**

## A.16 Security & RBAC

- **Roles:** admin, analyst, user (3 roles, 24 permissions across 7 resource types)
- **Auth:** JWT + bcrypt (cost factor 12); OAuth (Google, GitHub); enterprise SSO (SAML, OIDC) planned
- **Brute force:** 5 failed attempts in 15 min → 30 min lockout (`login_attempts` table)
- **OWASP Top 10:** full coverage per Part 10 of v3 whitepaper
- **SSRF:** private IP blocking, redirect chain validation
- **Audit log:** every action, configurable retention (default 2y), CSV/XLSX export

## A.17 Five Deployment Models

1. **Local Desktop** — individual consultant
2. **Docker on shared machine** — 2-5 users
3. **Server** — 10-50 users
4. **Cloud** (AWS / Azure / GCP) — 100+ users
5. **Air-Gapped** (Ollama + local folder only) — government / defence / classified

---

# PART A.18 — v0.5.0 → v0.6.0 Build Batch (from memory, NOT in whitepapers)

This section is **entirely from memory**. The whitepapers predate it. Claude Code needs to confirm which of these have landed in the repo and which are still in spec form.

### In-flight items in the v0.6.0 batch

| Item | Description | Spec status |
|---|---|---|
| **ANTON Missions** | Autonomous agent mode ("set it and forget it"). Mission lifecycle, task graph decomposition, autonomy levels, resource budgeting. Multi-model (Anthropic + Mistral + Ollama). Action Layer (API/webhooks + Playwright + MCP). Service Packs (pre-built knowledge of 182 services across 16 categories). LLM-guided Playwright as fallback with auto-healing. | Spec complete, ready for Claude Code per memory |
| **Output Format Expansion** | Beyond MD/DOCX/XLSX/PDF/PPTX into sector-specific + standards-compliant formats. Three-path architecture: Path C (post-hoc transforms, Phase 1), Path B (sector-aware core modules, Phase 2), Path A (format-native modules, Phase 3). Swedish SIE accounting format = near-term differentiator. | Spec complete |
| **The Beehive** | Multi-ANTON group deliberation via AAP. Multiple ANTON instances owned by different people forming persistent collaborative reasoning sessions. Signed attribution, knowledge boundary controls, `.anton` collaborative bundles. Core Layer 4 (Collaborative Intelligence) expression. | Spec complete |
| **Talent Discovery & Recruitment module** | Discovery-driven hiring. 3 job ad variants, dual-model bias auditor, EU AI Act Annex III compliance, EU Pay Transparency Directive alignment, internal mobility layer with opt-out aspiration profiles. `.anton` career-profile bundle type. | 4 spec documents produced |
| **ANTON Missions hype layer** | Autonomous business use cases for AI influencer positioning: Content Factory, Outbound Sales Machine, E-Commerce Autopilot, Financial Analyst, AI Agency, Property Manager, Trend Scout. | Positioning layer |
| **AAP (ANTON Agent Protocol)** | P2P, non-negotiable. No centralised registries. Ed25519 / X25519. FutureChain sole payment rail. | Specified in memory; wire format not drafted per prior session |
| **Companion App Gateway** | PWA-first then Capacitor-wrapping. WebSocket over HTTPS + mDNS/LAN. `identity.ts` shared across App Gateway and AAP. | In build |
| **Portals** | Newly built per Daniel's message of 21 April 2026. Unified public surface that will absorb Beehive, Marketplace, and Recruitment/Candidate as portal types. | Built but not yet specified in a single doc — this is the trigger for the current alignment exercise |
| **Pathfinder** | Manifest-first discovery layer over portals. Uses `.anton/portal.json` + AAP attestations. Not yet designed in detail. | Named; architecture pending |

### Architectural decisions confirmed in v0.6.0 batch

- Multi-model: Anthropic primary, Mistral for EU data residency, Ollama for air-gapped
- AAP is the only cross-ANTON protocol; FutureChain the only payment rail
- Claude 1M context enabled (Opus 4.6 + Sonnet 4.6); IRE depth raised to 25 iterations
- Apache 2.0 confirmed (supersedes MIT in older docs)
- Azure OpenAI added as separate provider identity

### Post-v0.6.0 roadmap (from memory, not yet scoped)

- Mistral partnership outreach (Gianna Maria Lengyel / Head of BD)
- Whitepaper Part 4
- PostgreSQL migration (recommended before Markets branch build)
- Markets pillar (8-document spec package, 32 new tables, ANTON Indexes, quant-inspired prediction + feedback loop)
- Procure, Civic, Grow pillars as top-level nav
- Grow includes standalone CRM + Intelligence Overlay + Hybrid modes (Salesforce, HubSpot, Dynamics, Pipedrive connectors)
- Connected Enterprise Planning layer
- Roaring + Dow Jones demonstration integrations
- School Mode pilot + NGO/humanitarian deployment
- Native app distribution: iOS, Android, Windows, Chromebook via Capacitor
- Slack/Teams integration
- Atom curation UI

---

# PART B — Investigation Protocol for Claude Code

Claude Code should treat this as a **strict audit sequence**. The goal is not to build anything. The goal is to produce an accurate state-of-the-system document.

## B.1 Ground rules

1. **No new code.** This is a read-only audit.
2. **No "it's probably like this."** If the audit can't confirm something, the output document must say `UNCONFIRMED` beside it.
3. **Correct Part A where it's wrong.** If A.3 says 29 areas and the code has 41, the output says 41 and lists them.
4. **Flag deltas between whitepaper docs, memory, and actual code.** Each delta is useful — it shows where the platform has evolved beyond its documentation.
5. **Cite the file.** Every fact in the output must be backed by a specific file path and line range.

## B.2 Step 1 — Repository & licence

```bash
# Repo state
pwd
git remote -v
git log --oneline -20
git branch --show-current
cat package.json | grep -E '"name"|"version"|"license"'
cat LICENSE 2>/dev/null | head -20
cat CLAUDE.md 2>/dev/null | head -100
cat README.md | head -100
```

**Report:** current version in `package.json`, licence file contents, branch, last 20 commits with dates and messages.

## B.3 Step 2 — Top-level navigation and pillar structure

```bash
# Navigation structure
find src -name "App.tsx" -o -name "Router*" -o -name "Navigation*" | head -20
grep -rn "Work\|School\|Life\|Procure\|Civic\|Grow" src/ --include="*.tsx" --include="*.ts" | grep -i "pillar\|nav\|route" | head -30

# Actual routes registered
grep -rn "Route\|path=" src/App.tsx src/Router*.tsx 2>/dev/null | head -50
```

**Report:** current top-level navigation structure. Which pillars are live? Which are placeholders? Which are still in Work-only mode?

## B.4 Step 3 — Areas and modules (the definitive count)

```bash
# Find the authoritative source of areas and modules
find src/lib -name "constants.ts" -o -name "areas.ts" -o -name "modules.ts"
grep -c "id: '" src/lib/constants.ts 2>/dev/null

# Alternative: per-area folders
find server/areas -maxdepth 1 -type d | sort
find server/areas -name "system-prompt.md" | wc -l
find server/areas -name "system-prompt.md" | sed 's|.*/areas/||' | sort
```

**Report:**
- Total number of areas (with full list: id, name, module count)
- Total number of modules
- Any areas listed in code but not in whitepaper (the expected 12 missing)
- Any modules listed in code but not in whitepaper

## B.5 Step 4 — Database schema (authoritative count)

```bash
# Find schema
find server/db -name "*.sql"
grep -c "CREATE TABLE" server/db/schema*.sql 2>/dev/null

# List all tables
grep "CREATE TABLE" server/db/schema*.sql | sed 's/CREATE TABLE[^a-z_]*//' | sed 's/[ (].*//' | sort

# Check for migrations beyond the enhanced schema
find server/db/migrations -type f 2>/dev/null
```

**Report:** table count, grouped listing of all tables, any migrations beyond `schema_enhanced.sql`, PostgreSQL adapter presence or absence.

## B.6 Step 5 — Services, routes, pages, components

```bash
# Counts
find server/services -name "*.ts" | wc -l
find server/routes -name "*.ts" | wc -l
find src/pages -name "*.tsx" | wc -l
find src/components -name "*.tsx" | wc -l

# Lists
find server/services -name "*.ts" | sort
find server/routes -name "*.ts" | sort
find src/pages -name "*.tsx" | sort
```

**Report:** fresh counts for all four categories. Full file lists in appendix of the output doc.

## B.7 Step 6 — LLM providers

```bash
# Adapter presence
find server/services/adapters -type f 2>/dev/null
find server -name "*mistral*" -o -name "*azure*" -o -name "*gemini*" -o -name "*ollama*" -o -name "*claude*" -o -name "*openai*" | head -30

# SDK versions
cat package.json | grep -E "anthropic|openai|mistral|google|ollama"

# Beta headers for 1M context / compaction
grep -rn "compact-2026-01-12\|context-1m\|1m-context" server/ --include="*.ts" | head -10
```

**Report:** which providers have working adapters, SDK versions, whether 1M context / compaction beta is wired, Azure OpenAI identity present or absent.

## B.8 Step 7 — .anton format and bundle types

```bash
# Bundler
view server/services/anton-bundler.ts
view server/services/antonImport.ts
view server/services/antonExport.ts
grep -n "bundle_type\|BundleType\|type:" server/services/anton-bundler.ts | head -40

# Confirm the 17 types
grep -rn "'module'\|'skill'\|'persona'\|'workflow'\|'compliance-ruleset'\|'quality-baseline'\|'review-panel'\|'audience-profile'\|'skill-pack'\|'output-chain'\|'radar-config'\|'brand-template'\|'project-template'\|'coding-review-profile'\|'script-template'\|'application-template'\|'coding-blueprint'" server/services/anton-bundler.ts
```

**Report:** confirmed list of bundle types in code. Any additional types beyond the 17 named in A.12. Any types named in A.12 that are not yet in code.

## B.9 Step 8 — v0.6.0 batch features (what's actually built)

### Missions
```bash
find . -iname "*mission*" -type f | grep -v node_modules | head -30
grep -rn "ANTON Mission\|mission_" server/ src/ --include="*.ts" --include="*.tsx" | head -20
```

### Beehive
```bash
find . -iname "*beehive*" -type f | grep -v node_modules | head -20
grep -rn "beehive\|Beehive" server/ src/ --include="*.ts" --include="*.tsx" | head -20
```

### AAP
```bash
find . -iname "*aap*" -type f | grep -v node_modules | head -20
grep -rn "ANTON Agent Protocol\|aap_\|AAP" server/ src/ | head -20
```

### Talent Discovery / Recruitment
```bash
find . -iname "*talent*" -o -iname "*recruit*" -o -iname "*career*" | grep -v node_modules | head -20
grep -rn "aspiration\|career-profile\|bias-audit" server/ src/ | head -20
```

### Portals
```bash
find . -iname "*portal*" -type f | grep -v node_modules | head -20
grep -rn "Portal\|portal_manifest\|portal.json" server/ src/ --include="*.ts" --include="*.tsx" | head -20
```

### Pathfinder
```bash
grep -rn "Pathfinder\|pathfinder" . --include="*.ts" --include="*.tsx" --include="*.md" | head -20
```

### Companion App Gateway / identity
```bash
find server -name "identity.ts"
grep -rn "Ed25519\|X25519\|companion-app\|app-gateway" server/ | head -20
```

### School / Life pillars
```bash
find src -iname "*school*" -o -iname "*guardian*" -o -iname "*teacher*"
find src -iname "*news*" -o -iname "*finance-tab*" -o -iname "*travel*" -o -iname "*community*"
```

**Report (one section per feature):**
- Fully built and wired? Partial? Spec-only? Not started?
- File paths for whatever exists
- Key tables, services, routes, pages
- Anything the memory said should be there but isn't

## B.10 Step 9 — Known divergences to resolve

Claude Code must explicitly answer each of these:

1. **Licence:** Is the LICENSE file Apache 2.0 or MIT?
2. **Area count:** Is it 29 or 41 (or something else)?
3. **Module count:** Is it 238, 240, or something else?
4. **Whitepaper version vs code version:** Is there a single `VERSION` file? What does it say?
5. **Pillars live in nav:** Is the three-pillar nav (Work/School/Life) wired, or is the app still single-pillar?
6. **PostgreSQL:** Has the migration started? Is there a pg adapter? Is pgvector present?
7. **1M context:** Is the compaction beta header wired into the Anthropic client?
8. **Output format expansion:** Has SIE or any sector-specific format landed?
9. **Companion App Gateway:** Is the PWA shell present? Capacitor config? WebSocket server?
10. **GitHub repo name:** Confirm `altspace-hub/ANTON` from `git remote -v`.

## B.11 Step 10 — Cross-reference with project files

Several project-knowledge files reference implementation status. Claude Code should check:

- `IMPLEMENTATION_CHECKLIST.md` (Feb 19 2026) — mark each item as still true / now obsolete / missing
- `INTEGRATION_COMPLETE_SUMMARY.md` (Feb 20 2026) — same check
- `WHITEPAPER_CORRECTIONS_NEEDED.md` — were these corrections applied? (Especially the 29 → 41 area correction)
- `CODING_AREA_SPEC.md` — how much of the 4-tier spec actually landed?
- `WHITEPAPER_ANTON_FORMAT_INSERT.md` — are all 17 bundle types in code?

---

# PART C — Expected Output from Claude Code

Claude Code produces a single file:

**Path:** `ANTON_CURRENT_STATE_v1.md`
**Location:** project root (or `/docs/` if that's the convention)

## C.1 Required structure

```markdown
# ANTON — Authoritative Current State

**Generated:** [date]
**Generated by:** Claude Code
**Repo commit:** [sha]
**Repo version:** [from package.json]

## 1. Repository Identity
- Repo, branch, licence, last commit date
- Version number and any VERSION file content
- Brief changelog summary of last 20 commits

## 2. Top-Level Structure
- Directory tree, 2 levels deep, annotated
- Which pillars are wired in nav
- Entry points for each pillar

## 3. Areas & Modules (Definitive)
- Total area count
- Total module count
- Full list: id, name, module count, status
- Any areas beyond the 29 documented in whitepapers

## 4. Seven-Layer Prompt Builder
- Confirmation of each layer's implementation
- Current persona library count
- Current skills library count
- Key files and line ranges

## 5. Knowledge Sources
- Status of each of 4 modes
- External Data Integration: which of 6 source types confirmed working
- MCP client + server status

## 6. LLM Providers
- Confirmed-working provider list
- SDK versions
- Models supported per provider
- 1M context / compaction wiring

## 7. Transformative Features (14)
- Per-feature status: ✅ / 🟢 / 🟡 / ❌
- Any regression from the Feb 19 checklist

## 8. Interaction Modes (7)
- Per-mode page + route confirmation

## 9. Coding Area (4 tiers)
- Per-tier build status
- Expert panel review workflow status
- AI Code Instruction Builder status

## 10. .anton Format
- Confirmed bundle types in code
- Any beyond the documented 17
- Any documented types not yet in code

## 11. Export Formats
- 5 core confirmed
- SIE and other sector-specific: landed or pending

## 12. Database
- Authoritative table count
- All tables listed by group
- PostgreSQL migration status
- pgvector status

## 13. Services, Routes, Pages, Components
- Fresh counts
- Notable additions since Feb 2026 whitepaper

## 14. Security & RBAC
- Confirmed roles, permissions, auth mechanisms
- Any additions (Ed25519 identity etc.)

## 15. Deployment Models
- Which are documented and which have tooling in repo

## 16. v0.6.0 Batch Features (Current Build)
For each of: Missions, Beehive, AAP, Talent Discovery/Recruitment, Portals, Pathfinder, Companion App Gateway, School pillar, Life pillar, Output Format Expansion
- Status: ✅ Wired / 🟢 Partial / 📋 Spec-only / ❌ Not started
- Key files where it exists
- What's missing

## 17. Divergences & Corrections
- Full resolution of the 10 questions from Part B.10
- Any whitepaper claims that are now wrong
- Any memory items that are already built (so strategic planning can stop treating them as future)

## 18. Dependencies & Infrastructure
- `package.json` notable dependencies
- `pnpm-lock.yaml` presence
- Any Docker / Capacitor / deployment configs

## 19. Top-Level Unknowns
- Anything Claude Code could not determine from the audit
- Areas where Daniel or another person needs to answer directly

## Appendix A: Full file trees
## Appendix B: Full module list
## Appendix C: Full table list
## Appendix D: Full service list
```

## C.2 Tone and voice

- **Precise.** No "probably" without flagging it.
- **Concise.** Each section should be scannable. Long lists go in the appendix.
- **Honest about gaps.** Missing features are listed as missing, not glossed.
- **File-path citations.** Every non-trivial claim has a `server/services/xxx.ts:123` style citation.
- **No marketing voice.** This is an engineering document.

## C.3 After delivery

Once the file exists, Daniel will read it end-to-end and Claude (the strategic partner, this assistant) will re-baseline the Portals / Pathfinder / Marketplace / Recruitment strategy work against it. The previous spec (`ANTON_Portals_Pathfinder_Spec_v0.1.md`) was drafted before this audit and will need adjustment in light of what's actually built.

---

## Closing Note

Daniel's instinct to pause the strategic work and ground it in code reality first is the right call. Strategic architecture that drifts from codebase reality becomes ceremony, not progress. This audit is cheap (a few hours of Claude Code time). What it prevents is much more expensive (a week of building the wrong thing).

*End of brief.*
