# Pillar Maturity Score (v2)

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.8 v2 (precision rewrite — TypeScript)

For each pillar / cross-pillar surface: scores from 0.0–1.0 across five dimensions, plus a weighted composite. Sorted **ascending** by composite (least mature first — these are the priority targets).

The `work` pillar is intentionally exempt — it's the universal substrate every other pillar uses, not a measurable per-pillar surface (decided 2026-04-26 PM).

## Methodology

| Dimension | Weight | Score formula |
|---|---|---|
| UI | 25% | min(1.0, pages / 5) · path-routed = ×0.75 |
| Service | 25% | min(1.0, services / 10) — discovery via servicePaths + serviceGlobs |
| Schema | 20% | min(1.0, dedicated_migrations / 5) — multi-token match |
| Test | 15% | services_with_tests / total_services — Set lookup over all *.test.ts basenames |
| Doc | 15% | (marketing + contributor-docs-dir + arch-diagram) / 3 |

Composite < 0.85 is the new pass threshold (raised from 0.6 per the planning session).

## Results

| Pillar | UI | Service | Schema | Test | Doc | Composite | Action |
|---|---|---|---|---|---|---|---|
| procure      | 0.40 | 0.50 | 0.20 | 0.00 | 0.33 | **0.31** | 🔴 Completion sprint required |
| agents       | 0.20 | 0.50 | 0.20 | 0.00 | 1.00 | **0.36** | 🔴 Completion sprint required |
| life         | 1.00 | 0.50 | 0.20 | 0.00 | 0.00 | **0.42** | 🟡 Schedule completion sprint |
| pathfinder   | 0.60 | 0.50 | 0.20 | 0.00 | 1.00 | **0.47** | 🟡 Schedule completion sprint |
| beehive      | 0.40 | 0.90 | 0.40 | 0.11 | 0.67 | **0.52** | 🟡 Schedule completion sprint |
| coding       | 1.00 | 0.60 | 0.00 | 0.00 | 1.00 | **0.55** | 🟡 Schedule completion sprint |
| community    | 1.00 | 0.50 | 0.60 | 0.00 | 0.67 | **0.60** | 🟢 Polish (specific gap) |
| payments     | 1.00 | 0.60 | 0.60 | 0.00 | 0.67 | **0.62** | 🟢 Polish (specific gap) |
| school       | 1.00 | 0.60 | 0.40 | 0.00 | 1.00 | **0.63** | 🟢 Polish (specific gap) |
| civic        | 1.00 | 0.60 | 0.40 | 0.00 | 1.00 | **0.63** | 🟢 Polish (specific gap) |
| grow         | 1.00 | 0.60 | 0.60 | 0.00 | 1.00 | **0.67** | 🟢 Polish (specific gap) |
| markets      | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | **0.85** | ✅ Maintain |
| portals      | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | **0.85** | ✅ Maintain |
| missions     | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | **0.85** | ✅ Maintain |
| hardware     | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | **0.85** | ✅ Maintain |
| risk-atlas   | 1.00 | 0.90 | 1.00 | 0.33 | 1.00 | **0.87** | ✅ Maintain |

## Raw counts (for transparency)

| Pillar | Pages | Services | Tested | Migrations | Marketing? | Contrib? | Arch? |
|---|---|---|---|---|---|---|---|
| procure      | 2 | 1 | 0 | 1 | · | · | ✓ |
| agents       | 1 | 5 | 0 | 1 | ✓ | ✓ | ✓ |
| life         | 17 | 0 | 0 | 1 | · | · | · |
| pathfinder   | 3 | 2 | 0 | 1 | ✓ | ✓ | ✓ |
| beehive      | 2 | 9 | 1 | 2 | ✓ | ✓ | · |
| coding       | 10 | 3 | 0 | 0 | ✓ | ✓ | ✓ |
| community    | 20 | 3 | 0 | 3 | ✓ | ✓ | · |
| payments     | 8 | 6 | 0 | 3 | ✓ | ✓ | · |
| school       | 34 | 1 | 0 | 2 | ✓ | ✓ | ✓ |
| civic        | 5 | 4 | 0 | 2 | ✓ | ✓ | ✓ |
| grow         | 5 | 1 | 0 | 3 | ✓ | ✓ | ✓ |
| markets      | 24 | 34 | 0 | 23 | ✓ | ✓ | ✓ |
| portals      | 8 | 54 | 0 | 10 | ✓ | ✓ | ✓ |
| missions     | 6 | 19 | 0 | 8 | ✓ | ✓ | ✓ |
| hardware     | 9 | 18 | 0 | 12 | ✓ | ✓ | ✓ |
| risk-atlas   | 5 | 9 | 3 | 5 | ✓ | ✓ | ✓ |

## Decision rule

- **🔴 < 0.40** — completion sprint required, pause feature work
- **🟡 0.40–0.60** — schedule sprint within the quarter
- **🟢 0.60–0.85** — identify lowest-scoring dimension, plan one focused PR
- **✅ ≥ 0.85** — maintain

## What changed in v2

- Service discovery now traverses subdirectories (was: `-iname` glob that missed nested dirs).
- Test detection loads all `*.test.ts` basenames into a Set once, then O(1) lookups per service.
- Schema discovery accepts multiple migration tokens per pillar.
- Doc discovery checks multiple marketing-doc paths + plural variants of contributor-docs dir.
- Architecture-diagram detection accepts dedicated diagrams AND shared diagrams that mention the pillar.
- The `work` pillar is exempt (it's the substrate, not a measurable surface).

