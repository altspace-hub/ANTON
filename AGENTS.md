# AGENTS.md — ANTON by openEXPERT v0.6.0

Universal AI assistant context file. Read by GitHub Copilot, Cursor, Windsurf, Claude Code,
and any tool that reads `AGENTS.md`. This is the authoritative reference for AI coding
assistants working in this repository.

---

## What Is This Project?

**ANTON by openEXPERT** is an AI-powered expert workspace for 55+ professional domains. It is
a local-first web application that enables consultants, lawyers, compliance officers, analysts,
and domain experts to use frontier LLMs through a structured, guided interface — no command-line
knowledge required.

**Key facts:**
- **150+ expert modules** across finance, legal, healthcare, PE/VC, education, NGO, creative
- **Multi-LLM:** Anthropic Claude (default), OpenAI, Google Gemini, Mistral, Ollama (local)
- **Local-first:** runs on `localhost`. Documents stay on the machine. Only LLM API calls leave the network
- **Multi-format export:** every output can be exported to Markdown, Word (.docx), Excel (.xlsx), PDF, PowerPoint (.pptx)

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
| Export | docx, exceljs, pdfkit, pptxgenjs | — |
| Testing | Vitest + Playwright | — |
| Package manager | pnpm | 10 |

---

## Quick Start

```bash
git clone <repo> && cd openexpert
pnpm install
ollama pull nomic-embed-text  # Install embedding model for knowledge memory
cp .env.example .env          # Add your API keys (see below)
pnpm run db:init              # Initialize SQLite database
pnpm run dev                  # http://localhost:5173 (frontend) + :3001 (API)
```

**Prerequisite:** Install [Ollama](https://ollama.com) before running the above — it provides the local embedding model for ANTON's knowledge memory system.

### Required Environment Variables

Only one is truly required — the rest are optional:

| Variable | Required | What It Does |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Enables Claude (default AI). Get one at console.anthropic.com |
| `OPENAI_API_KEY` | No | Enables GPT-4o and GPT-4o-mini |
| `GOOGLE_API_KEY` | No | Enables Gemini 2.0 Flash |
| `MISTRAL_API_KEY` | No | Enables Mistral Large |
| `OLLAMA_BASE_URL` | No | Enables local Ollama models (default: http://localhost:11434) |
| `DEPLOYMENT_MODE` | No | `solo` (default, no auth) or `team` (JWT auth) |

See `.env.example` for the full list with descriptions.

---

## Directory Map

```
/
├── server/
│   ├── index.ts              Express entry point — all routes mounted here
│   ├── routes/               70+ API route files
│   ├── services/             80+ service files (single-responsibility)
│   ├── connections/          MCP, OIDC, data connectors
│   ├── db/                   schema.sql, init.ts, migrations/
│   ├── middleware/           auth.ts, rate-limit.ts, csrf.ts
│   ├── lib/                  error-response.ts, schemas.ts, telemetry.ts
│   └── prompts/              30+ system prompt .md files (per module)
├── src/
│   ├── App.tsx               All routes — lazy-loaded pages
│   ├── components/           shared/ + layout/ + engagement/ + modules/
│   ├── pages/                60+ page components
│   ├── stores/               Zustand stores (use<Name>Store.ts)
│   ├── hooks/                useClaude, useFileUpload, useExport
│   ├── lib/                  types.ts, constants.ts, api.ts, output-format-definitions.ts
│   ├── features/             intelligence/, connections/, knowledge/
│   └── theme/                colors.ts (ANTON design system)
├── data/
│   ├── frameworks/           Regulatory framework JSON files
│   └── knowledge-packs/      Importable knowledge bundles (.anton)
├── electron/                 Optional desktop app wrapper
├── public/                   Static assets, locales/ (30 languages)
├── docs/                     Developer documentation
├── tests/                    Playwright E2E, load tests
└── .env.example              All environment variables with descriptions
```

---

## Critical Files to Know

| File | Purpose |
|---|---|
| `src/lib/constants.ts` | All 150+ module definitions — IDs, labels, defaults |
| `src/lib/types.ts` | All shared TypeScript types |
| `src/lib/output-format-definitions.ts` | 40+ output format configs with prompt instructions |
| `server/db/schema.sql` | Full database schema — source of truth |
| `server/db/init.ts` | Database initialization + migration runner |
| `server/index.ts` | Express entry point — all routes, middleware, SSE |
| `server/services/claude-client.ts` | Claude API wrapper (streaming, thinking, web search) |
| `server/services/model-adapter.ts` | Multi-LLM adapter (OpenAI, Gemini, Mistral, Ollama) |
| `server/services/prompt-builder.ts` | Assembles prompts from all knowledge layers |
| `.env.example` | Every environment variable documented |

---

## Coding Patterns (Always Follow)

### 1. SQL: Parameterized Queries Only

```typescript
// Correct
const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

// NEVER — SQL injection risk
const row = db.prepare(`SELECT * FROM sessions WHERE id = '${sessionId}'`).get();
```

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
```

### 4. Express Routes: Factory Pattern

```typescript
export function createMyRoutes(db: Database): Router {
  const router = Router();
  router.get('/:id', requireAuth, (req, res) => { /* ... */ });
  return router;
}
```

### 5. Errors: safeError()

All catch blocks must use `safeError(err)` from `server/lib/error-response.ts`:

```typescript
import { safeError } from '../lib/error-response.js';
const { status, message } = safeError(err);
res.status(status).json({ error: message });
```

### 6. TypeScript: No `any`

Strict mode enforced. Use `unknown` with type guards, or define proper interfaces.

### 7. Security: Path Validation

Before any `fs` operation on user-supplied paths, validate against `ALLOWED_FOLDER_PATHS`:

```typescript
const resolved = path.resolve(targetPath);
if (!ALLOWED_BASES.some(base => resolved.startsWith(path.resolve(base)))) {
  return res.status(403).json({ error: 'Folder access not permitted' });
}
```

---

## Anti-Patterns (Never Do)

| Anti-pattern | Why | Alternative |
|---|---|---|
| SQL string concatenation | SQL injection | Parameterized `.prepare()` |
| TypeScript `any` | Breaks type safety | `unknown` + type guards |
| Inline API keys | Security leak | `.env` variables |
| `shell: true` in spawn/exec | Shell injection | Args as array via `execFile` |
| `fs` without path validation | Path traversal | Validate against `ALLOWED_FOLDER_PATHS` |
| `console.log` with PII/tokens | Security failure | Log IDs and event types only |
| Eager-importing pages | Bundle bloat | `React.lazy()` + `Suspense` |
| Redux/Context for global state | Complexity | Zustand stores only |

---

## LLM Model IDs

| Provider | Model ID | Notes |
|---|---|---|
| Anthropic | `claude-opus-4-6` | Default. Most capable. |
| Anthropic | `claude-sonnet-4-6` | Fast, efficient. |
| Anthropic | `claude-haiku-4-5-20251001` | Lightweight classification. |
| OpenAI | `gpt-4o` | Via OpenAI adapter. |
| Google | `gemini-2.0-flash` | Via Gemini adapter. |
| Mistral | `mistral-large-latest` | Via Mistral adapter. |
| Ollama | (user-selected) | Local models. |

---

## Thinking Levels (Claude-Specific)

| Level | Description | Opus 4.6 | Sonnet/Haiku |
|---|---|---|---|
| `quick` | Fast, no deep reasoning | `effort: 'low'` | thinking disabled |
| `think` | Standard reasoning | `effort: 'medium'` | `budget_tokens: 4096` |
| `think_hard` | Deep analysis | `effort: 'high'` | `budget_tokens: 16384` |
| `investigate` | Maximum depth | `effort: 'max'` | `budget_tokens: 32768` |
| `plan_first` | Plan then execute | `effort: 'max'` | `budget_tokens: 32768` |

For Opus 4.6: use `thinking: { type: 'adaptive' }` with `effort`. Never set `budget_tokens`.

---

## Commands

```bash
pnpm install            # Install dependencies
pnpm run dev            # Start dev servers (Vite :5173 + Express :3001)
pnpm run build          # Production build
pnpm run start          # Serve production build
pnpm run db:init        # Initialize SQLite schema
pnpm run typecheck      # TypeScript type check — must pass before PRs
pnpm run test           # Vitest unit tests
pnpm run test:e2e       # Playwright E2E tests
```

---

## Using This Project with Your AI Partner

This repository includes context files for multiple AI coding assistants:

| File | AI Tool | Notes |
|---|---|---|
| `CLAUDE.md` | Claude Code, Claude in Cursor | Deep project context, architecture, design system |
| `AGENTS.md` | GitHub Copilot, Cursor, Windsurf, any AI | Universal reference (this file) |
| `GEMINI.md` | Gemini Code Assist, Vertex AI | Gemini-specific adapter notes |
| `MISTRAL.md` | Mistral Codestral, Le Chat | Mistral-specific adapter notes |

All AI assistants should produce code that follows the patterns above. The multi-LLM adapter
in `server/services/model-adapter.ts` provides a unified interface — add new providers by
following the existing adapter pattern.
