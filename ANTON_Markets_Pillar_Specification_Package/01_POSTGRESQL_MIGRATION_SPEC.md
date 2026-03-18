# ANTON PostgreSQL Migration — Specification & Markets Advantage

**Document type:** Implementation specification for Claude Code
**Created:** March 16, 2026
**Author:** Daniel Bardun (via Claude strategic session)
**Status:** Active specification — should be executed BEFORE the Markets pillar branch
**Current state:** SQLite with WAL mode, 82 tables, 120+ indexes, ~53 services

---

## 1. Why Now, Not Later

The PostgreSQL migration was roadmapped for Q3 2026. The Markets pillar makes it urgent. Here's the honest assessment:

**SQLite is fine for the existing pillars.** Work, School, Life, Pathfinder are human-paced — a few dozen writes per hour, sequential workflows, single-user or small-team access patterns. SQLite with WAL mode handles this well.

**Markets is machine-paced.** During active hours, the Markets pillar generates concurrent write pressure that SQLite cannot handle efficiently: multiple data feeds fetching simultaneously, atom extraction processing a queue, pattern detection scanning thousands of atoms, NAV calculations for multiple indexes, correlation refreshes, atom decay, prediction validations spawning investigations that trigger more fetches and computations. That's potentially hundreds of writes per minute, all serialised through SQLite's single writer lock.

**Building Markets on SQLite means building it twice.** If you develop on SQLite and then migrate, you're migrating 114 tables instead of 82, and you're migrating tables that were never properly tested under the concurrent load they're designed for. Schema issues that only appear under concurrent load would be discovered after migration instead of during development.

**Recommendation:** Migrate the existing 82 tables to PostgreSQL first. Then create `feature/markets-pillar` against the PostgreSQL-backed codebase. Build Markets with proper concurrency from day one.

---

## 2. Migration Process

### 2.1 Infrastructure Setup

**PostgreSQL version:** 16+ (for latest JSONB performance improvements and logical replication)

**Connection management:** Use `pg` (node-postgres) with connection pooling via `pg-pool`. Configure pool size based on expected concurrency:
- Existing pillars: 5–10 connections sufficient
- With Markets pillar: 15–25 connections recommended
- Each workflow step, computation template, and data fetch can use its own connection

```env
# .env additions
DB_TYPE=postgresql
DATABASE_URL=postgresql://anton:password@localhost:5432/anton
DB_POOL_MIN=5
DB_POOL_MAX=25
DB_POOL_IDLE_TIMEOUT=30000
```

### 2.2 Schema Conversion

The existing SQLite schema is deliberately portable. Most conversions are mechanical:

| SQLite | PostgreSQL | Notes |
|---|---|---|
| `TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))` | `TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text` | Or use native `UUID` type |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | Auto-increment |
| `TEXT DEFAULT (datetime('now'))` | `TIMESTAMPTZ DEFAULT NOW()` | Proper timezone-aware timestamps |
| `REAL` | `DOUBLE PRECISION` | Or `NUMERIC` for financial precision |
| `INTEGER` (boolean) | `BOOLEAN` | Native boolean type |
| `TEXT` (JSON stored as string) | `JSONB` | Queryable JSON — major upgrade |
| `TEXT CHECK(x IN ('a','b','c'))` | `TEXT CHECK(x IN ('a','b','c'))` or `CREATE TYPE ... AS ENUM` | Enum types available |

### 2.3 Migration Steps

**Step 1: Create database abstraction layer.**

Before migrating data, create a database adapter that lets the codebase work with both SQLite and PostgreSQL. This is the safety net — if something goes wrong, you can switch back.

```typescript
// server/db/adapter.ts
interface DatabaseAdapter {
  query(sql: string, params?: any[]): Promise<any>;
  transaction(fn: (client: any) => Promise<any>): Promise<any>;
  getType(): 'sqlite' | 'postgresql';
}
```

Investigate whether the existing codebase already has any abstraction (the `DB_TYPE` env var suggests something was planned). If raw SQLite calls are scattered through services, the first task is centralising them.

**Step 2: Generate PostgreSQL schema.**

Export the existing schema and convert:

```bash
# Export SQLite schema
sqlite3 data/workbench.sqlite .schema > schema_sqlite.sql

# Convert to PostgreSQL (automated script)
node scripts/convert-schema.js schema_sqlite.sql > schema_postgres.sql
```

The conversion script handles the type mappings above. Manual review needed for:
- JSON columns that should become `JSONB` (most of them)
- Timestamp columns that should become `TIMESTAMPTZ`
- Financial precision columns (costs, prices) that should become `NUMERIC(12,4)` or `NUMERIC(18,8)` for crypto
- Columns that benefit from PostgreSQL-specific types (arrays, enums)

**Step 3: Migrate data.**

```bash
# Export data from SQLite as JSON (per table)
node scripts/export-sqlite-json.js data/workbench.sqlite > data_export/

# Import into PostgreSQL
node scripts/import-postgres-json.js data_export/ --target=postgresql://...
```

**Step 4: Switch the adapter.**

Set `DB_TYPE=postgresql` in `.env`. The adapter routes all queries to PostgreSQL. Run the full test suite. Verify all 36 pages load correctly. Verify all 41 API routes respond correctly.

**Step 5: PostgreSQL-specific optimisations.**

Once running on PostgreSQL, apply optimisations that weren't possible on SQLite (see Section 3).

---

## 3. What PostgreSQL Unlocks — Beyond Concurrency

This is the section that matters. Concurrency is the obvious win, but PostgreSQL opens capabilities that fundamentally improve what ANTON can do — especially for Markets.

### 3.1 JSONB — Queryable Structured Data

**SQLite reality:** JSON data stored as `TEXT`. To query inside JSON, you either parse it in application code or use SQLite's limited `json_extract()`. Every tag search, every atom filter by asset class, every thesis evidence chain traversal requires pulling the full JSON into memory and parsing it.

**PostgreSQL reality:** `JSONB` is a native binary format with operators and indexes. You can query, filter, and index inside JSON documents directly in SQL.

**Markets impact — enormous:**

```sql
-- SQLite: Find all atoms tagged with 'AAPL' 
-- Requires: pull all atoms, parse tags JSON in app code, filter
-- Or: maintain a separate tags table (which we do, but with overhead)

-- PostgreSQL with JSONB: Query directly inside the JSON
SELECT * FROM market_atoms 
WHERE tags @> '["AAPL"]'::jsonb;

-- Find all theses where the macro consul contributed more than 40%
SELECT * FROM market_theses
WHERE (consul_contributions->>'macro')::float > 0.4;

-- Find all predictions where a specific assumption was listed
SELECT * FROM market_predictions
WHERE key_assumptions @> '[{"type": "rate_hold"}]'::jsonb;

-- GIN index makes these queries fast even with millions of rows
CREATE INDEX idx_market_atoms_tags_gin ON market_atoms USING GIN (tags);
```

This means several Markets tables can be simplified. Instead of separate `market_atom_tags` junction table for every tag, tags can be a `JSONB` array directly on the atom with a GIN index. The junction table is still useful for complex tag-category queries, but for simple "find atoms with tag X" lookups, JSONB is faster and simpler.

### 3.2 Native Array Types

**SQLite:** Arrays stored as JSON strings. `"['equity', 'fixed_income']"` — requires parsing.

**PostgreSQL:** Native `TEXT[]` array type with operators.

```sql
-- Market data source covers multiple asset classes
ALTER TABLE market_data_sources 
  ALTER COLUMN asset_classes TYPE TEXT[] USING asset_classes::text[];

-- Find all sources that cover equities
SELECT * FROM market_data_sources 
WHERE 'equity' = ANY(asset_classes);

-- Find sources covering both equities and forex
SELECT * FROM market_data_sources 
WHERE asset_classes @> ARRAY['equity', 'forex'];
```

### 3.3 Materialised Views — Pre-Computed Dashboards

**SQLite:** Every dashboard load recomputes aggregations from scratch. The leaderboard page queries all indexes, all NAV history, all predictions, computes returns, sorts, ranks — every time someone opens the page.

**PostgreSQL:** Materialised views store the result of a complex query as a table. Refresh on schedule.

```sql
-- Leaderboard materialised view — refreshed every 30 minutes
CREATE MATERIALIZED VIEW market_leaderboard_live AS
SELECT 
  i.id,
  i.name,
  i.short_name,
  i.index_type,
  i.investment_philosophy,
  i.inception_date,
  -- Current performance
  latest_nav.nav_value AS current_nav,
  latest_nav.cumulative_return_pct AS total_return,
  latest_nav.benchmark_cumulative_return_pct AS benchmark_return,
  latest_nav.cumulative_return_pct - latest_nav.benchmark_cumulative_return_pct AS excess_return,
  latest_nav.sharpe_ratio_30d,
  latest_nav.max_drawdown,
  -- Streak calculation
  streak.consecutive_months,
  -- Holdings count
  (SELECT COUNT(*) FROM market_index_holdings h WHERE h.index_id = i.id AND h.is_active = 1) AS holdings_count
FROM market_indexes i
LEFT JOIN LATERAL (
  SELECT * FROM market_index_nav_history 
  WHERE index_id = i.id 
  ORDER BY nav_date DESC LIMIT 1
) latest_nav ON true
LEFT JOIN LATERAL (
  -- Complex streak calculation done once, cached
  ...
) streak ON true
WHERE i.status = 'active' AND i.is_public = 1
ORDER BY excess_return DESC;

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY market_leaderboard_live;
```

The Markets dashboard, index leaderboard, and learning performance pages all benefit massively from materialised views. Instead of running 15-second aggregation queries on every page load, they read from a pre-computed table that refreshes every 30 minutes.

### 3.4 NOTIFY/LISTEN — Real-Time Event Triggers

**SQLite:** All event detection is poll-based. The system checks "are there new high-priority atoms?" on a schedule.

**PostgreSQL:** Native pub/sub within the database.

```sql
-- Trigger fires when a critical-severity atom is created
CREATE OR REPLACE FUNCTION notify_critical_atom() RETURNS trigger AS $$
BEGIN
  IF NEW.atom_type = 'warning' OR NEW.confidence > 0.9 THEN
    PERFORM pg_notify('market_critical_atom', json_build_object(
      'atom_id', NEW.id,
      'atom_type', NEW.atom_type,
      'content', LEFT(NEW.content, 200),
      'confidence', NEW.confidence
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER market_atom_critical_trigger
  AFTER INSERT ON market_atoms
  FOR EACH ROW EXECUTE FUNCTION notify_critical_atom();
```

```typescript
// Node.js listener — reacts instantly to critical atoms
const client = new pg.Client(connectionString);
await client.connect();
await client.query('LISTEN market_critical_atom');

client.on('notification', (msg) => {
  const atom = JSON.parse(msg.payload);
  // Instantly trigger event-driven intelligence cycle
  marketIntelligenceService.handleCriticalAtom(atom);
});
```

This transforms the event-driven triggers specified in the Architecture Addendum from "check every 15 minutes" to "react within seconds." When a flash crash atom is created, the system knows immediately — not at the next scheduled poll.

### 3.5 Window Functions — Time Series Analysis in SQL

**SQLite:** Has basic window functions since 3.25.0, but limited and slow on large datasets.

**PostgreSQL:** Full window function support with excellent performance on time series — critical for Markets.

```sql
-- Rolling 30-day return and Sharpe for all indexes in a single query
SELECT 
  index_id,
  nav_date,
  nav_value,
  -- Rolling 30-day return
  (nav_value / LAG(nav_value, 30) OVER w - 1) * 100 AS rolling_30d_return,
  -- Rolling 30-day volatility (standard deviation of daily returns)
  STDDEV(daily_return_pct) OVER (PARTITION BY index_id ORDER BY nav_date ROWS 29 PRECEDING) 
    * SQRT(252) AS rolling_annualised_vol,
  -- Exponential moving average (approximation)
  AVG(daily_return_pct) OVER (PARTITION BY index_id ORDER BY nav_date ROWS 19 PRECEDING) 
    AS ema_20d_return
FROM market_index_nav_history
WINDOW w AS (PARTITION BY index_id ORDER BY nav_date);
```

This means some of the computation templates from the Computation Insert can be done directly in SQL for simple cases — reducing the need to spin up Python processes for basic rolling calculations.

### 3.6 Partial Indexes — Query Performance for Active Data

**SQLite:** Indexes cover all rows. A query for "active theses" scans an index that includes archived ones too.

**PostgreSQL:** Partial indexes only cover rows matching a condition.

```sql
-- Only index active theses — much smaller, much faster
CREATE INDEX idx_active_theses ON market_theses(target_end, net_confidence DESC)
WHERE status = 'active';

-- Only index active atoms (not superseded/expired)
CREATE INDEX idx_active_market_atoms ON market_atoms(atom_type, confidence DESC)
WHERE is_active = 1 AND temporal_type != 'superseded';

-- Only index pending investigations
CREATE INDEX idx_pending_investigations ON market_investigation_tasks(priority, created_at)
WHERE status IN ('queued', 'in_progress');

-- Only index active index holdings
CREATE INDEX idx_active_holdings ON market_index_holdings(index_id, weight DESC)
WHERE is_active = 1;
```

With Markets generating potentially millions of atoms over time (most of which are expired or superseded), partial indexes keep query performance sharp by only indexing the data that's actually queried frequently.

### 3.7 NUMERIC Type — Financial Precision

**SQLite:** `REAL` is a 64-bit IEEE float. Fine for most things, but floating-point arithmetic introduces rounding errors that compound over thousands of NAV calculations.

**PostgreSQL:** `NUMERIC(precision, scale)` is exact decimal arithmetic — no floating-point drift.

```sql
-- Financial columns that need exact precision
ALTER TABLE market_index_holdings ALTER COLUMN weight TYPE NUMERIC(8, 6);        -- 6 decimal places for weights
ALTER TABLE market_index_holdings ALTER COLUMN entry_price TYPE NUMERIC(18, 8);  -- 8 decimals for crypto prices
ALTER TABLE market_index_nav_history ALTER COLUMN nav_value TYPE NUMERIC(18, 6);
ALTER TABLE market_predictions ALTER COLUMN confidence TYPE NUMERIC(5, 4);       -- 0.0000 to 1.0000
```

Over a year of daily NAV calculations across 20 indexes, floating-point drift can introduce visible errors. NUMERIC eliminates this entirely.

### 3.8 Table Partitioning — Scale for Time Series

**SQLite:** All rows in one table forever. As `market_data_raw` and `market_index_nav_history` grow to millions of rows, queries slow down.

**PostgreSQL:** Native table partitioning by date range.

```sql
-- Partition NAV history by month
CREATE TABLE market_index_nav_history (
  id TEXT NOT NULL,
  index_id TEXT NOT NULL,
  nav_date DATE NOT NULL,
  nav_value NUMERIC(18,6) NOT NULL,
  -- ... other columns
) PARTITION BY RANGE (nav_date);

-- Create partitions
CREATE TABLE nav_history_2026_03 PARTITION OF market_index_nav_history
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE nav_history_2026_04 PARTITION OF market_index_nav_history
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- ... auto-create future partitions via pg_partman

-- Partition raw data similarly
CREATE TABLE market_data_raw (
  id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  -- ... other columns
) PARTITION BY RANGE (fetched_at);
```

Queries that filter by date automatically scan only the relevant partition. Old partitions can be archived or dropped without affecting current data. This is critical for Markets because time-series data grows indefinitely.

### 3.9 Full-Text Search — Native `tsvector`

**SQLite:** Full-text search via FTS5 extension — works but is a separate virtual table.

**PostgreSQL:** Native `tsvector` with GIN indexes and ranking.

```sql
-- Add full-text search to market atoms
ALTER TABLE market_atoms ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX idx_market_atoms_fts ON market_atoms USING GIN (search_vector);

-- Search atoms with ranking
SELECT id, content, confidence, 
       ts_rank(search_vector, query) AS rank
FROM market_atoms, plainto_tsquery('english', 'ECB rate decision dovish') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

Combined with the existing semantic search (Chroma/BM25), this gives Markets three search paths: semantic (meaning-based), keyword (tsvector), and structured (JSONB queries on tags/entities). The intelligence engine can use whichever is most appropriate for the query.

### 3.10 Advisory Locks — Coordination Without Blocking

**SQLite:** No mechanism for coordinating concurrent processes without locking the whole database.

**PostgreSQL:** Advisory locks let processes coordinate without blocking data access.

```sql
-- Ensure only one rebalance runs per index at a time
SELECT pg_try_advisory_lock(hashtext('rebalance_' || index_id));
-- ... run rebalance ...
SELECT pg_advisory_unlock(hashtext('rebalance_' || index_id));
```

This prevents race conditions in the Markets pillar: two scheduled jobs can't accidentally rebalance the same index simultaneously, two validation jobs can't process the same prediction at once, and two investigation tasks can't update the same atom's confidence concurrently.

---

## 4. What Changes in the Codebase

### 4.1 Database Adapter

Create `server/db/adapter.ts` that provides a unified interface. All services call through the adapter, not raw database drivers. The adapter routes to SQLite or PostgreSQL based on `DB_TYPE`.

### 4.2 Service Updates

Every service that currently calls SQLite directly needs to go through the adapter. Investigate all files in `server/services/` for direct database calls. The changes are mechanical but extensive — this is the bulk of the migration work.

### 4.3 Query Syntax Differences

Most queries work identically. Watch for:
- String concatenation: SQLite uses `||`, PostgreSQL uses `||` too (same)
- Date functions: SQLite uses `datetime('now')`, PostgreSQL uses `NOW()`
- Boolean: SQLite uses `0/1`, PostgreSQL uses `TRUE/FALSE`
- UPSERT: SQLite uses `INSERT OR REPLACE`, PostgreSQL uses `INSERT ... ON CONFLICT DO UPDATE`
- JSON access: SQLite uses `json_extract(col, '$.key')`, PostgreSQL uses `col->>'key'`

### 4.4 New Capabilities to Implement Post-Migration

After migration is stable, implement:
1. JSONB columns for all JSON-stored data (see Section 3.1)
2. Materialised views for dashboard aggregations (see Section 3.3)
3. NOTIFY/LISTEN for event-driven triggers (see Section 3.4)
4. Partial indexes for active-data queries (see Section 3.6)
5. NUMERIC types for financial precision columns (see Section 3.7)
6. Table partitioning for time-series tables (see Section 3.8)
7. Full-text search vectors for atom content (see Section 3.9)

These can be implemented incrementally after the base migration is verified.

---

## 5. Impact on Markets Specification

With PostgreSQL as the target, several Markets spec decisions should be updated:

| Original Spec Decision | PostgreSQL Improvement |
|---|---|
| `market_atom_tags` junction table for all tag queries | Keep junction table for tag-category queries, but add JSONB `tags` column on `market_atoms` with GIN index for simple tag containment checks |
| JSON strings for `consul_contributions`, `key_assumptions`, `evidence` | Use `JSONB` type with queryable operators |
| Scheduled polling for event detection | Supplement with NOTIFY/LISTEN triggers for critical atoms, regime shifts, flash crash detection |
| Application-level computation for all rolling metrics | Use window functions for simple rolling calculations (returns, volatility); reserve Python templates for complex computations (Sharpe, Monte Carlo, regression) |
| All atoms in one table forever | Partition `market_data_raw` and `market_index_nav_history` by month |
| `REAL` for prices and confidence | `NUMERIC(18,8)` for prices, `NUMERIC(5,4)` for confidence, `NUMERIC(8,6)` for weights |
| Leaderboard computed on every page load | Materialised view refreshed every 30 minutes |

---

## 6. Migration Timeline Recommendation

| Week | Focus |
|---|---|
| **Week 1** | Create database adapter layer. Centralise all direct SQLite calls through adapter. Write conversion script. Set up PostgreSQL instance. |
| **Week 2** | Generate PostgreSQL schema. Migrate data. Switch adapter to PostgreSQL. Run full test suite. Fix query syntax issues. |
| **Week 3** | Apply PostgreSQL-specific optimisations: JSONB columns, partial indexes, NUMERIC types. Verify all 36 pages and 41 API routes. |
| **Week 4** | Implement materialised views for dashboard pages. Add NOTIFY/LISTEN for existing radar. Performance testing under concurrent load. |
| **Week 5+** | Create `feature/markets-pillar` branch against PostgreSQL codebase. Build Markets from day one with all PostgreSQL advantages. |

---

## 7. Deployment Considerations

### Local Development

PostgreSQL can run locally via Docker (simplest) or native install:

```bash
# Docker (recommended for development)
docker run --name anton-postgres \
  -e POSTGRES_USER=anton \
  -e POSTGRES_PASSWORD=anton_dev \
  -e POSTGRES_DB=anton \
  -p 5432:5432 \
  -v anton_pgdata:/var/lib/postgresql/data \
  -d postgres:16
```

### Air-Gapped / Sovereign Deployment

PostgreSQL works in air-gapped environments just as well as SQLite — it just needs to be installed on the local machine or network. This doesn't compromise the local-first deployment model. Many air-gapped government and military systems run PostgreSQL.

### SQLite as Fallback

Keep the SQLite adapter functional even after migration. This provides:
- A fallback if PostgreSQL isn't available (demo mode, quick evaluation)
- Support for ultra-lightweight deployments (Raspberry Pi, NGO field deployments via Ollama)
- A safety net during migration — can switch back if issues arise

The adapter pattern makes this cost-free: the codebase supports both, and `DB_TYPE` in `.env` controls which is active.

---

*End of specification. Execute PostgreSQL migration before creating the Markets pillar branch.*
