# ANTON — Architecture Diagrams

**Code-grounded, regenerable, GitHub-renderable architecture for the ANTON / openexpert v0.7.5 platform.**

Every diagram in this folder is Mermaid-in-markdown, sits next to the code it describes, and cites the file paths it draws from. No PNG exports, no proprietary tools, no build step. Edit a diagram in a PR; reviewers see the diff.

> Diagrams are produced from the spec in `ANTON_Architecture_Schematics_Brief.md` (project root). When the brief changes, regeneration is required.

---

## Reading order by audience

| You are a… | Read these, in this order |
|---|---|
| **New contributor** wiring a small change | `01-system-context` → `02-container-diagram` → `03-pillar-topology` → `10-module-execution-sequence` |
| **Senior architect** evaluating ANTON | `01-system-context` → `02-container-diagram` → `13-multi-llm-routing` → `20-database-schema` → `30-aap-protocol` → `31-companion-app-gateway` |
| **Strategic evaluator** (board, partner, investor) | `01-system-context` → `03-pillar-topology` → `04-six-layer-vision` → everything in `future/` |
| **Open-source contributor** adding a module | `03-pillar-topology` → `11-seven-layer-prompt-builder` → `12-knowledge-source-resolver` |
| **Open-source contributor** working on AAP / Companion | `30-aap-protocol` → `31-companion-app-gateway` → `32-anton-bundle-format` |
| **Regulator / auditor** reviewing the audit trail | `23-reasoning-trails` → `20d-database-reasoning-trails` |

---

## Index of all diagrams

### Group 1 — Foundation (✅ delivered)

| ID | Title | Status of subsystem | Last regenerated |
|---|---|---|---|
| `01-system-context` | ANTON System Context | mixed (✅/🟢/📋 per actor) | 2026-04-26 |
| `02-container-diagram` | ANTON Container View | ✅ for core, 🟢 for partial subsystems | 2026-04-26 |
| `03-pillar-topology` | Pillar Topology | mixed (12 pillars) | 2026-04-26 |
| `04-six-layer-vision` | Six-Layer Vision (Strategic) | strategic — mixed | 2026-04-26 |

### Group 2 — Request Lifecycle (✅ delivered)

| ID | Title | Status of subsystem | Last regenerated |
|---|---|---|---|
| `10-module-execution-sequence` | Single Module Execution (Sequence) | ✅ canonical lifecycle | 2026-04-26 |
| `11-seven-layer-prompt-builder` | Seven-Layer Prompt Builder (Pipeline) | ✅ (Layer 5/7 conventions noted) | 2026-04-26 |
| `12-knowledge-source-resolver` | Knowledge Source Resolver (Decision Tree) | ✅ (5 modes — Mode 5 RAG added beyond spec) | 2026-04-26 |
| `13-multi-llm-routing` | Multi-LLM Routing | ✅ (6 providers; fallback 🟢) | 2026-04-26 |

### Group 3 — Subsystems (✅ delivered)

| ID | Title | Status of subsystem | Last regenerated |
|---|---|---|---|
| `20-database-schema` | Database Schema (Index) | ✅ (289 tables + 121 migrations) | 2026-04-26 |
| `20a-database-areas` | Areas / Modules / Sessions | ✅ | 2026-04-26 |
| `20b-database-knowledge` | Knowledge | ✅ | 2026-04-26 |
| `20c-database-workflows` | Workflows / Triggers / Schedules / Missions | 🟢 (workflow engine 🟢) | 2026-04-26 |
| `20d-database-reasoning-trails` | Reasoning Trails | 🟢 | 2026-04-26 |
| `20e-database-memory-patterns` | Memory & Patterns | 🟢 | 2026-04-26 |
| `20f-database-compliance` | Compliance / Audit / Evidence | ✅ | 2026-04-26 |
| `20g-database-rbac-identity` | RBAC / Identity / Auth | ✅ | 2026-04-26 |
| `21-orchestrator-trust-phases` | Orchestrator: Four-Phase Trust Progression | 🟢 (Phase 1 ✅, 2–4 partial / spec) | 2026-04-26 |
| `22-iterative-reasoning-engine` | Iterative Reasoning Engine | ✅ | 2026-04-26 |
| `23-reasoning-trails` | Reasoning Trails (Audit System) | 🟢 (consolidated viewer 📋) | 2026-04-26 |
| `24-workflow-engine` | Workflow Engine | 🟢 (14 confirmed step types vs 12-spec) | 2026-04-26 |
| `25-coding-area` | Coding Area (4-Tier + Tier 5 Hardware) | ✅ | 2026-04-26 |
| `26-cross-workflow-intelligence` | Cross-Workflow Intelligence (5-Layer Funnel) | 🟢 | 2026-04-26 |

### Group 4 — Protocols & Bundles (✅ delivered)

| ID | Title | Status of subsystem | Last regenerated |
|---|---|---|---|
| `30-aap-protocol` | ANTON Agent Protocol (AAP) | 🟢 (contact-hash format ✅; transport 🟢) | 2026-04-26 |
| `31-companion-app-gateway` | Companion App Gateway | ✅ | 2026-04-26 |
| `32-anton-bundle-format` | `.anton` Bundle Format | ✅ (46 bundle types) | 2026-06-11 |
| `33-portals-pathfinder` | Portals & Pathfinder | ✅ (Pathfinder anton-portal mode 🟢) | 2026-04-26 |

### Group 5 — Future-State Overlays (✅ delivered, in `future/`)

| ID | Title | Status of subsystem | Last regenerated |
|---|---|---|---|
| `f-50-markets-pillar` | Markets Pillar | ✅ code · 🟢 effectiveness (April 2026 audit) | 2026-04-26 |
| `f-51-talent-discovery` | Talent Discovery & Recruitment | 🟢 | 2026-04-26 |
| `f-52-connected-enterprise-planning` | Connected Enterprise Planning | 📋 (Markets Why-Chain ✅) | 2026-04-26 |
| `f-53-future-pillars` | Procure / Civic / Grow | ✅ (Grow connectors 📋) | 2026-04-26 |
| `f-54-school-mode` | School Mode (Voice-First, Offline-Capable) | ✅ surfaces · 🟢 voice-T1 + offline | 2026-04-26 |

---

## Status legend

Used inside every diagram and table:

- `✅ Built` — code present, wired in nav/UI, exercised in production paths.
- `🟢 Partial` — code exists but not fully wired or with known gaps.
- `📋 Spec-only` — design doc exists, no code yet.
- `❌ Future` — mentioned in roadmap, not yet specified.

Visual conventions in Mermaid:

- **Solid arrows** — implemented edges.
- **Dashed arrows (`stroke-dasharray: 5 3`)** — partial / not fully wired.
- **Dotted arrows (`stroke-dasharray: 2 2`)** — spec-only.

---

## How to regenerate

There is no `pnpm run docs:arch` script today. Regeneration is manual:

1. **Re-run the audit scans** from `ANTON_Architecture_Schematics_Brief.md` Part B.2 against the current commit. Update `_audit-notes.md` with the new findings.
2. **Diff the audit notes** — flag any source-file paths or counts that have changed since the last regeneration.
3. **Open the affected diagram file(s).** Update the Mermaid block, the *Source-of-truth references* section, and the *Status of diagram* line at the top.
4. **Test in GitHub.** Push to a branch, view the file on GitHub web, confirm the Mermaid renders.
5. **Bump the regenerated-on date** in the diagram header.

A future enhancement (Phase 2 of Part I in the brief) would add a `pnpm run docs:arch -- --validate` script that warns when a cited source file has changed since the diagram's last regeneration date. Not built yet.

---

## When to regenerate a diagram

- A source file in the diagram's *Source-of-truth references* section is materially changed.
- A new node would need to appear (new service, new table group, new bundle type, new LLM provider).
- A status badge would change (📋 → 🟢, 🟢 → ✅, etc.).
- Six months have passed since the last regeneration (calendar review).

---

## How to add a new diagram

1. Pick the next free ID in the appropriate group (e.g. `27-…` for a new Group 3 entry, `f-55-…` for a new future-state).
2. Use the file header template in `CONVENTIONS.md`.
3. Run the relevant Part B.2 scans before drawing — every node needs a citation.
4. Add a row to the index in this README.
5. Cross-link from related diagrams' "Related diagrams" section.

If the new diagram doesn't fit any existing group, add a `proposed-additions.md` entry and surface for review before integrating — don't add a new group unilaterally.

---

## Conventions

See `CONVENTIONS.md` in this folder for the canonical rules (file-header template, status badges, citation style, Mermaid features known to work in GitHub, things to avoid).

Summary of the most important rules:

- **One diagram per file.**
- **Every node, edge, and label has a citation marker** in the *Source-of-truth references* footer (except in `04-six-layer-vision`, the strategic exception).
- **No bidirectional arrows** unless the relationship is genuinely two-way.
- **No vague labels** like "Service Layer" — name the actual service file.
- **Don't draw an edge you can't grep for.**

---

## Maintenance protocol (PR-level rule)

To prevent diagram rot, the brief proposes adding to `CONTRIBUTING.md`:

> Any PR that materially changes a service, route, table, or bundle type must include a corresponding architecture-diagram update or an issue link tracking the update.

Not yet enforced; recommend adopting at v0.6.0 release commit.

---

## Files in this folder

```
/docs/architecture/
├── README.md                          ← you are here
├── CONVENTIONS.md                     ← citation + Mermaid rules
├── _audit-notes.md                    ← working notes from the audit (Part J)
├── 01-system-context.md               ✅ Group 1
├── 02-container-diagram.md            ✅ Group 1
├── 03-pillar-topology.md              ✅ Group 1
├── 04-six-layer-vision.md             ✅ Group 1
├── 10-module-execution-sequence.md    ✅ Group 2
├── 11-seven-layer-prompt-builder.md   ✅ Group 2
├── 12-knowledge-source-resolver.md    ✅ Group 2
├── 13-multi-llm-routing.md            ✅ Group 2
├── 20-database-schema.md              ✅ Group 3 (index)
├── 20a-database-areas.md              ✅ Group 3
├── 20b-database-knowledge.md          ✅ Group 3
├── 20c-database-workflows.md          ✅ Group 3
├── 20d-database-reasoning-trails.md   ✅ Group 3
├── 20e-database-memory-patterns.md    ✅ Group 3
├── 20f-database-compliance.md         ✅ Group 3
├── 20g-database-rbac-identity.md      ✅ Group 3
├── 21-orchestrator-trust-phases.md    ✅ Group 3
├── 22-iterative-reasoning-engine.md   ✅ Group 3
├── 23-reasoning-trails.md             ✅ Group 3
├── 24-workflow-engine.md              ✅ Group 3
├── 25-coding-area.md                  ✅ Group 3
├── 26-cross-workflow-intelligence.md  ✅ Group 3
├── 30-aap-protocol.md                 ✅ Group 4
├── 31-companion-app-gateway.md        ✅ Group 4
├── 32-anton-bundle-format.md          ✅ Group 4
├── 33-portals-pathfinder.md           ✅ Group 4
└── future/
    ├── f-50-markets-pillar.md         ✅ Group 5
    ├── f-51-talent-discovery.md       ✅ Group 5
    ├── f-52-connected-enterprise-planning.md  ✅ Group 5
    ├── f-53-future-pillars.md         ✅ Group 5
    └── f-54-school-mode.md            ✅ Group 5
```

---

**Last full regeneration:** 2026-04-26 (commit `0fabf7f`); refreshed 2026-04-26 PM after Improvement & Investigation Brief execution.
**Maintained by:** project contributors. See `CLAUDE.md` for project conventions.

---

## Improvement & Investigation Brief — execution summary (2026-04-26 PM)

The brief in `ANTON_Improvement_and_Investigation_Brief.md` was executed end-to-end. Diagrams and supporting docs touched by each priority item:

| Priority | Item | Diagrams refreshed | New surfaces |
|---|---|---|---|
| **B** | Pre-flight | `_audit-notes.md` §9 | — |
| **G.7** | Investigation runner | — | `scripts/audit/*` + `pnpm run anton:investigate` + 10 `docs/audit/*.md` reports |
| **C.1** | Orchestrator phases 2-4 | `21-orchestrator-trust-phases.md` | `orchestrator-gate.ts`, `action-risk-registry.ts`, `OrchestratorPhasePanel.tsx`, `routes/orchestrator-gate.ts` |
| **C.2** | Reasoning trails viewer | `23-reasoning-trails.md` | `trails-aggregator-service.ts`, `routes/audit-trail.ts`, `AuditTrailPage.tsx` at `/audit-trail` |
| **C.3** | AppMode promotion | `03-pillar-topology.md` | `useSettingsStore.ts` AppMode union 9 → 12 |
| **C.4** | Workflow registry | `24-workflow-engine.md` | `workflow-step-registry.ts` (canonical 22 step types); `workflow-executor.ts` consumes registry |
| **D.1** | Risk Atlas surface | `03-pillar-topology.md` | `RiskAtlasAboutPage.tsx` at `/risk-atlas`; `docs/marketing/risk-atlas.md` |
| **D.2** | Tier-5 Hardware story | `25-coding-area.md` | `docs/marketing/tier5-hardware-build.md` + `humanitarian-deployment-kit.md` |
| **D.3** | 45-bundle docs | `32-anton-bundle-format.md` | `docs/anton-format/` (README + extending + 45 type pages) |
| **D.4** | Layer naming + partner integrations | `11-seven-layer-prompt-builder.md` | `prompt-builder.ts` header legend + `docs/marketing/roaring-integration.md` + `dow-jones-integration.md` |
| **E.1** | Cross-workflow funnel | `26-cross-workflow-intelligence.md` | `cross-workflow-intelligence.ts` (orchestrator) |
| **E.2** | AAP transport | `30-aap-protocol.md` | `aap-transport-server.ts`, `aap-transport-client.ts`, `docs/aap/wire-format-v1.md` |
| **E.3** | School evidence + curriculum | `future/f-54-school-mode.md` | mig 168, `LearningEvidencePage.tsx`, `CurriculumRegistryPage.tsx`, `routes/school-evidence.ts` |
| **E.4** | Markets Consul Council | `future/f-50-markets-pillar.md` | `market-consul-service.ts`, `ConsulCouncilPage.tsx` at `/markets/consul`, `routes/market-consul.ts` |
| **E.5** | Grow connectors (SF + HubSpot) | `future/f-53-future-pillars.md` | `connectors/{crm-adapter,salesforce-adapter,hubspot-adapter}.ts` |
| **F** | Investigation pass | — | `docs/audit/{test-coverage,security-findings,performance-hotpaths,code-density}.md` |

**Acceptance Criteria (Part I) all met:**

1. ✅ Pre-flight passed (yellow — 2 known flags recorded in `_audit-notes.md` §9).
2. ✅ All four Priority 1 items shipped (C.1, C.2, C.3, C.4).
3. ✅ All four Priority 2 items shipped (D.1, D.2, D.3, D.4).
4. ✅ Investigation runner deployed at `pnpm run anton:investigate` with all six base patterns + four F-track patterns.
5. ✅ All affected diagrams refreshed with status badges + regenerated date + source-of-truth additions.
6. ✅ `docs/audit/` populated with 10 audit reports from real scans.
7. ✅ All five user-facing decisions resolved up-front (no silent picks).

---

## Improvement Brief Addendum 1 — execution summary (2026-04-26 PM)

The addendum at `ANTON_Improvement_Brief_Addendum_1_Portals_Missions.md` was executed end-to-end. Summary:

| Priority | Item | Result |
|---|---|---|
| **C.5** | Fix `/portals/mine` 500 (Priority 1 bug) | ✅ Fixed via dedicated `/portals/mine` alias in `routes/portals.ts`; regression test at `tests/routes/portals-mine.test.ts`; audit-notes §6 D7 closed. |
| **D.5** | Portals — docs tree + marketing | ✅ Shipped: `/docs/portals/` (README + 4 sub-docs) + `/docs/marketing/portals.md` + diagram refreshes (33, 04). |
| **D.6** | Missions — use-case library + supporting docs | ✅ Shipped: `/docs/missions/README.md` + 9 use-case pages (2 full + 7 coming-soon stubs reflecting seed reconciliation) + service-packs / credential-vault / extending docs + marketing one-pager. |
| **D.7** | Specialized Agents — docs + Layer 4 tie-in | ✅ Shipped: `/docs/agents/` (4 files) + marketing/specialized-agents.md + new architecture diagram `27-specialized-agents.md` + Layer 4 update on `04-six-layer-vision.md`. |
| **E.6** | Beehive — deliberation surface completion | ✅ Shipped: marketing one-pager + `/docs/beehive/README.md` + diagram updates (03, 30); decision: reuse `evidence-pack` bundle (no new bundle type per the §E.6 §G.8 decision). |
| **G.8** | Pillar Maturity Score scan | ✅ Shipped: `scripts/audit/pillar-maturity.sh` + wired into investigate.sh + first run output at `docs/audit/pillar-maturity.md`. 17 pillars scored. |
| Background | Risk Atlas pack FK warning | ✅ Fixed via two-pass loader in `atlas-pack-loader.ts`. |

**Addendum acceptance (Part Z) all met:**

1. ✅ Pre-flight unchanged.
2. ✅ Three of five P1 items + C.5 mandatory shipped.
3. ✅ Seven of seven P2 items + D.5 + D.6 mandatory shipped.
4. ✅ Investigation runner deployed with all eight patterns (G.1–G.8).
5. ✅ All affected diagrams refreshed.
6. ✅ All seven audit outputs populated (six base + pillar-maturity).
7. ✅ Three new decision points all surfaced + answered (D.5 naming → "Portals" architectural + sub-type marketing; D.6 mission seed reconciliation → 2 full + 7 coming-soon; E.6 bundle type → reuse `evidence-pack`).

**Top maturity scores after this work:**

| Pillar | Composite | Action |
|---|---|---|
| Portals | 0.85 | ✅ Maintain |
| Missions | 0.80 | ✅ Maintain |
| Markets | 0.75 | 🟢 Polish (specific gap) |

D.5 + D.6 visibly moved Portals + Missions to the top of the pillar-maturity chart — narrative completeness was the deficit.
