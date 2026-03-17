# PostgreSQL Migration Playbook — Complete Reference

**Purpose:** This document captures EVERYTHING that was done to migrate ANTON from SQLite-only to dual-mode SQLite+PostgreSQL. It serves as a step-by-step replay guide so the migration can be redone on the updated `main` branch (which has new features and Mistral functions added since the fork).

**Branch:** `postgresql` (forked from `main` at commit `e98041f`)
**Single commit:** `2877f05` — `feat(db): add PostgreSQL dual-mode support via DatabaseAdapter abstraction`
**Scope:** 178 files changed, 11,201 insertions, 5,422 deletions

---

## Table of Contents

1. [Architecture Decision](#1-architecture-decision)
2. [New Files Created](#2-new-files-created)
3. [Phase 1: Database Abstraction Layer](#3-phase-1-database-abstraction-layer)
4. [Phase 2: PostgreSQL Schema](#4-phase-2-postgresql-schema)
5. [Phase 3: Initialization & Migrations](#5-phase-3-initialization--migrations)
6. [Phase 4: Route Migration (87 files)](#6-phase-4-route-migration-87-files)
7. [Phase 5: Service Migration (62 files)](#7-phase-5-service-migration-62-files)
8. [Phase 6: Middleware & MCP](#8-phase-6-middleware--mcp)
9. [Phase 7: SQL Dialect Differences](#9-phase-7-sql-dialect-differences)
10. [Phase 8: Full-Text Search](#10-phase-8-full-text-search)
11. [Phase 9: Configuration & Infrastructure](#11-phase-9-configuration--infrastructure)
12. [Phase 10: Tests](#12-phase-10-tests)
13. [Phase 11: server/index.ts Changes](#13-phase-11-serverindexts-changes)
14. [Mechanical Transformation Patterns](#14-mechanical-transformation-patterns)
15. [Gotchas & Lessons Learned](#15-gotchas--lessons-learned)
16. [File-by-File Change List](#16-file-by-file-change-list)
17. [Replay Checklist](#17-replay-checklist)

---

## 1. Architecture Decision

### Strategy: Dual-Mode Abstraction

Instead of replacing SQLite, we built a **thin abstraction layer** that supports both backends:

- **SQLite** remains the default for solo/local deployments (zero config)
- **PostgreSQL** activates when `DATABASE_URL=postgresql://...` is set
- All consuming code uses the same async `DatabaseAdapter` interface
- The PostgreSQL adapter auto-translates SQLite SQL syntax at runtime

### Why This Approach

- **Zero disruption** to existing SQLite users
- **No SQL rewrite needed** for the ~1,500+ queries — the adapter handles translation
- **Team deployments** get concurrent write support via PostgreSQL
- **Same codebase** — no branching logic in routes/services

---

## 2. New Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `server/db/database.ts` | 112 | `DatabaseAdapter` interface + `createDatabase()` factory |
| `server/db/dialect-helpers.ts` | 273 | `sql.*` helpers for ~15 dialect-specific SQL patterns |
| `server/db/adapters/sqlite-adapter.ts` | 103 | Wraps `better-sqlite3` behind async `DatabaseAdapter` |
| `server/db/adapters/postgresql-adapter.ts` | 397 | Wraps `pg.Pool` + auto-translates SQL + converts `?` → `$1` |
| `server/db/init-database.ts` | 48 | Unified entry point: auto-detects dialect, calls appropriate init |
| `server/db/init-postgresql.ts` | 550 | PG init: schema execution, migrations, seeds, admin user |
| `server/db/run-migrations-pg.ts` | 157 | PG migration runner (CLI + programmatic) |
| `server/db/schema.postgresql.sql` | 3,221 | Full PostgreSQL schema (179 tables, 251 indexes) |
| `server/db/migrations-pg/039_knowledge_atoms_fts_pg.sql` | 38 | FTS5 → tsvector + GIN migration |
| `server/db/migrations-pg/README.md` | 16 | Documentation for PG-specific migrations |
| `tests/db/dialect-helpers.test.ts` | 123 | Unit tests for all dialect helpers |
| `tests/db/schema-parity.test.ts` | 126 | Schema validation: no SQLite-isms, PG features present |
| `tests/db/sqlite-adapter.test.ts` | 173 | Integration tests for SQLite adapter |
| `tests/db/translate-sql.test.ts` | 230 | Unit tests for SQL translation pipeline |

---

## 3. Phase 1: Database Abstraction Layer

### 3.1 The DatabaseAdapter Interface (`server/db/database.ts`)

```typescript
export type Dialect = 'sqlite' | 'postgresql';

export interface DatabaseAdapter {
  readonly dialect: Dialect;
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly raw: unknown;  // Access underlying driver (use sparingly)
}
```

Key design decisions:
- **Everything is async** — even SQLite (resolves immediately)
- **Positional params** (`...params`) instead of named objects
- **`RunResult`** returns `{ changes, lastInsertRowid? }` for both backends
- **Transactions** receive a `tx: DatabaseAdapter` — use it for all queries inside the transaction
- **`raw`** exposed for escape hatches (SQLite PRAGMAs, etc.)

### 3.2 SQLite Adapter (`server/db/adapters/sqlite-adapter.ts`)

Thin wrapper that wraps sync `better-sqlite3` in `Promise.resolve()`:
- `get()` → `db.prepare(sql).get(...params)`
- `all()` → `db.prepare(sql).all(...params)`
- `run()` → `db.prepare(sql).run(...params)` → maps to `RunResult`
- `exec()` → `db.exec(sql)`
- `transaction()` → `BEGIN`/`COMMIT`/`ROLLBACK` with nested SAVEPOINT support

### 3.3 PostgreSQL Adapter (`server/db/adapters/postgresql-adapter.ts`)

The heavy lifter. Every query goes through a 3-stage pipeline:

```
raw SQLite SQL → translateSql() → convertPlaceholders() → pg.Pool.query()
```

#### Translation Pipeline

**Stage 1: `translateSql()`** — Converts SQLite syntax to PostgreSQL:

| SQLite Pattern | PostgreSQL Replacement |
|---|---|
| `datetime('now')` | `NOW()` |
| `datetime('now', '-30 days')` | `(NOW() + INTERVAL '-30 days')` |
| `datetime('now', '+2 hours')` | `(NOW() + INTERVAL '+2 hours')` |
| `date('now')` | `CURRENT_DATE` |
| `date('now', '-7 days')` | `(CURRENT_DATE + INTERVAL '-7 days')` |
| `strftime('%Y-%m', col)` | `TO_CHAR(col, 'YYYY-MM')` |
| `strftime('%Y-%m', 'now')` | `TO_CHAR(NOW(), 'YYYY-MM')` |
| `json_extract(col, '$.key')` | `col->>'key'` |
| `INSERT OR IGNORE INTO` | `INSERT INTO ... ON CONFLICT DO NOTHING` |
| `lower(hex(randomblob(N)))` | `encode(gen_random_bytes(N), 'hex')` |

**Stage 2: `convertPlaceholders()`** — `?` → `$1, $2, $3` (quote-aware, never modifies string literals)

**Stage 3: `run()` only** — Appends `RETURNING *` to INSERT statements to capture `lastInsertRowid`

#### String-Literal Safety

Both `translateSql()` and `convertPlaceholders()` use `parseStringSegments()` — a custom parser that splits SQL into quoted/unquoted segments. This ensures:
- `?` inside `'what?'` is NOT converted to `$1`
- `datetime('now')` inside a doubled-quote string literal is NOT translated
- SQL injection via crafted strings is impossible

#### Pool Configuration

```typescript
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: parseInt(process.env.PG_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.PG_POOL_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || '10000', 10),
});
```

#### Transactions

- Pool-level: `BEGIN` → execute → `COMMIT`/`ROLLBACK` via dedicated `PoolClient`
- Nested: Uses `SAVEPOINT` / `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT`
- Transaction adapter (`PostgresClientAdapter`) uses the same interface

### 3.4 Dialect Helpers (`server/db/dialect-helpers.ts`)

For the ~15 query patterns that the auto-translator **cannot** handle (because they are built programmatically in JS, not embedded as literal SQL strings), we use explicit helpers:

```typescript
import { sql } from '../db/dialect-helpers.js';

// Date functions
sql.now(dialect)                    // datetime('now') | NOW()
sql.currentDate(dialect)            // date('now') | CURRENT_DATE
sql.strftime(fmt, col, dialect)     // strftime('%Y-%m', col) | TO_CHAR(col, 'YYYY-MM')
sql.yearWeek(col, dialect)          // strftime('%Y-W%W', col) | TO_CHAR(col, 'IYYY-"W"IW')
sql.daysDiff(a, b, dialect)         // julianday(a)-julianday(b) | EXTRACT(EPOCH FROM ...)/86400
sql.daysUntil(col, dialect)         // julianday(col)-julianday('now') | EXTRACT(EPOCH FROM ...)/86400

// JSON
sql.jsonExtract(col, key, dialect)  // json_extract(col, '$.key') | col->>'key'

// String matching
sql.ilike(dialect)                  // LIKE | ILIKE

// Boolean
sql.boolTrue(dialect)               // '1' | '1' (kept as INTEGER for compatibility)
sql.boolFalse(dialect)              // '0' | '0'

// Introspection
sql.tableExistsQuery(dialect)       // sqlite_master | information_schema.tables
sql.columnExistsQuery(table, dialect) // pragma_table_info | information_schema.columns

// Aggregation
sql.groupConcat(col, sep, dialect)  // group_concat(col, sep) | STRING_AGG(col::text, sep)

// INSERT conflict handling
sql.insertOrIgnorePrefix(dialect)   // INSERT OR IGNORE INTO | INSERT INTO
sql.insertOrIgnoreSuffix(dialect)   // '' | ON CONFLICT DO NOTHING
sql.insertOrReplacePrefix(dialect)  // INSERT OR REPLACE INTO | INSERT INTO

// Date arithmetic (parameterized)
sql.dateOffsetParam(unit, dialect)  // datetime('now', '-'||?||' days') | NOW()-(? || ' days')::interval
sql.dateFunc(col, dialect)          // DATE(col) | (col)::date
sql.dateOffsetLiteral(offset, dialect) // datetime('now', offset) | (NOW() + INTERVAL 'offset')
```

**When to use auto-translation vs. dialect helpers:**
- If the SQL is a **static string literal** with patterns like `datetime('now')` → auto-translator handles it
- If the SQL is **built dynamically** in JS (e.g., `julianday()` differences, parameterized intervals) → use `sql.*` helpers

---

## 4. Phase 2: PostgreSQL Schema

### `server/db/schema.postgresql.sql` — 3,221 lines

Generated by manually converting the SQLite `schema.sql` + all inline table creations from `init.ts` + all migrations (001–046) into their **final state**.

Key conversions from SQLite → PostgreSQL:

| SQLite | PostgreSQL |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `TEXT` (for timestamps) | `TIMESTAMPTZ` |
| `REAL` | `DOUBLE PRECISION` |
| `datetime('now')` default | `DEFAULT NOW()` |
| `lower(hex(randomblob(N)))` default | `DEFAULT encode(gen_random_bytes(N), 'hex')` |
| `CREATE VIRTUAL TABLE ... USING fts5` | `TSVECTOR` column + `GIN` index + trigger |
| `BLOB` | `BYTEA` |
| `json_extract()` in CHECK constraints | Removed (PG uses operator syntax) |
| Boolean as `INTEGER DEFAULT 0` | Kept as `INTEGER DEFAULT 0` for compatibility (not native BOOLEAN) |

### Important Decisions in the Schema

1. **Booleans stay as INTEGER 0/1** — not native BOOLEAN. This avoids needing to change all `= 0` / `= 1` checks in queries. The adapter doesn't need to translate these.

2. **TEXT columns stay as TEXT** for JSON data — not JSONB. Some columns use JSONB where it benefits (indexed/queried JSON). Most simple JSON columns remain TEXT for compatibility.

3. **All tables use `CREATE TABLE IF NOT EXISTS`** — idempotent execution, safe to re-run.

4. **Full-text search** uses PostgreSQL-native `TSVECTOR` + `GIN` index + auto-update trigger on `knowledge_atoms.content`.

5. **All 251 indexes** from SQLite are preserved with identical names.

---

## 5. Phase 3: Initialization & Migrations

### `server/db/init-database.ts` — Unified Entry Point

```typescript
export async function initDatabaseAdapter(): Promise<DatabaseAdapter> {
  if (DATABASE_URL starts with 'postgres') {
    → initPostgresDatabase() → PostgresAdapter
  } else {
    → initDatabase() (existing SQLite) → SqliteAdapter
  }
}
```

### `server/db/init-postgresql.ts` — PostgreSQL Init (550 lines)

Executes in order:
1. **Connect** via `pg.Pool` with configurable pool settings
2. **Execute `schema.postgresql.sql`** — creates all 179 tables
3. **Run PG-specific migrations** from `migrations-pg/`
4. **Seed default data** — identical to SQLite seeds but using PG syntax:
   - Default user profile
   - Solo user
   - App settings
   - 3 knowledge collections
   - 4 deadline labels
   - Radar settings + 12 radar sources
   - 8 compliance rules
   - 3 tool profiles
   - 5 skill packs
   - 3 workflow templates
   - Orchestrator config + stage
   - Pattern scheduler config
   - 4 teacher personas (Alma, Oscar, Nora, Professor Lindström)
   - 5 event-driven workflow definitions
5. **Mark legacy migrations as applied** — all 46 historical migrations recorded in `schema_migrations`
6. **Seed admin user** (team mode only) — generates random password, writes to `data/initial-credentials.txt`

### `server/db/run-migrations-pg.ts` — Migration Runner

Dual-source migration runner:
1. Reads `migrations-pg/` (PG-specific, take precedence)
2. Reads `migrations/` (generic, used if no PG version exists)
3. Skips SQLite-only migrations (detects `PRAGMA`, `USING fts5`, `AUTOINCREMENT`, etc.)
4. Each migration runs in a transaction
5. Records applied migrations in `schema_migrations`

### `server/db/migrations-pg/039_knowledge_atoms_fts_pg.sql`

Replaces SQLite FTS5 with:
```sql
ALTER TABLE knowledge_atoms ADD COLUMN search_vector TSVECTOR;
CREATE INDEX idx_knowledge_atoms_search ON knowledge_atoms USING GIN(search_vector);
-- Auto-update trigger
CREATE TRIGGER trig_knowledge_atoms_search
  BEFORE INSERT OR UPDATE OF content ON knowledge_atoms
  FOR EACH ROW EXECUTE FUNCTION knowledge_atoms_search_update();
-- Backfill existing rows
UPDATE knowledge_atoms SET search_vector = to_tsvector('english', COALESCE(content, ''));
```

---

## 6. Phase 4: Route Migration (87 files)

Every route file in `server/routes/` was modified. The changes are mechanical:

### 6.1 Type Signature Change

```typescript
// BEFORE
import type Database from 'better-sqlite3';
export function createMyRoutes(db: Database.Database) {

// AFTER
import type { DatabaseAdapter } from '../db/database.js';
export function createMyRoutes(db: DatabaseAdapter) {
```

### 6.2 Handler Signature Change

```typescript
// BEFORE
router.get('/path', (req, res) => {

// AFTER
router.get('/path', async (req, res) => {
```

### 6.3 Query Call Pattern Change

```typescript
// BEFORE — db.prepare().get() / .all() / .run()
const row = db.prepare('SELECT * FROM t WHERE id = ?').get(id) as MyType;
const rows = db.prepare('SELECT * FROM t').all() as MyType[];
db.prepare('INSERT INTO t (a, b) VALUES (?, ?)').run(a, b);

// AFTER — await db.get() / .all() / .run()
const row = await db.get<MyType>('SELECT * FROM t WHERE id = ?', id);
const rows = await db.all<MyType>('SELECT * FROM t');
await db.run('INSERT INTO t (a, b) VALUES (?, ?)', a, b);
```

### 6.4 Type Assertion Pattern Change

```typescript
// BEFORE — type cast AFTER the call
const result = db.prepare('SELECT COUNT(*) as c FROM t').get() as { c: number };

// AFTER — generic type parameter ON the call
const result = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM t');
// Then use: result!.c or result?.c
```

### 6.5 Named Parameters → Positional Parameters

```typescript
// BEFORE — named params with @
db.prepare('INSERT INTO t (id, name) VALUES (@id, @name)').run({ id, name });

// AFTER — positional params with ?
await db.run('INSERT INTO t (id, name) VALUES (?, ?)', id, name);
```

This was required because the PostgreSQL adapter converts `?` → `$1, $2, $3`. Named `@params` are SQLite-specific.

### 6.6 Prepared Statements → Inline Queries

```typescript
// BEFORE — prepared statements created once in factory
const stmt = db.prepare('SELECT * FROM t WHERE id = ?');
// ... later in handler:
const row = stmt.get(id);

// AFTER — inline queries (no prepare needed)
const row = await db.get('SELECT * FROM t WHERE id = ?', id);
```

The PostgreSQL `pg` driver handles statement preparation internally. The SQLite adapter calls `prepare()` inside each method call.

### 6.7 Route Files Changed (all 87)

admin, alignment-reviewer, analytics, apprentice, audit, auth, batch, benchmark, bridges, canvas, claude, coding, coding-large, coding-review, coding-scripts, collections, commands, community, compliance, compliance-policy, connections, continuity, custom-modules, data, datasets, deadlines, discovery, documents, dowjones, embeddings, engagements, eurlex, exchange, export, finance, folders, gap-assessments, health, human-oversight, insights, instruction-builder, integrations, intelligence-dashboard, knowledge, knowledge-graph, knowledge-library, knowledge-packs, legal-research, lore-ledger, memory, metrics, news, notifications, orchestrator, org-context, pattern-detection, pe-vc, post-market-monitoring, pptx-pipeline, presentations, profile, project-collaboration, project-files, projects, quality, radar, rag, regulatory-feed, reviews, roaring, schedules, school, search, session-resume, sessions, settings, skill-packs, skills, suggestions, task-agent, templates, trades, travel, triggers, versions, webhooks, workflows

### 6.8 Special Cases

**`school.ts`** — Factory function changed to `async`:
```typescript
// BEFORE
export function createSchoolRoutes(db: Database.Database) {
// AFTER
export async function createSchoolRoutes(db: DatabaseAdapter) {
```
And in `server/index.ts`: `app.use('/api', await createSchoolRoutes(db));`

**`auth.ts`** — Most complex route. Login, OAuth, JWT session management all made async. bcrypt calls remain sync (they're CPU-bound, not DB).

---

## 7. Phase 5: Service Migration (62 files)

Same mechanical pattern as routes. Additional patterns:

### 7.1 Services That Use Dialect Helpers

These services had SQL that the auto-translator couldn't handle (dynamic `julianday`, `strftime`, etc.):

```typescript
import { sql } from '../db/dialect-helpers.js';

// Example: orchestrator-engine.ts
const rows = await db.all(`
  SELECT id, title, due_date,
         ${sql.daysUntil('due_date', db.dialect)} as days_remaining
  FROM deadlines
  WHERE ${sql.daysUntil('due_date', db.dialect)} <= ?
`, alertDays);
```

Services that imported `sql` helpers:
- `orchestrator-engine.ts` (daysUntil, daysDiff)
- `time-intelligence.ts` (strftime, yearWeek, daysDiff)
- `pattern-detection.ts` (strftime, dateOffsetLiteral)
- `pattern-scheduler.ts` (dateOffsetParam)
- `proactive-intelligence.ts` (daysDiff)
- `quality-ratchet.ts` (strftime)
- `radar-fetcher.ts` (daysUntil)
- `regulatory-radar.ts` (daysUntil)
- `intelligence-dashboard routes` (yearWeek, strftime)
- `analytics routes` (strftime)
- `deadlines routes` (daysUntil)
- Several others with date arithmetic

### 7.2 Services That Return Functions (Now Async)

Many services are factory functions that return objects with methods. All methods that touch the DB became async:

```typescript
// BEFORE
function storeOutput(params): string { ... }
function getOutputsForExecution(id): WorkflowOutput[] { ... }

// AFTER
async function storeOutput(params): Promise<string> { ... }
async function getOutputsForExecution(id): Promise<WorkflowOutput[]> { ... }
```

**Every caller of these services also had to be updated to `await` the results.**

### 7.3 Service Files Changed (all 62)

anton-bundler, anton-importer, anton-validator, apprentice, atom-boost, atom-extractor, audit-queue, auditLogger, budget-manager, coding-engine, coding-integration, coding-review-engine, collaborative-canvas, collection-manager, command-parser, compliance-rules, connection-manager, data-importer, dataset-store, deadline-reminders, discovery-engine, document-indexer, embedding-pipeline, event-workflow-processor, gap-assessment-engine, graph-analytics, hybrid-search, insights-generator, institutional-memory, integrations/slack-commands, iterative-reasoning, knowledge-graph, knowledge-pack-service, knowledge-resolver, model-adapter, notification-service, orchestrator-demo, orchestrator-engine, orchestrator-heartbeat, orchestrator-pattern-engine, org-context, output-store, pattern-detection, pattern-scheduler, proactive-intelligence, prompt-builder, quality-ratchet, radar-fetcher, rag/indexer, rag/retriever, regulatory-radar, review-orchestrator, scheduler, security-logger, semantic-search, session-resume, suggestion-engine, time-intelligence, unified-llm-client, vector-store-adapter, webhook-listener, workflow-executor

---

## 8. Phase 6: Middleware & MCP

### Middleware (3 files)

- `server/middleware/audit.ts` — `db` type changed, queries made async
- `server/middleware/auth.ts` — `db` type changed, JWT session lookup made async
- `server/middleware/budget.ts` — `db` type changed, budget check made async

### MCP (3 files)

- `server/mcp/mcp-server.ts` — `db` type changed
- `server/mcp/mcp-tools.ts` — queries made async
- `server/mcp/openexpert-mcp.ts` — `db` type changed

### Types (1 file)

- `server/types/modelAdapter.ts` — `db` type in adapter interface changed from `Database.Database` to `DatabaseAdapter`

---

## 9. Phase 7: SQL Dialect Differences

### Patterns Handled by Auto-Translation (no code changes needed)

These patterns work automatically because the PostgreSQL adapter translates them at runtime:

1. `datetime('now')` → `NOW()`
2. `datetime('now', '-N days')` → `(NOW() + INTERVAL '-N days')`
3. `date('now')` → `CURRENT_DATE`
4. `strftime('%Y-%m', col)` → `TO_CHAR(col, 'YYYY-MM')`
5. `json_extract(col, '$.key')` → `col->>'key'`
6. `INSERT OR IGNORE INTO` → `INSERT INTO ... ON CONFLICT DO NOTHING`
7. `lower(hex(randomblob(N)))` → `encode(gen_random_bytes(N), 'hex')`
8. `?` placeholders → `$1, $2, $3`
9. Auto-`RETURNING *` on INSERT statements

### Patterns Requiring Manual Dialect Helpers

1. **`julianday()` arithmetic** — Used in deadline calculations, time intelligence
2. **Parameterized date intervals** — `datetime('now', '-' || ? || ' days')`
3. **`group_concat()`** → `STRING_AGG()`
4. **`LIKE` vs `ILIKE`** — SQLite LIKE is case-insensitive by default; PG requires ILIKE
5. **`sqlite_master`** vs `information_schema` — table/column existence checks
6. **`pragma_table_info()`** vs `information_schema.columns` — column existence checks

### Patterns NOT Translated (left as-is, work in both)

1. Standard SQL (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `JOIN`, etc.)
2. `COUNT(*)`, `SUM()`, `AVG()`, `MAX()`, `MIN()`
3. `COALESCE()`, `CASE WHEN`
4. `LIKE '%pattern%'` (works in both; PG is case-sensitive but we add ILIKE where needed)
5. `ORDER BY`, `LIMIT`, `OFFSET`
6. `ON CONFLICT (col) DO UPDATE SET` (PG-native, not in SQLite queries)
7. Integer booleans (`= 0`, `= 1`)

---

## 10. Phase 8: Full-Text Search

SQLite uses FTS5 virtual tables. PostgreSQL uses `TSVECTOR` + `GIN` indexes.

### SQLite FTS5 (unchanged)
```sql
CREATE VIRTUAL TABLE knowledge_atoms_fts USING fts5(content, content='knowledge_atoms', content_rowid='rowid');
```

### PostgreSQL Replacement
```sql
ALTER TABLE knowledge_atoms ADD COLUMN search_vector TSVECTOR;
CREATE INDEX idx_knowledge_atoms_search ON knowledge_atoms USING GIN(search_vector);
-- Trigger auto-updates search_vector on INSERT/UPDATE
```

### In Code

The `semantic-search.ts` and `hybrid-search.ts` services detect the dialect and use the appropriate FTS query:
- SQLite: `SELECT ... FROM knowledge_atoms_fts WHERE content MATCH ?`
- PostgreSQL: `SELECT ... FROM knowledge_atoms WHERE search_vector @@ plainto_tsquery('english', ?)`

---

## 11. Phase 9: Configuration & Infrastructure

### `.env.example` Changes

Added:
```env
# PostgreSQL (optional)
DATABASE_URL=postgresql://user:password@localhost:5432/anton
PG_POOL_MAX=20
PG_POOL_IDLE_TIMEOUT=30000
PG_CONNECTION_TIMEOUT=10000

# Ollama privacy hardening
OLLAMA_NO_CLOUD=1
```

Changed ports (to avoid conflict with SQLite instance during development):
```env
PORT=3011          # was 3001
CORS_ORIGINS=...5180  # was 5173
```

### `docker-compose.yml` Changes

- Added `postgres` service (PostgreSQL 16 Alpine) under `postgres` profile
- Added `pgdata` volume
- Updated port mappings to 3011
- Added commented-out `DATABASE_URL` in app service

```yaml
postgres:
  image: postgres:16-alpine
  profiles: ["postgres"]
  environment:
    POSTGRES_DB: anton
    POSTGRES_USER: anton
    POSTGRES_PASSWORD: anton_dev
  ports:
    - "5432:5432"
  volumes:
    - pgdata:/var/lib/postgresql/data
```

### `package.json` Changes

Added scripts:
```json
"db:init:pg": "tsx server/db/init-postgresql.ts",
"db:migrate:pg": "tsx server/db/run-migrations-pg.ts"
```

Note: `pg` package was already in `package.json` (installed previously).

### `vite.config.ts` Changes

```typescript
server: {
  port: 5180,      // was 5173
  proxy: {
    '/api': {
      target: 'http://localhost:3011',  // was 3001
    },
  },
}
```

---

## 12. Phase 10: Tests

### 4 New Test Files

1. **`tests/db/dialect-helpers.test.ts`** (123 lines)
   - Tests every `sql.*` helper for both `sqlite` and `postgresql` dialects
   - Validates SQL injection protection in `columnExistsQuery`

2. **`tests/db/schema-parity.test.ts`** (126 lines)
   - Reads `schema.postgresql.sql` and validates:
     - No SQLite-isms (`AUTOINCREMENT`, `datetime('now')`, `PRAGMA`, `FTS5`, etc.)
     - PostgreSQL features present (`SERIAL`, `TIMESTAMPTZ`, `NOW()`, `JSONB`, `TSVECTOR`, `GIN`)
     - All critical tables present (18 checked)
     - At least 170 tables, 200 indexes

3. **`tests/db/sqlite-adapter.test.ts`** (173 lines)
   - Integration tests with in-memory SQLite
   - Tests: `get()`, `all()`, `run()`, `exec()`, `transaction()`, nested transactions, update, delete

4. **`tests/db/translate-sql.test.ts`** (230 lines)
   - Tests `parseStringSegments()`, `convertPlaceholders()`, `translateSql()`, `transformSql()`
   - Covers: datetime, date, strftime, json_extract, INSERT OR IGNORE, randomblob
   - Edge cases: doubled quotes, string-literal safety, multiple patterns in one query

---

## 13. Phase 11: server/index.ts Changes

The main entry point had these changes:

1. **Import change**: `initDatabase` → `initDatabaseAdapter` + `DatabaseAdapter` type
2. **DB initialization**: `const db = initDatabase()` → `const db: DatabaseAdapter = await initDatabaseAdapter()`
3. **Table verification**: `sqlite_master` query → dialect-aware query
4. **Async handlers**: `setInterval`/`setTimeout` callbacks made async for pattern detection
5. **School routes**: `createSchoolRoutes(db)` → `await createSchoolRoutes(db)` (async factory)
6. **Community socket auth**: JWT session lookup made async
7. **Startup radar init**: Settings queries made async
8. **Shutdown**: `db.close()` made async
9. **Port changes**: 3001→3011, 5173→5180 (development separation)

---

## 14. Mechanical Transformation Patterns

### Find-and-Replace Patterns (for bulk transformation)

These regex patterns can be used to automate 90% of the migration:

#### Pattern 1: Import type
```
FIND:    import type Database from 'better-sqlite3';
REPLACE: import type { DatabaseAdapter } from '../db/database.js';
```

#### Pattern 2: Function signatures
```
FIND:    (db: Database.Database)
REPLACE: (db: DatabaseAdapter)
```

#### Pattern 3: Route handlers
```
FIND:    router.get('/path', (req, res) => {
REPLACE: router.get('/path', async (req, res) => {
```
(Same for `.post`, `.put`, `.patch`, `.delete`)

#### Pattern 4: db.prepare().get()
```
FIND:    db.prepare('...SQL...').get(params) as Type
REPLACE: await db.get<Type>('...SQL...', params)
```

#### Pattern 5: db.prepare().all()
```
FIND:    db.prepare('...SQL...').all(params) as Type[]
REPLACE: await db.all<Type>('...SQL...', params)
```

#### Pattern 6: db.prepare().run()
```
FIND:    db.prepare('...SQL...').run(params)
REPLACE: await db.run('...SQL...', params)
```

#### Pattern 7: Named params to positional
```
FIND:    .run({ id, name, value })   or   .run(@id, @name)
REPLACE: id, name, value   (positional ? params)
```

### Manual Changes Required

- Functions that call DB must become `async`
- Return types must become `Promise<T>`
- Callers must add `await`
- Prepared statements declared at module scope must be inlined
- Named `@param` bindings must become `?` positional
- `julianday()`, parameterized `strftime()`, `group_concat()` → use `sql.*` helpers
- `sqlite_master` / `pragma_table_info` checks → use `sql.*` helpers
- FTS5 queries → dialect-specific branching

---

## 15. Gotchas & Lessons Learned

### 1. Sync → Async Cascade
Making `db.get()` async means every function that calls it must be async, and every function that calls THAT must be async. This cascades through the entire call chain. Plan for it.

### 2. Named Parameters Don't Work
SQLite's `@param` named bindings don't translate. ALL queries must use `?` positional params. The PostgreSQL adapter converts `?` to `$1, $2, $3`.

### 3. INSERT OR REPLACE Needs Manual Handling
`INSERT OR REPLACE INTO` cannot be auto-translated because PostgreSQL needs a specific `ON CONFLICT (column) DO UPDATE SET ...` clause. Use `sql.insertOrReplacePrefix()` + explicit `ON CONFLICT` clause. In most places we converted to `ON CONFLICT (key) DO UPDATE SET ...`.

### 4. LIKE vs ILIKE
SQLite `LIKE` is case-insensitive by default. PostgreSQL `LIKE` is case-sensitive. For text search, use `sql.ilike(dialect)` which returns `LIKE` for SQLite and `ILIKE` for PostgreSQL.

### 5. Boolean Values
We kept booleans as `INTEGER 0/1` in PostgreSQL (not native `BOOLEAN`) to avoid changing all `= 0` / `= 1` checks. This was a pragmatic decision.

### 6. JSON Columns
PostgreSQL auto-parses JSONB columns into objects. SQLite returns JSON as strings. Some code expects `JSON.parse(row.config)` — this is fine because `JSON.parse()` on an already-parsed object returns it unchanged, BUT be aware that `typeof row.config` might be `object` in PG vs `string` in SQLite.

### 7. Date Return Types
SQLite returns dates as strings (`"2024-01-15 10:30:00"`). PostgreSQL returns `Date` objects for `TIMESTAMPTZ` columns. Code that does string operations on dates (`.substring()`, `.split('T')`) may need adjustment.

### 8. RETURNING * on INSERT
The PostgreSQL adapter auto-appends `RETURNING *` to INSERT statements. This means `run()` returns the full inserted row. The `lastInsertRowid` is extracted from the `id` column of the returned row (or the first column if no `id`).

### 9. Port Separation
We used different ports (3011/5180) during development to run both SQLite and PostgreSQL instances simultaneously. When replaying on main, decide whether to keep this or revert to 3001/5173.

### 10. `exec()` Doesn't Convert Placeholders
`db.exec()` is for raw DDL/multi-statement SQL. It applies `translateSql()` but NOT `convertPlaceholders()` (since exec doesn't take params). This is correct behavior.

### 11. School Routes Async Factory
`createSchoolRoutes()` became `async` because it calls DB during initialization (seeding teacher personas). This required `await` at the mount point in `index.ts`. Check for other routes that might do DB work during factory initialization.

---

## 16. File-by-File Change List

### New Files (14)
- `server/db/database.ts`
- `server/db/dialect-helpers.ts`
- `server/db/adapters/sqlite-adapter.ts`
- `server/db/adapters/postgresql-adapter.ts`
- `server/db/init-database.ts`
- `server/db/init-postgresql.ts`
- `server/db/run-migrations-pg.ts`
- `server/db/schema.postgresql.sql`
- `server/db/migrations-pg/039_knowledge_atoms_fts_pg.sql`
- `server/db/migrations-pg/README.md`
- `tests/db/dialect-helpers.test.ts`
- `tests/db/schema-parity.test.ts`
- `tests/db/sqlite-adapter.test.ts`
- `tests/db/translate-sql.test.ts`

### Modified Files (164)
- `server/index.ts` (entry point)
- `server/routes/*` (87 route files)
- `server/services/*` (62 service files)
- `server/middleware/*` (3 files)
- `server/mcp/*` (3 files)
- `server/types/modelAdapter.ts`
- `.env.example`
- `docker-compose.yml`
- `package.json`
- `vite.config.ts`
- `server/db/init.ts` (minor change)
- `server/db/schema.sql` (1 line added)
- `server/db/migrations/046_gap_findings_unique.sql` (new SQLite migration)

---

## 17. Replay Checklist

When redoing this migration on the updated `main` branch:

### Pre-Work
- [ ] Create new `postgresql` branch from latest `main`
- [ ] Identify any NEW route/service files added since the fork (Mistral functions, etc.)
- [ ] Identify any NEW tables/migrations added since the fork
- [ ] Decide on port strategy (keep 3001/5173 or separate)

### Phase 1: Abstraction Layer (copy as-is)
- [ ] Create `server/db/database.ts` — DatabaseAdapter interface
- [ ] Create `server/db/adapters/sqlite-adapter.ts` — SQLite wrapper
- [ ] Create `server/db/adapters/postgresql-adapter.ts` — PG adapter with auto-translation
- [ ] Create `server/db/dialect-helpers.ts` — sql.* helpers
- [ ] Create `server/db/init-database.ts` — unified init entry point

### Phase 2: Schema
- [ ] Generate `server/db/schema.postgresql.sql` from current `schema.sql` + all migrations
- [ ] Convert all SQLite-isms (AUTOINCREMENT→SERIAL, datetime→NOW, etc.)
- [ ] Add TSVECTOR + GIN for FTS tables
- [ ] Verify table count matches SQLite

### Phase 3: Init & Migrations
- [ ] Create `server/db/init-postgresql.ts` with seed data
- [ ] Create `server/db/run-migrations-pg.ts`
- [ ] Create `server/db/migrations-pg/` directory with PG-specific migrations
- [ ] Update legacy migration list to include all current migrations

### Phase 4: Route Migration
- [ ] Change import: `better-sqlite3` → `DatabaseAdapter`
- [ ] Change function signature: `Database.Database` → `DatabaseAdapter`
- [ ] Make all handlers `async`
- [ ] Convert all `db.prepare().get/all/run()` → `await db.get/all/run()`
- [ ] Convert named params → positional `?` params
- [ ] Inline any prepared statements
- [ ] Add dialect helpers where needed (`julianday`, `strftime`, etc.)

### Phase 5: Service Migration
- [ ] Same patterns as routes
- [ ] Pay attention to return types: functions returning DB results must return `Promise<T>`
- [ ] Update all callers to `await`

### Phase 6: Middleware & MCP
- [ ] Update middleware types and make async
- [ ] Update MCP types and make async

### Phase 7: Entry Point
- [ ] Update `server/index.ts` to use `initDatabaseAdapter()`
- [ ] Make startup queries async
- [ ] Handle `await` for async route factories

### Phase 8: Config
- [ ] Update `.env.example` with PG variables
- [ ] Update `docker-compose.yml` with PG service
- [ ] Add `db:init:pg` and `db:migrate:pg` scripts to `package.json`
- [ ] Update `vite.config.ts` if using separate ports

### Phase 9: Tests
- [ ] Create/update test files
- [ ] Run `pnpm test` to verify SQLite still works
- [ ] Test PostgreSQL with a real PG instance

### Phase 10: Verification
- [ ] TypeScript compiles (`pnpm typecheck`)
- [ ] Dev server starts with SQLite (default)
- [ ] Dev server starts with PostgreSQL (`DATABASE_URL` set)
- [ ] All CRUD operations work in both modes
- [ ] FTS works in both modes
- [ ] Exports work in both modes
- [ ] Auth works in both modes (team mode)

---

*Generated from analysis of commit `2877f05` on the `postgresql` branch, 2026-03-16.*
