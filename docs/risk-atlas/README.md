# Risk Atlas

> ANTON's universal seven-stage threat-path engine. Generalises the CASP / FCP business-wide risk-assessment methodology into a living risk register any business can maintain — bakery to bank. **Deterministic engine + LLM-rationale** is the core architectural commitment: scores are reproducible across runs; the LLM writes prose, never numbers.

---

## Quick map

| If you want to… | Read |
|---|---|
| Strategic positioning | [`/docs/marketing/risk-atlas.md`](../marketing/risk-atlas.md) |
| Architecture diagram | [`/docs/architecture/_audit-notes.md`](../architecture/_audit-notes.md) §3 (Risk Atlas row) |
| The seven stages | This file (below) |
| Extending Risk Atlas | [`extending.md`](extending.md) |

---

## The seven stages

| Stage | Captures | Determinism |
|---|---|---|
| 1. Exposures | Customer types, products, channels, geographies | numeric |
| 2. Threat paths | Typologies, predicate offences, intent chains | numeric + LLM-narrated |
| 3. Vulnerabilities | Control gaps, blind spots | numeric |
| 4. Inherent risk | `max(Exposure, Threat, Vulnerability)` | **pure formula** |
| 5. Controls | Strong / Adequate / Weak — worst-of rollup | numeric, LLM rationale |
| 6. Residual risk | `Inherent − reduction`, clamped [1,5] | **pure formula** |
| 7. Appetite | 5×5 grid: 1–2 within · 3 boundary · 4 outside · 5 unacceptable | numeric |

The deterministic core is `server/services/risk-atlas/atlas-residual-calculator.ts` with 25 unit tests. **Audit-locked.**

---

## Service tree

`server/services/risk-atlas/`:

| File | Responsibility |
|---|---|
| `atlas-service.ts` | Top-level Atlas CRUD + stage operations |
| `atlas-residual-calculator.ts` | The deterministic core (25 unit tests) |
| `atlas-pack-loader.ts` | Loads industry packs from `data/risk-atlas/packs/` (33 packs, two-pass parent-FK loader post-fix) |
| `atlas-fcp-scope-service.ts` | FCP domain scope; Stage 7b company-wide appetite rollup |
| `atlas-export.ts` | Board-ready DOCX, threat-path PDF, heatmap SVG, signed `.anton risk-atlas-export` bundle |
| `atlas-event-logger.ts` | Atlas-specific event log |
| `atlas-knowledge-bridge.ts` | Bidirectional bridge to knowledge_atoms |
| `atlas-integrity-rules.ts` | Six compliance-as-code rules (ATLAS-INT-001..006) |
| `types.ts` | Shape definitions |

---

## Schema

5 dedicated migrations (125–129):

| Migration | Concern |
|---|---|
| 125 | Foundation — 18 atlas tables (post-fix: drops legacy CHECK constraint instead of adding new one) |
| 126 | Review fixes |
| 127 | FCP addendum — `atlas_fcp_scope`, cross-domain bundles |
| 128 | `pack_kind` classifier (industry / fcp-domain / overlay) |
| 129 | Addendum review fixes |

---

## Industry packs

33 packs under `data/risk-atlas/packs/` covering: banks, CASPs, payment institutions, crowdfunders, accounting/tax advisors, dealers in high-value goods, construction trades, and more. Plus FCP-domain packs (AML/CFT, sanctions, fraud, ABC, market abuse, tax-evasion-facilitation, export controls).

Loader: `atlas-pack-loader.ts` does a two-pass insert (parents-NULL first, then UPDATE parent_pack_id) so file-system ordering doesn't break the FK chain.

---

## What you can take out

| Output | Format | Use |
|---|---|---|
| Board pack | DOCX | Stage 1–7 + Stage 7b + named threat-path narrative |
| Per-threat-path detail | PDF | For control owners |
| Heatmap | SVG | Drop into a board deck |
| Signed export | `.anton risk-atlas-export` bundle (#33) | Share with regulator / external auditor / consultancy — Ed25519-signed canonical body |

---

## Where to start

- **Try it:** `/risk-atlas` (overview) · `/atlas` (your atlases)
- **Code:** `server/services/risk-atlas/` (9 services with 25+ unit tests)
- **Marketing:** [`/docs/marketing/risk-atlas.md`](../marketing/risk-atlas.md)
- **Mission template:** `tmpl_amlr_readiness_v1` (the 10-task end-to-end programme — see [`/docs/missions/use-cases/amlr-readiness.md`](../missions/use-cases/amlr-readiness.md))
- **Extending:** [`extending.md`](extending.md)

---

*Refresh when an industry pack family is added, when the FCP-domain set extends, or when the integrity-rule set grows beyond six.*
