# ANTON — Improvement & Investigation Brief: Addendum 1

> **Audience:** Claude Code
> **Authored by:** Claude (strategic thinking partner) for Daniel Bardun
> **Date:** 26 April 2026
> **Type:** Addendum to `ANTON_Improvement_and_Investigation_Brief.md`
> **Why an addendum:** the original brief omitted four built-but-under-narrated subsystems (Portals, Missions, Specialized Agents, Beehive) and one known production bug. This file extends Priority 1 / Priority 2 / Priority 3 with new items and updates the investigation patterns and acceptance criteria accordingly. **Read the original brief first.** This file refers to its sections by ID (Part C, Part D, etc.) and assumes the conventions in Part H still apply.

---

## What This Addendum Adds

| ID | Title | Priority | Status today |
|---|---|---|---|
| C.5 | Fix `/portals/mine` 500 regression | Priority 1 (bug) | ❌ regression |
| D.5 | **Portals** — public surface + story + bundle docs | Priority 2 | ✅ built, narrative absent |
| D.6 | **Missions** — public surface + autonomous-AI use case library | Priority 2 | ✅ built, narrative absent |
| D.7 | **Specialized Agents (Layer 4)** — surface + Six-Layer Vision tie-in | Priority 2 | ✅ built, narrative absent |
| E.6 | **Beehive** — complete the multi-ANTON deliberation surface | Priority 3 | 🟢 partial |
| G.8 | Investigation pattern: Pillar Maturity Score | Investigation | new pattern |

The acceptance-criteria update is in Part Z at the end.

---

## C.5 — Fix `/portals/mine` 500 Regression (Priority 1, Bug)

**The gap:** `_audit-notes.md` §6 D7 records that `/portals/mine` returns HTTP 500. This is a known regression carried as an open thread from a prior session. It blocks the Portals admin flow. With Portals slated for elevation in D.5, this must be fixed first — there's no point ship­ping marketing material for a broken admin page.

### Acceptance criteria

1. `/portals/mine` returns 200 with the expected portal-list payload for a logged-in user.
2. The root cause is documented in the PR description (which service threw, which migration introduced the issue, which fix was chosen).
3. A regression test is added: `tests/routes/portals-mine.test.ts` covers the happy path + the previously-broken edge case.
4. If the bug exposed a structural issue (e.g. service layering, schema drift), file a follow-up issue using the audit-issue template — don't expand scope inside this PR.

### Investigation protocol

```bash
# Find the route
find server/routes -iname "*portal*"
grep -n "/portals/mine\|portals/mine\|mine'" server/routes/portals*.ts 2>/dev/null

# Find the service it calls
grep -rn "getMyPortals\|listMyPortals\|userPortals" server/services/

# Check the schema it expects
grep -A 20 "CREATE TABLE.*portal" server/db/migrations-pg/*portal*.sql

# Test what's actually thrown
# (Claude Code: reproduce locally, capture stack trace, note the line)

# Check recent commits to portal services for regression candidates
git log --oneline --all -- 'server/services/portal*' 'server/routes/portals*' | head -20
```

### Output

- Bug fix in the relevant service or route file
- Regression test
- PR description with root cause + chosen fix
- Update `_audit-notes.md` §6 D7: change status from "not investigated" to "fixed in commit `<sha>`"

---

## D.5 — Portals: Public Surface + Story + Bundle Docs

### Status today

Portals is **fully built** per the audit:

- 9 portal services in `server/services/portals/` plus the registry-protocol and capability-descriptor service trees (18 portal-related services total per `02-container-diagram.md`)
- 8 admin pages: portals/mine, build, inbox, walkthroughs (per `03-pillar-topology.md`)
- Visitor surface v0.8 (per memory) — landing, discovery, public per-portal pages at `/portals/p/*`
- `portal` is bundle type #41 in `anton-bundler.ts` (per `32-anton-bundle-format.md`)
- Pathfinder anton-portal mode integrates with portals (🟢 — see E.6 dependency)
- Migrations 145–151 + 167 dedicated to portal infrastructure
- Architectural concept: Portals is the **unified public surface** that absorbs Beehive (collaborative deliberation), Marketplace (commerce), and Recruitment/Candidate (talent) as portal types

Yet Portals has zero presence in the v3 whitepaper, no marketing one-pager, no dedicated `/docs/portals/` documentation tree, and (until C.5) a broken admin page.

This is the single most under-narrated asset in ANTON. The "Portals as universal public surface" architectural insight is a category-defining idea — it deserves narration.

### Acceptance criteria

**A. Public-facing entry**

1. The Portals landing page (visitor-facing) gets a clean, marketing-quality treatment — what is a portal, why portals exist, how to discover them via Pathfinder.
2. The admin landing (`/portals/mine` after C.5 is fixed) gets clear "create your first portal" onboarding for new users.
3. Portals is added to the README "Reading order by audience" with its own track: contributor evaluating ANTON's distribution layer.

**B. Documentation tree**

1. `/docs/portals/README.md` — what portals are, how they relate to AAP, Marketplace, and Pathfinder. The "absorbs Beehive / Marketplace / Recruitment" insight written down.
2. `/docs/portals/portal-types.md` — the canonical list of portal sub-types currently supported (deliberation, marketplace, recruitment, knowledge-pack-library, anton-portal, others as discovered in code).
3. `/docs/portals/registry-protocol.md` — short reference for the registry protocol service tree (`registry-protocol/canonical-json.ts`, `envelope.ts`, `homoglyph.ts`) and how it underpins both portals and bundle signing.
4. `/docs/portals/capability-descriptor.md` — what a capability descriptor declares, how peers negotiate.
5. `/docs/portals/extending.md` — how a contributor adds a new portal type.

**C. Marketing one-pager**

1. `/docs/marketing/portals.md` — the strategic story: portals as the architecture that lets every other ANTON capability (deliberation, commerce, talent, knowledge sharing) reach the public web without each needing to invent its own surface.

**D. Architectural diagram refresh**

1. Update `/docs/architecture/33-portals-pathfinder.md` — confirm all surfaces, registry-protocol depth, capability-descriptor depth, list of confirmed portal types, status badges per type.
2. Update `/docs/architecture/04-six-layer-vision.md` — Portals is a major expression of Layer 3 (The Network). Make this explicit.

### Investigation protocol

```bash
# Service depth
ls server/services/portals/
ls server/services/registry-protocol/
ls server/services/registry-client/
ls server/services/capability-descriptor/

# Routes
find server/routes -iname "*portal*"
grep -rn "router.get\|router.post" server/routes/portals*.ts

# Pages
find src/pages -iname "*portal*" -type f

# Bundle integration
grep -n "portal" server/services/anton-bundler.ts

# Migrations dedicated to portals
ls server/db/migrations-pg/*portal*.sql
ls server/db/migrations-pg/14[5-9]*.sql server/db/migrations-pg/15[0-1]*.sql server/db/migrations-pg/167*.sql

# What portal types exist in code today
grep -rn "portal_type\|portalType" server/ src/ --include="*.ts" --include="*.tsx" | head -30

# Pathfinder anton-portal mode integration
grep -rn "anton-portal\|antonPortal" server/services/pathfinder-engine.ts server/services/smart-actions-analyzer.ts
```

### Output files

- `/docs/portals/README.md`
- `/docs/portals/portal-types.md`
- `/docs/portals/registry-protocol.md`
- `/docs/portals/capability-descriptor.md`
- `/docs/portals/extending.md`
- `/docs/marketing/portals.md`
- Updated visitor landing page (existing file in `src/pages/portals/`)
- Updated `/docs/architecture/33-portals-pathfinder.md` and `/docs/architecture/04-six-layer-vision.md`
- Updated `README.md` (the `/docs/architecture/` index)

### Decision point for Daniel

Naming: "Portals" is generic. For external-facing marketing, consider whether a more specific framing helps — "ANTON Portals," "Portal Network," or even bringing back the absorbed-concept names ("the Marketplace lives on Portals," "the Beehive runs on Portals"). Recommend keeping "Portals" as the architectural term and using the absorbed-concept names as the marketing surface for each portal type. Confirm before D.5 ships.

---

## D.6 — Missions: Public Surface + Autonomous AI Use Case Library

### Status today

Missions is **fully built** per the audit:

- 15 mission services (`mission-*.ts`) plus `service-pack-manager.ts` and `seed-templates.ts` in `server/services/missions/`
- 6 dedicated pages: Mission Creator, Dashboard, Inbox, Service Packs, Credential Vault (per `03-pillar-topology.md`)
- 8 migrations (115–122) including `122_missions_grow_bridge.sql` (Missions writes activity into Grow's `grow_signals` and `grow_interactions`)
- Memory positions Missions as the "autonomous business AI hype layer" with seven named missions: **Content Factory, Outbound Sales Machine, E-Commerce Autopilot, Financial Analyst, AI Agency, Property Manager, Trend Scout**

Yet Missions has zero presence in the whitepapers, no marketing one-pager, no use-case library that prospects can actually browse. The "AI influencer / autonomous business" narrative is a market-defining positioning that needs a public artefact.

### Acceptance criteria

**A. Use Case Library (the marquee deliverable)**

1. `/docs/missions/use-cases/` — one Markdown page per named mission. Each page covers:
   - What the mission does (one-paragraph narrative)
   - Who it's for (target user / business)
   - The workflow it runs (steps, frequency, decision points)
   - Inputs the user provides (Service Pack contents, credentials)
   - Outputs delivered (where, how often, what format)
   - Service Pack reference (if templated)
   - Trust phase compatibility (which Orchestrator phase enables what — links back to C.1)
   - A "real example" if one exists (anonymised) or a clearly-marked illustrative one if not
2. The seven named missions get full pages first; additional missions discovered in `seed-templates.ts` get short pages.

**B. Public mission catalogue**

1. `MissionsCatalogPage.tsx` (or extend the existing landing) — public-facing browsable catalogue of missions. Filterable by industry, output type, complexity, trust phase required.
2. Each entry deep-links to the use-case doc + a "Start this mission" CTA that pre-fills the Mission Creator.

**C. Service Packs documentation**

1. `/docs/missions/service-packs.md` — what a service pack is, how `service-pack-manager.ts` provisions them, how a contributor publishes one as a `.anton skill-pack` bundle.
2. The relationship between Missions and the Marketplace (today: missions consume service packs that may live in marketplace; tomorrow: missions themselves marketed as packs).

**D. Credential Vault story**

1. `/docs/missions/credential-vault.md` — what the vault stores, the encryption model, the rotation policy. Critical for enterprise prospects evaluating Missions for Outbound Sales / E-Commerce Autopilot use cases.
2. Cross-reference to the existing security narrative.

**E. Marketing one-pager**

1. `/docs/marketing/missions.md` — the strategic positioning: Missions is ANTON's bet on autonomous AI for business. Not "AI helps you do your job"; "AI runs the function." Tie into the Orchestrator trust progression — Missions are how Phase 3/4 autonomy expresses itself in user-visible value.

**F. Architectural diagram refresh**

1. Update `/docs/architecture/03-pillar-topology.md` — confirm Missions surface depth, named-mission count, service pack architecture.
2. New diagram (or extend existing): how a Mission flows from creation → service pack provision → credential vault binding → workflow execution → trail emission → output delivery. This is a strong sequence diagram candidate.

### Investigation protocol

```bash
# Service depth
ls server/services/missions/
find server/services -name "mission*.ts"

# Named missions in seed templates
cat server/services/missions/seed-templates.ts | head -200

# Pages and routes
find src/pages -iname "*mission*"
find server/routes -iname "*mission*"

# Migrations
ls server/db/migrations-pg/11[5-9]*.sql server/db/migrations-pg/12[0-2]*.sql

# Grow bridge
cat server/db/migrations-pg/122_missions_grow_bridge.sql

# Credential vault implementation
find server -iname "*credential*" -o -iname "*vault*"
grep -rn "CredentialVault\|credential_vault" server/services/

# Service Pack manager
cat server/services/missions/service-pack-manager.ts | head -100

# Workflow engine integration (missions presumably use the workflow engine)
grep -rn "workflow_executor\|workflowExecutor" server/services/mission-*.ts
```

### Output files

- `/docs/missions/README.md`
- `/docs/missions/use-cases/content-factory.md`
- `/docs/missions/use-cases/outbound-sales-machine.md`
- `/docs/missions/use-cases/ecommerce-autopilot.md`
- `/docs/missions/use-cases/financial-analyst.md`
- `/docs/missions/use-cases/ai-agency.md`
- `/docs/missions/use-cases/property-manager.md`
- `/docs/missions/use-cases/trend-scout.md`
- `/docs/missions/service-packs.md`
- `/docs/missions/credential-vault.md`
- `/docs/missions/extending.md` (how to define a new mission)
- `/docs/marketing/missions.md`
- `src/pages/missions/MissionsCatalogPage.tsx` (or extension of existing)
- Updated `/docs/architecture/03-pillar-topology.md`
- New mission-flow diagram (extension of `/docs/architecture/24-workflow-engine.md` or a dedicated file)

### Decision point for Daniel

The seven named missions in memory are positioning, not necessarily what's seeded in code. Before D.6 ships, Claude Code must reconcile: which missions are seeded in `seed-templates.ts`, which are marketing-only, which are partially scaffolded. The use-case library should ship for the **seeded** ones first; marketing-only missions get clearly-marked "coming soon" pages or are deferred.

---

## D.7 — Specialized Agents (Layer 4): Surface + Six-Layer Vision Tie-In

### Status today

Specialized Agents (Layer 4 of the Six-Layer Vision) is **fully built** per the audit:

- `agent-service.ts`, `agent-processor.ts`, `agent-builder.ts`, `agent-connector-executor.ts`, `remote-agent-client.ts` — five core services
- Migration 111 dedicated to agents
- `routes/agents.ts` registered
- Specialized Agents Hub appears on the pillar-topology diagram as a "Cross-pillar surface" ✅
- The `remote-agent-client.ts` suggests AAP-via-agents — agents reachable across ANTON instances

Yet the relationship to Layer 4 (Collaborative Intelligence) of the Six-Layer Vision is implicit, not narrated. And the cross-pillar nature — agents that can act across Work, Markets, Grow, Missions — is a major story untold.

### Acceptance criteria

1. `/docs/agents/README.md` — what Specialized Agents are, how they relate to Layer 4 of the Six-Layer Vision, how they differ from Missions (Missions are templated business workflows; agents are reusable cross-pillar primitives that Missions and other surfaces compose).
2. `/docs/agents/builder.md` — how `agent-builder.ts` lets a user define a new specialized agent.
3. `/docs/agents/connector-executor.md` — how agents reach external systems.
4. `/docs/agents/remote-agents.md` — the AAP-via-agents story (cross-instance agents).
5. `/docs/marketing/specialized-agents.md` — the strategic positioning: agents are how Layer 4 (Collaborative Intelligence) becomes a user-visible primitive.
6. Update `/docs/architecture/04-six-layer-vision.md` to make the Layer 4 → Specialized Agents mapping explicit.
7. New architectural diagram (optional but recommended): `/docs/architecture/27-specialized-agents.md` — an agent's lifecycle from build → register → invoke → emit trail.

### Investigation protocol

```bash
# Service tree
find server/services -name "agent-*.ts" -o -name "*agent*.ts" | grep -v test
ls server/services/agent-*.ts

# Schema
cat server/db/migrations-pg/111*.sql 2>/dev/null

# Routes
cat server/routes/agents.ts

# Pages (if any)
find src/pages -iname "*agent*" -not -name "*Agent*Hub*"
grep -rn "SpecializedAgent\|AgentHub" src/components/

# Remote agents
cat server/services/remote-agent-client.ts | head -80

# Agent invocation from other pillars
grep -rn "agent-service\|agentService\|invokeAgent" server/services/ --include="*.ts"
```

### Output files

- `/docs/agents/README.md`
- `/docs/agents/builder.md`
- `/docs/agents/connector-executor.md`
- `/docs/agents/remote-agents.md`
- `/docs/marketing/specialized-agents.md`
- `/docs/architecture/27-specialized-agents.md` (new — extends Group 3)
- Updated `/docs/architecture/04-six-layer-vision.md`

---

## E.6 — Beehive: Complete the Multi-ANTON Deliberation Surface

### Status today

Beehive is **🟢 partial** per the audit:

- 9 `beehive-*.ts` files in services
- Migrations 107–109 and 113–114 dedicated
- Memory positions Beehive as "core Layer 4 expression" (Collaborative Intelligence) — multi-ANTON group deliberation via AAP, signed attribution, knowledge boundary controls, `.anton` collaborative bundles
- Per `03-pillar-topology.md`: "deliberation surface partly wired"

The architectural insight — multiple ANTONs from different owners forming persistent collaborative reasoning sessions — is one of ANTON's most distinctive ideas. Today the deliberation UI doesn't fully express it.

### Acceptance criteria

1. `BeehivePage.tsx` (or extend existing) — the canonical deliberation surface. A user can:
   - Create a Beehive (collaborative session) with N other ANTON instances by contact-hash
   - See each peer's signed contributions with author attribution
   - Set knowledge-boundary controls (which atoms / sources each peer may see)
   - Export the session as a `.anton evidence-pack` or a dedicated `.anton beehive-session` bundle (decide which)
2. Backend: `beehive-service.ts` aggregates contributions across peers, enforces knowledge boundaries, and emits a `revelation_chain` per deliberation (re-uses IRE persistence per the established convention — does not invent a new trail format).
3. AAP integration: each peer contribution travels via the AAP transport (today `aap-rollout-bridge.ts`; long-term per E.2 in original brief).
4. Update the bundle registry: if a `beehive-session` type is needed and not already in the 45-type union, propose it explicitly. If `evidence-pack` covers it, document the reuse.
5. Update `/docs/architecture/03-pillar-topology.md`, `/docs/architecture/04-six-layer-vision.md` (Layer 4), and `/docs/architecture/30-aap-protocol.md` to reflect Beehive as a primary AAP consumer.
6. `/docs/marketing/beehive.md` — the story: collaborative reasoning where each participant's ANTON is a signed, attributable participant. Not "share a doc" — "co-think with cryptographic attribution."

### Investigation protocol

```bash
# Service tree
ls server/services/beehive-*.ts
find server/services -name "*beehive*" | head -20

# Schema
cat server/db/migrations-pg/10[7-9]*.sql 2>/dev/null
cat server/db/migrations-pg/11[3-4]*.sql 2>/dev/null

# UI surface today
find src/pages -iname "*beehive*"
grep -rn "Beehive" src/components/

# AAP integration
grep -rn "beehive" server/services/aap-rollout-bridge.ts server/services/community-* 2>/dev/null

# Bundle types — is there already a beehive type?
grep -i "beehive" server/services/anton-bundler.ts

# Knowledge boundary enforcement
grep -rn "knowledge.*boundary\|knowledgeBoundary\|atom.*scope" server/services/beehive-*.ts 2>/dev/null
```

### Output files

- Extended or new `src/pages/beehive/BeehivePage.tsx`
- Extended `server/services/beehive-service.ts`
- Migration if a new bundle type is added
- `/docs/marketing/beehive.md`
- Updated `/docs/architecture/03-pillar-topology.md`, `04-six-layer-vision.md`, `30-aap-protocol.md`

### Decision point for Daniel

Bundle type choice: reuse `evidence-pack` (existing, signed, well-understood) vs. introduce `beehive-session` as a new type (a 46th in the union). Recommend reuse to avoid bundle-type proliferation, but Beehive's knowledge-boundary semantics may justify a dedicated type. Confirm before E.6 ships.

---

## G.8 — Investigation Pattern: Pillar Maturity Score

The seven investigation patterns in the original brief catch drift, hidden capabilities, quality smells, narrative gaps, anti-patterns, and triangle imbalance. They don't yet capture **per-pillar maturity** — a single score that says how complete each pillar is across UI, services, schema, tests, and docs.

This pattern is added because the addendum makes pillar-level maturity the central axis. Portals, Missions, and Specialized Agents all need elevation; their maturity scores tell us where to focus.

### What it computes

For each pillar (Work, School, Life, Pathfinder, Markets, Community, Payments, Portals, Missions, Procure, Civic, Grow — plus Risk Atlas, Coding, Hardware, Beehive, Specialized Agents as cross-pillar surfaces):

- **UI Score:** number of pages × wiring completeness (toggled via AppMode = full credit; path-routed = half credit; orphan pages = no credit)
- **Service Score:** number of services / 10 (capped at 1.0)
- **Schema Score:** number of dedicated migrations / 5 (capped at 1.0)
- **Test Score:** services with test coverage / total services (in this pillar)
- **Doc Score:** marketing docs (1) + contributor docs (1) + architecture diagrams (1) → 3 max, normalised
- **Composite:** weighted average (UI 25%, Service 25%, Schema 20%, Test 15%, Doc 15%)

### How to run

```bash
bash scripts/audit/pillar-maturity.sh > docs/audit/pillar-maturity.md
```

The script enumerates each pillar's presence across the five dimensions and outputs a Markdown table sorted by composite score ascending (least mature first — these are the priority targets).

### Output

`/docs/audit/pillar-maturity.md` — a table like:

```
| Pillar | UI | Service | Schema | Test | Doc | Composite | Action |
|---|---|---|---|---|---|---|---|
| Beehive | 0.5 | 0.9 | 0.6 | 0.3 | 0.1 | 0.51 | Complete UI + docs (E.6) |
| Missions | 1.0 | 1.0 | 0.8 | 0.4 | 0.2 | 0.72 | Ship docs + use cases (D.6) |
| Portals | 1.0 | 1.0 | 1.0 | 0.5 | 0.1 | 0.79 | Ship docs + marketing (D.5) |
| Markets | 1.0 | 1.0 | 1.0 | 0.6 | 0.4 | 0.83 | Ship Consul Council UI (E.4) |
| Work | 1.0 | 1.0 | 1.0 | 0.7 | 0.8 | 0.92 | Maintain |
```

### When to run

Monthly. Before any major release. Before any whitepaper update.

### Decision rule

Any pillar with composite < 0.6 triggers a "completion sprint" decision (ship the missing dimensions or formally defer the pillar to a future release).

---

## Z. Acceptance-Criteria Update

Replacing Part I of the original brief:

The original brief + this addendum together are acceptable when:

1. **Pre-flight passed** (original Part B). ✅ unchanged.
2. **Priority 1 includes the bug fix.** C.1, C.2, C.3, C.4, **C.5** — minimum three of these five shipped, and C.5 is mandatory (it blocks D.5).
3. **Priority 2 includes Portals + Missions.** Original D.1, D.2, D.3, D.4 + new **D.5, D.6, D.7**. Of these seven, at least four shipped, and **D.5 + D.6 are mandatory** — they are the headline elevation work this addendum exists to specify.
4. **Investigation runner deployed** with all eight patterns (original G.1–G.7 + new G.8).
5. **Diagrams refreshed.** Every architecture diagram touched by C.5, D.5, D.6, D.7, E.6 has updated status badges, citations, regenerated date.
6. **Audit dir populated.** Original six audit outputs + `pillar-maturity.md`.
7. **Decision points surfaced.** New ones added by this addendum:
   - D.5 Portals naming (architectural term vs. marketing surface per portal type)
   - D.6 Missions seed reconciliation (which named missions are seeded vs. marketing-only)
   - E.6 Beehive bundle type choice (reuse `evidence-pack` vs. new `beehive-session` type)

Priority 3 and Priority 4 from the original brief still don't block addendum closure — they ship in subsequent sessions.

---

## Sequencing Recommendation

The addendum doesn't change the original brief's recommended first ship (C.4 — workflow registry, smallest blast radius). But after C.4, the recommended order becomes:

1. **C.5** — fix `/portals/mine` 500. Required before D.5.
2. **C.3** — Procure/Civic/Grow → AppMode. Tightly scoped UX cleanup.
3. **D.5** — Portals elevation. Once C.5 is fixed, this is mostly documentation work and can ship fast.
4. **D.6** — Missions elevation. Pairs naturally with D.5 — both are "narrate the new pillars" work.
5. **C.1** — Orchestrator phases 2–4 gating. The biggest item; needs Daniel's Phase-4 decision first.
6. **C.2** — Reasoning Trails consolidated viewer. Bigger UI lift; do after the gating story is clear.
7. **D.7, E.6** — Specialized Agents docs + Beehive completion. Both tie into Layer 4 of the Six-Layer Vision; can ship in either order.
8. **D.1, D.2, D.3, D.4** — remaining elevation work from original brief.
9. **E.1–E.5** — partial-feature completion from original brief.
10. **F.1–F.5** — quality / security / performance investigation pass.

This sequence puts narrative completeness ahead of feature completeness — which matches what the platform needs right now.

---

**End of Addendum 1.**
