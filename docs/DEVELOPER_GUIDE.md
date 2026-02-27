# Developer Guide — openEXPERT by ANTON

Welcome to openEXPERT. This guide gets you from zero to running code in under ten minutes,
then walks through the conventions you need to contribute confidently.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Project Layout](#project-layout)
4. [Key Scripts](#key-scripts)
5. [How to Add a Module](#how-to-add-a-module)
6. [How to Add an API Route](#how-to-add-an-api-route)
7. [How to Add a Frontend Page](#how-to-add-a-frontend-page)
8. [TypeScript Conventions](#typescript-conventions)
9. [PR Checklist](#pr-checklist)
10. [Getting Help](#getting-help)

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 20+ | Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage versions |
| pnpm | 9+ | `npm install -g pnpm` |
| Git | any recent | — |
| Anthropic API key | — | Get one at [console.anthropic.com](https://console.anthropic.com) |

> **Windows users:** WSL 2 (Ubuntu 22.04+) is strongly recommended. The project works on native Windows
> with Git Bash, but path handling is simpler under WSL.

---

## Quick Start

```bash
git clone <repo-url> openexpert && cd openexpert
cp .env.example .env
# Open .env and set ANTHROPIC_API_KEY — that is the only required change
pnpm install
pnpm run db:init
pnpm run dev
```

After `pnpm run dev` you will see two servers start concurrently:

| URL | What it is |
|---|---|
| http://localhost:5173 | Vite dev server — React frontend with hot-module reload |
| http://localhost:3001 | Express API server — backend and Claude proxy |

The Vite dev server proxies `/api/*` requests to Express automatically, so you never need to change
any URL in frontend code. Edit any file and changes appear instantly; the backend restarts
automatically on save via `tsx --watch`.

### First run checklist

- [ ] http://localhost:5173 loads the openEXPERT dashboard
- [ ] The API status indicator in the header shows green
- [ ] Navigating to any module and clicking **Run** returns a streaming response

---

## Project Layout

```
/
├── server/                Express backend (Node 20, TypeScript, ESM)
│   ├── index.ts           Entry point — creates Express app, mounts all routes
│   ├── routes/            70+ route files, one concern per file
│   ├── services/          80+ single-purpose service files
│   ├── connections/       MCP, OIDC, and external data connectors
│   ├── db/
│   │   ├── schema.sql     Canonical database schema
│   │   ├── migrations/    Numbered migration files (0001_*.sql …)
│   │   └── init.ts        Runs schema.sql on first start
│   ├── middleware/        Auth, rate limiting, request logging
│   ├── lib/               Shared helpers (error-response.ts, …)
│   └── prompts/           System prompt markdown files (one per module)
├── src/                   React 18 frontend (TypeScript, Vite)
│   ├── components/        Shared UI components + module-specific components
│   ├── pages/             60+ page components — lazy-loaded via React.lazy()
│   ├── stores/            Zustand state stores
│   ├── hooks/             Custom React hooks
│   └── lib/               types.ts, constants.ts, api.ts
├── docs/                  Developer documentation (you are here)
├── .env.example           Every environment variable with inline documentation
└── docker-compose.yml     Optional containerised setup
```

The backend and frontend share no runtime code. They communicate only over the HTTP API.
Type definitions that need to be consistent across both sides live in `src/lib/types.ts`
and are imported by the frontend; the backend maintains its own parallel types
(duplication is intentional to keep build graphs independent).

---

## Key Scripts

All commands run from the repository root.

| Command | What it does |
|---|---|
| `pnpm run dev` | Start client (Vite :5173) and server (Express :3001) concurrently with hot reload |
| `pnpm run build` | TypeScript compile + Vite production build into `dist/` |
| `pnpm run start` | Start the compiled production server at :3001 (serves the Vite build as static files) |
| `pnpm run typecheck` | Run `tsc --noEmit` — must pass with zero errors before every PR |
| `pnpm run test` | Run Vitest unit tests |
| `pnpm run test:watch` | Vitest in watch mode |
| `pnpm run db:init` | Create SQLite schema from `server/db/schema.sql` |
| `pnpm run db:migrate` | Apply pending migration files from `server/db/migrations/` |
| `pnpm run audit` | Check for moderate+ CVEs in dependencies |
| `pnpm run audit:full` | Full audit: CVEs + licenses + outdated packages |

---

## How to Add a Module

Modules are file-system-driven. No code registration is needed.

**Step 1 — Create the module directory**

```
server/areas/<area-id>/modules/<module-id>/
```

For example: `server/areas/compliance/modules/sanctions-screening/`

**Step 2 — Create `module.json`**

```json
{
  "id": "sanctions-screening",
  "label": "Sanctions Screening",
  "icon": "ShieldAlert",
  "description": "Assess counterparty exposure against current sanctions regimes.",
  "defaults": {
    "thinking": "think_hard",
    "creativity": "strict",
    "outputFormats": ["detailed-findings", "quick-briefing"],
    "knowledgeSources": {
      "claudeKnowledge": { "enabled": true, "webSearchEnabled": true },
      "localFolder": { "enabled": false }
    }
  }
}
```

`icon` must be a valid [Lucide icon name](https://lucide.dev/icons/). The `thinking` values are:
`quick`, `think`, `think_hard`, `investigate`, `plan_first`.

**Step 3 — Create `system-prompt.md`**

Write the module's system prompt as a Markdown file. Structure it with clear headings:

```markdown
# Sanctions Screening Analyst

## Role
You are a specialist in international sanctions regimes …

## Responsibilities
- Identify relevant sanctions programmes …

## Output Structure
Always begin with a concise exposure summary …
```

**That is all.** The server scans `server/areas/` at startup and registers every valid
module it finds. No rebuild is required during development.

---

## How to Add an API Route

**Step 1 — Create the route file**

```typescript
// server/routes/my-route.ts
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { safeError } from '../lib/error-response.js';

export function createMyRoutes(db: Database.Database) {
  const router = Router();

  router.get('/my-resource', requireAuth, (req, res) => {
    try {
      const rows = db
        .prepare('SELECT * FROM my_table WHERE user_id = ?')
        .all(req.user!.id);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/my-resource', requireAuth, (req, res) => {
    const { name } = req.body as { name: string };
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    try {
      const result = db
        .prepare('INSERT INTO my_table (user_id, name) VALUES (?, ?)')
        .run(req.user!.id, name);
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
```

**Step 2 — Mount it in `server/index.ts`**

```typescript
import { createMyRoutes } from './routes/my-route.js';

// Find the block where other routes are mounted and add:
app.use('/api', createMyRoutes(db));
```

**Important rules for route files:**

- Always use `db.prepare(...).all/get/run(params)` — never string-interpolate SQL values.
- Always wrap handlers in `try/catch` and return `safeError(err)` — this strips stack traces from
  production responses while preserving useful messages for development.
- Public endpoints (no auth required) must be explicitly documented with a comment explaining why.
- Note the `.js` extension on server-side imports — this project uses ESM on the backend.

---

## How to Add a Frontend Page

**Step 1 — Create the page component**

```typescript
// src/pages/MyPage.tsx
import React from 'react';

const MyPage: React.FC = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-adv-white">My Page</h1>
      <p className="mt-2 text-adv-gray">Content goes here.</p>
    </div>
  );
};

export default MyPage;
```

**Step 2 — Lazy-import in `src/App.tsx`**

```typescript
const MyPage = React.lazy(() => import('./pages/MyPage'));
```

**Step 3 — Add a route**

```tsx
<Route
  path="/my-page"
  element={
    <Suspense fallback={<PageLoader />}>
      <MyPage />
    </Suspense>
  }
/>
```

**Step 4 — Add a nav link (if menu-visible)**

Open `src/components/layout/Sidebar.tsx` and add an entry to the navigation array following the
existing pattern. Every nav item needs an `icon` (Lucide), `label`, and `path`.

---

## TypeScript Conventions

**Strict mode is on.** The `tsconfig.json` enables `strict: true`. Every PR must pass
`pnpm run typecheck` with zero errors and zero suppressions.

| Rule | Details |
|---|---|
| No `any` | Use `unknown` + type guards when the type is genuinely unknown |
| No `@ts-ignore` | Fix the underlying issue instead |
| Explicit return types | All exported functions must declare their return type |
| File naming | Components: `PascalCase.tsx` — utilities: `kebab-case.ts` |
| Zustand stores | `src/stores/use<Name>Store.ts` — one store per domain — minimal state |
| Derived state | Compute in selectors, not in the store itself |
| Server imports | Use `.js` extension: `import { foo } from './bar.js'` (ESM requirement) |
| Client imports | Omit extension: `import { foo } from './bar'` (Vite resolves) |
| SQL | Always parameterized — `db.prepare('… WHERE id = ?').get(id)` — never concatenation |

**Zustand store example:**

```typescript
// src/stores/useMyStore.ts
import { create } from 'zustand';

interface MyState {
  items: string[];
  addItem: (item: string) => void;
}

export const useMyStore = create<MyState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
}));
```

**API calls from the frontend** go through `src/lib/api.ts`. Add new typed helper functions there
rather than calling `fetch` directly in components. This keeps auth headers and error handling
centralised.

---

## PR Checklist

Before opening a pull request, confirm every item applies or does not apply to your change:

- [ ] `pnpm run typecheck` passes with zero errors
- [ ] `pnpm run test` passes with no regressions
- [ ] No `console.log` calls that could print secrets or credentials
- [ ] All SQL queries use parameterized statements — no string interpolation
- [ ] New API routes include `requireAuth` middleware unless the endpoint is intentionally public
- [ ] Error responses use `safeError()` from `server/lib/error-response.ts`
- [ ] File and folder path operations validate against `ALLOWED_FOLDER_PATHS`
- [ ] New environment variables are documented with a description in `.env.example`
- [ ] Commit messages use imperative mood: "Add X", "Fix Y", "Remove Z"
- [ ] PR description explains *why* the change is needed, not just what it does

**Commit message format:**

```
Add sanctions screening module with OFAC and EU regime support

Closes #42
```

One subject line (50 characters or fewer), optional blank line, optional body with context.
No ticket numbers in the subject line — put them in the body or footer.

---

## Getting Help

- **Something does not start:** Check that `.env` contains a valid `ANTHROPIC_API_KEY` and that
  `pnpm run db:init` has been run at least once.
- **TypeScript errors after a pull:** Run `pnpm install` — a dependency may have changed.
- **Database schema errors:** Run `pnpm run db:migrate` to apply any pending migrations.
- **Questions about a module's system prompt:** The authoritative file is
  `server/areas/<area>/modules/<module>/system-prompt.md` — read it before asking.
- **Anything else:** Open a GitHub Discussion. Issues are for confirmed bugs with reproduction steps.

---

> openEXPERT by ANTON is built to make expert knowledge accessible.
> Good documentation is part of that mission — if something in this guide is unclear,
> a PR to improve it is always welcome.
