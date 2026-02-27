# MISTRAL.md — ANTON by openEXPERT

Context for Mistral Codestral and Le Chat. Kept short for efficient context use.

---

## Project

**ANTON by openEXPERT** is a local-first AI expert workspace for 55+ professional domains.
React 18 + TypeScript frontend (Vite 6). Express 4 + Node 20 + SQLite backend. Anthropic Claude
is the primary LLM; OpenAI, Gemini, Mistral, and Ollama are supported via adapter modules.
Documents stay on-machine — only LLM API calls cross the network.

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + TypeScript | 18 / 5.7 |
| Build | Vite | 6 |
| Styling | Tailwind CSS | 4 |
| State | Zustand | 5 |
| Backend | Express + Node | 4 / 20 |
| Database | better-sqlite3 | 11 |
| Primary AI | Anthropic Claude | claude-opus-4-6 |
| Multi-LLM | OpenAI, Gemini, Mistral, Ollama | — |
| Testing | Vitest + Playwright | — |
| Package manager | pnpm | 9 |

---

## Top-Level Structure

- `server/` — Express entry (`index.ts`), `routes/` (70+), `services/` (80+), `db/`, `middleware/`, `lib/`
- `src/` — React app: `pages/` (60+, lazy-loaded), `stores/`, `hooks/`, `components/`, `lib/`
- `docs/` — developer documentation
- `tests/` — Playwright E2E tests
- `.env.example` — all environment variables documented
- `docker-compose.yml` — container setup

---

## Patterns

1. **SQL — parameterized only.**
   ```typescript
   db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);           // Correct
   db.prepare(`SELECT * FROM sessions WHERE id = '${id}'`).get();      // NEVER
   ```

2. **TypeScript — no `any`.** Strict mode enforced. Use `unknown` + type guards. All exported
   functions need explicit return types.

3. **React — functional components, React.lazy() for pages.**
   ```typescript
   const MyPage = React.lazy(() => import('./pages/MyPage'));
   ```

4. **Zustand — typed stores, no Redux, no Context for global state.**
   ```typescript
   export const useMyStore = create<MyStore>()((set) => ({ value: '', setValue: (v) => set({ value: v }) }));
   ```

5. **Express — route factory pattern.**
   ```typescript
   export function createMyRoutes(db: Database): Router { const router = Router(); /* ... */ return router; }
   ```

6. **Errors — always use `safeError(err)` in catch blocks.**
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

8. **Testing — mock with `vi.mock()`, type check must pass.**
   ```typescript
   vi.mock('../db', () => ({ db: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) } }));
   ```

---

## Mistral Adapter

`server/services/adapters/mistralAdapter.ts` is the integration layer for the Mistral API.
When writing any code that calls Mistral models, follow the patterns in that file: client
initialization from environment variables, streaming response handling, error surfacing via
`safeError`, and model ID references. Do not call the Mistral SDK directly from route handlers —
use the adapter. The default Mistral model for this project is `mistral-large-latest`.

---

## Run Commands

```bash
pnpm run dev        # Start frontend + backend
pnpm run typecheck  # Must pass before any PR
pnpm run test       # Vitest unit tests
pnpm run db:init    # Initialize SQLite schema
```

---

## Never Do

- Raw SQL string concatenation or template literals in queries — SQL injection risk
- TypeScript `any` types — use `unknown` + type guards
- `shell: true` in `spawn` or `exec` calls — shell injection risk
- `fs` access without validating path against `ALLOWED_FOLDER_PATHS` — path traversal risk
- `console.log` with passwords, API tokens, or PII — security audit failure
