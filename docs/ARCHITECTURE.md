# ANTON by openEXPERT — System Architecture

> Developer-facing system design document. Describes the request flow, layer
> responsibilities, extension points, database schema, and environment
> configuration for the ANTON by openEXPERT platform.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Layer Breakdown](#2-layer-breakdown)
3. [Request Flow — End to End](#3-request-flow--end-to-end)
4. [Key Design Decisions](#4-key-design-decisions)
5. [Adding a New Service](#5-adding-a-new-service)
6. [Adding a New API Route](#6-adding-a-new-api-route)
7. [Database Schema](#7-database-schema)
8. [Environment Variables Reference](#8-environment-variables-reference)

---

## 1. High-Level Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                     Browser (React SPA)                           │
│  React 18 + TypeScript · Vite · Tailwind CSS 4 · shadcn/ui       │
│  Zustand stores · React Router v6 · 61 lazy-loaded pages          │
└────────────────────────┬──────────────────────────────────────────┘
                         │  REST (JSON) + SSE (streaming AI output)
                         ▼
┌───────────────────────────────────────────────────────────────────┐
│              Express Server  (port 3001, Node 20)                 │
│                                                                   │
│  ├── Middleware                                                    │
│  │     helmet · CORS · express-rate-limit                         │
│  │     JWT auth (team mode) · budget guard · audit logger         │
│  │                                                                │
│  ├── API Routes  (server/routes/ — 64 route files)                │
│  │     /api/claude          /api/sessions      /api/files         │
│  │     /api/folders         /api/export        /api/rag           │
│  │     /api/knowledge       /api/skills        /api/modules        │
│  │     /api/workflows       /api/canvas        /api/projects       │
│  │     /api/auth            /api/admin         /api/analytics      │
│  │     /api/coding          /api/datasets      /api/presentations  │
│  │     + 46 more specialized route groups                         │
│  │                                                                │
│  ├── Services  (server/services/ — 79 service files)              │
│  │     claude-client · knowledge-source · prompt-builder          │
│  │     file-processor · folder-indexer · export-docx/xlsx/pdf     │
│  │     rag-engine · semantic-search · pattern-detection           │
│  │     budget-manager · scheduler · radar-fetcher                 │
│  │     workspace · dataset-store · session-store · + more         │
│  │                                                                │
│  ├── Connections  (server/connections/)                            │
│  │     api-adapter · database-adapter                             │
│  │     filesystem-adapter · script-adapter                        │
│  │                                                                │
│  └── MCP Server  (server/mcp/)                                    │
│        Model Context Protocol endpoint for tool integrations      │
└──────────────────┬──────────────────────────┬─────────────────────┘
                   │                          │
          ┌────────▼────────┐      ┌──────────▼──────────────────┐
          │  SQLite DB      │      │  External AI APIs           │
          │  better-sqlite3 │      │                             │
          │  WAL mode       │      │  Anthropic (Claude)         │
          │  FK enforced    │      │  OpenAI (GPT-4o)            │
          │                 │      │  Google (Gemini)            │
          │  schema.sql     │      │  Mistral                    │
          │  migrations/    │      │  Ollama (local LLMs)        │
          └────────┬────────┘      └─────────────────────────────┘
                   │
          ┌────────▼────────────────────────────┐
          │  Local File System                  │
          │  uploads/    — user-uploaded files  │
          │  outputs/    — generated exports    │
          │  workspaces/ — project workspaces   │
          │  data/       — SQLite + ChromaDB    │
          └─────────────────────────────────────┘
```

---

## 2. Layer Breakdown

### 2.1 Frontend

| Aspect | Detail |
|---|---|
| Framework | React 18 with TypeScript, built by Vite |
| Styling | Tailwind CSS 4 with a custom dark theme; shadcn/ui component library |
| State management | Zustand — five stores: `useAuthStore`, `useModuleStore`, `useSessionStore`, `useSettingsStore`, `useWorkflowStore` |
| Routing | React Router v6; 61 page components loaded lazily via `React.lazy()` |
| AI communication | `useClaude` hook — opens a `fetch`-based SSE connection to `/api/claude/message` and streams token chunks into the output panel |
| Icons | Lucide React |
| Markdown | `react-markdown` + `remark-gfm` (tables) + `rehype-highlight` (code) |

Pages cover: modules, dashboard, analytics, coding area, data insights, RAG, knowledge graph, canvas, workflows, projects, engagements, compliance, settings, admin, and more.

### 2.2 Backend

| Aspect | Detail |
|---|---|
| Runtime | Node 20, single process |
| Framework | Express 4 |
| Language | TypeScript, transpiled on-the-fly in development via `tsx`; compiled to `dist/` for production |
| Entry point | `server/index.ts` — imports all route factories, mounts them under `/api`, then serves the Vite static build from `dist/` |
| Security middleware | `helmet` (CSP, HSTS, frame guard), `cors` (origin allowlist), `express-rate-limit` (separate limiters for auth, user, and Claude endpoints), JWT verification (`server/middleware/auth.ts`), budget guard (`server/middleware/budget.ts`), audit logger (`server/middleware/audit.ts`), role check (`server/middleware/requireRole.ts`) |

### 2.3 Database

| Aspect | Detail |
|---|---|
| Engine | SQLite via `better-sqlite3` (synchronous, no connection pool needed) |
| Mode | WAL (Write-Ahead Logging) for concurrent reads |
| Foreign keys | Enabled at connection time (`PRAGMA foreign_keys = ON`) |
| Schema | `server/db/schema.sql` — applied once by `initDatabase()` on startup |
| Migrations | `server/db/migrations/` — three numbered SQL files applied in order at startup |
| Seeding | `server/db/init.ts` calls schema + migrations; `init_enhanced.ts` adds extended seed data |

### 2.4 Services Layer

`server/services/` contains 79 single-responsibility TypeScript modules. There is no DI container or service registry. Services are imported directly wherever they are needed. Services may call each other; circular imports are avoided by design.

Key service groups:

| Group | Files |
|---|---|
| AI integration | `claude-client.ts`, `coding-engine.ts`, `coding-review-engine.ts` |
| Knowledge & context | `knowledge-source.ts`, `prompt-builder.ts`, `chunker.ts`, `atom-extractor.ts` |
| RAG / vector search | `chroma-client.ts`, `rag-engine.ts`, `semantic-search.ts` |
| File handling | `file-processor.ts`, `folder-indexer.ts`, `workspace.ts` |
| Export | `export-docx.ts`, `export-xlsx.ts`, `export-pdf.ts`, `antonExport.ts` |
| Data | `dataset-store.ts`, `data-transformer.ts` |
| Intelligence | `pattern-detection.ts`, `radar-fetcher.ts`, `deadline-reminders.ts` |
| Sessions & memory | `session-store.ts`, `memory-store.ts`, `institutional-memory.ts` |
| Security & ops | `budget-manager.ts`, `scheduler.ts`, `audit-logger.ts`, `citation-verifier.ts` |

### 2.5 Connections Layer

`server/connections/` provides thin adapters that abstract external integration patterns:

| File | Purpose |
|---|---|
| `api-adapter.ts` | Generic HTTP adapter for calling external REST APIs from workflows |
| `database-adapter.ts` | Query interface for connecting to external databases as a knowledge source |
| `filesystem-adapter.ts` | Safe, path-validated access to local file system paths |
| `script-adapter.ts` | Execute local scripts (Node, Python, shell) and capture output |

---

## 3. Request Flow — End to End

The following traces a user clicking **Run Analysis** in a module page.

```
1. User action
   ModulePage.tsx
   └── Assembles config: model, thinking level, creativity, output formats,
       knowledge sources, uploaded files, guided input fields

2. Hook invocation
   useClaude hook (src/hooks/useClaude.ts)
   └── Calls api.ts → POST /api/claude/message
       Body: { sessionId, moduleId, userMessage, config }

3. Route handler
   server/routes/claude.ts  →  createClaudeRoutes(db)
   └── Validates request, checks budget guard middleware
   └── Calls composeSystemPrompt(config, db)

4. Prompt composition
   server/services/prompt-builder.ts  →  composeSystemPrompt()
   └── Loads module base prompt from server/prompts/{module}.md
   └── Appends creativity instruction, plan-first instruction (if set),
       output format instructions (one or more deliverable schemas)
   └── Calls resolveKnowledgeSources(config.knowledgeSources)

5. Knowledge resolution
   server/services/knowledge-source.ts  →  resolveKnowledgeSources()
   ├── Mode: Claude knowledge — adds web_search tool if enabled
   ├── Mode: Online reference — fetches URLs server-side, appends text
   ├── Mode: Local folders — runs folder-indexer, extracts text via
   │     file-processor (mammoth/pdf-parse/xlsx/plain text)
   └── Mode: Combined — merges context with priority instructions

6. Anthropic SDK call
   server/services/claude-client.ts
   └── Builds final messages array + system prompt + tools array
   └── Calls anthropic.messages.stream({ model, max_tokens, system,
         messages, thinking, effort, tools })

7. SSE streaming
   claude.ts route
   └── Sets Content-Type: text/event-stream
   └── Pipes SDK stream events as SSE:
         data: { type: "text_delta", text: "..." }
         data: { type: "thinking_delta", text: "..." }
         data: { type: "tool_use", name: "web_search", ... }
         data: { type: "done", usage: { ... } }

8. Client receives stream
   useClaude hook
   └── EventSource / fetch ReadableStream reader
   └── Accumulates text_delta into outputText state
   └── Accumulates thinking_delta into thinkingText state
   └── On "done": saves session to SQLite via POST /api/sessions/{id}/messages

9. Render
   OutputPanel.tsx
   └── Renders outputText via react-markdown + remark-gfm
   └── Shows thinking panel (collapsible) if thinkingText is non-empty
   └── ExportBar.tsx offers .md / .docx / .xlsx / .pdf buttons
```

---

## 4. Key Design Decisions

### Why SQLite?

openEXPERT is local-first by design. SQLite requires zero infrastructure — no database server to install, configure, or secure. A single file holds all sessions, messages, configurations, and audit logs. `better-sqlite3` provides a synchronous API that keeps route handlers simple and eliminates async connection pooling complexity. For team mode with a handful of concurrent users, WAL mode provides sufficient concurrency.

### Why Zustand?

Zustand has minimal boilerplate: one `create()` call per store, no `Provider` wrapper, no context threading through components. It integrates cleanly with TypeScript and the Zustand devtools extension. For this application — where state is mostly UI ephemera (current session, model config, theme) — a lightweight store is sufficient and a full Redux-style architecture would be counterproductive.

### Why SSE instead of WebSocket?

AI streaming is inherently one-directional: the server pushes token chunks to the client. SSE (Server-Sent Events) is purpose-built for this pattern. Unlike WebSockets, SSE works over plain HTTP, requires no upgrade handshake, reconnects automatically, and is trivial to debug with browser devtools. WebSockets would add complexity (upgrade handling, heartbeat, reconnection logic) with no benefit.

### Why a single Express process?

The server uses `express.static()` to serve the compiled React build alongside the API. This means one process and one port in production. Deployment is a single `node dist/server/index.js` command, or a one-service Dockerfile. No reverse proxy is required for basic deployments. For team deployments, nginx can sit in front and handle TLS termination.

### Why service files with no DI container?

Direct TypeScript imports form the dependency graph at compile time. The TypeScript compiler validates every import. There is no runtime registration, no decorator magic, and no framework to learn. Services compose naturally by importing each other. When a service is no longer needed, removing its import produces a compiler error if anything still depends on it — an automatic safeguard against dead code accumulation.

---

## 5. Adding a New Service

1. Create `server/services/my-service.ts` and export one or more named functions:

   ```typescript
   // server/services/my-service.ts
   export async function doSomething(input: string): Promise<string> {
     // implementation
     return result;
   }
   ```

2. Import it directly in any route file, other service, or middleware that needs it:

   ```typescript
   import { doSomething } from '../services/my-service.js';
   ```

3. No registration, no factory, no container. TypeScript tracks the dependency graph.

4. If the service needs the database, accept `db: Database` as a parameter:

   ```typescript
   import type { Database } from 'better-sqlite3';

   export function createMyService(db: Database) {
     return {
       save(data: string) { /* use db */ },
       load(id: string) { /* use db */ },
     };
   }
   ```

---

## 6. Adding a New API Route

1. Create `server/routes/my-route.ts` with a factory function that returns an Express `Router`:

   ```typescript
   import { Router } from 'express';
   import type { Database } from 'better-sqlite3';
   import { requireAuth } from '../middleware/auth.js';

   export function createMyRoutes(db: Database): Router {
     const router = Router();

     // Public endpoint (no auth required)
     router.get('/my-resource', (req, res) => {
       res.json({ ok: true });
     });

     // Protected endpoint
     router.post('/my-resource', requireAuth, (req, res) => {
       const { data } = req.body;
       // ...
       res.json({ created: true });
     });

     return router;
   }
   ```

2. Open `server/index.ts` and register the new router:

   ```typescript
   import { createMyRoutes } from './routes/my-route.js';

   // Add alongside the other app.use() calls:
   app.use('/api', createMyRoutes(db));
   ```

3. Add per-router auth if every endpoint in the router requires authentication:

   ```typescript
   router.use(requireAuth);       // all routes in this router now require a valid JWT
   router.use(requireRole('admin')); // or restrict to a specific role
   ```

4. Add rate limiting if the endpoint is computationally expensive or externally exposed:

   ```typescript
   import { claudeLimiter } from '../middleware/rate-limit.js';
   router.post('/my-expensive-route', claudeLimiter, handler);
   ```

---

## 7. Database Schema

Schema is defined in `server/db/schema.sql` and applied by `initDatabase()` at startup. Incremental changes go in `server/db/migrations/` as numbered SQL files (`001_...sql`, `002_...sql`, etc.) and are applied in order.

### Main Tables

| Table | Purpose |
|---|---|
| `sessions` | One row per conversation session; stores `config` JSON (model, thinking level, output formats, knowledge sources, system prompt) |
| `messages` | Per-session message history; stores role, content, optional thinking content, token count, and cost |
| `registered_folders` | Saved folder paths for the knowledge source browser; persists across sessions |
| `module_configs` | Named, saveable configurations per module (e.g. "AMLR client template") |
| `custom_modules` | User-created modules with custom system prompts and config |
| `projects` | Project workspaces grouping sessions, files, and collaboration |
| `skills` | Skill definitions: prompt instruction, category, tags, version |
| `community_skills` | Community-submitted skills awaiting review or directly usable |
| `reviews` | AI-generated review outputs linked to sessions |
| `datasets` | Persisted data tables with TTL, schema tracking, and access count |
| `login_attempts` | Tracks failed login attempts for rate limiting and lockout (team mode) |
| `security_events` | Append-only security audit log: failed logins, SSRF attempts, budget overruns |
| `password_reset_tokens` | One-time tokens for email-based password reset (team mode) |
| `presentations` | Metadata for generated PPTX files |
| `knowledge_graphs` | Knowledge graph nodes and edges for the knowledge graph feature |
| `user_profiles` | User profile data (name, role, expertise) used for personalisation |

### Key Foreign Keys and Indexes

```sql
-- Cascade delete: removing a session removes all its messages
messages.session_id → sessions.id  ON DELETE CASCADE

-- Performance indexes
idx_messages_session    ON messages(session_id)
idx_sessions_module     ON sessions(module_id)
idx_sessions_updated    ON sessions(updated_at DESC)
idx_login_attempts_username  ON login_attempts(username, attempted_at DESC)
idx_security_events_severity ON security_events(severity, created_at DESC)
idx_datasets_expires    ON datasets(expires_at)
```

---

## 8. Environment Variables Reference

Copy `.env.example` to `.env` and populate the values before starting the server.

### Core / Required

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key; all Claude API calls are made server-side with this key |
| `PORT` | No | `3001` | Port the Express server listens on |
| `NODE_ENV` | No | — | Set to `production` to suppress detailed error stack traces in API error responses |

### Authentication & Security

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `DEPLOYMENT_MODE` | No | `solo` | `solo` disables all authentication; `team` enables JWT-based login |
| `JWT_SECRET` | If team mode | — | Secret for signing and verifying JWT tokens; generate with `crypto.randomBytes(48).toString('hex')` |
| `JWT_EXPIRY` | No | `8h` | How long a login session token remains valid (zeit/ms format: `1h`, `8h`, `7d`) |
| `ENCRYPTION_KEY` | No | insecure dev default | 64-character hex key for encrypting connection credentials in the vault |
| `CORS_ORIGINS` | No | `localhost:3001,localhost:5173` | Comma-separated list of allowed CORS origins; extend for team/production deployments |

### Storage

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `DB_PATH` | No | `./data/workbench.sqlite` | Path to the SQLite database file |
| `UPLOAD_DIR` | No | `./uploads` | Directory where user-uploaded files are saved |
| `OUTPUT_DIR` | No | `./outputs` | Directory where generated export files (.docx, .xlsx, .pdf, .pptx) are saved |
| `WORKSPACES_DIR` | No | `./workspaces` | Root directory for project workspaces; each project gets a subdirectory |
| `CHROMA_PATH` | No | `./data/chroma` | Storage path for the ChromaDB vector database used by RAG features |
| `ALLOWED_FOLDER_PATHS` | No | `./uploads,./outputs` | Security guard — comma-separated list of base directories the folder-browser API may access; requests for paths outside this list are rejected with HTTP 403 |
| `MAX_FILE_SIZE_MB` | No | `50` | Maximum size in megabytes for a single uploaded file |

### AI Defaults

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `DEFAULT_MODEL` | No | `claude-opus-4-7` | Default model applied when a user has not overridden it for their session |
| `DEFAULT_THINKING` | No | `think_hard` | Default thinking level (`quick`, `think`, `think_hard`, `investigate`, `plan_first`) |
| `DEFAULT_CREATIVITY` | No | `balanced` | Default creativity level (`strict`, `balanced`, `creative`) |
| `MAX_CONTEXT_TOKENS` | No | `180000` | Maximum tokens included in a single request; a warning is shown in the UI at 80% (144,000 tokens) |

### Multi-LLM Providers

Leaving any of these blank disables that provider's models in the model selector.

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `OPENAI_API_KEY` | No | — | Enables GPT-4o and GPT-4o-mini in the model selector |
| `GOOGLE_API_KEY` | No | — | Enables Gemini 1.5 Pro and Gemini 1.5 Flash |
| `MISTRAL_API_KEY` | No | — | Enables Mistral Large and Mistral Small |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Base URL for a locally running Ollama instance; models are auto-detected via `/api/ollama/models` |

### Budget

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `MONTHLY_BUDGET_CAP` | No | `0` (unlimited) | Global monthly AI spending cap in EUR; `0` means no limit; can also be set via Settings UI |

### Email / SMTP

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `SMTP_HOST` | No | — | SMTP server hostname; if unset, uses Ethereal test account in development (preview URL logged to console) |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_SECURE` | No | `false` | Set to `true` for port 465 (implicit TLS) |
| `SMTP_USER` | No | — | SMTP authentication username |
| `SMTP_PASS` | No | — | SMTP authentication password |
| `SMTP_FROM` | No | `Anton by openEXPERT <noreply@openexpert.ai>` | Sender name and address for outgoing emails |
| `EMAIL_NOTIFICATIONS_ENABLED` | No | `false` | Master switch for email notifications |

### OAuth — Social Login

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | No | — | Enables "Continue with Google" on the login page |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | No | — | Enables "Continue with GitHub" on the login page |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth client secret |

Callback URLs to register with each provider:
- Google: `http://localhost:3001/api/auth/google/callback`
- GitHub: `http://localhost:3001/api/auth/github/callback`

### Enterprise OIDC SSO

| Variable | Required | Default | What it controls |
|---|---|---|---|
| `OIDC_ISSUER_URL` | No | — | OpenID Connect issuer URL; setting this (plus `OIDC_CLIENT_ID`) enables the Enterprise SSO button. Examples: Azure AD — `https://login.microsoftonline.com/{tenant}/v2.0`; Okta — `https://your-org.okta.com/oauth2/default` |
| `OIDC_CLIENT_ID` | No | — | Client ID registered with the identity provider |
| `OIDC_CLIENT_SECRET` | No | — | Client secret (optional for public PKCE-only clients) |
| `OIDC_REDIRECT_URI` | No | `http://localhost:3001/api/auth/oidc/callback` | Redirect URI registered with the identity provider |

---

## Appendix: File Count Summary

| Location | Count | Description |
|---|---|---|
| `server/routes/` | 64 files | API route factories |
| `server/services/` | 79 files | Single-responsibility service modules |
| `server/connections/` | 4 files | External integration adapters |
| `server/middleware/` | 5 files | Express middleware (auth, rate-limit, budget, audit, role) |
| `server/db/migrations/` | 3 files | Numbered incremental schema migrations |
| `src/pages/` | 61 files | Lazy-loaded React page components |
| `src/stores/` | 5 files | Zustand state stores |

---

*Last updated: 2026-02-25*
