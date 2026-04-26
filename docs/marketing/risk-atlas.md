# Risk Atlas — One-Pager

> **What it is:** A universal, code-grounded threat-path engine that turns risk assessment from a one-off Excel exercise into a living register a business actually maintains.
> **Who it's for:** Compliance officers, MLROs, internal auditors, board risk committees, supervisory authorities — anyone who needs a defensible record of *how* a risk decision was reached.
> **What makes it different:** Deterministic by construction. The LLM writes the rationale, never the score.

---

## The problem we set out to fix

Two patterns dominate today's risk-assessment tools, and neither survives an audit:

1. **Static heat-maps.** A spreadsheet, frozen in time, that no one updates between annual reviews. Auditable, but only if you accept that risk hasn't changed in 12 months.
2. **Free-text LLM scoring.** An AI assistant that "scores" a risk in prose. Looks great in a demo. Impossible to reproduce — same input on Tuesday gives a different number than Friday.

Risk Atlas keeps the **deterministic engine** of the static approach and uses the LLM only for the **rationale prose**. Every score is reproducible across runs; every claim is backed by a five-character minimum evidence string.

---

## How it works — the seven stages

| Stage | What it captures | Determinism |
|---|---|---|
| 1. Exposures | Customer types, products, channels, geographies | numeric |
| 2. Threat paths | Typologies, predicate offences, intent chains | numeric + LLM-narrated |
| 3. Vulnerabilities | Control gaps, blind spots | numeric |
| 4. Inherent risk | `max(Exposure, Threat, Vulnerability)` | **pure formula** |
| 5. Controls | Strong / Adequate / Weak — worst-of rollup | numeric, LLM rationale |
| 6. Residual risk | `Inherent − reduction`, clamped [1,5] | **pure formula** |
| 7. Appetite | 5×5 grid: 1–2 within · 3 boundary · 4 outside · 5 unacceptable | numeric |

The deterministic core lives in **`server/services/risk-atlas/atlas-residual-calculator.ts`** with 25 unit tests. Audit-locked.

---

## Built for FCP, generalised for every business

The Financial Crime Prevention (FCP) addendum (Article 16 BWRA, AMLR-aligned) ships as a layered overlay:

- Seven FCP domains: **AML/CFT, sanctions, fraud, ABC, market abuse, tax-evasion facilitation, export controls**.
- They compose into a **Stage 7b company-wide appetite rollup** — deterministic, worst-of-domain.
- The same engine handles a sole-operator bakery's BWRA. The methodology generalises.

**25 industry packs** ship today under `data/risk-atlas/packs/` — banks, CASPs, crowdfunders, accounting/tax advisors, dealers in high-value goods, construction trades, and more.

---

## What you can take out

| Output | Format | Use |
|---|---|---|
| Board pack | DOCX | Stage 1–7 + Stage 7b + named threat-path narrative |
| Per-threat-path detail | PDF | For control owners |
| Heatmap | SVG | Drop straight into a board deck |
| Signed export | `.anton risk-atlas-export` bundle | Share with regulator / external auditor / consultancy — Ed25519-signed canonical body |

---

## Why this matters

For a regulated firm, the question a supervisor asks during an inspection is **not** "what's your risk score?" — it's "**show me how you got there.**" Risk Atlas is the answer to that question:

- The score is reproducible (deterministic formula).
- The rationale is captured (LLM-written, evidence-anchored).
- The decision history is signed (`.anton` bundles + signed trail entries).
- The appetite statement is enforceable (Stage 7 thresholds drive escalation triggers).

For a small business, the question is "is this even worth doing?" — and the answer is that the same engine can be a 30-minute exercise (the SmallBusinessDashboardPage path) instead of a six-week consulting engagement.

---

## Where to look

- **Try it:** `/risk-atlas` (overview) or `/atlas` (your atlases).
- **Code:** `server/services/risk-atlas/` (9 services), `server/db/migrations-pg/125_risk_atlas_foundation.sql` … `129_risk_atlas_addendum_review_fixes.sql` (5 migrations, 17 tables).
- **Tests:** `tests/services/risk-atlas/` (residual calculator, FCP rollup, integrity rules, pack loader).
- **Mission template:** `tmpl_amlr_readiness_v1` (in `server/services/missions/seed-templates.ts`) — a 10-task end-to-end programme for an AMLR-obliged entity, four explicit checkpoints.
- **Architecture diagram:** `/docs/architecture/_audit-notes.md` §3 (Risk Atlas row) — the full audit-grade inventory.

---

*Document maintained alongside `src/pages/risk-atlas/RiskAtlasAboutPage.tsx`. Refresh both when industry-pack count changes or when the FCP-domain list expands.*
