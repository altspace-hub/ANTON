# ANTON Local — Core Experience Review & Improvement Plan (June 2026)

**Produced 2026-06-11** from four parallel expert deep-dives (reuse/portability backbone ·
daily work surfaces · expert workspaces · intelligence/learning layer), every claim
ground-truthed against code (file:line) and, for the learning layer, against the **live
PostgreSQL database**. Read-only investigation. **Nothing implemented — review before acting.**

Scope requested by the owner: modules, workflows, Open Chat, Engagement Tasks, Gap Assessor,
ANTON Task Agent, Coding, Counsel's Desk, the `.anton` format everywhere, the atom /
self-learning / database layer, model-picking by task + cost, NGO capabilities. Lens: the
whitepaper vision — **reliable, reusable, understandable, trustworthy output; redo with
another model; export a good thing as `.anton` to a coworker; ANTON becomes better and
stronger over time.**

---

## The one-sentence verdict

**ANTON has already built the hard parts of its trust and learning story — Ed25519 signing,
per-message config snapshots, trust scores, version diffs, approval gates, a working
atom-retrieval loop, a model recommender, deterministic diff engines — but each is wired into
only one or two surfaces, every human-feedback valve reads zero, and the format that carries
the brand is four dialects behind its own documentation.** Almost nothing below requires
inventing something new; it is "connect the subsystem to the surface next to it" — the same
*severed last miles* failure mode the June-10 update plan diagnosed, now mapped across the
core experience.

### The honest scorecard vs the vision

| Vision claim | Verdict |
|---|---|
| "Export a good thing as .anton to a coworker" | ~40% — true for custom modules/packs/portals/evidence packs; broken for built-in modules; **no module RUN is exportable** (the most vision-central artifact); ~30 of 45 bundle types are export-only souvenirs; marketplace/sharing never moves actual bytes |
| "Redo work with another model" | 70% of plumbing (config snapshots, multi-adapter, seed), **0% of UX** — no rerun button, no diff, Gap Assessor re-runs OVERWRITE findings |
| "One trustworthy format" | Brand exists, contract doesn't — ≥4 manifest dialects, 1 dead importer, a 46th unregistered type, generic validator only accepts 1 of 45 types, docs describe signing the bundler never does |
| "Trustworthy by construction" | Risk Atlas + Evidence Pack meet the bar; **Gap Assessor scores are one-shot LLM speech acts** (and anchored to a "typical entity", not yours); Counsel's Desk "citation tracking" is regex over unverified LLM text; knowledge-pack "grounding" injects pack NAMES + entity counts, never text |
| "Becomes better and stronger" | Architecture B+, reality D — capture works (atoms, scores, audit) but **0/150 retrieval-feedback ratings, 0 checkpoint decisions, quality_avg NULL blocks all apprentice promotions, orchestrator stuck stage-1 after 2,627 briefings, atom-layer effect never measured**; the whole learning layer silently turns OFF on Ollama/cheap installs (Anthropic-hardcoded extractors) |
| "Pick models per task and per cost" | Manual routing good; **the finished per-task recommender (`ModelRecommendationBadge`) is mounted on zero pages**; ~38 utility call-sites hardcode Haiku; the global EUR budget cap reads a column nothing writes — it can never trip |
| NGO platform | Content A− (14 BoP areas, 30 locales), infrastructure C — the cheap/local config an NGO would run gets degraded, learning-disabled, silently-failing embeddings |

---

## Outright bugs found (fix regardless of any plan)

| # | Bug | Where |
|---|---|---|
| B1 | **Global EUR budget cap can never trip + Analytics totalCost always $0** — enforced via `SUM(messages.cost)` but nothing ever writes `messages.cost`; real cost lives in `audit_log.estimated_cost_usd` | `server/routes/claude.ts:203`, `analytics.ts:31` |
| B2 | **Apprentice promotion arithmetically impossible** — run pipeline increments `sessions_completed` but never writes `quality_avg`; all 4 live profiles NULL; `(NULL ?? 0) >= 7.0` false forever | `claude.ts:780-798` vs `services/apprentice.ts:61-71` |
| B3 | **My Work search is title/note-only AND case-sensitive on PG** (raw `LIKE`; `likeInsensitive()` helper exists, unused) — "aml" won't find "AML Policy Review" | `server/routes/sessions.ts:30-33` |
| B4 | **HomeV2's "Find the right module" box is fake** — claims "Powered by Claude Haiku" but just prefixes a Pathfinder string; the real June-10 `SmartModuleSearch` is mounted only on legacy `/home-v1`. Plus two dead links (`/sessions`, `/discovery` — routes don't exist) | `HomeV2.tsx:629,635,414,637` |
| B5 | **Exchange can't import its own built-in-module export** — built-ins export via the flat `antonExport` dialect, import validates via `anton-validator` which demands the legacy fields → always rejected; matching importer `antonImport.ts` is dead code | `routes/exchange.ts:58`, `antonExport.ts:51-76` |
| B6 | **Gap Assessor scores a hypothetical company** — prompt asks for "what a TYPICAL entity at this maturity level would have," even with the client's evidence attached; boards read it as their institution | `gap-assessment-engine.ts:341` |
| B7 | **Workflow approval gates park runs forever** — in-memory `executions` Map (lost on restart); scheduled runs' `awaiting_approval` state stashed in `error_message` with no resume endpoint | `workflows.ts:54-56`, `workflow-executor.ts:104-117` |
| B8 | **Council "Consensus" selector is decorative** — chair/majority/unanimity setting is never read by `runCouncil`; council runs are never persisted at all (no session) | `AICouncilPage.tsx:656-681` |
| B9 | Beehive ships unregistered 46th bundle type `hive-collaborative-output`; docs claim the union is authoritative | `beehive-bundle.ts:133` |
| B10 | `messages.cost`-style honesty leaks on Home: fabricated ROI banner (`sessions×1.5h×€100`) + hardcoded-empty "My Workflow Tasks" card | `HomeV2.tsx:375-378,509-518` |

---

## Ground truth per area (condensed — full detail in the four agent reports)

**.anton format** — 45-type registry + real docs; Evidence Pack signing is best-in-class
(Ed25519 + offline verifier + hash-preserving redaction); knowledge packs carry the right
governance fields (`validated_by`, `source_url`, `effective_date`). But ≥4 manifest dialects,
import coverage ~14/45 (no Risk Atlas import despite its description promising "successor
handover"), modules get only sha256 + free-text author, marketplace stores hashes not bytes,
push-to-contact sends metadata only.

**Modules/runs** — provenance capture is underrated: `config_snapshot` + `model_id` +
`systemPromptVersionId` + seed + RAG citations per message. Missing: the assembled 7-layer
prompt is never persisted (composed inline, evaporates), resolved knowledge sources only
console.logged (no content hashes), no rerun/diff anywhere.

**Open Chat** — far from a dead-end (trust score, citations, review, version diff, trust
certificate PDF, save-as-module, share links). Gaps: edit destroys the thread (no branching),
Transform Panel is module-only, save-as-module saves the generic config not the chat's
distilled know-how, improve-prompt is hardcoded FCP on the one domain-neutral surface.

**Engagements/My Work/Projects** — engagement workspace is deep (11 phases, BM25 resource
RAG, quality gate, iteration diffing) but lives outside the session world: no Trust Score, no
My Work visibility, model hardcoded Opus/Haiku ignoring user choice. Project AI-scaffold
recommendations are display-only (thrown away on create). No unified "yesterday" view.

**Workflows** — three engines (client-side loop / in-memory guided / headless scheduled).
Good human-in-the-loop semantics (pause/override/modify/skip) — on the engine that loses
state at restart. Headless engine supports per-step models; the interactive path locks to the
global model. `notification` + `email_send` steps are stubs listed as real. better-sqlite3 is
only a legitimate external-data connector (but `driver` *defaults* to sqlite when unset).

**AI Council** — genuinely multi-model (per-member Claude/GPT/Gemini/Mistral/Ollama),
chain mode, good presets. But zero persistence (a multi-dollar deliberation lives in React
state), no structured dissent record, consensus decorative (B8).

**Gap Assessor** — 60 fresh framework JSONs (2025/2026 regs, CELEX refs), SSE batching,
iteration snapshots, deterministic diff engine, thinking persisted. But every score is
one-shot LLM-decided (no rubric engine — fails the house Risk Atlas standard), no assessor
score-override path, no evidence→finding linkage, re-runs overwrite, custom frameworks enter
the pool ungated, zero tests.

**Counsel's Desk** — real workspace (8 modes, 23 roles, excellent base prompt). But
citations are client-side regex over the stream, never verified against anything; the
"grounding" layer injects pack names + entity counts (no text) while the actual framework
articles sit on the same disk; no jurisdiction guard; no matter/privilege construct.

**ANTON Task Agent** — cleanest proposal→confirm loop in the product; Haiku quality gate
with auto-retry and per-approach rolling scores (real Layer-2 learning). But the gate judges
the **first 2,000 chars** of a 16k deliverable; execution is prose-only (no tools); no
re-run-step/edit-output recovery; total unreconciled overlap with Missions (best intake can't
act; the actor has no intake).

**Coding** — Coding Large is a real governance skeleton (40 endpoints, expert panel,
releases, tech-debt). But all "execute" endpoints return *prompts*; nothing writes files,
runs code, or executes a test; sandbox preview is an explicit `preview_not_configured` stub;
`coding_test_runs` stores records of tests nothing ran. Prompt-assembly theatre vs 2026
agentic baseline.

**Atoms/learning (live DB)** — the loop is architecturally closed (run → Haiku extraction →
embeddings → RRF hybrid retrieval → reranked injection on every run → injections logged) and
that is rarer than it sounds. Live: 64 atoms, 150 injections, **0 ratings ever**, 0
checkpoint decisions, institutional-memory service unused, `market_atoms` 134,946 rows with
no embeddings, pgvector not installed (fine at this scale), session outputs never embedded
("what did we conclude in March?" unanswerable), atom extractor + ratchet hardcoded
Anthropic (Ollama installs learn nothing, silently).

**Orchestrator/Intelligence/Radar** — 12 real signal sources, well-designed 4-stage trust
ladder. Live: 2,627 briefings, 2,013 proposals, **0 approved, stage 1 forever** — spend with
no behavioral consequence. No signal ever flows into a module run (prompt-builder has zero
radar/pattern references).

**Model routing** — telemetry good (cache-adjusted per-call cost), manual routing good
(default-model-store, mission tiers, cheap-models doc). The finished click-to-apply
recommender is mounted nowhere; recommender is Claude-only and ignores cost telemetry; 38
hardcoded-Haiku utility sites; budget cap dead (B1).

**NGO** — 14 BoP areas/~100 modules, microfinance, mobile-money persona, 30 locales, School
mode: a real content asset. Infrastructure: learning off on Ollama, embeddings degrade to
zero-vectors silently, no capability-aware context budgeting for 7B models, no BoP knowledge
packs (EU-regulatory only), RAG query path still wants an OpenAI key.

---

## The improvement plan — five waves

Ordered so each wave is independently shippable; S/M/L per item. Waves 0–1 are the
highest trust-per-hour in the product. (Owner reviews before any wave starts.)

### Wave 0 — Bugs & honesty (all S; ~a day of agent work)
0.1 Write per-message cost → fixes budget cap + Analytics (B1)
0.2 Apprentice quality wire — fold `quality_scores` into `quality_avg` (B2)
0.3 My Work: `likeInsensitive` + message-content search (B3)
0.4 Mount real `SmartModuleSearch` on HomeV2 + fix the two dead links (B4)
0.5 Gap Assessor: kill the "typical entity" anchor — describe THIS entity from evidence,
    say "no evidence provided" where none (B6, one-line prompt fix; override UI is 1.2)
0.6 Council: wire consensus as a structured vote round or remove the selector; persist runs
    as sessions (B8 — persistence part may slip to 4.2 if heavy)
0.7 Truth pass: remove/wire HomeV2 fake ROI + empty Workflow-Tasks card (B10); label
    `notification`/`email_send` workflow steps "coming soon"; de-FCP Open Chat's
    improve-prompt + workflow-builder prompts (area-aware)
0.8 Register `hive-collaborative-output` (B9); delete or wire dead `antonImport.ts`;
    `database_query` driver must not default to sqlite
0.9 Fix built-in-module export to go through the real bundler path (B5)

### Wave 1 — Trust by construction (the expert-workspace core)
1.1 **Gap Assessor deterministic scoring core** (Risk Atlas pattern): LLM answers 3-5
    structured criterion facts per article with quote-spans; a versioned, unit-tested pure
    function computes score/RAG/priority; LLM keeps the rationale [M]
1.2 Assessor override: `PATCH /findings/:id` + edit UI with `overridden_by`/`override_reason` [S]
1.3 **Inject real framework/pack TEXT, not metadata** — one shared fix in prompt-builder +
    legal-research + task-agent; budgeted, relevance-filtered via existing resolver [S-M]
1.4 **Counsel's Desk verified-citation ledger**: post-stream pass resolving every captured
    citation against local frameworks/packs + EUR-Lex CELEX existence; ✓/?/✗ in the tray,
    persisted [M]
1.5 Evidence-linked findings: addressable evidence docs (id+hash), criterion extraction must
    cite `evidenceRefs[{docId, quote}]`; bridges into Evidence Pack signing [M]
1.6 **Persist the assembled 7-layer prompt + pinned source manifest per run** (content
    hashes) — the prerequisite for reproducibility [S]
1.7 Meaningful re-assessment: carry-forward baseline, "what changed given new evidence,"
    required `changeReason` per moved score; board-ready "since last quarter" view [M]
1.8 Task Agent quality gate hardening: full-output 4-dimension rubric JSON, critique stored
    + fed into retries [S]

### Wave 2 — The .anton contract (reuse/portability)
2.1 **One manifest envelope, one dispatching validator** — `buildSpecManifest` the only
    writer; reader accepts the 3 legacy dialects (read-old/write-new, zero broken files);
    `/exchange/validate` dispatches on `bundle_type` [M]
2.2 **New bundle type `module-run`** — module ref+version, config_snapshot, assembled prompt
    (1.6), pinned source manifest, model+seed, output + structured payload, cost/quality,
    optional signature. *The heart-of-vision item: hand a coworker something reproducible* [M]
2.3 **"Rerun with…" + diff** — rehydrate config_snapshot, swap model, side-by-side
    markdown-aware diff + cost/quality compare, stored as linked run; warn on source drift [M]
2.4 Ed25519 provenance for all bundles — lift the Evidence Pack pattern into anton-bundler
    as an opt-in step; TOFU verify at import (the README already documents this) [M]
2.5 Gap-assessment + legal-session + session/work-product bundle types [S-M]
2.6 Generalize KP-03 governance fields (`validated_by`, `source_url`, `effective_date`,
    `content_confirmed`) into the spec manifest for every type; surface at import [S]
2.7 Gap Assessor second-opinion lane — re-run with another model into a comparison slot
    (never overwrite); per-article agreement view [M]
2.8 Module export fidelity: keep icon/id, derive `llm_providers` from real config [S]

### Wave 3 — Learning that is measured (the Markets lesson, applied)
3.1 Route the learning layer through `mapModelToProvider` (atom extractor ×2, ratchet,
    relationship detector) — Ollama installs start learning [S]
3.2 **Embed session outputs** (`session_output` type already declared) + "Search past work";
    validate with a 10-question paraphrase-retrieval fixture [S-M]
3.3 Feedback valves where the eye is: atom thumbs + 1-click good/bad in the standard output
    footer (writes the empty tables) [S-M]
3.4 **Atom-layer A/B effectiveness experiment** — randomly disable injection on 20% of runs,
    compare quality scores; publish the number on the Intelligence Dashboard. *Before
    investing more in atoms, measure whether the layer helps* [S]
3.5 Per-module accepted-exemplar memory (top-1 structure injection on export/copy/rate-up);
    gate default-on behind +0.5 blind A/B on ≥30 pairs [M]
3.6 Orchestrator spend gate: pause heartbeat briefings while previous N unrated; rating
    action inside the notification [S]
3.7 Mount `ModelRecommendationBadge` in the module run bar + make `recommendModel`
    provider-aware (derive tiers from MODEL_REGISTRY costTier + persisted default); log
    accept/dismiss [S+M]
3.8 `utility_model` setting consumed by the 38 hardcoded-Haiku sites via one helper; log
    JSON-parse success per model [M]
3.9 NGO degradation banner: one health endpoint (embeddings zero-vector? extractor provider?
    atoms flowing?) → honest red/green on the cost-effective card [S-M]

### Wave 4 — Continuity, convergence & marketplace
4.1 **Persist workflow executions to PostgreSQL + resume endpoint** + pending-approvals card
    on Home (optionally the Companion `app_checkpoints` wire) [M]
4.2 Council upgrade: session persistence (if not done in 0.6), structured dissent ledger
    (Haiku extraction: agreements/dissents/severity), docx export, document input [M]
4.3 Unified work timeline in My Work (sessions ∪ engagements ∪ workflow runs ∪ councils ∪
    discovery) [M]
4.4 Engagement→session bridge + model choice in Expert Config (kills hardcoded Opus/Haiku) [M]
4.5 Per-step model + cost preview in interactive workflows (headless already supports it) [S-M]
4.6 Branch-on-edit in Open Chat (minimum: snapshot tail to versions before truncate) [M]
4.7 Transform Panel on Open Chat / Council / Engagement outputs (registry already filters
    server-side) [S-M]
4.8 Save-chat-as-module v2: distill a purpose-built prompt from the conversation [S-M]
4.9 Marketplace moves real bytes: store blobs with listings, hash-verify on download; real
    .anton attachment over community mail/mesh [M-L]
4.10 Import paths for high-value export-only types (risk-atlas first — its description
     promises handover) [M]
4.11 Coding: implement the stubbed script preview via `execFile` in a temp dir (existing
     path-validation discipline) + one auto-fix round + "ran against sample data ✓" badge [M]
4.12 Chroma RAG through the local embedding adapter (drop the OpenAI-key requirement) [M]

### Wave 5 — Big bets (separate decisions, L each)
5.1 Task Agent ↔ Missions convergence: Task Agent intake compiles to a mission run; one
    step/quality shape, one vault, one checkpoint model
5.2 Coding Large apply-to-workspace: parse file blocks → deterministic diff → apply on
    approve → run project tests → real results into `coding_test_runs`
5.3 BoP knowledge packs (2-3 country packs; validates via 20-question small-model eval)
5.4 Full SQLite legacy-code removal (init.ts + adapters, now unreachable after the boot guard)

---

## Source reports

Four agent deep-dives (2026-06-11, session f4116a47): A=.anton/modules backbone,
B=daily work surfaces, C=expert workspaces, D=intelligence/learning (with live-DB queries).
Full texts in the session transcript; this doc is the durable synthesis.
