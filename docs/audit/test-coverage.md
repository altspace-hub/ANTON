# Test Coverage Gaps

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** F.1

Services with no `<basename>.test.ts` anywhere under `tests/`. Weighted by
how many other server/src files import them — the more imports, the higher
the priority to add tests.

## Top 20 untested services (by import count — highest priority first)

| Service | Imports | Suggested test |
|---|---|---|
| `types` | 138 | tests/services/types.test.ts |
| `types` | 138 | tests/services/types.test.ts |
| `types` | 138 | tests/services/types.test.ts |
| `types` | 138 | tests/services/types.test.ts |
| `provider-router` | 49 | tests/services/provider-router.test.ts |
| `index` | 44 | tests/services/index.test.ts |
| `index` | 44 | tests/services/index.test.ts |
| `identity` | 34 | tests/services/identity.test.ts |
| `claude-client` | 24 | tests/services/claude-client.test.ts |
| `renderer-registry` | 20 | tests/services/renderer-registry.test.ts |
| `renderer-registry.types` | 18 | tests/services/renderer-registry.types.test.ts |
| `join` | 18 | tests/services/join.test.ts |
| `credential-vault` | 18 | tests/services/credential-vault.test.ts |
| `artifact-storage` | 16 | tests/services/artifact-storage.test.ts |
| `query` | 14 | tests/services/query.test.ts |
| `text-extractor` | 11 | tests/services/text-extractor.test.ts |
| `register` | 11 | tests/services/register.test.ts |
| `hybrid-search` | 10 | tests/services/hybrid-search.test.ts |
| `envelope` | 10 | tests/services/envelope.test.ts |
| `custom` | 10 | tests/services/custom.test.ts |

## What to do

- The top entries are the highest-leverage tests — they're the services everything else depends on.
- Aim for coverage of public-API (`export`) surfaces; private helpers can wait.
- A single contract test per service often beats five edge-case tests per service.

## Cadence

Monthly via `pnpm run anton:investigate -- --pattern test-coverage`.
