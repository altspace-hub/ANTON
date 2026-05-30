# AGENTS.md — ANTON by openEXPERT v0.7.5

Universal AI assistant context file. Read by GitHub Copilot, Cursor, Windsurf, OpenAI Codex,
Claude Code, and any tool that follows the `AGENTS.md` convention. This is the authoritative
reference for AI coding assistants working in this repository.

For tool-specific files: see `CLAUDE.md` (Claude Code), `MISTRAL.md` (Mistral), `GEMINI.md` (Gemini).

---

## What Is This Project?

**ANTON by openEXPERT** is an AI-powered expert workspace for 55+ professional domains. It is a
local-first web application that lets consultants, lawyers, compliance officers, analysts, and
domain experts use frontier LLMs through a structured, guided interface — no command-line
knowledge required.

**Key facts:**
- **150+ expert modules** across finance, legal, healthcare, PE/VC, education, NGO, creative
- **Multi-LLM:** Anthropic Claude (default), OpenAI, Azure OpenAI, Google Gemini, Mistral, Ollama (local)
- **Local-first:** runs on `localhost`. Documents stay on the machine. Only LLM API calls leave the network
- **Multi-format export:** every output exportable to Markdown, Word (.docx), Excel (.xlsx), PDF, PowerPoint (.pptx)
- **PostgreSQL** is the only supported database (the repo migrated from SQLite — no SQLite code in new work)
- **Companion App** (PWA + Android) at `src/app/` for end-users on phones

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
| Database | **PostgreSQL** | **16+** |
| PG driver | `pg` | ^8.18 |
| Primary AI | Anthropic Claude | claude-opus-4-8 |
| Multi-LLM | OpenAI, Azure OpenAI, Gemini, Mistral, Ollama | — |
| File processing | mammoth (docx), pdf-parse, xlsx | — |
| Export | docx, exceljs, pdfkit, pptxgenjs, fountain | — |
| Companion App wrapper | Capacitor (Android) | — |
| Testing | Vitest + Playwright | — |
| Package manager | pnpm | 10 |

---

## Quick Start

### Prerequisites

1. **Node.js v22+**
2. **pnpm 10** (`npm install -g pnpm`)
3. **PostgreSQL 16+** ([download](https://www.postgresql.org/download/))
4. **Ollama** (optional, only for local embedding model) — [download](https://ollama.com)

### Automatic setup (recommended)

```bash
git clone <repo> && cd openexpert
setup-anton.bat                                       # Windows
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1   # PowerShell
```

The wizard checks Node/pnpm, asks for your Anthropic API key, auto-detects PostgreSQL,
creates the `anton` user + database, installs dependencies, pulls the embedding model,
and initializes the schema.

### Manual setup

```bash
# 1. Clone & install
git clone <repo> && cd openexpert
pnpm install

# 2. Create the PostgreSQL database
psql -U postgres
CREATE USER anton WITH PASSWORD 'anton';
CREATE DATABASE anton OWNER anton;
\q

# 3. Configure environment
cp .env.example .env
# Required:
#   ANTHROPIC_API_KEY=sk-ant-...
#   DATABASE_URL=postgresql://anton:anton@localhost:5432/anton

# 4. Initialize the schema (runs all PG migrations)
pnpm run db:init

# 5. Start dev
pnpm run dev          # Vite :5173 + Express :3001
```

### Required environment variables

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Enables Claude (default AI). Get one at console.anthropic.com |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `OPENAI_API_KEY` | No | Enables GPT-4o and GPT-4o-mini |
| `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` | No | Enables Azure OpenAI deployments (incl. o3, o4-mini) |
| `GOOGLE_API_KEY` | No | Enables Gemini 2.0 Flash |
| `MISTRAL_API_KEY` | No | Enables Mistral Large |
| `OLLAMA_BASE_URL` | No | Enables local Ollama models (default: http://localhost:11434) |
| `DEPLOYMENT_MODE` | No | `solo` (default, no auth) or `team` (JWT auth) |
| `ALLOWED_FOLDER_PATHS` | No | Comma-separated whitelist for filesystem-connector access |

See `.env.example` for the full list.

---

## Directory Map

```
/
├── server/
│   ├── index.ts                Express entry point — all routes mounted here
│   ├── routes/                 70+ API route files (factory pattern)
│   ├── services/               80+ service files (single-responsibility)
│   │   ├── claude-client.ts    Claude API wrapper
│   │   ├── model-adapter.ts    Multi-LLM adapter (OpenAI, Gemini, Mistral, Ollama)
│   │   ├── adapters/azureOpenaiAdapter.ts   Azure OpenAI (with o3 reasoning)
│   │   ├── prompt-builder.ts   Assembles prompts from all knowledge layers
│   │   ├── connection-manager.ts   Connector CRUD + audit logging
│   │   ├── agent-service.ts    Specialized Agents (CRUD)
│   │   ├── agent-processor.ts  Agent conversation processor
│   │   ├── agent-connector-executor.ts   Live API/DB calls from agent tool calls
│   │   ├── remote-agent-client.ts        Cross-instance agent discovery & query
│   │   ├── pathfinder-engine.ts          Pathfinder pillar engine
│   │   ├── procure-service.ts            Procure pillar
│   │   ├── civic-service.ts              Civic pillar
│   │   ├── grow-service.ts               Grow pillar
│   │   └── market-*.ts                   21+ Markets pillar services
│   ├── connections/            Filesystem / DB / API / messaging adapters
│   ├── db/
│   │   ├── schema.sql          Source of truth for the schema
│   │   ├── init-postgresql.ts  PG initialization
│   │   ├── migrations-pg/      90+ PostgreSQL migrations (numbered, run on startup)
│   │   └── database.ts         DatabaseAdapter interface
│   ├── middleware/             auth.ts, rate-limit.ts, csrf.ts
│   ├── lib/                    error-response.ts (safeError), schemas.ts, telemetry.ts
│   ├── prompts/                30+ system prompt .md files (per module)
│   └── computation-templates/  39 Python templates for Markets pillar
├── src/                        Main React app (the desktop/web workspace)
│   ├── App.tsx                 All routes — lazy-loaded
│   ├── components/             shared/ + layout/ + engagement/ + modules/
│   ├── pages/                  60+ page components, including agents/, markets/, community/, school/
│   ├── stores/                 Zustand stores (use<Name>Store.ts)
│   ├── hooks/                  useClaude, useFileUpload, useExport
│   ├── lib/                    types.ts, constants.ts, api.ts, output-format-definitions.ts
│   ├── features/               intelligence/, connections/, knowledge/
│   ├── theme/                  colors.ts (ANTON design system)
│   └── index.css               OKLCH theme variables — light/dark/corporate
├── src/app/                    Companion App (separate Vite build)
│   ├── main.tsx, App.tsx       Entry
│   ├── pages/                  15 screens (Welcome, Join, Home, Chat, Schedule, Tasks, ...)
│   ├── components/             TabBar, ChatBubble, VoiceInput, ...
│   └── services/               api.ts, identity.ts, query.ts, theme.ts, offline.ts
├── android/                    Capacitor Android wrapper for the Companion App
├── data/
│   ├── frameworks/             Regulatory framework JSON files
│   └── knowledge-packs/        Importable .anton bundles
├── electron/                   Optional desktop wrapper
├── public/                     Static assets, locales/ (30 languages), anton-logo.svg
├── docs/                       Developer documentation
├── tests/                      Playwright E2E, load tests
└── .env.example                Every environment variable documented
```

---

## Critical Files to Know

| File | Purpose |
|---|---|
| `src/lib/constants.ts` | All 150+ module definitions — IDs, labels, defaults, area groupings |
| `src/lib/types.ts` | All shared TypeScript types |
| `src/lib/output-format-definitions.ts` | 40+ output format configs with prompt instructions |
| `src/index.css` | OKLCH theme variables — `:root` (dark), `html.light`, `html.corporate` |
| `src/stores/useSettingsStore.ts` | Theme + app-mode + LLM defaults (light is the default theme) |
| `server/db/schema.sql` | Full database schema — source of truth |
| `server/db/init-postgresql.ts` | PostgreSQL initialization |
| `server/db/migrations-pg/` | All numbered migrations (90+); run on startup |
| `server/index.ts` | Express entry — all routes, middleware, SSE streaming |
| `server/services/claude-client.ts` | Claude API wrapper (streaming, thinking, web search) |
| `server/services/model-adapter.ts` | Multi-LLM adapter (OpenAI, Gemini, Mistral, Ollama) |
| `server/services/adapters/azureOpenaiAdapter.ts` | Azure OpenAI adapter |
| `server/services/prompt-builder.ts` | Assembles prompts from all knowledge layers |
| `server/services/connection-manager.ts` | Connector CRUD + audit logging (`logAction`) |
| `.env.example` | Every environment variable documented |

---

## Pillars

ANTON is organised into top-level **pillars** the user switches between via the App Mode toggle (`useSettingsStore.appMode`):

| Pillar | Purpose |
|---|---|
| **Work** | Default — 150+ professional modules |
| **School** | Educational interface with teacher oversight |
| **Life** | Personal-life modules (microfinance, BoP finance, consumer protection) |
| **Pathfinder** | Mode-aware research assistant — `server/services/pathfinder-engine.ts` |
| **Markets** | Self-learning financial intelligence — 14 migrations, 21 services, 39 Python templates, ANTON 100 indexes, predictions, calibration |
| **Community** | E2E-encrypted ANTON-to-ANTON messaging, contact hashes, trust scoring |
| **Procure** | Procurement cycles, vendor evaluation, contracts (`procure-service.ts`) |
| **Civic** | Civic engagements, eligibility checks, knowledge packs (`civic-service.ts`) |
| **Grow** | CRM-style: contacts, pipeline, opportunities, signals (`grow-service.ts`) |
| **Payments** | FutureChain wallet & marketplace integration |

The Markets Pillar is ANTON's **proof of self-learning intelligence** — daily market feedback validates predictions and reasoning quality. Use it as the canonical example when building any new "intelligent pillar."

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

DB tables (migration `111_specialized_agents.sql`): `agent_profiles`, `agent_conversations`, `agent_messages`, `agent_connectors`, `agent_templates`, `agent_audit_log`.
Connector types: `rest_api`, `webhook`, `database`, `email`, `calendar`, `crm`, `erp`.

---

## Companion App (PWA + Android)

A separate React app for phone/tablet end-users. Lives at `src/app/`. Built with its own
Vite config (`vite.config.app.ts` → `dist/app/`) and wrapped as Android APK/AAB via Capacitor.

- **Talks to the main server** via REST query-sync at `/api/app/*` (gateway: `server/routes/app-gateway.ts`, migration `094_app_gateway.sql`)
- **Identity:** Ed25519 keypair stored in Capacitor secure storage
- **15 screens:** Welcome → Join (QR) → Connections → Home / Chat / Schedule / Tasks / Search / Markets / Radar / History / Profile / Settings
- **3 themes** (dark/light/corporate), 30 languages, offline cache + message queue
- **Connection flow:** admin generates an invitation QR in the main app's `/app-gateway` page; user scans → app extracts `anton://join?server=<url>&token=<code>` → registers → joins

The Companion App's defaults match the main app (light theme is the default).

---

## LLM Providers

| Provider | Env Variable | Default Model | Adapter File |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-4-8` | Built-in (`server/services/claude-client.ts`) |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` | `server/services/model-adapter.ts` |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_API_KEY` | (per deployment) | `server/services/adapters/azureOpenaiAdapter.ts` |
| Google | `GOOGLE_API_KEY` | `gemini-2.0-flash` | `server/services/model-adapter.ts` |
| Mistral | `MISTRAL_API_KEY` | `mistral-large-latest` | `server/services/model-adapter.ts` |
| Ollama | `OLLAMA_BASE_URL` | User-selected | `server/services/model-adapter.ts` |

All providers must go through the adapter — **never call provider SDKs directly from route handlers**. The adapter normalizes streaming, error mapping, and response shape.

### Model IDs

| Provider | Model ID | Notes |
|---|---|---|
| Anthropic | `claude-opus-4-8` | Default. Most capable. |
| Anthropic | `claude-sonnet-4-6` | Fast, efficient. |
| Anthropic | `claude-haiku-4-5-20251001` | Lightweight classification. |
| OpenAI | `gpt-4o` | Via OpenAI adapter |
| Azure | (deployment name) | Via Azure adapter; supports o3/o4-mini reasoning |
| Google | `gemini-2.0-flash` | Via Gemini adapter |
| Mistral | `mistral-large-latest` | Via Mistral adapter |
| Ollama | (user-selected) | Local models |

### Thinking Levels (Claude-specific)

| Level | Description | Opus 4.8 | Sonnet/Haiku |
|---|---|---|---|
| `quick` | Fast, no deep reasoning | `effort: 'low'` | thinking disabled |
| `think` | Standard reasoning | `effort: 'medium'` | `budget_tokens: 4096` |
| `think_hard` | Deep analysis | `effort: 'high'` | `budget_tokens: 16384` |
| `investigate` | Maximum depth | `effort: 'max'` | `budget_tokens: 32768` |
| `plan_first` | Plan then execute | `effort: 'max'` | `budget_tokens: 32768` |

For Opus 4.8: use `thinking: { type: 'adaptive' }` with `output_config: { effort }` as a **separate** top-level parameter. Never put `effort` inside `thinking`. Never set `budget_tokens` for Opus.

---

## Coding Patterns (Always Follow)

### 1. SQL: Parameterized Queries Only — PostgreSQL syntax

```typescript
// Correct (PG syntax with $1, $2, ...)
const { rows } = await db.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);

// NEVER — SQL injection risk
await db.query(`SELECT * FROM sessions WHERE id = '${sessionId}'`);
```

**No SQLite syntax in new code.** Don't use `?` placeholders, `db.prepare(...).get()`, or
`better-sqlite3` APIs. The `DatabaseAdapter` interface in `server/db/database.ts` is the
only way to talk to the database.

### 2. State: Zustand Stores

Global state lives in `src/stores/`. No Redux. No React Context for global state.

```typescript
import { create } from 'zustand';

interface MyStore { value: string; setValue: (v: string) => void; }

export const useMyStore = create<MyStore>()((set) => ({
  value: '',
  setValue: (v) => set({ value: v }),
}));
```

### 3. Pages: Lazy-Loaded

All page components in `src/pages/` must be lazy-loaded in `src/App.tsx`:

```typescript
const MyPage = React.lazy(() => import('./pages/MyPage'));
// Wrap routes in <Suspense fallback={<LoadingSpinner />}>
```

### 4. Express Routes: Factory Pattern

```typescript
import type { DatabaseAdapter } from '../db/database.js';

export function createMyRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  router.get('/:id', requireAuth, async (req, res) => { /* ... */ });
  return router;
}
```

### 5. Errors: safeError()

All catch blocks must use `safeError(err)` from `server/lib/error-response.ts`:

```typescript
import { safeError } from '../lib/error-response.js';

try { /* ... */ }
catch (err) {
  const { status, message } = safeError(err);
  res.status(status).json({ error: message });
}
```

### 6. TypeScript: No `any`

Strict mode enforced. Use `unknown` with type guards, or define proper interfaces. The CI build runs `tsc -b tsconfig.app.json` and fails on type errors.

### 7. Async DB Calls: Always `await`

Every method on the `DatabaseAdapter` returns a `Promise`. Forgetting `await` means you'll
hold a `Promise<T>` and call methods on it as if it were `T` — which compiles in some cases
but blows up at runtime. This was the #1 source of bugs during the SQLite → PostgreSQL
migration. If a TS error says *"Property X does not exist on type Promise<Y>"* — you forgot
an `await`.

### 8. Security: Path Validation

Before any `fs` operation on user-supplied paths, validate against `ALLOWED_FOLDER_PATHS`:

```typescript
const ALLOWED_BASES = (process.env.ALLOWED_FOLDER_PATHS ?? '').split(',');
const resolved = path.resolve(targetPath);
if (!ALLOWED_BASES.some(base => resolved.startsWith(path.resolve(base)))) {
  return res.status(403).json({ error: 'Folder access not permitted' });
}
```

### 9. Connectors: Use ConnectionManager + Audit

Filesystem / database / API connectors must go through `server/services/connection-manager.ts`
and call `manager.logAction(...)` after each operation. Never bypass this — the audit log is
how the user inspects what agents have done.

---

## Anti-Patterns (Never Do)

| Anti-pattern | Why | Alternative |
|---|---|---|
| SQLite syntax in new code | Project is PostgreSQL only | PG syntax via `DatabaseAdapter` |
| SQL string concatenation | SQL injection | `$1`, `$2` parameterized queries |
| TypeScript `any` | Breaks type safety | `unknown` + type guards |
| Missing `await` on DB calls | Runtime "Property X does not exist on Promise" | Always `await` adapter methods |
| Inline API keys | Security leak | `.env` variables |
| `shell: true` in spawn/exec | Shell injection | Args as array via `execFile` |
| `fs` without path validation | Path traversal | Validate against `ALLOWED_FOLDER_PATHS` |
| Calling provider SDKs from routes | Inconsistent streaming + error shape | Always go through `model-adapter.ts` / `claude-client.ts` |
| `console.log` with PII/tokens | Security audit failure | Log IDs and event types only |
| Eager-importing pages | Bundle bloat | `React.lazy()` + `Suspense` |
| Redux/Context for global state | Complexity | Zustand stores only |
| Bypassing `ConnectionManager` | Skips audit log | Call `manager.logAction(...)` after every operation |

---

## Vision — The 6 Layers

ANTON has a six-layer vision; each layer is independently valuable, each makes the next more powerful:

1. **Individual ANTON** — pillars, modules, 7-layer prompts (DONE)
2. **Intelligent ANTON** — knowledge atoms, pattern detection, predictions, calibration (Markets is the proof) (MOSTLY DONE)
3. **Network** — Community tab, E2E messaging, contact hashes, trust scoring (BUILT)
4. **Collaborative Intelligence** — ANTON-to-ANTON via the Agent Protocol (Specialized Agents are the foundation) (IN PROGRESS)
5. **Marketplace** — `.anton` bundle trading, rating, discovery (NOT STARTED)
6. **Economy** — FutureChain payments, expertise as income (NOT STARTED)

When adding features, ask: *which layer does this serve, and does it make the next layer more powerful?*

---

## Commands

```bash
pnpm install            # Install dependencies
pnpm run dev            # Start dev (Vite :5173 + Express :3001)
pnpm run build          # Production build (CI runs this — must pass)
pnpm run start          # Serve production build
pnpm run db:init        # Initialize PostgreSQL schema
pnpm run db:migrate:pg  # Run pending PG migrations
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
6. **Parameterized SQL.** All queries use `$1`, `$2` placeholders via the `DatabaseAdapter`.
7. **Connector audit.** Every connector operation logs to `connection_audit_log` via `manager.logAction()`.
8. **Credential vault.** Connector secrets are encrypted at rest via `server/services/credential-vault.ts`.

---

## Using This Project with Your AI Partner

This repository includes context files for multiple AI coding assistants:

| File | AI Tool | Notes |
|---|---|---|
| `CLAUDE.md` | Claude Code, Claude in Cursor | Deepest project context, design system |
| `AGENTS.md` | OpenAI Codex, GitHub Copilot, Cursor, Windsurf | Universal reference (this file) |
| `GEMINI.md` | Gemini Code Assist, Vertex AI | Gemini-specific notes |
| `MISTRAL.md` | Mistral Codestral, Le Chat | Mistral-specific notes |

All AI assistants should produce code that follows the patterns above. The multi-LLM adapter
in `server/services/model-adapter.ts` provides a unified interface — add new providers by
following the existing adapter pattern and the Azure OpenAI example at
`server/services/adapters/azureOpenaiAdapter.ts`.
