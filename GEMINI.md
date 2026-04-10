# GEMINI.md — ANTON by openEXPERT v0.7.5

Context file for Google Gemini Code Assist, Vertex AI Code Assist, and AI Studio.
For deeper project context, also read `AGENTS.md` (universal) or `CLAUDE.md` (deepest).

---

## What Is This Project?

**ANTON by openEXPERT** is a local-first AI expert workspace for 55+ professional domains.
It helps consultants, lawyers, compliance officers, and domain experts leverage frontier LLMs
through a structured, guided interface — no command-line knowledge required.

- **150+ expert modules** across finance, legal, healthcare, PE/VC, education, NGO, creative
- **Multi-LLM:** Claude (default), OpenAI, Azure OpenAI, **Gemini**, Mistral, Ollama
- **Local-first:** documents stay on-machine, only LLM API calls cross the network
- **Multi-format export:** Markdown, Word, Excel, PDF, PowerPoint
- **PostgreSQL** is the only supported database
- **Companion App** (PWA + Android) at `src/app/` for end-users on phones

---

## Quick Start

### Prerequisites

- **Node.js v22+**, **pnpm 10**, **PostgreSQL 16+**
- Optional: **Ollama** for local embedding models

### Setup

```bash
# Clone & install
git clone <repo> && cd openexpert
pnpm install

# Create the PG database
psql -U postgres
CREATE USER anton WITH PASSWORD 'anton';
CREATE DATABASE anton OWNER anton;
\q

# Configure & start
cp .env.example .env          # Add API keys (see below)
pnpm run db:init              # Initialize PostgreSQL schema
pnpm run dev                  # http://localhost:5173 + API :3001
```

Or use the wizard: `setup-anton.bat` (Windows) or `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1`.

### Environment variables for Gemini

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...                                # Default AI
DATABASE_URL=postgresql://anton:anton@localhost:5432/anton  # PostgreSQL

# Enables Gemini models in the model selector
GOOGLE_API_KEY=your-google-ai-api-key

# Optional — other providers
OPENAI_API_KEY=sk-...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=...
MISTRAL_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
```

Get a Google AI API key at https://aistudio.google.com/apikey

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
| Database | **PostgreSQL** (`pg` ^8.18) | **16+** |
| Primary AI | Anthropic Claude | claude-opus-4-6 |
| Multi-LLM | OpenAI, Azure OpenAI, **Gemini**, Mistral, Ollama | — |
| Companion App wrapper | Capacitor (Android) | — |
| Package manager | pnpm | 10 |

---

## Directory Structure

```
/
├── server/
│   ├── index.ts                Express entry point — all routes mounted here
│   ├── routes/                 70+ API route files
│   ├── services/               80+ service files (single-responsibility)
│   │   ├── claude-client.ts    Claude API wrapper (streaming, thinking)
│   │   ├── model-adapter.ts    Multi-LLM adapter (OpenAI, Gemini, Mistral, Ollama)
│   │   ├── adapters/azureOpenaiAdapter.ts   Azure OpenAI (with o3 reasoning)
│   │   └── prompt-builder.ts   Assembles prompts from all knowledge layers
│   ├── db/
│   │   ├── schema.sql          Source of truth for the schema
│   │   ├── init-postgresql.ts  PG initialization
│   │   ├── migrations-pg/      90+ PostgreSQL migrations (run on startup)
│   │   └── database.ts         DatabaseAdapter interface
│   ├── middleware/             auth.ts, rate-limit.ts
│   ├── lib/                    error-response.ts (safeError)
│   └── prompts/                30+ system prompt .md files per module
├── src/                        Main React app
│   ├── App.tsx                 All routes — lazy-loaded pages
│   ├── components/             shared/ + layout/ + engagement/
│   ├── pages/                  60+ page components
│   ├── stores/                 Zustand stores (use<Name>Store.ts)
│   ├── hooks/                  useClaude, useFileUpload, useExport
│   ├── lib/                    types.ts, constants.ts, api.ts
│   └── index.css               OKLCH theme variables (light/dark/corporate)
├── src/app/                    Companion App (separate Vite build)
├── android/                    Capacitor Android wrapper
├── data/                       Regulatory frameworks, knowledge packs
├── public/                     Static assets, locales/ (30 languages)
└── .env.example                All environment variables documented
```

---

## Architecture

**Express + React SPA.** `server/index.ts` mounts all API routes under `/api/`, applies
middleware, and serves the Vite production build. In development, Vite proxies API requests.
SSE (Server-Sent Events) is used for streaming LLM responses.

**PostgreSQL for persistence.** `server/db/schema.sql` is the authoritative schema. All queries
use the `DatabaseAdapter` interface (`server/db/database.ts`) with PG `$1`, `$2` parameter
placeholders — never string-interpolated SQL. Migrations in `server/db/migrations-pg/` run
automatically on startup. The project recently migrated from SQLite — **don't write SQLite
syntax in any new code**.

**Zustand for client state.** All global state in `src/stores/`. Named `use<Name>Store.ts`.
No Redux, no React Context for global state.

**Multi-LLM adapter.** `server/services/model-adapter.ts` provides a unified interface for
OpenAI, Gemini, Mistral, and Ollama. Anthropic Claude has its own dedicated client at
`server/services/claude-client.ts`. Azure OpenAI has a dedicated adapter at
`server/services/adapters/azureOpenaiAdapter.ts`. When Gemini is selected, requests route
through the model adapter, which translates to the Google AI SDK format. The adapter handles
streaming, error mapping, and response normalization.

**Pillars.** ANTON groups capability into top-level pillars the user switches between:
Work (default), School, Life, Pathfinder, Markets (self-learning financial intelligence),
Community (E2E messaging), Procure, Civic, Grow, Payments. The Markets Pillar is the proof
of self-learning intelligence — 14 PG migrations, 21 services, 39 Python computation templates.

**Specialized Agents.** Autonomous AI personas with their own system prompts, tool connectors,
and routing rules — for support, sales, HR, etc. Live in `server/services/agent-*.ts` and
`server/routes/agents.ts`. Gemini can be set as an agent's default model.

**Companion App.** A separate React PWA at `src/app/` (built via `vite.config.app.ts` →
`dist/app/`) and wrapped as Android APK/AAB via Capacitor. Talks to the main server via REST
query-sync at `/api/app/*`. 15 screens, 3 themes, 30 languages, offline cache.

---

## Gemini Integration

The Gemini integration lives in `server/services/model-adapter.ts`. When writing code that
interacts with Gemini models:

1. **Use the adapter layer** — never call the Google AI SDK directly from route handlers
2. **Default model:** `gemini-2.0-flash` — referenced in `src/lib/constants.ts`
3. **API key:** read from `process.env.GOOGLE_API_KEY` — server-side only
4. **Streaming:** the adapter translates SSE events to match the unified streaming format
5. **Error handling:** use `safeError()` from `server/lib/error-response.ts`

Users select Gemini in the model picker UI when `GOOGLE_API_KEY` is set in `.env`. Gemini also
works as a backend for **Specialized Agents** — set the agent's `default_model` to a Gemini
model ID and the agent processor will route through the adapter.

---

## Coding Patterns

1. **SQL — PostgreSQL parameterized queries only.**
   ```typescript
   const { rows } = await db.query('SELECT * FROM sessions WHERE id = $1', [id]);  // Correct
   await db.query(`SELECT * FROM sessions WHERE id = '${id}'`);                    // NEVER
   ```
   No SQLite syntax — no `?` placeholders, no `db.prepare(...).get()`, no `better-sqlite3` APIs.

2. **Always `await` DB calls.** Every `DatabaseAdapter` method returns a `Promise`. Forgetting
   `await` produces runtime errors of the form *"Property X does not exist on type Promise<Y>"*.

3. **TypeScript — no `any`.** Strict mode. Use `unknown` + type guards.

4. **React — functional components only.** `React.lazy()` for all page imports.
   ```typescript
   const MyPage = React.lazy(() => import('./pages/MyPage'));
   ```

5. **Zustand stores** for global state.
   ```typescript
   export const useMyStore = create<MyStore>()((set) => ({
     value: '',
     setValue: (v) => set({ value: v }),
   }));
   ```

6. **Express route factory pattern.**
   ```typescript
   import type { DatabaseAdapter } from '../db/database.js';
   export function createMyRoutes(db: DatabaseAdapter): Router {
     const router = Router();
     router.get('/', requireAuth, async (req, res) => { /* ... */ });
     return router;
   }
   ```

7. **Errors — always `safeError(err)` in catch blocks.**
   ```typescript
   import { safeError } from '../lib/error-response.js';
   const { status, message } = safeError(err);
   res.status(status).json({ error: message });
   ```

8. **Folder path validation** before any `fs` operation on user-supplied paths (whitelist
   against `ALLOWED_FOLDER_PATHS`).

9. **Connectors — always go through `ConnectionManager`** and call `manager.logAction(...)`
   after each operation. The audit log is the user's window into what agents have done.

---

## Security

- **API keys server-side only.** Never expose provider keys to the frontend.
- **Parameterized SQL.** All queries use PG `$1`, `$2` placeholders via the `DatabaseAdapter`.
- **Path whitelist.** Validate paths against `ALLOWED_FOLDER_PATHS` before fs access.
- **safeError()** strips stack traces and sensitive fields from responses.
- **No shell injection.** Use `execFile` with arg arrays, never `shell: true`.
- **No PII in logs.** Log IDs and event types only.
- **Credential vault.** Connector secrets are encrypted at rest via `credential-vault.ts`.

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
```

---

## Never Do

- SQLite syntax — the project is PostgreSQL only
- SQL string concatenation or template literals in queries — SQL injection risk
- Forget `await` on `DatabaseAdapter` calls — runtime errors
- TypeScript `any` — use `unknown` + type guards
- `shell: true` in `spawn`/`exec` — shell injection risk
- `fs` access without path validation — path traversal risk
- `console.log` with passwords, API tokens, or PII — security audit failure
- Eager-import pages — use `React.lazy()`
- Call LLM SDKs directly from routes — use the adapter in `model-adapter.ts`
- Bypass `ConnectionManager` — connector operations must be audited

---

## Other AI Context Files

| File | For |
|---|---|
| `CLAUDE.md` | Claude Code, Claude in Cursor — deep architecture context |
| `AGENTS.md` | OpenAI Codex, GitHub Copilot, Cursor, Windsurf — universal reference |
| `GEMINI.md` | Gemini Code Assist, Vertex AI (this file) |
| `MISTRAL.md` | Mistral Codestral, Le Chat |
