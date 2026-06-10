# ANTON Local — Extensive Update Plan (June 2026)

**Produced 2026-06-10** from a 43-agent verified deep dive over seven domains
(Work modules, Missions, Portals, Collaboration/Agents/A2A, Pathfinder, Markets,
model providers). Every claimed gap was adversarially ground-truthed against
current code — items below marked **CONFIRMED** survived an independent
refutation attempt; refuted claims were discarded. Effort: S = hours,
M = 1–3 days, L = week+.

---

## Executive summary

ANTON Local is **much more built than its own documentation claims** — and the
dominant failure mode is not missing features but **severed last miles**:
finished backends with no route, no nav entry, no reader for the data they
write, or a one-line bug at the boundary.

The five headline truths:

1. **The module corpus is launch-grade and undersold.** 507 server modules with
   genuine, domain-tailored prompts (0 missing files, 0 duplicates, median
   5.4 KB) across 58 areas; the four flagship workspaces (Gap Wizard, Counsel's
   Desk, Engagement, Risk Atlas) are substantive and wired. But discovery is
   broken: 33 finished modules are invisible, AI search sees only 120 of 479,
   and 5 advertised modules silently run promptless.
2. **Pathfinder's real engine is unreachable.** A 1,281-line multi-phase
   research engine (3 depths, IRE, confidence gating) — the genuine
   differentiator vs Claude.ai — is exiled to an unlinked `/pathfinder/classic`
   while every entry point funnels into a self-declared "Stub v1" that
   **fabricates ranking numbers**. Worst honesty exposure in the product.
3. **Missions can't act without a human clicking every step.** ~10,900 lines of
   excellent plumbing (real HTTP/browser/DB executors, AES-256-GCM vault,
   autonomy gates) — but no background runner exists, the decomposer cannot
   emit action tasks, template parameters are discarded, and "delivery" tasks
   are prose that *claims* delivery happened.
4. **Layer 4 (Agents/A2A) is invisible.** Full agent CRUD + conversation
   processing + live connectors + signed delegation + Beehive are built and
   unit-tested — but there is no nav entry, `/agents/:id` doesn't exist (the
   Hub's own Chat button navigates to a blank page), and the mesh send path has
   a confirmed protocol bug that reports false success.
5. **Markets' learning loop is broken in two one-line places, not just
   paused.** The prediction verifier has hard-crashed since April (COALESCE
   timestamptz/text — reproduced live; would break every fresh install) and the
   pattern→weight feedback silently no-ops on JSON-string numbers (0 weight
   adjustments ever). Both are S-effort fixes. The honest "research tool +
   public scorecard" repositioning is already 80% shipped.

On **cheap-model parity** (explicit goal: cost-constrained users must succeed):
module runs are genuinely multi-provider end-to-end (the old silent-Claude
misroute is fixed; S3/S4 adapter bugs were fixed today), but the
session-selected model governs *only* module runs — missions, agents,
pathfinder, extractor, and ~25 services still resolve to Claude or crash
without an Anthropic key. JSON-mode/tools are advertised in the registry but
never sent by the Mistral/Ollama/compat adapters (M7), and small local models
silently receive ~900k-token prompts (no capability-aware context budgeting).

---

## Domain snapshots (verified)

### Work pillar — 479 frontend / 507 server modules
**Solid:** prompt corpus, run pipeline (guided inputs, 4-mode knowledge
resolver, 44 output formats, 16-renderer Transform system), all four flagship
workspaces. **Confirmed gaps:** 33 complete server modules unreachable from any
UI (NIS2, TBML, IFRS 17, SOX… — free launch content); smart search caps at 120
of 479 (`SmartModuleSearch.tsx:56` + `claude.ts:1721`); 5 advertised modules
have no prompt anywhere (incl. a `talent-ad-generator` filename mismatch —
note: `talent-ai-service.ts:97` reads the old name, update both); no in-app
Anthropic key entry (the single biggest first-10-minutes blocker for the
GitHub path); no worked examples/demo content; dual catalog source of truth
(`/api/areas` exists with zero callers).

### Missions
**Solid:** lifecycle engine, credential vault (launch-grade), 9 templates,
6 service packs, A2A delegation, EU-AI-Act gating. **Confirmed gaps:** no
background runner (advance is manual-click only — "autonomous" is false);
action layer (api_call/browser/db) built but unreachable (decomposer schema
omits action types; no task editor; 0 templates use actions); template
parameters defined at every layer then explicitly discarded
(`routes/missions.ts:126`); notification/delivery tasks are fake (LLM prose);
`model_strategy` stored but never read (`resolveModel(_strategy)`); OAuth
refresh exists with zero callers (Gmail pack dies after ~1 h); research tasks
get no web search (hallucination-prone); zero automated tests.

### Portals
**Solid:** the most complete pillar locally — walkthrough builder, descriptor
signing, visitor sandbox, inbox; `/portals/mine` 500 is **FIXED** (stale
memory); a real deployed relay registry answers live at
`relay.futurechain.eu/v1/portals/search`. **Confirmed gaps:** WAN publish
unreachable from the UI (finalize sends no KYC body → every portal is
local-only); desktop discovery never queries the live relay (only the phone
app does); the invoke loop is half-open (visitor never receives the owner's
response; SLA hint is fabricated); every fresh install polls a dead legacy
registry host every 20 min forever (`registry.anton.space` + placeholder trust
key); the live registry contains exactly 1 localhost test portal.

### Collaboration (Agents / A2A / Community)
**Solid:** agent backend with live connector execution, public storefront
endpoints, signed delegation + UI, Beehive (71 tests), E2E community
messaging. **Confirmed gaps:** no nav entry to /agents (unreachable);
`/agents/:id` missing entirely (4 in-app links navigate to nothing); 4 dead
sub-pages over schema-only migrations 200–203; mesh send path
protocol-incompatible with the receiving bridge **and reports false success**
(silent loss; latent until contact-card UI lands — fix first); remote agent
query works but is curl-only; no live two-instance exchange ever verified.

### Pathfinder
**Solid:** the engine (quick/thorough/deep, IRE, source-authority scoring,
threads, SSE). **Confirmed gaps:** default route serves the stub (fabricated
`ranking_breakdown`); all deep links broken; smart actions half-wired
(prefill writers with zero readers; `save_knowledge` is a no-op that fakes
success); synthesis "streaming" delivers one giant delta after completion
(spinner for the whole deep run); Actions/Calibration pages call nonexistent
endpoints over 4 dead tables (migrations 196–199); `search_mode` persisted as
literal `'knowledge'` always; HomeV2 narrates fictional overnight activity.

### Markets
**Solid:** deterministic NAV engine live daily, Consul Council, calibration
math, disclaimers on all 23 pages, help page already discloses the 21%
scorecard. **Confirmed breaks (all S):** verifier COALESCE crash (zero
validations since 2026-04-18; breaks every fresh install identically);
pattern→weight derivers bail on JSON-string `total` (182 patterns consumed,
0 adjustments ever); loop-health watchdog checks a status value the schema
makes impossible and has zero consumers; calibration never computed; fresh
installs auto-run ~20 token-spending crons with no consent (opt-out, not
opt-in); 60k news backlog. Positioning: commit to **research tool + honest
public scorecard**, defer accuracy claims.

### Model providers
**Solid:** module-run path multi-provider end-to-end; ModelSelector +
per-provider Settings chips; pricing SoT registry (Fable 5 added today);
S1/S2/M1–M6 verified done; S3/S4 fixed today. **Confirmed gaps:** the
session-selected model reaches nothing beyond module runs (two disconnected
default-model knobs — localStorage vs env); M7 JSON-mode/tools never sent by
Mistral/Ollama/compat adapters despite the registry advertising them; no
capability-aware context budgeting (7B local models get ~900k-token prompts);
structured extractor hardcoded to Claude Haiku (Transform Panel dead for
non-Claude installs); M8 missions / M9 agents model selection; vision images
JSON.stringify'd into text for non-Claude providers (token bomb); Markets pins
an **invalid** model id (`claude-sonnet-4-5-20250514`) that errors even for
Claude users; RAG vector search needs an OpenAI key even when Ollama
embeddings exist; no cheap-model setup guide.

---

## The plan

### Wave 1 — Honesty + funnel triage (~1.5 engineer-weeks, mostly S)
*Collapse the false-advertising surface and reconnect the funnels before any
feature work. Reviewers probe claims; make everything visible real.*

| # | Item | Effort | Where |
|---|---|---|---|
| 1.1 | Restore real Pathfinder at `/pathfinder`; delete fabricated ranking panel; move visitor surface to `/pathfinder/discover` | S–M | `App.tsx:716`, `PathfinderVisitorPage` |
| 1.2 | Re-point every Pathfinder deep link; honour `?searchId`/`?q` | S | PathfinderBar, HistoryPage, HomeV2, Sidebar, CommandPalette |
| 1.3 | Replace HomeV2's fictional activity feed + hero copy with real data | S | `HomeV2.tsx:119-140,354-357` |
| 1.4 | In-app Anthropic key entry + persist provider keys (write-through + client-cache invalidation — clients are constructed at boot) | S | `routes/settings.ts:20-26,45-48`, `claude-client.ts:183` |
| 1.5 | Surface the 33 hidden modules in AREAS/MODULES | S | `src/lib/constants.ts` + area-patches |
| 1.6 | Fix smart-search 120-cap server-side (getAllModules + keyword pre-filter + Haiku rank); add description matching to sidebar search | S | `claude.ts:1702-1721`, `SmartModuleSearch.tsx:56` |
| 1.7 | Write 4 missing prompts; fix talent-ad-generator mismatch (both call sites); add prompt-presence assertion to the integrity test | S | `server/areas/...`, `talent-ai-service.ts:97` |
| 1.8 | Agents nav entry; delete the 4 dead agent sub-pages | S | Sidebar/NavItemConfig, App.tsx |
| 1.9 | Portals registry hygiene: gate the STH monitor (dead-host polling), document both env vars, fix `/health`→`/v1/healthz` probe, mark legacy registry client dormant | S | `server/index.ts:413-415`, `.env.example` |
| 1.10 | Markets: fix verifier COALESCE crash + JSON-string pattern totals + watchdog vocabulary; reset the 182 wrongly-consumed patterns; compute calibration in the verifier cron | S×3 | `market-prediction-verifier.ts:64-67`, `market-pattern-weight-feedback-service.ts:174+`, `market-loop-health.ts:73` |
| 1.11 | Markets safe-by-default: automation opt-in (gate cron registration; show est. token cost) | S | `server/index.ts:1075+`, MarketOnboardingPage |
| 1.12 | Missions honesty: relabel AI-Act heuristic; trim throw-stub delivery channels from the zod enum | S | `mission-checkpoint.ts:15`, delivery types |
| 1.13 | Pathfinder: cut dead Actions/Calibration pages + 4 dead tables (or descope visibly); persist real `search_mode`; complete portal-mode SSE | S | migrations 196-199, `pathfinder-engine.ts:1230,679-736` |
| 1.14 | Fix marketing-number drift ('485+/56' → verified counts) | S | `OnboardingTour.tsx:27`, README |
| 1.15 | Fix Markets' invalid pinned model id (5 literals error even for Claude) | S | `market-*.ts` `claude-sonnet-4-5-20250514` |

### Wave 2 — Make the headline pillars true (weeks 2–4, the M backbone)
*Three parallel tracks + the cheap-model spine.*

**Track A — Missions act:**
- 2.1 Background mission runner tick (per-mission lock + global concurrency
  cap; autonomy/checkpoint semantics already safe) — *the* highest-leverage
  Missions change.
- 2.2 Action-layer reachability: decomposer emits api_call/browser types
  conditioned on installed packs+credentials; task insert/edit endpoint + UI;
  one v2 template with a real action (Outbound Sales → Gmail send under the
  briefing gate).
- 2.3 Real delivery: notification task type → `missionDelivery.deliver()`;
  auto-deliver final synthesis on completion.
- 2.4 Web search for research-type tasks (hours; demo → defensible).
- 2.5 Honor `model_strategy` in resolveModel + decomposition (closes M8; lets
  a Groq/Ollama user run whole missions cheap).

**Track B — Surface Layer 4:**
- 2.6 AgentDetailPage at `/agents/:id` (chat / settings incl. `default_model`
  picker → closes M9 / connectors) — converts an invisible backend into the
  flagship feature.
- 2.7 Network-agents query UI (discover → pick → query → markdown answer) —
  the two-instance launch demo surface.
- 2.8 Mesh framing fix (encodeRpc frames + response listener + real status +
  loopback test) — **must land before any contact-card UI**.

**Track C — Portals federation:**
- 2.9 Desktop relay search merged into `/api/portals/search` (Pathfinder's
  portal mode federates for free).
- 2.10 KYC publish step in the builder + `relayStatus` in PortalManagePage.
- 2.11 Close the invoke loop: public `GET …/invocations/:responseId` +
  polling in PortalVisitorPage; remove the fabricated SLA hint.

**Cheap-model spine (rides Wave 1's key persistence):**
- 2.12 Server-side default model: persist the Settings choice to app_settings;
  `getConfiguredProvider`/`mapModelToProvider` read it (env DEFAULT_MODEL as
  fallback) — the user's picker finally governs the whole product.
- 2.13 M7: send JSON-mode + tools in Mistral/Ollama/compat adapters, with
  one-retry prompt-JSON fallback on 400.
- 2.14 Wrap the structured extractor in `mapModelToProvider` (+ JSON-nudge
  retry) — un-deadens the Transform Panel for non-Claude installs.
- 2.15 Capability-aware context budgeting: per-model context (Ollama
  `/api/show` or per-endpoint setting) clamps knowledge budget + `num_ctx` +
  visible "context too large" warning; compact-prompt mode below ~16k.
- 2.16 Pathfinder on non-Claude: Bing-search step reuse + Deep-mode guard;
  real streaming synthesis + abort propagation (worst perceived-quality gap).
- 2.17 `docs/RUN_ON_CHEAP_MODELS.md` + "Cost-effective mode" Settings card
  (one-click provider setup + honest degradation banner).
- 2.18 Smart Action Bar prefill readers (Module/Civic/Procure/TaskAgent) +
  real `save_knowledge`.

### Wave 3 — Verify and load content (weeks 4–6, overlaps operator/legal gate)
- 3.1 Portable bundle: rebuild from current main (zip is 293 commits stale) +
  clean-machine functional test; README restructure (portable = headline path).
- 3.2 Showcase content: `exampleInput` on 10 flagship modules + first-run
  Dashboard card.
- 3.3 Template parameter forms + deterministic placeholder substitution.
- 3.4 OAuth token refresh in `resolveSecret` (Gmail durability).
- 3.5 Two-instance verification ladder, scripted (E2E mail → agent_query →
  delegation round-trip → one Beehive session → mesh after the fix) — the
  launch demo video source; answers the "unproven intelligence claims" gap.
- 3.6 Seed the relay with 5–10 real portals (WAN origins) + one verified
  Comm-app visit+invoke over WAN — until then, don't claim it.
- 3.7 Test floors: missions pure functions (SSRF anchors, Gmail
  header-injection, conditional semantics), portals trust stack (~40 tests),
  pathfinder engine helpers, Markets closed-loop integration suite vs real PG.
- 3.8 Markets relabel finish (2 marketing surfaces still claim live accuracy
  measurement) + one full fresh-install smoke of the pillar.

### Post-launch (ordered by 6-layer leverage)
Mission recurrence (needs runner) · `/api/areas` single source of truth ·
agent RAG retrieval (ILIKE → real RAG) + Telemetry/Escalations pages · relay
store-and-forward for desktop Community · contact-card mesh wiring (after fix)
· visitor-home categories from relay · MissionCreator model-strategy UI ·
vision image mapping for non-Claude (drop-with-notice ships first, S) · IRE
multi-provider port (hide toggle until then) · Ollama embeddings on the RAG
query path (fully-local semantic search) · L6 Codestral FIM · agent Directory
listings as the Layer-5 marketplace seed · Pathfinder standing research
threads (make the home-page story real) · generic area landing pages · K.2
public portal snapshot bridge · AAP transport (delete or finish C1–C3).

---

## Dependency spine
key persistence → cheap-model docs/economy mode · runner → action templates →
recurrence · mesh fix → contact cards → mesh demo · relay search → categories
· KYC UI → relay seeding → WAN claim · verifier fix → calibration → thesis
sweep → any learning claim.

## Already landed (2026-06-10, this session)
Fable 5 selectable in the model library (both registries + 7 UI surfaces) ·
parity S3 (compat: on all three entry points) + S4 (Mistral temp/maxTokens) ·
web-push VAPID env mismatch · draft Terms/Privacy pages served by the relay +
Pay URL swap off the parked domain (`docs/LEGAL_PAGES_DEPLOY.md`) ·
risk-disclosure gate port to Comm + Business (in progress).

## Stale doc/memory corrections from this dive
`/portals/mine` 500 → FIXED (alias + test landed 2026-04-26) · "150+ modules"
→ 479/507 verified · flagship workspaces are NOT stubs (prior audit markers
were input placeholders) · April-audit "#1 gap Mission Action Layer" →
substantially built since, but unreachable (different fix than assumed).
