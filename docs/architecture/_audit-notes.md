# ANTON Architecture Audit — Working Notes

**Audit date:** 2026-04-26
**Audited commit:** `0fabf7f` on branch `main`
**Repo:** `https://github.com/altspace-hub/ANTON.git`
**Package:** `openexpert@0.7.5`
**Audit scope:** Part B of `ANTON_Architecture_Schematics_Brief.md` — code-grounded inventory to back the diagrams in `/docs/architecture/`.

> This file is a working note, not a consumer document. Diagrams cite back to specific source files; this file records the broader inventory and any discrepancies.

---

## 1. Confirmed counts (from filesystem)

| Item | Count | Where |
|---|---|---|
| Top-level pillars (in nav) | **12** | `src/App.tsx` routes + `src/components/layout/Sidebar.tsx` mode-detection |
| Pillars in `AppMode` union | **9** | `src/stores/useSettingsStore.ts:74` (Procure/Civic/Grow are path-routed, not toggled — see §6 discrepancy) |
| Areas under `server/areas/` | **59** | First 49 listed below; `server/areas/` directory |
| `system-prompt.md` files | **651** | `find server/areas -name "system-prompt.md"` (per audit agent) |
| Modules in `src/lib/constants.ts` | **263** | Base array + 9 area patches |
| Services in `server/services/` | **221** | `ls server/services/*.ts` |
| Routes in `server/routes/` | **151** | `ls server/routes/*.ts` |
| Frontend pages in `src/pages/` | **251** (`.tsx`) | `find src/pages -name "*.tsx"` |
| PostgreSQL migrations | **121 files** (numbered **039–167**, with gaps before 049) | `server/db/migrations-pg/` |
| Companion-app pages | **31** | `src/app/pages/` |

Areas (full list): `academic, accounting, artisan-craft, audit, banking, blockchain, branding, coding, comms-pr, community-health, consulting, consumer-legal, consumer-protection, creative-production, credit-navigator, cyber, data-analytics, data-privacy, design, education, education-literacy, esg, fcp, food-business, government, government-services, hardware-engineering, healthcare, hr, insurance, investment, islamic-finance, journalism, land-rights, legal, livestock-poultry, manufacturing, marketing, micro-business, microfinance, mobile-money, pe-vc, personal-dev, personal-finance, personal-finance-bop, product-management, project-mgmt, public-sector, real-estate, risk` (49 visible) + 10 more not echoed in head output to reach 59 total.

---

## 2. Status by pillar (✅ Built / 🟢 Partial / 📋 Spec-only / ❌ Future)

| Pillar | Status | Entry page(s) | Service(s) | Migrations |
|---|---|---|---|---|
| Work | ✅ Built | `src/pages/ModulePage.tsx` | `prompt-builder.ts`, `knowledge-resolver.ts` | core 001–048 |
| School | ✅ Built | `src/pages/school/*` | `school-prompt-builder.ts` | 094 |
| Life | ✅ Built | `src/pages/life/*` (life category pages) | category modules | integrated |
| Pathfinder | ✅ Built | `src/pages/pathfinder/*` | `pathfinder-engine.ts`, `smart-actions-analyzer.ts` | 161 |
| Markets | ✅ Built | `src/pages/markets/*` (23 pages) | 30 `market-*.ts` | 049–067, 154–157 (18 dedicated) |
| Community | ✅ Built | `src/pages/community/*` | `community-crypto.ts`, `community-e2e.ts`, `community-signing-service.ts` | 077–080, 099–104, 164–165 |
| Procure | ✅ Built | `src/pages/procure/*` | `procure-service.ts` | 091 |
| Civic | ✅ Built | `src/pages/civic/*` | `civic-service.ts` | 092 |
| Grow | ✅ Built | `src/pages/grow/*` | `grow-service.ts` | 093 |
| Payments | 🟢 Partial | `src/pages/payments/*` | `fc-*.ts` (5 files) | 081, 082, 087 |
| Portals | ✅ Built | `src/pages/portals/*` (8 pages) | 18 `portal-*.ts` + `registry-protocol/`, `registry-client/`, `capability-descriptor/` | 145–151, 158, 160, 167 |
| Missions | ✅ Built | `src/pages/missions/*` (6 pages) | 15 `mission-*.ts` + `service-pack-manager.ts` | 115–122 |

---

## 3. Subsystems mentioned in CLAUDE.md / brief

| Subsystem | Status | Source-of-truth |
|---|---|---|
| 7-layer Prompt Builder | ✅ Built | `server/services/prompt-builder.ts` (Layers 2a/2b/2c/2d/4a/6 explicitly labeled) |
| Knowledge sources (4 modes) | ✅ Built | `server/services/knowledge-resolver.ts`, `url-fetcher.ts`, registered_folders table |
| Multi-LLM unified entry | ✅ Built | `server/services/unified-llm-client.ts`, dispatch in `model-adapter.ts:552` |
| Adapters | ✅ Built | `server/services/adapters/{azureOpenai, gemini, mistral, ollama, openai}Adapter.ts` |
| Anthropic + prompt caching + adaptive thinking | ✅ Built | `server/services/claude-client.ts` |
| Workflow Engine | 🟢 Partial | `server/services/workflow-executor.ts`, `event-workflow-processor.ts`. Brief says 12 step types — code has at least: prompt, condition, transform, script, sleep, webhook, user-input, approval, file-upload, parallel, loop, dynamic + onComplete trigger. Not all 12 explicitly named per spec. |
| Orchestrator (4-phase trust progression) | 🟢 Partial | `orchestrator-engine.ts`, `orchestrator-pattern-engine.ts`, `orchestrator-heartbeat.ts`. Phase 1 (Observer) wired; Phases 2–4 are scaffolded but not fully gated in code (📋 for the gating logic). |
| IRE (Iterative Reasoning Engine) | ✅ Built | `iterative-reasoning.ts` — multi-phase (analyse, deepen, tool_pass_1/2, synthesise); revelation_chains + revelation_steps tables persisted |
| Reasoning Trails | 🟢 Partial | DB tables exist; UI rendering surface is partial — 📋 for the dedicated viewer page (no `ReasoningTrailViewer.tsx` found at top level, only IRE drawer in companion app) |
| Pathfinder | ✅ Built | `pathfinder-engine.ts`, `routes/pathfinder.ts`, `src/pages/pathfinder/`, migration 161 |
| Companion App Gateway | ✅ Built | `app-gateway.ts`, `app-enrollment-service.ts` (Ed25519), `app-push-service.ts`, `app-checkpoint-service.ts`, `app-websocket.ts`, `app-mail-service.ts`; migrations 094, 130, 131, 132 |
| AAP / ANTON Agent Protocol | 🟢 Partial | `aap-rollout-bridge.ts`, `community-crypto.ts`, `community-e2e.ts`, `p2p-*` migrations 089, 110. Crypto + E2E built; protocol contact-hash format `ANTON-XXXX-XXXX-XXXX-XXXX` not directly grep-confirmed (📋 for that exact format). |
| Portals + Pathfinder integration | ✅ Built | 18 portal services + Pathfinder visitor mode (migration 161) |
| Markets (ANTON Indexes, consul, predictions, RCI) | ✅ Built | 30 services, 18 migrations, 23 pages |
| Talent Discovery / Beehive | 🟢 Partial | `beehive-*.ts` (9 files), `talent-*.ts`, migrations 107–109, 113–114; Beehive deliberation surface partly wired |
| Risk Atlas (7-stage + FCP) | ✅ Built | `server/services/risk-atlas/*.ts` (atlas-service, residual-calculator with 25 tests, pack-loader, fcp-scope, integrity-rules, export, event-logger, knowledge-bridge); migrations 125–129; routes/atlas.ts |
| Missions (template engine + service packs + credential vault) | ✅ Built | 15 mission services + `seed-templates.ts`; migrations 115–122 |
| Specialized Agents (Layer 4) | ✅ Built | `agent-service.ts`, `agent-processor.ts`, `agent-builder.ts`, `agent-connector-executor.ts`, `remote-agent-client.ts`; migration 111; `routes/agents.ts` |
| Coding Area (4-tier) | ✅ Built | `routes/coding*.ts` (4 routes), pages: CodingLanding, CodeReview, ScriptLite, ScriptMedium, CodingLargeDiscovery/Project/Architecture/Release, InstructionBuilder, AlignmentReviewer; Tier-5 Hardware Build per memory |
| Cross-Workflow Intelligence | 🟢 Partial | `knowledge-graph.ts`, `pattern-detection`, `apprentice.ts`, `quality-ratchet.ts`, `atom-extractor.ts`, `atom-boost.ts`. Five-layer funnel exists as services; no single orchestrating "funnel" file (📋 for the explicit funnel orchestration). |
| `.anton` bundle format | ✅ Built | `anton-bundler.ts`, `anton-importer.ts`, `anton-validator.ts`, `bundle-sharing-service.ts`, `market-bundle-importer.ts`, `portal-bundler.ts`. ~48 bundle types vs whitepaper's 17 — code has expanded beyond the spec. |
| Evidence Pack | ✅ Built | `EvidencePackBuilderPage.tsx`, `EvidencePackViewerPage.tsx`, migrations 152–153 |

---

## 4. LLM provider routing

`server/services/model-adapter.ts:552` switches on provider:

```
case 'anthropic'
case 'openai'
case 'azure_openai'
case 'google'
case 'mistral'
case 'ollama'
```

`server/services/unified-llm-client.ts` exposes `streamToResponse` (L141), `sendRequest` (L304), `streamToHandler` (L356), `checkProviderHealth` (L480) and re-exports `isApiKeyConfigured` and `getClient` from `claude-client.ts`. Health-check enum confirms the same six providers.

Prompt caching is in `claude-client.ts` (Anthropic only — ephemeral block on the static system prompt).

Adaptive thinking for Opus 4.7 / Sonnet 4.6: `thinking: { type: 'adaptive' }` with `output_config: { effort: 'low'|'medium'|'high'|'max' }` (per CLAUDE.md and `claude-client.ts`).

---

## 5. Database

- Migrations directory: `server/db/migrations-pg/`
- 121 files numbered `039_…` through `167_…`
- Earliest visible migration is `039_knowledge_atoms_fts_pg.sql`; pre-039 schema lives in `server/db/schema.sql` (16 base tables) and is upgraded by migrations
- No `pgvector` extension found in schema; vector search routes via `chroma-client.ts` (separate Chroma service) or `embedding-pipeline.ts` (Ollama nomic-embed-text)
- Notable migration groups:
  - 049–067 + 154–157: Markets pillar
  - 077–104: Community / network / E2E / KYC / federation / marketplace bundle / talent
  - 111: Specialized Agents
  - 113–114: Beehive
  - 115–122: Missions
  - 125–129: Risk Atlas (foundation, addendum, FCP, pack-kind)
  - 130–132: Companion App security + mail
  - 133–144: Hardware Build
  - 145–151, 158, 160, 167: Portals
  - 152–153: Evidence Packs
  - 161: Pathfinder visitor
  - 162–166: Jobs, marketplace visitor, friends, friend messaging, video

---

## 6. Discrepancies

| # | Discrepancy | Where | Implication for diagrams |
|---|---|---|---|
| D1 | `AppMode` union does not include `procure`/`civic`/`grow` | `src/stores/useSettingsStore.ts:74` lists `work \| school \| life \| pathfinder \| markets \| community \| payments \| portals \| missions` | The Pillar Topology diagram should mark those three as "path-routed" rather than "mode-toggle" pillars. They ARE built — `src/App.tsx:733–749` registers their routes; `Sidebar.tsx:351–353` detects them via path. |
| D2 | Whitepaper says 17 `.anton` bundle types | Code registers ~48 in `anton-bundler.ts` | Bundle-format diagram (G4.3) must use the code list, not the whitepaper. |
| D3 | Whitepaper says 12 workflow step types | Code's `workflow-executor.ts` implements roughly the named set, but no single declarative table of the 12 names was confirmed | G3.5 diagram should list confirmed step types and mark unconfirmed ones as 📋. |
| D4 | Brief refers to `unified-llm-client.ts` and separately to `model-adapter.ts` | Both exist. `unified-llm-client.ts` is the streaming entry; `model-adapter.ts` is the dispatch layer with the provider switch | Container diagram (G1.2) should show both. |
| D5 | Brief expects `folder-indexer.ts` and `file-processor.ts` | Not directly present as separate files; folder/file ingestion is split across `data-importer.ts`, `chunker.ts`, `embedding-pipeline.ts`, `chroma-client.ts` | Knowledge Source Resolver (G2.3) should reference the actual files. |
| D6 | Companion App lives at `src/app/`, not `src/pages/app/` | Confirmed | Container diagram should split "ANTON web SPA" from "Companion PWA shell" cleanly. |
| D7 | ~~Memory note: `/portals/mine` returning 500 (open thread from previous session)~~ **RESOLVED 2026-04-26 PM** — root cause: Express was matching `/portals/:id` against the literal string "mine"; PostgreSQL rejected "mine" as a UUID. **Fix:** added a dedicated `/portals/mine` alias that reuses `listOwnedPortals` and is registered BEFORE `/portals/:id` (`server/routes/portals.ts:629–660`). Regression test at `tests/routes/portals-mine.test.ts`. | RESOLVED | Closed. |
| D8 | CLAUDE.md lists `personal-finance-bop` and `personal-dev` as areas | Both present in `server/areas/` listing | No discrepancy. |
| D9 | Marketplace (Layer 5) | `MarketplacePage.tsx` exists, migrations 104 (bundle_marketplace), 163 (marketplace_visitor) | Status: 🟢 Partial — surface exists, but the canonical Marketplace economy from CLAUDE.md is described as not started. Use 🟢 for the surface, 📋 for the economy. |
| D10 | Whitepapers v3 referenced in Part B.3 (Part3, Part6, Part7) and `IMPLEMENTATION_CHECKLIST.md`, `WHITEPAPER_ANTON_FORMAT_INSERT.md`, `CODING_AREA_SPEC.md` | None of those files were located in this audit (the whitepaper files in repo root are dated and may have superseded numbering — `anton_whitepaper_2.txt` is in untracked working tree) | Cross-reference step is incomplete; Group 3/4 diagrams should call out citation gaps in their own "Open questions" sections. |

---

## 7. Source-of-truth file map (used by diagrams)

These are the canonical citations the Group 1 diagrams will reference:

| Concern | File | Line range / anchor |
|---|---|---|
| App routes & lazy-loaded pages | `src/App.tsx` | 314–334, 730–760 (pillar route blocks) |
| Pillar mode toggle | `src/stores/useSettingsStore.ts` | 74 (`AppMode` union), 76, 121, 132, 153, 227 |
| Sidebar mode detection | `src/components/layout/Sidebar.tsx` | 351–375 (Procure/Civic/Grow/Portals path matching) |
| Module catalog | `src/lib/constants.ts` | top-of-file MODULES array + area-patches imports |
| Express entry | `server/index.ts` | route mounts |
| DB schema base | `server/db/schema.sql` | 16 base tables |
| DB initialiser | `server/db/init.ts` | migration runner |
| Prompt builder (7 layers) | `server/services/prompt-builder.ts` | Layer 2a (L259), 2b (L340), 2c (L554), 2d (L558), 4a (L299), 6 (L562) |
| LLM unified streaming | `server/services/unified-llm-client.ts` | L141, L304, L356, L480, L518–L519 |
| LLM provider dispatch | `server/services/model-adapter.ts` | L552–L582 (six-case switch) |
| Anthropic client | `server/services/claude-client.ts` | (caching + adaptive thinking) |
| Adapters | `server/services/adapters/` | one file per non-Anthropic provider |
| Knowledge resolver | `server/services/knowledge-resolver.ts` | (4 modes) |
| IRE | `server/services/iterative-reasoning.ts` | multi-phase |
| Workflow executor | `server/services/workflow-executor.ts` | step dispatcher |
| Pathfinder engine | `server/services/pathfinder-engine.ts` | mode-aware research |
| Portals services | `server/services/portals/` + `registry-protocol/` + `registry-client/` + `capability-descriptor/` | — |
| Risk Atlas services | `server/services/risk-atlas/` | residual-calculator, pack-loader, fcp-scope, etc. |
| Missions services | `server/services/mission-*.ts` + `server/services/missions/seed-templates.ts` | — |
| Companion App pairing | `server/services/app-enrollment-service.ts` | Ed25519 |
| Companion App gateway | `server/services/app-gateway.ts`, `app-websocket.ts`, `app-push-service.ts`, `app-checkpoint-service.ts` | — |
| Bundle format | `server/services/anton-bundler.ts` | bundle-type registry |

---

## 8. Open questions (needs follow-up before later groups)

1. **Workflow step type enumeration** — get the canonical list from code, not spec, before drawing G3.5.
2. **Reasoning Trails UI surface** — does a top-level audit-trail viewer exist, or is the trail only consumed via IRE drawer + per-session reasoning panel? Affects G3.4.
3. **Orchestrator phase gating** — need to read `orchestrator-engine.ts` end-to-end to determine whether all four phases are implemented or only Observer. Affects G3.2.
4. **Whitepaper v3 parts** — the brief's Part B.3 expects them; not found in repo root. Resolve before Group 4 diagrams.
5. **`/portals/mine` 500** — open thread from prior session; not blocked by this audit.

---

**End of audit notes.** Group 1 diagrams will cite this file from their "Source-of-truth references" sections.

---

## 9. Pre-flight verification (2026-04-26 PM, before Improvement & Investigation Brief execution)

**Verdict:** 🟡 Yellow — baseline holds, two flags worth recording before execution.

| Check | Expected | Actual | Status |
|---|---|---|---|
| Commit SHA | `0fabf7f` | `0fabf7f1a218cb43b21e5723a4b29bd599a4ef49` | ✅ |
| Package version | `0.7.5` | `0.7.5` | ✅ |
| Areas | 59 | 59 | ✅ |
| Services (recursive) | ~221 | **352** | 🟡 (see flag F1 below) |
| Routes | 151 | 151 | ✅ |
| Pages | 251 | 251 | ✅ |
| Migrations | 121 | 120 + README | ✅ (off-by-one was README inclusion) |
| Modules in constants.ts | 263 | 263 | ✅ |
| AppMode union (line 74, 9 entries) | ✅ | ✅ | ✅ |
| `isProcureMode/isCivicMode/isGrowMode` (Sidebar 351-353) | ✅ | ✅ | ✅ |
| `Phase 1: Observer` in orchestrator-engine.ts | ✅ | line 4 | ✅ |
| `stageNames` in orchestrator-engine.ts | line ~355 | line 355 | ✅ |
| `MAX_CONTEXT_TOKENS = 900_000` in knowledge-resolver.ts | line ~34 | line 34 | ✅ |
| Contact-hash regex in identity.ts | ✅ | location moved (see flag F2) | 🟡 |

### Flag F1 — Services undercounted in original audit

The 26 April morning audit reported **221 services** using `ls server/services/*.ts`. The recursive count via `find server/services -name "*.ts"` returns **352**. The earlier number missed the subdirectories: `adapters/`, `portals/`, `risk-atlas/`, `missions/`, `registry-protocol/`, `registry-client/`, `capability-descriptor/`, `integrations/`, `db-drivers/`, `rag/`, `vector-stores/`, `computation-templates/markets/`. Both numbers are correct under their respective measurement; **352 is the canonical count going forward**. Update diagrams in next regen pass.

### Flag F2 — Contact-hash format divergence

The brief expects `ANTON-XXXX-XXXX-XXXX-XXXX` regex in `server/services/identity.ts`. The validator regex actually lives in **`server/services/community-crypto.ts:24`**: `/^ANTON-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/` (hex charset). However, **`server/services/portals/career-profile.ts:56`** uses a *different* contact-hash format: `/^ANTON-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/` (base32-style — no `0/1` to avoid ambiguity). This is a real divergence. The hex format is older; the base32 format looks like a deliberate evolution. Worth either: (a) consolidating both validators on one charset and migrating, or (b) documenting both as valid in different layers. Diagram `30-aap-protocol.md` cites `identity.ts:24` — that line is the *builder*, not the validator; needs correction in next regen.

### Decisions logged for execution

| # | Decision | User answer (this session) |
|---|---|---|
| C.1 | Phase 4 (Autonomous) inclusion | All 4 phases |
| C.3 | AppMode promotion vs document path-routing | Promote (recommended) — verify sidebar variants survive |
| D.4 | Layer naming | Keep both — seven external, twelve internal |
| E.2 | AAP transport | Implement direct WebSocket+mDNS now |
| E.5 | Salesforce vs HubSpot | Both |

Verdict allows proceeding to G.7 + execution. Re-audit triggered on next minor version bump.

