# Tier 5 — Hardware Build

> **What it is:** ANTON's fifth Coding-Area tier — extending the AI-led software development model into firmware, electronics, regulated hardware, and field deployments.
> **Status:** Foundation laid 2026-04-18 (12 dedicated migrations, 9 pages, 7 hardware-specific `.anton` bundle types). Long-running 60–80 week build per `docs/HARDWARE_BUILD_ROADMAP.md`.
> **Why it matters:** Hardware is where compliance + supply-chain + regional sourcing all collide. The same primitives that make ANTON's software workflow defensible (deterministic engine + LLM rationale + signed trails) translate to embedded systems.

---

## What's in Tier 5

| Surface | Page | Purpose |
|---|---|---|
| Hardware Build landing | `HardwareBuildPage.tsx` | Tier-5 entry point — projects + diagnostics + maintenance |
| Knowledge Packs | `HardwareKnowledgePacksPage.tsx` | Per-MCU / per-region pack catalogue (HKPs) |
| Projects | `HardwareProjectPage.tsx` | Per-project workspace (phases, BoM, firmware, signoffs) |
| Diagnostics | `HardwareDiagnosePage.tsx` | Symptom → diagnosis chain; case library |
| Maintenance | `HardwareMaintainPage.tsx` | Fleet + patches + lifecycle events |
| Regulatory | `HardwareRegulatoryPage.tsx` | Certifications + signoff artefacts |
| Humanitarian | `HardwareHumanitarianPage.tsx` | NGO / refugee-context deployment kits |
| Templates | `HardwareTemplatesPage.tsx` | Reusable hardware-template instantiation |
| Review queue | `HardwareReviewQueuePage.tsx` | Community review of HKPs / templates / projects |

---

## Hardware Knowledge Packs (HKPs)

A **Hardware Knowledge Pack** is the hardware equivalent of a regulatory knowledge pack — a curated bundle of:

- **Components** with part numbers, vendors, and substitution rules.
- **Claims** with evidence URLs (datasheet pages, test results).
- **Regional alternatives** — when a part is sanction-restricted in one region or unavailable in another.

ANTON ships an ESP32-WROOM-32E HKP as the seed (mig 135), with regional sourcing data (mig 141) for global deployments. Add new HKPs by registering a `.anton hardware-knowledge-pack` bundle.

---

## Diagnostic case library

Every diagnostic case is a row in `diagnostic_cases` (mig 134, 137) with:

- **Symptoms** — what the field engineer sees.
- **Outcomes** — what the diagnosis was.
- **Cross-references** — related cases that share root causes.

Seeded with ESP32 cases. Pattern-detection runs across the case library to surface emerging field issues before they become recalls.

---

## Maintenance lifecycle

| Concern | Tables | Purpose |
|---|---|---|
| Fleet | `hw_fleet_devices` | Per-device inventory, lifecycle stage |
| Patches | `hw_patch_plans`, `hw_patch_stages`, `hw_patch_rollouts` | Staged rollout of firmware patches |
| Lifecycle | `lifecycle_events`, `lifecycle_event_project_impacts` | Cross-link lifecycle events to projects |
| Quality | `hw_quality_runs`, `hw_quality_results`, `hw_quality_scores` | Automated quality test runs |

---

## Regulatory artefacts

`hw_regulatory_artefacts` + `hw_regulatory_signoffs` carry certifications (CE, FCC, RoHS, REACH, etc.) and the signoff trail. The signoff is treated as an audit-grade decision: who, when, on what evidence.

---

## Humanitarian deployment

The humanitarian deployment story has its own one-pager (`/docs/marketing/humanitarian-deployment-kit.md`) — a `.anton humanitarian-deployment-kit` bundle ships pre-configured ANTON + Ollama + curriculum packs to field hardware, suitable for refugee / NGO contexts where connectivity is intermittent and the operating environment is harsh.

---

## Bundle types (7 hardware-specific)

| Bundle | Purpose |
|---|---|
| `hardware-knowledge-pack` | HKP catalogue entry |
| `hardware-template` | Reusable hardware-template definition |
| `hardware-project` | Per-project workspace export |
| `humanitarian-deployment-kit` | Field-deployment kit (HW + ANTON + curricula) |
| `diagnostic-case-bundle` | Diagnostic case library export |
| `patch-bundle` | Firmware patch + rollout plan |
| `lifecycle-advisory-bundle` | Lifecycle advisory + impact assessment |

All seven are listed in `BundleType` (`anton-bundler.ts`); see `/docs/anton-format/types/` for per-type details.

---

## Where to look

- **Try it:** `/hardware/build` (landing) or `/hardware/knowledge-packs` (HKP catalogue).
- **Code:** `server/services/` for `hkp-service.ts` and related handlers; `server/routes/hardware.ts`.
- **Schema:** `server/db/migrations-pg/133_hardware_build_foundation.sql` … `144_hardware_hardening.sql` (12 migrations, 24 tables).
- **Roadmap:** `docs/HARDWARE_BUILD_ROADMAP.md`.
- **Architecture:** `/docs/architecture/25-coding-area.md` (4-tier diagram includes Tier 5 as a peer surface, not a footnote).

---

*Document maintained alongside the Tier 5 surfaces. Refresh when a new hardware bundle type ships or when a new HKP becomes the canonical seed.*
