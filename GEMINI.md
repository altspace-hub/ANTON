# GEMINI.md — ANTON by openEXPERT v0.6.5

Context file for Google Gemini Code Assist, Vertex AI Code Assist, and AI Studio.
This file provides architecture, style, and security context for AI-assisted development.

---

## What Is This Project?

**ANTON by openEXPERT** is a local-first AI expert workspace for 55+ professional domains.
It helps consultants, lawyers, compliance officers, and domain experts leverage frontier LLMs
through a structured, guided interface — no command-line knowledge required.

- **150+ expert modules** across finance, legal, healthcare, PE/VC, education, NGO, creative
- **Multi-LLM:** Claude (default), OpenAI, Gemini, Mistral, Ollama
- **Local-first:** documents stay on-machine, only LLM API calls cross the network
- **Multi-format export:** Markdown, Word, Excel, PDF, PowerPoint

---

## Quick Start

```bash
git clone <repo> && cd openexpert
pnpm install
cp .env.example .env          # Add API keys (see below)
pnpm run db:init              # Initialize SQLite
pnpm run dev                  # http://localhost:5173 + API :3001
```

### Environment Variables for Gemini

```bash
# Required — enables Claude (default AI)
ANTHROPIC_API_KEY=sk-ant-...

# Enables Gemini models in the model selector
GOOGLE_API_KEY=your-google-ai-api-key

# Optional — enables other providers
OPENAI_API_KEY=sk-...
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
| Database | SQLite (better-sqlite3) | 11 |
| Primary AI | Anthropic Claude | claude-opus-4-6 |
| Multi-LLM | OpenAI, Gemini, Mistral, Ollama | — |
| Package manager | pnpm | 10 |

---

## Directory Structure

```
/
├── server/
│   ├── index.ts              Express entry point — all routes mounted here
│   ├── routes/               70+ API route files
│   ├── services/             80+ service files (single-responsibility)
│   │   ├── claude-client.ts  Claude API wrapper (streaming, thinking)
│   │   ├── model-adapter.ts  Multi-LLM adapter (OpenAI, Gemini, Mistral, Ollama)
│   │   └── prompt-builder.ts Assembles prompts from all knowledge layers
│   ├── db/                   schema.sql, init.ts, migrations/
│   ├── middleware/           auth.ts, rate-limit.ts
│   ├── lib/                  error-response.ts (safeError helper)
│   └── prompts/              30+ system prompt .md files per module
├── src/
│   ├── App.tsx               All routes — lazy-loaded pages
│   ├── components/           shared/ + layout/ + engagement/
│   ├── pages/                60+ page components
│   ├── stores/               Zustand stores (use<Name>Store.ts)
│   ├── hooks/                useClaude, useFileUpload, useExport
│   └── lib/                  types.ts, constants.ts, api.ts
├── data/                     Regulatory frameworks, knowledge packs
├── public/                   Static assets, locales/ (30 languages)
└── .env.example              All environment variables documented
```

---

## Architecture

**Express + React SPA.** `server/index.ts` mounts all API routes under `/api/`, applies
middleware, and serves the Vite production build. In development, Vite proxies API requests.
SSE (Server-Sent Events) is used for streaming LLM responses.

**SQLite for persistence.** `server/db/schema.sql` is the authoritative schema. All queries
use `better-sqlite3` prepared statements — never string-interpolated SQL. Migrations in
`server/db/migrations/` run automatically on startup.

**Zustand for client state.** All global state in `src/stores/`. Named `use<Name>Store.ts`.
No Redux, no React Context for global state.

**Multi-LLM adapter.** `server/services/model-adapter.ts` provides a unified interface for
all LLM providers. When Gemini is selected, requests route through this adapter which
translates to the Google AI SDK format. The adapter handles streaming, error mapping, and
response normalization.

---

## Gemini Integration

The Gemini integration lives in `server/services/model-adapter.ts`. When writing code that
interacts with Gemini models:

1. **Use the adapter layer** — never call the Google AI SDK directly from route handlers
2. **Default model:** `gemini-2.0-flash` — referenced in `src/lib/constants.ts`
3. **API key:** read from `process.env.GOOGLE_API_KEY` — server-side only
4. **Streaming:** the adapter translates SSE events to match the unified streaming format
5. **Error handling:** use `safeError()` from `server/lib/error-response.ts`

Users select Gemini in the model picker UI when `GOOGLE_API_KEY` is set in `.env`.

---

## Coding Patterns

1. **SQL — parameterized only.**
   ```typescript
   db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);           // Correct
   db.prepare(`SELECT * FROM sessions WHERE id = '${id}'`).get();      // NEVER
   ```

2. **TypeScript — no `any`.** Strict mode. Use `unknown` + type guards.

3. **React — functional components only.** `React.lazy()` for all page imports.
   ```typescript
   const MyPage = React.lazy(() => import('./pages/MyPage'));
   ```

4. **Zustand stores** for global state.
   ```typescript
   export const useMyStore = create<MyStore>()((set) => ({
     value: '',
     setValue: (v) => set({ value: v }),
   }));
   ```

5. **Express route factory pattern.**
   ```typescript
   export function createMyRoutes(db: Database): Router {
     const router = Router();
     router.get('/', requireAuth, (req, res) => { /* ... */ });
     return router;
   }
   ```

6. **Errors — always `safeError(err)` in catch blocks.**
   ```typescript
   import { safeError } from '../lib/error-response.js';
   const { status, message } = safeError(err);
   res.status(status).json({ error: message });
   ```

7. **Folder path validation** before any `fs` operation on user-supplied paths.

---

## Security

- **API keys server-side only.** Never expose provider keys to the frontend.
- **Parameterized SQL.** All queries use prepared statements.
- **Path whitelist.** Validate paths against `ALLOWED_FOLDER_PATHS` before fs access.
- **safeError()** strips stack traces and sensitive fields from responses.
- **No shell injection.** Use `execFile` with arg arrays, never `shell: true`.
- **No PII in logs.** Log IDs and event types only.

---

## Commands

```bash
pnpm install            # Install dependencies
pnpm run dev            # Start dev (Vite :5173 + Express :3001)
pnpm run build          # Production build
pnpm run start          # Serve production build
pnpm run db:init        # Initialize SQLite schema
pnpm run typecheck      # TypeScript type check — must pass before PRs
pnpm run test           # Vitest unit tests
```

---

## Other AI Context Files

| File | For |
|---|---|
| `CLAUDE.md` | Claude Code, Claude in Cursor — deep architecture context |
| `AGENTS.md` | GitHub Copilot, Cursor, Windsurf — universal reference |
| `GEMINI.md` | Gemini Code Assist, Vertex AI (this file) |
| `MISTRAL.md` | Mistral Codestral, Le Chat |
