# MISTRAL.md — ANTON by openEXPERT v0.7.5

Context for Mistral Codestral, Le Chat, and any Mistral-powered coding assistant.
For deeper project context, also read `AGENTS.md` (universal) or `CLAUDE.md` (deepest).

---

## What Is This Project?

**ANTON by openEXPERT** is a local-first AI expert workspace for 55+ professional domains.
Consultants, lawyers, compliance officers, and domain experts use it to leverage frontier LLMs
through a structured, guided interface — no command-line knowledge needed.

- **150+ expert modules** across finance, legal, healthcare, PE/VC, education, NGO, creative
- **Multi-LLM:** Claude (default), OpenAI, Azure OpenAI, Gemini, **Mistral**, Ollama
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

### Environment variables for Mistral

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...                                # Default AI
DATABASE_URL=postgresql://anton:anton@localhost:5432/anton  # PostgreSQL

# Enables Mistral models in the model selector
MISTRAL_API_KEY=your-mistral-api-key

# Optional — other providers
OPENAI_API_KEY=sk-...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=...
GOOGLE_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
```

Get a Mistral API key at https://console.mistral.ai

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
| Primary AI | Anthropic Claude | claude-opus-4-7 |
| Multi-LLM | OpenAI, Azure OpenAI, Gemini, **Mistral**, Ollama | — |
| Companion App wrapper | Capacitor (Android) | — |
| Package manager | pnpm | 10 |

---

## Directory Structure

- `server/` — Express entry (`index.ts`), `routes/` (70+), `services/` (80+), `db/migrations-pg/` (90+ PG migrations), `middleware/`, `lib/`, `prompts/`, `connections/`, `computation-templates/` (Markets pillar)
- `src/` — Main React app: `pages/` (60+, lazy-loaded), `stores/`, `hooks/`, `components/`, `lib/`, `index.css` (OKLCH theme variables)
- `src/app/` — Companion App (separate Vite build) — pages, services, components for the PWA
- `android/` — Capacitor Android wrapper for the Companion App
- `data/` — Regulatory frameworks, knowledge packs (`.anton` bundles)
- `public/` — Static assets, `locales/` (30 languages), `anton-logo.svg`
- `tests/` — Playwright E2E, load tests
- `.env.example` — All environment variables documented

---

## Pillars

ANTON groups capability into top-level **pillars** the user switches between:

| Pillar | Purpose |
|---|---|
| **Work** | Default — 150+ professional modules |
| **School** | Educational interface with teacher oversight |
| **Life** | Personal-life modules (microfinance, BoP finance) |
| **Pathfinder** | Mode-aware research assistant (`pathfinder-engine.ts`) |
| **Markets** | Self-learning financial intelligence — 14 PG migrations, 21 services, 39 Python computation templates, ANTON 100 indexes, predictions, calibration |
| **Community** | E2E-encrypted ANTON-to-ANTON messaging |
| **Procure** | Procurement cycles, vendor evaluation (`procure-service.ts`) |
| **Civic** | Civic engagements, eligibility checks (`civic-service.ts`) |
| **Grow** | CRM-style: contacts, pipeline, opportunities (`grow-service.ts`) |
| **Payments** | FutureChain wallet & marketplace |

---

## Mistral Integration

The Mistral integration lives in `server/services/model-adapter.ts`. When writing code that
interacts with Mistral models:

1. **Use the adapter layer** — never call the Mistral SDK directly from route handlers
2. **Default model:** `mistral-large-latest` — referenced in `src/lib/constants.ts`
3. **API key:** read from `process.env.MISTRAL_API_KEY` — server-side only
4. **Streaming:** the adapter translates SSE events to the unified streaming format
5. **Error handling:** use `safeError()` from `server/lib/error-response.ts`

Users select Mistral in the model picker UI when `MISTRAL_API_KEY` is set in `.env`. Mistral
also works as a backend for **Specialized Agents** — when an agent's `default_model` is set
to a Mistral ID, the agent processor will route through the Mistral adapter.

---

## Specialized Agents

Autonomous AI personas (support, sales, HR, etc.) with their own system prompts, knowledge
packs, and tool connectors. Mistral models can be set as the agent's default model.

| File | Purpose |
|---|---|
| `server/services/agent-service.ts` | CRUD for agent profiles |
| `server/services/agent-processor.ts` | Conversation processing + tool routing |
| `server/services/agent-connector-executor.ts` | Live API/DB calls from tool calls |
| `server/services/remote-agent-client.ts` | Discover & query agents on peer ANTON instances |
| `server/routes/agents.ts` | REST API for agents |
| `src/pages/agents/AgentHubPage.tsx` | Agent management UI |

---

## Companion App

A separate React PWA at `src/app/` (built via `vite.config.app.ts` → `dist/app/`) and wrapped
as Android APK/AAB via Capacitor. Talks to the main server via REST query-sync at `/api/app/*`.
15 screens, 3 themes, 30 languages, offline cache.

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

4. **React — functional components, `React.lazy()` for pages.**
   ```typescript
   const MyPage = React.lazy(() => import('./pages/MyPage'));
   ```

5. **Zustand — typed stores for global state.** No Redux, no Context.
   ```typescript
   export const useMyStore = create<MyStore>()((set) => ({
     value: '',
     setValue: (v) => set({ value: v }),
   }));
   ```

6. **Express — route factory pattern.**
   ```typescript
   import type { DatabaseAdapter } from '../db/database.js';
   export function createMyRoutes(db: DatabaseAdapter): Router {
     const router = Router();
     /* ... */
     return router;
   }
   ```

7. **Errors — always `safeError(err)` in catch blocks.**
   ```typescript
   import { safeError } from '../lib/error-response.js';
   const { status, message } = safeError(err);
   res.status(status).json({ error: message });
   ```

8. **Security — validate folder paths before `fs` access.**
   ```typescript
   const ok = ALLOWED_BASES.some(b => path.resolve(target).startsWith(path.resolve(b)));
   if (!ok) return res.status(403).json({ error: 'Access denied' });
   ```

9. **Connectors — always go through `ConnectionManager` and call `manager.logAction(...)`** after
   each operation. The audit log is the user's window into what agents have done.

---

## Security

- **API keys server-side only.** Never send provider keys to the frontend.
- **Parameterized SQL.** All queries use PG `$1`, `$2` placeholders via the `DatabaseAdapter`.
- **Path whitelist.** Validate against `ALLOWED_FOLDER_PATHS` before any fs operation.
- **safeError()** strips stack traces and sensitive data from error responses.
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
| `GEMINI.md` | Gemini Code Assist, Vertex AI |
| `MISTRAL.md` | Mistral Codestral, Le Chat (this file) |
