# G.11 — Database Access Pattern Audit (real)

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.11
**Scanned:** 529 TS files (server/services/, server/routes/)
**Findings:** 279

> Catches schema-fragility (SELECT \*), unbounded result sets (missing LIMIT on user-facing queries),
> N+1 query patterns, direct DB-driver imports that bypass the adapter, and SQL-injection-risk
> template literals with user-controlled interpolation.

## Severity rollup

| Severity | Count |
|---|---|
| HIGH | 146 |
| MEDIUM | 131 |
| LOW | 2 |

## By pattern

| Pattern | Count |
|---|---|
| N+1 query candidate | 181 |
| Missing LIMIT on user-facing query | 96 |
| Direct pg / sqlite import bypass | 2 |

## HIGH — route / critical-path findings

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/routes/agents.ts` | 109 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/alignment-reviewer.ts` | 22 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/alignment-reviewer.ts` | 60 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/alignment-reviewer.ts` | 64 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/alignment-reviewer.ts` | 260 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/alignment-reviewer.ts` | 171 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/alignment-reviewer.ts` | 275 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/app-gateway.ts` | 916 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/auth.ts` | 671 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/azure-openai.ts` | 186 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/batch.ts` | 66 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/bridges.ts` | 281 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/civic-extended.ts` | 60 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/community.ts` | 192 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/community.ts` | 556 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/community.ts` | 771 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/community.ts` | 959 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/compliance-policy.ts` | 35 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/custom-modules.ts` | 64 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/custom-modules.ts` | 204 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/custom-modules.ts` | 299 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/deadlines.ts` | 73 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/deadlines.ts` | 227 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/documents.ts` | 264 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/embeddings.ts` | 52 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/finance.ts` | 65 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/finance.ts` | 98 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/finance.ts` | 152 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/finance.ts` | 58 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/folders.ts` | 112 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/friends.ts` | 65 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/friends.ts` | 242 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/friends.ts` | 273 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/gap-assessments.ts` | 239 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/gap-assessments.ts` | 539 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/gap-assessments.ts` | 597 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/gap-assessments.ts` | 342 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/gap-assessments.ts` | 372 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/instruction-builder.ts` | 12 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/instruction-builder.ts` | 227 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/instruction-builder.ts` | 359 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/jobs.ts` | 108 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/jobs.ts` | 134 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/jobs.ts` | 189 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/knowledge-graph.ts` | 243 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/knowledge-library.ts` | 13 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/knowledge.ts` | 71 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/legal-research.ts` | 234 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/lore-ledger.ts` | 73 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/lore-ledger.ts` | 200 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/lore-ledger.ts` | 280 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/lore-ledger.ts` | 318 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/market-indexes.ts` | 255 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/marketplace-visitor.ts` | 32 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/markets.ts` | 66 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/markets.ts` | 89 | Missing LIMIT on user-facing query | `db.all(SELECT …)` without LIMIT — unbounded result set on a route |
| `server/routes/markets.ts` | 72 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/markets.ts` | 74 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/markets.ts` | 227 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/routes/markets.ts` | 409 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |

*… + 86 more (truncated)*

## MEDIUM — service-layer findings

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/services/anton-validator.ts` | 442 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/anton-validator.ts` | 458 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/atom-extractor.ts` | 178 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/atom-extractor.ts` | 206 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/atom-extractor.ts` | 230 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/atom-extractor.ts` | 355 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/atom-extractor.ts` | 433 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/atom-extractor.ts` | 455 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/audit-queue.ts` | 43 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/civic-eligibility.ts` | 130 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/civic-service.ts` | 305 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/coding-review-engine.ts` | 135 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/compliance-rules.ts` | 125 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/dataset-store.ts` | 69 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/dataset-store.ts` | 225 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/deadline-reminders.ts` | 37 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/delegation-compliance-service.ts` | 87 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/embedding-pipeline.ts` | 27 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/embedding-pipeline.ts` | 28 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/event-workflow-processor.ts` | 67 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/event-workflow-processor.ts` | 128 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/gap-assessment-engine.ts` | 702 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/iterative-reasoning.ts` | 375 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-graph.ts` | 32 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-graph.ts` | 62 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-pack-service.ts` | 355 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-pack-service.ts` | 403 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-pack-service.ts` | 422 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-pack-service.ts` | 425 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-pack-service.ts` | 583 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-sharing-service.ts` | 86 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-sharing-service.ts` | 274 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/knowledge-sharing-service.ts` | 315 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/lifecycle-feed-ingestor.ts` | 324 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/maintain-service.ts` | 533 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-atom-service.ts` | 133 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-atom-service.ts` | 221 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-atom-service.ts` | 501 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-backtest-runner.ts` | 99 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-backtest-runner.ts` | 183 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-backtest-runner.ts` | 188 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-backtest-runner.ts` | 208 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-backtest-runner.ts` | 228 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-backtest-runner.ts` | 289 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 45 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 55 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 64 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 99 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 110 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 122 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 131 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 153 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 184 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 216 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 249 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 259 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 268 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 290 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 316 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |
| `server/services/market-bundle-importer.ts` | 336 | N+1 query candidate | loop body contains `await db.<method>(…)` — sequential per-iteration query (use `WHERE id = ANY($1)` or `IN (?,?,?)` instead) |

*… + 71 more (truncated)*

## LOW — non-critical

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/routes/workflows.ts` | 14 | Direct pg / sqlite import bypass | imports from `'pg'` instead of using DatabaseAdapter |
| `server/services/workflow-executor.ts` | 16 | Direct pg / sqlite import bypass | imports from `'pg'` instead of using DatabaseAdapter |

## Top files by finding count

| File | Findings |
|---|---|
| `server/routes/school.ts` | 20 |
| `server/services/market-bundle-importer.ts` | 17 |
| `server/services/market-workflow-orchestrator.ts` | 9 |
| `server/routes/markets.ts` | 8 |
| `server/routes/task-agent.ts` | 7 |
| `server/routes/alignment-reviewer.ts` | 6 |
| `server/services/atom-extractor.ts` | 6 |
| `server/services/market-backtest-runner.ts` | 6 |
| `server/routes/gap-assessments.ts` | 5 |
| `server/services/knowledge-pack-service.ts` | 5 |

---

**Cadence (per addendum §G.11):** per-migration mandatory; weekly + pre-release.

**Acceptance:**
- HIGH: SQL injection risk (user-controlled interpolation) — drop-everything fix.
- HIGH (route): SELECT * + missing LIMIT in routes — explicit columns + LIMIT N.
- MEDIUM: N+1 candidates — replace with `IN (?,?,?)` or `WHERE id = ANY($1)`.
- LOW: direct `pg` imports — refactor through DatabaseAdapter when touching the file.
