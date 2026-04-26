# Hidden Capabilities Report

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.2 (services with backend wiring but no surface)

For each service file: counts how many routes / pages / marketing docs reference it.
**Hidden** = referenced from routes (i.e. wired) but absent from `docs/marketing/`.

## Hidden services (high elevation potential)

| Service | Routes | Pages | Marketing | Status |
|---|---|---|---|---|
| `webhook-listener` | 2 | 0 | 0 | 🔴 backend-only |
| `version-diff` | 1 | 0 | 0 | 🔴 backend-only |
| `vector-store-adapter` | 1 | 0 | 0 | 🔴 backend-only |
| `validator` | 1 | 0 | 0 | 🔴 backend-only |
| `unified-llm-client` | 4 | 1 | 0 | 🟡 wired, no marketing |
| `trust-store` | 1 | 0 | 0 | 🔴 backend-only |
| `transfer` | 4 | 4 | 0 | 🟡 wired, no marketing |
| `trails-aggregator-service` | 1 | 1 | 0 | 🟡 wired, no marketing |
| `token-estimator` | 1 | 0 | 0 | 🔴 backend-only |
| `time-intelligence` | 1 | 1 | 0 | 🟡 wired, no marketing |
| `text-extractor` | 7 | 0 | 0 | 🔴 backend-only |
| `temporal-reasoning` | 3 | 0 | 0 | 🔴 backend-only |
| `template-service` | 1 | 0 | 0 | 🔴 backend-only |
| `template-injector` | 1 | 0 | 0 | 🔴 backend-only |
| `teams-webhook` | 1 | 0 | 0 | 🔴 backend-only |
| `task-delegation-service` | 1 | 0 | 0 | 🔴 backend-only |
| `task-auto-processor` | 1 | 0 | 0 | 🔴 backend-only |
| `talent-service` | 1 | 0 | 0 | 🔴 backend-only |
| `talent-ai-service` | 1 | 0 | 0 | 🔴 backend-only |
| `suggestion-engine` | 1 | 0 | 0 | 🔴 backend-only |
| `subscribe` | 1 | 4 | 0 | 🟡 wired, no marketing |
| `structured-extraction-queue` | 1 | 0 | 0 | 🔴 backend-only |
| `stream-limiter` | 1 | 0 | 0 | 🔴 backend-only |
| `storage-adapter` | 1 | 0 | 0 | 🔴 backend-only |
| `starter-pack-service` | 1 | 0 | 0 | 🔴 backend-only |
| `smart-actions-analyzer` | 1 | 0 | 0 | 🔴 backend-only |
| `slack-webhook` | 1 | 0 | 0 | 🔴 backend-only |
| `slack-commands` | 1 | 0 | 0 | 🔴 backend-only |
| `skills-manager` | 3 | 0 | 0 | 🔴 backend-only |
| `signer` | 8 | 1 | 0 | 🟡 wired, no marketing |

## How to use this

- 🔴 **backend-only** services with multiple route hits are major candidates for elevation — they're built features without UI or narrative.
- 🟡 **wired, no marketing** = there's a UI surface but the asset isn't documented for users.

Promote → ship a marketing one-pager OR delete (per the brief's "delete or document" rule).

## Cadence

Monthly via `pnpm run anton:investigate -- --pattern hidden`.
