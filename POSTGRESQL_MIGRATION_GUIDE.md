# ANTON PostgreSQL Migration Guide

## For Claude Code — Step-by-Step Migration from SQLite to PostgreSQL

**Created:** 2026-03-13
**Source:** Deep codebase research across schema, init, migrations, routes, and services
**Target branch:** `postgresql` (NEVER push to main)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture](#2-current-architecture)
3. [Migration Surface Area](#3-migration-surface-area)
4. [SQLite → PostgreSQL Translation Reference](#4-sqlite--postgresql-translation-reference)
5. [The Database Abstraction Layer Strategy](#5-the-database-abstraction-layer-strategy)
6. [Phase 1: PostgreSQL Schema](#6-phase-1-postgresql-schema)
7. [Phase 2: Database Abstraction Layer](#7-phase-2-database-abstraction-layer)
8. [Phase 3: Migrate Init & Migrations](#8-phase-3-migrate-init--migrations)
9. [Phase 4: Migrate Routes (by priority)](#9-phase-4-migrate-routes-by-priority)
10. [Phase 5: Migrate Services](#10-phase-5-migrate-services)
11. [Phase 6: FTS5 → PostgreSQL Full-Text Search](#11-phase-6-fts5--postgresql-full-text-search)
12. [Phase 7: Environment & Configuration](#12-phase-7-environment--configuration)
13. [Phase 8: Testing & Validation](#13-phase-8-testing--validation)
14. [Critical Gotchas](#14-critical-gotchas)
15. [File-by-File Migration Inventory](#15-file-by-file-migration-inventory)
16. [SQL Translation Cheat Sheet](#16-sql-translation-cheat-sheet)

---

## 1. Executive Summary

### What We're Migrating

ANTON currently uses **SQLite** (via `better-sqlite3`) as its sole relational database. The migration adds **PostgreSQL** as an alternative backend, selected via environment variable. SQLite remains the default for solo/local deployments.

### Key Numbers

| Metric | Count |
|--------|-------|
| Total database tables | ~144 |
| Total `.prepare()` calls to convert | **1,589** |
| Files touching the database | **~100** (routes + services) |
| Route files with DB access | 65+ |
| Service files with DB access | 35+ |
| `db.transaction()` usages | 10 |
| FTS5 virtual tables | 1 (+ 3 triggers) |
| SQLite-specific datetime calls | ~15 in queries |
| `INSERT OR IGNORE/REPLACE` statements | ~50 |
| CHECK constraints | 100+ (all compatible) |
| Migration SQL files | 45 |
| Indexes | 200+ |

### The Core Challenge

`better-sqlite3` is **synchronous**. Every `.prepare().get()`, `.prepare().all()`, `.prepare().run()` call blocks until complete. PostgreSQL drivers (`pg`) are **asynchronous** — every query returns a Promise. This means every database call site must become `async/await`.

### Recommended Strategy

**Dual-mode abstraction layer** — a thin wrapper (`server/db/database.ts`) that:
- Exports the same API surface (`.query()`, `.get()`, `.all()`, `.run()`, `.transaction()`)
- Auto-detects SQLite vs PostgreSQL from `DATABASE_URL` env var
- Uses `better-sqlite3` (sync) for SQLite, `pg.Pool` (async) for PostgreSQL
- All consuming code uses `await db.query(...)` — works for both backends

---

## 2. Current Architecture

### Database Instantiation

```
server/index.ts (line 245)
  └── initDatabase() from server/db/init.ts
       ├── new Database(DB_PATH)           // better-sqlite3
       ├── PRAGMA journal_mode = WAL
       ├── PRAGMA foreign_keys = ON
       ├── PRAGMA busy_timeout = 5000
       ├── exec(schema.sql)                // 247 lines, 9 base tables
       ├── Sentinel migrations (001–027b)  // Column/table existence checks
       ├── Generic migration runner (028+) // schema_migrations tracking
       └── Seed data (capabilities, radar sources, compliance rules)
```

### How DB Is Passed Around

Factory pattern — single `db` instance created in `server/index.ts`, passed to every route factory:

```typescript
// Current pattern (synchronous)
export function createMyRoutes(db: Database): Router {
  const router = Router();
  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    res.json(row);
  });
  return router;
}
```

### Environment Variables

| Variable | Current | Purpose |
|----------|---------|---------|
| `DB_PATH` | `./data/workbench.sqlite` | SQLite file path |
| `DATABASE_URL` | (not set) | **Already detected** in index.ts for auto-mode |
| `DEPLOYMENT_MODE` | `solo` / `team` | Auto-set to `team` when `DATABASE_URL` starts with `postgres` |

**Important:** `server/index.ts` lines 139–146 already auto-detect PostgreSQL:
```typescript
if (!process.env.DEPLOYMENT_MODE) {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
    process.env.DEPLOYMENT_MODE = 'team';
  } else {
    process.env.DEPLOYMENT_MODE = 'solo';
  }
}
```

### Existing PostgreSQL Infrastructure

- **`pg` package already installed:** `"pg": "^8.18.0"` in package.json
- **PostgreSQL driver exists:** `server/services/db-drivers/postgresql-driver.ts` — has `test()`, `query()`, `createPool()`, `closePool()` methods (used for user-connected external databases, NOT for ANTON's own DB)
- **Driver interface:** `server/services/db-drivers/driver-interface.ts` — defines `DatabaseDriver` with pool support

---

## 3. Migration Surface Area

### Files Ranked by .prepare() Call Count (Top 30)

| Rank | File | .prepare() calls | Complexity |
|------|------|-----------------|------------|
| 1 | `routes/school.ts` | 174 | Very High |
| 2 | `routes/engagements.ts` | 131 | Very High |
| 3 | `routes/coding-large.ts` | 75 | High |
| 4 | `routes/orchestrator.ts` | 63 | High |
| 5 | `routes/community.ts` | 59 | High |
| 6 | `routes/task-agent.ts` | 49 | High |
| 7 | `services/orchestrator-engine.ts` | 47 | High |
| 8 | `routes/claude.ts` | 32 | Medium |
| 9 | `routes/auth.ts` | 32 | Medium |
| 10 | `routes/instruction-builder.ts` | 26 | Medium |
| 11 | `routes/gap-assessments.ts` | 25 | Medium |
| 12 | `routes/alignment-reviewer.ts` | 23 | Medium |
| 13 | `services/time-intelligence.ts` | 20 | Medium |
| 14 | `services/compliance-rules.ts` | 20 | Medium |
| 15 | `routes/bridges.ts` | 20 | Medium |
| 16 | `services/webhook-listener.ts` | 19 | Medium |
| 17 | `routes/sessions.ts` | 19 | Medium |
| 18 | `services/knowledge-pack-service.ts` | 18 | Medium |
| 19 | `services/anton-bundler.ts` | 18 | Medium |
| 20 | `routes/trades.ts` | 18 | Medium |
| 21 | `routes/projects.ts` | 18 | Medium |
| 22 | `routes/project-collaboration.ts` | 17 | Medium |
| 23 | `services/knowledge-graph.ts` | 15 | Medium |
| 24 | `services/dataset-store.ts` | 15 | Medium |
| 25 | `services/connection-manager.ts` | 15 | Medium |
| 26 | `services/regulatory-radar.ts` | 14 | Low-Med |
| 27 | `services/quality-ratchet.ts` | 14 | Low-Med |
| 28 | `services/pattern-detection.ts` | 14 | Low-Med |
| 29 | `routes/embeddings.ts` | 14 | Low-Med |
| 30 | `routes/audit.ts` | 14 | Low-Med |

**Remaining files (30+):** 1–13 calls each. See [Section 15](#15-file-by-file-migration-inventory) for the complete list.

### Files Using db.transaction()

| File | Count | Notes |
|------|-------|-------|
| `services/knowledge-pack-service.ts` | 2 | Bulk entity import, activation |
| `services/atom-extractor.ts` | 2 | Batch atom insertion + relationship creation |
| `services/time-intelligence.ts` | 1 | Multi-table deadline updates |
| `services/prompt-builder.ts` | 1 | Knowledge layer assembly |
| `services/gap-assessment-engine.ts` | 1 | Assessment phase updates |
| `services/dataset-store.ts` | 1 | Dataset lifecycle |
| `services/data-importer.ts` | 1 | Bulk data import |
| `services/audit-queue.ts` | 1 | Audit event flush |

---

## 4. SQLite → PostgreSQL Translation Reference

### Data Types

| SQLite | PostgreSQL | Notes |
|--------|-----------|-------|
| `TEXT` | `TEXT` | Compatible |
| `INTEGER` | `INTEGER` | Compatible |
| `REAL` | `DOUBLE PRECISION` or `NUMERIC` | Use `NUMERIC` for money/scores |
| `BLOB` | `BYTEA` | Not used in ANTON |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` or `BIGSERIAL` | Drop AUTOINCREMENT keyword |
| `DATETIME` | `TIMESTAMPTZ` | Use timezone-aware timestamps |
| `JSON` (stored as TEXT) | `JSONB` | Use native JSONB in PostgreSQL |
| `BOOLEAN` (stored as INTEGER 0/1) | `BOOLEAN` | PostgreSQL has native boolean |

### Functions

| SQLite | PostgreSQL | Usage Locations |
|--------|-----------|-----------------|
| `datetime('now')` | `NOW()` or `CURRENT_TIMESTAMP` | ~200 DEFAULT clauses, ~15 queries |
| `strftime('%Y-%m', date)` | `TO_CHAR(date, 'YYYY-MM')` | intelligence-dashboard.ts, claude.ts, audit.ts, analytics.ts, admin.ts |
| `strftime('%Y-W%W', date)` | `TO_CHAR(date, 'IYYY-"W"IW')` | intelligence-dashboard.ts |
| `julianday(date)` | `EXTRACT(EPOCH FROM date)` or date arithmetic | orchestrator-engine.ts, orchestrator-pattern-engine.ts |
| `julianday(a) - julianday(b)` | `EXTRACT(EPOCH FROM (a - b)) / 86400` or `a - b` (returns interval) | 4 locations |
| `json_extract(col, '$.key')` | `col->>'key'` (JSONB) | 1 location: community.ts |
| `GLOB pattern` | `LIKE` or `~` (regex) | Not used in queries |
| `typeof(x)` | `pg_typeof(x)` | Not used in queries |
| `group_concat(col, sep)` | `STRING_AGG(col, sep)` | Check if used |
| `IFNULL(a, b)` | `COALESCE(a, b)` | Check if used |

### Upsert Syntax

| SQLite | PostgreSQL | Count |
|--------|-----------|-------|
| `INSERT OR IGNORE INTO t ...` | `INSERT INTO t ... ON CONFLICT DO NOTHING` | ~40 locations |
| `INSERT OR REPLACE INTO t ...` | `INSERT INTO t ... ON CONFLICT (key) DO UPDATE SET ...` | ~15 locations |
| `ON CONFLICT(col) DO UPDATE SET ...` | Same syntax — **already compatible** | ~15 locations |

**Good news:** Many routes already use `ON CONFLICT ... DO UPDATE SET` which works in both SQLite and PostgreSQL.

### Parameterised Queries

| SQLite (better-sqlite3) | PostgreSQL (pg) |
|------------------------|-----------------|
| `db.prepare('SELECT * FROM t WHERE id = ?').get(id)` | `pool.query('SELECT * FROM t WHERE id = $1', [id])` |
| `?` placeholders (positional) | `$1, $2, $3` placeholders (numbered) |
| `.get()` returns single row or undefined | `.query()` returns `{ rows: [...] }`, use `rows[0]` |
| `.all()` returns array | `.query()` returns `{ rows: [...] }`, use `rows` |
| `.run()` returns `{ changes, lastInsertRowid }` | `.query()` returns `{ rowCount, rows }` |

### PRAGMA Equivalents

| SQLite PRAGMA | PostgreSQL Equivalent |
|---------------|----------------------|
| `PRAGMA journal_mode = WAL` | N/A (PostgreSQL uses WAL by default) |
| `PRAGMA foreign_keys = ON` | Always enforced in PostgreSQL |
| `PRAGMA busy_timeout = 5000` | Connection pool timeout: `connectionTimeoutMillis` |
| `PRAGMA table_info(tablename)` | `SELECT * FROM information_schema.columns WHERE table_name = 'tablename'` |
| `SELECT * FROM sqlite_master WHERE type='table'` | `SELECT * FROM information_schema.tables WHERE table_schema = 'public'` |

---

## 5. The Database Abstraction Layer Strategy

### Recommended Approach: Thin Abstraction Layer

Create `server/db/database.ts` — a unified interface that wraps both backends:

```typescript
// server/db/database.ts — THE KEY NEW FILE

export interface DbResult {
  rows: any[];
  rowCount: number;
  lastInsertId?: number | bigint;
}

export interface DatabaseAdapter {
  /** Single row query */
  get<T = any>(sql: string, ...params: any[]): Promise<T | undefined>;

  /** Multi-row query */
  all<T = any>(sql: string, ...params: any[]): Promise<T[]>;

  /** Execute (INSERT/UPDATE/DELETE) */
  run(sql: string, ...params: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }>;

  /** Raw execute (DDL, multi-statement) */
  exec(sql: string): Promise<void>;

  /** Transaction wrapper */
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;

  /** Close connection */
  close(): Promise<void>;

  /** Which backend? */
  readonly dialect: 'sqlite' | 'postgresql';
}
```

### Why This Approach

1. **Minimal code changes in routes/services** — replace `db.prepare(...).get(...)` with `await db.get(...)` everywhere
2. **SQL stays mostly the same** — the abstraction handles parameter style (`?` → `$1`) and function translation
3. **Transactions work the same way** — `await db.transaction(async (tx) => { ... })`
4. **Both backends remain supported** — solo users keep SQLite, team users get PostgreSQL
5. **Incremental migration** — convert file by file, test as you go

### Parameter Translation

The abstraction layer should auto-convert `?` placeholders to `$1, $2, $3` for PostgreSQL:

```typescript
function convertParams(sql: string, dialect: 'sqlite' | 'postgresql'): string {
  if (dialect === 'sqlite') return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
```

### SQL Dialect Helpers

For the ~15 queries that use SQLite-specific functions, provide helpers:

```typescript
export function now(dialect: 'sqlite' | 'postgresql'): string {
  return dialect === 'sqlite' ? "datetime('now')" : 'NOW()';
}

export function strftime(format: string, col: string, dialect: 'sqlite' | 'postgresql'): string {
  if (dialect === 'sqlite') return `strftime('${format}', ${col})`;
  // Convert strftime format to PostgreSQL TO_CHAR format
  const pgFormat = format
    .replace('%Y', 'YYYY').replace('%m', 'MM').replace('%d', 'DD')
    .replace('%H', 'HH24').replace('%M', 'MI').replace('%S', 'SS')
    .replace('%W', 'IW');
  return `TO_CHAR(${col}, '${pgFormat}')`;
}

export function julianDayDiff(a: string, b: string, dialect: 'sqlite' | 'postgresql'): string {
  if (dialect === 'sqlite') return `julianday(${a}) - julianday(${b})`;
  return `EXTRACT(EPOCH FROM (${a}::timestamp - ${b}::timestamp)) / 86400.0`;
}
```

---

## 6. Phase 1: PostgreSQL Schema

### Step 1.1: Create PostgreSQL Schema File

Create `server/db/schema.postgresql.sql` — a PostgreSQL-native version of the full schema.

**Key conversions from schema.sql:**

```sql
-- SQLite
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT,
  title TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  config TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

-- PostgreSQL
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  module_id TEXT,
  title TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Apply this pattern to all ~144 tables:**
- `DATETIME DEFAULT (datetime('now'))` → `TIMESTAMPTZ DEFAULT NOW()`
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`
- `TEXT` columns storing JSON → `JSONB` (where appropriate — config, entities, tags, metadata columns)
- `REAL` → `DOUBLE PRECISION` (or `NUMERIC` for financial)
- `CHECK` constraints → identical (all compatible)
- `UNIQUE` constraints → identical (all compatible)

### Step 1.2: Handle FTS5 Replacement

SQLite FTS5 does NOT exist in PostgreSQL. Replace with PostgreSQL's native full-text search:

```sql
-- Instead of: CREATE VIRTUAL TABLE knowledge_atoms_fts USING fts5(content, ...)

-- PostgreSQL: Add tsvector column + GIN index
ALTER TABLE knowledge_atoms ADD COLUMN search_vector TSVECTOR;

CREATE INDEX idx_knowledge_atoms_search ON knowledge_atoms USING GIN(search_vector);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION knowledge_atoms_search_trigger() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_knowledge_atoms_search
  BEFORE INSERT OR UPDATE ON knowledge_atoms
  FOR EACH ROW EXECUTE FUNCTION knowledge_atoms_search_trigger();
```

### Step 1.3: Create Migration Runner for PostgreSQL

Create `server/db/init-postgresql.ts` — equivalent to `init.ts` but for PostgreSQL:

```typescript
import { Pool } from 'pg';

export async function initPostgresDatabase(databaseUrl: string): Promise<Pool> {
  const pool = new Pool({ connectionString: databaseUrl, max: 20 });

  // Create schema
  const schema = fs.readFileSync('server/db/schema.postgresql.sql', 'utf-8');
  await pool.query(schema);

  // Run migrations
  await runPostgresMigrations(pool);

  // Seed data
  await seedPostgresData(pool);

  return pool;
}
```

---

## 7. Phase 2: Database Abstraction Layer

### Step 2.1: Create the Abstraction

Create `server/db/database.ts` with the interface defined in Section 5.

### Step 2.2: Implement SQLite Adapter

```typescript
// server/db/adapters/sqlite-adapter.ts
import Database from 'better-sqlite3';

export class SqliteAdapter implements DatabaseAdapter {
  readonly dialect = 'sqlite' as const;

  constructor(private db: Database.Database) {}

  async get<T>(sql: string, ...params: any[]): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, ...params: any[]): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async run(sql: string, ...params: any[]) {
    const result = this.db.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  async exec(sql: string) {
    this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    // better-sqlite3 transactions are sync, but we wrap them
    return this.db.transaction(() => fn(this))();
  }

  async close() {
    this.db.close();
  }
}
```

### Step 2.3: Implement PostgreSQL Adapter

```typescript
// server/db/adapters/postgresql-adapter.ts
import { Pool, PoolClient } from 'pg';

export class PostgresAdapter implements DatabaseAdapter {
  readonly dialect = 'postgresql' as const;

  constructor(private pool: Pool) {}

  private convertParams(sql: string): string {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  async get<T>(sql: string, ...params: any[]): Promise<T | undefined> {
    const result = await this.pool.query(this.convertParams(sql), params);
    return result.rows[0] as T | undefined;
  }

  async all<T>(sql: string, ...params: any[]): Promise<T[]> {
    const result = await this.pool.query(this.convertParams(sql), params);
    return result.rows as T[];
  }

  async run(sql: string, ...params: any[]) {
    const pgSql = this.convertParams(sql) + (sql.trim().toUpperCase().startsWith('INSERT') ? ' RETURNING *' : '');
    const result = await this.pool.query(pgSql, params);
    return { changes: result.rowCount || 0, lastInsertRowid: result.rows[0]?.id };
  }

  async exec(sql: string) {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txAdapter = new PostgresClientAdapter(client);
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
```

### Step 2.4: Factory Function

```typescript
// server/db/database.ts
export async function createDatabase(): Promise<DatabaseAdapter> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && databaseUrl.startsWith('postgres')) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl, max: 20 });
    await initPostgresSchema(pool);
    return new PostgresAdapter(pool);
  } else {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(process.env.DB_PATH || './data/workbench.sqlite');
    initSqliteDatabase(db);  // existing init logic
    return new SqliteAdapter(db);
  }
}
```

---

## 8. Phase 3: Migrate Init & Migrations

### Step 3.1: Convert init.ts

The current `init.ts` (3,076 lines) does:
1. Create DB + set PRAGMAs
2. Execute schema.sql
3. Run sentinel-based migrations (001–027b) using `PRAGMA table_info()`
4. Run generic migrations (028+) using `schema_migrations` table
5. Seed default data

**For PostgreSQL:**
- PRAGMAs become no-ops (PostgreSQL handles WAL, foreign keys natively)
- `PRAGMA table_info()` → `information_schema.columns` queries
- `sqlite_master` → `information_schema.tables`
- All `db.exec()` → `await pool.query()`
- Sentinel checks rewritten for information_schema

### Step 3.2: Convert Migration Files

The 45 `.sql` files in `server/db/migrations/` need PostgreSQL versions. Create a parallel directory:

```
server/db/migrations/           # SQLite (existing)
server/db/migrations-pg/        # PostgreSQL (new)
```

Key conversions per migration:
- `AUTOINCREMENT` → `SERIAL`
- `datetime('now')` → `NOW()`
- `PRAGMA foreign_keys=off/on` → remove (PostgreSQL manages this differently — use `SET CONSTRAINTS ALL DEFERRED` if needed)
- Table reconstruction patterns (DROP + CREATE + copy) → use `ALTER TABLE` directly (PostgreSQL supports most ALTER operations that SQLite doesn't)

### Step 3.3: Sentinel Checks

Current pattern (SQLite):
```typescript
const sentinel = db.prepare(
  "SELECT COUNT(*) as c FROM pragma_table_info('entity_nodes') WHERE name='source'"
).get() as { c: number };
```

PostgreSQL equivalent:
```typescript
const sentinel = await db.get(
  "SELECT COUNT(*) as c FROM information_schema.columns WHERE table_name = 'entity_nodes' AND column_name = 'source'"
) as { c: number };
```

---

## 9. Phase 4: Migrate Routes (by priority)

### Migration Order (recommended)

Start with low-traffic, simple routes to build confidence, then tackle the monsters.

#### Wave 1: Low complexity (1–10 .prepare() calls)

These are quick wins — small files, few queries, minimal SQLite-specific features.

| File | Calls | Tables |
|------|-------|--------|
| `routes/health.ts` | 1 | none (just SELECT 1) |
| `routes/settings.ts` | 3 | app_settings |
| `routes/profile.ts` | 4 | user_profiles |
| `routes/notifications.ts` | 5 | notifications |
| `routes/reviews.ts` | 5 | reviews |
| `routes/suggestions.ts` | 2 | sessions, knowledge_atoms |
| `routes/skill-packs.ts` | 4 | skill_packs |
| `routes/versions.ts` | 5 | versions |
| `routes/org-context.ts` | 6 | org_context, org_context_history |
| `routes/session-resume.ts` | 6 | session_snapshots |
| `routes/quality.ts` | 7 | quality_scores, quality_baselines |
| `routes/knowledge-packs.ts` | 6 | knowledge_packs, entity_nodes |
| `routes/regulatory-feed.ts` | 7 | regulatory_feed_subscriptions, digests |
| `routes/knowledge-graph.ts` | 7 | entity_nodes, entity_relationships |

#### Wave 2: Medium complexity (10–25 calls)

| File | Calls | Notes |
|------|-------|-------|
| `routes/sessions.ts` | 19 | Core session CRUD |
| `routes/projects.ts` | 18 | Project management |
| `routes/claude.ts` | 32 | LLM integration — has `strftime()` queries |
| `routes/auth.ts` | 32 | Authentication — security-critical |
| `routes/audit.ts` | 14 | Has `strftime()` formatting |
| `routes/analytics.ts` | 10 | Has `strftime()` formatting |
| `routes/gap-assessments.ts` | 25 | Assessment lifecycle |
| `routes/intelligence-dashboard.ts` | 11 | Has `strftime()` for weekly grouping |
| `routes/deadlines.ts` | 11 | Date math potential |

#### Wave 3: High complexity (25–75 calls)

| File | Calls | Notes |
|------|-------|-------|
| `routes/task-agent.ts` | 49 | Task queue + capabilities |
| `routes/orchestrator.ts` | 63 | Multi-table, complex queries |
| `routes/community.ts` | 59 | Has `json_extract()` (1 usage) |
| `routes/coding-large.ts` | 75 | Coding project management |

#### Wave 4: Monsters (100+ calls)

| File | Calls | Notes |
|------|-------|-------|
| `routes/engagements.ts` | 131 | Full engagement lifecycle |
| `routes/school.ts` | 174 | **Largest file** — school mode |

### Conversion Pattern Per Route

For each route file, the conversion is mechanical:

```typescript
// BEFORE (synchronous, better-sqlite3)
export function createSessionRoutes(db: Database): Router {
  const router = Router();
  router.get('/:id', (req, res) => {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    res.json(session);
  });
  return router;
}

// AFTER (async, abstraction layer)
export function createSessionRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  router.get('/:id', async (req, res) => {
    const session = await db.get('SELECT * FROM sessions WHERE id = ?', req.params.id);
    res.json(session);
  });
  return router;
}
```

**Changes per call site:**
1. Route handler becomes `async`
2. `db.prepare(sql).get(params)` → `await db.get(sql, params)`
3. `db.prepare(sql).all(params)` → `await db.all(sql, params)`
4. `db.prepare(sql).run(params)` → `await db.run(sql, params)`
5. Type annotation `Database` → `DatabaseAdapter`
6. Add try/catch with `safeError()` if not already present

---

## 10. Phase 5: Migrate Services

### Priority Services

| Service | Calls | Complexity | Notes |
|---------|-------|-----------|-------|
| `orchestrator-engine.ts` | 47 | High | `julianday()` date math |
| `orchestrator-pattern-engine.ts` | 12 | Medium | `julianday()` usage |
| `knowledge-pack-service.ts` | 18 | Medium | 2 transactions |
| `atom-extractor.ts` | 8 | Medium | 2 transactions |
| `prompt-builder.ts` | 9 | Medium | 1 transaction |
| `hybrid-search.ts` | 6 | **Critical** | FTS5 MATCH queries |
| `quality-ratchet.ts` | 14 | Medium | |
| `pattern-detection.ts` | 14 | Medium | |
| `time-intelligence.ts` | 20 | Medium | 1 transaction, date math |
| `gap-assessment-engine.ts` | 6 | Medium | 1 transaction |
| `compliance-rules.ts` | 20 | Medium | |
| `dataset-store.ts` | 15 | Medium | 1 transaction |
| `audit-queue.ts` | 2 | Low | 1 transaction |

### Transaction Conversion

```typescript
// BEFORE (better-sqlite3 sync transaction)
const insertAtoms = db.transaction((atoms) => {
  for (const atom of atoms) {
    db.prepare('INSERT INTO knowledge_atoms ...').run(atom.id, atom.content);
  }
});
insertAtoms(atomBatch);

// AFTER (async transaction via abstraction)
await db.transaction(async (tx) => {
  for (const atom of atoms) {
    await tx.run('INSERT INTO knowledge_atoms ...', atom.id, atom.content);
  }
});
```

---

## 11. Phase 6: FTS5 → PostgreSQL Full-Text Search

### Current FTS5 Usage

**File:** `server/services/hybrid-search.ts` (lines 289–306)

```typescript
// Current SQLite FTS5 query
const ftsResults = db.prepare(`
  SELECT ka.id, ka.content, ka.atom_type, ka.category, ka.confidence,
         ka.source_area_id, ka.source_module_id, ka.created_at,
         rank as bm25_score
  FROM knowledge_atoms_fts
  JOIN knowledge_atoms ka ON knowledge_atoms_fts.rowid = ka.rowid
  WHERE knowledge_atoms_fts MATCH ?
  AND ka.is_active = 1
  ORDER BY rank
  LIMIT ?
`).all(query, limit * 2);
```

### PostgreSQL Replacement

```sql
-- PostgreSQL full-text search equivalent
SELECT ka.id, ka.content, ka.atom_type, ka.category, ka.confidence,
       ka.source_area_id, ka.source_module_id, ka.created_at,
       ts_rank(ka.search_vector, plainto_tsquery('english', $1)) as bm25_score
FROM knowledge_atoms ka
WHERE ka.search_vector @@ plainto_tsquery('english', $1)
AND ka.is_active = true
ORDER BY bm25_score DESC
LIMIT $2
```

### Steps

1. Add `search_vector TSVECTOR` column to `knowledge_atoms` table in PostgreSQL schema
2. Create GIN index on `search_vector`
3. Create trigger to auto-update `search_vector` on INSERT/UPDATE
4. Backfill: `UPDATE knowledge_atoms SET search_vector = to_tsvector('english', content)`
5. Modify `hybrid-search.ts` to use `ts_rank()` and `@@` operator when dialect is PostgreSQL
6. The fallback LIKE query (line 306) remains as-is for both backends

---

## 12. Phase 7: Environment & Configuration

### New Environment Variables

Add to `.env.example`:

```bash
# PostgreSQL (optional — set to enable PostgreSQL instead of SQLite)
# DATABASE_URL=postgresql://user:password@localhost:5432/anton
# When set, DEPLOYMENT_MODE auto-switches to 'team'

# PostgreSQL pool settings (optional, defaults shown)
# PG_POOL_MAX=20
# PG_POOL_IDLE_TIMEOUT=30000
# PG_CONNECTION_TIMEOUT=10000
```

### PostgreSQL Setup Commands

Add to `package.json`:

```json
{
  "scripts": {
    "db:init": "tsx server/db/init.ts",
    "db:init:pg": "tsx server/db/init-postgresql.ts",
    "db:migrate:pg": "tsx server/db/run-migrations-pg.ts"
  }
}
```

### Docker Compose for Development

Add PostgreSQL service to `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: anton
      POSTGRES_USER: anton
      POSTGRES_PASSWORD: anton_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 13. Phase 8: Testing & Validation

### Test Strategy

1. **Schema parity test:** Compare table structures between SQLite and PostgreSQL — same tables, same columns, same constraints
2. **Query parity test:** Run the same query against both backends, compare results
3. **Seed data test:** Verify all seed data (capabilities, radar sources, compliance rules) is identical
4. **FTS comparison:** Run the same search query, verify similar (not identical) BM25 ranking
5. **Transaction test:** Verify rollback works correctly on PostgreSQL
6. **Concurrent write test:** Run multiple simultaneous writes (the reason for PostgreSQL)

### Smoke Test Checklist

- [ ] Server starts with `DATABASE_URL` set to PostgreSQL
- [ ] Login works (auth.ts)
- [ ] Session CRUD works (sessions.ts)
- [ ] Module page loads (claude.ts)
- [ ] AI streaming works (claude.ts SSE)
- [ ] Knowledge atom extraction works (atom-extractor.ts)
- [ ] Hybrid search returns results (hybrid-search.ts)
- [ ] Orchestrator heartbeat runs (orchestrator-engine.ts)
- [ ] Gap assessment wizard works (gap-assessments.ts)
- [ ] Export pipeline works (export.ts)
- [ ] School mode works (school.ts)
- [ ] Community mail works (community.ts)

---

## 14. Critical Gotchas

### 1. Sync → Async Is the Biggest Change

Every route handler that touches the database must become `async`. Express handles this fine, but **every error must be caught** — an unhandled promise rejection in Express crashes the process. Use:

```typescript
router.get('/:id', async (req, res) => {
  try {
    const row = await db.get('SELECT ...', req.params.id);
    res.json(row);
  } catch (err) {
    const { status, message } = safeError(err);
    res.status(status).json({ error: message });
  }
});
```

Most routes already have try/catch. Verify each one.

### 2. Parameter Style Difference

SQLite uses `?` positional. PostgreSQL uses `$1, $2, $3` numbered. The abstraction layer must handle this — **do not manually convert every query**.

### 3. Boolean Handling

SQLite stores booleans as `INTEGER` (0/1). PostgreSQL has native `BOOLEAN`. Queries like `WHERE is_active = 1` need to become `WHERE is_active = true` for PostgreSQL, or `WHERE is_active = 1` works if the column stays INTEGER. **Recommendation:** Keep INTEGER in PostgreSQL schema for compatibility, or handle in the abstraction layer.

### 4. RETURNING Clause

SQLite `run()` returns `lastInsertRowid`. PostgreSQL doesn't — you need `INSERT ... RETURNING id`. The abstraction layer should handle this transparently.

### 5. String vs Integer IDs

ANTON uses `TEXT PRIMARY KEY` for most IDs (UUIDs). This works identically in PostgreSQL. The few tables that use `INTEGER PRIMARY KEY AUTOINCREMENT` need conversion to `SERIAL`.

### 6. JSON Column Handling

ANTON stores JSON as TEXT in SQLite. PostgreSQL's `JSONB` is more efficient and supports indexing. But the application code does `JSON.parse(row.config)` throughout — this works with both TEXT (needs parse) and JSONB (auto-parsed by pg driver). **Recommendation:** Use `JSONB` in PostgreSQL, verify that pg auto-parses.

### 7. Date Handling

SQLite stores dates as TEXT in ISO 8601 format. PostgreSQL uses native `TIMESTAMPTZ`. The pg driver returns JavaScript `Date` objects for timestamp columns, while better-sqlite3 returns strings. **This will break code that does string operations on dates.** Audit all date column access patterns.

### 8. LIKE Is Case-Sensitive in PostgreSQL

SQLite's `LIKE` is case-insensitive by default. PostgreSQL's `LIKE` is case-sensitive. Use `ILIKE` in PostgreSQL for case-insensitive matching. Check all `LIKE` queries.

### 9. SQLite's Loose Typing

SQLite allows inserting a string into an INTEGER column. PostgreSQL does not. Any type mismatches will surface as errors in PostgreSQL.

### 10. Empty String vs NULL

SQLite treats empty strings and NULL differently but loosely. PostgreSQL is strict. Audit `DEFAULT ''` vs `DEFAULT NULL` patterns.

---

## 15. File-by-File Migration Inventory

### Complete Route Files (65+ files)

**Wave 1 — Simple (1-10 calls):**
```
routes/health.ts              (1)   routes/model-router.ts        (2)
routes/suggestions.ts         (2)   routes/settings.ts            (3)
routes/skill-packs.ts         (4)   routes/profile.ts             (4)
routes/reviews.ts             (5)   routes/notifications.ts       (5)
routes/versions.ts            (5)   routes/modules.ts             (3)
routes/knowledge-packs.ts     (6)   routes/org-context.ts         (6)
routes/session-resume.ts      (6)   routes/human-oversight.ts     (6)
routes/knowledge-library.ts   (13)  routes/knowledge-graph.ts     (7)
routes/regulatory-feed.ts     (7)   routes/quality.ts             (7)
routes/export.ts              (5)   routes/post-market-monitoring.ts (11)
routes/search.ts              (4)   routes/data.ts                (3)
routes/templates.ts           (3)   routes/memory.ts              (3)
routes/collections.ts         (7)   routes/lore-ledger.ts         (9)
routes/continuity.ts          (9)   routes/batch.ts               (4)
routes/ai-assist.ts           (3)   routes/radar.ts               (7)
routes/roaring.ts             (6)   routes/dowjones.ts            (8)
routes/compliance-policy.ts   (5)   routes/compliance.ts          (7)
routes/admin.ts               (5)   routes/embeddings.ts          (14)
routes/folders.ts             (4)   routes/files.ts               (2)
```

**Wave 2 — Medium (10-25 calls):**
```
routes/analytics.ts           (10)  routes/finance.ts             (10)
routes/travel.ts              (10)  routes/legal-research.ts      (10)
routes/news.ts                (11)  routes/intelligence-dashboard.ts (11)
routes/presentations.ts       (11)  routes/deadlines.ts           (11)
routes/custom-modules.ts      (12)  routes/coding-scripts.ts      (12)
routes/pe-vc.ts               (12)  routes/project-files.ts       (12)
routes/project-collaboration.ts (17) routes/trades.ts             (18)
routes/projects.ts            (18)  routes/sessions.ts            (19)
routes/bridges.ts             (20)  routes/alignment-reviewer.ts  (23)
routes/gap-assessments.ts     (25)  routes/instruction-builder.ts (26)
routes/auth.ts                (32)  routes/claude.ts              (32)
```

**Wave 3 — High (25-75 calls):**
```
routes/task-agent.ts          (49)  routes/community.ts           (59)
routes/orchestrator.ts        (63)  routes/coding-large.ts        (75)
```

**Wave 4 — Monsters (100+ calls):**
```
routes/engagements.ts         (131) routes/school.ts              (174)
```

### Service Files (35+ files)

```
services/audit-queue.ts           (2)   services/atom-boost.ts          (2)
services/embedding-pipeline.ts    (3)   services/session-resume.ts      (6)
services/hybrid-search.ts         (6)   services/gap-assessment-engine.ts (6)
services/semantic-search.ts       (8)   services/atom-extractor.ts      (8)
services/workflow-executor.ts     (8)   services/event-workflow-processor.ts (8)
services/radar-fetcher.ts         (8)   services/prompt-builder.ts      (9)
services/proactive-intelligence.ts (10) services/discovery-engine.ts    (10)
services/auditLogger.ts           (11)  services/orchestrator-pattern-engine.ts (12)
services/collaborative-canvas.ts  (13)  services/collection-manager.ts  (13)
services/pattern-detection.ts     (14)  services/quality-ratchet.ts     (14)
services/regulatory-radar.ts      (14)  services/connection-manager.ts  (15)
services/dataset-store.ts         (15)  services/knowledge-graph.ts     (15)
services/anton-bundler.ts         (18)  services/knowledge-pack-service.ts (18)
services/webhook-listener.ts      (19)  services/time-intelligence.ts   (20)
services/compliance-rules.ts      (20)  services/orchestrator-engine.ts (47)
```

### Other Files

```
db/init.ts                    (200+)  — Schema + migration logic
db/run_migrations.ts          (10)    — Standalone migration runner
connections/database-adapter.ts (5)   — External DB queries
services/data-importer.ts     (5)    — Bulk import
middleware/auth.ts             (3)    — Token validation
```

---

## 16. SQL Translation Cheat Sheet

### Quick Reference — Copy-Paste Conversions

```sql
-- AUTOINCREMENT
-- SQLite:  id INTEGER PRIMARY KEY AUTOINCREMENT
-- PG:      id SERIAL PRIMARY KEY

-- Datetime defaults
-- SQLite:  created_at DATETIME DEFAULT (datetime('now'))
-- PG:      created_at TIMESTAMPTZ DEFAULT NOW()

-- Current timestamp in queries
-- SQLite:  datetime('now')
-- PG:      NOW()

-- Date formatting
-- SQLite:  strftime('%Y-%m', created_at)
-- PG:      TO_CHAR(created_at, 'YYYY-MM')

-- SQLite:  strftime('%Y-W%W', first_detected)
-- PG:      TO_CHAR(first_detected, 'IYYY-"W"IW')

-- Date difference in days
-- SQLite:  julianday(due_date) - julianday('now')
-- PG:      EXTRACT(EPOCH FROM (due_date - NOW())) / 86400

-- Upsert (ignore duplicates)
-- SQLite:  INSERT OR IGNORE INTO t (id, val) VALUES (?, ?)
-- PG:      INSERT INTO t (id, val) VALUES ($1, $2) ON CONFLICT DO NOTHING

-- Upsert (replace on conflict)
-- SQLite:  INSERT OR REPLACE INTO t (id, val) VALUES (?, ?)
-- PG:      INSERT INTO t (id, val) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET val = EXCLUDED.val

-- Full-text search
-- SQLite:  SELECT * FROM knowledge_atoms_fts WHERE knowledge_atoms_fts MATCH ?
-- PG:      SELECT * FROM knowledge_atoms WHERE search_vector @@ plainto_tsquery('english', $1)

-- BM25 ranking
-- SQLite:  ORDER BY rank  (implicit BM25 from FTS5)
-- PG:      ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC

-- JSON extraction
-- SQLite:  json_extract(col, '$.key')
-- PG:      col->>'key'  (JSONB)

-- Schema inspection
-- SQLite:  PRAGMA table_info('tablename')
-- PG:      SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tablename'

-- Table existence
-- SQLite:  SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='t'
-- PG:      SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='t'

-- Case-insensitive LIKE
-- SQLite:  LIKE (case-insensitive by default)
-- PG:      ILIKE (explicit case-insensitive)

-- Boolean
-- SQLite:  is_active = 1
-- PG:      is_active = true  (or keep INTEGER and use 1)

-- String concatenation
-- SQLite:  entity_type || ':' || entity_id
-- PG:      entity_type || ':' || entity_id  (same!)

-- LIMIT/OFFSET
-- Same in both ✓

-- CHECK constraints
-- Same in both ✓

-- ON CONFLICT ... DO UPDATE SET
-- Same in both ✓ (already used in many ANTON routes)
```

---

## Execution Order Summary

| Phase | What | Estimated Scope | Dependencies |
|-------|------|----------------|--------------|
| **1** | Create PostgreSQL schema file | 1 file (~600 lines) | None |
| **2** | Build database abstraction layer | 3 files (~400 lines) | None |
| **3** | Convert init.ts + migration runner | 2 files (~500 lines) | Phase 1, 2 |
| **4** | Migrate routes (4 waves) | ~65 files | Phase 2, 3 |
| **5** | Migrate services | ~35 files | Phase 2 |
| **6** | FTS5 → PostgreSQL full-text search | 2 files | Phase 1, 5 |
| **7** | Environment & Docker config | 3 files | Phase 1 |
| **8** | Testing & validation | New test files | All phases |

**Phases 1 + 2 can run in parallel.**
**Phases 4 + 5 can run in parallel (routes and services are independent).**
**Phase 6 depends on Phase 5 (hybrid-search.ts is a service).**

---

## Git Workflow

```bash
# Create the branch
git checkout -b postgresql

# NEVER push to main
# All work stays on the postgresql branch
# When ready, create PR: postgresql → main
```

---

*This guide was generated from deep codebase analysis of ANTON v0.6.5 (1,589 .prepare() calls across 100+ files, 144 tables, 45 migrations, 200+ indexes). Every number is from actual grep/count results, not estimates.*
