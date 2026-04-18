# Hardware Build — Launch Validation Checklist

Phase 10 acceptance criteria. ANTON's Hardware Build pillar is **launch-ready
when the boxes below are ticked**. Codifies the spec's go/no-go for first
public availability.

Companion docs: `HARDWARE_BUILD_USER_GUIDE.md`, `HARDWARE_BUILD_INTEGRATION.md`,
`HARDWARE_BUILD_ROADMAP.md`.

---

## A. Internal end-to-end walkthrough (Daniel)

Daniel completes one project per path on a real ESP32-WROOM-32E.

### Develop path
- [ ] Land on `/hardware`, create new Tier 1 ESP32 develop project via Phase 0 wizard
- [ ] Phase 1 (Requirements) — open the `hw-develop-requirements` module, fill in intended use + environment + power
- [ ] Phase 2 (Architecture) — open `hw-develop-architecture` module, capture peripheral assignments
- [ ] Phase 3 (Schematic) — outside ANTON; attach BoM CSV to workspace metadata
- [ ] Phase 4 (Firmware) — clone an Arduino sketch into `${WORKSPACES_DIR}/hw/${project_id}/`, run quality pipeline
  - [ ] PlatformIO adapter compiles cleanly (`pio --version` succeeds, build OK)
  - [ ] Clang-tidy adapter reports < 5 findings
  - [ ] CycloneDX SBOM produced with > 10 components
  - [ ] CVE-scan adapter reports 0 critical for current ESP-IDF
  - [ ] Wokwi sim runs the boot scenario (with `WOKWI_CLI_TOKEN` set)
  - [ ] Security scorecard reports posture from real `sdkconfig`
  - [ ] Mark firmware phase complete using the quality_score_id (verdict ≠ block)
- [ ] Phase 5 (Assembly & Tests) — flash + run on real board
- [ ] Phase 6 (Deploy & Operate) — mark complete

### Diagnose path
- [ ] Create Tier 1 ESP32 diagnose project
- [ ] Symptom Capture — describe a real symptom from the bench (e.g. "ESP32 brown-outs when WiFi sends")
- [ ] Hypothesis — confirm matcher returns `esp32-brownout-bad-usb-power` as top candidate
- [ ] Measurement — record real multimeter reading on 3V3 rail
- [ ] Resolution — pick a resolution, log outcome=worked, consent=true
- [ ] Contribution — skip OR submit a refined case to the queue

### Maintain path
- [ ] Create Tier 2 ESP32 maintain project
- [ ] Add 3 fleet devices via UI
- [ ] Observe CVE applicability assessment runs + lists applicable advisories
- [ ] Create patch plan with rollback artefact ref + secure-update-chain (Tier 3 if relevant)
- [ ] Add canary stage (1 device), wave stage (50%), full-rollout stage
- [ ] Run quality pipeline; rollback-artefact gate passes
- [ ] Plan rollout (manual delivery) on canary; record acceptance observations; canary auto-passes
- [ ] Plan rollout on wave (now allowed because canary passed)

### Regulatory pack
- [ ] On a Tier 3 develop project, generate all 8 required artefacts
- [ ] Edit one (e.g. CRA tech file) inline
- [ ] Sign off all 8 with attestation
- [ ] Confirm `regulatory-pack-complete` quality gate transitions to `pass`
- [ ] Confirm `develop.deploy_operate` completion is now allowed

### Humanitarian deployment
- [ ] On a Tier 3 humanitarian project, create deployment record (named partner + OCHA cluster + donor exit)
- [ ] Generate all 6 capacity-transfer artefacts in working language (e.g. `fr`, `sw`, `ar`)
- [ ] Confirm Claude-localized generation works (or fallback to English skeleton with `[TRANSLATE TO …]` markers)
- [ ] Sign off all 6
- [ ] Download the deployment kit zip — verify manifest + all artefacts present + signed
- [ ] Open the zip's `README.md` and confirm the partner-side instructions are clear

### Templates + community contribution
- [ ] Browse `/hardware/templates`, instantiate `esp32-wifi-sensor-mqtt` → confirm Phase 0 + Phase 1 are seeded
- [ ] Capture an existing project as a community template
- [ ] Submit it to the review queue
- [ ] Switch user, claim + approve the submission, confirm it gets `authoritative=true`

---

## B. External pilot (one enterprise user, e.g. Advisense)

The pilot user completes a Tier 2 develop project end-to-end:
- [ ] Phase 0 classification → workflow comprehensible without help
- [ ] Architecture phase outputs are usable for their actual project
- [ ] Quality pipeline runs (with at least PlatformIO + Clang-tidy installed)
- [ ] Regulatory pack generators produce skeletons their compliance team can refine
- [ ] Pilot user gives written feedback — what worked, what was confusing, what to fix

---

## C. Real adapter coverage

8 quality adapters, each genuinely usable when its tool is installed:
- [x] `platformio-build` — real subprocess invocation, parses output
- [x] `clang-tidy` — real subprocess invocation, parses findings
- [x] `cyclonedx-sbom` — real subprocess (cli / py / npm), reads SBOM JSON
- [x] `cve-scan` — real query against `lifecycle_events`
- [x] `wokwi-sim` — real CLI invocation when `WOKWI_CLI_TOKEN` set
- [x] `security-scorecard` — real `sdkconfig` parser
- [x] `rollback-artefact` — real query against `hw_patch_plans`
- [x] `regulatory-pack-complete` — real query against `hw_regulatory_artefacts`
- [x] All adapters have detect() + skip-with-install-hint when tool missing
- [x] Adapter availability surfaced in the project workspace UI

---

## D. AAP wiring

- [ ] Confirm at least one device pairing flow tested end-to-end on a phone (this is Companion App scope; Hardware Build relies on it)
- [ ] Maintain rollout with `delivery_channel='aap-store-and-forward'` creates an `app_checkpoint` on the paired phone
- [ ] Phone-side approval transitions `hw_patch_rollouts` from `queued` to `sent`
- [ ] Production deployments should add explicit `hw_project_owner_aap_mapping` table (see INTEGRATION doc §3)

---

## E. Documentation complete

- [x] `HARDWARE_BUILD_USER_GUIDE.md` — end-user walkthrough
- [x] `HARDWARE_BUILD_INTEGRATION.md` — developer extension guide
- [x] `HARDWARE_BUILD_LAUNCH_CHECKLIST.md` — this doc
- [x] `HARDWARE_BUILD_ROADMAP.md` — running progress log + sprint history
- [ ] Top-level `CLAUDE.md` mentions Hardware Build pillar in the pillars table

---

## F. Polish backlog (non-blocking)

Found during launch validation but won't gate the launch:
- [ ] Photo-based variant identification reference dataset (currently relies on Claude vision against HKP descriptions only)
- [ ] Reviewer-queue notification (today reviewers must visit `/hardware/review-queue` manually)
- [ ] Per-device AAP pairing (today: project-owner-paired-phone only)
- [ ] Real Wokwi cloud-API mode (today: local CLI only)

---

## G. Public-launch sign-off

- [ ] Daniel attests: "I have completed all of section A on a real ESP32 in my own bench."
- [ ] At least one external pilot user attests: "I would use this for my next project."
- [ ] Real-tool quality pipeline run on Daniel's bench achieves at least 4/8 adapters in `pass` state with installed tools (PlatformIO + Clang-tidy + CycloneDX + sdkconfig)
- [ ] No `ship_verdict=block` from a misconfiguration that the user cannot diagnose from the UI alone

When all of section G is ✓ → ship to general availability.
