# Copilot Instructions — ANTON by openEXPERT

## Project Context

ANTON by openEXPERT is an AI-powered expert workspace for 55+ professional domains. The stack
is React 18 + TypeScript 5.7 (strict) on the frontend, built with Vite 6, and styled with
Tailwind CSS 4. The backend is Express 4 + Node 20 with a local SQLite database
(better-sqlite3 11). Anthropic Claude (`claude-opus-4-8`) is the primary LLM; OpenAI, Gemini,
Mistral, and Ollama are supported via adapters in `server/services/adapters/`. The app is
local-first — only LLM API calls leave the machine. pnpm 9 manages the monorepo.

---

## Code Style

- **Indentation:** 2 spaces. No tabs.
- **Quotes:** Single quotes for strings in TypeScript/JavaScript. Double quotes in JSX attributes.
- **Return types:** All exported and public functions must have explicit return types.
- **Semicolons:** Required at statement ends. Omit on type-only lines (type aliases, interfaces).
- **Components:** Functional only. No class components. No `this`.
- **Imports:** Named imports preferred. Avoid default exports except for React page components.
- **File naming:** `kebab-case.ts` for utilities and services. `PascalCase.tsx` for components.
- **No `any`:** TypeScript strict mode is enforced. Use `unknown` + type guards instead.

---

## React 18 Hints

```tsx
// Functional component with explicit props type
export function UserCard({ name, role }: { name: string; role: string }) {
  return <div className="text-adv-off-white">{name} — {role}</div>;
}

// Lazy-load ALL page components in src/App.tsx
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const GapAnalysis = React.lazy(() => import('./pages/GapAnalysis'));

// Wrap lazy routes in Suspense
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/gap-analysis" element={<GapAnalysis />} />
  </Routes>
</Suspense>

// Hooks: prefer named hooks from src/hooks/
const { run, isStreaming, output } = useClaude();
const { upload, files } = useFileUpload();
```

---

## Zustand State Management

All global state lives in Zustand stores under `src/stores/`. Never use React Context or Redux
for global state.

```typescript
// src/stores/useSessionStore.ts
import { create } from 'zustand';

interface SessionStore {
  sessionId: string | null;
  moduleId: string | null;
  setSession: (id: string, module: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  sessionId: null,
  moduleId: null,
  setSession: (id, module) => set({ sessionId: id, moduleId: module }),
  clearSession: () => set({ sessionId: null, moduleId: null }),
}));

// Usage in component
const { sessionId, setSession } = useSessionStore();
```

---

## React Router v6 Hints

```tsx
import { useNavigate, useParams, Outlet, Link } from 'react-router-dom';

// Navigate programmatically
const navigate = useNavigate();
navigate('/dashboard');
navigate(-1); // Back

// Route params
const { moduleId } = useParams<{ moduleId: string }>();

// Nested routes — parent renders <Outlet /> for children
<Route path="/modules/:moduleId" element={<ModuleLayout />}>
  <Route index element={<ModuleHome />} />
  <Route path="settings" element={<ModuleSettings />} />
</Route>
```

---

## Tailwind CSS

Use utility classes only. No custom CSS files. No inline `style={{}}` props unless truly dynamic
(e.g., calculated widths). Use the design token classes defined in `tailwind.config.ts`.

```tsx
// Correct — utility classes
<div className="bg-adv-card border border-adv-dark-2 rounded-lg p-4 shadow-lg">
  <h2 className="text-adv-off-white font-semibold text-lg">Title</h2>
  <p className="text-adv-gray text-sm mt-1">Subtitle</p>
  <button className="bg-adv-teal hover:bg-adv-teal-dark text-adv-dark font-medium px-4 py-2 rounded">
    Run
  </button>
</div>

// Wrong — avoid
<div style={{ backgroundColor: '#152238' }}>...</div>
```

---

## shadcn/ui Components

Import from `@/components/ui/`. Do not re-implement components that shadcn provides.

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
```

---

## Backend: better-sqlite3

ALWAYS use prepared statements. NEVER use template literals or string concatenation in SQL.

```typescript
import type { Database } from 'better-sqlite3';

// Correct — parameterized
const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
const sessions = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC').all(userId);
db.prepare('INSERT INTO sessions (id, module_id, config_json) VALUES (?, ?, ?)').run(id, moduleId, JSON.stringify(config));
db.prepare('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

// Wrong — never do this
db.prepare(`SELECT * FROM sessions WHERE id = '${sessionId}'`).get(); // SQL injection risk
```

---

## Backend: Express Route Factory Pattern

```typescript
// server/routes/sessions.ts
import { Router, type Request, type Response } from 'express';
import type { Database } from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { safeError } from '../lib/error-response.js';

export function createSessionRoutes(db: Database): Router {
  const router = Router();

  router.get('/:id', requireAuth, (req: Request, res: Response) => {
    try {
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
      if (!session) return res.status(404).json({ error: 'Not found' });
      res.json(session);
    } catch (err) {
      const { status, message } = safeError(err);
      res.status(status).json({ error: message });
    }
  });

  return router;
}
```

---

## Backend: Auth and Error Handling

```typescript
// Apply auth to protected routes
import { requireAuth } from '../middleware/auth.js';
router.post('/protected-route', requireAuth, handler);

// Always use safeError in catch blocks — strips sensitive internals
import { safeError } from '../lib/error-response.js';
try {
  await doSomething();
} catch (err) {
  const { status, message } = safeError(err);
  res.status(status).json({ error: message });
}
```

---

## Security — Read Carefully

These rules are non-negotiable. Copilot must not suggest code that violates them.

```typescript
// 1. No shell: true in any spawn/exec call
import { execFile } from 'child_process';
execFile('convert', [inputPath, outputPath], callback); // Correct
// exec('convert ' + inputPath, { shell: true }, callback); // NEVER

// 2. Always validate folder paths before fs access
const ALLOWED_BASES = (process.env.ALLOWED_FOLDER_PATHS ?? '').split(',').map(p => p.trim());
const resolved = path.resolve(userSuppliedPath);
const allowed = ALLOWED_BASES.some(base => resolved.startsWith(path.resolve(base)));
if (!allowed) return res.status(403).json({ error: 'Access denied' });

// 3. Sanitize env-var keys derived from user input
const safeKey = rawKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

// 4. Never log sensitive data
console.log('Session started:', sessionId); // OK — ID only
// console.log('API key:', apiKey);          // NEVER
// console.log('User data:', userData);      // NEVER — may contain PII
```

---

## Testing Hints

```typescript
// Vitest unit tests — co-locate as *.test.ts or place in tests/
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database
vi.mock('../db', () => ({
  db: {
    prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(), run: vi.fn() })),
  },
}));

// Mock service modules
vi.mock('../services/claude-client', () => ({
  streamCompletion: vi.fn(),
}));

describe('SessionService', () => {
  it('returns null for unknown session', () => {
    const result = getSession('nonexistent-id');
    expect(result).toBeNull();
  });
});

// Playwright E2E tests live in tests/ directory
// Run with: pnpm run test:e2e
```
