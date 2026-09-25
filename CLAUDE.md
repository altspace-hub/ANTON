# CLAUDE.md — ANTON by openEXPERT v0.7.5

Instructions for Claude Code, Claude in Cursor, and any AI coding assistant that reads `CLAUDE.md`.

---

## Project Identity

**Name:** ANTON by openEXPERT
**Package:** `openexpert` v0.7.5
**Purpose:** AI-powered expert workspace for 55+ professional domains. Local-first web application that enables consultants, lawyers, compliance officers, analysts, and domain experts to leverage frontier LLMs through a structured, guided interface — no command-line knowledge required.
**Primary users:** Domain professionals aged 35-65 who need reliable, structured AI output.
**Deployment:** Local-first. Runs on `localhost`. Documents stay on the machine. Only LLM API calls leave the network.
**Primary AI:** Anthropic Claude. The default model is the Settings pick (`app_settings.default_model`); this instance runs `sdk:claude-opus-5-5` on the subscription SDK engine (`server/services/claude-sdk-client.ts` — the machine's Claude Code login, no API key). With an API key and no Settings pick the large tier is `claude-opus-5-5` (`CLAUDE_LARGE` in `server/config/claude-lineup.ts`; Opus 5.5 is the default since 2026-09-23). Multi-LLM support for OpenAI, Azure OpenAI, Gemini, Mistral, and Ollama.
**Companion App:** PWA + Capacitor Android wrapper at `src/app/` — separate Vite build (`dist/app/`) for end-users on phones.
**Design philosophy:** "Start with the problem, not the solution." Every module begins with a clear problem statement and pre-configured AI behaviour. Users can override everything, but the defaults should produce excellent results for someone who just clicks "Run."

---

## Quick Start

### Prerequisites

1. **Node.js v22+** — [Download](https://nodejs.org) or `winget install OpenJS.NodeJS.LTS`
2. **pnpm** — `npm install -g pnpm`
3. **PostgreSQL 16+** — [Download](https://www.postgresql.org/download/)
4. **Ollama** (optional, for knowledge memory) — [Download](https://ollama.com)

### Automatic Setup (Recommended)

```bash
# Clone and run setup wizard — handles everything automatically
git clone <repo> && cd openexpert
setup-anton.bat          # Windows (double-click or run from terminal)
# OR
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

The setup wizard will:
- Check Node.js and pnpm
- Ask for your Anthropic API key
- Auto-detect PostgreSQL, create the `anton` user and database
- Install dependencies
- Check Ollama and pull the embedding model
- Initialize the database schema

### Manual Setup

```bash
# 1. Clone and install
git clone <repo> && cd openexpert
pnpm install

# 2. Install PostgreSQL and create the database
# After installing PostgreSQL, open psql as the postgres superuser:
psql -U postgres
CREATE USER anton WITH PASSWORD 'anton';
CREATE DATABASE anton OWNER anton;
\q

# 3. Install Ollama (optional — local LLM models + every embedding ANTON makes)
#    nomic-embed-text embeds institutional-memory atoms, knowledge-pack entities
#    AND collection-RAG document chunks into the one `embeddings` table (local,
#    nothing leaves). No OpenAI key and no Chroma server are needed; without an
#    embedder, collection search falls back to keyword matching and says so.
# Download from https://ollama.com and install, then:
ollama pull nomic-embed-text

# 4. Configure environment
cp .env.example .env
# Edit .env — add at minimum:
#   ANTHROPIC_API_KEY=sk-ant-...
#   DATABASE_URL=postgresql://anton:anton@localhost:5432/anton
# Optional: OPENAI_API_KEY, GOOGLE_API_KEY, MISTRAL_API_KEY for multi-LLM

# 5. Initialize database (auto-detects PostgreSQL from DATABASE_URL)
pnpm run db:init

# 6. Start development
pnpm run dev          # Frontend (Vite) + Backend (Express)

# 7. Production build
pnpm run build && pnpm run start
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + TypeScript | 18 / 5.7 (strict) |
| Build | Vite | 6 |
| Styling | Tailwind CSS | 4 |
| State | Zustand | 5 |
| Router | React Router | v6 |
| Backend | Express + Node.js | 4 / 22 |
| Database | PostgreSQL | 16+ |
| Primary AI | Anthropic Claude | Settings default — `sdk:claude-opus-5-5` here (subscription engine); `claude-opus-5-5` is the API large tier |
| Multi-LLM | OpenAI, Azure OpenAI, Gemini, Mistral, Ollama | — |
| File processing | mammoth (docx), pdf-parse, xlsx | — |
| Export | docx, exceljs, pdfkit, pptxgenjs, fountain | — |
| Testing | Vitest + Playwright | — |
| Package manager | pnpm | 10 |
| Desktop | Electron (optional) | — |

---

## Directory Structure

```
/
├── server/
│   ├── index.ts              Express entry point — all routes mounted here
│   ├── routes/               70+ API route files (factory pattern)
│   ├── services/             80+ service files (single-responsibility)
│   ├── connections/          MCP, OIDC, data connectors
│   ├── db/                   schema.postgresql.sql, init-postgresql.ts, migrations-pg/
│   ├── middleware/           auth.ts, rate-limit.ts, csrf.ts
│   ├── lib/                  error-response.ts, schemas.ts, telemetry.ts
│   └── prompts/              system prompt .md files per module (30+)
├── src/
│   ├── App.tsx               All routes — lazy-loaded pages
│   ├── components/           shared/ + layout/ + engagement/ + modules/
│   ├── pages/                60+ page components
│   ├── stores/               Zustand stores (useSessionStore, useConfigStore, etc.)
│   ├── hooks/                useClaude, useFileUpload, useExport
│   ├── lib/                  types.ts, constants.ts, api.ts, output-format-definitions.ts
│   ├── features/             intelligence/, connections/, knowledge/
│   └── theme/                colors.ts (ANTON design system)
├── data/
│   ├── frameworks/           Regulatory framework JSON (AMLR, DORA, ISO27001, etc.)
│   └── knowledge-packs/      Regulatory knowledge packs (.anton bundles)
├── electron/                 Desktop app (optional)
├── public/                   Static assets, locales (30 languages)
├── docs/                     Developer documentation
├── tests/                    Playwright E2E, load tests
├── .env.example              All environment variables documented
└── docker-compose.yml        Container setup
```

---

## Critical Files

| File | Purpose |
|---|---|
| `src/lib/constants.ts` | All 550+ module definitions — IDs, labels, defaults, area groupings |
| `src/lib/types.ts` | All shared TypeScript types |
| `src/lib/output-format-definitions.ts` | 40+ output format configs with prompt instructions |
| `server/db/schema.postgresql.sql` | Baseline schema (~188 tables), run first at every boot. NOT a full snapshot — ~370 later tables (agents, atlas, app_*, markets, portals, missions, etc.) exist ONLY in `migrations-pg/`. To find a table's definition, grep `migrations-pg/` too, not just this file. |
| `server/db/init-postgresql.ts` | Database initialization + migration runner |
| `server/index.ts` | Express entry — all routes mounted, middleware, SSE streaming |
| `server/services/claude-client.ts` | Claude API wrapper — streaming, thinking, web search |
| `server/services/prompt-builder.ts` | Assembles final prompts from all knowledge layers |
| `.env.example` | Every environment variable documented with descriptions |

---

## Core Architecture

### Knowledge Source System (4 Modes)

Every module has a Knowledge Source Panel controlling WHERE the AI gets reference material:

1. **Claude's Knowledge** — built-in knowledge + optional web search (`web_search_20250305` tool)
2. **Online References** — paste URLs, server fetches and extracts text
3. **Local Folders** — point to directories on your machine (indexed, word-counted)
4. **Combined Mode** — merge sources with priority rules (local-first / AI-first / merged)

### Output Format System

Users select output format(s) BEFORE running. 40+ formats across 6 categories:
- **Strategic**: Executive Summary, Decision Memo, Risk Appetite Statement
- **Analytical**: Detailed Findings, Regulatory Comparison, Impact Assessment
- **Operational**: Action Plan, Project Plan, Policy Document, RACI Matrix
- **Scoring**: Gap Scoring Matrix, Maturity Assessment, Data Readiness Scorecard
- **Communication**: Quick Briefing, Training Material, Engagement Proposal
- **Planning**: Compliance Calendar, Monitoring Plan, Budget Estimate

### Multi-LLM Support

Claude is the default and most deeply integrated. Other providers work through adapter modules:

| Provider | Env Variable | Default Model | Adapter File |
|---|---|---|---|
| Anthropic (subscription engine) | none — Claude Code login; enable in Settings → Execution engines (`SDK_ENGINE_ENABLED`) | `sdk:claude-opus-5-5` | `server/services/claude-sdk-client.ts` |
| Anthropic (API) | `ANTHROPIC_API_KEY` | `claude-opus-5-5` | Built-in (`claude-client.ts`) |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` (tier default); GPT-6 `gpt-6-astra` / `gpt-6-sol` / `gpt-6-luna` selectable | `server/services/model-adapter.ts` |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` | (per deployment) | `server/services/adapters/azureOpenaiAdapter.ts` |
| Google | `GOOGLE_API_KEY` | `gemini-2.0-flash` | `server/services/model-adapter.ts` |
| Mistral | `MISTRAL_API_KEY` | `mistral-large-latest` | `server/services/model-adapter.ts` |
| Ollama | `OLLAMA_BASE_URL` | User-selected | `server/services/model-adapter.ts` |

Azure OpenAI supports reasoning models (o3, o4-mini) with effort mapping, multi-deployment config (stored in `azure_openai_config` / `azure_openai_deployments` tables), and SSE streaming.

Set the API key in `.env` to enable each provider. Users switch models in the UI per session.

**Every LLM call site follows the Settings default.** `server/services/provider-router.ts` (`getConfiguredProvider` / `resolveModel` / `mapModelToProvider`) resolves hardcoded `claude-*` ids and `large` / `medium` / `small` tiers to the configured engine — large-tier work runs the Settings default (under an `sdk:` default, or a Claude default on the API), and medium/small run `sdk:claude-sonnet-5` on the subscription engine so utility calls are not promoted to Opus. A Claude 5 API call that names no thinking level gets effort `low` and room for thinking in max_tokens (`anthropicThinkingParams`): Opus 5.5 cannot switch thinking off. Never construct an Anthropic client in a new route: go through `streamChat` / `callChat`, which carry the SDK engine's branches (including streaming, via a forwarding sink). Capability lookups (context budget, 1M checks, output ceilings) must strip the engine prefix with `capabilityModelId()` from `server/services/engine-model-id.ts`; an id that will be dispatched must keep it. The SDK engine is a text engine — the one opt-in exception is ANTON's `web_search` tool, which grants exactly `WebSearch` + `WebFetch` for that run.

**There are two routers, not one — and two callers that use neither.** `provider-router.ts` (`callChat` / `streamChat`) serves the gap assessor, specialised agents, Pathfinder, missions and School mode. `server/services/unified-llm-client.ts` (`streamToResponse` / `sendRequest` / `streamToHandler`) is a second dispatch layer with its own provider branches, serving the Civic, Grow and Procure pillars, the companion app, the intent router and smart actions. `sdk-agentic-runner.ts` drives the Agent SDK directly (it needs MCP tools) and `photo-id-service.ts` makes a direct vision call. Anything that must reach *every* model call has to be applied at the entry points of both routers and in those two callers — `server/lib/current-date.ts` is the pattern: one helper, applied at each entry, deferring when the text is already present so a request that passes through both routers is not doubled. It exists because no prompt carried today's date: on the SDK engine a plain `systemPrompt` string replaces Claude Code's default prompt, including the block that normally states the date, so a model trained to mid-2026 answered date-dependent questions from the wrong side of the line. Replay (`POST /api/rerun`, `mode: 'replay'`) opts out with `currentDate: false`, because it resends a stored prompt byte-for-byte. Tests that inspect what the model actually receives use `setSdkQueryImplForTests`, `setSdkAgentImplForTests` and a mocked `@anthropic-ai/sdk` (see `tests/services/current-date-reaches-model.test.ts`).

### Thinking Levels

| Level | Description | Adaptive Claude (every Claude 5 id — Fable 5.x, Opus 5.5, Opus 5, Sonnet 5 — plus Opus 4.8 / 4.7, Sonnet 4.6) | Budget models (Sonnet 4.5, Haiku 4.5, Opus 4.6) |
|---|---|---|---|
| `quick` | No deep reasoning | `effort: 'low'` | thinking disabled |
| `think` | Standard reasoning | `effort: 'medium'` | `budget_tokens: 4096` |
| `think_hard` | Deep reasoning | `effort: 'high'` | `budget_tokens: 10000` |
| `investigate` | Extended reasoning | `effort: 'xhigh'` (`'max'` on Sonnet 4.6, which lacks the rung) | `budget_tokens: 32768` |
| `plan_first` | Plan then execute | `effort: 'xhigh'` (same clamp) | `budget_tokens: 32768` |
| `deep_investigate` | Maximum reasoning | `effort: 'max'` | `budget_tokens: 32768` |

For adaptive models, always use `thinking: { type: 'adaptive' }` with `output_config: { effort }` as a **separate** top-level parameter. Never put `effort` inside `thinking`. Never set `budget_tokens` for them — the Claude 5 generation rejects it with a 400, and Opus 5.5 also rejects `thinking: { type: 'disabled' }` (effort is its only control). The ladder lives in exactly one place, `server/services/thinking-map.ts`: `anthropicEffort(level, model)` clamps `xhigh` to `max` on models that predate it, and `model-capabilities.ts` derives its per-model config from it rather than keeping a second table. `claudeGeneration()` there classes any Claude 5+ id as adaptive without an entry, so Sonnet 5.5 / Haiku 5.5 work the day they ship. Never send a non-default `temperature` beside thinking (the API rejects it). OpenAI reasoning models (o-series, `gpt-5.x`, every `gpt-6-*`) take `reasoning_effort` + `max_completion_tokens` and no `temperature` — `isOpenAIReasoningModel()` in the same file, used by all three OpenAI paths.

**The Claude lineup.** `server/config/claude-lineup.ts` names the model each API tier runs (`CLAUDE_LARGE` / `CLAUDE_MEDIUM` / `CLAUDE_SMALL`); the tier map, the utility model default, the Double-check (second-opinion) default, mission tiers and the portal depth map read it. Moving a tier — Haiku 5.5 replacing Haiku 4.5 as the small tier — is: add the model to `MODEL_CAPABILITIES` and `REGISTRY_SUPPLEMENT`, then change the one constant. `tests/config/claude-lineup.test.ts` fails when a server file names the small-tier id itself. The subscription engine runs the bundled Claude Code of `@anthropic-ai/claude-agent-sdk`; a new model can need a newer SDK (Opus 5.5 needed 0.3.280 / Claude Code 2.1.280).

### Export Pipeline

| Format | Library | Features |
|---|---|---|
| `.md` | Native | Default. Source of truth. |
| `.docx` | `docx` npm | ANTON branding, headings, tables, ToC |
| `.xlsx` | `exceljs` | Conditional formatting (RAG, column-polarity aware), auto-filters, freeze panes, typed numeric cells. No formulas are generated. |
| `.pdf` | `pdfkit` | Professional typography, page numbers |
| `.pptx` | `pptxgenjs` | Slide decks with speaker notes |
| `.fountain` | Custom | Screenplay format (FDX export) |

---

## Coding Patterns

### 1. SQL: Parameterized Queries Only

The DB adapter is **async PostgreSQL** — always `await` a `db.get` / `db.all` /
`db.run` (a missing `await` was the root cause of the SQLite→PG migration bugs).
The old synchronous `db.prepare().get()` (better-sqlite3) API is retired; the only
`.prepare(` calls left are inside the multi-DB connector driver.

```typescript
// Correct — async, parameterized, awaited
const session = await db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
await db.run('UPDATE sessions SET title = ? WHERE id = ?', title, sessionId);

// NEVER — SQL injection risk
await db.get(`SELECT * FROM sessions WHERE id = '${sessionId}'`);
// NEVER — a missing await returns a Promise, not rows (the PG-migration bug class)
db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
```

A `DATE` column (or `x::date`) comes back as the text `'YYYY-MM-DD'` — the adapter sets pg's type parser, so compare it as a string. Show one in the browser with `formatDay` / `parseDay` from `src/lib/dates.ts`: `new Date('2027-03-31')` is UTC midnight, the day before west of Greenwich. `TIMESTAMPTZ` still arrives as a `Date`.

### 2. State: Zustand Stores

```typescript
import { create } from 'zustand';

interface MyStore { value: string; setValue: (v: string) => void; }

export const useMyStore = create<MyStore>()((set) => ({
  value: '',
  setValue: (v) => set({ value: v }),
}));
```

### 3. Routes: Lazy-Loading

```typescript
const MyPage = React.lazy(() => import('./pages/MyPage'));
// Wrap in <Suspense fallback={<LoadingSpinner />}>
```

### 4. Express: Route Factory Pattern

```typescript
export function createMyRoutes(db: Database): Router {
  const router = Router();
  router.get('/:id', requireAuth, (req, res) => { /* ... */ });
  return router;
}
```

### 5. Errors: safeError()

`safeError(err: unknown): string` returns a scrubbed message string (generic in
production, the real message in dev). Pick the HTTP status yourself.

```typescript
import { safeError } from '../lib/error-response.js';

catch (err) {
  res.status(500).json({ error: safeError(err) });
}
```

### 6. Folder Path Validation

```typescript
const ALLOWED_BASES = (process.env.ALLOWED_FOLDER_PATHS ?? '').split(',');
const resolved = path.resolve(targetPath);
if (!ALLOWED_BASES.some(base => resolved.startsWith(path.resolve(base)))) {
  return res.status(403).json({ error: 'Folder access not permitted' });
}
```

### 7. TypeScript: No `any`

Strict mode enforced. Use `unknown` + type guards, or proper interfaces.

### 8. React: Functional Components Only

No class components. No `this`. Use hooks.

---

## Anti-Patterns (Never Do)

| Anti-pattern | Why | Alternative |
|---|---|---|
| SQL string concatenation | SQL injection | Parameterized `.prepare()` |
| TypeScript `any` | Breaks type safety | `unknown` + type guards |
| Inline API keys | Security leak | `.env` variables |
| `shell: true` in spawn | Shell injection | Args as array via `execFile` |
| `fs` without path validation | Path traversal | Validate against `ALLOWED_FOLDER_PATHS` |
| `console.log` with PII/tokens | Security failure | Log IDs and event types only |
| Eager-importing pages | Bundle bloat | `React.lazy()` + `Suspense` |
| Redux / Context for global state | Complexity | Zustand stores only |
| Direct `fetch()` in components | Inconsistency | Use `src/lib/api.ts` helpers |

---

## Design System

**Light theme by default** (as of v0.7.5). Three themes: `light`, `dark`, `corporate`. Theme variables live in `src/index.css` as OKLCH CSS custom properties and switch via `html.light` / `html.corporate` classes. The dark theme is the original ANTON look; light is for daytime professionals; corporate is a blue-tinted variant for enterprise deployments.

The brand green (`#0D7D6C` — light-mode deep teal) is **locked** in the logo SVG (`public/anton-logo.svg`), the Sidebar logo box, and the LoginPage logo so the brand mark stays consistent across themes.

Reference palette (dark-mode hex values, light/corporate use OKLCH equivalents in `src/index.css`):

```typescript
const antonTheme = {
  'adv-dark':      '#0B1426',   // Main background
  'adv-dark-2':    '#0F1B2D',   // Secondary background
  'adv-card':      '#152238',   // Card/panel backgrounds
  'adv-teal':      '#2DD4A8',   // Primary accent (dark mode); #0D7D6C in light mode
  'adv-teal-dark': '#1BA882',   // Hover states (dark); #06655A in light
  'adv-off-white': '#E0E0E0',   // Primary body text
  'adv-gray':      '#B0B0B0',   // Secondary text
  'adv-gold':      '#F5A623',   // Warning
  'adv-red':       '#E74C3C',   // Error
  'adv-green':     '#27AE60',   // Success
  'adv-blue':      '#3498DB',   // Info
};
```

Rules: Teal = action. 14px+ minimum font. Large readable text. Clear labels. Progressive disclosure. Keyboard navigable. Full ARIA labels.

---

## Pillars

ANTON is organised into **top-level pillars**, each representing a different mode of intelligence the user can switch into. Pillars are selected via the App Mode toggle (`useSettingsStore.appMode`).

| Pillar | Purpose | Key Files |
|---|---|---|
| **Work** | Default — 550+ expert modules for professional domains | `src/lib/constants.ts` (modules), `src/pages/ModulePage.tsx` |
| **School** | Educational interface with teacher oversight | `src/pages/school/`, `school-pages` chunk |
| **Life** | The personal side — News (bias-tracked aggregation + truth check), Finance (calculators, goals, watchlist), Travel (trips, itineraries, country guides), Community, plus a card into the personal-life modules (money, consumer rights, career). Ten further categories share `CategoryPage`. | `src/pages/LifePage.tsx` + `src/pages/{news,finance,travel}/`, `docs/life/README.md` |
| **Pathfinder** | Mode-aware research assistant ("smart action bar") | `src/pages/pathfinder/`, `server/services/pathfinder-engine.ts` |
| **Markets** | Financial intelligence, instrumented for learning — 14 migrations, 21 services, 39 Python computation templates, ANTON 100 indexes, predictions, calibration | `server/services/market-*.ts`, `server/db/migrations-pg/049–062`, `src/pages/markets/` |
| **Community** | E2E-encrypted ANTON-to-ANTON messaging, contact hashes, trust scoring | `server/services/community-*.ts`, `src/pages/community/` |
| **Procure** | Procurement cycles, vendor evaluation, criteria scoring, contract tracking | `server/services/procure-service.ts`, migration `091_procure_pillar.sql` |
| **Civic** | Civic engagements, eligibility checks, document submissions, knowledge packs | `server/services/civic-service.ts`, migration `092_civic_pillar.sql` |
| **Grow** | CRM-style: contacts, pipeline stages, opportunities, signals, briefings | `server/services/grow-service.ts`, migration `093_grow_pillar.sql` |
| **Payments** | FutureChain wallet & marketplace integration | `src/pages/futurechain/`, `server/routes/fc-marketplace.ts` |
| **Portals** | User-created ANTON-only web spaces with capability descriptors. 8-phase walkthrough builder, 7 starter templates, 12-verb capability taxonomy, registry protocol with transparency log, `anton-portal` Pathfinder mode. Full e2e: build → publish → visit → invoke. | `server/services/portals/*`, `server/services/registry-protocol/*`, `server/services/registry-client/*`, `server/services/capability-descriptor/*`, `server/routes/portals.ts`, `src/pages/portals/`, migrations `145–148` |
| **Missions** | Multi-step automation jobs (research / outreach / monitoring) with credential vault + service packs + inbox | `src/pages/missions/`, `server/routes/mission-*.ts` |

The Markets Pillar is ANTON's **testbed for self-learning intelligence** — daily market feedback is wired to validate predictions and reasoning quality (effectiveness is under active validation; live accuracy is not yet better than chance — see `docs/PORTFOLIO_AUDIT_2026-05-30.md`). Markets is the canonical example for any new "intelligent pillar."

The Portals Pillar is ANTON's **proof of inter-instance interoperability** — every portal is simultaneously a human-facing site and a machine-readable AAP endpoint. See `ANTON_Portals_Spec.md` v0.2 + the three companion reference docs (Registry Protocol, Capability Descriptor Schema, Registry Server Ops) for the full design.

---

## Risk Atlas (universal seven-stage threat-path methodology)

The Risk Atlas generalises the CASP BWRA threat-path methodology into a universal causal-chain risk engine that any business — bakery to bank — can use to maintain a living risk register. It's the canonical example of an ANTON deterministic engine: the person records paths, controls and evidence; fixed rules compute every score. The Atlas makes three kinds of model call. **Suggestions** (`server/services/risk-atlas/atlas-proposals.ts`, `POST /api/atlas/:id/proposals { stage }`, migrations 281–282) run an atlas-* stage prompt, parse its fenced diff, validate it (zod, `.strict()` — a diff carrying `inherent_score` or `residual_score` is refused), resolve every TP-/V-/C- code against the whole Atlas (every row, not only rows on a path; an unknown one is `unresolved`, never invented), and store each suggestion with an `action` — `add`, `edit` (one field of an existing row, from the whitelist `EDITABLE_FIELDS` in `atlas-service.ts`; never a code, link or score) or `remove` — for a person to accept or reject. Acceptance applies through the same `atlas-service` calls hand entry uses (`add*`, `update*`, `remove*`, `scoreInherent`, `upsertAppetite`, with `source: 'ai_suggestion'` + the proposal id in every audit event); an accepted appetite takes its band from the residual as it is at acceptance. New scores or a new appetite statement for a path that already has them are edits. Every suggestion is re-checked when accepted and refused (`skipped`) if the Atlas has moved on: an edit's field, a removal's row and what it takes with it, an addition's links and codes, an appetite's residual band and approval. Acceptance claims the row first (`pending → accepted` in one conditional UPDATE), so it applies once. Edits and removals are decided one at a time — `POST /proposals/accept` (bulk) takes additions only. The threat-path stage's `cross_domain_bundles` become bundle suggestions (a repeat of an existing bundle is set aside). `atlas-service` refuses any link, removal or appetite statement that reaches another Atlas's rows (`assertInAtlas`). The second is **Generate BWRA** (`server/services/risk-atlas/atlas-bwra.ts`, `POST /api/atlas/:id/bwra`, a job keyed per Atlas). Code renders every stage table from the Atlas; the model writes only the narrative (the BWRA module prompt + an "Atlas mode" instruction); a consistency check records any narrative that states a score or count different from the Atlas; documents are kept in `atlas_bwra_documents` (migration 280) and download as .docx. The third is the **Stage 7b company-wide Risk Appetite Statement** (`server/services/risk-atlas/atlas-company-appetite.ts`, `POST /api/atlas/:id/company-appetite/statements`, a job keyed per Atlas), built the same way: code renders the overall position, the counts, the per-domain positions (`computeCompanyAppetite`, worst-of), every outside/unacceptable path in the remediation programme, an "Accepted exceptions" table of every path declared more leniently than its residual (shown whether or not it is approved), and the recorded escalation triggers; the model (the 7b consolidator prompt) writes only narrative; a narrative stating another overall position, score or count is recorded; documents are kept in `atlas_company_appetite_documents` (migration 282), carry a sign-off block and are never marked approved. Nothing else in the Atlas calls a model (apart from the board-pack quality score), and no model ever sets a score. Changing an approved appetite statement's position, action, date or budget withdraws its approval. A path's position — in the rollup, the 7b statement and the BWRA — is its declared appetite, else the band of its residual; a declaration more lenient than that band counts only once a person has approved it (`server/services/risk-atlas/atlas-appetite-position.ts`, owner decision 2026-09-23).

**Core methodology (deterministic).** Stages 1-7: Exposures → Threat paths → Vulnerabilities → Inherent risk (= max(E, T, V)) → Controls (Strong / Adequate / Weak rolled up worst-of) → Residual (= inherent − reduction, clamped [1,5]) → Appetite (5x5 grid: 1-2 within / 3 boundary / 4 outside / 5 unacceptable). No model decides a score. Audit-defensible by construction.

**Data model.** Migrations `125_risk_atlas_foundation.sql` → `129_risk_atlas_addendum_review_fixes.sql` define 18 tables: `risk_atlases`, `atlas_threat_paths`, `atlas_exposure_points`, `atlas_vulnerabilities`, `atlas_controls`, `atlas_inherent_scores`, `atlas_residual_scores`, `atlas_appetite_statements`, `atlas_escalation_triggers`, `atlas_review_cycles`, `atlas_industry_packs`, `atlas_events`, `atlas_fcp_scope`, `atlas_cross_domain_path_bundles` and members.

**Industry packs (33).** Composable `.anton` overlays under `data/risk-atlas/packs/` with three `pack_kind` types: `industry` (sme-general, fcp-bank, fcp-casp, sector-*, etc.), `fcp-domain` (fcp-domain-amlcft / sanctions / fraud / abc / market-abuse / tax-evasion-facilitation / export-controls), `overlay` (universal-fcp-core). Inheritance via `parent_pack_id` with cycle protection in `getPackContent`.

**FCP Addendum.** `atlas_fcp_scope` carries which FCP domains are active per Atlas. `atlas_cross_domain_path_bundles` groups paths from multiple domains into a single causal "story" for the board pack. Stage 7b company-wide appetite via `computeCompanyAppetite()` — deterministic worst-of rollup per FCP domain.

| File | Purpose |
|---|---|
| `server/services/risk-atlas/atlas-residual-calculator.ts` | The deterministic core. 25 unit tests. Audit-locked. |
| `server/services/risk-atlas/atlas-service.ts` | CRUD for the seven stages, owner-bound mutations. |
| `server/services/risk-atlas/atlas-pack-loader.ts` | Loads + validates + merges packs (parent inheritance, severity benchmarks). |
| `server/services/risk-atlas/atlas-fcp-scope-service.ts` | FCP scope, cross-domain bundles, Stage 7b rollup. |
| `server/services/risk-atlas/atlas-export.ts` | Board-pack DOCX, threat-path PDF, heatmap SVG, .anton bundle. |
| `server/services/risk-atlas/atlas-integrity-rules.ts` | Six Compliance-as-Code rules over Atlas state (ATLAS-INT-001..006). |
| `server/routes/atlas.ts` | ~30 REST endpoints, all gated by `ensureAtlasAccess(db, req, atlasId)`. |
| `src/pages/risk-atlas/RiskAtlasWorkspacePage.tsx` | 5-tab workspace shell. |
| `src/pages/risk-atlas/SmallBusinessDashboardPage.tsx` | Simplified solo-operator landing. |
| `server/areas/risk/modules/atlas-*` | 7 atlas-* stage prompts + the 7b consolidator. Each stage prompt ends in a fenced JSON diff; `atlas-proposals.ts` runs six of them as **suggestions** (see above) — Stage 6 (residual) is the calculator's alone. The 7b consolidator writes the narrative of the company-wide statement (`atlas-company-appetite.ts`). Generate BWRA does not use them. |
| `server/services/risk-atlas/atlas-proposals.ts` | Suggestions: parse, validate, resolve against the Atlas, store; accept/reject with the stale-change guard. |
| `server/services/risk-atlas/atlas-company-appetite.ts` | Stage 7b statement: tables from the rollup, narrative from the model, consistency check. |
| `server/areas/risk/modules/atlas-company-appetite-consolidator/` | Stage 7b — board-readable rollup. |
| `server/areas/fcp/modules/business-wide-risk-assessment/` | AMLR Article 10 business-wide risk assessment (BWRA) — a listed FCP Work module; one run writes the 12-section BWRA with the Atlas scoring rules, or around a pasted/uploaded Atlas board pack. It does not call the atlas-* prompts. Article 10 is the BWRA; Article 16 is group-wide requirements. |
| `server/areas/fcp/modules/fcp-scope-assessor/` | AI-guided FCP-domain activation (used by the AMLR mission; not listed in Work). |

**Mission template.** `tmpl_amlr_readiness_v1` (`server/services/missions/seed-templates.ts`) is the 10-task end-to-end programme for an AMLR-obliged entity: scope → Atlas set-up recommendation (the person creates the Atlas) → BWRA → gap analysis → policies → training → audit, with four explicit checkpoints. Its steps name their modules in `module_id`, and the mission executor runs each step with that module's system prompt (`server/services/missions/mission-task-module.ts`; an unknown id is logged as `module_not_applied`). Built-in templates are refreshed from the code when their definition changes.

**Atlas integrity rules** are deterministic — surface live findings (residual ≥ 4 with no appetite, Strong control without ≥5-char evidence, outside-appetite path missing action / target date, etc.) on the workspace dashboard. Pure functions over a snapshot, easy to test.

---

## Specialized Agents (Layer 4 — Collaborative Intelligence)

Autonomous AI personas with their own system prompts, knowledge packs, routing rules, and escalation policies. Used for support, sales, HR, travel, and any business function.

| File | Purpose |
|---|---|
| `server/services/agent-service.ts` | CRUD for agent profiles |
| `server/services/agent-processor.ts` | Conversation processing + tool routing |
| `server/services/agent-builder.ts` | AI-generated agent config from a description |
| `server/services/agent-connector-executor.ts` | Live API calls + read-only DB queries from tool calls (encrypted creds via `credential-vault.ts`) |
| `server/services/remote-agent-client.ts` | Discover agents on peer ANTON instances; route queries to best-matching remote agent |
| `server/routes/agents.ts` | REST API: `GET/POST /agents`, `/agents/:id`, `/agents/public/directory`, `/agents/public/query` |
| `src/pages/agents/AgentHubPage.tsx` | Agent management UI |

DB tables (migration `111_specialized_agents.sql`): `agent_profiles`, `agent_conversations`, `agent_messages`, `agent_connectors`, `agent_templates`, `agent_audit_log`. Connector types: `rest_api`, `webhook`, `database`, `email`, `calendar`, `crm`, `erp`.

---

## Companion App (PWA + iOS + Android)

Separate React app for end-users on phones / tablets / desktop browsers. Lives at `src/app/`. Built with its own Vite config (`vite.config.app.ts` → `dist/app/`). Wrapped as Android APK/AAB via Capacitor (`android/`); iOS scaffold templates at `ios-templates/` to overlay onto a Mac-generated `npx cap add ios` project.

**Pairing (spec §5.2 — Ed25519 enrollment ritual)**
1. Admin opens "Connect a device" → instance issues a 60s-TTL enrollment package (instance pubkey + cert fingerprint + endpoints + intended user/role + nonce + optional 6-digit OOB confirmation code)
2. Phone scans QR → generates a fresh Ed25519 keypair (private key in Keychain / Keystore via `@aparajita/capacitor-secure-storage`)
3. Phone signs `${token}.${nonce}.${publicKey}`, POSTs to `/api/app/enrollment/complete` with the user-typed confirmation code
4. Server verifies + issues a device certificate + session token; phone biometric-locks the credentials

**Multi-instance** — `src/app/services/instances.ts` holds the paired instance list; `InstanceTopBar` + `InstanceSwitcher` (Wallet-card style bottom sheet) make the active instance unambiguous (spec §4.2). `setActiveInstanceAsync()` is race-free; the legacy single-session global key is bridged.

**Approvals (the enterprise wedge — spec §8.6)** — `app_checkpoints` table + `/api/app/checkpoints/*` + `ApprovalsScreen` (now a primary tab with live badge). Severity-sorted inbox; biometric re-confirm on critical / high / `requires_biometric=true`; signed-envelope responses (Ed25519 sig + replay-protected nonce) when keypair exists.

**Push (spec §8.7)** — `app_push_tokens` table + APNs / FCM / web-push dispatcher. Payload carries only `event_id + severity + opaque title + deep_link` — never confidential content.

**Voice (spec §8.4)** — `VoiceMode` full-screen overlay with Telegram-style hold-to-talk, on-device speech fallback, live captions, platform TTS via `tts.ts`, immediate barge-in on tap.

**Capture (spec §8.5)** — Camera / library / share-target → resize-to-2048px-70%-quality → POST to `/query-sync` with structured `capture` field (1MB soft cap server-side).

**FAB + bottom sheets (spec §8.8 + §9.3)** — `QuickActionsFab` opens a `BottomSheet` with Voice / Capture / Ask / Approvals / Switch instance. The More menu is also a `BottomSheet`.

**Tables** (migrations 094 + 130 + 131): `connected_users`, `connected_user_orgs`, `org_invitations`, `app_sessions`, `app_messages`, `app_session_tokens`, `app_devices` (Ed25519-paired phones), `app_enrollment_tokens` (with `confirmation_code`), `app_push_tokens`, `app_checkpoints`, `app_signed_envelope_nonces`, `instance_identity` (encrypted privkey).

**Security at rest** — set `INSTANCE_KEY_ENCRYPTION_KEY` (32-byte hex) so the instance Ed25519 privkey is AES-256-GCM encrypted in `instance_identity.privkey_encrypted`. Without it the service stores plaintext + logs a one-time warning.

**Optional env**:
- `APP_GATEWAY_MDNS=true` — advertise `_anton._tcp.local`
- `APP_GATEWAY_LAN_BROWSE=true` — let authenticated apps browse the LAN via `/api/app/discover/lan`
- `APP_GATEWAY_PUSH=true` — enable real APNs/FCM/web-push dispatch (also needs provider keys)
- `APP_GATEWAY_PUBLIC_URL=https://anton.example.com` — WAN endpoint baked into enrollment QRs

| File | Purpose |
|---|---|
| `server/services/app-enrollment-service.ts` | Pairing ritual + device certs + signed-envelope verification + privkey encryption |
| `server/services/app-push-service.ts` | APNs/FCM/web-push dispatch (stubs until provider keys present) |
| `server/services/app-checkpoint-service.ts` | Pending-approval CRUD + severity-driven biometric requirement |
| `server/services/mdns-advertiser.ts` | Bonjour `_anton._tcp` + legacy `_anton-gateway._tcp` |
| `src/app/services/identity.ts` | Ed25519 (via `@noble/ed25519`) + signed envelope + tier-aware secure storage |
| `src/app/services/instances.ts` | Multi-instance store with race-free switcher |
| `src/app/services/checkpoints.ts` | Approvals client (envelope-signed responses) |
| `src/app/services/push.ts` + `biometric.ts` + `haptics.ts` + `tts.ts` + `capture.ts` | Capacitor wrappers |
| `src/app/pages/JoinPage.tsx` | Pairing UI (modern + legacy paths + post-pair biometric setup) |
| `src/app/pages/ApprovalsScreen.tsx` | Primary-tab inbox with biometric-gated responses |
| `src/app/pages/CapturePage.tsx` | Camera + share-target capture surface |
| `src/app/components/InstanceSwitcher.tsx` + `InstanceTopBar.tsx` + `BottomSheet.tsx` + `QuickActionsFab.tsx` + `VoiceMode.tsx` | UI primitives |
| `tests/app/enrollment-link.test.ts` + `enrollment-service.test.ts` | 16 tests on URL parsing + signature contract |
| `ios-templates/` | `Info.plist`, `PrivacyInfo.xcprivacy`, `App.entitlements`, `Podfile` to overlay onto Mac-generated iOS project |

**Distribution** — Android: Google Play (standard), Managed Google Play, sideload APK, optional F-Droid. iOS: App Store, TestFlight, Custom Apps via Apple Business Manager, Unlisted Apps. PWA served at `/app/` from the instance.

---

## Knowledge Layers & Vision

ANTON has a **6-layer vision** — each layer independently valuable, each makes the next more powerful:

1. **Individual ANTON** — pillars, modules, 7-layer prompts (DONE)
2. **Intelligent ANTON** — knowledge atoms, pattern detection, predictions, calibration (Markets is the proof) (MOSTLY DONE)
3. **Network** — Community tab, E2E messaging, contact hashes, trust (BUILT)
4. **Collaborative Intelligence** — ANTON-to-ANTON via the Agent Protocol (Specialized Agents are the foundation) (IN PROGRESS)
5. **Marketplace** — `.anton` bundle trading, rating, discovery (NOT STARTED)
6. **Economy** — FutureChain payments, expertise as income (NOT STARTED — integration spec exists)

When adding features, ask: *which layer does this serve, and does it make the next layer more powerful?*

---

## Key Modules & Features

- **Gap Assessment Wizard** — 8-step framework compliance assessment with iteration support
- **Counsel's Desk** — Legal research workspace with citation tracking
- **Orchestrator** — AI signal detection, pattern analysis, reasoning trails
- **Task Agent** — AI task queue with proposal/confirmation workflow
- **Knowledge Packs** — Importable regulatory knowledge bundles (.anton format)
- **Engagement Workspace** — Full engagement lifecycle management
- **Data Partnerships** — Roaring (Nordic entity data) + Dow Jones (screening) integrations
- **550+ Expert Modules** — Across FCP, legal, healthcare, finance, PE/VC, education, NGO, creative
- **School Mode** — Educational interface with teacher oversight
- **Multi-format Export** — Every output exportable to md/docx/xlsx/pdf/pptx
- **Memory (knowledge atoms)** — module runs (never open chat) store their output in `workflow_outputs` with a learning ledger (`learning_status` pending → summarised → learned / skipped / failed); the summary + extraction run after the SDK slot is released and an hourly sweep (`server/services/memory-sweep.ts`, `MEMORY_SWEEP_DISABLED`) finishes refused ones. The extractor (`atom-extractor.ts`) records entities, drops `status.*` chatter, dedupes by `content_hash` and sets `owner_user_id`. Injection into Work runs goes through `server/services/atom-injection-gate.ts` (Settings `atom_injection_mode`: auto | on | off; auto waits for 100 module atoms + 30 ratings) via `buildAtomLayerDetailed`; injected atom ids ride in `contextUsed.atoms` and `retrieval_feedback.message_id`. Atom lifecycle (supersede / deactivate / delete / subject-search / by-subject erasure) lives in `server/routes/knowledge.ts`. After every answer `session-conclusion.ts` writes the session's conclusion (one `session_snapshots` row per answer + `sessions.summary`; the "Session conclusion" panel reads it); `project-context.ts` reads those, the matter brief and the engagement of the project. The Gap Assessor, engagement iterations and mission tasks feed the same ledger. Settings → "Memory & governance" (`/api/settings/memory-governance`) holds `atom_injection_mode`, `oversight_blocks_export` and `structured_extraction_auto`.
- **Run record, replay and governance (Waves 5–6)** — every engine path writes `run_artifacts` (message runs plus agentic `gap_batch` / `task_step` / `engagement_step` parents, with `run_tool_calls`; `server/services/run-artifact-writer.ts`, read via `/api/run-artifacts/*`). `POST /api/rerun` with `mode: 'replay'` sends the stored prompt byte-for-byte to the served model and fails closed when that model is gone. The two deepest thinking levels run as revelation chains through the router on every Claude engine. The agentic runner wraps tool results as untrusted data and hands the subprocess an allow-listed environment; `sdk_daily_run_cap` caps subscription runs. After every answer the seven Work compliance rules run (`server/services/compliance-on-completion.ts`, setting `compliance_on_completion`); every changing API request writes `audit_events`; `callChat({ purpose })` audits utility calls. Team mode checks per-role module access (`server/services/module-access.ts`). Module bundles embed skill and persona text and block on injection findings unless `acceptInjectionFindings` is sent. `tests/lint/no-router-bypass.test.ts` fails on a new `getClient()` / `new Anthropic` / `callSync` site; the embedding provider is pinned in app_settings (`server/services/embedding-pin.ts`).
- **Output Transformation System** (Phase 1) — Post-hoc renderer registry + Transform Panel. Every module run produces Markdown + a structured JSON payload (via Haiku-based extractor, cached by content hash); renderers are declared in `server/services/renderer-registry.builtin.ts` and filtered per-session by content type + required fields. Built-in renderers: the 5 existing exports + Mermaid flowchart / Gantt / sequence / mindmap, SVG risk heatmap, executive one-pager, plain-language, board deck, standalone HTML, devil's advocate + regulator's-eye reviews. Adding a new format = a single file in `server/services/renderers/` + a registry entry.

---

## Environment Variables

See `.env.example` for the complete list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key from console.anthropic.com |
| `DATABASE_URL` | Yes | PostgreSQL connection (e.g. `postgresql://anton:anton@localhost:5432/anton`) |
| `PORT` | No | Express port (default: 3001) |
| `DEPLOYMENT_MODE` | No | `solo` (default) or `team` (JWT auth) |
| `OPENAI_API_KEY` | No | Enables GPT models |
| `AZURE_OPENAI_ENDPOINT` | No | Azure OpenAI base URL (e.g. `https://my-resource.openai.azure.com`) |
| `AZURE_OPENAI_API_KEY` | No | Azure OpenAI API key |
| `GOOGLE_API_KEY` | No | Enables Gemini models |
| `MISTRAL_API_KEY` | No | Enables Mistral models |
| `OLLAMA_BASE_URL` | No | Local Ollama endpoint (default: localhost:11434) |
| `MAX_CONTEXT_TOKENS` | No | Max context window (default: 900000) |
| `ALLOWED_FOLDER_PATHS` | No | Comma-separated whitelist for filesystem-connector access |
| `VECTOR_BACKEND` | No | Embeddings-table vector engine: `sqlite` (default, in-process JS cosine) or `pgvector` (Postgres HNSW; needs the pgvector extension + `POST /api/embeddings/backfill-vec`). Auto-falls back to JS if unavailable. |
| `MARKETS_AUTOMATION` | No | `true` opts in to the token/data-spending markets crons (~20 jobs). Unset = only free deterministic loops run. The `MARKETS_*_DISABLED` flags below are finer overrides within an enabled tier. |
| `MARKETS_SCHEDULE_DISABLED` | No | `true` schedules no Markets job at all — the free deterministic loops (NAV, verifier, calibration, sweeps, leaderboards, triggers, boot/resume catch-up, the nightly Markets MV refresh) as well as the fetching/AI tiers. Stored data stays readable; UI-started actions still run. Restart to apply. |
| `MARKETS_THINKING_DISABLED` | No | `true` pauses every LLM-spending markets phase. Free phases (NAV, prices, prediction checkpoints, event triggers, MV refreshes) keep running. Markets LLM calls run on the Settings → "Markets AI model" choice (app_settings `markets_model`, e.g. `sdk:claude-opus-5` for subscription auth); unset falls back to the utility model. |
| `MARKETS_FETCH_DISABLED` | No | `true` pauses every external markets data fetch (FMP, news, RSS). |
| `MARKETS_REBALANCE_SHADOW` | No | `true` records what scheduled rebalancing WOULD trade without moving any holding, so prediction→portfolio attribution accrues before anything is risked. Only active while `MARKETS_AUTOREBALANCE_DISABLED=true`; the two are alternatives, not layers. Shadow rows carry `trigger_type='shadow'` and are reported apart from executed P&L in Markets → Learning → Portfolio Impact. |
| `RADAR_AUTOMATION_DISABLED` | No | `true` disables radar auto-scan + scheduled radar cron. Manual UI scans still work. |

---

## Commands

```bash
pnpm install            # Install dependencies
pnpm run dev            # Start dev (Vite :5183 + Express :3001)
pnpm run build          # Production build
pnpm run start          # Serve production build
pnpm run db:init        # Initialize PostgreSQL schema
pnpm run db:migrate:pg  # Run pending migrations against PostgreSQL
pnpm run typecheck      # TypeScript type check
pnpm run test           # Vitest unit tests
pnpm run test:e2e       # Playwright E2E tests
```

---

## Security

1. **API keys server-side only.** Never expose provider keys to the frontend.
2. **Folder path whitelist.** `ALLOWED_FOLDER_PATHS` restricts filesystem access.
3. **safeError() always.** Strips stack traces and sensitive data from error responses.
4. **No shell injection.** Use `execFile` with args arrays, never `shell: true`.
5. **No PII in logs.** Log IDs and event types only.
6. **Parameterized SQL.** All queries use prepared statements.
7. **Single sign-on (team mode).** OpenID Connect, built for Microsoft Entra ID. The decisions live in `server/services/oidc-sso.ts`; the redirect flow is in `server/routes/auth.ts`; IT's guide is `docs/deployment/entra-id-sso.md`.
   - **Identity:** an identity is a `user_identities` row keyed on issuer + subject. For Entra that is `oid`, with the issuer rebuilt from `tid`. Never key on email.
   - **Email:** an email links a pre-SSO account only once, only if verified, and only to an account an administrator created (one with a password). The link removes that password.
   - **No passwords:** an account with an SSO identity cannot sign in with a password, reset one, or have one set by an admin.
   - **Roles:** with `OIDC_ROLE_MAP` set, the directory decides the role at every sign-in, including demotion to `OIDC_DEFAULT_ROLE`.
   - **Switched-off accounts:** `users.disabled_at` ends sessions (`authMiddleware` joins on it).
   - **Tokens:** every JWT carries a unique `jti`, and its lifetime is `JWT_EXPIRY`.
   - **Sign-in binding:** the one-time exchange code is bound to the browser by the `anton_auth_binder` cookie, and the flow uses PKCE plus a browser-bound `anton_oidc_state` cookie.
   - **Tests:** `tests/services/oidc-sso.test.ts`, plus `tests/routes/sso-oidc-flow.test.ts` (a fake Entra-shaped IdP, on a test database).
8. **One person's data stays theirs (team mode).** On a shared server every route that reads or changes a user's rows checks the owner. The helpers are in `server/middleware/ownership.ts` (`scopesToOwner`, `ownerFilter`, `assertOwned`) and, for embedded content, `server/services/hybrid-search.ts` (`searchScopeForRequest`, `atomOwnerSql`, `strictOwnerSql`, `filterOwnedByScope`).
   - **Who is scoped:** solo mode and team admins are never scoped; every other team user is.
   - **Where the check runs:** in SQL, before the row is loaded. A row the caller may not see answers the same 404 as a missing one, never a 403.
   - **Ids from the client:** a `sessionId`, `conversationId` or `projectId` in a request body is checked like one in the path. A session that is not the caller's is treated as absent.
   - **Knowledge atoms:** a user reads their own atoms plus shared ones (`owner_user_id` NULL); only admins change shared atoms. Every atom writer sets the owner.
   - **What never leaves the instance:** hives, peers and delegated tasks get shared atoms only, and never a Code Studio atom (`coding_project_id` set), in solo mode too.
   - **Instance-wide actions are admin-only:** anything with no per-user owner, or that runs code on the host, uses `requireAdminOrSolo`. That covers brand and org context, the budget cap, knowledge packs, the orchestrator, embeddings maintenance, and Code Studio and hardware tool runs.
   - **The server's disk and ANTON's own database:** a path from a request goes through `checkFolderPath` (`server/lib/folder-guard.ts`), in every mode. On a team server, only admins can read or write server files or export into the database, whether through `/api/data` or a workflow data step. Such an export writes only into tables listed in `DATA_EXPORT_TABLES`. An agent `database` connector with no connection string reads ANTON's database, so it:
     - never reads account, credential or settings tables (`forbiddenLocalTable` in `server/services/agent-connector-executor.ts`);
     - runs read-only, with a 5-second statement timeout;
     - on a team server, runs only for an admin's agent.
   - **Projects:** membership (`project_members`) decides access. An invitation is valid only while its sender may still give the role, and that is re-checked when it is accepted, including at sign-in.
   - **Tests:** a new owned surface gets a team-mode test with a negative control (the owner, an admin and solo still see the row). See `tests/routes/team-isolation-round*.test.ts` and `tests/db/*owner-scope*.db.test.ts`.

---

## Using This Project with Claude

This project was built with Claude Code. To contribute using Claude:

1. **Claude Code CLI** — Clone the repo, run `claude` in the project root. Claude reads this `CLAUDE.md` automatically.
2. **Claude in Cursor/Windsurf** — The `AGENTS.md` file provides universal AI assistant context.
3. **Claude API** — The project itself uses Claude's streaming API with extended thinking. See `server/services/claude-client.ts` for the integration pattern.

Claude is the default model for all modules. When adding new modules, follow the pattern in `src/lib/constants.ts` and create a system prompt in `server/prompts/`.
