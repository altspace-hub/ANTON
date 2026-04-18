# Hardware Build — Roadmap & Dependency Map

**Source spec:** `ANTON_Hardware_Build_Spec_v4.md` (1,490 lines).
**Started:** 2026-04-18
**Owner:** Daniel + Claude Code (collaborative build)

This document turns the v4 spec into a concrete, sprint-by-sprint plan
with explicit dependencies (existing infra · external deps · vendor
content · expert input). It exists so future sessions can pick up
exactly where the previous one left off without re-reading the full spec.

---

## 0. Strategy

**Why we're building this:** ESP32 hardware build inside ANTON, ground-up.
Three paths × three tiers × three knowledge layers, designed to extend to
Arduino / Raspberry Pi / STM32 / nRF52 / RP2040 later via the same
patterns. Humanitarian-deployment kit is launch-included (West Africa +
EU regions).

**The honest scope:** ~60-80 engineer-weeks for ESP32 launch per the v4
estimate. This is the same magnitude as the entire Markets pillar.

**Our approach:** build incrementally in sprints, validate each layer
with a real user before committing to the next. Foundation first
(this session), then a thin testable v0 (4-6 weeks), then full v4 in
the order Section 12 of the spec lays out.

---

## 1. The three orthogonal axes

Every capability lives at the intersection of these three:

```
PATH    × TIER          × KNOWLEDGE LAYER
Diagnose × 1 Personal    × Specification (SheetsData MCP + own)
Maintain × 2 Professional × Diagnostic (community-contributed)
Develop  × 3 Market       × Lifecycle (CVE + EOL + regulatory feeds)
```

When a new feature is proposed, locate it on these axes first. If it
doesn't fit any of the 9 path × tier combinations, it probably belongs
elsewhere in ANTON.

---

## 2. What we already have to plug into

| Spec assumes | Where it lives | Status |
|---|---|---|
| `server/areas/coding/` | `server/areas/coding/{area.json,area-context.md,modules/}` | ✓ exists |
| `anton-bundler.ts` 17+ bundle types | `server/services/anton-bundler.ts` (already 35+ types) | ✓ adding 7 more is mechanical |
| `prompt-builder.ts` Layer 6 | `server/services/prompt-builder.ts` | ✓ exists; HKP attaches here |
| Cross-area expert injection | Existing area registry + persona system | ✓ Cybersecurity, Software Engineering, Data & Analytics already injectable |
| Regulatory Radar | `server/services/regulatory-radar.ts` | ✓ extending to feed lifecycle layer |
| Ollama for offline | `server/services/unified-llm-client.ts` | ✓ exists |
| Missions / Service Packs / Reasoning Trails / Quality Ratchet / Apprentice / AAP / MCP | scattered across services | ✓ all in place |
| `ANTON i18n` | platform-level | ✓ exists |

## 3. What's missing (what we're building)

| Component | Status | Work estimate |
|---|---|---|
| `server/hardware/` directory + family registry | **NEW** | 2-3 days for skeleton |
| `server/hardware/families/esp32/` content | **NEW** | 3-5 weeks for full ESP32 content |
| `server/hardware/paths/{diagnose,maintain,develop}/` | **NEW** | 6-10 weeks each path |
| `server/areas/hardware-engineering/` | **NEW** | 1-2 weeks scaffold + 4-6 weeks content |
| 9 new DB tables (HKP × 4, diagnostic × 3, lifecycle × 2) | **NEW** | 1 day migration |
| 7 new bundle types in anton-bundler | **NEW** | 1 day registration + handlers |
| External tool adapters (PlatformIO, Wokwi, Renode, Clang-tidy, CycloneDX, CVE scanner, security scorecard) | **NEW** | 2-4 weeks each adapter |
| SheetsData MCP integration | **NEW** | 1-2 weeks (depends on SheetsData MCP availability) |
| Photo-based ESP32 variant identification | **NEW** | 2-3 weeks (vision model + reference dataset) |
| Tier 3 regulatory artefact generators | **NEW** | 4-6 weeks (CRA + RED + MDR + DoC + VDP + hazard analysis) |
| 30-50 seeded ESP32 diagnostic cases | **NEW · CONTENT** | 2-3 weeks of expert curation |
| Regional HKP content (West Africa, EU) | **NEW · CONTENT** | needs regional contributors |
| Capacity-transfer artefact templates | **NEW · CONTENT** | 1-2 weeks per language |

---

## 4. External dependencies

These are tools or services we need but don't own:

### Tooling (CLIs / libraries)

| Tool | Purpose | Integration | Install |
|---|---|---|---|
| **PlatformIO** | Build system for ESP32 firmware | Subprocess CLI via `platformio-adapter.ts` | Python pip · cross-platform |
| **Wokwi** | Primary ESP32 simulation | Web API or local CLI · `wokwi-adapter.ts` | Has free + paid tiers; needs API key |
| **Renode** | Advanced sim (deferred to post-launch) | CLI subprocess · `renode-adapter.ts` | Mono-based; complex install |
| **Clang-tidy** | C/C++ static analysis | CLI subprocess · `clang-tidy-adapter.ts` | LLVM toolchain |
| **Cppcheck** | Alternative C/C++ static analysis | CLI subprocess (fallback) | Standalone binary |
| **CycloneDX** | SBOM generation | Node lib `@cyclonedx/cyclonedx-library` + hardware extensions | npm |
| **CVE scanner** | Match SBOM components → known CVEs | Custom; reads from lifecycle layer | n/a |

### Data feeds

| Feed | Purpose | Cost | Notes |
|---|---|---|---|
| **NVD (National Vulnerability Database)** | CVE feed | Free · NIST | JSON API, polling 1×/day |
| **GitHub Security Advisories (GHSA)** | Library CVEs | Free · GitHub API | Polling 1×/day |
| **Espressif security advisories** | ESP32-specific | Free · vendor RSS | Polling 1×/day |
| **SheetsData MCP** | Specification layer for parts | Commercial · TBD pricing | Need to confirm availability + access |
| **NIST CPSC / EU RAPEX** | Recall feeds | Free · government | Polling 1×/week |
| **CISA KEV catalogue** | Known-exploited vulnerabilities | Free | Polling 1×/day |

### Vendor / expert input needed

| Need | Who | When |
|---|---|---|
| 30-50 seeded ESP32 diagnostic cases | Hardware expert (Daniel? hardware contributor? bounty?) | Before Phase 5 (Diagnose path) |
| Regional sourcing alternatives — West Africa | Regional contributor | Before humanitarian kit ships |
| Regional sourcing alternatives — EU | Regional contributor / Daniel | Before humanitarian kit ships |
| Regulatory artefact templates review | Compliance lawyer (CRA, RED, MDR) | Before Tier 3 ships |
| Capacity-transfer template review | Humanitarian-tech operator | Before humanitarian kit ships |

---

## 5. Implementation phases — concrete sprints

The spec's Section 12 lists 10 phases over 60-66 weeks. Here's the same
plan with our session-by-session checkpoints:

### Phase 1 — Foundation (this sprint)

**Status: in progress.** Goal — lay the architectural concrete so every
later sprint builds on stable foundations.

Deliverables this sprint:
- [x] Roadmap doc (this file)
- [ ] Migration 133 — 9 foundation tables
- [ ] `server/hardware/family-registry.ts` + interface + family directories
- [ ] `server/areas/hardware-engineering/` scaffold
- [ ] 7 new bundle types registered in anton-bundler
- [ ] Memory entry pointing to this roadmap

Validation: typecheck clean · migration applies cleanly · ESP32 family
entry queryable via family registry.

### Phase 2 — Three-layer knowledge base wiring (~2 weeks)

- HKP CRUD service (`server/services/hkp-service.ts`)
- HKP browser/library page (`src/pages/HardwareKnowledgePacks.tsx`)
- Prompt-builder Layer 6 extension for path-aware HKP attachment
- First seed HKP (ESP32-WROOM-32E) — full three layers, hand-curated
- NVD + GHSA feed ingestors
- Espressif advisory feed ingestor

Validation: HKP renders · ingestor pulls 1 day of CVEs · prompt builder
includes HKP context when ESP32 is in scope.

### Phase 3 — Hardware Engineering area content (~2-3 weeks)

- 9 personas (embedded systems engineer, electronics engineer, etc.)
- 19 skills
- ~30 modules tagged with applicable paths
- Cross-area injection rules wired

Validation: a chat session with "I'm working on an ESP32 project" surfaces
hardware-engineering personas in the persona picker.

### Phase 4 — Phase 0 Classification + Tier 1 Develop path (~6 weeks)

- `HardwareBuildPage.tsx` with non-skippable Phase 0 classification
- 6-phase Develop workflow for Tier 1 ESP32
- Mandatory firmware quality pipeline:
  - PlatformIO adapter
  - Clang-tidy adapter
  - CycloneDX SBOM generator
  - CVE scanner
  - Wokwi simulation adapter
  - Security scorecard
- Quality scoring for Develop path

**v0 milestone — first user testing.** A user with an ESP32 + breadboard
can complete a Tier 1 personal-tinkering project end-to-end. Validate
demand here before continuing to Phase 5.

### Phase 5 — Diagnose path (~6 weeks)

- 5-phase Diagnose workflow
- `diagnostic-case-bundle` bundle type handlers
- Diagnostic case contribution flow at resolution
- Outcome tracking
- Voice-first symptom capture (i18n)
- Photo-based ESP32 variant identification (vision model)
- Quality scoring for Diagnose
- 30-50 seeded diagnostic cases

Validation: a user with a malfunctioning ESP32 can diagnose conversationally,
apply a resolution, contribute the case to the community layer.

### Phase 6 — Maintain path (~6 weeks)

- 6-phase Maintain workflow
- `patch-bundle` + `lifecycle-advisory-bundle` handlers
- CVE applicability assessment against projects
- Patch planning with rollback + verification
- `fleet-change-coordinator` with Missions + AAP store-and-forward
- OTA chain enforcement for Tier 3 connected devices
- Quality scoring for Maintain

Validation: apply security patch to deployed ESP32 with full audit trail.

### Phase 7 — Tier 2 + Tier 3 + regulatory artefacts (~5 weeks)

- Tier 2 gating (data protection assessment, workplace safety checklist)
- Tier 3 gating (full regulatory package)
- CRA technical file outline generator
- Declaration of conformity template
- Vulnerability disclosure policy generator
- Medical device classification advisory
- Hazard analysis template
- RED compliance declaration
- `hardware-project` bundle schema 2.0 with regulatory section

Validation: a Tier 3 ESP32 build completes with a CRA-compliant artefact pack.

### Phase 8 — Humanitarian kit + legacy hardware workflow (~6 weeks)

- `humanitarian-deployment-kit` bundle handlers
- Capacity-transfer artefact generators
- West Africa + EU regional content
- AAP fleet telemetry sync
- Photo-based legacy hardware identification
- `extend-existing-device-workflow`

Validation: an ESP32 deployment in West Africa can be designed, deployed,
sustained, and handed off in local language with capacity-transfer docs.

### Phase 9 — Templates, community contribution, polish (~6 weeks)

- `hardware-template` bundle handlers
- 5-10 initial ESP32 templates
- Community HKP submission flow with mandatory security review
- Diagnostic case contribution vetting
- "Modify and share back" flow
- Documentation completion

### Phase 10 — Launch validation (~6 weeks)

- Internal: Daniel completes each path end-to-end
- External: at least one enterprise user (Advisense or similar) completes
  a Tier 2 Develop project (e.g., MLRO Desk Dashboard)
- Polish + bug fixes
- Launch

---

## 6. Validation milestones (don't skip these)

| When | Milestone | Why |
|---|---|---|
| End of Phase 1 | Migration applies, family registry queryable | Catch architecture issues before they're costly |
| End of Phase 2 | First HKP renders, prompt-builder enriches with it | Validates the data-flow shape |
| End of Phase 4 | A real user completes a Tier 1 ESP32 project end-to-end | **v0 milestone — go/no-go** for the rest |
| End of Phase 5 | Real user diagnoses a real broken ESP32 | Validates the conversational shape works |
| End of Phase 7 | Compliance lawyer reviews Tier 3 artefacts | Before Tier 3 hits any real user |
| End of Phase 8 | Humanitarian-tech operator validates capacity-transfer flow | Before kit goes to West Africa |
| End of Phase 10 | Launch | Daniel + Advisense user validation |

---

## 7. Open questions to resolve as we go

1. **SheetsData MCP — does it exist? what does access cost?** **Decided 2026-04-18: ANTON-curated for ESP32 launch (3 HKPs only — manageable, no external dep, total control over claim classifications + environmental profiles + regional sourcing + counterfeit flags). Architecture stays hybrid-capable via the `primary_source` enum + abstraction layer so SheetsData can plug in transparently when we expand to a second hardware family (Raspberry Pi or Arduino), where curation cost matters more. Defer the SheetsData spend decision until we have actual usage data + family-#2 sizing.**
2. **Wokwi — free tier limits?** If their API has rate limits or per-sim cost, factor into pricing.
3. **Vision model for photo-based ESP32 variant identification** — Claude vision via Anthropic? Or a smaller specialised model? Reference dataset needs sourcing.
4. **Who curates the 30-50 seed diagnostic cases?** Daniel + a hardware contributor; or commission via bounty.
5. **Regulatory artefact review pipeline.** Templates need lawyer review before Tier 3 hits real users. Who, when, how much.
6. **AAP store-and-forward for fleet rollout** — does the existing AAP support this pattern, or does it need extension?
7. **Hardware project location on disk** — spec says `~/hardware/`. Same convention as existing project locations? Or new top-level?

---

## 8. Non-negotiables (Section 13 of the spec — keep handy)

- Phase 0 classification is non-skippable
- Firmware never ships without the quality pipeline passing
- Connected-device firmware requires secure-update chain (unless Tier 1 ack)
- Medical-adjacent requires hazard analysis + tamper-evident logging
- Tier 3 requires full regulatory artefact package
- AI-unverified HKP claims in critical firmware paths get explicit warnings
- Community HKP content requires signature verification + security scan
- ANTON does NOT claim regulatory certification (templates only)
- Safety-critical applications: expert review never bypassed
- User agency: every commit user-approved
- Every path operation: signed Reasoning Trail
- Never hardcode to ESP32 — every abstraction takes `hardware_family`
- Never block on internet (offline-first)
- Never ship user-facing content in only one language
- Never apply a Maintain patch that fails verification
- Never submit a diagnostic case without explicit user consent
- Humanitarian Tier 3: never ship without local-language capacity-transfer artefacts

---

## 9. Where to look in the codebase

| Looking for | Path |
|---|---|
| Coding area (where Hardware Build attaches as Tier 5) | `server/areas/coding/` + `src/pages/CodingLandingPage.tsx` |
| Bundle infrastructure | `server/services/anton-bundler.ts` |
| Prompt builder Layer 6 (where HKP attaches) | `server/services/prompt-builder.ts` |
| Existing area pattern reference | `server/areas/fcp/`, `server/areas/cyber/` |
| Existing migrations directory | `server/db/migrations-pg/` |
| Existing radar (extends to lifecycle layer) | `server/services/regulatory-radar.ts` |
| Existing Mission lifecycle | `server/services/orchestrator-engine.ts` (TODO confirm path) |

---

## 10. Sprint progress log

This is the running log of what's done vs in-progress vs blocked.
Append a row each session.

| Date | Phase | What landed | Notes |
|---|---|---|---|
| 2026-04-18 | 1 — Foundation | Roadmap doc · 9-table migration · family registry skeleton · 7 bundle types · hardware-engineering area scaffold · memory entry | Foundation laid; ready for Phase 2 next session |
| 2026-04-18 | 1 — Foundation | Migration 134 · 10 hand-curated ESP32 diagnostic seed cases + 4 cross-references | Covers ADC2/Wi-Fi, brownout, SPIFFS wear, deep-sleep wake, I2C hang, PSRAM crash, counterfeits, OTA boot loop, web-server OOM, 60s Wi-Fi disconnect cycle |
| 2026-04-18 | 2 — Three-layer wiring | hkp-service.ts (CRUD) · routes/hardware.ts (REST + manual ingest) · migration 135 (ESP32-WROOM-32E HKP, 51 claims, 14 components, 9 regional alts, all diagnostic cases linked) · prompt-builder Layer 6 buildHardwareHkpLayer · lifecycle-feed-ingestor.ts (NVD + GHSA + repo-scoped Espressif advisories — Espressif RSS retired so we use github.com/espressif/esp-idf security-advisories) · HardwareKnowledgePacksPage.tsx browser at /hardware/knowledge-packs | Smoke-tested live: NVD chunked into 120-day windows, 11 CVEs + 14 vendor advisories ingested. Layer 6 renders correctly with path-aware ordering. Phase 2 complete; ready for Phase 3 (area content). |
| 2026-04-18 | 3 — Area content (partial) | 9 hardware personas in `server/personas/` (embedded-systems-engineer, electronics-engineer, industrial-designer, reliability-engineer, safety-engineer, clinical-safety-officer, field-technician, humanitarian-tech-operator, quality-engineer) · 10 path-tagged modules in `server/areas/hardware-engineering/modules/` (hw-classifier · 3 diagnose · 2 maintain · 3 develop · 1 humanitarian cross-cutting) · `src/lib/area-patches/hardware-patch.ts` registers them in `MODULES` · `AREAS` entry added · DPO + legal-expert applicableAreas extended to include hardware-engineering · area-context.md cross-area injection table refreshed | Phase 3 ships 10 of the planned ~30 modules. Remaining 20 modules will land incrementally in Phases 4-9 as paths get full workflow scaffolding. Cross-area injection is descriptive (`applicableAreas` metadata) not yet auto-enforced — Phase 4+ will turn it into an active filter. Smoke-tested: 11 personas + all 10 modules + AREAS entry resolve cleanly at runtime. Ready for Phase 4 (Phase 0 classification UI + Tier 1 Develop path with quality pipeline). |
| 2026-04-18 | 4 — Phase 0 UI + Tier 1 Develop scaffold + quality pipeline | Migration 136 (5 tables: hardware_projects + hardware_project_phases + hw_quality_runs + hw_quality_results + hw_quality_scores) · `hardware-project-service.ts` (owner-bound CRUD, locked invariant: develop.firmware completion requires non-block quality_score_id; deploy_operate Tier 3 requires secure_update_chain) · `quality-pipeline-service.ts` (QualityAdapter contract + 6 adapters: 5 mock + 1 real CVE-scan querying lifecycle_events; deterministic scoring with `block` verdict on any mandatory gate fail) · routes for projects + phases + quality (mounted under /api/hardware) · `HardwareBuildPage.tsx` at `/hardware` (project list + 4-step Phase 0 wizard) · `HardwareProjectPage.tsx` at `/hardware/projects/:id` (phase stepper + quality pipeline panel + run history) | v0 milestone slice. Live-tested: Tier 1 + Tier 3 ESP32 projects created end-to-end; pipeline produced verdicts using real CVE data from Phase 2 ingest; phase invariant correctly rejected firmware completion without quality_score_id. **Mock vs real:** PlatformIO/Clang-tidy/CycloneDX/Wokwi/Security-scorecard adapters are mocks producing realistic-looking output marked `adapter_kind:'mock'` in DB. Real adapters drop in via the same QualityAdapter contract in subsequent sprints (require platformio + ESP32 toolchain installed; Wokwi API key; etc.). Ready for Phase 5 (Diagnose path UI) and continued real-adapter substitution. |
| 2026-04-18 | 5 — Diagnose path UI + voice + photo + contribution | Migration 137 (20 more curated ESP32 cases bringing total to 30 + 8 more cross-references) · `diagnose-service.ts` (heuristic symptom matcher: token-overlap against title + symptom strings, boosts authoritative + same-HKP; outcome logging with consent; contribution flow tagging contributor + setting authoritative=false until reviewed) · `photo-id-service.ts` (Claude vision real-call wrapper; deterministic JSON parsing; falls back to moderate-risk + clear rationale on parse error rather than fabricating) · routes: /diagnose/match, /diagnose/outcomes, GET /diagnostic-cases/:id/outcomes, POST /diagnostic-cases (contribution), POST /identify-photo (multipart, max 4 photos × 8 MB) · `VoiceSymptomCapture.tsx` (Web Speech API with text fallback; ISO 639-1 → BCP 47 mapping for 30 languages) · `PhotoModuleId.tsx` (camera capture + reused on desktop file picker) · `HardwareDiagnosePage.tsx` at `/hardware/projects/:id/diagnose` — 5-phase stepper (Symptom → Hypothesis → Measurement → Resolution → Contribution) with Reasoning Trail sidebar; auto-redirect from project page when path=diagnose. | Live-tested matcher against 6 free-text symptom prompts; top match was correct in every case (e.g., "BLE pairing works first time but after reboot the phone cannot reconnect" → `esp32-ble-pairing-fails-after-power-cycle` at 97/100). Photo-id is a real Claude vision call (sonnet 4.6 default; opus 4.7 selectable); JSON-strict parsing with safe fallback. Contribution flow writes back to diagnostic_cases as authoritative=false signed by contributor. Ready for Phase 6 (Maintain path UI). |
| 2026-04-18 | 6 — Maintain path UI + patch plans + fleet rollout + CVE applicability | Migration 138 (4 hw_* tables: hw_patch_plans + hw_patch_stages + hw_fleet_devices + hw_patch_rollouts) · `maintain-service.ts` (owner-bound patch plan CRUD; locked invariants: rollback_artefact_ref required for stage start, Tier 3 connected-device patches require signed_image+verified_boot+rollback_protected, fleets >5 devices require canary-passed before wave); deterministic acceptance evaluator with 6 operators incl. `within`; cohort resolution from {device_ids|percentage|all}) · `cve-applicability-service.ts` (per-project CVE filter using project.metadata.posture: ESP-IDF version, enabled components, exposed surfaces; 12 feature/surface keyword inferences; conservative — applicable when in doubt) · `quality-pipeline-service.ts` extended with `rollback-artefact` real adapter (mandatory for path=maintain only; checks every active patch plan's rollback ref + Tier 3 secure-update chain) · routes for plans / stages / fleet / rollouts / cve-applicability · `HardwareMaintainPage.tsx` at `/hardware/projects/:id/maintain` — CVE banner with applicable-vs-not-applicable counts, plan editor with rollback-artefact field + Tier 3 secure-update toggles, stage cards with quantitative acceptance entry + plan-rollout button, fleet panel + add-device modal, audit trail viewer; auto-redirect from project page when path=maintain. | Live-tested end-to-end on Tier 2 ESP32 fleet of 8 devices: CVE applicability flagged 19 of 25 events as applicable (1 correctly excluded as not-applicable-exposure for wifi_softap), rollback-artefact gate transitioned skip→fail→pass as plan progressed, canary-before-wave invariant correctly rejected wave-start until canary passed. Aap-store-and-forward delivery channel reserved but not yet wired to actual Companion App AAP infrastructure (Phase 7+ track). |
| 2026-04-18 | 7 — Tier 2 + Tier 3 regulatory artefact pack | Migration 139 (hw_regulatory_artefacts + hw_regulatory_signoffs append-only audit) · `regulatory-pack-service.ts` (8 deterministic markdown generators: cra-tech-file, doc, vdp, hazard-analysis, red-declaration, mdr-classification, dpa, workplace-safety; each populated from project + HKP + posture context; honest-skeleton output with `[…]` placeholders + inline lawyer-review notes; sign-off requires ≥30-char operator attestation; content-hash audit trail; regenerate preserves history) · 7th quality adapter `regulatory-pack-complete` (real, mandatory, applies only to develop+tier≥2; pass when all required artefacts signed, warn when reviewed-but-unsigned, fail when missing) · `hardware-project-service.ts` extended invariant: develop.deploy_operate completion on Tier 2/3 requires regulatory pack signed + (Tier 3 only) secure_update_chain · routes: GET/POST `/projects/:id/regulatory-artefacts`, GET/PUT `/regulatory-artefacts/:id`, POST `/regulatory-artefacts/:id/{signoff,withdraw}`, GET `/projects/:id/regulatory-pack-status` · `HardwareRegulatoryPage.tsx` at `/hardware/projects/:id/regulatory[/:kind]` — required-artefact list with status badges + per-card generate/regenerate; in-place markdown editor with sign-off form (attestation textarea); withdraw + audit-trail viewer · regulatory pack summary panel added to `HardwareProjectPage` for Tier 2/3 develop projects with one-click open. | Live-tested on Tier 3 medical-adjacent ESP32: registry returned 8 required artefacts (incl. mdr-classification + red-declaration + hazard-analysis triggered by flags); generation produced 2.5-4.7 KB skeletons with placeholders; gate transitioned fail (8/8 missing) → warn (8 generated, 0 signed) → pass (8 signed). deploy_operate completion correctly rejected without secure_update_chain even after pack signed; succeeded once both signed + chain set. **Honest scope:** ANTON generates skeletons, NOT certified compliance documents. Generators use deterministic markdown templating; an LLM-augmented section refresher (per artefact) is a Phase 7+ enhancement. |
| 2026-04-18 | 8 — Humanitarian deployment kit + capacity-transfer artefacts | Migration 140 (hw_humanitarian_deployments + hw_capacity_transfer_artefacts + hw_capacity_transfer_signoffs append-only audit) · Migration 141 (10 more West Africa + EU regional sourcing alternatives with NGN / GHS / XOF / EUR pricing + counterfeit-risk grading) · `humanitarian-service.ts` (deployment record CRUD with named local partner + OCHA cluster + donor exit timeline + power/internet posture; 6 capacity-transfer artefact generators — installation-guide, operator-checklist, troubleshooting-flowchart, spares-procedure, escalation, decommissioning — each builds a deterministic-structure prompt and asks Claude sonnet 4.6 to produce the artefact in the project's working_language; falls back to English skeleton with explicit `[TRANSLATE TO …]` markers if API key unavailable; sign-off refuses if those markers remain) · `bundleHumanitarianDeploymentKit()` in anton-bundler.ts (zip with manifest.json + project.json + hkp/ + sourcing/regional-alternatives.json + sourcing/diagnostic-cases.md + regulatory/*.md + capacity-transfer/*.md + README.md; refuses to ship with unsigned capacity-transfer artefacts unless `allow_unsigned=true` for draft kits) · routes: deployment GET/POST · capacity-transfer artefacts GET/POST/PUT/sign-off/withdraw · GET `/projects/:id/humanitarian-bundle` returning zip stream · `HardwareHumanitarianPage.tsx` at `/hardware/projects/:id/humanitarian` — deployment record card + edit modal, 6 capacity-transfer artefact cards mirroring regulatory page, fallback-skeleton warning banner, two download buttons (signed vs draft kit) · humanitarian shortcut added to `HardwareProjectPage` (always visible). | Live-tested on Tier 3 medical-adjacent ESP32 cold-chain monitor in Sahel pilot: deployment record created with named partner + OCHA health cluster + donor exit date + 12 units; capacity-transfer fallback path correctly engaged when API unavailable, with explicit `english-skeleton-fallback` tag + `[TRANSLATE TO EN]` markers; bundler correctly refused to ship with unsigned artefact; draft kit (`allow_unsigned=true`) produced 19.5 KB zip with manifest + sourcing + diagnostic-cases reference. **Honest scope:** AAP store-and-forward delivery channel still reserved (Phase 1 anton-bundler registration), wired in maintain rollouts (Phase 6) but not yet plumbed to the actual Companion App AAP infrastructure — that lands in Phase 9. `extend-existing-device-workflow` deferred to Phase 9. |
| 2026-04-18 | 9 — Templates + community contribution + AAP wiring + extend-existing-device | Migration 142 (hw_templates + hw_community_review_queue + hw_template_instantiations) · Migration 143 (6 seed ESP32 templates: wifi-sensor-mqtt, ble-battery-monitor, esp32-cam-http-streamer, deep-sleep-lora, secure-ota-day-one, ws2812-controller — each with project_blueprint, phase_seed_data, recommended quality gates, starter system prompt) · `template-service.ts` (CRUD; `instantiate()` creates a new project pre-populated with all Phase 0/1 fields + seeded phase data + audit + installs counter; `captureFromProject()` forks a working project to community template) · `review-queue-service.ts` (single queue for hkp / diagnostic-case / template / patch-bundle submissions; HKP submissions require explicit security review before approval per spec §13; reject requires ≥10-char reason; approve auto-promotes the source artefact to authoritative=TRUE) · `aap-rollout-bridge.ts` (when delivery_channel='aap-store-and-forward', creates an app_checkpoint per stage on the project owner's paired phone with rollback-artefact-aware payload + severity tied to tier+safety; graceful no-op when no paired phone exists) · `extend-device-service.ts` (real Claude sonnet 4.6 call producing strict-JSON proposal: pin assignment delta, BoM delta, posture delta, firmware change summary, risk delta, recommended Maintain plan with suggested acceptance rules; defensive parsing + honest fallback when API unavailable) · `bundleHardwareTemplate()` in anton-bundler (template .anton zip with manifest + template.json + system-prompt.md + hkp/ + README.md) · routes: templates list/get/instantiate/capture/delete/bundle · review-queue list/submit/claim/security-review/approve/reject/withdraw · POST `/projects/:id/extend` (proposal) · `HardwareTemplatesPage` at `/hardware/templates` — filter by family/path/tier/authoritative, detail drawer with starter prompt + recommended gates, instantiate modal with title/region/language, .anton bundle download · `HardwareReviewQueuePage` at `/hardware/review-queue` — pending queue + my-submissions tabs, claim/approve/reject flow with HKP-security-review gate enforced, withdraw for own submissions · template + review queue links added to `HardwareBuildPage` quick-link grid. | Live-tested: 6 templates listed, instantiated wifi-sensor-mqtt → new project with phases 0-1 seeded, captured back as community template (authoritative=false), submitted to review queue + approved → promoted to authoritative=true. HKP security-review gate correctly rejected approval-without-security-review then succeeded after `recordSecurityReview()`. AAP path: rollouts created with delivery_channel='aap-store-and-forward'; bridge gracefully no-ops when no paired phone exists for the project owner (correct behaviour for dev environments without Companion App pairing). **Honest scope:** AAP delivery channel is now wired through, but uses approximate owner→paired-user matching (display_name OR id); production deployments need explicit project-owner-to-connected-user mapping. extend-device is real Claude with structured-output schema + safe fallback — works end-to-end when API key is configured. |
| 2026-04-18 | 10 — Real adapter substitution + adapter availability UI + launch documentation | All 8 quality adapters refactored from inline-mock blocks in quality-pipeline-service.ts into per-tool modules under `server/services/quality-adapters/` (one file per adapter + `_shared.ts` with `execFileP` / `detectToolVersion` / `workspacePathFor` / `pathExists` helpers) · Real subprocess invocation for: PlatformIO (`pio run` + flash/RAM parsing), Clang-tidy (cert-* + bugprone-* + cppcoreguidelines-* + clang-analyzer-security checks with finding/critical counts), CycloneDX (cyclonedx-cli + cyclonedx-py + cyclonedx-npm fallback chain, parses CycloneDX 1.5 JSON), Wokwi (wokwi-cli with WOKWI_CLI_TOKEN; cloud API mode reserved), Security-scorecard (real ESP-IDF `sdkconfig` parser checking `CONFIG_SECURE_BOOT_V2_ENABLED` + `CONFIG_SECURE_FLASH_ENC_ENABLED` + `CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK` + `CONFIG_SECURE_SIGNED_APPS_*`) · Each adapter has `detect()` returning `{ installed, version, install_hint }` + `run()` that calls `detect()` first and returns `outcome=skip` with the install hint when the tool is missing — never crashes the pipeline · `getAvailability()` runs all 8 detect() in parallel · GET `/api/hardware/quality/adapter-availability` route · `AdapterAvailabilityPanel` collapsible card on `HardwareProjectPage` quality panel showing X/8 detected + per-adapter version + install hint · `docs/HARDWARE_BUILD_USER_GUIDE.md` (end-user walkthrough for all paths + regulatory + humanitarian + templates + extending) · `docs/HARDWARE_BUILD_INTEGRATION.md` (developer guide: adding adapters, AAP wiring with example mapping table, lifecycle ingestor, review queue extensions, regulatory artefacts, capacity-transfer artefacts, env vars) · `docs/HARDWARE_BUILD_LAUNCH_CHECKLIST.md` (Phase 10 acceptance criteria with explicit go/no-go for each path + Daniel internal walkthrough + external pilot + real adapter coverage + AAP wiring + docs complete + public-launch sign-off). | Live-tested adapter detection on dev box: clang-tidy detected (LLVM-installed), other 4 tool-deps correctly reported as not installed with install hints surfaced in the UI. Pipeline run produces a coherent verdict where missing tools yield `skip` not `error`. **Honest scope on Phase 10:** I cannot run Daniel real-ESP32 walkthrough or the enterprise pilot from here — those are manual user activities. What shipped is the production-ready adapter substrate + the launch documentation. The launch checklist explicitly lists what Daniel needs to tick off before public availability. |
