# AGENTS.md — ANTON by openEXPERT

Universal AI assistant context file. Read by Copilot, Cursor, Windsurf, Claude Code, and any
tool that reads `AGENTS.md`. This file is the authoritative reference for AI coding assistants
working in this repository.

---

## Project Identity

**Name:** ANTON by openEXPERT
**Purpose:** AI-powered expert workspace for 55+ professional domains. Enables consultants,
lawyers, compliance officers, analysts, and domain experts to leverage frontier LLMs through a
structured, guided interface — without command-line knowledge.
**Primary users:** Domain professionals (consultants, legal, compliance, finance, engineering,
medical) who need reliable, structured AI output rather than raw chat.
**Deployment:** Local-first. Runs on `localhost`. Documents stay on the machine. Only LLM API
calls leave the network.
**Primary AI:** Anthropic Claude (`claude-opus-4-6` default). Multi-LLM support for OpenAI,
Gemini, Mistral, and Ollama.

---

## Tech Stack

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

## Directory Map (Top 3 Levels)

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

## Critical Files

| File | Purpose |
|---|---|
| `src/lib/constants.ts` | All 150+ module definitions — module IDs, labels, defaults |
| `src/lib/types.ts` | All TypeScript types used across the codebase |
| `src/lib/output-format-definitions.ts` | 40+ output format configs with full prompt instructions |
| `server/db/schema.sql` | Full database schema — source of truth for all tables |
| `server/db/init.ts` | Database initialization — runs `schema.sql` on first start |
| `server/index.ts` | Express entry point — all routes mounted here, middleware applied |
| `.env.example` | Every environment variable documented with descriptions |

---

## Patterns to Always Follow

### 1. SQL: Parameterized Queries Only

Never concatenate user input into SQL strings. Always use `better-sqlite3` prepared statements.

```typescript
// Correct
const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
const rows = db.prepare('SELECT * FROM modules WHERE user_id = ? AND active = 1').all(userId);
db.prepare('INSERT INTO sessions (id, module, config) VALUES (?, ?, ?)').run(id, module, config);

// Wrong — SQL injection risk
const row = db.prepare(`SELECT * FROM sessions WHERE id = '${sessionId}'`).get(); // NEVER
```

### 2. State Management: Zustand Stores

Global state lives in Zustand stores under `src/stores/`. Never use React Context or Redux for
global state. Store files are named `use<Name>Store.ts`.

```typescript
// src/stores/useSessionStore.ts
import { create } from 'zustand';

interface SessionStore {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),
  clearSession: () => set({ sessionId: null }),
}));
```

### 3. React Routes: Lazy-Loading

All heavy page components must be lazy-loaded in `src/App.tsx`. Never eager-import pages.

```typescript
// src/App.tsx
import React from 'react';
const GapAnalysis = React.lazy(() => import('./pages/GapAnalysis'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));

// Wrap in Suspense
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/gap-analysis" element={<GapAnalysis />} />
  </Routes>
</Suspense>
```

### 4. Backend Services: Single-Responsibility

Each service file in `server/services/` does one thing. Import into routes as needed.

```typescript
// server/services/my-service.ts
export async function processDocument(filePath: string): Promise<string> {
  // Single responsibility — only document processing
}

// server/routes/documents.ts
import { processDocument } from '../services/my-service.js';
```

### 5. Express Route Factory Pattern

Route files export a factory function that receives the `db` instance and returns a Router.

```typescript
// server/routes/sessions.ts
import { Router } from 'express';
import type { Database } from 'better-sqlite3';

export function createSessionRoutes(db: Database): Router {
  const router = Router();

  router.get('/:id', (req, res) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  });

  return router;
}
```

### 6. Error Handling: safeError()

All route catch blocks must use `safeError(err)` from `server/lib/error-response.ts`. This
strips sensitive fields before sending error messages to the client.

```typescript
import { safeError } from '../lib/error-response.js';

router.post('/run', async (req, res) => {
  try {
    const result = await runAnalysis(req.body);
    res.json(result);
  } catch (err) {
    const { status, message } = safeError(err);
    res.status(status).json({ error: message });
  }
});
```

### 7. Folder Path Validation

Before any `fs` operation on a user-supplied path, validate it against `ALLOWED_FOLDER_PATHS`
from the environment. Reject paths that escape allowed bases.

```typescript
import path from 'path';

const ALLOWED_BASES = (process.env.ALLOWED_FOLDER_PATHS ?? '').split(',').map(p => p.trim());

function isPathAllowed(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return ALLOWED_BASES.some(base => resolved.startsWith(path.resolve(base)));
}

// Usage in route
if (!isPathAllowed(req.body.folderPath)) {
  return res.status(403).json({ error: 'Folder access not permitted' });
}
```

### 8. Env-Var Key Sanitization

When injecting user-derived strings as environment variable keys into child processes, sanitize
to prevent injection.

```typescript
const safeKey = userInput.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
const env = { ...process.env, [safeKey]: value };
```

### 9. TypeScript: No `any`

Strict mode is enforced. Never use `any`. Use `unknown` with type guards, or define proper
interfaces.

```typescript
// Wrong
function process(data: any): any { ... }

// Correct
function process(data: unknown): ProcessedResult {
  if (!isValidInput(data)) throw new Error('Invalid input');
  // ...
}
```

### 10. Functional React Components Only

No class components. No `this`. Use hooks.

```typescript
// Correct
export function MyComponent({ title }: { title: string }) {
  const [count, setCount] = React.useState(0);
  return <div>{title}: {count}</div>;
}
```

---

## Patterns to Never Do

| Anti-pattern | Why | Alternative |
|---|---|---|
| SQL string concatenation | SQL injection | Parameterized statements via `.prepare()` |
| TypeScript `any` | Breaks type safety, hides bugs | `unknown` + type guards, or proper interfaces |
| Inline API keys or secrets | Security leak | Environment variables via `.env` |
| `shell: true` in spawn/exec | Shell injection risk | Pass args as array, never string |
| `find`/`fs` without path validation | Path traversal attack | Validate against `ALLOWED_FOLDER_PATHS` first |
| `console.log` with passwords/tokens/PII | Security audit failure | Strip sensitive fields before logging |
| Eager-importing heavy pages | Bundle size explosion | `React.lazy()` + `Suspense` |
| Redux or Context for global state | Complexity, consistency | Zustand stores only |
| Raw `fetch()` without error handling | Silent failures | Always check `response.ok`, use `safeError` |
| Mutating Zustand state directly | Breaks reactivity | Always use `set()` from the store |

---

## LLM Model IDs

When code needs to reference specific model identifiers:

| Provider | Model ID | Notes |
|---|---|---|
| Anthropic | `claude-opus-4-6` | Default. Most capable. Use for all modules by default. |
| Anthropic | `claude-sonnet-4-6` | Fast, efficient. Good for lighter tasks. |
| Anthropic | `claude-haiku-4-5-20251001` | Lightweight. Use for quick classifications. |
| OpenAI | `gpt-4o` | Optional. Used via OpenAI adapter. |
| Google | `gemini-2.0-flash` | Optional. Used via Gemini adapter. |
| Mistral | `mistral-large-latest` | Optional. Used via Mistral adapter. |
| Ollama | (model-name) | Local. Variable — set by user in settings. |

---

## Thinking Levels

The application exposes five thinking levels that map to Claude API parameters:

| Level | Description | Claude API (Opus 4.6) | Claude API (Sonnet/Haiku) |
|---|---|---|---|
| `quick` | No deep reasoning | `effort: 'low'` | `thinking: disabled` |
| `think` | Standard reasoning | `effort: 'medium'` | `budget_tokens: 4096` |
| `think_hard` | Deep reasoning | `effort: 'high'` | `budget_tokens: 16384` |
| `investigate` | Maximum reasoning | `effort: 'max'` | `budget_tokens: 32768` |
| `plan_first` | Plan then execute | `effort: 'max'` | `budget_tokens: 32768` |

For `claude-opus-4-6`, always use `thinking: { type: 'adaptive' }` with the `effort` parameter.
Never set `budget_tokens` for Opus 4.6 — use `effort` instead.

---

## How to Run

```bash
pnpm run dev        # Start both frontend (Vite) and backend (Express) — uses concurrently
pnpm run typecheck  # TypeScript type check — must pass before any PR or commit
pnpm run test       # Run Vitest unit tests
pnpm run db:init    # Initialize SQLite schema (run once on first setup)
pnpm run build      # Production build
pnpm run start      # Serve production build (after pnpm run build)
```

---

## Security Notes Summary

1. **API keys are server-side only.** Never expose `ANTHROPIC_API_KEY` or other provider keys
   to the frontend. All LLM calls go through the Express proxy.
2. **Folder path whitelist.** The `ALLOWED_FOLDER_PATHS` env var defines which directories the
   server may read. Any request to access a path outside this list must be rejected with 403.
3. **safeError() always.** The `safeError` helper in `server/lib/error-response.ts` strips
   stack traces, internal paths, and sensitive fields from error responses sent to clients.
4. **No shell injection.** Prefer `execFile` over `exec`. Pass arguments as arrays. Never
   use `shell: true`. Never build command strings from user input.
5. **Sanitize env-var keys.** If user input is ever used as part of an environment variable
   name in a child process, apply `.replace(/[^A-Z0-9_]/g, '_')` before use.
6. **No PII in logs.** Logging must never include passwords, API tokens, personally identifiable
   information, or document contents. Log IDs and event types only.
