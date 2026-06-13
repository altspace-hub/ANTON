# ANTON Coding Studio — Design

**Doc:** `docs/CODING_STUDIO_DESIGN_2026-06-13.md`
**Date:** 2026-06-13
**Status:** Design proposal — **DECISIONS LOCKED 2026-06-13, build started.**

> ## ✅ DECISIONS LOCKED (2026-06-13) — these override the §G recommendations where they differ
> 1. **Name = ANTON Studio.**
> 2. **Add (do NOT replace) Coding-Large** — Studio is the guided mode that orchestrates T4.
> 3. **Per-project DB = SEPARATE DATABASE per project** (user choice, overrides the schema-per-project recommendation): provision `CREATE DATABASE proj_<slug>` + a least-privilege owner role, scoped DSN in the vault, `DROP DATABASE` on project delete. Heavier ops accepted for hard isolation.
> 4. **Model = ROLE-based mapping** (user: "mistral large = project manager, medium = experts, devstral = code"):
>    - **Mistral Large 3** (`mistral-large-latest`) → the **orchestrator / Project-Manager / lead reasoning** — architecture, planning, the panel-chair synthesis, goal-alignment, the workshop.
>    - **Mistral Medium 3.5** (`mistral-medium-latest`) → the **7 expert personas** (the panel deliberation itself).
>    - **Devstral** (`devstral-medium-latest`) → the **code-generation / edit step**. (Caveat: no extended-thinking — gate to non-thinking code-gen; reasoning escalates to Large.)
>    - **Mistral Small** (`mistral-small-latest`) → utility (extraction/classification/auto-fix).
>    Headline picker default = Mistral Large; user can override to any provider.
> 5. **Toolchains = detect-and-report only** (no auto-install) for the MVP.
> 6. **Autonomy = MORE AUTONOMOUS** (user choice): after a task plan is approved, the loop may write + run + revise to green across multiple tasks before checking in; approve-before-FIRST-write per task is relaxed to plan-approval; **the expert-panel gates and a revise-round cap are always on**; a STOP control is always available.
**Author role:** Lead product architect
**Synthesizes:** 7 ground-truthing dives (I1 foundation/sandbox · I2 7-expert one-model panel · I3 project-scoped coding-atoms · I4 startup workshop + frameworks · I5 workspace/Postgres/multi-language · I6 Mistral default + tiering · I7 competitor landscape)

---

## A. Concept, Name, Pitch, Relationship to Coding Tiers

### A.1 The concept

A **guided, expert-driven, self-learning coding studio** — Lovable / Cursor / Replit-class, built the ANTON way: open, understandable, reusable, forefront. It opens with a **project-startup workshop** (a structured talk: what to build, references, which guidelines / countries / knowledge to lean on), runs the build through a **single-model 7-expert core team** that is heard at START → DURING → TESTING → FINISH, edits and runs real code in a **provisioned, scoped workspace with its own Postgres**, **learns from its own project** via a project-scoped coding-atoms loop, defaults to **Mistral Large 3 / Medium 3.5** to validate the "scaffolding lets a smaller model excel" thesis, and exports the whole governed project as a portable **`.anton` blueprint**.

It is not a re-skin. It is the **fusion** of six already-shipped ANTON rails (the Wave-5.2 real apply/test loop, the AI-Council deliberation + dissent ledger, the Wave-3 atom infra, the Engagement/Discovery workshop machinery, the framework/knowledge resolver, and the model-router/default-store) into one headline surface, plus a small amount of genuinely net-new code (a server-side orchestrator, the enforced single-model panel gate, the project-scoped atom tag, the workspace+DB provisioner).

### A.2 Name options

| Option | Rationale | Verdict |
|---|---|---|
| **ANTON Studio** (a.k.a. "Coding Studio") | Plain, on-brand, signals a *workshop* not a chatbox. "Studio" is the established word for guided-creation (Android Studio, Lovable's "Design View"). Lowest cognitive load for the 35–65 professional. | **RECOMMENDED** |
| **Forge** | Strong "build real things" connotation; pairs with the deterministic test loop ("forged + tested"). Risk: generic, collides with many dev tools (SourceForge, Laravel Forge). | Alternate |
| **Atelier** | Captures "expert craft + guided" beautifully; the core team = master craftspeople. Risk: unfamiliar word for non-European users; harder to say. | Alternate (brand-forward) |

**Recommendation: ANTON Studio.** It reads as the natural top of the Coding area, matches the philosophy ("guided studio, not a chat"), and the user already speaks of a "coding studio."

### A.3 One-paragraph pitch

> **ANTON Studio** turns "I have an idea" into a working, audited, reusable codebase — without leaving your machine. It starts not with code but with a **kickoff workshop** that helps you say what you're really building, who it's for, and which rules and references to lean on (GDPR, WCAG, your country's regime, your own style guide). A **core team of seven experts** — Project Manager, Solution Architect, Product Designer, UX, DevSecOps, Business, and Engineering — reviews your plan at the start, during the build, at testing, and before sign-off, all inside a single model, with every dissent recorded. The studio then **builds, runs, and self-tests real code** in its own sandboxed folder with its own scoped Postgres, **learns from this project as it goes** (what failed, what not to repeat), and ships the entire governed project as a portable `.anton` blueprint. It runs locally, on the model *you* choose — by default a smaller, cheaper Mistral, to prove that ANTON's scaffolding lets a smaller model do frontier work.

### A.4 Relationship to the existing Coding tiers

The Coding area today (`server/areas/coding/area.json`) has five tiers: T1 Code Review, T2 Script Lite, T3 Script Medium, T4 Coding Large (governance lifecycle), T5 Hardware (separate roadmap, no code surface). ANTON Studio is **not a sixth peer tier and not a replacement for Coding Large.** It is a **new "Studio" mode that sits ABOVE T4 and orchestrates it** — the guided front-door to the whole area:

- **It does not replace Coding Large.** Coding Large's lifecycle (`coding-large.ts`, ~49 endpoints), its data model (`coding_projects/releases/tasks/reviews/test_runs`), and its crown-jewel real loop (`coding-workspace.ts`) are the **engine Studio drives**. Studio reuses them wholesale.
- **It promotes T4 from "client-driven prompt skeleton" to "server-orchestrated guided studio."** The honest gap from I1 — *the server never drives the LLM for governance phases; the expert panel is a data model + prompt set, not an enforced gate* — is exactly what Studio closes.
- **T2/T3** (Script Lite/Medium) remain the quick "ask-as-it-goes" path; Studio's **Ask mode** (requirement 6) is their natural home for small one-shots, while **Project mode** is the T4-and-up guided build.
- **Recommendation for the landing page:** `CodingLandingPage.tsx` (the tier picker) gains a top, visually-primary **"Start a Studio project"** entry that launches the workshop; the five tiers remain as "advanced / direct" entries below it. Studio becomes the **new headline of the Coding area** without deleting anything.

---

## B. End-to-End Experience Flow

```
┌─ ASK MODE ─────────────────────────────────────────────────────────────┐
│  Quick one-shot. Reuses T2/T3 Script Lite/Medium + script-sandbox.      │
│  No workshop, no panel, no project DB. "Write me a script / fix this."  │
└────────────────────────────────────────────────────────────────────────┘

┌─ PROJECT MODE (the headline) ──────────────────────────────────────────┐
│                                                                        │
│  1. WORKSHOP / CHARTER  (guided talk — req 1)                          │
│     Resumable, tiered, conversational kickoff. 8 phases:               │
│       Problem & Vision → Scope & MVP → Context & Constraints           │
│       (country/jurisdiction) → Guidelines to lean on (frameworks/packs │
│       auto-suggested) → References (URLs/folders/web/exemplar) →        │
│       Tech stack & language → Expert panel selection → Risks & review  │
│     Emits a PROJECT CHARTER object (Engagement-shaped).                 │
│        ↓                                                               │
│  2. ACTIVATION  (req 4)                                                 │
│     POST /provision → mkdir coding-studio/<slug>/ (auto-allowed) +     │
│     CREATE SCHEMA proj_<slug> + low-priv role + vault DSN.             │
│     User sees + confirms the granted folder path & DB scope.          │
│        ↓                                                               │
│  3. CORE-TEAM PANEL @ START gate  (req 2)                               │
│     One model, 7 experts → PanelVerdict. Blocking dissent halts        │
│     kickoff. PM/Business/Product lenses dominate here.                 │
│        ↓                                                               │
│  ┌─ 4. BUILD LOOP (server-orchestrated) ───────────────────────────┐  │
│  │   plan (release/tasks)  → CORE-TEAM PANEL @ BUILD gate           │  │
│  │     (Architect/DevSecOps/Coding lenses; blocks on dissent)       │  │
│  │   → edit (parseFileBlocks → diff → approve → applyFiles)         │  │
│  │   → sandbox run/test (runProjectTests / script-sandbox)         │  │
│  │   → PROJECT-ATOM LEARNING (test fail/pass, review flag, CVE,     │  │
│  │     arch decision → project-scoped atoms; injected next plan)    │  │
│  │   → revise (one round today; configurable multi-round in Studio) │  │
│  │   → iterate until tasks done / green                             │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│        ↓                                                               │
│  5. CORE-TEAM PANEL @ TESTING gate  (over impl + coding_test_runs)     │
│     UX/DevSecOps/Coding lenses dominate.                               │
│        ↓                                                               │
│  6. FINISH  → CORE-TEAM PANEL @ FINISH gate (thorough mode, goal-     │
│     alignment snapshot; blocking dissent = "do not ship")             │
│     → .anton blueprint export (plan + prompts + panel records +       │
│       frameworks + learned atoms + code + test results)               │
└────────────────────────────────────────────────────────────────────────┘
```

**Two modes (requirement 6):**
- **Ask-as-it-goes** — the conversational quick path. Thin wrapper over the existing Script tiers + `script-sandbox.ts`. No charter, no panel gate, no project DB. For "help me with this file / write me a util."
- **Start-a-project-and-iterate-to-finish** — the full flow above. The autonomy dial (an Open Decision, §G) controls how far the build loop runs between human checkpoints; the panel gates and approve-before-write are *always* on regardless of autonomy.

---

## C. Per-Requirement Design (DESIGN · REUSE @ file:line · NET-NEW)

### Req 1 — Guided entry: project-startup workshop (the "talk" before coding)

**DESIGN.** A resumable, tiered, conversational **Kickoff Workshop** that opens before any code is written. 8 phases (Problem & Vision → Scope & MVP → Context & Constraints/jurisdiction → Guidelines to lean on → References → Tech stack & language → Expert panel → Risks & charter review). It enforces ANTON's "start with the problem, not the solution" by capturing the problem statement *before* any tech choice. It crystallizes into a **Project Charter** object that seeds the panel and the build.

**REUSE.**
- Conversation turn-loop + `STATE_UPDATE`/`PHASE_COMPLETE` deterministic protocol + resumability: `server/services/discovery-engine.ts:329` (`getPhasePrompt`), `:1132` (`parseStateUpdate`), `:1262` (phase advance), behavioral rules `:285`.
- Phase structure + charter→execution proof + charter object shape: `src/pages/EngagementWorkspacePage.tsx:204` (phase list), `:27` (`EngagementData` = a charter), execution assembly `server/routes/engagements.ts:886`.
- AI-crystallizes-config: `src/pages/BuildYourOwnModule.tsx:1192` (guide-message), `:1224` (guide-generate).
- 3-pane UI shell (progress rail / chat / insight rail / final report): `src/pages/DiscoverPage.tsx:582`, resume deep-link `:211`.
- Content seed (single-shot version that already exists): `server/areas/coding/modules/coding-large-discovery/system-prompt.md`.

**NET-NEW.** A `coding-workshop-engine.ts` cloned from `discovery-engine.ts` with a coding-flavored phase script + a `coding_workshop_sessions` table (clone of `discovery_sessions`). The phase-4 framework auto-suggestion (brief → `framework-text-retrieval.retrieve`) and the charter object's `expertPanel[]` + `chosenFrameworks[]` + `techStack` fields. Workshop → charter → seeds the Studio project.

### Req 2 — Core team of ≥7 experts, heard at START/DURING/TESTING/FINISH, within ONE model

**DESIGN.** A **single structured "panel call"** — one model call where the system prompt instructs the model to role-play all 7 experts independently, then a chair synthesis, returning one fenced-JSON `PanelVerdict`. The **gate outcome is computed in code, not by the LLM** (worst-of rollup: `dissent > flag > endorse`; `blocking = any dissent on a mandatory role`), exactly mirroring the AI-Council vote tally and the Risk Atlas residual calculator. Three cost/quality modes: `fast` (1 call, default for most gates), `balanced` (1 call + a cheap utility dissent-extraction pass), `thorough` (7 sequential persona passes + synthesis, for FINISH).

Core team (extensible constant `CORE_TEAM_ROLES`): **Project Manager · IT/Solution Architect · Product Designer · UX Expert · DevSecOps Expert · Business Expert · Coding/Engineering Expert.** Run at the four gates with different dominant lenses (START: PM/Business/Product; BUILD: Architect/DevSecOps/Coding; TESTING: UX/DevSecOps/Coding; FINISH: all, thorough mode).

**REUSE.**
- The single-model multi-persona primitive (the in-ONE-model mechanism): `server/services/prompt-builder.ts:189` (`getExpertRoleInstruction` — already accepts a role array, emits a multi-persona block), persona texts `:59` (`EXPERT_ROLE_INSTRUCTIONS`), `MULTI_PERSPECTIVE_INSTRUCTION` `:162` (the template to generalize).
- "LLM proposes position+reason, code computes the verdict": AI-Council `parseVote`/`tallyVotes` `src/pages/AICouncilPage.tsx:180`/`:197`; chair synthesis `:886`.
- Dissent ledger (decision record): types `AICouncilPage.tsx:45`; extraction service `server/services/council-dissent.ts:72` (system prompt), `:96` (injection-defended user prompt), `:150` (tolerant parser), `:221` (`extractDissentLedger`); persistence `server/routes/council.ts:85`, `PersistedDissentLedger` `:74`.
- Existing endorse/flag/dissent verdict table + per-persona seeding: `coding_reviews` `server/db/schema.postgresql.sql:1655` (`verdict CHECK(endorse|flag|dissent)` :1662); seeding route `server/routes/coding-large.ts:2111`; baked review personas `:428`.
- Deliberation structured-metadata contract to fork: `server/services/deliberation-engine.ts:39` (`DeliberationMeta`).

**NET-NEW.** This is the headline net-new: **convert N client-driven model calls into ONE server-driven structured panel call WITH AN ENFORCED GATE.** A `server/services/core-team-panel.ts` (`CORE_TEAM_ROLES`, `buildPanelSystemPrompt`, `parsePanelVerdict` forked from `parseDissentLedger`, `runCoreTeamPanel(mode)`). A route `server/routes/core-team.ts` (`POST /api/core-team/:projectId/panel { gate, artifact, mode }`). **4 new personas** (PM, Product Designer, UX, DevSecOps) added to `EXPERT_ROLE_INSTRUCTIONS`. The **missing gate**: `PATCH .../reviews/:rid` write-back is no longer needed (the single call writes all 7 rows server-side); add the **phase-advancement guard** that blocks a gate while a mandatory role is `dissent`. One additive migration to extend `coding_reviews.review_type` (or add a `gate` column) + the new persona ids.

### Req 3 — Separate project-scoped "coding atoms" learning instance (active memory)

**DESIGN.** A **project scope tag on the existing atom infra** (not a new retrieval stack, not a new table). Coding signals (test fail/pass, panel flag, bug, CVE, arch decision, revise outcome) become **project-scoped atoms**; they are injected into the *next* plan/edit so the project gets smarter as it runs. Crucially, the loop is **measured** (the Markets lesson): a per-project A/B holdout proves it actually reduces revise-rounds before we claim it works.

**REUSE.**
- Whole Wave-3 atom pipeline: extraction `server/services/atom-extractor.ts:158`; injection `server/services/prompt-builder.ts:567` (`buildAtomLayer`); RRF hybrid search `server/services/hybrid-search.ts:51`; rerank `server/services/atom-boost.ts:27`; multi-provider embeddings `server/services/embedding-adapter.ts:190`.
- Feedback valves: `output_feedback.verdict`, `retrieval_feedback.was_relevant` (migration `226`).
- **The A/B measurement harness verbatim**: `server/services/atom-ab.ts` (deterministic 20% holdout `assignAtomArm` `:40`, `getAtomAbStats` `:133`, `MIN_SCORED_PER_ARM` floor `:30`).
- Coding already funnels into atoms (just unscoped): `server/services/coding-integration.ts:168` (`extractKnowledge`), synthetic row `:191`.
- The test pass/fail capture site already exists: `coding_test_runs` insert `server/routes/coding-large.ts:2920` (`passed` computed `:2917`); revise loop `coding_workspace_applications` (migration `232`).

**NET-NEW.** One migration (next free: **`236_coding_atoms_scope.sql`** — note 234 is taken): `knowledge_atoms.coding_project_id` + `atom_origin` + partial index. A `CODING_ATOM_TYPES` taxonomy (`test.failed`/`pattern.works`/`review.flag`/`risk.identified`/`decision.approval`). **Deterministic capture hooks** (fire-and-forget) at the test/review/dep/change write sites — *prefer no-LLM minting for structured signals* (test pass/fail, CVE are exact data). A `codingProjectId` param on `buildAtomLayer` with a project-match boost in `atom-boost.ts` (mirror the `area 1.3×` block at ~`2.0×`) and a `## LESSONS FROM THIS PROJECT` header. A `getCodingAtomAbStats()` keyed on `coding_task_id`, **primary metric = revise-rounds per task** (count `coding_workspace_applications WHERE kind='revision'`).

### Req 4 — On activation: permission to its OWN directory + a DEFAULT Postgres

**DESIGN.** A studio root under the ANTON dir, **provisioned on activation** — the area gets write/exec to exactly `coding-studio/<project-slug>/` and a **schema-per-project Postgres** (`proj_<slug>`) owned by a least-privilege `studio_<slug>` role that *cannot see* anton/`fc_*` tables. The grant IS the bind row + the vault DSN; both are re-validated/re-scoped on every use and dropped on project delete.

**REUSE.**
- The proven two-layer path/permission engine, unchanged: `coding-workspace.ts` — `getAllowedBases()`:309, `validateWorkspacePath()`:319 (re-checks every use, no default = nothing writable), `validateRelativePath()`:205, `resolveTargetPath()`:238, `isWriteWithinWorkspaceReal()`:257 (symlink realpath guard), `applyFilesToWorkspace()`:440 (backup to `.anton-coding-backup/`).
- Bind/approve/test route gates: `coding-large.ts` PUT /workspace :2567, approve :2743 (advisory-lock atomic claim), tests/run :2883.
- Scoped-DSN-via-vault pattern: `server/services/missions/executors/database-query-executor.ts:96`; `mission-credential-vault.ts:245` (`createCredentialVault`).
- DB connection/role mechanics: `server/db/adapters/postgresql-adapter.ts:240`; `server/db/init-database.ts:13`.
- `ALLOWED_FOLDER_PATHS` discipline + `.env.example:56`.

**NET-NEW.** New env `CODING_STUDIO_ROOT` (default `./coding-studio`) auto-appended to `getAllowedBases()` (the one safe widening — a single ANTON-owned dir, not the user's disk). `POST /api/coding/projects/:id/workspace/provision` (mkdir + bind via existing validators + `CREATE SCHEMA`/`CREATE ROLE`/scoped DSN into vault). Per-run injection of a single `PROJECT_DATABASE_URL` key into the env allowlist — *never* un-stripping the server's `DATABASE_URL`. Activation UX on `WorkspaceSettingsCard.tsx`: a "Create studio workspace" button + read-only granted-path display + a plain-language permission consent ("ANTON Studio will be able to read/write files in this folder and use a private database; it cannot touch the rest of ANTON").

### Req 5 — Multi-language (Rust, TS, Python, …)

**DESIGN.** Generalize the single `test_command` into a small **per-project command set** (`setup` / `build` / `test`), each a validated argv array run through the same approve→execFile gate. Add **toolchain detection** that reports availability honestly per language (never fakes a pass when the runtime is absent). Codestral/Devstral are offered for the code-gen step (§D model tiering).

**REUSE.**
- Execution primitives, unchanged for every language: `validateTestArgv()` `coding-workspace.ts:542` (argv-only, rejects shell binaries), `buildTestEnv()`:588 + `TEST_ENV_KEEP`:578 (strips secrets), `runProjectTests()`:636 (execFile, timeout, cap), `parseTestSummary()`:712 (already recognizes vitest/jest/pytest/go/cargo; `recognized:false` when unparseable — never fabricates).
- Runtime-detection template: `script-sandbox.ts:102` (`resolveRuntime`, honest `no_runtime`).

**NET-NEW.** A `coding_project_commands` (or columns) for `setup_command`/`build_command`/`test_command`. `/commands/:kind/run` generalizing `/tests/run`. A `probeToolchain()` (`execFile <cmd> --version` for cargo/rustc/python/node/tsc) cloning `resolveRuntime`, surfacing green/red per language. Add `CARGO_HOME`/`RUSTUP_HOME`/`VIRTUAL_ENV` to `TEST_ENV_KEEP`; per-run pass the venv python path *in argv* (don't mutate PATH). Per-language presets: TS `tsc --noEmit` + `node --run test`; Python `venv`+`pip install`+`pytest`; Rust `cargo build`/`cargo test`.

### Req 6 — Two modes: Ask-as-it-goes OR start-a-project-and-iterate-to-finish

**DESIGN.** A mode toggle on the Studio landing. **Ask** = the quick conversational path; **Project** = the full workshop→panel→build→finish flow. Project mode carries an **autonomy dial** (ask-every-step ↔ iterate-to-green-then-checkpoint) that the user sets; approve-before-write and the panel gates are always on regardless of the dial.

**REUSE.**
- Ask mode = existing Script tiers + sandbox: `coding-scripts.ts` (T2 :13, T3 :201), `script-sandbox.ts` `runPreviewWithAutofix`.
- Project mode = the workshop (req 1) + the orchestrated build loop driving `coding-workspace.ts` + the panel (req 2).
- Server-orchestration pattern to copy for the iterate loop: the Missions background-runner gap is the same systemic gap — adopt a job-runner so the loop can advance server-side between checkpoints.

**NET-NEW.** A `studio_mode` field on the project + the autonomy-dial setting. The **server-side build orchestrator** (the single biggest net-new beyond the panel): today every governance phase returns a prompt for the client to execute; Project mode needs a server loop that calls the LLM, applies (after approval), runs tests, mints atoms, runs the panel at gates, and advances — within the autonomy budget.

### Req 7 — Default model Mistral Large 3 / Medium 3.5 (validate the smaller-model thesis)

**DESIGN.** A **soft area default** (`area_default_model:coding` → `mistral-large-latest`) plus **per-step tiering** (panel/architecture = Large; edits/iteration = Medium; extraction/auto-fix = utility/Small), with **codestral/devstral for the actual code-gen step**. Ship an **A/B experiment** that holds scaffolding constant and varies only the generation model (Mistral-scaffolded vs frontier-baseline), measuring quality + revise-rounds + cost — **OFF-by-default-verdict** until the numbers justify the claim.

**REUSE.**
- Both Mistral 3-series + code specialists already wired: `model-capabilities.ts:354` (Large 3), `:375` (Medium 3.5 — "agentic + coding"), `:455` (codestral), `:476` (devstral — "the Mistral coding default"); costTiers `modelAdapter.ts:68`; tier map `provider-router.ts:112`.
- Soft-default store to clone: `server/services/default-model-store.ts:86`.
- Per-step tier resolver to clone: `server/services/missions/mission-model-resolver.ts:20`–`:63`.
- Resolution wire point: `server/routes/claude.ts:128`–`152` (after `enforce_model`, before `selectedModel`).
- Utility tier already provider-aware: `utility-model.ts:117`; consumed at `coding-scripts.ts:103`.
- A/B template + quality oracle: `atom-ab.ts` (whole) + migration `226`; `quality_scores` `schema.postgresql.sql:1482` (has `area_id`/`model_used`).

**NET-NEW.** An `area_default_model:<areaId>` resolution step in `claude.ts` (precedence: user override > `enforce_model` > **area default** > product default > env). A `resolveCodingModel(step, strategy, areaDefault)` wrapper + `CODING_TIER_DEFAULTS = { architecture: mistral-large-latest, implementation: mistral-medium-latest/devstral, utility: mistral-small-latest }`; routes return a `recommendedModel` per phase. A `model_arm` column on `audit_log` + `getCodingModelAbStats()`. **Caveat to surface:** devstral/codestral have `supportsThinking:false` and are NOT in `resolveMistralThinking`'s swap map (`provider-router.ts:229`) — a thinking request on them silently runs without reasoning; gate them to non-thinking code-gen steps or extend the swap map.

### ANTON principles throughout (req 8)

- **Open** — local-first; the whole loop runs on `localhost`, code/data never leave the machine; your-own-model (Mistral default, any provider selectable); `.anton` export = no lock-in.
- **Understandable** — the 7-expert panel + dissent ledger + the deterministic code-computed gate make *why* inspectable; honest sandbox limits and toolchain status are shown, never faked.
- **Reusable** — the `.anton` blueprint packages plan + prompts + panel records + frameworks + learned atoms + code; the whole design *reuses* shipped rails rather than rebuilding.
- **Forefront** — matches the 2026 agentic loop (plan→multi-file→sandbox→self-fix→iterate) and adds governance + learning + grounding that closed cloud tools structurally cannot.

---

## D. Architecture

### D.1 Data model (new tables / scopes — all additive, history-preserving)

| Change | Kind | Detail |
|---|---|---|
| `coding_workshop_sessions` | new table | Clone of `discovery_sessions`: `id`, `project_id?`, `tier`, `phase`, `state JSONB`, `autosave_version`, `charter JSONB`. Resumable workshop. |
| `knowledge_atoms.coding_project_id` + `atom_origin` | new columns + partial index | Project scope tag (req 3). Migration **236**. |
| `coding_reviews` extend | additive | Add gates `start`/`finish` to `review_type` CHECK (or new `gate` column) + new persona ids. One row per expert per gate. |
| `coding_panel_decisions` (or `session.config.coreTeamPanel`) | new table or reuse | Panel-level record: full `PanelVerdict` + `extractedAt` + `model`, keyed `(project_id, gate)`. |
| `coding_project_commands` (or columns on `coding_projects`) | new | `setup_command`/`build_command`/`test_command` argv arrays (req 5). |
| `app_settings: area_default_model:coding` | reuse key pattern | Soft Mistral default (req 7). |
| `app_settings: coding_model_strategy` | reuse key pattern | Per-step tier map. |
| `audit_log.model_arm` | new column | Mistral-vs-frontier A/B arm (req 7), mirror `atom_arm`. |
| Postgres `proj_<slug>` schema + `studio_<slug>` role | runtime-provisioned | Per-project scoped DB (req 4). Dropped on project delete. |

**Reused as-is (no change):** `coding_projects/releases/tasks/reviews/test_runs/tech_debt/changes/dependencies`, `coding_workspace_applications` (migration 232), `coding_review_findings`/`rules` (189), `coding_quality_snapshots` (190), `coding_artifacts` (191), `quality_scores`, `knowledge_atoms` retrieval/embedding stack.

### D.2 Services

| Service | New / Reused | Role |
|---|---|---|
| `coding-workspace.ts` | **Reused crown jewel** | parse → validate → diff → backup → write → execFile-test. Studio calls these directly. |
| `script-sandbox.ts` | Reused | Quick preview run + one auto-fix (Ask mode, script-medium preview). |
| `core-team-panel.ts` | **New** | `CORE_TEAM_ROLES`, `buildPanelSystemPrompt`, `parsePanelVerdict`, `runCoreTeamPanel(mode)`, code-side worst-of rollup. |
| `coding-workshop-engine.ts` | **New** (clone discovery-engine) | Workshop turn-loop → Charter. |
| `coding-studio-orchestrator.ts` | **New** | Server-side build loop: plan→panel→edit→approve→test→atom→revise→advance, within autonomy budget. Adopts a job-runner. |
| `coding-integration.ts` | Extended | + `codingProjectId`/`origin` + deterministic `mintCodingAtom()`. |
| `mission-model-resolver.ts` | Cloned → `resolveCodingModel` | Per-step Mistral tiering. |
| `default-model-store.ts` | Pattern reused | Soft area default. |
| `atom-extractor.ts` / `prompt-builder.ts` / `atom-boost.ts` | Extended | Carry/inject/boost project scope. |
| `framework-text-retrieval.ts` / `knowledge-resolver.ts` | Reused | Workshop "guidelines/countries to lean on" + references. |
| `council-dissent.ts` | Reused | Dissent extraction in `balanced` panel mode. |
| `credential-vault` + `database-query-executor.ts` | Pattern reused | Scoped DSN provisioning. |

### D.3 Routes

- **New** `server/routes/core-team.ts` — `POST /api/core-team/:projectId/panel { gate, artifact, mode }` → `PanelVerdict` + SSE (reuse council event names so existing UI renders). `GET .../panel/:gate` decision record.
- **New** `server/routes/coding-workshop.ts` (or extend coding) — workshop turn + finalize → Charter → seed project.
- **Extend** `server/routes/coding-large.ts` — `POST .../workspace/provision` (dir + DB), `POST .../commands/:kind/run`, `GET .../toolchain`, the phase-advancement gate guard, `recommendedModel` in phase responses.
- **Extend** `server/routes/claude.ts:128-152` — area-default resolution step.
- Mount all in `server/index.ts`.

### D.4 Pages / UX

- `CodingLandingPage.tsx` — gains the primary "Start a Studio project" entry + Ask/Project toggle.
- **New** `CodingStudioWorkshopPage.tsx` — DiscoverPage 3-pane shell, the kickoff talk.
- **New** `CodingStudioPage.tsx` — the project shell: build loop, live diff/test panels, panel-verdict cards, "lessons from this project" atom rail, charter sidebar.
- Reuse UI primitives: `WorkspaceApplyPanel`, `WorkspaceTestPanel`, `WorkspaceSettingsCard` (+ Create-workspace button & toolchain status), `ExecutionPlanPanel`, `CompletionRecord`, `DissentLedgerPanel` (for panel verdicts), `QualityScore`.

### D.5 The in-one-model 7-expert panel mechanism (precise)

One Opus/Mistral-Large call. System prompt enumerates the 7 roles, demands independence ("a unanimous panel is suspicious on a non-trivial artifact"), forbids invention ("report only what the artifact supports"), and mandates a single fenced-JSON `PanelVerdict`:

```jsonc
{
  "gate": "start|build|testing|finish",
  "experts": [ { "role": "...", "verdict": "endorse|flag|dissent",
                 "concerns": [{ "point": "...", "severity": "low|med|high" }],
                 "required_change": "...", "rationale": "..." } /* ×7 */ ],
  "agreements": [...], "dissents": [...], "open_questions": [...],
  "synthesis": "chair markdown",
  "panel_verdict": "<computed in code, worst-of>",
  "blocking": "<computed in code: any dissent on mandatory role>"
}
```

`parsePanelVerdict` forks `council-dissent.ts`'s tolerant parser (drops malformed entries, never invents). The rollup and `blocking` flag are computed in code (mirror `tallyVotes` + atlas residual-calculator) — **the LLM never decides the gate.** Persist 7 `coding_reviews` rows + 1 `coding_panel_decisions` record. The phase-advancement guard refuses to advance the gate while `blocking=true`.

### D.6 Project-atoms loop + measurement

Capture (deterministic, fire-and-forget, no LLM for structured signals):

| Signal | Write site | Atom |
|---|---|---|
| test failed | `coding-large.ts:2920` | `test.failed` — "running `<argv>` fails: `<tail>`" |
| test passed after a failing revision | same + prior `kind='revision'` | `pattern.works` |
| panel flag/dissent | `coding_reviews` insert | `review.flag` |
| bug / high tech-debt | `coding_tech_debt` insert | `risk.identified` (origin `bug`) |
| dependency CVE | `coding_dependencies` (`vulnerability_count>0`) | `risk.identified` (origin `cve`) |
| arch decision | `coding_changes` approved | `decision.approval` |

Inject: `buildAtomLayer(..., codingProjectId)` filters/boosts same-project atoms (`## LESSONS FROM THIS PROJECT`, test.failed/review.flag first). Measure: `getCodingAtomAbStats()` — 20% deterministic holdout keyed on `coding_task_id`; **primary metric = mean revise-rounds per task injected-vs-holdout**; honor `MIN_SCORED_PER_ARM`; surface a dashboard tile; **do not claim it works until `sufficient:true` with a non-negative delta** (Markets lesson).

### D.7 Workspace + scoped-Postgres provisioning, activation UX, security tradeoffs (honest)

**Provisioning (`POST .../workspace/provision`):** `mkdir coding-studio/<slug>/` (slug from id, never LLM text) → bind via existing `validateWorkspacePath` (passes because studio root is auto-allowed) → `CREATE SCHEMA proj_<slug>; CREATE ROLE studio_<slug> LOGIN PASSWORD <random>; GRANT USAGE,CREATE ON SCHEMA …; ALTER ROLE … SET search_path=proj_<slug>; REVOKE ALL ON DATABASE anton …` (no public, no anton/`fc_*`) → scoped DSN into the credential vault.

**Activation UX:** plain-language consent on `WorkspaceSettingsCard.tsx` ("Studio can read/write `coding-studio/<project>/` and use a private database; it cannot touch the rest of ANTON or your home folder"), a "Create studio workspace" button, read-only granted path. Permission is intrinsically the bind row + vault DSN — clear the row → auto-revoked.

**Security tradeoffs — stated plainly:**
1. **Sandbox network is NOT blocked** (`script-sandbox.ts:34`, `coding-workspace.ts:27`). `cargo build`/`pip install`/`npm` need network; a malicious `build.rs`/`setup.py` runs arbitrary code with network. This is `execFile`-in-a-local-process, **not a container.** Honest ceiling: a true jail needs Docker/Firejail/`bwrap`/VM — out of scope for local-first; the schema already reserves `environment_mode CHECK(...docker)` for later.
2. **Secrets isolation:** `TEST_ENV_KEEP` strips API keys + `DATABASE_URL` + `NODE_OPTIONS`. The only deliberately-injected secret is the least-privilege `PROJECT_DATABASE_URL`. **Never log the generated password.**
3. **Resource limits:** wall-clock timeout + 1 MB output cap only. No CPU/mem/disk/process caps — a fork-bomb or runaway `target/` is unmitigated; add a `coding-studio/` disk-usage check + `CARGO_TARGET_DIR` cleanup; real cgroup/job-object limits need OS primitives not yet wired.
4. **Postgres blast radius:** role isolation is load-bearing — integrity test that `studio_<slug>` cannot `SELECT` from `sessions`/`fc_wallets`.

### D.8 Model defaulting + per-step tiering

| Step | Tier | Model |
|---|---|---|
| Panel / architecture / discovery / goal-alignment | large | `mistral-large-latest` (256k ctx, deepest reasoning) |
| Implementation / iteration edits | medium | `mistral-medium-latest` or **`devstral-medium-latest`** (code-agent) |
| Narrow completion / single script (Ask) | code | **`codestral-latest`** (FIM specialist) |
| Extraction / naming / classification / auto-fix | utility | `mistral-small-latest` (or keep Haiku) |

Soft default `area_default_model:coding` seeds the picker (user can switch to Claude/any). A/B holds scaffolding constant, varies only the gen model.

---

## E. Differentiation vs Lovable / Cursor (+ parity & honest gaps)

### E.1 Differentiation table

| Dimension | Lovable | Cursor | v0 / bolt / Replit | **ANTON Studio** |
|---|---|---|---|---|
| Hosting | Cloud-only | Local IDE | Cloud / in-browser | **Local-first; code never leaves the machine** |
| Model | Vendor-locked | Composer (own) | Composite vendor | **Your-own-model; Mistral default, any provider** |
| Stack | React+TS+Supabase only | Any (your repo) | Opinionated (React/Tailwind) / framework-agnostic | **Multi-language (Rust/TS/Python/…) w/ honest toolchain status** |
| Guided entry | Prompt chat | Plan mode | Prompt | **Structured kickoff workshop (problem-first, jurisdiction/frameworks)** |
| Governance | None | Rules files (static) | AutoFix RL | **7-expert panel @ 4 gates, code-computed verdict, dissent ledger** |
| Project learning | None | `.cursor/rules` (static) | None | **Project-scoped atoms (living, measured) — what failed, not to repeat** |
| Auditability | Opaque | Chat | Opaque | **Reasoning trail + panel records + trust score baked in** |
| Reusable artifact | Repo export | Repo | Copy-paste components | **Portable `.anton` blueprint (plan+prompts+panel+atoms+code)** |
| Grounding | Generic | Generic | Generic | **Frameworks / country / org standards (GDPR/WCAG/PCI/…)** |

### E.2 Parity features ANTON Studio must have (table stakes)

Live preview/run · multi-file edit · iterate-to-done self-fix loop · plan-before-build with a human checkpoint · Git/version control · one-click deploy. ANTON already has the real apply→diff→test→revise loop (`coding-workspace.ts`) and the plan checkpoint (the panel) — the missing parity pieces are **(a) a polished live-preview surface, (b) the server-driven iterate-to-green loop, (c) real Git.**

### E.3 Honest gaps (ANTON behind today)

- **Self-healing loop maturity** — Replit Agent 3 (browser self-test → fix, 200-min autonomy) and Cursor's tested-until-green agent are far ahead. ANTON's revise loop is one round, client-triggered. **#1 build item: the server-side iterate loop.**
- **In-browser instant execution** — bolt's WebContainers / Replit's cloud IDE = zero-setup preview. ANTON is local-first (a trust strength) but must invest in a real local preview server to feel as instant.
- **No Git** — `git_*` columns exist; nothing creates branches/commits. Backups are a flat `.anton-coding-backup/` dir. Studio likely wants branch-per-release/commit-per-task.
- **Design/visual surface** — Lovable Design View + v0's clean shadcn output set a bar; Studio's preview must look polished or experts dismiss it.
- **Opinionated defaults** — multi-model/multi-framework openness risks inconsistent quality; needs strong "just click Run" defaults layered on the openness.
- **No container isolation** — honest ceiling above.

---

## F. Phased Build Plan (MVP → full)

The MVP is cheap *because* it rides shipped rails: the workshop is a clone of discovery-engine, the build loop already exists in `coding-workspace.ts`, the panel reuses the verdict table + dissent ledger, the atoms reuse the whole Wave-3 stack, and Mistral is already wired.

| Phase | Scope | Effort | Reuses | Net-new | Validate |
|---|---|---|---|---|---|
| **P0 — Studio skeleton + Mistral default** | Landing entry, Ask/Project toggle, soft `area_default_model:coding` + per-step `resolveCodingModel`, `recommendedModel` in phase responses. | **S** | default-model-store, mission-model-resolver, claude.ts wire point | area-default resolution step, tier wrapper | Mistral runs every coding step. |
| **P1 — Kickoff Workshop → Charter** | `coding-workshop-engine.ts` (clone discovery), `CodingStudioWorkshopPage`, framework auto-suggest, Charter object seeds a project. | **M** | discovery-engine, DiscoverPage, engagement charter shape, framework-text-retrieval, knowledge-resolver | coding phase script, `coding_workshop_sessions`, charter→project seed | A real charter assembles & seeds a build. |
| **P2 — One-model 7-expert panel + enforced gate** | `core-team-panel.ts`, 4 new personas, `POST /core-team/:id/panel`, code-computed verdict, persist 7 rows + decision record, phase-advancement guard at START/BUILD. | **M** | getExpertRoleInstruction, council vote/synthesis/dissent ledger, coding_reviews table | single-call panel, the gate guard, migration extend | Blocking dissent actually halts a phase. |
| **P3 — Workspace + DB provisioning + multi-language** | `CODING_STUDIO_ROOT` auto-allow, `/workspace/provision` (dir + schema/role + vault DSN), `coding_project_commands`, `/commands/:kind/run`, `probeToolchain()`, Rust/Python/TS presets, activation UX. | **M** | coding-workspace path/env/exec core, credential-vault, postgresql-adapter | provision endpoint, command set, toolchain probe, env additions | Rust+Python+TS each build/test in a scoped folder + scoped DB. |
| **P4 — Project-scoped atom loop + A/B** | Migration 236 (scope tag), `CODING_ATOM_TYPES`, deterministic capture hooks, project boost in `buildAtomLayer`, `getCodingAtomAbStats` (revise-rounds), dashboard tile. | **M** | whole atom stack, atom-ab harness, capture sites | scope columns, capture hooks, project boost, stats fn | Holdout A/B shows fewer revise-rounds (or honestly: not yet). |
| **P5 — Iterate-to-finish orchestrator + TESTING/FINISH gates** | `coding-studio-orchestrator.ts` server loop (autonomy dial), TESTING + FINISH panel gates, configurable multi-round revise, `.anton` blueprint export. | **L** | the whole P0–P4 stack, alignment-check prompt, bundle export pattern | the server orchestrator + job-runner, autonomy budget, blueprint packager | Iterate-to-green within budget; clean panel sign-off; portable export. |
| **P6 — Parity polish (post-MVP)** | Live local preview server, real Git (branch-per-release/commit-per-task), design-quality output, container mode (`environment_mode='docker'`). | **L** | git_* columns, environment_mode reserve | preview server, git integration, container runner | Feels as instant as bolt; container = hostile-code safety. |

**MVP = P0–P4** (1 S + 3 M ≈ a few focused weeks given the reuse). **Full = +P5/P6.**

**What to validate (do not assume):**
1. **The smaller-model A/B** — scaffolding held constant, Mistral-Large+devstral vs frontier; metrics = `quality_scores.score_overall` delta, revise-rounds delta, cost delta; verdict OFF until `sufficient:true` with non-negative quality delta. The thesis is "match quality at a fraction of cost," and it must be *measured*, not claimed.
2. **The atom-loop effectiveness** — revise-rounds-per-task must fall on later tasks of the same project vs the holdout; treat as falsifiable (the Markets inverted-calibration precedent).

---

## G. Open Decisions for the User

1. **Name** — recommend **ANTON Studio** (vs Forge / Atelier). Confirm.
2. **Replace vs add Coding Large** — recommend **add (Studio as the guided mode that orchestrates T4, not a replacement)**. Confirm you don't want T4 retired.
3. **Per-project DB: schema-vs-separate** — recommend **schema-per-project** (`proj_<slug>` + low-priv role on the same cluster; Postgres-enforced isolation, trivial drop). Alternative = a separate database if you need hard storage/connection-count isolation (heavier ops). Pick one.
4. **Rust/Python toolchain install approach** — Studio **detects and reports** toolchains but does not install them. Decide: (a) document "install rustup/python yourself," (b) a guided installer step, or (c) bundle a toolchain. Recommend (a) for MVP, (b) later.
5. **Default Mistral Large vs Medium** — recommend **Large 3 for the panel/architecture tiers, Medium 3.5 (or devstral) for edits** (the tiering already splits this). Decide whether the *headline* area default shown in the picker is Large (safer reasoning) or Medium (cheaper) — recommend **Large** as the visible default.
6. **Iterate-to-finish autonomy** — how far may the loop run without asking? Approve-before-write and panel gates are always on; the open question is the *between-checkpoints budget* (e.g. "iterate up to N revise-rounds or until green, then checkpoint" vs "ask before every edit"). Recommend a **conservative default (ask before first write of each task; auto-iterate revises to green up to a cap; always stop at panel gates)**, user-raisable.

---

## Appendix — Highest-leverage first step

**Build P2 (the one-model 7-expert enforced panel) first**, even before the workshop. Reason: it is the single sharpest, hardest-to-copy differentiator (governance the closed cloud tools structurally cannot offer), it converts the *already-existing* `coding_reviews` table + AI-Council dissent ledger from "data model + prompt set" into an *enforced gate* (the I1/I2 headline gap), and every later phase plugs into it. It is **M** effort because `getExpertRoleInstruction`, the verdict table, the vote-tally pattern, and the dissent ledger all already exist — the net-new is one service + one route + 4 personas + the gate guard.
