# Procure pillar — contributor README

This is the contributor-facing reference for the Procure pillar. For the
operator-facing overview, see [`docs/marketing/procure.md`](../marketing/procure.md).

---

## Module layout

```
server/
├── routes/
│   ├── procure.ts                 Phase A — cycle CRUD, requirements, vendors, evaluation
│   └── procure-extended.ts        Phase B.2 — directory / benchmarks / RFQ templates (read-only)
├── services/
│   ├── procure-service.ts         Phase A — pipeline state machine + scoring math
│   ├── procure-vendor-directory.ts  Phase B.2 — directory queries (list / get / categories)
│   ├── procure-benchmarks.ts        Phase B.2 — pricing + delivery benchmark queries
│   └── procure-rfq-templates.ts     Phase B.2 — RFQ scaffold queries + {{var}} render
└── db/migrations-pg/
    ├── 091_procure_pillar.sql     Phase A schema (cycles / requirements / vendors / evaluations / contracts / performance)
    └── 171_procure_vendor_directory.sql   Phase B.2 schema (directory / benchmarks / templates)

src/pages/procure/
├── ProcurePage.tsx                Dashboard — cycles + catalogue tiles
├── ProcureCyclePage.tsx           Single-cycle workspace (5 phases)
├── ProcureVendorDirectoryPage.tsx Searchable vendor catalogue
├── ProcureBenchmarksPage.tsx      Pricing + delivery benchmarks browser
└── ProcureRfqTemplatesPage.tsx    RFQ template catalogue
```

## Data model — Phase B.2 additions

### `procure_vendor_directory`

Curated list of vendors, separate from `procure_vendors` (which is
cycle-scoped). The directory feeds the Source phase. Trust score is
operator-curated (0.0–1.0); certifications are vendor-claimed and must be
verified before relying on them.

| Column          | Type    | Notes |
|-----------------|---------|-------|
| `id`            | TEXT PK | `vendor_<slug>` convention                  |
| `name`          | TEXT    | Display name                                |
| `category`      | TEXT    | Free-form category tag                      |
| `jurisdictions` | JSONB   | Array of ISO country codes (`["US","EU"]`)  |
| `certifications`| JSONB   | Array of cert names (`["SOC2","ISO27001"]`) |
| `size_band`     | TEXT    | `startup` / `sme` / `mid` / `enterprise`    |
| `trust_score`   | NUMERIC | 0.0–1.0, operator-curated                   |

### `procure_benchmarks`

Pricing + delivery benchmarks per category. Always store P25 / P50 / P75 —
the median alone is misleading. Sample size + source field are non-optional
in spirit (the column is nullable for seed convenience but every benchmark
should cite both).

### `procure_rfq_templates`

Per-category RFQ scaffolds. `template_body` is plain text with `{{variable}}`
placeholders. The `render()` helper does literal substitution only — no
templating engine, no code execution, by design.

## Adding entries

The directory / benchmarks / templates are seeded via SQL migrations in
`server/db/migrations-pg/`. To add new entries:

1. Pick the next migration number (currently 171 was the last seed).
2. Write `INSERT ... ON CONFLICT DO NOTHING` so re-running the migration is safe.
3. Update the marketing copy in `docs/marketing/procure.md` if the addition
   changes what an operator can rely on (e.g., new category coverage).

A future `.anton` category-pack format is on the roadmap — see
[`extending.md`](./extending.md) — which will let third-party packs add to
the directory / benchmarks / templates without writing migrations.

## REST endpoints

All under `/api/procure`. Phase B.2 endpoints are read-only:

| Method | Path                       | Purpose                                                 |
|--------|----------------------------|---------------------------------------------------------|
| GET    | `/vendors`                 | Filter by category / jurisdiction / sizeBand / minTrust |
| GET    | `/vendors/:id`             | Single vendor                                           |
| GET    | `/vendor-categories`       | Distinct categories — for dropdowns                     |
| GET    | `/benchmarks`              | Filter by category / metric / region                    |
| GET    | `/rfq-templates`           | Filter by category / jurisdiction                       |
| GET    | `/rfq-templates/:id`       | Single template (for preview / render)                  |

Mutations live in `server/routes/procure.ts` (cycle CRUD, requirements, etc.)
and intentionally don't expose write access to the directory / benchmarks /
templates yet — those are operator-curated content, not user-generated.
