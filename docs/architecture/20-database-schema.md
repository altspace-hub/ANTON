# 20-database-schema — Database Schema (Index)

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`)
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate after every new migration. The table-count figure below is the canonical source for the README index.

This is the index for the database-schema diagrams. Per-group ER diagrams live in `20a-…20g-…`. Pillar-specific schema (Markets, Portals, Risk Atlas, Missions, Companion App, etc.) is kept in those subsystems' own diagrams to avoid duplication.

## Headline numbers

| Metric | Value | Source |
|---|---|---|
| Tables in `schema.sql` (base) | **16** | `server/db/schema.sql` |
| Tables created by migrations | **289 unique** | `server/db/migrations-pg/*.sql` (CREATE TABLE count) |
| Migration files | **121** | `server/db/migrations-pg/` (numbered 039–167; non-contiguous before 049) |
| Vector / RAG | Chroma (separate process) + FTS atoms (`migration 039`) | no `pgvector` extension in repo |
| Time-partitioned tables | `market_atoms_*`, `market_data_raw_*`, `market_index_nav_*`, `market_patterns_*` (quarterly / half-yearly partitions) | `057_markets_partitioning.sql` |

## Index by domain group

Detailed ER diagrams live in the linked files. This table is the index.

| Domain | Group file | # tables (rough) | Status |
|---|---|---|---|
| **Areas / Modules / Work** | `20a-database-areas.md` | ~12 | ✅ |
| **Knowledge** (folders · atoms · packs · HKP) | `20b-database-knowledge.md` | ~15 | ✅ |
| **Workflows / Triggers / Schedules** | `20c-database-workflows.md` | ~10 | 🟢 |
| **Reasoning Trails** | `20d-database-reasoning-trails.md` | ~6 | 🟢 |
| **Memory & Patterns** | `20e-database-memory-patterns.md` | ~10 | 🟢 |
| **Compliance / Audit** | `20f-database-compliance.md` | ~12 | ✅ |
| **RBAC / Identity / Auth** | `20g-database-rbac-identity.md` | ~14 | ✅ |
| **Markets pillar** | covered in `f-50-markets-pillar.md` + see table list below | ~58 | ✅ |
| **Portals + Registry** | covered in `33-portals-pathfinder.md` | ~14 | ✅ |
| **Missions** | covered in (subsystem doc — TBD) | ~10 | ✅ |
| **Risk Atlas** | covered in (subsystem doc — TBD) | ~17 | ✅ |
| **Companion App / Pairing / Push** | covered in `31-companion-app-gateway.md` | ~12 | ✅ |
| **Specialized Agents** | covered in `02-container-diagram.md` Pillar section | ~6 | ✅ |
| **Civic / Procure / Grow** | covered in `f-53-future-pillars.md` | ~20 | ✅ |
| **Community / Friends / Messaging** | covered in (subsystem doc — TBD) | ~14 | ✅ |
| **Beehive / Talent** | covered in `f-51-talent-discovery.md` | ~22 | 🟢 |
| **Hardware Build** | covered in `25-coding-area.md` | ~24 | ✅ |
| **FutureChain / Payments** | covered in `f-53-future-pillars.md` | ~10 | 🟢 |
| **Evidence Packs** | covered in `20f-database-compliance.md` | ~4 | ✅ |
| **Video Layer** | (Visitor v0.8 — see memory) | ~5 | ✅ |
| **Marketplace** | covered in `f-53-future-pillars.md` | ~3 | 🟢 |

## Markets table catalogue (kept here for searchability — 58 tables)

```
market_analyst_notes · market_atom_entity_links · market_atom_relationships ·
market_atom_sources · market_atom_tags · market_atoms · market_atoms_<quarter> (13 partitions) ·
market_backtest_days · market_backtest_predictions · market_backtest_signal_weights ·
market_backtest_theses · market_backtests ·
market_category_importance · market_computation_log · market_conditional_accuracy ·
market_confidence_calibration · market_consul_performance · market_correlation_map ·
market_cross_pillar_refs ·
market_data_raw + market_data_raw_<quarter> (13 partitions) · market_data_sources ·
market_entities · market_entity_aliases · market_entity_relationships ·
market_event_calendar · market_fundamental_scores ·
market_historical_fundamentals · market_historical_prices ·
market_index_holdings · market_index_leaderboard ·
market_index_nav_history + market_index_nav_<half-year> (7 partitions) ·
market_index_rebalances · market_indexes ·
market_investigation_tasks · market_meta_learning · market_narratives ·
market_pattern_detections + market_patterns_<half-year> (7 partitions) ·
market_prediction_attribution · market_prediction_feedback · market_predictions ·
market_price_normalized · market_regime_history ·
market_schedule_runs · market_signal_weight_adjustments · market_signal_weights ·
market_symbol_weight_overrides ·
market_theses · market_thesis_atoms · market_watchlist ·
market_why_chain_levels · market_why_chains · market_workflow_dead_letters
```

## Reading order

1. **Schema basics** → `20a-database-areas.md` (the universal `sessions` / `messages` / `module_configs` core).
2. **What ANTON learns from** → `20b-database-knowledge.md` + `20e-database-memory-patterns.md`.
3. **Audit trail** → `20d-database-reasoning-trails.md` + `20f-database-compliance.md`.
4. **Multi-tenant / auth** → `20g-database-rbac-identity.md`.
5. **Pillar-specific schema** → follow the cross-references in the table above.

## Migration provenance

Migrations are sequentially numbered under `server/db/migrations-pg/`:

| Range | Concern |
|---|---|
| `039` | knowledge_atoms FTS (only pre-049 file present) |
| `049–067 + 154–157` | Markets pillar |
| `077–104` | Community network, KYC, marketplace bundle, talent |
| `091–093` | Procure / Civic / Grow |
| `094, 130–132` | Companion App |
| `095, 098, 105–106` | Misc fixes |
| `107–109, 113–114` | Talent + Beehive |
| `111` | Specialized Agents |
| `115–122` | Missions |
| `123–124` | Output transformation |
| `125–129` | Risk Atlas |
| `133–144` | Hardware Build |
| `145–151, 158, 160, 167` | Portals |
| `152–153` | Evidence Packs |
| `159` | User starter packs |
| `161` | Pathfinder visitor |
| `162` | Jobs candidate side |
| `163` | Marketplace visitor |
| `164–165` | Friends + messaging |
| `166` | Video layer |

## Source-of-truth references

- `server/db/schema.sql` — base 16 tables.
- `server/db/migrations-pg/*.sql` — 121 migrations (full enumeration in `_audit-notes.md` §5).
- `server/db/init.ts` — migration runner.
- `server/db/database.ts` — `DatabaseAdapter` interface.
- `_audit-notes.md` §1, §5 — counts and migration grouping.

## Open questions

- **Pgvector adoption** — no `CREATE EXTENSION vector;` found. The vector path uses Chroma + Ollama embeddings via `chroma-client.ts` and `embedding-pipeline.ts`. If pgvector were adopted for semantic search, `20b-database-knowledge.md` would need to add a `vectors` table.
- **Schema reconciliation** — `schema.sql` has the original 16 tables; some have been altered by migrations (e.g. `sessions` extended). The diagrams in `20a–20g` use the *current* shape after all migrations applied.
- **Per-pillar schema duplication** — many large pillar groups (Markets, Portals, Atlas, Hardware) are documented inside their subsystem diagrams rather than here; the brief explicitly allows this split. The index above is the cross-reference.

## Related diagrams

- `20a-database-areas.md` … `20g-database-rbac-identity.md` — per-group ER detail.
- `02-container-diagram` — where Postgres sits in the architecture.
- `30-aap-protocol`, `31-companion-app-gateway`, `33-portals-pathfinder`, `f-50-markets-pillar`, `f-53-future-pillars` — pillar-specific schema appendices.
