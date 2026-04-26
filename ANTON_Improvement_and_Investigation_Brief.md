# ANTON — Improvement & Investigation Brief

> **Audience:** Claude Code
> **Authored by:** Claude (strategic thinking partner) for Daniel Bardun
> **Date:** 26 April 2026
> **Type:** Prioritised improvement queue + self-directed investigation framework
> **Repo:** `altspace-hub/ANTON` at `/docs/architecture/` baseline commit `0fabf7f` (`openexpert@0.7.5`)
> **First action for Claude Code:** Read this brief fully. Then run the **pre-flight verification** in Part B before touching code. Anything outside that pre-flight is execution work.

---

## 0. Why This Brief Exists

The 26 April 2026 architecture audit (`/docs/architecture/_audit-notes.md`) revealed that ANTON's code is significantly ahead of both its whitepapers and its strategic memory. The platform now has:

- 12 effective pillars (vs. 3 in v3 whitepaper)
- 59 areas / 263 modules (vs. 29 / 238)
- 221 services, 151 routes, 251 frontend pages, 289 database tables
- 121 PostgreSQL migrations
- 45 `.anton` bundle types (vs. 17 documented)

This drift creates three classes of problem:

1. **Reality/narrative gaps** — features marketed as "coming" are actually built; some marketed as "delivered" are 1/4 wired (Orchestrator).
2. **Under-narrated assets** — Risk Atlas, Tier 5 Hardware Build, Roaring + Dow Jones prompt-layer integrations are major differentiators with zero marketing presence.
3. **Partial features that need closing** — Reasoning Trails viewer, Cross-Workflow Intelligence funnel, AAP transport, School Mode evidence log.

This brief turns those into prioritised work, then equips Claude Code with **investigation patterns** so it can keep finding improvements between formal briefs.

---

## PART A — Goals & Non-Goals

### A.1 Goals

1. **Close the highest-leverage reality/narrative gaps first** — the things that, if fixed, make the marketing message true.
2. **Elevate built-but-invisible assets** — surface them in nav, in the README, in a public-facing artefact.
3. **Complete partial features** that block trust-progression and audit-trail stories.
4. **Equip Claude Code to self-direct** — establish reusable investigation patterns that find the next work without waiting for a brief.
5. **Maintain code-grounded discipline** — every change cites file:line, every status badge is honest, every diagram in `/docs/architecture/` stays current.

### A.2 Non-Goals

- This is **not** a feature-launch sprint. No new pillars, no new bundle types, no new LLM providers.
- This is **not** a refactor for refactor's sake. Anti-patterns are flagged for triage, not necessarily fixed.
- This is **not** a documentation rewrite of the whitepapers. The whitepapers are deferred; the architecture diagrams in `/docs/architecture/` are now authoritative.
- This is **not** a UX project. UI changes happen only where they unblock a higher-priority gap (e.g. Reasoning Trails viewer, AppMode promotion of Procure/Civic/Grow).

### A.3 Definition of "Good"

After this brief is executed:

- The Orchestrator trust progression story is either fully wired or publicly rescoped — no ambiguity.
- A user can land on `/audit-trail` (or equivalent) and see all reasoning trails for any session — IRE, workflow, orchestrator, signed deliveries.
- Procure / Civic / Grow appear in the same toggle UI as Work / School / Life — no path-routing inconsistency.
- The 45 `.anton` bundle types are documented in one canonical place readable by an open-source contributor.
- Risk Atlas and Tier 5 Hardware Build have public-facing entry points and a one-pager each.
- Claude Code can run `pnpm run anton:investigate` (or equivalent) and produce a fresh **drift report**, **hidden capability list**, **quality smell report**, and **narrative opportunity list** without further prompting.

---

## PART B — Pre-Flight Verification (Required)

Before any improvement work, Claude Code re-runs the audit pre-flight to make sure the baseline hasn't drifted since 26 April.

### B.1 Repo state

```bash
cd /path/to/repo
git remote -v
git rev-parse HEAD
cat package.json | grep -E '"name"|"version"|"license"'
git log --oneline -20
```

If the commit SHA differs from `0fabf7f` (or the version differs from `0.7.5`), regenerate `_audit-notes.md` per `ANTON_Architecture_Schematics_Brief.md` Part B.2 before proceeding.

### B.2 Counts spot-check

```bash
find server/areas -maxdepth 1 -type d | wc -l                              # expect 59 + 1 (parent)
find server/services -name "*.ts" | wc -l                                  # expect ~221
find server/routes -name "*.ts" | wc -l                                    # expect ~151
find src/pages -name "*.tsx" | wc -l                                       # expect ~251
ls server/db/migrations-pg/*.sql | wc -l                                   # expect ~121
grep -c "id: '" src/lib/constants.ts                                       # expect ~263
```

Any number off by >10% triggers a full audit refresh before continuing.

### B.3 Key file sanity checks

Confirm these key citations from the diagrams still resolve:

```bash
grep -n "AppMode" src/stores/useSettingsStore.ts                           # expect line ~74, 9 entries
grep -n "isProcureMode\|isCivicMode\|isGrowMode" src/components/layout/Sidebar.tsx
grep -n "BundleType" server/services/anton-bundler.ts                      # expect 45-entry union
grep -n "Phase 1: Observer" server/services/orchestrator-engine.ts
grep -n "stageNames" server/services/orchestrator-engine.ts                # expect line ~355
grep -n "MAX_CONTEXT_TOKENS" server/services/knowledge-resolver.ts         # expect 900_000
grep -n "ANTON-\[A-F0-9\]" server/services/identity.ts                     # expect contact-hash regex
```

If any of these fail, file paths have moved — update the diagrams' source-of-truth refs first.

### B.4 Pre-flight output

Append a short "Pre-flight verification" section to `_audit-notes.md` with: date, SHA, version, count deltas, any failed sanity checks, and a green/yellow/red overall verdict. Only proceed to Part C if green.

---

## PART C — Priority 1: Close Reality/Narrative Gaps

These are the highest-leverage items: each one closes a gap between what ANTON markets and what ANTON does.

---

### C.1 — Orchestrator Phases 2–4 Gating

**The gap:** `21-orchestrator-trust-phases.md` shows Phase 1 (Observer) wired, Phases 2–4 (Guided / Supervised / Autonomous) scaffolded but not gated. The marketing story is "four-phase trust progression"; the code delivers one. This is the single biggest narrative/reality gap.

**Acceptance criteria:**

1. Each phase has an explicit gate function in `orchestrator-engine.ts`:
   - `canPromoteToGuided(userId, scope)` — returns `{eligible, reasons[]}` based on Observer-phase metrics (proposal accept rate, days observed, pattern stability).
   - `canPromoteToSupervised(userId, scope)` — based on Guided-phase metrics (rejection rate < threshold, no incidents in N days).
   - `canPromoteToAutonomous(userId, scope)` — based on Supervised-phase metrics (auto-execute success rate, low-incident count).
2. Each phase has an action filter that gates what ANTON may do without confirmation:
   - **Observer:** never acts; only proposes briefings.
   - **Guided:** proposes specific actions; user confirms each.
   - **Supervised:** auto-executes risk-tier-low actions; gates risk-tier-medium / -high.
   - **Autonomous:** auto-executes within scope; flags only mission-style approvals.
3. Action risk tiers are defined in a single registry (`action-risk-registry.ts` or extended from existing risk schema) and enforced in `applyOrchestratorAction()`.
4. A demotion event hook exists: an incident (rejected action, compliance gap, user override) drops the user back one phase with explicit reason persisted.
5. Each promotion / demotion writes a `reasoning_trails` row with the gating evaluation.
6. Update `21-orchestrator-trust-phases.md` status badges from 🟢/📋 to ✅ where now wired.
7. Add a UI surface (`OrchestratorPhasePanel.tsx` or extend existing settings) showing the user their current phase per scope and the criteria for the next phase.

**Investigation protocol:**

```bash
# What's there today
grep -n "OrchestratorProposal\|OrchestratorAction\|applyAction" server/services/orchestrator-engine.ts
grep -n "stageNames\|phase" server/services/orchestrator-engine.ts
grep -rn "orchestrator" server/routes/ src/pages/

# What schemas back this
grep "CREATE TABLE" server/db/migrations-pg/*orchestrator*.sql
grep "CREATE TABLE" server/db/migrations-pg/*proposal*.sql

# Where risk tiers live today (avoid duplication)
grep -rn "risk_tier\|severity\|riskLevel" server/services/ --include="*.ts" | head -30

# Confirm there's no existing gating you'd duplicate
grep -rn "canPromote\|promote_phase\|trust_phase_gate" server/ src/
```

**Decision point for Daniel:** if Phase 4 (Autonomous) is not desirable for v0.8, ship 1–3 only and rescope marketing to "three active phases + Autonomous on the 2027 roadmap." Either path is honest; ambiguity is not.

**Output files:**
- `server/services/orchestrator-gate.ts` (new) — gate functions
- `server/services/action-risk-registry.ts` (new or extension) — action tiering
- Updated `server/services/orchestrator-engine.ts`
- New page or panel surfacing phase status to user
- Updated `/docs/architecture/21-orchestrator-trust-phases.md`

---

### C.2 — Reasoning Trails Consolidated Viewer

**The gap:** All trail tables exist (`revelation_chains`, `revelation_steps`, `community_signed_trail_entries`, `output_versions`, `version_diffs`, etc.). `23-reasoning-trails.md` confirms emission points across IRE, orchestrator, workflow engine. But there's no top-level `/audit-trail` surface where a user (or auditor, regulator, MLRO) can view trails in one place. Today only the IRE drawer in the Companion App surfaces them.

**Acceptance criteria:**

1. `/audit-trail` route exists in `src/App.tsx` and is reachable from Settings + an admin sidebar item.
2. `AuditTrailPage.tsx` renders a unified, filterable feed of:
   - IRE revelation chains (per session, per phase)
   - Orchestrator decisions (proposal generated / accepted / rejected / promoted)
   - Workflow engine step outcomes
   - Signed delivery trails (`community_signed_trail_entries`)
   - Output versions and diffs
3. Filters: session, user, scope, time range, trail type, signature-verification status.
4. Per-trail detail drawer shows: full content, thinking, tool calls, signature status, related session link.
5. Export action produces a `.anton evidence-pack` bundle of selected trails (re-uses existing `evidence-pack` bundle type — does not invent a new one).
6. Optional companion-app surface: extend the existing IRE drawer to show non-IRE trails too.
7. Backend: a single `trails-aggregator-service.ts` that queries the relevant tables and returns a unified shape — do not duplicate query logic.

**Investigation protocol:**

```bash
# What trail tables exist
grep "CREATE TABLE" server/db/migrations-pg/*.sql | grep -iE "trail|revelation|version|signed"

# What surfaces exist today
find src -iname "*trail*" -o -iname "*revelation*" -o -iname "*audit*"
grep -rn "revelation_chains\|revelation_steps" src/ server/routes/

# Is there a partial viewer
grep -rn "ReasoningTrail\|TrailViewer\|AuditTrail" src/ server/

# Existing evidence-pack export path — extend, don't duplicate
grep -rn "evidence-pack\|evidencePackBuilder" server/services/
```

**Output files:**
- `server/services/trails-aggregator-service.ts` (new)
- `server/routes/audit-trail.ts` (new)
- `src/pages/AuditTrailPage.tsx` (new)
- `src/components/audit/TrailFeed.tsx`, `TrailDetail.tsx`, `TrailFilters.tsx` (new)
- Updated `/docs/architecture/23-reasoning-trails.md` — bump status from 🟢 to ✅, update related-diagram references.

---

### C.3 — Procure / Civic / Grow → AppMode Promotion

**The gap:** `_audit-notes.md` §6 D1 records that Procure, Civic, and Grow are fully built ✅ but routed via `pathname.startsWith()` in `Sidebar.tsx:351–353` rather than via the `AppMode` union in `useSettingsStore.ts:74`. This is a UX inconsistency: 9 pillars get a toggle, 3 don't. Users discover them only by URL.

**Acceptance criteria:**

1. `AppMode` union extended from 9 to 12 entries: existing 9 + `procure`, `civic`, `grow`.
2. `Sidebar.tsx` path-based detection removed; mode toggle replaces it.
3. Toggle UI shows all 12 pillars with consistent visual treatment.
4. Existing routes (`/procure`, `/civic`, `/grow`) continue to work — the URL is the source of truth for the active mode on direct nav.
5. No regression: each path's existing pages still render; sidebar variants still apply.
6. Update `03-pillar-topology.md` — collapse the AppMode/path-route split into a single "12 pillars" diagram.

**Investigation protocol:**

```bash
# Current mode toggle wiring
grep -n "AppMode\|setAppMode\|appMode" src/stores/useSettingsStore.ts src/components/layout/Sidebar.tsx

# Path-based detection points
grep -n "isProcureMode\|isCivicMode\|isGrowMode\|pathname.startsWith" src/components/layout/Sidebar.tsx

# Sidebar variants
grep -rn "ProcureSidebar\|CivicSidebar\|GrowSidebar" src/components/

# Route registrations
grep -n "procure\|civic\|grow" src/App.tsx | head -30
```

**Decision point for Daniel:** if there's a deliberate UX reason to keep the path-routed pattern (e.g. these pillars have different sidebar variants that wouldn't fit a unified toggle), document it explicitly in `_audit-notes.md` §6 D1 and close the discrepancy as "intentional, document only" rather than promoting.

**Output files:**
- Updated `src/stores/useSettingsStore.ts`
- Updated `src/components/layout/Sidebar.tsx`
- Updated `/docs/architecture/03-pillar-topology.md`

---

### C.4 — Workflow Step Type Canonical Registry

**The gap:** `_audit-notes.md` §6 D3 records 14 step types implemented vs. 12 in spec — but no single declarative registry exists. The `24-workflow-engine.md` diagram had to enumerate from grep. This makes the engine extensible only by reading the executor end-to-end.

**Acceptance criteria:**

1. `server/services/workflow-step-registry.ts` (new) — single source of truth for the canonical step-type list. Each entry: `id, label, schema (Zod), executor function reference, retry policy, default timeout`.
2. `workflow-executor.ts` imports from the registry instead of branching on string.
3. New step types are added by registering, not by editing the executor switch.
4. `/docs/architecture/24-workflow-engine.md` updated to derive its step-type table directly from the registry (literal copy of the list, not paraphrased).
5. Deprecation note for any spec-named step type that doesn't map to a registry entry (so naming drift becomes visible).

**Investigation protocol:**

```bash
# Today's executor
grep -n "step.type\|switch (step\|case '" server/services/workflow-executor.ts
grep -n "executeStep\|runStep" server/services/workflow-executor.ts

# What schemas exist for each step type
grep -rn "stepSchema\|workflowStep" server/ --include="*.ts"

# Existing Zod usage as a model
grep -rn "z.object\|z.union" server/services/ --include="*.ts" | head -20
```

**Output files:**
- `server/services/workflow-step-registry.ts` (new)
- Refactored `server/services/workflow-executor.ts`
- Updated `/docs/architecture/24-workflow-engine.md`

---

## PART D — Priority 2: Elevate Under-Narrated Assets

Built. Working. Invisible. Each item below has zero or near-zero presence in the marketing story today, despite being a real differentiator.

---

### D.1 — Risk Atlas: Public Surface + One-Pager

**Status today:** Full 7-stage workspace, FCP scope, 9 services, residual calculator with 25 tests, 5 migrations (125–129). `routes/atlas.ts` registered. `RiskAtlasWorkspace.tsx` exists. Yet Risk Atlas is absent from the v3 whitepaper, absent from memory, and not advertised in the README.

**Acceptance criteria:**

1. `/risk-atlas` is a discoverable entry point from the Work pillar landing page.
2. `RiskAtlasLandingPage.tsx` (new) — the equivalent of an "About this workspace" page: 7 stages, FCP integration, deterministic residual calculator, sample industry packs, the `risk-atlas-export` `.anton` bundle.
3. A short markdown one-pager `/docs/marketing/risk-atlas.md` explaining what it does, who it's for, what differentiates it from generic AML/risk tools.
4. Risk Atlas surfaced in `03-pillar-topology.md` as a first-class "Cross-pillar surface" (already there, but expand the surface description).
5. Risk Atlas added to README "Reading order by audience" → regulator/auditor track.

**Investigation protocol:**

```bash
# Today's surface
find src/pages -iname "*atlas*" -o -iname "*risk-atlas*"
grep -rn "RiskAtlas" src/components/

# Backend depth
ls server/services/risk-atlas/
grep -rn "atlas" server/routes/

# Test coverage (build confidence numbers for the one-pager)
find tests -iname "*atlas*"

# Industry pack samples
ls data/risk-atlas/packs/ 2>/dev/null
```

**Output files:**
- `src/pages/RiskAtlasLandingPage.tsx`
- `/docs/marketing/risk-atlas.md`
- Updates to `/docs/architecture/03-pillar-topology.md`, `README.md`

---

### D.2 — Tier 5 Hardware Build: Story + Surface

**Status today:** 12 dedicated migrations (133–144), 9+ pages (`HardwareBuildPage`, `HardwareKnowledgePacksPage`, `HardwareProjectPage`, `HardwareDiagnosePage`, `HardwareMaintainPage`, `HardwareRegulatoryPage`, `HardwareHumanitarianPage`, `HardwareTemplatesPage`, `HardwareReviewQueuePage`). 4 hardware-specific bundle types (`hardware-knowledge-pack`, `hardware-template`, `hardware-project`, `humanitarian-deployment-kit`, `diagnostic-case-bundle`, `patch-bundle`, `lifecycle-advisory-bundle` — actually 7). `docs/HARDWARE_BUILD_ROADMAP.md` exists. Yet outside the Coding Area context this is invisible.

**Acceptance criteria:**

1. Tier 5 Hardware Build has its own entry point on the Coding Area landing page (not buried as "Tier 5").
2. Humanitarian Deployment Kit gets a dedicated `/docs/marketing/humanitarian-deployment-kit.md` — this is a genuine NGO/refugee-context differentiator and aligns with the School Mode offline-capable narrative.
3. `25-coding-area.md` upgraded from a 4-tier diagram to a 4+1 diagram with Tier 5 as a peer surface, not a footnote.
4. README "Reading order" gets a "Hardware contributor" track.

**Investigation protocol:**

```bash
# Tier 5 schema
ls server/db/migrations-pg/13[3-9]*.sql server/db/migrations-pg/14[0-4]*.sql

# Tier 5 services
find server/services -iname "*hardware*"

# Tier 5 pages
find src/pages -iname "*hardware*"

# Existing roadmap doc — extend, don't duplicate
cat docs/HARDWARE_BUILD_ROADMAP.md | head -100
```

**Output files:**
- Updates to `src/pages/CodingLandingPage.tsx` and `25-coding-area.md`
- `/docs/marketing/humanitarian-deployment-kit.md`
- `/docs/marketing/tier5-hardware-build.md`

---

### D.3 — The 45-Bundle `.anton` Economy: Documented in One Place

**Status today:** `BundleType` union in `anton-bundler.ts:25–84` lists 45 types. `32-anton-bundle-format.md` enumerates them. But there's no single canonical contributor-facing reference for "what is the `.anton` ecosystem?"

**Acceptance criteria:**

1. `/docs/anton-format/README.md` (new) — the canonical reference: what is `.anton`, what's the manifest schema, how is signing done, the full 45-type catalogue with one-line descriptions per type.
2. Each bundle type gets a `/docs/anton-format/types/{type-slug}.md` — short page covering: purpose, content directory layout, typical transport (AAP / Marketplace / Local), example payload, related diagrams.
3. The contributor flow ("how do I add a new bundle type") is documented in `/docs/anton-format/extending.md`.
4. The marketplace landing page (when built out) will link here.
5. Cross-references: `32-anton-bundle-format.md` becomes the architectural diagram; `/docs/anton-format/` becomes the contributor docs.

**Investigation protocol:**

```bash
# Today's bundler
grep -n "BundleType\|bundle_type\|bundleType" server/services/anton-bundler.ts

# Per-type usage
for t in module skill persona workflow market-index career-profile evidence-pack; do
  echo "=== $t ===";
  grep -rn "$t" server/services/ src/pages/ --include="*.ts" --include="*.tsx" | head -5;
done

# Existing docs
ls docs/ 2>/dev/null
find . -name "WHITEPAPER_ANTON_FORMAT*"
```

**Output files:**
- `/docs/anton-format/README.md` (canonical)
- `/docs/anton-format/types/` — 45 short files
- `/docs/anton-format/extending.md`
- Cross-reference from `/docs/architecture/32-anton-bundle-format.md`

---

### D.4 — Multi-Layer Prompt Builder: Document the Sub-Layers Honestly

**Status today:** `prompt-builder.ts` has Layer 2a (org_context, line 259), 2b (knowledge_pack, 340), 2c (Roaring entity data, 554), 2d (Dow Jones screening, 558), 4a (resume_context, 299), and Layer 6 hardware HKP (562, 582). The "seven-layer" name is now archaeological — it's really 12 layers if sub-layers count.

**Acceptance criteria:**

1. Decide on naming: keep "seven-layer with sub-layers" (current) or rename to "twelve-layer." Either is fine; ambiguity isn't.
2. Whichever is chosen, every sub-layer gets an explicit `// Layer N{x}: <description>` comment in `prompt-builder.ts` so a reader can see the structure inline.
3. `/docs/architecture/11-seven-layer-prompt-builder.md` updated to reflect the chosen naming. If renamed, add a "Why this changed" note in the file header.
4. The Roaring (Layer 2c) and Dow Jones (Layer 2d) integrations get their own one-pagers in `/docs/marketing/`. These are FCP-specific differentiators — modules in the FCP area silently get live entity + screening data baked into every prompt. That's a story.

**Investigation protocol:**

```bash
# Confirm sub-layer line numbers
grep -n "Layer 2a\|Layer 2b\|Layer 2c\|Layer 2d\|Layer 4a\|Layer 6" server/services/prompt-builder.ts
grep -n "buildOrgContextLayer\|buildKnowledgePackLayer\|buildAtomLayer\|buildResumeContextLayer" server/services/prompt-builder.ts

# Roaring + Dow Jones integration depth
grep -rn "roaring\|dowJones\|dow_jones" server/ --include="*.ts" | head -30
```

**Decision point for Daniel:** the naming choice has marketing weight. "Seven-layer" is established; "twelve-layer" is honest about what's actually there. My recommendation is **keep "seven-layer" externally, document sub-layers internally** — the seven layers map to the seven *kinds* of context (foundation, area, module, persona, skill, knowledge, transparency); the sub-layers are extensions within "knowledge" and "context."

**Output files:**
- Updated `server/services/prompt-builder.ts` (comments only; no logic change)
- Updated `/docs/architecture/11-seven-layer-prompt-builder.md`
- `/docs/marketing/roaring-integration.md`
- `/docs/marketing/dow-jones-integration.md`

---

## PART E — Priority 3: Complete Partial Features

Each of these is `🟢 Partial` in the audit. Closing them moves the platform from "scaffolded" to "delivered."

---

### E.1 — Cross-Workflow Intelligence Funnel Orchestrator

**Status today:** `knowledge-graph.ts`, `pattern-detection`, `apprentice.ts`, `quality-ratchet.ts`, `atom-extractor.ts`, `atom-boost.ts` exist independently. No single file orchestrates them as a five-layer funnel.

**Acceptance criteria:**

1. `server/services/cross-workflow-intelligence.ts` (new) — the funnel orchestrator. On every workflow output, runs in order: atom-extract → graph-update → pattern-detect → memory-write → quality-ratchet → apprentice-signal.
2. Each stage is async and isolated — failure in one doesn't break the next; failures are logged but non-blocking.
3. A configurable hook on workflow completion calls the funnel.
4. Update `26-cross-workflow-intelligence.md` from 🟢 to ✅.

**Output files:**
- `server/services/cross-workflow-intelligence.ts`
- Hook in `workflow-executor.ts` (single line addition)
- Updated `/docs/architecture/26-cross-workflow-intelligence.md`

---

### E.2 — AAP Transport Beyond Bridge

**Status today:** `aap-rollout-bridge.ts` exists. Crypto (Ed25519/X25519), E2E, signing, contact-hash format all built. But ANTON-to-ANTON transport is bridge-only — there's no production-grade peer transport.

**Acceptance criteria (scoped — full AAP wire format is a longer project):**

1. Document the gap explicitly in `30-aap-protocol.md` — what's built, what's bridged, what's missing.
2. Define one concrete next step: either (a) implement direct WebSocket-over-HTTPS peer transport with mDNS LAN discovery, or (b) formally defer to a v0.9+ release and update memory + marketing accordingly.
3. If (a), produce a wire-format spec doc `/docs/aap/wire-format-v1.md` covering: handshake, capability negotiation, bundle exchange, replay protection, error codes.
4. If (b), nothing more to ship; the doc update closes the gap.

**Decision point for Daniel:** this is a forking-decision item, not a sprint item. Recommend deciding between (a) and (b) before Claude Code touches it.

---

### E.3 — School Mode: Learning Evidence Log + Curriculum Registry

**Status today:** School pillar surfaces ✅. `school-prompt-builder.ts` ✅. Migration 094 ✅. Learning Evidence Log + 25-country Curriculum Registry are 📋 in `f-54-school-mode.md`.

**Acceptance criteria:**

1. `learning_evidence_log` table (migration 168 or next available) — schema covering: student_id, evidence_type (work-sample / quiz-result / observation / portfolio-item), subject, learning-objective, ai-assessment-summary, guardian-visible, teacher-notes, attached `.anton` study-pack reference, created_at.
2. `curriculum_registry` table — country_code, jurisdiction, subject, year-level, learning-objective-id, source-url, last-verified-at. Seed with 5 countries first (Sweden, UK, US, India, Kenya — covers EU regulated, large English-speaking, large emerging-market, NGO-relevant). 25 countries can come later.
3. `LearningEvidencePage.tsx` — guardian-visible evidence feed, teacher-editable.
4. `school-prompt-builder.ts` extended to inject curriculum-registry context for the active student's jurisdiction.
5. Update `f-54-school-mode.md` from 🟢 to ✅ on these surfaces.

**Output files:**
- `server/db/migrations-pg/168_school_evidence_curriculum.sql`
- Seed data in `data/curriculum-registry/`
- `src/pages/school/LearningEvidencePage.tsx`
- `src/pages/school/CurriculumRegistryPage.tsx` (admin)
- Updated `/docs/architecture/future/f-54-school-mode.md`

---

### E.4 — Markets Consul Council Surface

**Status today:** Markets pillar ✅ — 30 services, 18 migrations, 23 pages. Consul Council surface 📋.

**Acceptance criteria:**

1. `MarketsConsulCouncilPage.tsx` — the deliberation surface where the consul council reviews market theses, predictions, and pattern detections before they ship to subscribers.
2. Council membership configurable per index (`market_consul_members` table, if not present).
3. Each deliberation produces a `revelation_chain` (re-uses IRE persistence — does not invent a new trail format).
4. Output is a signed `.anton market-thesis` or `.anton market-investigation` bundle.
5. Update `f-50-markets-pillar.md`.

**Output files:**
- `server/services/market-consul-service.ts` (or extend existing market-* services)
- `src/pages/markets/ConsulCouncilPage.tsx`
- Migration if a new table is needed
- Updated `/docs/architecture/future/f-50-markets-pillar.md`

---

### E.5 — Grow Connectors (Salesforce-First)

**Status today:** Grow pillar ✅ — 9 tables, 5 pages, full standalone CRM. External CRM connectors (Salesforce, HubSpot, Dynamics 365, Pipedrive) all 📋.

**Acceptance criteria (scoped to Salesforce only as a proof-of-pattern):**

1. `server/services/connectors/salesforce-adapter.ts` — read-side first: pull contacts, organisations, opportunities into Grow's tables.
2. Connection management uses the existing `connection-manager.ts` — extend, do not duplicate.
3. Bidirectional sync (write-back) is explicitly out of scope for v1.
4. Conflict resolution: external system wins on read; user can mark a Grow record as "owned by ANTON" to opt out of overwrite.
5. Update `f-53-future-pillars.md` Grow connector list — Salesforce becomes 🟢, others remain 📋.

**Decision point for Daniel:** Salesforce vs HubSpot first depends on target customer profile. Salesforce is more enterprise-aligned with FCP buyers; HubSpot is faster to ship and broader audience. Confirm before Claude Code starts.

---

## PART F — Priority 4: Quality, Security, Performance (Investigation Pass)

This priority is **investigation-only first**. No fixes until the investigation is complete and triaged with Daniel.

### F.1 — Test coverage analysis

```bash
# Files with tests vs without
find server/services -name "*.ts" | sort > /tmp/services.txt
find tests -name "*.test.ts" | sed 's|.*/||;s|\.test\.ts||' | sort > /tmp/tested.txt
# Services without tests
grep -vF -f /tmp/tested.txt /tmp/services.txt > /tmp/untested.txt
wc -l /tmp/untested.txt
```

Output: `/docs/audit/test-coverage-gaps.md` listing the 20 most important untested services (weighted by how many other services import them).

### F.2 — Security audit pass

```bash
# Hard-coded secrets
grep -rn "api_key\|apiKey\|password\s*=\s*['\"]" server/ --include="*.ts" | grep -v node_modules | grep -v test
# Endpoints without auth middleware
grep -rn "router.get\|router.post" server/routes/ | grep -v "auth\|middleware"
# Rate-limited vs non-rate-limited routes
grep -rn "rateLimit\|rate-limit" server/routes/ | wc -l
ls server/routes/*.ts | wc -l
```

Output: `/docs/audit/security-findings.md` — flags only, no fixes. Triage with Daniel.

### F.3 — Performance hot paths

```bash
# Files with no streaming on large queries
grep -rn "SELECT \*\|SELECT .* FROM" server/services/ --include="*.ts" | head -50
# N+1 candidates
grep -rn "for.*await\|forEach.*await" server/services/ --include="*.ts" | head -30
# Token budget enforcement points
grep -rn "MAX_CONTEXT_TOKENS\|tokenBudget\|applyTokenBudget" server/services/
```

Output: `/docs/audit/performance-hotpaths.md` — ranked candidate list.

### F.4 — God services / file-size pass

```bash
# Files over 500 lines
find server/services src/pages src/components -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | awk '$1 > 500' | head -30
# Most-imported services (proxy for god-service candidates)
grep -rn "from.*services/" server/ src/ --include="*.ts" --include="*.tsx" | sed 's|.*services/||;s|[\"'\''].*||' | sort | uniq -c | sort -rn | head -30
```

Output: `/docs/audit/code-density.md` — flags candidates for split.

### F.5 — Anti-pattern detection

```bash
# Circular imports — needs a tool, but a quick proxy:
# Find pairs of files that import each other
# (use madge or dpdm if installed; otherwise a Node script)

# Schema duplication candidates
grep "CREATE TABLE" server/db/migrations-pg/*.sql | sed 's/.*CREATE TABLE[^a-z_]*//;s/[ (].*//' | sort | uniq -c | awk '$1 > 1'

# TODO/FIXME density per service
grep -rn "TODO\|FIXME\|HACK\|XXX" server/services/ --include="*.ts" | sed 's|:[0-9]*:.*||' | sort | uniq -c | sort -rn | head -20
```

Output: `/docs/audit/anti-patterns.md`.

---

## PART G — Self-Directed Investigation Patterns

This is the **most important section of the brief**. The patterns below let Claude Code keep finding the next thing without waiting for a brief. Each pattern: what it detects, how to run it, what the output looks like, when to run it.

---

### G.1 — Drift Detection

**Detects:** divergence between code reality, whitepaper claims, and memory.

**How to run:** scan source-of-truth files for the canonical numbers (areas, modules, services, routes, pages, tables, bundle types). Compare to claims in the v2/v3 whitepapers and current memory. Flag any drift > 10%.

**Output:** `/docs/audit/drift-report.md` — table of "claim source / claim value / actual value / delta / severity."

**Severity:**
- High: drift > 50% or pillar count, licence, or core architecture change
- Medium: drift 20–50%
- Low: drift 10–20%

**When to run:** weekly auto, or on every minor version bump.

**Run command:**

```bash
pnpm run anton:investigate -- --pattern drift
# or manual:
bash scripts/audit/drift-check.sh
```

---

### G.2 — Hidden Capability Detection

**Detects:** services that exist in code but have no user-facing surface, no marketing material, no test coverage, or no whitepaper mention.

**How to run:**

```bash
# Each service file
for svc in $(find server/services -name "*.ts" -not -name "*.test.ts"); do
  base=$(basename $svc .ts)
  # Is it referenced from a route?
  routes=$(grep -rln "$base" server/routes/ 2>/dev/null | wc -l)
  # Is it referenced from a page?
  pages=$(grep -rln "$base" src/pages/ 2>/dev/null | wc -l)
  # Is it referenced from marketing docs?
  marketing=$(grep -rln "$base" docs/marketing/ 2>/dev/null | wc -l)
  echo "$base routes:$routes pages:$pages marketing:$marketing"
done | awk '$2 ~ /routes:[1-9]/ && $4 == "marketing:0"' > /tmp/hidden-capabilities.txt
```

**Output:** `/docs/audit/hidden-capabilities.md` — ranked list with elevation potential (services that have many backend integrations but no marketing material are highest priority).

**When to run:** monthly, or after any feature ship.

---

### G.3 — Quality Smell Detection

**Detects:** TODO/FIXME density, file size, untested services, error swallowing, console.log leftovers, hard-coded constants that should be config.

**How to run:**

```bash
# TODO density
grep -rn "TODO\|FIXME\|HACK\|XXX" server/ src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l

# Files over 500 lines
find server/services src/pages -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | awk '$1 > 500' | head -30

# Error swallowing
grep -rn "catch.*{}" server/ src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

# console.log in production code
grep -rn "console\.log\|console\.warn" server/ src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v test | wc -l

# Hard-coded URLs / numbers that should be env
grep -rn "https://\|http://" server/ --include="*.ts" | grep -v node_modules | grep -v "http://localhost" | head -30
```

**Output:** `/docs/audit/quality-smells.md` — ranked by severity (error swallowing > console.log > TODO density > file size).

**When to run:** weekly auto.

---

### G.4 — Narrative Opportunity Detection

**Detects:** built features without marketing material, migrations without spec docs, bundle types without examples, pillars with high page counts but low whitepaper coverage.

**How to run:**

```bash
# Migrations without a corresponding spec doc
for mig in server/db/migrations-pg/*.sql; do
  num=$(basename $mig .sql | cut -d_ -f1)
  feature=$(basename $mig .sql | cut -d_ -f2-)
  spec=$(grep -rln "$feature" docs/ 2>/dev/null | wc -l)
  echo "$num $feature spec_docs:$spec"
done | awk '$3 == "spec_docs:0"' | head -30

# Bundle types without an example payload
for type in $(grep "^\s*'" server/services/anton-bundler.ts | tr -d "',|"); do
  examples=$(find data/ examples/ -name "*$type*" 2>/dev/null | wc -l)
  echo "$type examples:$examples"
done | awk '$2 == "examples:0"'

# Pillars by page count vs whitepaper mention
for pillar in work school life pathfinder markets community payments portals missions procure civic grow; do
  pages=$(find src/pages -path "*$pillar*" -name "*.tsx" 2>/dev/null | wc -l)
  wp=$(grep -ril "$pillar" /mnt/project/ANTON_Whitepaper*.md 2>/dev/null | wc -l)
  echo "$pillar pages:$pages whitepaper_mentions:$wp"
done
```

**Output:** `/docs/audit/narrative-opportunities.md` — ranked by strategic weight.

**When to run:** monthly, before any major content push (whitepaper part, blog post, partner pitch).

---

### G.5 — Architecture Anti-Pattern Detection

**Detects:** circular imports, god services, schema duplications, inconsistent naming, services that bypass the established prompt builder / knowledge resolver / unified-llm-client paths.

**How to run:**

```bash
# Services that bypass unified-llm-client
grep -rln "anthropic.messages.create\|openai.chat" server/services/ --include="*.ts" | grep -v "claude-client\|adapter\|unified-llm-client"

# Services that bypass prompt-builder
grep -rln "buildSystemPrompt\|systemPrompt\s*=" server/services/ --include="*.ts" | grep -v "prompt-builder"

# Schema-pattern duplications (similar column sets across tables)
# Use a helper script that reads CREATE TABLE blocks and clusters by column-set similarity

# Most-imported services (god-service candidates)
grep -rn "from.*services/" server/ src/ --include="*.ts" --include="*.tsx" | sed 's|.*services/||;s|[\"'\''].*||' | sort | uniq -c | sort -rn | head -10
```

**Output:** `/docs/audit/anti-patterns.md` — flagged candidates with severity and recommended action.

**When to run:** quarterly, or before any major refactor.

---

### G.6 — Surface-Service-Schema Triangle Check

**Detects:** broken alignment between user-facing pages, backend services, and database schema. If a page exists for a feature but the service doesn't, or the service exists but the schema doesn't, something is half-built.

**How to run:**

```bash
# For each pillar, check the triangle
for pillar in markets school grow procure civic missions portals; do
  pages=$(find src/pages -path "*$pillar*" -name "*.tsx" | wc -l)
  services=$(find server/services -name "*$pillar*" -o -path "*$pillar*" | wc -l)
  migrations=$(ls server/db/migrations-pg/*$pillar*.sql 2>/dev/null | wc -l)
  echo "$pillar pages:$pages services:$services migrations:$migrations"
done
```

**Output:** `/docs/audit/triangle-check.md` — pillars where the triangle is uneven.

**When to run:** monthly.

---

### G.7 — The Investigation Runner

To make these patterns trivially callable, ship `scripts/audit/investigate.sh` that runs all seven and writes outputs into `/docs/audit/`:

```bash
#!/usr/bin/env bash
set -e
mkdir -p docs/audit
echo "Running drift detection..."
bash scripts/audit/drift-check.sh > docs/audit/drift-report.md
echo "Running hidden capability detection..."
bash scripts/audit/hidden-capability.sh > docs/audit/hidden-capabilities.md
echo "Running quality smell detection..."
bash scripts/audit/quality-smells.sh > docs/audit/quality-smells.md
echo "Running narrative opportunity detection..."
bash scripts/audit/narrative-opportunities.sh > docs/audit/narrative-opportunities.md
echo "Running anti-pattern detection..."
bash scripts/audit/anti-patterns.sh > docs/audit/anti-patterns.md
echo "Running triangle check..."
bash scripts/audit/triangle-check.sh > docs/audit/triangle-check.md
echo "Done. See docs/audit/ for outputs."
```

Then add to `package.json`:

```json
"scripts": {
  "anton:investigate": "bash scripts/audit/investigate.sh"
}
```

Anyone — Claude Code, Daniel, a contributor — can now run `pnpm run anton:investigate` and get a fresh full audit in one command. This is the foundation for Phase 2 of the four-phase vision (continuous drift detection).

---

## PART H — Output Conventions

Every change produced under this brief follows the same conventions used in `/docs/architecture/`:

### H.1 Status badges

`✅ Built` / `🟢 Partial` / `📋 Spec-only` / `❌ Future` — applied to every component, table, route, page, or capability claim.

### H.2 File:line citations

Every claim in any new doc cites a source: `server/services/orchestrator-engine.ts:355` style. Every diagram updated under this brief refreshes its **Source-of-truth references** section.

### H.3 PR discipline

Each priority item ships in its own branch and PR. No mega-PRs. PR titles use the priority ID: `C.1: Orchestrator phases 2-4 gating`, `D.1: Risk Atlas public surface`, etc.

### H.4 Diagram refresh

Any change that affects a diagram in `/docs/architecture/` triggers a regeneration of that diagram's source-of-truth section + status badges + regenerated-on date. The README index gets the same date update.

### H.5 Memory updates

After each priority item ships, Claude Code surfaces a one-line memory-update suggestion in the PR description. Daniel applies via `memory_user_edits` in a separate session. (Claude Code does not edit memory directly.)

---

## PART I — Acceptance Criteria

The brief is acceptable when:

1. **Pre-flight passed.** `_audit-notes.md` has a fresh "Pre-flight verification" section with the latest commit SHA and green verdict.
2. **At least three Priority 1 items shipped.** C.1, C.2, C.3 are the minimum viable closure of reality/narrative gaps.
3. **At least two Priority 2 items shipped.** Risk Atlas (D.1) and one of D.2/D.3/D.4.
4. **Investigation runner deployed.** `pnpm run anton:investigate` exists and produces all seven audit outputs into `/docs/audit/`.
5. **Diagrams refreshed.** Every architecture diagram touched by the priority work has updated status badges, citations, and a regenerated date.
6. **Audit dir populated.** `/docs/audit/drift-report.md`, `hidden-capabilities.md`, `quality-smells.md`, `narrative-opportunities.md`, `anti-patterns.md`, `triangle-check.md` exist and are populated from real scans.
7. **Decision points surfaced.** Items that need Daniel's input (C.1 phase 4 inclusion, C.3 promotion vs. document, E.2 transport vs. defer, E.5 Salesforce vs. HubSpot) are flagged in PR descriptions, not silently chosen.

The Priority 3 and Priority 4 items can ship in subsequent sessions — they don't block this brief's closure.

---

## PART J — Maintenance Protocol

These improvements rot just like architecture diagrams. Build the maintenance loop in from day one.

### J.1 Investigation cadence

- **Weekly:** drift detection (G.1), quality smells (G.3) — auto via CI cron or developer-triggered.
- **Monthly:** hidden capabilities (G.2), narrative opportunities (G.4), triangle check (G.6).
- **Quarterly:** anti-patterns (G.5), full architecture-diagram regeneration.
- **Per-release:** all seven, before any minor or major version bump.

### J.2 Issue template

Each audit output that flags a Priority 1 / 2 / 3 issue should auto-create a GitHub issue with:
- The audit pattern that detected it
- The severity
- The file:line reference
- A suggested fix or investigation path

This keeps the queue alive without Daniel having to read seven audit docs every month.

### J.3 Drift response policy

If drift detection (G.1) flags a "high" severity item — pillar count change, licence change, area count drift > 50% — that triggers an immediate strategic review with Daniel. Don't wait for the monthly cadence.

### J.4 The "delete or document" rule

Anything that the audit flags as **built but invisible** for two consecutive monthly runs gets a forcing decision:
- **Document it** (move out of the audit list, ship a marketing one-pager)
- **Delete it** (if it's no longer strategic, remove the dead code)

No third option. This prevents the codebase from accumulating phantom features.

---

## PART K — The Four-Phase Vision

This brief delivers Phase 1. The later phases are flagged for forward orientation only.

**Phase 1 (this brief): Manual investigation + improvement queue.** Claude Code runs the seven audit patterns, ships the priority work, refreshes the diagrams. Daniel reviews and decides.

**Phase 2: Continuous drift detection.** The investigation runner runs in CI on every push to `main`. PRs that fail a drift threshold get flagged automatically. The audit reports live in `/docs/audit/` and update on schedule.

**Phase 3: Auto-prioritisation.** Claude Code reads the audit reports and proposes the next 3–5 highest-leverage work items in a `next-up.md` file, ranked by severity × strategic weight × code blast-radius. Daniel approves; Claude Code ships. The strategic-thinking-partner Claude (this assistant) becomes a curator rather than an originator.

**Phase 4: Self-improving platform.** ANTON itself runs the investigation patterns as ANTON modules. The Coding Area's Tier 1 review capability scans the ANTON repo. The Cross-Workflow Intelligence funnel detects patterns in ANTON's own development. ANTON helps build ANTON. This isn't science fiction — every primitive needed (Coding Area, Pattern Detection, Quality Ratchet, Apprentice Model) already exists. The wiring is the work.

The end state: ANTON's own maintenance becomes one of its capabilities, demonstrated on its own codebase. That's the ultimate proof point for the platform.

---

## PART L — First Step

Claude Code's first action after reading this brief:

1. **Run Part B pre-flight** and append the verification block to `_audit-notes.md`.
2. **Bootstrap the investigation runner** (Part G.7) — get `pnpm run anton:investigate` working before any priority work, even with stub scripts that just `echo "TODO: implement"` initially. The discipline is the value.
3. **Run G.1 (drift) and G.3 (quality smells) for real** — even rough versions. These two outputs sharpen the priority ordering.
4. **Pick the smallest Priority 1 item** as the first ship. C.4 (workflow registry) is small, surgical, and unblocks a documentation gap. C.3 (AppMode promotion) is bigger but still tightly scoped. C.1 (Orchestrator gating) is the highest-leverage but also the largest — leave for after one warm-up ship.
5. **Surface the first decision point to Daniel** before starting C.1 — Phase 4 inclusion is a forking choice that shouldn't be made unilaterally.

Begin.

---

**End of brief.**
