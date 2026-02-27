# GEMINI.md — ANTON by openEXPERT

Context file for Gemini Code Assist and Vertex AI Code Assist. This file provides architecture,
style, and security context for AI-assisted development in this repository.

---

## Project Overview

**ANTON by openEXPERT** is an AI-powered expert workspace supporting 55+ professional domains.
It is a local-first web application: React 18 + TypeScript 5.7 (Vite 6) on the frontend;
Express 4 + Node 20 + SQLite (better-sqlite3 11) on the backend. Anthropic Claude
(`claude-opus-4-6`) is the primary LLM. OpenAI, Gemini, Mistral, and Ollama are supported via
adapter modules in `server/services/adapters/`. The application runs on `localhost` — documents
never leave the machine; only LLM API calls cross the network.

---

## Tech Context

| Layer | Technology |
|---|---|
| Frontend framework | React 18 |
| Language | TypeScript 5.7 (strict mode) |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| Router | React Router v6 |
| Backend | Express 4 |
| Database | SQLite (better-sqlite3 11) |
| Primary AI | Anthropic Claude (claude-opus-4-6 default) |
| Multi-LLM | OpenAI, Gemini, Mistral, Ollama |
| File processing | mammoth (docx), pdf-parse, xlsx |
| Export | docx, exceljs, pdfkit, pptxgenjs |
| Testing | Vitest + Playwright |
| Package manager | pnpm 9 |

---

## Directory Structure

```
/
├── server/
│   ├── index.ts          Express entry point — all routes mounted here
│   ├── routes/           70+ API route files
│   ├── services/         80+ service files (single-responsibility)
│   ├── connections/      MCP, OIDC, data connectors
│   ├── db/               schema.sql, init.ts, migrations/
│   ├── middleware/        auth.ts, rate-limit.ts
│   ├── lib/              error-response.ts (safeError helper)
│   └── prompts/          system prompt .md files (per module)
├── src/
│   ├── components/       shared/ + modules/ + layout/
│   ├── pages/            60+ page components (lazy-loaded)
│   ├── stores/           Zustand stores (use<Name>Store.ts)
│   ├── hooks/            useClaude, useFileUpload, useExport
│   └── lib/              types.ts, constants.ts, api.ts, output-format-definitions.ts
├── docs/                 developer documentation
├── .env.example          all environment variables documented
└── docker-compose.yml
```

---

## Architecture

**Express serving static build and API.** `server/index.ts` is the single Express entry point.
It mounts all API routers under `/api/`, applies middleware (auth, rate-limiting, CORS), and
serves the Vite production build as static files from `dist/`. In development, Vite runs on a
separate port and proxies `/api/` requests to the Express server. SSE (Server-Sent Events) is
used for streaming LLM responses — the frontend reads these via `EventSource` or `fetch` with
readable streams. All route files follow the factory pattern: `export function create<Name>Routes(db): Router`.

**SQLite for local-first persistence.** `server/db/schema.sql` is the authoritative schema.
`server/db/init.ts` initialises the database on startup. All queries use `better-sqlite3`
prepared statements — never string-interpolated SQL. Sessions, module configurations, registered
folder paths, conversation history, and export records are all persisted in the local SQLite
database. Migrations live in `server/db/migrations/` and run in order on startup.

**Zustand for client state.** All global frontend state is managed by Zustand stores in
`src/stores/`. Stores are named `use<Name>Store.ts` and follow the `create<StoreType>()((set, get) => ({}))` pattern. React Context is not used for global state. Local component state
(`useState`) is acceptable for UI-only state (open/closed, hover, etc.). Stores communicate
with the backend exclusively through `src/lib/api.ts` — never via direct `fetch` calls scattered
through components.

**SSE streaming for LLM output.** When the frontend calls `POST /api/claude/stream`, the server
opens an SSE connection and streams text, thinking blocks, and tool-use events as they arrive
from the Claude API. The `useClaude` hook in `src/hooks/useClaude.ts` manages the stream
lifecycle: connecting, accumulating text, handling web search tool results, detecting errors, and
closing cleanly. Web search intermediate results are sent as distinct SSE event types and rendered
separately in the output panel.

---

## Style Guide

**TypeScript strict mode — no `any`.** The `tsconfig.json` enables `strict: true`. Use `unknown`
with type guards when the shape of data is not known ahead of time. All exported functions must
have explicit return types. Define interfaces and types in `src/lib/types.ts` (shared) or
co-locate with the module that owns them.

**Zustand store pattern.** Always type the store interface explicitly before passing to `create`:

```typescript
import { create } from 'zustand';

interface MyStore {
  value: string;
  setValue: (v: string) => void;
}

export const useMyStore = create<MyStore>()((set) => ({
  value: '',
  setValue: (v) => set({ value: v }),
}));
```

**Parameterized SQL only.** Every database query must use `better-sqlite3` prepared statements
with positional or named parameters. No template literals, no string concatenation in query
strings:

```typescript
// Correct
db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(id, userId);

// Wrong — never
db.prepare(`SELECT * FROM sessions WHERE id = '${id}'`).get();
```

**Express route factory pattern.** Route files export a single factory function:

```typescript
export function createMyRoutes(db: Database): Router {
  const router = Router();
  router.get('/', requireAuth, (req, res) => { /* ... */ });
  return router;
}
```

**React.lazy() for all page components.** Pages in `src/pages/` must be lazy-loaded in
`src/App.tsx`. This keeps the initial bundle small. Wrap all lazy routes in `<Suspense>`:

```typescript
const MyPage = React.lazy(() => import('./pages/MyPage'));
```

---

## Gemini Adapter Note

The file `server/services/adapters/geminiAdapter.ts` contains the integration layer for the
Gemini API. When suggesting any code that calls Gemini models, follow the patterns established
in that file: how the client is initialized (using the API key from environment variables), how
streaming is handled, how errors are surfaced using `safeError`, and how model IDs are
referenced. The adapter exposes a unified interface consistent with the other LLM adapters
(`anthropicAdapter.ts`, `openaiAdapter.ts`, `mistralAdapter.ts`) so that callers in route
handlers do not need to know which LLM they are using. Do not bypass the adapter layer by
calling the Gemini SDK directly from route handlers.

The recommended Gemini model ID for this project is `gemini-2.0-flash`. When users configure
Gemini as their provider, this model is the default. Reference it as the constant
`GEMINI_DEFAULT_MODEL` from `src/lib/constants.ts`.

---

## Security

**Folder path whitelist.** Before any `fs` operation on a user-supplied path, validate it against
the `ALLOWED_FOLDER_PATHS` environment variable. Reject with HTTP 403 if the resolved path does
not start with an allowed base:

```typescript
const allowed = ALLOWED_BASES.some(base => path.resolve(target).startsWith(path.resolve(base)));
if (!allowed) return res.status(403).json({ error: 'Access denied' });
```

**No shell injection.** Never use `shell: true` in `spawn` or `exec` calls. Pass arguments as
arrays to `execFile`. Never build command strings from user input.

**Env-var key sanitization.** If user-derived strings are used as environment variable key names
in child processes, sanitize before use:

```typescript
const safeKey = rawKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
```

**safeError() in all catch blocks.** The `safeError` helper in `server/lib/error-response.ts`
strips internal paths, stack traces, and sensitive fields before returning an error response.
All route catch blocks must use it.

**No sensitive data in logs.** `console.log` must never include API keys, passwords, user PII,
or document contents. Log event types and IDs only.

**API keys server-side only.** LLM provider API keys live in `.env` and are accessed only by
the Express server. They are never sent to the frontend or included in API responses.

---

## Testing

**Vitest** is used for unit and integration tests. Test files are co-located with source files
as `*.test.ts`, or placed in the `tests/` directory. Mock the database and external services
with `vi.mock()`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({
  db: { prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })) },
}));
```

**Playwright** is used for end-to-end tests. E2E test files live in `tests/` and target the
running dev server. Run with `pnpm run test:e2e`.

TypeScript type checking must pass (`pnpm run typecheck`) before any test suite is considered
complete. A type error is a test failure.

---

## Key Commands

```bash
pnpm run dev        # Start frontend (Vite :5173) and backend (Express :3001)
pnpm run typecheck  # TypeScript type check — must pass before PRs
pnpm run test       # Run Vitest unit tests
pnpm run db:init    # Initialize SQLite schema (first run only)
pnpm run build      # Production build to dist/
pnpm run start      # Serve production build
```
