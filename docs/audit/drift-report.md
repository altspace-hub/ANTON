# Drift Report

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.1 (drift detection)

This report compares live code counts against figures claimed in CLAUDE.md,
`/docs/architecture/_audit-notes.md`, and the architecture diagrams. Drift
above 10% surfaces here; severity escalates with magnitude.

## Live counts

| Metric | Live value |
|---|---|
| Areas | 59 |
| Services (recursive) | 363 |
| Routes | 155 |
| Frontend pages | 256 |
| PG migrations | 122 |
| Modules in `constants.ts` | 263 |
| Bundle types in `anton-bundler.ts` | 45 |
| Unique tables (schema + migrations) | 307 |

## Comparison vs. documented claims

| Claim source | Metric | Claim | Live | Δ% | Severity |
|---|---|---|---|---|---|
| CLAUDE.md | Areas (Work pillar) | 59 | 59 | 0% | ✅ within 10% |
| CLAUDE.md | Modules | 263 | 263 | 0% | ✅ within 10% |
| _audit-notes.md (original) | Services | 221 | 363 | 64% | 🔴 high |
| _audit-notes.md | Routes | 151 | 155 | 2% | ✅ within 10% |
| _audit-notes.md | Pages | 251 | 256 | 1% | ✅ within 10% |
| _audit-notes.md | Migrations | 121 | 122 | 0% | ✅ within 10% |
| 32-anton-bundle-format.md | Bundle types | 45 | 45 | 0% | ✅ within 10% |
| 20-database-schema.md | Unique tables | 289 | 307 | 6% | ✅ within 10% |
| Improvement Brief §0 | Pillars (whitepaper claim) | 3 | 12 | 300% | 🔴 high |
| Improvement Brief §0 | Bundle types (whitepaper) | 17 | 45 | 164% | 🔴 high |

## What to do with this

- **🔴 High** — re-baseline the documentation, surface to Daniel immediately, may require a re-architecture review.
- **🟡 Medium** — schedule a documentation update in the next sprint.
- **🟢 Low** — log; bundle into the next routine doc refresh.

## Cadence

Run weekly via `pnpm run anton:investigate -- --pattern drift`.

