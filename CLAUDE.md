# CLAUDE.md — ANTON by openEXPERT v0.6.0

Instructions for Claude Code, Claude in Cursor, and any AI coding assistant that reads `CLAUDE.md`.

---

## Project Identity

**Name:** ANTON by openEXPERT
**Package:** `openexpert` v0.6.0
**Purpose:** AI-powered expert workspace for 55+ professional domains. Local-first web application that enables consultants, lawyers, compliance officers, analysts, and domain experts to leverage frontier LLMs through a structured, guided interface — no command-line knowledge required.
**Primary users:** Domain professionals aged 35-65 who need reliable, structured AI output.
**Deployment:** Local-first. Runs on `localhost`. Documents stay on the machine. Only LLM API calls leave the network.
**Primary AI:** Anthropic Claude (`claude-opus-4-6` default). Multi-LLM support for OpenAI, Gemini, Mistral, and Ollama.
**Design philosophy:** "Start with the problem, not the solution." Every module begins with a clear problem statement and pre-configured AI behaviour. Users can override everything, but the defaults should produce excellent results for someone who just clicks "Run."

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo> && cd openexpert
pnpm install

# 2. Install Ollama (required for knowledge memory)
# Download from https://ollama.com and install, then pull the embedding model:
ollama pull nomic-embed-text

# 3. Configure environment
cp .env.example .env
# Edit .env — add at minimum: ANTHROPIC_API_KEY=sk-ant-...
# Optional: add OPENAI_API_KEY, GOOGLE_API_KEY, MISTRAL_API_KEY for multi-LLM

# 4. Initialize database
pnpm run db:init

# 5. Start development
pnpm run dev          # Frontend (Vite :5173) + Backend (Express :3001)

# 6. Production build
pnpm run build && pnpm run start   # Serves at http://localhost:3001
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
| Database | SQLite (better-sqlite3) | 11 |
| Primary AI | Anthropic Claude | claude-opus-4-6 |
| Multi-LLM | OpenAI, Gemini, Mistral, Ollama | — |
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
| Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-4-6` | Built-in (`claude-client.ts`) |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` | `server/services/model-adapter.ts` |
| Google | `GOOGLE_API_KEY` | `gemini-2.0-flash` | `server/services/model-adapter.ts` |
| Mistral | `MISTRAL_API_KEY` | `mistral-large-latest` | `server/services/model-adapter.ts` |
| Ollama | `OLLAMA_BASE_URL` | User-selected | `server/services/model-adapter.ts` |

Set the API key in `.env` to enable each provider. Users switch models in the UI per session.

### Thinking Levels

| Level | Description | Claude Opus 4.6 | Sonnet/Haiku |
|---|---|---|---|
| `quick` | No deep reasoning | `effort: 'low'` | thinking disabled |
| `think` | Standard reasoning | `effort: 'medium'` | `budget_tokens: 4096` |
| `think_hard` | Deep reasoning | `effort: 'high'` | `budget_tokens: 16384` |
| `investigate` | Maximum reasoning | `effort: 'max'` | `budget_tokens: 32768` |
| `plan_first` | Plan then execute | `effort: 'max'` | `budget_tokens: 32768` |

For `claude-opus-4-6`, always use `thinking: { type: 'adaptive' }` with `output_config: { effort }` as a **separate** top-level parameter. Never put `effort` inside `thinking`. Never set `budget_tokens` for Opus.

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

Dark theme by default. Professional, calm, trustworthy — for senior professionals.

```typescript
const antonTheme = {
  'adv-dark':      '#0B1426',   // Main background
  'adv-dark-2':    '#0F1B2D',   // Secondary background
  'adv-card':      '#152238',   // Card/panel backgrounds
  'adv-teal':      '#2DD4A8',   // Primary accent — CTAs, active states
  'adv-teal-dark': '#1BA882',   // Hover states
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

---

## Environment Variables

See `.env.example` for the complete list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key from console.anthropic.com |
| `PORT` | No | Express port (default: 3001) |
| `DEPLOYMENT_MODE` | No | `solo` (default) or `team` (JWT auth) |
| `OPENAI_API_KEY` | No | Enables GPT models |
| `GOOGLE_API_KEY` | No | Enables Gemini models |
| `MISTRAL_API_KEY` | No | Enables Mistral models |
| `OLLAMA_BASE_URL` | No | Local Ollama endpoint (default: localhost:11434) |
| `DB_PATH` | No | SQLite path (default: ./data/workbench.sqlite) |
| `MAX_CONTEXT_TOKENS` | No | Max context window (default: 180000) |

---

## Commands

```bash
pnpm install            # Install dependencies
pnpm run dev            # Start dev (Vite :5173 + Express :3001)
pnpm run build          # Production build
pnpm run start          # Serve production build
pnpm run db:init        # Initialize SQLite schema
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
