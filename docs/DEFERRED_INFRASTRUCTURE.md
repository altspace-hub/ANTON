# Deferred Infrastructure Items — Feasibility Analysis

> **Date:** 2026-03-12
> **Status:** Research complete. Items ranked by priority. Ready for contributors.

---

## Quick Reference

| ID | Item | Priority | Effort | Recommendation |
|-----|------|----------|--------|----------------|
| LONE-15 | Electron Auto-Update | 1st | S-M | Do when distributing |
| LONE-14 | Electron Code Signing | 2nd | S + cert procurement | Do when distributing |
| REDIS-02 | Socket.IO Redis Adapter | 3rd | XS | Do if multi-instance needed |
| REDIS-03 | Redis Cache Layer | Bundle | M | Bundle with REDIS-02 |
| REDIS-04 | Distributed Locks | Bundle | M | Bundle with REDIS-02 |
| REDIS-01 | Auth Codes in Redis | Skip | S | DB-backed auth works fine |
| SCALE-01 | SQLite to PostgreSQL | Contributor welcome | XL | See dedicated section below |
| SCALE-03 | Read Replicas | Skip | XL | Depends on SCALE-01, zero benefit at current scale |

---

## LONE-15: Electron Auto-Update

**Current State:** No `electron-updater` dependency. No auto-update code in `electron/main.ts`. No publish configuration in `electron-builder.yml`. Manual builds only.

**What's Needed:**
1. Install `electron-updater` (1 line in package.json)
2. Add `publish` config to `electron-builder.yml` (~5 lines)
3. Add update check in `electron/main.ts` (~10 lines)
4. CI/CD workflow to build + publish releases (~50 lines GitHub Actions)

**Hosting Options:**

| Option | Cost | Complexity |
|--------|------|-----------|
| GitHub Releases | Free (public) / included (private) | Low |
| S3 / generic server | ~$1-5/month | Medium |
| Hazel (Vercel) | Free tier | Low |
| Static file server | Any CDN | Very low |

**Key Fact:** Windows auto-updates work **without code signing**. macOS requires signing + notarization.

**Implementation sketch:**
```typescript
// electron/main.ts
import { autoUpdater } from 'electron-updater';

app.whenReady().then(() => {
  // ... existing code ...
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});
```

```yaml
# electron-builder.yml addition
publish:
  provider: github
  owner: altspace-hub
  repo: ANTON
```

---

## LONE-14: Electron Code Signing

**Current State:** Electron v33 + electron-builder v25 fully configured. NSIS installer (Windows), DMG (macOS), AppImage (Linux). **No code signing configured** — no certificates, no env vars, no CI/CD.

**Why It Matters:** Windows SmartScreen blocks unsigned apps. macOS Gatekeeper blocks unsigned apps.

**Cost Options:**

| Option | Cost | Notes |
|--------|------|-------|
| Azure Trusted Signing | $9.99/month (~$120/year) | Modern, HSM-backed, works with electron-builder |
| Traditional EV certificate (Sectigo, DigiCert) | ~$280-400/year | Industry standard |
| macOS Developer certificate | $99/year | Required for macOS notarization |

**What's Needed:**

Windows:
```yaml
# electron-builder.yml
win:
  certificateSha1: "<THUMBPRINT>"
  signingHashAlgorithms: ["sha256"]
```
```bash
# Environment variables
WIN_CSC_LINK=<path-to-cert.pfx>
WIN_CSC_KEY_PASSWORD=<cert-password>
```

macOS:
```yaml
mac:
  identity: ${APPLE_ID_IDENTITY}
  notarize:
    teamId: ${APPLE_TEAM_ID}
```
```bash
CSC_LINK=<path-to-cert.p12>
CSC_KEY_PASSWORD=<cert-password>
```

**Effort:** Config changes only (~20 lines YAML + env vars), but purchasing/provisioning certificates takes days.

---

## REDIS-02: Socket.IO Redis Adapter

**Current State:** Two Socket.IO namespaces (`/study-rooms`, `/community`) with in-memory room state. No adapter configured. Works correctly in single-instance mode.

**Multi-Instance Problem:** If running 2+ Express instances behind a load balancer, Socket.IO broadcasts only reach users on the same instance.

**Implementation:** ~10 lines of code:
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
io.adapter(createAdapter(redisClient, redisClient));
```

**Verdict:** No value for solo mode. Essential for multi-instance team mode. Trivial to add when needed.

---

## REDIS-03: Redis Cache Layer

**Current In-Memory Caches Found (6):**

| Cache | Location | Issue |
|-------|----------|-------|
| Embedding vectors | `server/services/embeddings.ts` | Unbounded `Map`, code comments "for dev — use Redis in production" |
| Auth codes | `server/routes/auth.ts` | 60-second TTL, lost on restart |
| OIDC state | `server/routes/auth.ts` | 10-minute TTL, manual pruning |
| CSRF tokens | `server/middleware/csrf.ts` | 24-hour TTL, lost on restart |
| Dataset cache | `server/routes/data.ts` | Unbounded `Map`, no TTL |
| SSE stream limiter | `server/services/stream-limiter.ts` | Per-instance counter, broken in multi-instance |

**Verdict:** These caches are small and appropriate for single-instance. Bundle with REDIS-02 if multi-instance is ever needed.

---

## REDIS-04: Distributed Locks

**Current State:** No mutex/lock patterns exist. Background jobs run on every instance:
- Dataset cleanup (hourly)
- Embedding pipeline (every 10s)
- Orchestrator heartbeat (configurable)
- Pattern detection (hourly)
- Scheduler (cron jobs)
- Deadline reminders (every 15 min)

**Multi-Instance Problem:** All jobs run on every instance → duplicated work. Not data corruption, but wasted compute.

**Implementation:** ~100 lines using Redlock or pub/sub leader election.

**Verdict:** Only relevant for multi-instance. Bundle with REDIS-02.

---

## REDIS-01: Auth Codes in Redis

**Current State:** Sessions in SQLite `user_sessions` table with expiration. Password reset tokens in `password_reset_tokens` with `expires_at` TTL. All DB-backed, multi-instance safe.

**Verdict:** Skip. DB-backed auth is correct for a local-first app. Redis adds operational overhead for near-zero performance gain (~1ms SQLite lookups).

---

## SCALE-01: SQLite to PostgreSQL Migration

> **This is a good contribution opportunity for external developers.**

### Current State Assessment

SQLite (better-sqlite3) is **deeply embedded**:

| Metric | Value |
|--------|-------|
| Files using better-sqlite3 | 162 |
| `db.prepare()` call sites | 2,140+ |
| Tables | 127 unique |
| Indexes | 234 |
| Migrations | 35 files (001-045) |
| init.ts lines | 3,076 |
| Transactions | ~30 locations |
| FTS5 virtual tables | 1 (knowledge_atoms_fts with BM25) |

### Why It's Hard

1. **All database operations are synchronous.** better-sqlite3's `.get()`, `.all()`, `.run()` never use `await`. PostgreSQL drivers (pg, knex, prisma) are all async. Every call site needs `await`.

2. **No abstraction layer.** Routes directly receive the `db` instance — no ORM, no query builder, no repository pattern.

3. **3,076 lines of initialization code** in `init.ts` using PRAGMA introspection for safe migrations.

4. **FTS5 virtual table** with triggers for auto-sync — needs rewrite to PostgreSQL `tsvector` + GIN indexes.

### SQLite-Specific Features In Use

| Feature | Count | PostgreSQL Equivalent |
|---------|-------|-----------------------|
| `datetime('now')` defaults | 98+ | `CURRENT_TIMESTAMP` |
| `PRAGMA table_info()` | 20+ | `information_schema.columns` |
| WAL mode + busy_timeout | 3 pragmas | Not needed (MVCC) |
| FTS5 virtual table | 1 | `tsvector` + `ts_rank()` + GIN |
| `INSERT OR IGNORE` | 8 | `ON CONFLICT DO NOTHING` |
| `AUTOINCREMENT` | 41 | `SERIAL` / `GENERATED ALWAYS` |
| `json_extract()` | 1 | `->>`  operator |
| Triggers (FTS sync) | 8 | Rewrite for tsvector |
| TEXT for dates | All tables | `TIMESTAMPTZ` |

**Not Used** (makes migration easier): No window functions, no recursive CTEs, no complex JSON, no ATTACH DATABASE, no custom collations.

### Migration Approach (for contributors)

**Phase 1: Schema Translation (2 weeks)**
- Create PostgreSQL schema from SQLite DDL
- Set up docker-compose with `postgres:16`
- Write data migration scripts (SQLite → PostgreSQL bulk dump)
- Plan FTS5 replacement strategy

**Phase 2: Driver Swap (4-6 weeks)**
- Install `pg` (node-postgres) with connection pooling
- Replace all `db.prepare().get/all/run()` with async equivalents
- Update `init.ts` → PostgreSQL initialization
- Remove PRAGMA calls, replace `datetime('now')` → `CURRENT_TIMESTAMP`
- Rewrite PRAGMA table_info() → information_schema queries
- Migrate FTS5 → PostgreSQL full-text search + triggers
- Optional: Install `pgvector` extension for embeddings

**Phase 3: Testing (3-4 weeks)**
- Integration tests for all 162 files
- Load testing under concurrent access
- Data validation (row counts, checksums)
- Performance benchmarking vs SQLite

**Key Decision Points:**
- **Embeddings:** Keep as JSON text or use pgvector? (pgvector recommended for scale)
- **FTS:** PostgreSQL native FTS (simpler) vs trigram index (faster phrase matching)?
- **Pooling:** pgBouncer (external) vs node-postgres pool (embedded)?
- **Dual support:** Keep SQLite for solo mode + PostgreSQL for team mode? Or full replacement?

### Why It Might Not Be Worth It

ANTON is a **local-first, single-machine application**. SQLite is:
- Faster for single-user workloads (no network hop)
- Zero operational overhead (no server process)
- Properly configured with WAL + busy_timeout for team mode
- Battle-tested with 3,076 lines of initialization

PostgreSQL makes sense only if:
- Team mode needs 10+ concurrent users with heavy writes
- You want to deploy ANTON as a hosted SaaS
- You need native vector operations at scale (pgvector)

### Estimated Effort

| Team Size | Duration |
|-----------|----------|
| 1 developer | 3-4 months |
| 2-3 developers | 6-8 weeks |
| 4+ developers | 4-6 weeks |

---

## SCALE-03: Read Replicas

**Depends on:** SCALE-01 (PostgreSQL migration).

**Assessment:** Read replicas are a PostgreSQL/MySQL concept for distributing read load. ANTON's query volume (professional workspace, not SaaS) doesn't warrant this. Even with PostgreSQL, a single instance handles the expected load.

**Verdict:** Skip entirely. Only relevant if serving 1000+ concurrent team users on PostgreSQL.

---

## Redis Integration Summary

If you ever need Redis (for multi-instance team mode), here's the full picture:

```
Solo mode (single user, single instance):
  Redis: NOT NEEDED ❌
  SQLite + in-memory caches = correct architecture

Team mode (single instance):
  Redis: OPTIONAL
  Marginal benefit for embedding cache persistence

Team mode (multiple instances behind load balancer):
  Redis: ESSENTIAL ✅
  Fixes: rate limiting, Socket.IO, background job dedup
  Effort: ~200 lines of code + Redis server
```

### Files That Would Need Changes

| File | Change | Effort |
|------|--------|--------|
| `server/middleware/rate-limit.ts` | RedisStore from `rate-limit-redis` | ~30 lines |
| `server/index.ts` | Socket.IO Redis adapter | ~10 lines |
| `server/services/embeddings.ts` | Redis cache instead of Map | ~50 lines |
| `server/services/stream-limiter.ts` | Redis counter | ~20 lines |
| `server/services/scheduler.ts` | Leader election | ~40 lines |
| `server/services/orchestrator-heartbeat.ts` | Leader election | ~20 lines |
| `server/middleware/csrf.ts` | Redis token store | ~20 lines |
| `server/routes/auth.ts` | Redis for auth codes + OIDC state | ~30 lines |

---

## Contributing

If you're interested in tackling any of these items:

1. **SCALE-01 (PostgreSQL)** — The biggest opportunity. Start with Phase 1 (schema translation) as a proof of concept. Consider keeping SQLite as the default for solo mode and adding PostgreSQL as an option for team deployments.

2. **LONE-14/15 (Electron signing + updates)** — Requires certificate procurement. Good first contribution if you have experience with electron-builder CI/CD.

3. **REDIS-02/03/04 (Redis bundle)** — Only tackle if you're deploying multi-instance. All three should be done together.

Open an issue or PR to discuss before starting work on any of these.
