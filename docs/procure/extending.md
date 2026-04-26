# Extending Procure

This is for contributors who want to add categories, vendors, benchmarks, RFQ
templates, or evaluation criteria to the Procure pillar.

---

## Three ways to extend

### 1. Add to the seeded reference data (today)

The vendor directory, benchmarks, and RFQ templates ship as seed data in
`server/db/migrations-pg/171_procure_vendor_directory.sql`.

To add new entries:

1. Create a new migration: `172_procure_<scope>_seed.sql` (or whatever
   number is next).
2. Use `INSERT ... ON CONFLICT (id) DO NOTHING` so running the migration
   twice is safe.
3. For a new vendor, follow the `vendor_<slug>` ID convention.
4. For a benchmark, **always** populate P25, P50, P75 + `unit` + `source`
   + `sample_size`. A benchmark with only a median and no provenance is
   worse than no benchmark — it gives false confidence.
5. For an RFQ template, list `required_sections` so the UI can warn when a
   vendor response is incomplete.

### 2. Add an evaluation criterion (today)

Cycles use `procure_evaluation_criteria` to score vendors. Criteria are
per-cycle today (the operator picks them when they enter the Select phase).
A future change will let category packs supply default criteria — see (3).

### 3. Ship a `.anton` category pack (roadmap)

The intended end-state is a `.anton` bundle that combines:

- Vendor directory entries (`vendor_<slug>` records)
- Benchmarks for the category
- RFQ template(s)
- Default evaluation criteria
- Marketing copy describing when to use the pack

Like the Risk Atlas industry packs (see `data/risk-atlas/packs/`), Procure
packs will:

- Be loaded at install time by a `procure-pack-loader.ts` (not yet written)
- Live under `data/procure/packs/<pack-id>/`
- Carry a `manifest.json` with `pack_kind: 'category'` and an optional
  `parent_pack_id` for inheritance (e.g., `saas-sourcing-eu` extends
  `saas-sourcing-global` and overlays GDPR-specific RFQ sections)
- Be signed with the same instance Ed25519 key the Evidence Pack uses, so
  pack provenance is verifiable

The first pack to build out is **`saas-sourcing-global`** — covers the
common SaaS purchase patterns (collaboration tools, BI, analytics, security
tools) that most operators encounter first.

---

## Design rules for benchmarks

These are **non-negotiable** because a wrong benchmark causes worse
decisions than no benchmark:

1. **Always P25 / P50 / P75** — never a single number. The spread is the
   information.
2. **Always cite source + sample size** — "industry estimate" is not a
   source. "FinOps Foundation 2024 State of FinOps, n=512" is.
3. **Always date-stamp `last_updated_at`** — benchmarks decay fast in
   software / cloud. A two-year-old AI-LLM cost benchmark is actively
   misleading.
4. **Region is mandatory when prices vary by region** — cloud-infra spend
   in `EU` ≠ `APAC`. Don't aggregate.

## Design rules for RFQ templates

1. **List `required_sections`** so the UI can flag missing responses.
2. **Use `{{variable}}` substitution only** — no embedded logic. The
   `render()` function does literal `String.replaceAll` and nothing else.
3. **Keep templates jurisdiction-agnostic when possible**, then layer a
   jurisdiction-specific overlay (e.g., GDPR data-processing addendum) as
   a separate template.
4. **Don't bake legal opinion into the template** — a template asks for
   information; a contract is a separate artifact.

## Design rules for vendor directory entries

1. **Trust score is operator-curated** — never auto-generated from web
   scraping or AI inference. The score reflects the operator's judgement
   based on direct experience or trusted sources.
2. **Certifications are vendor-claimed and must be verified** — surface
   them in the UI with a "verify before relying" hint (the
   `ProcureVendorDirectoryPage` already does this in the page header).
3. **Jurisdictions reflect where the vendor can legally sell + serve**,
   not just where they have an office. Get this from the vendor's terms
   of service.
4. **Size band is approximate** — `startup` (<50 staff), `sme` (50–250),
   `mid` (250–5000), `enterprise` (5000+). Use the most recent public
   figure or the vendor's self-claim.
