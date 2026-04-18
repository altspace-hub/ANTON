# Hardware Build — User Guide

End-to-end walkthrough for the three paths (Diagnose, Maintain, Develop)
plus the humanitarian deployment kit. Companion to `HARDWARE_BUILD_ROADMAP.md`
(implementation plan) and `HARDWARE_BUILD_INTEGRATION.md` (contract docs).

The Hardware Build pillar is **Tier 5 of the Coding area** in ANTON. Its goal:
help anyone — hobbyist to industrial — diagnose, maintain, and develop
embedded hardware. Launch family is **ESP32**; Arduino, Raspberry Pi, STM32,
nRF52, RP2040 are reserved.

---

## 1. Where everything lives

| URL | What it is |
|---|---|
| `/hardware` | Landing page — your projects + Phase 0 wizard |
| `/hardware/projects/:id` | Develop workspace (auto-redirects for diagnose/maintain) |
| `/hardware/projects/:id/diagnose` | 5-phase Diagnose workflow |
| `/hardware/projects/:id/maintain` | 6-phase Maintain workflow with patch plans + fleet |
| `/hardware/projects/:id/regulatory` | Tier 2/3 regulatory artefact pack |
| `/hardware/projects/:id/humanitarian` | Humanitarian deployment + capacity-transfer |
| `/hardware/knowledge-packs` | Browse + manage HKPs (the three-layer reference) |
| `/hardware/templates` | Pre-built project templates (instantiate from one) |
| `/hardware/review-queue` | Community submissions awaiting review |

---

## 2. Phase 0 classification (non-skippable)

Every project starts with a 4-step wizard:

1. **Family** — pick `esp32`. Reserved families show as disabled.
2. **Path** — Diagnose (something broken), Maintain (apply update), or Develop (new build).
3. **Tier** — 1 (personal tinkering), 2 (professional internal), 3 (placed on market).
4. **Context** — region, working language, offline-first, safety-critical, medical-adjacent.

Why non-skippable: the classification determines model choice, persona injection,
which regulatory gates fire, and which mandatory quality adapters apply.

Tier 1 + ack lets you skip secure boot enforcement. Tier 2/3 cannot skip it.
Medical-adjacent triggers Clinical Safety Officer + MDR classification advisory.

---

## 3. Develop path — building from scratch

After Phase 0, you land on `/hardware/projects/:id` with the 6-phase stepper:

| # | Phase | What you do |
|---|---|---|
| 1 | Requirements & Constraints | Run `hw-develop-requirements` module to capture intended use, env envelope, power, regulatory tier, BoM target |
| 2 | Architecture | `hw-develop-architecture` — peripheral assignments, connectivity stack, power architecture, partition layout |
| 3 | Schematic & BoM | Outside ANTON for now — KiCad / EAGLE / etc. Attach BoM CSV via the workspace |
| 4 | Firmware (with quality pipeline) | Code the firmware in `${WORKSPACES_DIR}/hw/${project_id}/`. Run the **quality pipeline** before completing this phase — firmware completion requires a non-`block` verdict |
| 5 | Assembly & Tests | Build the device. Run acceptance tests |
| 6 | Deploy & Operate | Hand off to operations. Tier 2/3 require regulatory pack signed; Tier 3 also require secure-update chain in phase data |

### The quality pipeline (Phase 4 of Develop)

8 gates run on click of "Run pipeline":

- **platformio-build** — `pio run`. Requires PlatformIO installed (`pip install platformio`)
- **clang-tidy** — static analysis with cert + bugprone + cppcoreguidelines + clang-analyzer-security checks
- **cyclonedx-sbom** — SBOM generation (`cyclonedx-cli`, `cyclonedx-py`, or `cyclonedx-npm`)
- **cve-scan** — checks lifecycle layer (NVD + GHSA + Espressif advisories)
- **wokwi-sim** — simulation via `wokwi-cli` (needs `WOKWI_CLI_TOKEN`)
- **security-scorecard** — parses `sdkconfig` for secure boot / flash encryption / anti-rollback / signed apps
- **rollback-artefact** — Maintain-only — confirms patch plans have rollback artefact + Tier 3 secure-update chain
- **regulatory-pack-complete** — Develop+Tier≥2 — every required artefact signed off

Adapters that can't find their tool **skip with an install hint**, not fail.
The project workspace's "X/8 adapter tools detected" panel shows live status.

---

## 4. Diagnose path — fixing something broken

After Phase 0 with `path=diagnose`, you land on `/hardware/projects/:id/diagnose`:

1. **Symptom Capture** — describe what the device does, what changed. Voice supported in 30 languages where the browser supports SpeechRecognition.
2. **Hypothesis** — matcher returns top 5 candidate diagnostic cases by token overlap (boosts authoritative + same-HKP). Pick one.
3. **Measurement** — case's diagnostic_questions + probable_causes guide cheap-test-first measurements
4. **Resolution** — pick a resolution from the case, log outcome (worked / partial / no-effect / made-worse) with consent toggle
5. **Contribution** — at the end, optionally contribute the case back to the community (gets `authoritative=false` until reviewed)

Photo-based module identification is available at any phase via the dedicated panel
(uses Claude vision). Useful when you suspect a counterfeit module.

---

## 5. Maintain path — patching an existing fleet

After Phase 0 with `path=maintain`, you land on `/hardware/projects/:id/maintain`:

1. **CVE applicability banner** — top of page, runs the per-project CVE filter (project posture vs lifecycle events). Top applicable advisories listed with recommended actions.
2. **Patch plan** — title + description + change_kind. Set the **rollback artefact reference** (mandatory before plan can move to `ready`). For Tier 3, also tick signed_image / verified_boot / rollback_protected.
3. **Stages** — sequenced. Add a `canary` first (1-5 devices), then `wave` (e.g. 25%), then `full-rollout`. Wave on fleets > 5 devices requires the canary to have passed.
4. **Acceptance rules** — quantitative per stage: `metric operator threshold`, e.g. `boot_count_after_1h >= 5`. When you record observations, the evaluator auto-advances the stage to `passed` (all rules met) or `failed` (any rule unmet, with `rollback_on_failure=true`).
5. **Rollouts** — pick delivery channel: `ota`, `usb`, `aap-store-and-forward`, `manual`. The AAP path creates an `app_checkpoint` per stage on the project owner's paired phone (see `HARDWARE_BUILD_INTEGRATION.md` for setup).
6. **Audit trail** — every plan + stage decision is captured.

---

## 6. Regulatory pack (Tier 2 + Tier 3 develop projects)

`/hardware/projects/:id/regulatory` — appears as a panel on the project workspace
when `tier ≥ 2 && path == develop`.

Required artefacts depend on flags:

| Tier | Always required | Conditional |
|---|---|---|
| 2 | DPA, workplace-safety | — |
| 3 | DPA, workplace-safety, CRA tech file, DoC, VDP | hazard-analysis (if safety-critical), RED declaration (if RF — automatic for ESP32/nRF52), MDR classification (if medical-adjacent) |

Each artefact:
- **Generate** — produces a structured markdown skeleton populated from project + HKP context
- **Edit** — tweak the skeleton in place
- **Sign off** — explicit ≥30-char operator attestation, content-hashed in the audit trail

ANTON does NOT certify. The user is the responsible economic operator. Independent
legal review is required before sign-off.

The `regulatory-pack-complete` quality gate rolls all this up; `develop.deploy_operate`
phase completion requires it pass.

---

## 7. Humanitarian deployment kit

`/hardware/projects/:id/humanitarian` — for any deployment to a humanitarian /
low-infrastructure context.

1. **Deployment record** — named local partner (no "the community" — must be a named org), OCHA cluster, donor exit date, units planned, internet/power posture
2. **6 capacity-transfer artefacts** — installation guide, operator checklist, troubleshooting flowchart, spares procedure, escalation, decommissioning. Each generated by Claude in the project's `working_language`
3. **Bundle download** — produces a self-contained `.zip` (`humanitarian-deployment-kit-XXXX.zip`) with manifest + project + HKP snapshot + sourcing + signed regulatory + signed capacity-transfer + diagnostic-cases reference. Refuses unsigned by default; `?allow_unsigned=true` for a draft kit

Tier 3 humanitarian shipments **never** ship without local-language capacity-transfer artefacts (spec §13).

---

## 8. Templates

`/hardware/templates` — pre-built project blueprints. 6 ANTON-curated ESP32
templates ship by default:

- `esp32-wifi-sensor-mqtt`
- `esp32-ble-battery-monitor`
- `esp32-cam-http-streamer`
- `esp32-deep-sleep-lora`
- `esp32-secure-ota-day-one` (Tier 2)
- `esp32-ws2812-controller`

Click "New project from template" to instantiate one — your new project is
pre-seeded with Phase 0 + Phase 1 fields, recommended quality gates, and a
starter system prompt.

You can also **fork** an existing project as a community template ("Capture
template" action on the project workspace), then submit it to the review queue.

---

## 9. Community review queue

`/hardware/review-queue` — for reviewers. Two tabs:

- **Pending** — submissions awaiting review (HKPs, diagnostic cases, templates, patch bundles)
- **My submissions** — what you've submitted; can withdraw if not yet decided

Reviewer flow:
1. Claim a submission (transitions `pending` → `in-review`)
2. **HKP submissions** require an explicit security review record before approval
3. Approve (auto-promotes source artefact to `authoritative=true`) or reject (≥10-char reason mandatory)

---

## 10. Extending an existing device

POST `/api/hardware/projects/:id/extend` with `{ desired_change: "add humidity sensor" }`
returns a structured proposal: pin assignment delta, BoM delta, posture delta,
firmware change summary, risk delta, recommended Maintain plan.

Real Claude call (sonnet 4.6 default; opus 4.7 selectable). Defensive parsing —
when API key unavailable, returns honest fallback.

---

## 11. What's where in the codebase

See `HARDWARE_BUILD_INTEGRATION.md` for the contracts + extension guide.

Quick refs:
- Migrations: `server/db/migrations-pg/133*` through `143*`
- Services: `server/services/{hkp,hardware-project,quality-pipeline,maintain,humanitarian,regulatory-pack,diagnose,photo-id,template,review-queue,aap-rollout-bridge,extend-device,lifecycle-feed-ingestor,cve-applicability}-service.ts`
- Quality adapters: `server/services/quality-adapters/`
- Routes: `server/routes/hardware.ts`
- UI pages: `src/pages/Hardware*.tsx`

---

## 12. Honest scope reminders

- ANTON does not certify. The user is the responsible economic operator under applicable law.
- Quality adapter tools (PlatformIO, Clang-tidy, CycloneDX, Wokwi) must be installed locally — adapters skip gracefully when missing.
- AAP delivery uses approximate `owner ↔ paired-user` matching today; production deployments need explicit mapping (see `HARDWARE_BUILD_INTEGRATION.md`).
- Capacity-transfer Claude generation requires API credit; falls back to English skeleton with `[TRANSLATE TO …]` markers when unavailable.
- Photo-based module identification requires Claude vision API access.
