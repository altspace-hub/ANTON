# AMLR Readiness Programme

> **Template id:** `tmpl_amlr_readiness_v1`
> **Status:** ✅ seeded (Phase 2)
> **Pillar:** Work · **Category:** compliance · **Author:** ANTON

---

## What it does

End-to-end programme for an **AMLR-obliged entity** to stand up its AMLR financial-crime-prevention programme (Art. 9 internal controls, Art. 10 business-wide risk assessment). The mission walks the entity through:

1. FCP scope assessment (which AMLR domains apply)
2. Risk Atlas set-up recommendation (industry pack + domains; the person creates the Atlas)
3. Business-Wide Risk Assessment (BWRA — AMLR Article 10)
4. AMLR gap analysis (internal policies, procedures and controls — AMLR Article 9)
5. Policies and procedures generation
6. Training plan
7. Independent audit preparation

Each stage is a checkpoint so the user reviews before progression. Designed for a 30–90 day stand-up window.

## Who it's for

The full set of AMLR-obliged entities under EU Regulation 2024/1624:

- Credit institutions (banks)
- Crypto-asset service providers (CASPs)
- Payment institutions, e-money institutions
- Real-estate agents, notaries, lawyers (when handling client funds)
- Accountants, tax advisors, TCSPs
- Dealers in high-value goods
- Gambling operators
- Crowdfunding service providers

Each entity gets its sector-specific industry pack from the Risk Atlas pack catalogue (`data/risk-atlas/packs/`) — `fcp-bank`, `fcp-casp`, `fcp-payment-institution`, `fcp-crowdfunding`, `fcp-dealer-high-value-goods`, etc.

## The workflow

The full task graph spans ~10 named tasks, each with explicit checkpoints. Truncated overview:

| Stage | Task family | Checkpoint? |
|---|---|---|
| 1 — Scope | Determine which FCP domains are obliged for this entity (`fcp-scope-assessor` module) | yes |
| 2 — Atlas | Recommend the Risk Atlas set-up (industry pack, domains); the person creates the Atlas at the checkpoint | yes |
| 3 — BWRA | Run the Business-Wide Risk Assessment; review residual scores per threat path | yes |
| 4 — Gap analysis | AMLR internal-controls requirements (Art. 9) compared against current controls; surface gaps | yes |
| 5 — Policies | Generate policies + procedures from gap analysis (covers customer DD, transaction monitoring, screening, training, governance, etc.) | yes |
| 6 — Training plan | Role-based training matrix derived from organisation profile | yes |
| 7 — Audit prep | Produce independent-audit evidence pack + interview prep | yes |

Total estimated active time: substantial. Total elapsed: 6–12 weeks (driven by checkpoint cadence).

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **Entity profile** | yes | Type (bank / CASP / etc.), jurisdiction, products, customer segments |
| **Organisation size** | yes | Headcount range — affects training scope + governance recommendations |
| **Existing programme** | no | If migrating from an existing AMLR programme, paste the current policy URL or upload — informs gap analysis |
| **Target go-live** | yes | Sets the cadence of checkpoints |

The mission consumes a **Service Pack** with credentials for any external systems referenced (e.g. Roaring entity data, Dow Jones screening). See [`service-packs.md`](../service-packs.md).

## Outputs delivered

A bundled Evidence Pack (`.anton evidence-pack` bundle) containing:

- FCP scope statement
- Risk Atlas board pack (DOCX) + per-threat-path PDFs
- Business-Wide Risk Assessment + supporting evidence
- AMLR gap analysis with remediation register
- Policies + procedures (DOCX, ready for board approval)
- Training plan (XLSX)
- Independent-audit evidence bundle

Each artefact carries the instance Ed25519 signature so external auditors can verify provenance. See [`/docs/marketing/risk-atlas.md`](../../marketing/risk-atlas.md) for the underlying Atlas methodology.

## Trust-phase compatibility

| Orchestrator phase | Behaviour |
|---|---|
| Observer | Mission cannot start (Observer is read-only) |
| Guided | Each task gated by user confirm; checkpoints add additional review |
| Supervised | Low-risk tasks (Stage 1, 2 reads) auto-execute; medium-risk (Stages 3–6 generation) gated by user confirm |
| Autonomous | Stages 1–6 auto-execute; Stage 7 (audit pack signing) always requires explicit user confirm (high-risk per `action-risk-registry`) |

Per `applyOrchestratorAction()` in `server/services/orchestrator-gate.ts`, anything that **publishes** an evidence pack or **signs** a deliverable is permanently `tier='high'` regardless of phase. The user always has final say.

## Budget

Variable per template instance. Default autonomy is `check_in`. Token budget is set per stage; see `server/services/missions/seed-templates.ts:115+` for the full template body.

## Cross-pillar integration

This is the canonical example of a Mission spanning multiple pillars:

- **Work modules** each step runs as (`module_id`): `fcp-scope-assessor`, `business-wide-risk-assessment`, `gap-analysis`, `document-creation`, `training-content`
- **Risk Atlas pillar** — the mission recommends the set-up; the person creates and maintains the Atlas, and its board pack can feed the BWRA
- **Evidence Pack** built and signed via the existing `evidence-pack-builder`
- **Grow bridge** writes mission progress into `grow_signals` so business-development sees the engagement status

It's the strongest demonstration of how Missions compose across the platform.

## Where to look

- **Code:** `server/services/missions/seed-templates.ts:115+`
- **Catalog UI:** `/missions/create` → select "AMLR Readiness Programme"
- **Underlying methodology:** [`/docs/marketing/risk-atlas.md`](../../marketing/risk-atlas.md)
- **Architecture:** [`/docs/architecture/24-workflow-engine.md`](../../architecture/24-workflow-engine.md), [`/docs/architecture/21-orchestrator-trust-phases.md`](../../architecture/21-orchestrator-trust-phases.md)
