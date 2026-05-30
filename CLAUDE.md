# CLAUDE.md — ANTON by openEXPERT v0.7.5

Instructions for Claude Code, Claude in Cursor, and any AI coding assistant that reads `CLAUDE.md`.

---

## Project Identity

**Name:** ANTON by openEXPERT
**Package:** `openexpert` v0.7.5
**Purpose:** AI-powered expert workspace for 55+ professional domains. Local-first web application that enables consultants, lawyers, compliance officers, analysts, and domain experts to leverage frontier LLMs through a structured, guided interface — no command-line knowledge required.
**Primary users:** Domain professionals aged 35-65 who need reliable, structured AI output.
**Deployment:** Local-first. Runs on `localhost`. Documents stay on the machine. Only LLM API calls leave the network.
**Primary AI:** Anthropic Claude (`claude-opus-4-8` default). Multi-LLM support for OpenAI, Azure OpenAI, Gemini, Mistral, and Ollama.
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

# 3. Install Ollama (optional — local LLM models + institutional-memory embeddings)
#    NOTE: vector RAG search uses OpenAI (text-embedding-3-small via ChromaDB) and needs
#    OPENAI_API_KEY; without it, knowledge search falls back to keyword. nomic-embed-text
#    below powers institutional-memory/atom embeddings only, not the RAG query path.
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
| Primary AI | Anthropic Claude | claude-opus-4-8 (Opus 4.8) |
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
│   ├── db/                   schema.sql, init.ts, migrations/ (043+)
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
| `src/lib/constants.ts` | All 150+ module definitions — IDs, labels, defaults, area groupings |
| `src/lib/types.ts` | All shared TypeScript types |
| `src/lib/output-format-definitions.ts` | 40+ output format configs with prompt instructions |
| `server/db/schema.sql` | Full database schema — source of truth for all tables |
| `server/db/init.ts` | Database initialization + migration runner |
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
| Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-4-8` | Built-in (`claude-client.ts`) |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` | `server/services/model-adapter.ts` |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` | (per deployment) | `server/services/adapters/azureOpenaiAdapter.ts` |
| Google | `GOOGLE_API_KEY` | `gemini-2.0-flash` | `server/services/model-adapter.ts` |
| Mistral | `MISTRAL_API_KEY` | `mistral-large-latest` | `server/services/model-adapter.ts` |
| Ollama | `OLLAMA_BASE_URL` | User-selected | `server/services/model-adapter.ts` |

Azure OpenAI supports reasoning models (o3, o4-mini) with effort mapping, multi-deployment config (stored in `azure_openai_config` / `azure_openai_deployments` tables), and SSE streaming.

Set the API key in `.env` to enable each provider. Users switch models in the UI per session.

### Thinking Levels

| Level | Description | Claude Opus 4.8 | Sonnet/Haiku |
|---|---|---|---|
| `quick` | No deep reasoning | `effort: 'low'` | thinking disabled |
| `think` | Standard reasoning | `effort: 'medium'` | `budget_tokens: 4096` |
| `think_hard` | Deep reasoning | `effort: 'high'` | `budget_tokens: 16384` |
| `investigate` | Maximum reasoning | `effort: 'max'` | `budget_tokens: 32768` |
| `plan_first` | Plan then execute | `effort: 'max'` | `budget_tokens: 32768` |

For `claude-opus-4-8`, always use `thinking: { type: 'adaptive' }` with `output_config: { effort }` as a **separate** top-level parameter. Never put `effort` inside `thinking`. Never set `budget_tokens` for Opus.

### Export Pipeline

| Format | Library | Features |
|---|---|---|
| `.md` | Native | Default. Source of truth. |
| `.docx` | `docx` npm | ANTON branding, headings, tables, ToC |
| `.xlsx` | `exceljs` | Conditional formatting (RAG), auto-filters, formulas |
| `.pdf` | `pdfkit` | Professional typography, page numbers |
| `.pptx` | `pptxgenjs` | Slide decks with speaker notes |
| `.fountain` | Custom | Screenplay format (FDX export) |

---

## Coding Patterns

### 1. SQL: Parameterized Queries Only

```typescript
// Correct
db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

// NEVER — SQL injection risk
db.prepare(`SELECT * FROM sessions WHERE id = '${sessionId}'`).get();
```

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

```typescript
import { safeError } from '../lib/error-response.js';

catch (err) {
  const { status, message } = safeError(err);
  res.status(status).json({ error: message });
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
| **Work** | Default — 150+ expert modules for professional domains | `src/lib/constants.ts` (modules), `src/pages/ModulePage.tsx` |
| **School** | Educational interface with teacher oversight | `src/pages/school/`, `school-pages` chunk |
| **Life** | Personal-life modules (microfinance, BoP finance, consumer protection) | `src/pages/life/` |
| **Pathfinder** | Mode-aware research assistant ("smart action bar") | `src/pages/pathfinder/`, `server/services/pathfinder-engine.ts` |
| **Markets** | Financial intelligence, instrumented for learning — 14 migrations, 21 services, 39 Python computation templates, ANTON 100 indexes, predictions, calibration | `server/services/market-*.ts`, `server/db/migrations-pg/049–062`, `src/pages/markets/` |
| **Community** | E2E-encrypted ANTON-to-ANTON messaging, contact hashes, trust scoring | `server/services/community-*.ts`, `src/pages/community/` |
| **Procure** | Procurement cycles, vendor evaluation, criteria scoring, contract tracking | `server/services/procure-service.ts`, migration `091_procure_pillar.sql` |
| **Civic** | Civic engagements, eligibility checks, document submissions, knowledge packs | `server/services/civic-service.ts`, migration `092_civic_pillar.sql` |
| **Grow** | CRM-style: contacts, pipeline stages, opportunities, signals, briefings | `server/services/grow-service.ts`, migration `093_grow_pillar.sql` |
| **Payments** | FutureChain wallet & marketplace integration | `src/pages/payments/`, `server/routes/fc-marketplace.ts` |
| **Portals** | User-created ANTON-only web spaces with capability descriptors. 8-phase walkthrough builder, 7 starter templates, 12-verb capability taxonomy, registry protocol with transparency log, `anton-portal` Pathfinder mode. Full e2e: build → publish → visit → invoke. | `server/services/portals/*`, `server/services/registry-protocol/*`, `server/services/registry-client/*`, `server/services/capability-descriptor/*`, `server/routes/portals.ts`, `src/pages/portals/`, migrations `145–148` |
| **Missions** | Multi-step automation jobs (research / outreach / monitoring) with credential vault + service packs + inbox | `src/pages/missions/`, `server/routes/mission-*.ts` |

The Markets Pillar is ANTON's **testbed for self-learning intelligence** — daily market feedback is wired to validate predictions and reasoning quality (effectiveness is under active validation; live accuracy is not yet better than chance — see `docs/PORTFOLIO_AUDIT_2026-05-30.md`). Markets is the canonical example for any new "intelligent pillar."

The Portals Pillar is ANTON's **proof of inter-instance interoperability** — every portal is simultaneously a human-facing site and a machine-readable AAP endpoint. See `ANTON_Portals_Spec.md` v0.2 + the three companion reference docs (Registry Protocol, Capability Descriptor Schema, Registry Server Ops) for the full design.

---

## Risk Atlas (universal seven-stage threat-path methodology)

The Risk Atlas generalises the CASP BWRA threat-path methodology into a universal causal-chain risk engine that any business — bakery to bank — can use to maintain a living risk register. It's the canonical example of how Atlas-style "deterministic engine + LLM-rationale" workspaces are built in ANTON.

**Core methodology (deterministic).** Stages 1-7: Exposures → Threat paths → Vulnerabilities → Inherent risk (= max(E, T, V)) → Controls (Strong / Adequate / Weak rolled up worst-of) → Residual (= inherent − reduction, clamped [1,5]) → Appetite (5x5 grid: 1-2 within / 3 boundary / 4 outside / 5 unacceptable). The LLM never decides residual scores — only the rationale around them. Audit-defensible by construction.

**Data model.** Migrations `125_risk_atlas_foundation.sql` → `129_risk_atlas_addendum_review_fixes.sql` define 18 tables: `risk_atlases`, `atlas_threat_paths`, `atlas_exposure_points`, `atlas_vulnerabilities`, `atlas_controls`, `atlas_inherent_scores`, `atlas_residual_scores`, `atlas_appetite_statements`, `atlas_escalation_triggers`, `atlas_review_cycles`, `atlas_industry_packs`, `atlas_events`, `atlas_fcp_scope`, `atlas_cross_domain_path_bundles` and members.

**Industry packs (25).** Composable `.anton` overlays under `data/risk-atlas/packs/` with three `pack_kind` types: `industry` (sme-general, fcp-bank, fcp-casp, sector-*, etc.), `fcp-domain` (fcp-domain-amlcft / sanctions / fraud / abc / market-abuse / tax-evasion-facilitation / export-controls), `overlay` (universal-fcp-core). Inheritance via `parent_pack_id` with cycle protection in `getPackContent`.

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
| `server/areas/risk/modules/atlas-*` | 7 atlas-* modules — Stage 1-7 LLM specialisations. |
| `server/areas/risk/modules/atlas-company-appetite-consolidator/` | Stage 7b — board-readable rollup. |
| `server/areas/fcp/modules/business-wide-risk-assessment/` | AMLR Article 16 BWRA — orchestrates atlas-* modules. |
| `server/areas/fcp/modules/fcp-scope-assessor/` | AI-guided FCP-domain activation. |

**Mission template.** `tmpl_amlr_readiness_v1` (`server/services/missions/seed-templates.ts`) is the 10-task end-to-end programme for an AMLR-obliged entity: scope → Atlas → BWRA → gap analysis → policies → training → audit, with four explicit checkpoints.

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
- **150+ Expert Modules** — Across FCP, legal, healthcare, finance, PE/VC, education, NGO, creative
- **School Mode** — Educational interface with teacher oversight
- **Multi-format Export** — Every output exportable to md/docx/xlsx/pdf/pptx
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
| `MARKETS_THINKING_DISABLED` | No | `true` pauses every LLM-spending markets phase. Free phases (NAV, prices, prediction checkpoints, event triggers, MV refreshes) keep running. |
| `MARKETS_FETCH_DISABLED` | No | `true` pauses every external markets data fetch (FMP, news, RSS). |
| `RADAR_AUTOMATION_DISABLED` | No | `true` disables radar auto-scan + scheduled radar cron. Manual UI scans still work. |

---

## Commands

```bash
pnpm install            # Install dependencies
pnpm run dev            # Start dev (Vite :5173 + Express :3001)
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

---

## Using This Project with Claude

This project was built with Claude Code. To contribute using Claude:

1. **Claude Code CLI** — Clone the repo, run `claude` in the project root. Claude reads this `CLAUDE.md` automatically.
2. **Claude in Cursor/Windsurf** — The `AGENTS.md` file provides universal AI assistant context.
3. **Claude API** — The project itself uses Claude's streaming API with extended thinking. See `server/services/claude-client.ts` for the integration pattern.

Claude is the default model for all modules. When adding new modules, follow the pattern in `src/lib/constants.ts` and create a system prompt in `server/prompts/`.
