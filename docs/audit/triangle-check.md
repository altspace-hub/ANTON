# Surface-Service-Schema Triangle Check

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.6

For each pillar / domain: counts pages, services, and migrations. Imbalance signals a half-built feature.

| Domain | Pages | Services | Migrations | Triangle |
|---|---|---|---|---|
| markets      | 24    | 0        | 17         | 🟡 UI without service? |
| school       | 34    | 1        | 1          | ✅ balanced |
| life         | 1     | 3        | 1          | ✅ balanced |
| pathfinder   | 3     | 1        | 1          | ✅ balanced |
| portals      | 8     | 1        | 1          | ✅ balanced |
| missions     | 6     | 1        | 8          | ✅ balanced |
| community    | 20    | 3        | 1          | ✅ balanced |
| payments     | 0     | 0        | 0          | (absent) |
| procure      | 2     | 1        | 1          | ✅ balanced |
| civic        | 2     | 1        | 1          | ✅ balanced |
| grow         | 5     | 2        | 3          | ✅ balanced |
| agents       | 1     | 0        | 1          | 🟡 UI without service? |
| atlas        | 0     | 9        | 5          | 🔴 backend-only (no UI) |
| hardware     | 9     | 1        | 7          | ✅ balanced |
| coding       | 5     | 3        | 0          | 🟢 service without dedicated schema |
| talent       | 2     | 2        | 3          | ✅ balanced |
| beehive      | 2     | 9        | 2          | ✅ balanced |
| evidence     | 4     | 1        | 3          | ✅ balanced |

## How to read

- ✅ **balanced** — pages, services, and migrations all present. Healthy.
- 🟢 **service without dedicated schema** — common for services that share core tables (sessions, messages). Usually fine.
- 🟡 **UI without service** — page exists but no obvious matching service file. May indicate naming drift.
- 🔴 **backend-only** — service + schema but no user-facing pages. Either elevate (D.1 / D.2 pattern) or delete.

## Cadence

Monthly via `pnpm run anton:investigate -- --pattern triangle`.
