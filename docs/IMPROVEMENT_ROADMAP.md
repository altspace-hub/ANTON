# ANTON Improvement Roadmap

> Derived from `docs/PORTFOLIO_AUDIT_2026-05-30.md` (the 18-area 1–7 scorecard). This is the
> "where to dig and how to fix" plan for the areas that scored ≤5 and need attention. Phase 0 (the
> five confirmed bugs) is **done**. Phases are ordered by dependency and payoff, not just severity.

## Guiding principle

The audit's core finding: ANTON is most credible where it is **deterministic** and least where it
claims **emergent intelligence**, and the systemic risk is **near-absent testing** on the
highest-blast-radius backend. So the sequencing rule is:

> **Buy down correctness risk and stand up a test gate *before* building new surface or refactoring.**
> Make the headline "intelligence" claims either true or honestly relabelled. Finish the apps' last
> mile (they're closest to shippable).

---

## Phase 0 — Confirmed correctness bugs ✅ DONE (2026-05-30)

All five fixed and verified (root typecheck clean · agent-pay typecheck clean · new tests green):

| Bug | Fix | Guard added |
|---|---|---|
| Haiku `max_tokens` 32k→8192 | `claude-client.ts` ceiling aligned to `model-capabilities.ts` | — |
| Markets loop frozen (`status='active'` matched nothing) | 2 queries → `status NOT IN ('resolved','false_positive')`; no backfill needed | — |
| Agent Pay dropped passphrase | `coerceDecision` carries passphrase; extracted to pure module | `coerce-decision.test.ts` (7 tests) |
| "5 modules" = `trades` area stub (5 undefined modules) | Authored the 5 BoP trades modules; renamed colliding `consumer-protection` area → `consumer-rights` | `module-area-integrity.test.ts` (4 tests) |
| Orchestrator `GET /proposals` returned nothing | `db.run` → `db.all` | (covered by Phase 1 route tests) |

---

## Phase 1 — CI test gate + green main  ·  *foundation, do first*

**Why first:** the audit's #1 systemic risk. Main is RED (10/718 failing) and tests are not run in CI,
so regressions land undetected and any refactor (Phase 4) is unsafe. This phase turns "green main" into
a trustworthy signal.

**Where to investigate deeper**
- `.github/workflows/ci.yml` — confirm it runs only `typecheck` today; identify why `pnpm test` was
  never added (the 526-suppressed-errors history suggests it was red and got dropped).
- The 10 failing tests on `main` — run `pnpm test` and triage each: real regression vs. stale test.
- `eslint` config — lint is RED (~338 errors) and ungated; decide gate-now vs. ratchet.
- `docker-compose.yml` — still defaults `DATABASE` to SQLite against the PG-only mandate; reconcile.

**How to fix**
1. Triage + fix the 10 red tests so `pnpm test` is green locally.
2. Add `pnpm typecheck && pnpm test` (and a lint step, ratcheted if needed) as required jobs in `ci.yml`.
3. Add focused **unit suites for the deterministic pure cores** (cheap, high value). Prioritise
   security-critical pure functions:
   - LLM: `getThinkingConfig`, `getOutputCeiling`, provider routing, cache cost split.
   - Markets: Brier grading, GMV/index solver, the now-fixed pattern-status filter.
   - Missions: `validateSelectOnly`, `isUrlAllowed`, vault encrypt/resolve.
   - Portals: Merkle/RFC-6962 inclusion-proof math, envelope sign/verify.
   - Orchestrator: stage-progression criteria; a route test for `GET /proposals` (guards Phase 0 bug #5).
4. Establish a coverage ratchet (don't drop below current) rather than a hard 60% that blocks.

**Acceptance criteria:** `main` green; CI fails a PR that breaks typecheck/tests; ≥1 unit suite per
bullet above; the Phase-0 bugs each have a guarding test.

**Effort:** M–L (the triage is the variable). **Unblocks:** Phase 4.

---

## Phase 2 — Markets: prove or relabel "self-learning"  ·  *credibility*

**Why:** Markets is the flagship proof of self-learning, but live numbers contradict it (21% accuracy,
Brier 0.385 worse than a coin flip, 0 thesis closures). Phase 0 unfroze the pattern→weight loop; now
verify it actually learns, and stop the next silent freeze.

**Where to investigate deeper**
- `market-pattern-weight-feedback-service.ts` — confirm, with the status fix live, that
  `applyPatternFeedback` now processes the ~182 backlog rows and writes `applied_to_weights_at`.
- The closed-loop crons (`market-workflow-orchestrator.ts`) — which loops run, how often, and do any
  silently report "0 transitions"? There is **no silent-failure detector** today.
- `market-prediction-attribution-service.ts` / conditional-accuracy signal — the audit flags it as
  **tautological** (captures the prediction's own direction). Re-derive against realised outcomes.
- Calibration: the inverted calibration finding — where is the reliability curve computed?

**How to fix**
1. **Loop-health alert:** a check that fires when any closed-loop cron reports 0 state transitions for
   N consecutive runs (this is exactly what let the freeze go unnoticed for a month).
2. Fix the tautological conditional-accuracy metric.
3. Re-run and **watch accuracy/Brier move** over a feedback window. Until they demonstrably improve,
   relabel the pillar framing "self-learning" → "instrumented for learning" in UI + docs.

**Acceptance criteria:** loop-health alert exists + tested; conditional-accuracy fixed; a short written
read on whether accuracy moved after the unfreeze; framing matches reality.

**Effort:** M. **Depends on:** Phase 0 (done) + ideally Phase 1 tests around the graders.

---

## Phase 3 — Team-mode multi-tenant data isolation  ·  *confidentiality*

**Why:** Procure/Civic/Grow never filter by `created_by`, so team-mode deployments leak cross-user
reads/writes. Latent today (solo is default) but a hard confidentiality bug the moment team mode is on —
exactly the enterprise path the product targets.

**Where to investigate deeper**
- `server/services/procure-service.ts`, `civic-service.ts`, `grow-service.ts` and their routes — list
  every list/get/update/delete and check for an owner predicate.
- Compare against the **correct** patterns: Evidence Pack's `assertOwnerOrAdmin` and Risk Atlas's
  `ensureAtlasAccess` — reuse one of these.
- Procure routes — Zod schemas **drift from the migration** (validated fields silently dropped); diff
  `091_procure_pillar.sql` against the route schemas.

**How to fix**
1. Add `WHERE created_by = :user OR :isAdmin` scoping to every read/mutation in the three services.
2. Reconcile Procure Zod schemas with the actual columns.
3. One integration test per pillar asserting **user B cannot read/modify user A's rows**.

**Acceptance criteria:** cross-user test passes (B blocked from A's data) for all three pillars; Procure
schema matches migration; cohort lifts 4→5.

**Effort:** M. **Independent** of other phases.

**Status (2026-05-30): DONE for the schema-supported scope.** Procure (cycle-rooted),
Civic (engagement-rooted), and Grow (contacts + opportunities) now scope reads by
`created_by`, set the owner from the authed user, and guard detail/child routes (404 on
non-owner). Solo mode = single admin → transparent. Service-level isolation tests per pillar.
**Follow-up:** Grow's `organisations / interactions / activities / signals / briefings` have
no `created_by` column — full isolation there needs a small migration to add it (or
parent-gating). Procure's deeper budget-field schema drift is a data-modelling decision, not
a leak — deferred.

---

## Phase 4 — Consolidate duplicated registries & parallel stacks  ·  *structural*

**Why:** 5 model registries, 2 routing stacks, and 2 RAG embedding paths each already produced a
divergence bug (Haiku pricing/ceiling, phantom `gpt-5.4`, stale `model-router` Sonnet 4.5, OpenAI-vs-
Ollama). Every future model/embedding change risks silently desyncing. (The recent Opus 4.8 update had
to touch *both* model registries by hand — see `project_opus_4_8_mistral_update`.)

**Where to investigate deeper**
- Model metadata duplication: `server/config/model-capabilities.ts` (intended SoT) vs.
  `server/types/modelAdapter.ts` `MODEL_REGISTRY` vs. `model-router.ts` vs. inline tables in
  `claude-client.ts` + `token-estimator.ts` + `StatusIndicator.tsx` + `audit.ts`. Map every field each
  one owns.
- Two dispatch surfaces: `claude-client.ts → unified-llm-client.ts` (main `/api/claude`) vs.
  `provider-router.ts + adapters/*` (tier-based). Decide one owner per concern.
- RAG: find the live embedding path — the audit says it **silently requires OpenAI + ChromaDB** despite
  the documented "local-first Ollama" claim, with **two incompatible index schemas**.

**How to fix**
1. Make `model-capabilities.ts` the single source of truth; derive `max_tokens`, pricing, and thinking
   config from it; delete the duplicate tables (or make them thin re-exports). Add a test asserting all
   registries agree (or that only one exists).
2. Pick one routing surface as canonical; route specialty callers through it.
3. RAG: consolidate onto one embedding adapter + one index schema (pgvector preferred for the PG-only
   mandate). Either make local-first true **or** update `CLAUDE.md` + `RAG_ARCHITECTURE.md` to state
   vector RAG requires OpenAI+ChromaDB. No silent contradiction.

**Acceptance criteria:** one model SoT with a cross-registry agreement test; one documented routing
path; one RAG embedding path; docs match runtime; the next model update is a one-file change.

**Effort:** L. **Do AFTER Phase 1** (tests make the refactor safe).

**Status (2026-05-30): SAFE scope DONE.** `token-estimator.ts` + `audit.ts` now delegate to
`model-capabilities.ts::estimateCost` (the SoT) — a price update is a one-file edit; the consistency
test was extended to fail on any future server-side pricing drift. Fixed a real display bug
(StatusIndicator priced Sonnet 4.6 sessions as Opus). Docs corrected to match runtime: vector RAG
uses **OpenAI** embeddings (not Ollama; keyword fallback without `OPENAI_API_KEY`) in
`RAG_ARCHITECTURE.md` / `CLAUDE.md` / `.env.example`; `model-router.ts` stale Sonnet-4.5 drift noted.
**Status (2026-05-31): the three deferred "risky merges" investigated (plan + adversarial critique
per merge) and resolved by evidence:**
- **`MODEL_REGISTRY` → DONE** (commit c486c8b). NOT deleted — the async DB-backed `getModelConfig`
  resolver (custom slots + Azure deployments) stays. Instead `MODEL_REGISTRY` is now DERIVED from
  `MODEL_CAPABILITIES` (pricing/context/output/provider live in one place) + a co-located
  presentation supplement. `gpt-5.4` (a selectable model with no caps entry → estimateCost returned 0)
  added to caps. `GET /claude/models` (a third, user-visible table still showing stale Haiku $0.80/$4)
  now derives its prices from the SoT — bug fixed.
- **`provider-router.ts` → DO-NOT-DO-AS-FRAMED; safe slice DONE** (commit pending). "Removing" it is
  reckless: **42** static importers (the "18" above was a real undercount), and it exposes a tier API
  (`large/medium/small` + `streamChat`/`callChat`) that `unified-llm-client` does not. The delegation
  refactor's headline benefit (fix Anthropic caching-bypass) is overstated — `StreamChatConfig` has no
  `staticSystemPrompt` split and the specialty calls are mostly one-shot monolithic prompts (~0 cache
  hits), while delegation risks real divergence (tools-dropped-under-thinking, seed/temperature loss,
  maxTokens, SSE frame shape across 40+ frontend parsers). Shipped the genuinely-valuable slice:
  14 characterization tests locking the provider-router-unique contract (tier resolution, Claude→provider
  mapping, tool-format conversion, Magistral reasoning switch). The hot-path delegation stays DEFERRED
  until a concrete cost signal justifies it; do it then ONE branch at a time, easiest-first, env-gated.
- **RAG → pgvector → DONE (PATH B only)** (commit c5741db). The ChromaDB collection rip-out (PATH A) is
  high-blast/low-value and stays deferred. Added an opt-in `PgVectorStore` behind the existing
  `VectorStoreAdapter` seam (`VECTOR_BACKEND=pgvector`), default-off + additive (migration 218 non-fatal,
  `POST /embeddings/backfill-vec` to enable, auto-fallback to JS cosine). Closed the zero-vector NaN,
  non-1536-dimension, and stale-vec failure modes the review flagged.

**Still deferred (genuinely low-value or operator-gated):** the `provider-router` hot-path delegation
(above), deriving `model-router` COST_RELATIVE, deriving the frontend `MODELS[]`/StatusIndicator from a
shared snapshot, and the ChromaDB→pgvector PATH-A retirement.

---

## Phase 5 — Apps: last-mile production binding  ·  *ship the apps*

**Why:** the apps are the most mature part of the portfolio (5+ with real test suites) but three can't
yet ship their headline capability. These are narrow external-binding gaps, not structural work.

**Where to investigate deeper / how to fix**
- **Pay** — Play Integrity ships a **placeholder Google Cloud project number** (attestation inert in
  prod). Set the real number; add the Play Integrity `-keep` ProGuard rules; run a release-build
  attestation smoke on hardware. Reconcile the **settlement narrative** (bilateral docs vs. the
  broadcast code path) and the **two PACS.008 representations**.
- **Companion** — APNs/FCM push are explicit **stubs**; native push is the approvals/enterprise wedge.
  Wire `firebase-admin` (FCM) + `@parse/node-apn` (APNs) behind `VITE_FIREBASE_ENABLED` / provider keys.
- **Business** — AndroidManifest requests an **over-broad permission set** (camera/mic/location lifted
  from Comm) → Play-review risk; trim to POS-needed. Wire a real/interim **FX rate** (currently stubbed).
- **Comm** — close the deferred **per-wallet ledger scoping** bug (wrong balances + tax positions)
  before promoting multi-wallet.
- **Agent Pay** — wire the built-but-unused **attestation primitive** into the submit path.

**Acceptance criteria:** Pay attestation verified on a release build; Companion push delivers end-to-end
on FCM+APNs; Business manifest minimal + FX live; Comm ledger scoped per wallet; each change has a test
or a documented manual smoke.

**Effort:** M (parallelisable across apps). **Independent** of backend phases.

**Status (2026-05-31): code-now items DONE; the rest need an operator secret/device.**
- **DONE (Comm):** per-wallet ledger scoping — `WalletTx` now carries `walletAddress`; `listTxs`/
  `computeBalanceMicroFtc`/`listTxsByRange` scope by wallet (legacy untagged rows stay visible). Fixes
  wrong balances + tax positions in multi-wallet. 3 tests (`src/comm/__tests__/wallet-ledger.test.ts`).
- **DONE (Agent Pay):** device attestation wired into the submit path via a testable
  `attestationChainConfig(storage, env)` helper — `X-Attestation-Token` is now attached to
  `/submit_signed_transaction` when `AGENT_PAY_API_KEY` is set (local dev stays unattested). 3 tests.
- **Operator-only / code-plus-doc (not completable here — need a real secret/device):**
  - Pay Play Integrity: set the real `GOOGLE_CLOUD_PROJECT_NUMBER` (currently `0` → inert), add the
    `play.core.integrity` ProGuard `-keep` rules, and run a release-build attestation smoke on a
    Play-certified device → `docs/phase2-attestation-e2e-log.md`.
  - Companion push: implement `sendViaFcm` (firebase-admin) + `sendViaApns` (@parse/node-apn) behind
    `APP_GATEWAY_PUSH` + provider keys; delivery requires real FCM/APNs keys + a physical device.
  - Business/Pay FX: both `fx.ts` copies' `fetchFromSource()` return null → wire an interim rate behind
    a flag (`source:'INTERIM_RATE'`); the real Bahnhof FTC oracle is an external dependency.

---

## Phase 6 — Security spot-fixes  ·  *localized holes in a strong posture*

**Why:** the security baseline is genuinely strong; a few localized gaps undercut it.

**Where to investigate deeper / how to fix**
- **SSRF + unauthenticated LLM spend** — `agent-connector-executor.ts` has no egress controls and
  `/agents/public/query` is CSRF-exempt + unauthenticated and can drive LLM cost. Add egress blocking
  (private/link-local/`169.254.169.254`, optional `ALLOWED_AGENT_HOSTS`) + auth + rate-limit.
- **Decrypted-payload log leak** — `server/routes/bridges.ts` has a `TEMP DIAG` log printing **decrypted
  response bodies** on the live mesh path (direct no-PII-in-logs violation). Delete immediately.
- **Production error leakage** — ~263 route catches return raw `String(e)`/`e.message` to clients. Sweep
  onto `safeError()` (codemod + a lint rule to prevent regressions).
- **Migration runner** — non-fatal on failure: it silently retries forever / runs later migrations on a
  half-applied schema. Make it **fail-fast under `pg_advisory_lock`**.

**Acceptance criteria:** `/agents/public/query` authed + throttled + SSRF-guarded with a test; the
bridge diagnostic log gone; raw-error leaks swept + lint-guarded; migration runner aborts on first
failure and is single-flighted.

**Effort:** M. **Independent**; the bridge log + the public endpoint are quick wins — do them first.

---

## Deeper-investigation backlog (scope before fixing)

These need a short investigation to decide direction before committing effort:

1. **Orchestrator autonomy honesty** — Stage 3+ "auto-execution" only writes a DB row, and self-scoring
   is LLM-circular. Decide: build real execution, or relabel as "human-in-the-loop proposals" and remove
   the auto-execution framing.
2. **Specialized Agents frontend** — 4 pages call non-existent endpoints and there is no `/agents/:id`
   route (the UI dead-ends). Decide: finish the frontend, or hide the incomplete surfaces.
3. **RAG direction** (feeds Phase 4) — commit to pgvector + Ollama (true local-first) vs. OpenAI+Chroma
   (and document it). This is a product-positioning decision, not just code.
4. **Mesh/AAP transport** — AAP encrypted transport is placeholder/dead code; the Noise impl is
   uncross-validated against KAT vectors. Decide whether AAP is on the near roadmap; if so, add KAT
   cross-validation tests.
5. **Work Pillar coverage** — the new integrity test guards ids; consider extending it to assert every
   module resolves an output-format and (optionally) a server prompt, to catch the next `trades`-style
   stub at CI.

---

## Suggested sequence

```
Phase 0 ✅ ── Phase 1 (CI+tests) ──┬── Phase 4 (consolidation)
                                   ├── Phase 2 (Markets)
Phase 3 (isolation) ───────────────┤
Phase 6 (security quick wins) ─────┤
Phase 5 (apps last-mile) ──────────┘   (parallel; independent of backend)
```

Phase 1 gates Phase 4. Phases 3, 5, 6 are independent and can run in parallel. The two fastest
credibility wins outside Phase 1 are the **Phase 6 bridge-log + public-endpoint** fixes and the
**Phase 2 loop-health alert**.
