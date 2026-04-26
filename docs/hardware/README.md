# Hardware

> ANTON's Tier-5 Coding Area extension — AI-led firmware + electronics + regulated hardware + field deployments. Long-running 60–80 week build (foundation laid 2026-04-18). Same primitives as software (workflow + signed trails + audit), translated to embedded systems + supply chain + regional sourcing.

---

## Quick map

| If you want to… | Read |
|---|---|
| Strategic positioning | [`/docs/marketing/tier5-hardware-build.md`](../marketing/tier5-hardware-build.md) |
| Humanitarian / NGO deployment story | [`/docs/marketing/humanitarian-deployment-kit.md`](../marketing/humanitarian-deployment-kit.md) |
| Roadmap | `docs/HARDWARE_BUILD_ROADMAP.md` (existing) |
| Coding Area context | [`/docs/architecture/25-coding-area.md`](../architecture/25-coding-area.md) |
| Extending Hardware | [`extending.md`](extending.md) |

---

## Page surface (9 pages)

| Page | Audience | Purpose |
|---|---|---|
| `HardwareBuildPage` | builders | Tier-5 landing — projects + diagnostics + maintenance |
| `HardwareKnowledgePacksPage` | builders | HKP catalogue (per-MCU, per-region) |
| `HardwareProjectPage` | builders | Per-project workspace (phases, BoM, firmware, signoffs) |
| `HardwareDiagnosePage` | field engineers | Symptom → diagnosis chain; case library |
| `HardwareMaintainPage` | fleet operators | Patches + lifecycle events |
| `HardwareRegulatoryPage` | compliance | Certifications + signoff artefacts |
| `HardwareHumanitarianPage` | NGO / field deployment | Humanitarian deployment kits |
| `HardwareTemplatesPage` | builders | Reusable hardware-template instantiation |
| `HardwareReviewQueuePage` | community | Community review of HKPs / templates / projects |

---

## Schema (12 dedicated migrations, 24 tables)

| Migration | Tables |
|---|---|
| 133 (foundation) | `hardware_knowledge_packs`, `hkp_components`, `hkp_claims` |
| 134 + 137 + 143 (ESP32 seeds) | `diagnostic_cases` rows |
| 135 + 141 (ESP32 HKP + regional sourcing) | `hkp_*` enrichment |
| 136 (projects) | `hardware_projects`, `hardware_project_phases` |
| 138 (maintain) | `hw_fleet_devices`, `hw_patch_plans`, `hw_patch_stages`, `hw_patch_rollouts`, `lifecycle_events`, `lifecycle_event_project_impacts` |
| 139 (regulatory) | `hw_regulatory_artefacts`, `hw_regulatory_signoffs` |
| 140 (humanitarian) | `hw_humanitarian_deployments` |
| 142 (templates review) | `hw_template_instantiations`, `hw_capacity_transfer_artefacts`, `hw_capacity_transfer_signoffs`, `hw_community_review_queue` |
| 144 (hardening) | Quality + signoff hardening |

---

## Hardware Knowledge Packs (HKPs)

A pack of components + claims + regional alternatives. ANTON ships ESP32-WROOM-32E HKP as the seed (mig 135), with regional sourcing data (mig 141) for global deployments. Add new HKPs by registering a `.anton hardware-knowledge-pack` bundle (#34).

---

## Diagnostic case library

Every diagnostic case is a row in `diagnostic_cases` (mig 134, 137) with symptoms → outcomes → cross-references. Pattern-detection runs across the library to surface emerging field issues before they become recalls.

Seeded with 30 ESP32 cases (mig 134 + 137) covering ADC/Wi-Fi conflicts, brownouts, OTA failures, PSRAM crashes, counterfeit modules, web-server memory exhaustion, and more.

---

## Hardware-specific bundle types (7)

Per [`/docs/anton-format/`](../anton-format/):

| Bundle | Purpose |
|---|---|
| `hardware-knowledge-pack` (#34) | HKP catalogue entry |
| `hardware-template` (#35) | Reusable hardware-template definition |
| `hardware-project` (#36) | Per-project workspace export |
| `humanitarian-deployment-kit` (#37) | Field-deployment kit (HW + ANTON + curricula) |
| `diagnostic-case-bundle` (#38) | Diagnostic case library export |
| `patch-bundle` (#39) | Firmware patch + rollout plan (always signed) |
| `lifecycle-advisory-bundle` (#40) | Lifecycle event + impact assessment |

---

## Where to start

- **Try it:** `/hardware/build` (landing) · `/hardware/knowledge-packs` (HKP catalogue)
- **Code:** `server/services/hkp-service.ts` + Hardware-specific routes/services
- **Marketing:** [`/docs/marketing/tier5-hardware-build.md`](../marketing/tier5-hardware-build.md), [`/docs/marketing/humanitarian-deployment-kit.md`](../marketing/humanitarian-deployment-kit.md)
- **Roadmap:** `docs/HARDWARE_BUILD_ROADMAP.md` (existing pre-Phase-2 doc)
- **Architecture:** [`/docs/architecture/25-coding-area.md`](../architecture/25-coding-area.md) (Tier-5 placement)
- **Extending:** [`extending.md`](extending.md)

---

*Refresh when a new MCU family HKP ships, when humanitarian deployment story matures, or when bundle types are added beyond the current 7.*
