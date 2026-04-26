# 28-risk-atlas — Risk Atlas Pillar (Cross-Pillar Surface)

**Status of diagram:** Generated 2026-04-26 PM by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`); shipped during Phase 2 maturity sprints.
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when an industry-pack family is added, when the FCP-domain set extends, when an integrity rule lands, or when the export format catalogue grows.

Risk Atlas is ANTON's universal seven-stage threat-path engine. Generalises CASP / FCP business-wide-risk-assessment methodology for any business — bakery to bank. The architectural commitment: **deterministic engine + LLM-rationale**. Scores are reproducible across runs; the LLM writes prose, never numbers.

## Diagram — seven-stage flow

```mermaid
flowchart TD
  classDef stage fill:#1E3A8A,stroke:#93C5FD,color:#EFF6FF
  classDef formula fill:#7C2D12,stroke:#FDBA74,color:#FFF7ED
  classDef llm fill:#0F766E,stroke:#5EEAD4,color:#F0FDFA
  classDef export fill:#581C87,stroke:#D8B4FE,color:#FAF5FF

  S0[Stage 0 — Atlas root<br/>risk_atlases row]:::stage

  S0 --> S1[Stage 1 — Exposures<br/>customer types · products ·<br/>channels · geographies]:::stage
  S0 --> S2[Stage 2 — Threat paths<br/>typologies · predicate offences ·<br/>intent chains]:::stage
  S0 --> S3[Stage 3 — Vulnerabilities<br/>control gaps · blind spots]:::stage

  S1 --> S4["Stage 4 — Inherent risk<br/>= max(E, T, V)"]:::formula
  S2 --> S4
  S3 --> S4

  S4 --> S5[Stage 5 — Controls<br/>Strong / Adequate / Weak<br/>worst-of rollup]:::stage
  S5 --> S5L[LLM rationale only<br/>numbers stay deterministic]:::llm

  S4 --> S6["Stage 6 — Residual risk<br/>= Inherent − reduction<br/>clamped [1,5]"]:::formula
  S5 --> S6

  S6 --> S7[Stage 7 — Appetite<br/>5×5 grid: 1-2 within ·<br/>3 boundary · 4 outside ·<br/>5 unacceptable]:::stage

  S7 --> S7B[Stage 7b — Company-wide<br/>FCP rollup<br/>worst-of per FCP domain]:::formula

  S7B --> Export
  S7 --> Export
  Export[Exports]:::export
  Export --> EBoard[Board pack DOCX]:::export
  Export --> EPDF[Per-threat-path PDF]:::export
  Export --> ESVG[Heatmap SVG]:::export
  Export --> EBundle[.anton risk-atlas-export<br/>signed bundle]:::export
```

## The 6 integrity rules

`atlas-integrity-rules.ts` enforces deterministic invariants over Atlas state. Pure functions over a snapshot — no LLM, no DB writes outside the evaluation.

| Rule id | What it checks |
|---|---|
| ATLAS-INT-001 | Residual ≥ 4 with no appetite statement |
| ATLAS-INT-002 | Strong control without ≥5-character evidence string |
| ATLAS-INT-003 | Outside-appetite path missing remediation action / target date |
| ATLAS-INT-004 | Threat path with zero exposure-point links |
| ATLAS-INT-005 | Control referenced by vulnerabilities but not present in `atlas_controls` |
| ATLAS-INT-006 | Cross-domain path bundle (Stage 7b) with members from disjoint FCP scopes |

## Industry pack catalogue (33 packs)

| pack_kind | Examples | Purpose |
|---|---|---|
| `industry` | sme-general, fcp-bank, fcp-casp, fcp-payment-institution, sector-construction, sector-real-estate, sector-gambling, sector-art-dealer, … | Industry-specific overlay |
| `fcp-domain` | fcp-domain-amlcft, fcp-domain-sanctions, fcp-domain-fraud, fcp-domain-abc, fcp-domain-market-abuse, fcp-domain-tax-evasion-facilitation, fcp-domain-export-controls | FCP-domain-specific overlay |
| `overlay` | universal-fcp-core | Composes into multiple Atlases as a baseline |

Inheritance via `parent_pack_id` (cycle-protected). Loader does a two-pass insert (parents-first then parent-link) so file-system ordering doesn't break the FK chain (post-fix from 2026-04-26 PM).

## Mission integration

`tmpl_amlr_readiness_v1` is the canonical 10-task end-to-end programme for an AMLR-obliged entity. See [`/docs/missions/use-cases/amlr-readiness.md`](../missions/use-cases/amlr-readiness.md).

## Source-of-truth references

- `server/services/risk-atlas/atlas-residual-calculator.ts` — the deterministic core (25 unit tests)
- `server/services/risk-atlas/atlas-pack-loader.ts` — two-pass loader (post-fix)
- `server/services/risk-atlas/atlas-fcp-scope-service.ts` — Stage 7b rollup
- `server/services/risk-atlas/atlas-integrity-rules.ts` — 6 deterministic integrity rules
- `server/db/migrations-pg/125_risk_atlas_foundation.sql` … `129_risk_atlas_addendum_review_fixes.sql`
- `data/risk-atlas/packs/` — 33 industry/FCP-domain/overlay packs
- `tests/services/risk-atlas/` — atlas-residual-calculator + atlas-fcp-scope-rollup + atlas-integrity-rules + atlas-pack-loader tests

## Related diagrams

- [`/docs/architecture/04-six-layer-vision.md`](04-six-layer-vision.md) — Risk Atlas serves Layer 2
- [`/docs/architecture/24-workflow-engine.md`](24-workflow-engine.md) — workflows Atlas rides on
- [`/docs/risk-atlas/`](../../docs/risk-atlas/) — contributor documentation
- [`/docs/marketing/risk-atlas.md`](../../docs/marketing/risk-atlas.md) — strategic positioning
