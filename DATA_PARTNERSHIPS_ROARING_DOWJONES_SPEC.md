# ANTON Data Partnership Integration — Roaring & Dow Jones
## Claude Code Execution Brief

**Branch:** `feature/data-partnerships-demo`
**Date:** March 2026
**Status:** Investigation + Demo Build — Partnership Approach Material
**Priority:** High — Strategic partnership enablement

---

## Purpose

This brief instructs Claude Code to investigate the existing ANTON infrastructure, design, and build **demonstration-grade integrations** for two strategic data partnerships:

1. **Roaring** — Swedish company registry, beneficial ownership, PEP/sanctions entity data (EU-native)
2. **Dow Jones Risk & Compliance** — Global sanctions lists, PEP database, adverse media, risk intelligence

These integrations are being built to:
- Demonstrate to Roaring and Dow Jones what an ANTON integration would look like in practice
- Show concrete module and workflow enhancement with live data enrichment
- Create a credible technical proof-of-concept before commercial API agreements are signed
- Position ANTON as a serious enterprise integration partner, not just an open-source tool

**Important:** Build against the actual API documentation and public sandbox endpoints where available. Where live APIs are not yet accessible, build full integration scaffolding with clearly labelled mock data layers that can be swapped for real API keys. The demo must be *structurally complete* — a partner's technical team should be able to see exactly what the integration does and how it would work with live credentials.

---

## Phase 0 — Investigation (Do This First)

Before writing any code, investigate the existing ANTON infrastructure thoroughly:

```
INVESTIGATE:
1. server/services/ — existing external data connectors, MCP connections, knowledge-pack-service.ts
2. server/routes/ — existing /api/connections, /api/knowledge-graph, /api/org-context endpoints
3. server/db/migrations/ — current schema, entity_nodes, entity_relationships tables
4. src/pages/ — ExternalDataPage, KnowledgeBasePage, ConnectionsPage if they exist
5. server/prompts/ — FCP-related prompt files, counsels-desk.md
6. data/knowledge-packs/ — existing pack structure for AMLR, sanctions packs
7. src/features/intelligence/ — ProactiveIntelligence, KnowledgeGraph components
```

Document findings before proceeding. Note any existing entity enrichment hooks, connection framework patterns, or data source abstraction layers that can be extended rather than rebuilt.

---

## Part 1: Roaring Integration

### What Roaring Provides

Roaring is a Swedish data company providing structured API access to:
- **Swedish Companies Registry** (Bolagsverket) — company registration, status, org number
- **Beneficial Ownership** (Verklig huvudman) — UBO chains, ownership percentages
- **Board Members & Signatories** — director names, roles, personal identity numbers (masked)
- **Financial Summaries** — annual report data, revenue bands, credit risk indicators
- **PEP Screening** — politically exposed persons linkage
- **Sanctions Cross-reference** — EU and UN sanctions list cross-checks

**API Base:** `https://api.roaring.io/v2/` (sandbox available)
**Auth:** API key header `Authorization: Bearer {key}`
**Docs:** https://www.roaring.io/developer

### 1.1 — New Files to Create

#### `server/services/roaring-connector.ts`

Full Roaring API client with:

```typescript
// Core functions to implement:

// Company lookup by org number or name
lookupCompany(query: string, type: 'orgNumber' | 'name'): Promise<RoaringCompany>

// Full beneficial ownership chain — walk UBO tree recursively up to 5 levels
getBeneficialOwners(orgNumber: string): Promise<UBOChain>

// Board members and authorised signatories
getBoardMembers(orgNumber: string): Promise<BoardMember[]>

// Sanctions and PEP screening for a company and its UBO chain
screenEntity(orgNumber: string): Promise<SanctionsScreenResult>

// Batch screening — for use in workflow automation
batchScreen(orgNumbers: string[]): Promise<BatchScreenResult>

// Financial risk summary
getFinancialSummary(orgNumber: string): Promise<FinancialRisk>

// Full entity profile — assembles all of the above into a unified object
buildEntityProfile(orgNumber: string): Promise<RoaringEntityProfile>
```

**Error handling:** Implement retry logic (3 attempts, exponential backoff), rate limiting (respect Roaring's 100 req/min sandbox limit), graceful degradation when data is unavailable.

**Mock layer:** All functions should check `process.env.ROARING_API_KEY`. If not set, return structured mock data that is clearly labelled `"source": "mock_demo_data"` but structurally identical to real API responses. The demo must work without live credentials.

**TypeScript interfaces** (define all):
```typescript
interface RoaringCompany { orgNumber, name, registrationDate, status, legalForm, address, county, municipality }
interface UBONode { name, personalIdMasked, ownershipPct, controlType, isDirectOwner, children: UBONode[] }
interface UBOChain { rootEntity: string, totalUBOs: number, highRiskFlags: string[], chain: UBONode[] }
interface BoardMember { name, role, appointedDate, pepFlag, sanctionsFlag }
interface SanctionsScreenResult { screened: string[], hits: SanctionsHit[], clearCount: number, hitCount: number, screenedAt: string }
interface RoaringEntityProfile { company, uboChain, boardMembers, sanctions, financialRisk, riskScore: number, riskRationale: string }
```

#### `server/routes/roaring.ts`

REST endpoints:
```
GET  /api/roaring/company/:query          — lookup by name or org number
GET  /api/roaring/ubo/:orgNumber          — full UBO chain
GET  /api/roaring/screen/:orgNumber       — sanctions + PEP screen
POST /api/roaring/batch-screen            — body: { orgNumbers: string[] }
GET  /api/roaring/profile/:orgNumber      — full entity profile
POST /api/roaring/enrich-session          — enrich current session context with entity data
GET  /api/roaring/status                  — connector health check, mock/live indicator
```

#### `src/components/roaring/RoaringEntityCard.tsx`

Visual component showing:
- Company header (name, org number, status badge: Active/Dissolved/Liquidation)
- UBO chain visualisation — nested ownership tree with % badges
- Risk score meter (0-100, colour-coded: green <30, amber 30-70, red >70)
- Sanctions/PEP hits highlighted in red with match details
- Board members list with PEP flags
- "Inject into session" button — sends entity profile as context to active ANTON session

#### `src/pages/RoaringSearchPage.tsx`

Full search and screening page:
- Search bar (company name or org number)
- Results list with quick-screen badges
- Entity card detail view
- Batch screening tool — paste list of org numbers, run bulk screen
- Export screening results as PDF report or XLSX
- History of recent screens with cached results (24h TTL)

### 1.2 — Module Integration: KYC & BWRA Enhancement

#### Enhance `server/prompts/` — FCP modules

For the following modules, add a Roaring data injection hook:

**Customer Due Diligence / EDD module:**
When a user enters a company name or org number into the module context, automatically:
1. Call `buildEntityProfile(orgNumber)`
2. Inject the structured profile as a named context block: `## ROARING ENTITY DATA [Live / Mock Demo]`
3. Include: ownership structure, sanctions status, PEP flags, risk score
4. The module's AI then reasons over this live data alongside the regulatory framework

**Business-Wide Risk Assessment module:**
When org context includes Swedish/Nordic entities:
1. Pull financial risk summaries for key client segments
2. Inject as `## ROARING PORTFOLIO RISK SNAPSHOT`
3. AI calibrates inherent risk ratings against live financial health data

**SAR Narrative Builder:**
When a subject entity is identified:
1. Roaring lookup enriches the narrative context with verified registration data
2. UBO chain surfaced for "layers of corporate complexity" analysis
3. Sanctions hits included in narrative evidence section

### 1.3 — Workflow Automation: Roaring-Triggered Workflows

Add to the event-driven workflow system (`server/services/webhook-listener.ts`):

**New trigger type:** `roaring_screen`

When a new client onboarding entry is created (or manually triggered), launch a workflow that:
1. Calls Roaring full entity profile
2. Scores the result (auto-pass if risk score <30, auto-escalate if >70, manual review 30-70)
3. Posts result to the Compliance tab
4. If hits found: auto-opens an EDD session in Counsel's Desk with entity context pre-loaded
5. Creates an engagement in the Engagement system for flagged entities

### 1.4 — Knowledge Pack: `nordic-entity-registry`

Create a new knowledge pack `data/knowledge-packs/nordic-entity-registry/`:

```json
{
  "pack_id": "nordic-entity-registry",
  "name": "Nordic Entity Registry Integration",
  "version": "1.0.0",
  "source": "roaring_api",
  "bundle_type": "live-data-connector",
  "description": "Live Swedish company registry, beneficial ownership, and sanctions screening via Roaring API",
  "regulatory_areas": ["KYC", "EDD", "BWRA", "Sanctions"],
  "jurisdictions": ["SE", "NO", "FI", "DK"],
  "entities": [],
  "relationships": [],
  "live_connector": "roaring",
  "refresh_policy": "on-demand"
}
```

This pack, when activated, tells ANTON that for any FCP module invocation involving Nordic entities, Roaring data should be fetched and injected at Layer 2b of the prompt architecture.

---

## Part 2: Dow Jones Risk & Compliance Integration

### What Dow Jones Risk & Compliance Provides

Dow Jones Risk & Compliance (formerly Factiva Risk) is the enterprise-grade global risk data platform used by Tier 1 financial institutions. It provides:

- **DJRC Sanctions Lists** — consolidated global sanctions (OFAC, EU, UN, OFSI, SECO, and 50+ other lists), updated in real-time
- **PEP Database** — 1.4M+ politically exposed persons globally, with family members and associates, tiered by risk level (T1/T2/T3)
- **Adverse Media** — AI-processed negative news from 35,000+ global sources, categorised by risk type (bribery, fraud, trafficking, etc.)
- **State-Owned Entities (SOE)** — database of government-linked entities and companies
- **Screening API** — real-time entity screening against all lists simultaneously
- **Watchlist Updates** — webhook notifications when a screened entity's status changes

**API:** `https://api.dowjones.com/risk-compliance/v2/`
**Auth:** OAuth 2.0 client credentials
**Docs:** https://developer.dowjones.com/risk-compliance

### 2.1 — New Files to Create

#### `server/services/dowjones-connector.ts`

```typescript
// Core functions:

// Entity screening — the primary function
screenEntity(params: DJScreenParams): Promise<DJScreenResult>
// params: { name, birthDate?, nationality?, orgNumber?, screeningLists: string[] }
// Lists: 'sanctions_global', 'pep_all', 'adverse_media', 'soe', 'enforcement'

// Batch screening for portfolio-level checks
batchScreen(entities: DJScreenParams[]): Promise<DJBatchResult>

// Detailed profile for a matched entity
getEntityProfile(entityId: string): Promise<DJEntityProfile>

// Adverse media search — beyond screening, active search
searchAdverseMedia(entityName: string, dateRange?: DateRange): Promise<AdverseMediaResult>

// PEP profile detail — get full political exposure history
getPEPProfile(pepId: string): Promise<PEPProfile>

// Sanctions detail — full list entries with source citations
getSanctionsDetail(sanctionsId: string): Promise<SanctionsDetail>

// Watchlist monitoring — register entity for ongoing monitoring
registerForMonitoring(entityId: string, sessionId: string): Promise<MonitoringRegistration>

// Get monitoring alerts for a registered session
getMonitoringAlerts(sessionId: string): Promise<MonitoringAlert[]>
```

**TypeScript interfaces:**
```typescript
interface DJScreenResult {
  entityQueried: string
  screened: { sanctions: boolean, pep: boolean, adverseMedia: boolean, soe: boolean }
  hits: DJHit[]
  clearances: string[]
  riskScore: 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAR'
  screenedAt: string
  referenceId: string
}

interface DJHit {
  listType: 'SANCTIONS' | 'PEP' | 'ADVERSE_MEDIA' | 'SOE' | 'ENFORCEMENT'
  matchStrength: 'EXACT' | 'STRONG' | 'PARTIAL'
  entityId: string
  entityName: string
  matchedName: string
  sourceLists: string[]  // e.g. ['OFAC_SDN', 'EU_CONSOLIDATED']
  details: string
  dateAdded: string
  associatedEntities?: string[]
}

interface PEPProfile {
  id: string, name: string, tier: 1|2|3
  positions: { title: string, country: string, from: string, to?: string }[]
  familyMembers: { name: string, relationship: string, pepFlag: boolean }[]
  associates: { name: string, relationship: string }[]
  adverseMedia: AdverseMediaResult
}
```

**Mock layer:** Same pattern as Roaring — check `process.env.DOWJONES_API_KEY`, return clearly-labelled structured mock data if not set.

#### `server/routes/dowjones.ts`

```
POST /api/dowjones/screen              — real-time entity screen
POST /api/dowjones/batch               — batch screen up to 100 entities
GET  /api/dowjones/entity/:id          — full entity profile
GET  /api/dowjones/pep/:id             — PEP detail
GET  /api/dowjones/adverse-media       — search adverse media
POST /api/dowjones/monitor             — register for ongoing monitoring
GET  /api/dowjones/alerts/:sessionId   — monitoring alerts
GET  /api/dowjones/lists               — available screening list catalogue
GET  /api/dowjones/status              — connector health + mock/live indicator
```

#### `src/components/dowjones/DJScreeningPanel.tsx`

Rich screening result component:
- Hit/clear status banner — prominent red/amber/green header
- Per-list results accordion (Sanctions / PEP / Adverse Media / SOE)
- Hit detail cards showing match strength, source lists, associated entities
- Adverse media timeline — chronological negative news with risk category tags
- PEP tree — position history and family/associates graph
- "Add to monitoring" button for ongoing watchlist management
- Audit export — one-click PDF of full screening record with timestamp and reference ID

#### `src/pages/DJScreeningPage.tsx`

Enterprise screening workspace:
- Single entity screen with full result display
- Batch screening — upload CSV of entity names, download results XLSX
- Monitoring dashboard — entities under active watch, alert feed
- Screening history with cached results (configurable TTL)
- Compliance audit log — complete record of every screen, who ran it, when

### 2.2 — Module Integration: Deep FCP Enhancement

#### Counsel's Desk — Sanctions Research Mode Enhancement

In `server/routes/legal-research.ts`, add DJ data injection for the `comparative-jurisdiction` and `gap-spotter` modes:

When a user mentions an entity name in a Counsel's Desk session:
1. Auto-detect entity names using regex + NER (simple pattern: all-caps multi-word, or quoted names)
2. Background-call `screenEntity()` for each detected entity
3. Inject results as `## REAL-TIME SCREENING DATA [Dow Jones / Mock Demo]` block
4. Counsel's Desk AI reasons over live screening data when drafting opinions

#### Sanctions Advisory Module Enhancement

```
Current: AI reasons from knowledge pack (eu-sanctions, unscr-sanctions)
Enhanced: AI reasons from knowledge pack PLUS live DJ screening result for named entity
```

Prompt layer injection: Add a `buildDJScreeningLayer(entityName, db)` function in `server/services/prompt-builder.ts` — Layer 2c in the architecture. Called when:
- Module is `sanctions-advisory`
- Module is `edd-structurer`  
- Module is `sar-narrative-builder`
- Session metadata includes `entity_subject` field

#### Gap Assessment — PEP/SOE Risk Calibration

In `server/services/gap-assessment-engine.ts`:

When assessing AMLR Article 20-25 (PEP provisions) or Articles 29-34 (high-risk third countries):
- Pull DJ PEP database stats for the jurisdiction under assessment
- Inject SOE entity counts for sectors in scope
- AI calibrates gap scores against the actual PEP/SOE exposure the organisation faces

### 2.3 — Workflow Integration: DJ-Triggered Alerts

**New event type:** `dj_watchlist_change`

When DJ monitoring alerts fire (webhook from DJ API):
1. Event-workflow-processor matches to any sessions with the flagged entity
2. Auto-creates a Proactive Intelligence insight: `WATCHLIST_CHANGE` type, HIGH priority
3. InsightsBell notification fires
4. If entity is in an active engagement: injects alert into engagement knowledge board under Risks
5. Optional: auto-opens a Counsel's Desk session with alert context pre-loaded

### 2.4 — Knowledge Pack: `dowjones-risk-intelligence`

```json
{
  "pack_id": "dowjones-risk-intelligence",
  "name": "Dow Jones Risk & Compliance Intelligence",
  "version": "1.0.0",
  "source": "dowjones_api",
  "bundle_type": "live-data-connector",
  "description": "Global sanctions, PEP database, adverse media, and SOE data via Dow Jones R&C API",
  "regulatory_areas": ["Sanctions", "PEP", "KYC", "EDD", "AdverseMedia", "SOE"],
  "jurisdictions": ["GLOBAL"],
  "coverage": {
    "sanctions_lists": "50+",
    "pep_database": "1.4M+ entries",
    "adverse_media_sources": "35,000+",
    "soe_entities": "100,000+"
  },
  "live_connector": "dowjones",
  "refresh_policy": "real-time"
}
```

---

## Part 3: Combined Roaring + DJ Integration — The Full Picture

Build a unified `EntityIntelligencePanel` that combines both data sources:

### `src/components/data/EntityIntelligencePanel.tsx`

When a user enters any entity name into an FCP module:

```
ENTITY: [Acme Holdings AB] [org: 556123-4567]

┌─ ROARING (Swedish Registry) ──────────────────────────────┐
│  Status: Active ✓   Registered: 2015-03-12                 │
│  UBO: John Smith (67%) → via Panama Holdings Ltd           │
│  Board: 3 members — 0 PEP flags ✓                         │
│  Financial Risk: MEDIUM (revenue declining 2 years)        │
└────────────────────────────────────────────────────────────┘

┌─ DOW JONES (Global Screening) ────────────────────────────┐
│  Sanctions: CLEAR ✓                                        │
│  PEP: ⚠ MATCH — John Smith (UBO) — T2 PEP               │
│       Former Municipal Councillor, Gothenburg 2018-2022    │
│  Adverse Media: 2 articles — financial fraud allegation    │
│       2024-11: Swedish prosecutor investigation opened     │
│  SOE: No government linkage found ✓                       │
└────────────────────────────────────────────────────────────┘

┌─ COMBINED RISK ASSESSMENT ─────────────────────────────────┐
│  Overall Risk: ⚠ HIGH — EDD Required                       │
│  Key Flags: UBO is T2 PEP + Active adverse media           │
│  Regulatory trigger: AMLR Art. 22 (PEP), Art. 40 (EDD)   │
│  Recommended action: Enhanced Due Diligence → SAR assess   │
└────────────────────────────────────────────────────────────┘

[Open EDD Module with Context]  [Open Counsel's Desk]  [Add to Monitoring]
```

This panel should be available:
- As a floating widget injected into any FCP module session
- As a standalone page `/entity-intelligence`
- As an embeddable component in the Gap Assessment wizard Step 3

---

## Part 4: Demo Packaging — Partnership Approach Material

Build a self-contained demo mode that showcases the integrations without live credentials:

### `src/pages/PartnershipDemo.tsx`

A guided demo walkthrough page, reached at `/demo/data-partnerships`:

**Scene 1 — Customer Onboarding (Roaring)**
Step-by-step animated demo showing: company search → UBO chain reveals complex ownership → auto-triggers EDD → Counsel's Desk opens with pre-loaded context

**Scene 2 — Sanctions Alert (Dow Jones)**
Shows: entity monitoring alert fires → proactive insight appears → Counsel's Desk sanctions research session opens with DJ data pre-injected → opinion drafted with live screening evidence

**Scene 3 — Combined EDD (Both)**
Full enhanced due diligence flow: Roaring registry data + DJ screening + AMLR article-level gap assessment → board-ready EDD summary generated

Each scene should:
- Work entirely with mock data (labelled clearly as demo)
- Show exactly which API calls are being made (log panel at the bottom of each scene)
- Display the prompt layer injection in real-time (show how DJ/Roaring data enters the prompt)
- Have a "What this would look like with live credentials" call-out

### `ROARING_INTEGRATION_BRIEF.md` (auto-generate in `/docs/partnerships/`)

A 2-page technical brief for Roaring's team:
- What ANTON is and who uses it
- Exactly which endpoints we would use and why
- Expected call volume (per-session model, not bulk)
- How their data enriches specific FCP workflows
- The mutual value proposition: Roaring data + ANTON expertise = complete FCP intelligence

### `DOWJONES_INTEGRATION_BRIEF.md` (auto-generate in `/docs/partnerships/`)

Same structure for Dow Jones:
- Focus on the enterprise compliance workflow narrative
- Emphasise the Counsel's Desk + monitoring combination
- Call out the AMLR compliance context specifically (DJ data mapped to AMLR articles)
- The Nordic/EU angle: Roaring for entity registry, DJ for global screening — complete picture

---

## DB Migration Required

```sql
-- 020_data_partnerships.sql
CREATE TABLE IF NOT EXISTS data_connectors (
  id TEXT PRIMARY KEY,
  connector_type TEXT NOT NULL,  -- 'roaring' | 'dowjones' | 'mcp'
  display_name TEXT NOT NULL,
  status TEXT DEFAULT 'mock',    -- 'mock' | 'live' | 'error'
  api_key_set BOOLEAN DEFAULT FALSE,
  last_successful_call TEXT,
  total_calls INTEGER DEFAULT 0,
  config JSON,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_screens (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  entity_name TEXT NOT NULL,
  org_number TEXT,
  connector TEXT NOT NULL,
  result JSON NOT NULL,
  risk_score TEXT,
  hit_count INTEGER DEFAULT 0,
  screened_at TEXT DEFAULT (datetime('now')),
  cached_until TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS entity_monitoring (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  connector TEXT NOT NULL,
  registered_at TEXT DEFAULT (datetime('now')),
  last_alert TEXT,
  alert_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'  -- 'active' | 'paused' | 'cancelled'
);

CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id TEXT PRIMARY KEY,
  entity_monitoring_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  details JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  acknowledged BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (entity_monitoring_id) REFERENCES entity_monitoring(id)
);
```

---

## Deliverables Summary

| File | Purpose |
|------|---------|
| `server/services/roaring-connector.ts` | Roaring API client + mock layer |
| `server/services/dowjones-connector.ts` | DJ R&C API client + mock layer |
| `server/routes/roaring.ts` | REST endpoints |
| `server/routes/dowjones.ts` | REST endpoints |
| `src/components/roaring/RoaringEntityCard.tsx` | Visual entity card |
| `src/components/dowjones/DJScreeningPanel.tsx` | Screening results panel |
| `src/components/data/EntityIntelligencePanel.tsx` | Combined panel |
| `src/pages/RoaringSearchPage.tsx` | Search + screening workspace |
| `src/pages/DJScreeningPage.tsx` | Enterprise screening workspace |
| `src/pages/PartnershipDemo.tsx` | Self-contained demo for partners |
| `server/services/prompt-builder.ts` | Add `buildDJScreeningLayer()`, `buildRoaringLayer()` |
| `data/knowledge-packs/nordic-entity-registry/` | Roaring knowledge pack |
| `data/knowledge-packs/dowjones-risk-intelligence/` | DJ knowledge pack |
| `server/db/migrations/020_data_partnerships.sql` | DB migration |
| `docs/partnerships/ROARING_INTEGRATION_BRIEF.md` | Partner-facing brief |
| `docs/partnerships/DOWJONES_INTEGRATION_BRIEF.md` | Partner-facing brief |

---

## Success Criteria

- [ ] Both connectors work fully with mock data — zero dependency on live credentials
- [ ] Mock data is structurally identical to real API responses (partners can validate)
- [ ] Entity Intelligence Panel displays correctly in at least 3 FCP modules
- [ ] Prompt layer injection visible and auditable in session debug mode
- [ ] Partnership Demo page works end-to-end with mock data, clearly labelled
- [ ] Both integration briefs generated and accurate
- [ ] Zero TypeScript errors
- [ ] DB migration runs cleanly on existing schema

---

*This spec is for partnership enablement. The goal is a demo that makes Roaring and Dow Jones say: "We can see exactly how this works, and we want to be part of it."*
