# ANTON Portfolio Audit & Scorecard — 2026-05-30

> **Method.** 18-area deep audit run as a 19-agent multi-agent workflow (~2.25M tokens, ~690 tool
> calls). Each area was mapped and scored 1–7 on six dimensions by an independent agent reading real
> code with file-level evidence, then consolidated by a synthesis pass. Full raw output: workflow task
> `wrytst9vp`. This document is the durable reference; re-run the audit after major changes.

---

## Remediation status — ✅ ALL FINDINGS ADDRESSED (2026-05-31)

> The scorecard and findings below are the **pre-remediation snapshot** taken 2026-05-30. In the days
> after, the full `docs/IMPROVEMENT_ROADMAP.md` was executed and every focus area was worked. The 1-7
> scores are **not** re-scored here (that needs a fresh audit run) — this section records what changed so
> the snapshot is not mistaken for the current state. **A full re-score against current `main` is in
> `docs/PORTFOLIO_AUDIT_2026-05-31.md`** (7 areas +1, 11 flat, 0 regressions; median now 5).

**The 5 confirmed bugs (focus ①): all fixed** — commit `a39cd39`, with guard tests
(`coerce-decision.test.ts`, `module-area-integrity.test.ts`). See §6.

**The 7 ranked focus areas: all addressed** (roadmap complete — every phase ✅):

| Focus | Outcome | Commits |
|---|---|---|
| ② CI-gated testing | Main **RED 10/718 → GREEN, CI-gated**; unit suite 707 → **832**; pure-core + guard suites added (translateSql, ISO-week, model-registry, no-raw-error-leak, isolation, loop-health, pgvector, provider-router) | `51a6b43` |
| ③ Markets credibility | New `checkMarketsLoopHealth` silent-failure detector + `GET /markets/loop-health`; tautological conditional-accuracy signal removed; "self-learning" → "instrumented for learning" in UI/README/marketing/CLAUDE.md. *Live-accuracy proof still needs API keys.* | `6cacd46` |
| ④ Team-mode isolation | Procure (cycle-rooted), Civic (engagement-rooted), Grow (all entities, migration 217) now scope reads by `created_by`, set the owner from the authed user, and guard detail/child routes (404 on non-owner) | `abf2974`, `ab59668`, `b08c111` |
| ⑤ Registry/stack consolidation | `model-capabilities.ts` is the SoT; `MODEL_REGISTRY` + `token-estimator`/`audit` pricing **derived** from it; the `/claude/models` price-drift table fixed; pgvector backend added behind the existing `VectorStoreAdapter` seam (opt-in, default-off). provider-router removal found reckless (**42** importers, not 18) → its contract locked with tests, hot-path delegation deferred-by-design. | `a594615`, `5793225`, `c486c8b`, `c5741db`, `2f19fba`, `58af735` |
| ⑥ App store binding | Code-now items done (Comm per-wallet ledger scoping, Agent Pay attestation→submit). *Pay Play-Integrity number, Companion FCM/APNs keys, Business FX remain operator-gated.* | `345778a` |
| ⑦ Security spot-fixes | SSRF egress guard (`ssrf-guard.ts`) + rate-limit on `/agents/public/*`; `bridge.ts` decrypted-body log deleted; **339** raw error responses → `safeError()` (+ CI guard); migration runner fail-fast under `pg_advisory_xact_lock` | `4d98f2c`, `e9825f6` |

**Net effect on the two systemic weaknesses:** (1) **testing** — the #1 gap — is closed at the
suite/CI level (RED→GREEN, 832 tests, gate enforced), though deep coverage of every engine path is still
maturing; (2) the **claim-vs-reality** gap is addressed by relabelling unproven claims and adding the
loop-health detector, while the *proof* of live self-learning still awaits API-keyed runs. **A re-audit
is the right way to refresh the 1-7 scores against this new baseline.**

## 1-7 rubric

| Score | Meaning |
|---|---|
| 1 | Broken/absent — doesn't work, or a name with no real implementation |
| 2 | Skeleton — scaffolding/stubs; not usable end-to-end |
| 3 | Functional but rough — happy path works; significant gaps/fragility |
| 4 | Solid baseline — works for real use; notable gaps remain (typical "shipped but young") |
| 5 | Good — well-built, mostly production-ready, minor gaps, some tests |
| 6 | Very strong — robust, polished, tested, hardened; near best-in-class |
| 7 | Excellent — best-in-class, comprehensive, secure, well-tested |

---

## Portfolio assessment

ANTON is a genuinely large, coherent, and in many places impressively-engineered portfolio — **not
scaffolding**. The flagship deterministic engine (Risk Atlas) and the mobile apps demonstrate real
depth: correct cryptography, hardened secure storage, and audit-grade domain modeling (receipt
hash-chains, tax engines, Ed25519 pairing). The Work Pillar over-delivers (512 authored modules, zero
stubs).

But two **systemic weaknesses gate trustworthiness**:

1. **Testing is near-absent on the highest-blast-radius backend** — LLM engine, Markets loop,
   Orchestrator, Missions, Portals crypto core all have zero or near-zero unit tests. Worse, the unit
   suite is **RED on `main` (10/718 failing)** and tests are **not run in CI at all**; the declared 60%
   coverage threshold is never enforced.
2. **Several headline "intelligent / autonomous / self-learning" claims are not borne out live** —
   Markets is at 21% accuracy with a one-line bug freezing its learning loop, Orchestrator
   "auto-execution" only writes a DB row, AAP encrypted transport is placeholder code, and RAG
   advertises local-first Ollama while the live path requires OpenAI+ChromaDB.

> **The product is most credible where it is deterministic and least credible where it claims emergent
> intelligence.** The next block of effort should buy down correctness risk in a handful of confirmed
> one-line-class bugs and stand up CI-gated tests — not build new surface.

> **Update (2026-05-31):** both systemic weaknesses have since been worked — the test suite is GREEN +
> CI-gated (RED 10/718 → 832 passing) and the unproven "self-learning" claims were relabelled + given a
> loop-health detector. See **Remediation status** above for the per-finding outcome and commits.

---

## Scorecard (weakest first)

Dimensions: **Fn** functionality · **Code** quality · **UX** (– = no UI) · **Sec** security · **Test** ·
**Prod** production-readiness · **Ovr** weighted overall.

| Area | Ovr | Fn | Code | UX | Sec | Test | Prod | Priority |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| Markets (self-learning) | **3** | 3 | 5 | 4 | 6 | 1 | 3 | high |
| Specialized Agents (L4) | **3** | 3 | 5 | 2 | 3 | 3 | 3 | high |
| LLM Engine & multi-LLM routing | **4** | 5 | 4 | – | 5 | 1 | 4 | high |
| Knowledge / RAG / Output / Export | **4** | 5 | 5 | – | 5 | 3 | 4 | high |
| Orchestrator / Pathfinder / reasoning | **4** | 5 | 5 | – | 5 | 2 | 4 | high |
| Missions (automation jobs) | **4** | 5 | 6 | 4 | 5 | 1 | 4 | high |
| Long-tail pillars (School/Life/Procure/Civic/Grow/Evidence/Hardware) | **4** | 5 | 5 | 4 | 3 | 4 | 4 | high |
| Code Quality / Testing / Build / CI | **4** | 5 | 4 | – | 4 | 3 | 4 | high |
| App: Agent Pay (Electron desktop) | **4** | 4 | 6 | 4 | 4 | 5 | 3 | high |
| Portals (interoperability) | **5** | 5 | 6 | 5 | 5 | 3 | 4 | high |
| Community / Mesh / A2A | **5** | 5 | 6 | – | 4 | 6 | 4 | high |
| Work Pillar & 150+ modules | **5** | 6 | 5 | 5 | 5 | 2 | 5 | high |
| Infra: DB / migrations / security | **5** | 5 | 5 | – | 5 | 3 | 4 | high |
| App: Companion (PWA + Android) | **5** | 5 | 6 | 5 | 6 | 3 | 4 | high |
| App: Comm (messaging + wallet + tax) | **5** | 6 | 6 | 5 | 5 | 5 | 5 | medium |
| App: Business (merchant, phone-only) | **5** | 5 | 6 | 5 | 5 | 5 | 4 | medium |
| App: Pay (payments + KYC/fraud) | **5** | 5 | **7** | 6 | 6 | 5 | 4 | high |
| **Risk Atlas (deterministic engine)** | **6** | 6 | 6 | 4 | 6 | 5 | 5 | maintain |

---

## Cross-cutting themes

1. **Testing is the systemic weakness.** The highest-blast-radius backend systems all score 1–3 on
   testing with zero unit tests (LLM engine, Markets, Orchestrator stage machine, Missions security
   functions, Portals crypto, Specialized Agents path). Apps + Risk Atlas are the exception. The suite
   is RED on main (10/718) and never run in CI.
2. **"Claim vs reality" gap on the intelligence/autonomy story.** Markets 21% accuracy + frozen loop;
   Orchestrator Stage 3+ "auto-execution" only writes a row; AAP encrypted transport is placeholder;
   RAG advertises local-first but requires OpenAI+ChromaDB live.
3. **Confirmed one-line-class correctness bugs with outsized impact** (see §6).
4. **Duplicated/parallel implementations that drift** — 5 model registries, 2 routing stacks, 2 RAG
   embedding paths with 2 incompatible index schemas, 2 PACS.008 representations (Pay), 2 contact-hash
   derivations. Each duplication has already produced a divergence bug.
5. **Inconsistent multi-tenant ownership** — Risk Atlas & Evidence Pack scope every resource by owner;
   Procure/Civic/Grow do not filter by `created_by` → cross-user data leak in team mode (safe only
   because solo is the default today).
6. **Security fundamentals are genuinely strong** (parameterized SQL, AES-256-GCM vaults, Ed25519,
   sandboxed iframes, SELECT-only guards) — undermined only in localized spots (SSRF egress, a
   decrypted-body diagnostic log, inert-in-prod device attestation).
7. **Apps + Risk Atlas show discipline** (zero `any`, zero stub markers, real passing suites) that the
   older server-side pillars lack — the engineering bar rose over time; the legacy backend carries debt.

---

## Apps vs Local

The four apps (Pay, Comm, Business, Companion) + Agent Pay are, on average, **MORE mature than the
comparable ANTON Local backend pillars** — a notable inversion. Every app scores 5+ with real passing
test suites (Pay 107, Comm 117+106, Business 78, Agent Pay 137, Companion 16), near-zero `any`/TODO, and
shippable-grade crypto. The Local backend's "intelligent" pillars (Markets 3, Specialized Agents 3) and
engine-layer areas (LLM 4, RAG 4, Orchestrator 4, Missions 4) are dragged down by absent tests and
unwired "intelligence" claims. **Risk Atlas (6) is the exception that proves the rule** — it shares the
apps' discipline, so the gap is generational/maturity-driven, not frontend-vs-backend.

> **Net:** the apps need finishing touches to *ship* (narrow external-binding gaps); the Local backend
> needs a testing-and-correctness foundation pass before its headline intelligence claims are defensible.

---

## Ranked focus areas (where to dive deeper, by payoff)

### ① Confirmed correctness bugs — cross-area one-line fixes · *currently ~3* · ✅ DONE (`a39cd39`)
**Why:** five independently-confirmed bugs each silently break a headline capability, all one-line-class —
the cheapest possible wins.
**What:** see §6.
**Impact:** restores Haiku streaming, unfreezes the Markets learning loop, makes passphrase wallets
usable, fixes 5 modules serving the wrong domain, fixes the proposals endpoint — disproportionate
functional recovery for ~a day of work.

### ② CI-gated testing on the highest-blast-radius backend · *currently ~2* · ✅ DONE (`51a6b43`)
**Why:** the single most systemic gap and largest credibility risk. Regressions already accumulate
undetected (10 red tests on main; no CI gate). The deterministic cores are pure functions — cheap to
test, catastrophic if wrong.
**What:** add `pnpm test` + a lint gate to `ci.yml`; fix the 10 failing tests so main is green; add
focused unit suites for the pure cores (thinking config, provider routing, cost split, Brier grading,
mission SQL/URL guards, portal Merkle math, orchestrator stage criteria). Prioritize security-critical
functions (`validateSelectOnly`, `isUrlAllowed`, vault encrypt/resolve, log-verifier inclusion proofs,
envelope sign/verify).
**Impact:** turns "green main" into a trustworthy signal; prerequisite for safely refactoring ⑤.

### ③ Markets credibility: prove or relabel self-learning · *currently ~3* · ✅ DONE (`6cacd46`; live-accuracy proof needs keys)
**Why:** positioned as ANTON's flagship proof of self-learning, but live outcomes (21% accuracy, Brier
worse than a coin flip, 0 thesis closures, 4× news backlog growth) contradict the claim.
**What:** after the §6 status fix + backfill, add a "loop health" alert that fires when any closed-loop
cron reports 0 transitions for N consecutive runs (the missing silent-failure detector); fix the
tautological conditional-accuracy signal. Then watch whether accuracy/Brier move; until they do, reframe
"self-learning" → "instrumented for learning".
**Impact:** substantiates the headline claim with moving metrics, or honestly de-risks the marketing.

### ④ Team-mode multi-tenant data isolation · *currently ~3* · ✅ DONE (`abf2974`, `ab59668`, `b08c111`)
**Why:** Procure/Civic/Grow leak cross-user reads/writes in team mode (never filter by `created_by`).
Latent today (solo default) but a clear confidentiality bug the moment team mode is enabled.
**What:** add `created_by = req.user.id OR role=admin` scoping to list/get/update/delete in
Procure/Civic/Grow (mirror Evidence Pack's `assertOwnerOrAdmin` / Risk Atlas's `ensureAtlasAccess`); one
integration test per pillar; reconcile Procure Zod schemas with the actual migration.
**Impact:** closes a cross-user leak before any team-mode deployment; lifts that cohort 4→5.

### ⑤ Consolidate duplicated registries and parallel stacks · *currently ~4* · ✅ DONE (`c486c8b`, `c5741db`, `2f19fba`)
**Why:** 5 model registries, 2 routing stacks, 2 RAG embedding paths — each has already produced a
divergence bug. Every future model/embedding update risks silently desyncing.
**What:** make `model-capabilities.ts` the single source of truth; derive `max_tokens`/pricing/thinking
from it; retire the duplicate tables in `modelAdapter`/`model-router`/`claude-client`/`token-estimator`.
Consolidate RAG onto one embedding adapter + one index schema; either retire OpenAI/ChromaDB hardcoding
or update the docs to state vector RAG requires it.
**Impact:** eliminates a whole class of drift bugs; the next model update becomes a one-file change.

### ⑥ App store / production binding gaps (Pay, Companion, Business) · *currently ~4* · ✅ DONE (code scope, `345778a`; secrets/devices operator-gated)
**Why:** three apps are functionally/cryptographically strong but cannot ship their headline capability.
**What:** Pay — set the real Google Cloud project number, add Play Integrity `-keep` ProGuard rules, run
a release-build attestation smoke on hardware, reconcile the bilateral-vs-broadcast settlement narrative.
Companion — wire `firebase-admin` (FCM) + `@parse/node-apn` (APNs) behind `VITE_FIREBASE_ENABLED`.
Business — trim AndroidManifest to POS-needed permissions; wire a real/interim FX source.
**Impact:** moves three apps from "demonstrably secure design" to "shippable"; activates the enterprise
approvals wedge.

### ⑦ Security spot-fixes: SSRF, log leakage, public endpoints · *currently ~3* · ✅ DONE (`4d98f2c`, `e9825f6`)
**Why:** localized gaps undercut an otherwise strong posture.
**What:** add SSRF egress controls (block private/link-local/`169.254.169.254`, optional
`ALLOWED_AGENT_HOSTS`) + auth+throttle on the CSRF-exempt unauthenticated `/agents/public/query`
LLM-spend path; delete the `bridge.ts` TEMP-DIAG decrypted-body log immediately; sweep the 263 raw
`String(e)` catches onto `safeError()`; make the PG migration runner fail-fast under `pg_advisory_lock`.
**Impact:** closes an unauthenticated-LLM-spend + internal-network-pivot path, stops decrypted-payload
leakage, ends production error-text leakage, removes the half-applied-schema data-integrity risk.

---

## Already excellent — maintain, don't churn

- **Risk Atlas (6)** — strongest, best-tested system: deterministic LLM-free scoring, 25 exhaustive unit
  tests, double-guarded by DB CHECK constraints, consistent `ensureAtlasAccess`. Only add integration
  tests over the SQL write-path.
- **The Anthropic LLM path specifically** — prompt-cache static/dynamic split, correct adaptive thinking
  + separate `output_config` effort, retry/backoff, circuit breaker, cache-differentiated cost
  accounting. The problems are in the surrounding multi-provider plumbing, not this core.
- **Output-transformation pipeline (renderer registry)** — transactional artifact+version inserts with
  `FOR UPDATE`, ownership joins, path-traversal containment, nosniff downloads. Needs export-fidelity tests.
- **Pay app's security + code quality (7, portfolio high)** — private key never in JS heap, real
  address-poisoning defence, fail-closed secure store, zero `any`/TODO. Only prod-binding wiring lags.
- **Comm app's E2E crypto + tax engine** — correct X25519/HKDF/AES-GCM with honest disclaimers; ~30-
  jurisdiction tax engine, 106 passing tests. Close the per-wallet ledger scoping before multi-wallet.
- **Mesh transport + reference relay** — verified P2P with 83 mesh + 73 relay tests incl. attacker-mocked
  threat tests. Gaps are AAP stub + the diagnostic log, not the transport.
- **Work Pillar content breadth** — 512 fully-authored, zero-stub module prompts + documented 7-layer
  assembly. Protect with a CI integrity test rather than churning prompts.
- **Portfolio-wide security fundamentals** — parameterized SQL (zero interpolation found), AES-256-GCM
  vaults, sandboxed owner-HTML iframes, SELECT-only DB guards.

---

## 6. The 5 confirmed one-line-class bugs (focus area ①)

Each was independently cited with file:line by the audit. **All five were fixed and verified — commit
`a39cd39` (2026-05-30)** — with guard tests added (`coerce-decision.test.ts` ×7, `module-area-integrity.test.ts` ×4). The "Fix" column below describes what shipped.

| # | Bug | Location (as reported) | Effect | Fix |
|---|---|---|---|---|
| 1 | Haiku `max_tokens` ceiling | `server/services/claude-client.ts:126` (`MODEL_MAX_OUTPUT` Haiku = 32 000) | Haiku streaming sends `max_tokens=32000` > real 8192 ceiling → API 400; **Haiku is unusable** | Derive ceiling from `model-capabilities.ts` (8192) instead of the flat 32k |
| 2 | Markets learning loop frozen | Markets pattern status `'new'` vs query `'active'` mismatch | Pattern→weight loop never runs (**0 weight adjustments ever**) | Align the status vocabulary on one value; backfill the existing `'new'` rows |
| 3 | Agent Pay passphrase drop | `apps/anton-agent-pay` `coerceDecision` | Passphrase dropped → **every passphrase-wallet payment fails** | Carry the passphrase through `coerceDecision`; add a passphrase-wallet e2e test |
| 4 | Duplicate module ids | `src/lib/constants.ts` (module defs) | 5 modules serve **the wrong area's prompt** | Namespace the module index by area, or rename the 5 colliding ids; add a CI uniqueness test |
| 5 | Orchestrator proposals endpoint | `GET /orchestrator/proposals` (`db.run` instead of `db.all`) | Endpoint **broken** (no rows returned) | Change `db.run` → `db.all` |

---

## How to use this document

- **Done (2026-05-31):** focus areas ①–⑦ all addressed — the roadmap is complete (see **Remediation
  status**). Remaining items are operator-gated or deferred-by-design, not open code work.
- **Next:** re-run the audit workflow to refresh the 1-7 scores against the new post-remediation
  baseline — the scorecard above is the pre-remediation snapshot and is now stale on the worked areas.
- **Maintain:** leave the "already excellent" list alone unless adding tests.
