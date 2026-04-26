# Extending Risk Atlas

> How to add a new industry pack, a new FCP domain, a new integrity rule, or a new export format.

---

## Add a new industry pack

Industry packs live under `data/risk-atlas/packs/<pack-id>/` with a `manifest.json` + per-stage content directories. To add a new pack:

1. **Pick the pack id** — kebab-case, namespaced if appropriate (`fcp-` for FCP-domain-aligned, `sector-` for sector-specific industry packs).
2. **Create the directory** under `data/risk-atlas/packs/<pack-id>/`.
3. **Author `manifest.json`** with: id, name, version, parent_pack_id (optional inheritance), description, amlr_obliged, typical_size_range, typical_jurisdictions, recommends_fcp_domains.
4. **Author the stage content** under per-stage subdirectories (`exposures/`, `threat-paths/`, `controls/`, etc.) — see existing packs as templates.
5. **The two-pass loader handles ordering** — `atlas-pack-loader.ts` will pick up the new pack on next service start without manual ordering.
6. **Verify** by checking the load output: server log should show `[risk-atlas] packs seeded: N inserted, M updated, errors: 0`.

---

## Add a new FCP domain

FCP domains compose into Stage 7b company-wide appetite rollup. Currently: AML/CFT, sanctions, fraud, ABC, market abuse, tax-evasion-facilitation, export controls. To add (e.g.) cyber-FCP:

1. **Create an FCP-domain pack** under `data/risk-atlas/packs/fcp-domain-cyber/` with `pack_kind: "fcp-domain"`.
2. **Map** to existing exposures + threat paths via the manifest (often inherits from `universal-fcp-core`).
3. **Stage 7b** rollup picks up the new domain automatically — `atlas-fcp-scope-service.ts` is domain-agnostic.
4. **Document** in `/docs/marketing/risk-atlas.md` "Built for FCP" section.

---

## Add a new integrity rule

Integrity rules are deterministic checks over Atlas state — they fire on the workspace dashboard. Currently 6 rules (ATLAS-INT-001..006).

1. **Open** `server/services/risk-atlas/atlas-integrity-rules.ts`.
2. **Add** a new rule following the existing pattern: pure function over a snapshot of Atlas state, returns findings.
3. **Test** the rule under `tests/services/risk-atlas/atlas-integrity-rules.test.ts`.
4. **Surface** in the Risk Atlas Workspace UI — the `RiskAtlasWorkspacePage` reads rule findings and displays them in the dashboard.

Rules are pure functions — no LLM calls, no DB writes outside the snapshot. They must be reproducible.

---

## Add a new export format

Current exports: board-pack DOCX, per-threat-path PDF, heatmap SVG, `.anton risk-atlas-export` bundle. To add (e.g.) an Excel risk register:

1. **Add** a new function to `server/services/risk-atlas/atlas-export.ts`: `exportToExcel(atlasId): Promise<Buffer>`.
2. **Register** the export type on the Atlas workspace page (export menu).
3. **Test** the output structure.

If the new export needs a new bundle type (rather than an inline file download), follow the bundle-extension process at [`/docs/anton-format/extending.md`](../anton-format/extending.md).

---

## Add a new mission template referencing Risk Atlas

The `tmpl_amlr_readiness_v1` template (`server/services/missions/seed-templates.ts`) is the canonical example. To add a new Atlas-aware mission:

1. Define the template per [`/docs/missions/extending.md`](../missions/extending.md).
2. Reference Atlas modules in `required_modules`: e.g. `atlas-stage-1-exposures`, `atlas-stage-2-threat-paths`, etc.
3. Use `task_type='checkpoint'` between stage transitions so the human reviews each stage's output.

---

## Anti-patterns

- **Don't use the LLM to generate scores.** Inherent / Residual / Appetite are formulas, not opinions. The LLM writes the rationale that explains the score.
- **Don't bypass the integrity rules.** They're deterministic for a reason — silencing a finding without addressing it breaks audit defensibility.
- **Don't add a parent_pack_id without verifying the parent exists.** The two-pass loader handles ordering, but a typo in `parent_pack_id` will fail silently as "no inheritance" rather than a clear error.
- **Don't truncate evidence strings.** The 5-char minimum is the audit-defensibility floor — relax it and the entire reproducibility argument weakens.

---

*Maintained alongside `server/services/risk-atlas/`. Refresh when a new pack / FCP-domain / integrity-rule / export format ships.*
