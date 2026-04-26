# ANTON — Architecture Schematics: Claude Code Brief

> **Audience:** Claude Code
> **Authored by:** Claude (strategic thinking partner) for Daniel Bardun
> **Date:** 26 April 2026
> **Type:** Investigation-first specification for generating a living architecture-diagram set
> **Output home:** `/docs/architecture/` in the `altspace-hub/ANTON` repo
> **First action for Claude Code:** Read this brief fully. Then scan the repo per Part B before drawing a single diagram. Do not generate diagrams from this brief alone — every schematic must be backed by code.

---

## 0. Why This Exists

ANTON has grown faster than its documentation. The v2 and v3 whitepapers describe the platform as it was in February 2026; memory describes the v0.6.0 batch (Orchestrator, IRE, Pathfinder, Markets, School, Life, AAP, Companion App Gateway, Talent Discovery, Portals); the actual code is somewhere ahead of both.

What's missing is a **single, code-grounded, visual map** of how ANTON actually works. Every contributor to an open-source project deserves one. Every enterprise evaluating ANTON deserves one. Every strategic conversation about Procure/Civic/Grow/Markets becomes faster when there's a shared mental model.

This brief asks Claude Code to produce that map — as **architecture-as-code**, in Mermaid, sitting next to the source it describes, regenerable when things change.

---

## PART A — Goals & Non-Goals

### A.1 Goals

1. **Code-grounded.** Every diagram is generated from (or directly verifiable against) actual files. Every entity in a diagram cites the file path and line range that defines it.
2. **Layered.** Different audiences need different altitudes. A Mistral evaluator needs the System Context diagram. A new contributor wiring a new module needs the Request Lifecycle diagram. A regulator reviewing the audit trail needs the Reasoning Trails sequence diagram.
3. **Honest about state.** Every diagram element carries a status badge: ✅ Built / 🟢 Partial / 📋 Spec-only / ❌ Future. Aspirational components are visible but clearly marked.
4. **Maintainable.** Mermaid in markdown, in the repo, version-controlled. Anyone can edit a diagram in a PR. No proprietary tools, no PNG exports drifting from source.
5. **Open-source-friendly.** Renders in GitHub natively. Copy-pasteable into issues. No build step.

### A.2 Non-Goals

- This is **not** a UI design exercise. No wireframes, no Figma, no screen mockups.
- This is **not** a re-write of the whitepapers. The whitepapers are narrative; these are technical reference.
- This is **not** speculative. If the audit can't confirm it, it's marked `📋 Spec-only` or omitted.
- This is **not** a one-shot generation. The output includes a regeneration protocol so the diagrams stay alive.

### A.3 Definition of "Good"

A new contributor lands on `/docs/architecture/README.md`, reads three diagrams, and understands within 20 minutes:
- What ANTON is composed of
- How a single user request flows from click to delivered output
- Where their work would slot in

A senior architect lands on the same page and within 60 minutes can answer:
- What's the auth model?
- How does the multi-LLM routing decide?
- What does the database persist?
- What's the boundary between ANTON Core, AAP, and Companion App Gateway?
- What's built vs. spec'd vs. future?

---

## PART B — Investigation-First Protocol

Claude Code must complete the following audit **before** drawing any diagram. Anything not confirmed in this audit goes into the "needs clarification" appendix, not into a diagram.

### B.1 Ground rules

1. **No diagrams from memory.** Read the code first.
2. **Cite every claim.** Every node, edge, and label in a diagram must be traceable to a file path with line range. Citations live in a per-diagram footer.
3. **Status badges are mandatory.** Use the four-state convention. Never let an aspirational component look built.
4. **Cross-check three sources** for each subsystem: (a) the code, (b) the most recent whitepaper part, (c) `ANTON_Current_State_Brief.md` and `ANTON_CURRENT_STATE_v1.md` if it exists. When they conflict, the code wins.
5. **Don't invent edges.** If you can't find the import, the call, the route, or the message — don't draw the connection.

### B.2 Required scans

Run these scans and capture their outputs into a working notes file (`/docs/architecture/_audit-notes.md`, not committed to main).

```bash
# B.2.1 Repo identity
git remote -v
git rev-parse HEAD
cat package.json | grep -E '"name"|"version"|"license"'
ls -la VERSION CHANGELOG.md LICENSE 2>/dev/null

# B.2.2 Top-level structure
find . -maxdepth 2 -type d -not -path './node_modules*' -not -path './.git*' | sort

# B.2.3 Pillars in nav
grep -rn "Work\|School\|Life\|Markets\|Procure\|Civic\|Grow" src/App.tsx src/Router*.tsx src/components/Nav* 2>/dev/null

# B.2.4 Areas and modules
find src/lib -name "constants.ts" -o -name "areas.ts" -o -name "modules.ts"
find server/areas -maxdepth 1 -type d | sort
find server/areas -name "system-prompt.md" | wc -l

# B.2.5 Services and routes
find server/services -name "*.ts" | sort
find server/routes -name "*.ts" | sort
find src/pages -name "*.tsx" | sort

# B.2.6 Database schema
find server/db -name "*.sql"
grep "CREATE TABLE" server/db/schema*.sql | sed 's/CREATE TABLE[^a-z_]*//' | sed 's/[ (].*//' | sort

# B.2.7 LLM providers
find server/services -iname "*adapter*" -o -iname "*llm*" -o -iname "*provider*"
grep -rn "anthropic\|openai\|mistral\|ollama\|gemini\|azure_openai" server/services --include="*.ts" | head -50

# B.2.8 Knowledge sources
find server/services -iname "*knowledge*" -o -iname "*folder*" -o -iname "*indexer*"
grep -rn "claudeKnowledge\|onlineReference\|localFolder\|combined" server/ --include="*.ts" | head -30

# B.2.9 Workflow engine
find server -iname "*workflow*" -type f
grep -rn "step_type\|workflow_step\|cron\|schedule" server/db/schema*.sql | head -30

# B.2.10 v0.6.0 batch features
grep -rn "Orchestrator\|orchestrator" server/ src/ --include="*.ts" --include="*.tsx" | head -20
grep -rn "IterativeReasoning\|iterative-reasoning\|RevelationChain\|revelation-chain" server/ src/ | head -20
grep -rn "ReasoningTrail\|reasoning-trail\|reasoning_trail" server/ src/ | head -20
grep -rn "Pathfinder\|pathfinder" server/ src/ | head -20
grep -rn "Beehive\|beehive" server/ src/ | head -20
grep -rn "Portal\|portal_manifest\|portal.json" server/ src/ --include="*.ts" --include="*.tsx" | head -20
grep -rn "Talent\|talent\|career-profile\|aspiration" server/ src/ | head -20
grep -rn "AAP\|anton-agent-protocol\|Ed25519\|X25519" server/ src/ | head -20
grep -rn "companion-app\|app-gateway" server/ src/ | head -20

# B.2.11 .anton bundle types
grep -rn "\.anton\|antonBundle\|bundle_type" server/ src/ --include="*.ts" --include="*.tsx" | head -50

# B.2.12 Pillar surfaces
find src/pages src/components -iname "*school*" -o -iname "*guardian*" -o -iname "*teacher*"
find src/pages src/components -iname "*news*" -o -iname "*finance*" -o -iname "*travel*" -o -iname "*community*"
find src/pages src/components -iname "*markets*" -o -iname "*horizon-radar*"
```

### B.3 Cross-references to project docs

Pull these into the audit notes and reconcile against the code:
- `ANTON_Current_State_Brief.md` — the audit protocol that produced (or should produce) `ANTON_CURRENT_STATE_v1.md`
- `ANTON_Whitepaper_v3_Part3.md` — Core Architecture (seven-layer prompt builder, knowledge sources, multi-LLM, persistence)
- `ANTON_Whitepaper_v3_Part6.md` — Workflow Automation (12 step types)
- `ANTON_Whitepaper_v3_Part7.md` — AI-Led Software Development (Coding Area, 4-tier)
- `CODING_AREA_SPEC.md`
- `WHITEPAPER_ANTON_FORMAT_INSERT.md` — `.anton` bundle types
- `IMPLEMENTATION_CHECKLIST.md` — 14 transformative features status (Feb 2026)

Note any divergence. Divergences become annotations on the diagrams ("Whitepaper says 29 areas; code has N").

---

## PART C — Required Schematics

Diagrams are organised into **five priority groups**. Group 1 is mandatory for the first commit. Groups 2–4 are mandatory for the v0.6.0 release. Group 5 ships as separate "future-state" overlays.

For each diagram, the spec defines: ID, title, type, scope, source-of-truth files, output filename.

---

### Group 1 — Foundation (mandatory, first commit)

#### G1.1 — System Context Diagram

- **ID:** `01-system-context`
- **Type:** Mermaid `flowchart LR` (C4-style System Context)
- **Scope:** ANTON as a single box, surrounded by all external actors and systems it interacts with.
- **Must show:**
  - Actors: End User (Professional), Guardian (School), Teacher (School), Student (School), Admin/MLRO/Compliance Officer
  - External LLM providers: Anthropic, OpenAI, Mistral (direct), Azure OpenAI, Google Gemini, Local Ollama
  - External data: EUR-Lex, web (search), client folders, External Data Integration sources (PostgreSQL/MySQL/MSSQL/MongoDB/REST/MCP)
  - External protocols: AAP peers (other ANTON instances), FutureChain payment rail
  - Companion App Gateway clients: PWA, iOS, Android, Windows, Chromebook
- **Source-of-truth files:** `server/services/unified-llm-client.ts`, `server/services/knowledge-source.ts`, `server/services/identity.ts`, `package.json` (provider SDKs)
- **Output:** `/docs/architecture/01-system-context.md`

#### G1.2 — Container Diagram (ANTON Core)

- **ID:** `02-container-diagram`
- **Type:** Mermaid `flowchart TB` (C4-style Container)
- **Scope:** What's inside the ANTON box. Major deployable/logical units and their connections.
- **Must show:**
  - **Frontend:** React SPA (`src/`), pillar entry points, Companion App PWA shell
  - **API layer:** Express routes (`server/routes/`)
  - **Service layer:** core services (prompt-builder, knowledge-source, unified-llm-client, workflow-engine, orchestrator, ire-engine, reasoning-trail, identity)
  - **Persistence:** SQLite today / PostgreSQL planned, vector store status
  - **External adapters:** LLM adapters, MCP client, MCP server, AAP transport
  - Direction of every dependency (no bidirectional arrows unless truly bidirectional)
- **Source-of-truth files:** `server/index.ts`, `src/App.tsx`, `server/services/`, `server/routes/`, `server/db/`
- **Output:** `/docs/architecture/02-container-diagram.md`

#### G1.3 — Pillar Topology

- **ID:** `03-pillar-topology`
- **Type:** Mermaid `flowchart TD` (tree)
- **Scope:** Top-level navigation hierarchy. Pillars → tabs/sections → key surfaces.
- **Must show:**
  - **Work** (built): Areas → Modules count per area (definitive number from code)
  - **School** (status per audit): Guardian / Teacher / Student surfaces, Learning Evidence Log, Curriculum Registry
  - **Life** (status per audit): News, Finance (Horizon Radar), Travel, Community
  - **Markets** (status per audit): ANTON Indexes, Consul Council, Pathfinder workspace
  - **Future:** Procure, Civic, Grow — clearly badged ❌ Future
- **Status badges:** Each pillar and major surface gets one badge.
- **Source-of-truth files:** `src/App.tsx`, `src/components/Navigation.tsx` (or equivalent), `src/lib/constants.ts`, `src/pages/`
- **Output:** `/docs/architecture/03-pillar-topology.md`

#### G1.4 — Six-Layer Vision (Reference)

- **ID:** `04-six-layer-vision`
- **Type:** Mermaid `flowchart TD` with grouping
- **Scope:** The strategic architecture from Individual ANTON → Economy. Reference diagram for vision conversations.
- **Must show:** Layer 1 (Individual ANTON) at base, then Intelligent ANTON, The Network, Collaborative Intelligence (Beehive lives here), The Marketplace, The Economy (FutureChain). For each layer: which features map to it, with status badges.
- **Source-of-truth files:** Whitepaper Part 1 §8, memory, current code state for each feature
- **Output:** `/docs/architecture/04-six-layer-vision.md`
- **Note:** This is the only diagram explicitly allowed to show aspirational state without a tight code citation. It's a strategic map, not a structural one. Mark as such in the file header.

---

### Group 2 — Request Lifecycle (mandatory)

#### G2.1 — Single Module Execution (Sequence)

- **ID:** `10-module-execution-sequence`
- **Type:** Mermaid `sequenceDiagram`
- **Scope:** A user clicks "Run Module" on a single module. Trace the full sequence from click to streamed output.
- **Must show:**
  - User → Frontend → API route → prompt-builder (assembles 7 layers) → knowledge-source resolver → LLM adapter → external LLM → streamed response back → output persistence → Reasoning Trail emission → frontend render
  - Every async boundary
  - Every persistence write (which table)
  - Token counting and 180k limit check
- **Source-of-truth files:** `server/services/prompt-builder.ts`, `server/services/unified-llm-client.ts`, `server/routes/run.ts` (or equivalent), `src/pages/RunModule.tsx` (or equivalent)
- **Output:** `/docs/architecture/10-module-execution-sequence.md`

#### G2.2 — Seven-Layer Prompt Builder (Pipeline)

- **ID:** `11-seven-layer-prompt-builder`
- **Type:** Mermaid `flowchart LR` with subgraphs per layer
- **Scope:** Inputs to each layer, what each layer reads from disk/db, the merge order, token budget enforcement, the final assembled prompt.
- **Must show:** Layer 1 (System Foundation) → Layer 2 (Area Context) → Layer 3 (Module Expertise) → Layer 4 (Persona, optional) → Layer 5 (Skills, optional) → Layer 6 (Knowledge Sources) → Layer 7 (Transparency/Reasoning config) → Final prompt to LLM. Mark file paths beside each layer.
- **Source-of-truth files:** `server/services/prompt-builder.ts`, `server/areas/system-foundation.md`, `server/areas/{area}/area-context.md`, `server/areas/{area}/modules/{module}/system-prompt.md`
- **Output:** `/docs/architecture/11-seven-layer-prompt-builder.md`

#### G2.3 — Knowledge Source Resolver (Decision Tree)

- **ID:** `12-knowledge-source-resolver`
- **Type:** Mermaid `flowchart TD`
- **Scope:** How the resolver decides which of the 4 modes (or combinations) to apply, and how External Data Integration plugs in.
- **Must show:** Mode 1 (AI knowledge + web search), Mode 2 (URL fetch), Mode 3 (Local folder index), Mode 4 (Combined). External Data Integration: PostgreSQL, MySQL, MSSQL, MongoDB, REST API, MCP — confirm which are wired vs. spec'd.
- **Source-of-truth files:** `server/services/knowledge-source.ts`, `server/services/folder-indexer.ts`, `server/services/file-processor.ts`, External Data Integration services if present
- **Output:** `/docs/architecture/12-knowledge-source-resolver.md`

#### G2.4 — Multi-LLM Routing

- **ID:** `13-multi-llm-routing`
- **Type:** Mermaid `flowchart LR`
- **Scope:** How `unified-llm-client` decides which provider/model to use. Show prompt caching for Claude path.
- **Must show:** Provider selection inputs (user setting, area default, model availability, fallback). Adapter dispatch. Prompt caching layer (Claude only). 1M context / compaction header (`compact-2026-01-12`) on Opus 4.6 / Sonnet 4.6 paths. Cost/token logging step. Failure → fallback chain.
- **Source-of-truth files:** `server/services/unified-llm-client.ts`, `server/services/model-adapter.ts`, `server/services/adapters/*.ts`
- **Output:** `/docs/architecture/13-multi-llm-routing.md`

---

### Group 3 — Subsystems (mandatory for v0.6.0 release)

#### G3.1 — Database Schema (Grouped ER)

- **ID:** `20-database-schema`
- **Type:** Mermaid `erDiagram` — split into multiple ER diagrams by domain group, plus an index page listing all tables.
- **Scope:** Every table grouped by purpose (Areas/Modules, Knowledge, Workflows, Reasoning Trails, Memory/Patterns, Compliance, Time Intelligence, RBAC, AAP/Identity, Markets, School, etc.).
- **Must show:** Per group: tables, key columns, primary/foreign key relationships. PostgreSQL migration status (which tables already migrated, which still SQLite-only, pgvector status).
- **Source-of-truth files:** `server/db/schema*.sql`, `server/db/migrations/*`
- **Output:** `/docs/architecture/20-database-schema.md` (index) + one file per table group: `20a-database-areas.md`, `20b-database-knowledge.md`, etc.

#### G3.2 — AI Orchestrator: Four-Phase Trust Progression

- **ID:** `21-orchestrator-trust-phases`
- **Type:** Mermaid `stateDiagram-v2`
- **Scope:** Observer → Proposal Manager → Supervised → Autonomous. Transition criteria. What the user sees at each phase. What ANTON can do at each phase.
- **Must show:** Each state, the actions allowed, the gating event for promotion, the demotion event, and the persistence layer (which tables track phase per user/per area/per module).
- **Source-of-truth files:** Search for `Orchestrator`, `trust_phase`, `autonomy_level` in `server/services/` and `server/db/schema*.sql`
- **Output:** `/docs/architecture/21-orchestrator-trust-phases.md`
- **If not built:** Mark all four states `📋 Spec-only` and reference the source spec doc.

#### G3.3 — Iterative Reasoning Engine (IRE)

- **ID:** `22-iterative-reasoning-engine`
- **Type:** Mermaid `flowchart LR` + a `sequenceDiagram` for one revelation cycle
- **Scope:** The IRE loop with the Revelation Chain UI surface. Show the 25-iteration depth ceiling.
- **Must show:** Initial reasoning → revelation → critique → refinement → next iteration → convergence check → final output. Persistence of each revelation. UI rendering of the chain.
- **Source-of-truth files:** Search `IterativeReasoning`, `revelation`, `ire-engine` in `server/services/`
- **Output:** `/docs/architecture/22-iterative-reasoning-engine.md`

#### G3.4 — Reasoning Trails (Audit System)

- **ID:** `23-reasoning-trails`
- **Type:** Mermaid `sequenceDiagram` + a small ER diagram for the trail tables
- **Scope:** How every reasoning step gets captured, signed, persisted, exposed via UI, and exported.
- **Must show:** Emission point in each subsystem (prompt-builder, IRE, orchestrator, workflow-engine) → trail collector → persistence → UI viewer → export (PDF/JSON/`.anton` bundle).
- **Source-of-truth files:** Search `ReasoningTrail`, `reasoning_trail`, `audit_log` in `server/`
- **Output:** `/docs/architecture/23-reasoning-trails.md`

#### G3.5 — Workflow Engine

- **ID:** `24-workflow-engine`
- **Type:** Mermaid `flowchart TD` (engine architecture) + a generic example workflow as `flowchart LR`
- **Scope:** The 12 step types, the scheduler, the trigger system, the WorkflowMonitor surface.
- **Must show:** Step types (Module Execution, API Call, Database Query, File Read, File Write, Script Execution, Email, Decision Gate, Transform, Loop, Parallel, Checkpoint). Triggers: manual, CRON, event-driven (confirm event-driven is wired). Scheduling table, monitor surface, audit log.
- **Source-of-truth files:** `server/services/workflow-engine.ts` (or equivalent), `server/db/schema*.sql` (workflow_*, capacity_log, schedules)
- **Output:** `/docs/architecture/24-workflow-engine.md`

#### G3.6 — Coding Area (4-Tier Architecture)

- **ID:** `25-coding-area`
- **Type:** Mermaid `flowchart TD` with 4 horizontal tiers
- **Scope:** The Coding Area's four tiers from Discovery → Architecture → Release Planning → Execution, with the dual expert-panel review checkpoints.
- **Must show:** Each tier's inputs and outputs. The Discovery Summary Document. The architecture review with named personas (Security Analyst, Compliance, Product Manager, Solutions Architect). Where the AI Code Instruction Builder lives. The Project Alignment Reviewer.
- **Source-of-truth files:** `CODING_AREA_SPEC.md` cross-checked against actual code, `server/services/coding-*.ts` (if present)
- **Output:** `/docs/architecture/25-coding-area.md`

#### G3.7 — Cross-Workflow Intelligence (5-Layer Funnel)

- **ID:** `26-cross-workflow-intelligence`
- **Type:** Mermaid `flowchart TD`
- **Scope:** Knowledge Graph + Pattern Detection + Institutional Memory + Quality Ratchet + Apprentice Model and how they feed each other.
- **Must show:** Workflow output → entity extraction → graph update → pattern detection → memory write → quality ratchet check → apprentice signal. The five layers as a funnel.
- **Source-of-truth files:** Search `knowledge-graph`, `pattern-detection`, `institutional-memory`, `quality-ratchet`, `apprentice` in `server/services/`
- **Output:** `/docs/architecture/26-cross-workflow-intelligence.md`

---

### Group 4 — Protocols & Bundles (mandatory for v0.6.0 release)

#### G4.1 — ANTON Agent Protocol (AAP)

- **ID:** `30-aap-protocol`
- **Type:** Mermaid `sequenceDiagram` for the handshake + `flowchart LR` for the mesh topology
- **Scope:** P2P encrypted ANTON-to-ANTON. Ed25519 identity, X25519 DH key exchange, AES-256-GCM transport, contact hash format `ANTON-XXXX-XXXX-XXXX-XXXX`, `.anton` bundle as transport unit.
- **Must show:** Discovery → handshake → authenticated session → bundle exchange → session close. Mesh topology with no centralised registries. FutureChain as the only payment rail (out of band, referenced not detailed).
- **Source-of-truth files:** `server/services/identity.ts`, `server/services/aap-*.ts` (if present), spec docs in memory
- **Output:** `/docs/architecture/30-aap-protocol.md`
- **If not built:** Mark `📋 Spec-only` and reference the source spec.

#### G4.2 — Companion App Gateway

- **ID:** `31-companion-app-gateway`
- **Type:** Mermaid `flowchart LR`
- **Scope:** Asymmetric WebSocket architecture (distinct from symmetric AAP). PWA-first, Capacitor wrapping for iOS/Android/Windows/Chromebook.
- **Must show:** Companion client → WebSocket over HTTPS → Gateway auth → Session manager → ANTON Core services. mDNS/LAN discovery path. Shared `identity.ts` module with AAP. Capability negotiation.
- **Source-of-truth files:** `server/services/identity.ts`, `server/services/app-gateway-*.ts` (if present), Capacitor config files
- **Output:** `/docs/architecture/31-companion-app-gateway.md`

#### G4.3 — `.anton` Bundle Format

- **ID:** `32-anton-bundle-format`
- **Type:** Mermaid `flowchart TD` (lifecycle) + a structured table of bundle types
- **Scope:** ZIP-based archive format. All bundle types (whitepaper says 17; verify in code). Lifecycle: create → sign → transport → verify → unpack.
- **Must show:** Each confirmed bundle type with its payload schema reference. The signing flow (Ed25519). The contact hash binding. Which bundle types travel via AAP, which via Companion App Gateway, which are local-only.
- **Source-of-truth files:** `server/services/bundle-*.ts`, `WHITEPAPER_ANTON_FORMAT_INSERT.md`
- **Output:** `/docs/architecture/32-anton-bundle-format.md`

#### G4.4 — Portals & Pathfinder

- **ID:** `33-portals-pathfinder`
- **Type:** Mermaid `flowchart TD`
- **Scope:** Portals as the unified public surface (absorbing Beehive, Marketplace, Recruitment/Candidate). Pathfinder as the manifest-first discovery layer (`.anton/portal.json`, AAP attestations, seven intent modes, IRE-powered council).
- **Must show:** Portal types (Beehive, Marketplace, Talent, future). Portal manifest schema. Pathfinder query → manifest discovery → attestation verification → council deliberation → result.
- **Source-of-truth files:** Search `Portal`, `Pathfinder`, `portal.json` in `server/` and `src/`
- **Output:** `/docs/architecture/33-portals-pathfinder.md`

---

### Group 5 — Future-State Overlays (clearly marked, ship as separate files)

These diagrams describe components that are spec-only or future. They live in `/docs/architecture/future/` and every diagram header makes the status explicit.

#### G5.1 — Markets Pillar

- **ID:** `f-50-markets-pillar`
- **Type:** Mermaid `flowchart TD`
- **Scope:** ANTON Indexes, consul council, prediction feedback loop, the 32 new tables, Horizon Radar surface. PostgreSQL prerequisite explicitly noted.
- **Output:** `/docs/architecture/future/f-50-markets-pillar.md`

#### G5.2 — Talent Discovery & Recruitment

- **ID:** `f-51-talent-discovery`
- **Type:** Mermaid `flowchart LR` + `sequenceDiagram` for the bias-audit dual-model flow
- **Scope:** 3 job ad variants → dual-model bias auditor → human review → publish. Internal mobility layer (opt-out aspiration profiles, manager-blind by default). `.anton` career-profile bundle. EU AI Act Annex III compliance points. EU Pay Transparency Directive enforcement points.
- **Output:** `/docs/architecture/future/f-51-talent-discovery.md`

#### G5.3 — Connected Enterprise Planning

- **ID:** `f-52-connected-enterprise-planning`
- **Type:** Mermaid `flowchart TD`
- **Scope:** Cross-ANTON dependencies, Why Chain (every task → company strategy), Organisational Pulse Dashboard.
- **Output:** `/docs/architecture/future/f-52-connected-enterprise-planning.md`

#### G5.4 — Procure / Civic / Grow Pillars

- **ID:** `f-53-future-pillars`
- **Type:** Mermaid `flowchart TD`
- **Scope:** Each pillar's planned scope at a glance. Grow's three-tier model (Standalone, Intelligence Overlay, Hybrid) with the priority connector list (Salesforce, HubSpot, Dynamics 365, Pipedrive).
- **Output:** `/docs/architecture/future/f-53-future-pillars.md`

#### G5.5 — School Mode (Voice-First, Offline-Capable)

- **ID:** `f-54-school-mode`
- **Type:** Mermaid `flowchart LR`
- **Scope:** Voice-first T1, guardian accounts, teacher `.anton` homework bundles, Learning Evidence Log, 25+ country curriculum registry. Mistral/Ollama offline path for NGO/humanitarian deployment.
- **Output:** `/docs/architecture/future/f-54-school-mode.md`

---

## PART D — Diagram Conventions

### D.1 Format

- **Mermaid in markdown.** No PNG, no SVG export, no Lucidchart, no Figma exports. The source is the diagram.
- **One diagram per file.** Each file is short and focused. The README is the index.
- **GitHub-renderable.** Test that GitHub's Mermaid renderer handles the diagram before committing.

### D.2 File header (every diagram file)

```markdown
# [Diagram ID] — [Title]

**Status of diagram:** Generated YYYY-MM-DD by Claude Code from commit [sha]
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when any of the source files below change materially.

## Diagram

` ` `mermaid
[diagram code]
` ` `

## Legend
[explain any non-obvious labels, colours, or status badges used]

## Source-of-truth references
- `path/to/file.ts:L120-L180` — [what this defines]
- `path/to/other.ts:L45-L90` — [what this defines]

## Open questions
- [anything the audit could not confirm]

## Related diagrams
- [Diagram ID] — [Title]
```

### D.3 Status badges

Use these exact strings in node labels and tables:
- `✅ Built` — code present and wired in nav/UI
- `🟢 Partial` — code exists but not fully wired or has known gaps
- `📋 Spec-only` — design doc exists, no code
- `❌ Future` — mentioned in roadmap, not yet specified

### D.4 Citations

Every node, edge, or label that represents a real code element ends with a citation marker `[1]`, `[2]`, etc., resolved in the **Source-of-truth references** section of the file. No exceptions for "obvious" references.

### D.5 Avoid

- Bidirectional arrows unless the relationship is genuinely bidirectional.
- Vague labels like "Service Layer" — name the actual service.
- Drawing edges you can't grep.
- Mixing built and spec-only state in one node ("Pathfinder (built but UI pending)" — split it: the data-layer node is `🟢 Partial`, the UI node is `📋 Spec-only`).
- Mermaid features that don't render in GitHub (test before commit).

---

## PART E — Output Structure

```
/docs/architecture/
├── README.md                          # Master index, navigation, how-to-update
├── _audit-notes.md                    # Audit working notes (not for consumers)
├── 01-system-context.md               # G1.1
├── 02-container-diagram.md            # G1.2
├── 03-pillar-topology.md              # G1.3
├── 04-six-layer-vision.md             # G1.4
├── 10-module-execution-sequence.md    # G2.1
├── 11-seven-layer-prompt-builder.md   # G2.2
├── 12-knowledge-source-resolver.md    # G2.3
├── 13-multi-llm-routing.md            # G2.4
├── 20-database-schema.md              # G3.1 index
├── 20a-database-areas.md              # G3.1 group
├── 20b-database-knowledge.md          # G3.1 group
├── 20c-database-workflows.md          # G3.1 group
├── 20d-database-reasoning-trails.md   # G3.1 group
├── 20e-database-memory-patterns.md    # G3.1 group
├── 20f-database-compliance.md         # G3.1 group
├── 20g-database-rbac-identity.md      # G3.1 group
├── 21-orchestrator-trust-phases.md    # G3.2
├── 22-iterative-reasoning-engine.md   # G3.3
├── 23-reasoning-trails.md             # G3.4
├── 24-workflow-engine.md              # G3.5
├── 25-coding-area.md                  # G3.6
├── 26-cross-workflow-intelligence.md  # G3.7
├── 30-aap-protocol.md                 # G4.1
├── 31-companion-app-gateway.md        # G4.2
├── 32-anton-bundle-format.md          # G4.3
├── 33-portals-pathfinder.md           # G4.4
└── future/
    ├── f-50-markets-pillar.md
    ├── f-51-talent-discovery.md
    ├── f-52-connected-enterprise-planning.md
    ├── f-53-future-pillars.md
    └── f-54-school-mode.md
```

### E.1 README.md (the master index)

Must contain, in this order:
1. **What is this?** — One paragraph: code-grounded architecture diagrams for ANTON, regenerable, GitHub-renderable.
2. **Reading order by audience:**
   - New contributor → 01, 02, 03, 10
   - Senior architect → 01, 02, 13, 20, 30, 31
   - Strategic evaluator → 01, 03, 04, future/
   - Open-source contributor adding a module → 03, 11, 12
   - Open-source contributor working on AAP/Companion → 30, 31, 32
3. **Index of all diagrams** — table with ID, title, status of subsystem, last regenerated date.
4. **How to regenerate** — see Part F below, lifted into the README.
5. **How to add a new diagram** — extension protocol.
6. **Conventions** — link to a `CONVENTIONS.md` (or inline) summarising Part D.
7. **Status legend** — same legend as Part D.3.

---

## PART F — Maintenance Protocol

Architecture diagrams that don't get updated rot fast. Build the regeneration process into the workflow from day one.

### F.1 When to regenerate a diagram

A diagram needs regeneration when:
- A source file in its **Source-of-truth references** section is materially changed
- A new node would need to appear (new service, new table group, new bundle type)
- A status badge would change (📋 → 🟢, 🟢 → ✅, etc.)
- Six months have passed since the last regeneration (calendar review)

### F.2 Regeneration command

The README includes:

```bash
# Regenerate a single diagram
pnpm run docs:arch -- --diagram 11-seven-layer-prompt-builder

# Full regeneration
pnpm run docs:arch -- --all

# Validate (no Mermaid syntax errors, all citations resolve)
pnpm run docs:arch -- --validate
```

If those scripts don't exist yet, the README explicitly says so and points to a manual procedure: open the diagram file, re-run the relevant scans from Part B.2, update the Mermaid block, update the citations, update the regenerated-on date.

**Optional second pass (not required for first commit):** propose a script/tool that auto-extracts the source-of-truth list and warns when a referenced file has changed since last regeneration. This is a future enhancement, not a blocker.

### F.3 PR review rule

Add to `CONTRIBUTING.md` (create if missing): *Any PR that materially changes a service, route, table, or bundle type must include a corresponding architecture-diagram update or an issue link tracking the update.*

---

## PART G — Acceptance Criteria

The first commit of `/docs/architecture/` is acceptable when:

1. **Group 1 (Foundation) is complete.** Four diagrams: System Context, Container, Pillar Topology, Six-Layer Vision.
2. **Audit notes are saved** to `_audit-notes.md` and referenced from each diagram's source-of-truth section.
3. **Every node has a citation** in the four mandatory diagrams.
4. **Status badges are honest.** No `✅ Built` on anything that isn't actually wired in the live app.
5. **README is navigable** by all four audience types (new contributor, senior architect, strategic evaluator, open-source contributor).
6. **Mermaid renders in GitHub.** Each diagram tested by viewing the file on GitHub web UI.

The v0.6.0 release commit is acceptable when:

7. Groups 2, 3, and 4 are complete.
8. Group 5 future-state overlays exist for any feature mentioned in marketing or whitepaper Part 4.
9. Database schema diagrams cover every table group present in `schema*.sql`.
10. Every `📋 Spec-only` element points to its source spec document.

---

## PART H — Out of Scope

To prevent scope creep, the following are explicitly out of scope for this brief:

- Building any new product feature.
- Modifying any code outside `/docs/`.
- Generating PDF or PNG exports of diagrams.
- Translating diagrams to other languages (i18n is for the open-source community).
- Diagrams of UI/UX flows (this is structural architecture, not interaction design).
- Sequence diagrams of every possible user journey — only the canonical request lifecycle (G2.1).
- Performance/scalability diagrams (separate brief, when there's load to model).

If during the audit a strong case emerges for an additional diagram, add it to a `proposed-additions.md` and surface in the next session — don't add unilaterally.

---

## PART I — The Four-Phase Vision

This brief delivers Phase 1. The later phases are flagged here for forward orientation only — do not implement them now.

**Phase 1 (this brief): Static, regenerable diagrams.** Markdown + Mermaid, manually regenerated, citation-grounded.

**Phase 2: Validation tooling.** A `pnpm run docs:arch -- --validate` script that checks every cited file:line still exists and warns when source files change since the last regeneration date.

**Phase 3: Auto-extraction.** A generator that reads the codebase and produces draft Mermaid for: route map, service dependency graph, schema ER, bundle-type catalogue. Human curates, doesn't author.

**Phase 4: Live diagrams.** Diagrams embedded in an `/architecture` route inside ANTON itself — interactive, queryable, with live status pulled from the running system. The architecture map becomes a first-class platform surface, useful for the AI coworker to reason about its own structure.

---

## PART J — First Step

Claude Code's first action after reading this brief:

1. Run all scans in **Part B.2** and write the raw outputs to `/docs/architecture/_audit-notes.md`.
2. Cross-reference against the documents in **Part B.3**.
3. Produce a short summary at the top of `_audit-notes.md` listing:
   - Confirmed counts (areas, modules, tables, services, routes)
   - Built features confirmed by code
   - Spec-only features confirmed by documents but not by code
   - Discrepancies between whitepaper, memory, and code
   - Anything that can't be classified as `✅ / 🟢 / 📋 / ❌` from the audit alone

Only then begin **Group 1**.

---

**End of brief.**
