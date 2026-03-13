# MISTRAL.md — ANTON by openEXPERT v0.6.5

Context for Mistral Codestral, Le Chat, and any Mistral-powered coding assistant.

---

## What Is This Project?

**ANTON by openEXPERT** is a local-first AI expert workspace for 55+ professional domains.
Consultants, lawyers, compliance officers, and domain experts use it to leverage frontier LLMs
through a structured, guided interface — no command-line knowledge needed.

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

### Environment Variables for Mistral

```bash
# Required — enables Claude (default AI)
ANTHROPIC_API_KEY=sk-ant-...

# Enables Mistral models in the model selector
MISTRAL_API_KEY=your-mistral-api-key

# Optional — enables other providers
OPENAI_API_KEY=sk-...
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
| Database | SQLite (better-sqlite3) | 11 |
| Primary AI | Anthropic Claude | claude-opus-4-6 |
| Multi-LLM | OpenAI, Gemini, Mistral, Ollama | — |
| Package manager | pnpm | 10 |

---

## Directory Structure

- `server/` — Express entry (`index.ts`), `routes/` (70+), `services/` (80+), `db/`, `middleware/`, `lib/`, `prompts/`
- `src/` — React app: `pages/` (60+, lazy-loaded), `stores/`, `hooks/`, `components/`, `lib/`
- `data/` — Regulatory frameworks, knowledge packs
- `public/` — Static assets, `locales/` (30 languages)
- `tests/` — Playwright E2E, load tests
- `.env.example` — All environment variables documented

---

## Mistral Integration

The Mistral integration lives in `server/services/model-adapter.ts`. When writing code that
interacts with Mistral models:

1. **Use the adapter layer** — never call the Mistral SDK directly from route handlers
2. **Default model:** `mistral-large-latest` — referenced in `src/lib/constants.ts`
3. **API key:** read from `process.env.MISTRAL_API_KEY` — server-side only
4. **Streaming:** the adapter translates SSE events to the unified streaming format
5. **Error handling:** use `safeError()` from `server/lib/error-response.ts`

Users select Mistral in the model picker UI when `MISTRAL_API_KEY` is set in `.env`.

---

## Coding Patterns

1. **SQL — parameterized only.**
   ```typescript
   db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);           // Correct
   db.prepare(`SELECT * FROM sessions WHERE id = '${id}'`).get();      // NEVER
   ```

2. **TypeScript — no `any`.** Strict mode enforced. Use `unknown` + type guards.

3. **React — functional components, `React.lazy()` for pages.**
   ```typescript
   const MyPage = React.lazy(() => import('./pages/MyPage'));
   ```

4. **Zustand — typed stores for global state.** No Redux, no Context.
   ```typescript
   export const useMyStore = create<MyStore>()((set) => ({
     value: '',
     setValue: (v) => set({ value: v }),
   }));
   ```

5. **Express — route factory pattern.**
   ```typescript
   export function createMyRoutes(db: Database): Router {
     const router = Router();
     /* ... */
     return router;
   }
   ```

6. **Errors — always `safeError(err)` in catch blocks.**
   ```typescript
   import { safeError } from '../lib/error-response.js';
   const { status, message } = safeError(err);
   res.status(status).json({ error: message });
   ```

7. **Security — validate folder paths before `fs` access.**
   ```typescript
   const ok = ALLOWED_BASES.some(b => path.resolve(target).startsWith(path.resolve(b)));
   if (!ok) return res.status(403).json({ error: 'Access denied' });
   ```

---

## Security

- **API keys server-side only.** Never send provider keys to the frontend.
- **Parameterized SQL.** All queries use `better-sqlite3` prepared statements.
- **Path whitelist.** Validate against `ALLOWED_FOLDER_PATHS` before any fs operation.
- **safeError()** strips stack traces and sensitive data from error responses.
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

## Never Do

- SQL string concatenation or template literals in queries — SQL injection risk
- TypeScript `any` — use `unknown` + type guards
- `shell: true` in `spawn`/`exec` — shell injection risk
- `fs` access without path validation — path traversal risk
- `console.log` with passwords, API tokens, or PII — security audit failure
- Eager-import pages — use `React.lazy()`
- Call LLM SDKs directly from routes — use the adapter in `model-adapter.ts`

---

## Other AI Context Files

| File | For |
|---|---|
| `CLAUDE.md` | Claude Code, Claude in Cursor — deep architecture context |
| `AGENTS.md` | GitHub Copilot, Cursor, Windsurf — universal reference |
| `GEMINI.md` | Gemini Code Assist, Vertex AI |
| `MISTRAL.md` | Mistral Codestral, Le Chat (this file) |
