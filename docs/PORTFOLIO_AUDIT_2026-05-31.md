# ANTON Portfolio Audit — Refresh & Re-score — 2026-05-31

> **What this is.** A re-run of `docs/PORTFOLIO_AUDIT_2026-05-30.md` against the **current `main`** after
> the remediation roadmap (`docs/IMPROVEMENT_ROADMAP.md`) was executed. 18 independent agents
> (workflow `wan4k1fao`, ~1.29M tokens, 433 tool calls) each re-read the real post-remediation code,
> **verified the relevant commits actually landed** (not the commit messages), and re-scored their area
> 1–7 on the same six dimensions — under an explicit *do-not-inflate* instruction (a dimension only moves
> with file/commit evidence the agent personally read; untouched areas stay flat). Compare against the
> 2026-05-30 baseline; that document remains the prior snapshot.

## Headline

The portfolio moved up **honestly and modestly**: **7 areas +1, 11 flat, 0 regressions.** The
distribution shifted from `{3:2, 4:7, 5:8, 6:1}` to **`{3:1, 4:4, 5:10, 6:3}`** — the median is now a
solid **5**, the bottom "3" tier shrank to a single area, and the top "6" tier tripled.

The two systemic weaknesses from the baseline are **structurally addressed but not fully closed**:
1. **Testing** — the #1 gap — is fixed *at the gate*: main went RED 10/718 → **GREEN, CI-gated 832
   tests**, with structural guards against the exact regression classes the audit found (registry drift,
   raw-error leaks, module/area collisions). But coverage is **broad-and-shallow** — the highest-blast
   engines (Markets learning loop, Orchestrator staged-autonomy, Missions executor, provider-router SSE,
   agent-processor) still have ~zero direct tests; the new suites are mostly pure-core + guards.
2. **Claim-vs-reality** is narrowed to two specific, honestly-labelled spots: **Markets** (relabelled
   "instrumented for learning"; live accuracy still unproven) and **Orchestrator** staged auto-execution
   (advancement gated on unvalidated human-supplied ratings). The RAG docs↔runtime contradiction is fixed.

> **The product is still most credible where it is deterministic** — but the *gap* between that and the
> "intelligent" surface is now smaller and better-instrumented, not papered over.

---

## Refreshed scorecard (weakest first)

Dimensions: **Fn** · **Code** · **UX** (– = no UI) · **Sec** · **Test** · **Prod** · **Ovr** weighted ·
**Δ** change vs 2026-05-30.

| Area | Ovr | Δ | Fn | Code | UX | Sec | Test | Prod |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Markets (instrumented-for-learning) | **3** | — | 3 | 5 | 4 | 6 | 2↑ | 3 |
| Specialized Agents (L4) | **4** | **+1** | 3 | 5 | 2 | 5↑ | 4↑ | 3 |
| Knowledge / RAG / Output / Export | **4** | — | 5 | 6↑ | – | 5 | 4↑ | 4 |
| Orchestrator / Pathfinder / reasoning | **4** | — | 5 | 5 | – | 5 | 2 | 4 |
| Missions (automation jobs) | **4** | — | 5 | 6 | 4 | 5 | 1 | 4 |
| LLM Engine & multi-LLM routing | **5** | **+1** | 5 | 5↑ | – | 5 | 3↑ | 5↑ |
| Long-tail pillars (School/Life/Procure/Civic/Grow/Evidence/Hardware) | **5** | **+1** | 5 | 5 | 4 | 4↑ | 4 | 4 |
| Code Quality / Testing / Build / CI | **5** | **+1** | 5 | 5↑ | – | 5↑ | 5↑ | 5↑ |
| App: Agent Pay (Electron desktop) | **5** | **+1** | 5↑ | 6 | 4 | 5↑ | 5 | 4↑ |
| Portals (interoperability) | **5** | — | 5 | 6 | 5 | 5 | 3 | 4 |
| Work Pillar & 150+ modules | **5** | — | 6 | 5 | 5 | 5 | 3↑ | 5 |
| App: Companion (PWA + Android) | **5** | — | 5 | 6 | 5 | 6 | 3 | 4 |
| App: Comm (messaging + wallet + tax) | **5** | — | 6 | 6 | 5 | 5 | 5 | 5 |
| App: Business (merchant, phone-only) | **5** | — | 5 | 6 | 5 | 5 | 5 | 4 |
| App: Pay (payments + KYC/fraud) | **5** | — | 5 | **7** | 6 | 6 | 5 | 4 |
| Community / Mesh / A2A | **6** | **+1** | 5 | 6 | – | 5↑ | 6 | 4 |
| Infra: DB / migrations / security | **6** | **+1** | 5 | 5 | – | 6↑ | 4↑ | 5↑ |
| **Risk Atlas (deterministic engine)** | **6** | — | 6 | 6 | 4 | 6 | 6↑ | 5 |

(↑ marks a dimension that rose vs the baseline; the Overall Δ column flags only band changes.)

---

## What moved, and why (each verified against real code)

- **Code/Testing/Build/CI 4→5.** The most-remediated area. `ci.yml` now has real gates — typecheck (526→0
  errors, `continue-on-error` removed), a `pnpm test` vitest gate, security-audit, build. `vitest list` =
  **832 tests / 74 files** (verified to the number, up from 718); the new guards are non-tautological.
  Test 3→5, Sec/Code/Fn/Prod 4→5. *Not a 6:* lint still isn't gated (~338 eslint errors), app suites run
  outside the root gate, no E2E in CI, coverage is broad-but-shallow.
- **Infra DB/security 5→6.** SSRF egress guard wired into the connector executor; 341 raw-error deletions
  → `safeError()` across 26 route files (+ CI regression guard); migration runner fail-fast under
  `pg_advisory_xact_lock`. Sec 5→6, Test 3→4, Prod 4→5.
- **Community/Mesh/A2A 5→6.** The `bridge.ts` decrypted-body diagnostic log (a real no-PII-in-logs
  violation) is gone; `/agents/public/*` throttled; `community.ts` fully on `safeError`. Sec 4→5.
  *Ceiling:* the hand-rolled Noise_IK crypto is still un-KAT-validated against reference vectors.
- **LLM Engine 4→5.** `MODEL_REGISTRY` now *derived* from `MODEL_CAPABILITIES` (drift class structurally
  gone); pricing single-sourced; `gpt-5.4` cost bug fixed; 69 new CI-gated registry/pricing/router tests.
  Code 4→5, Test 1→3, Prod 4→5. *Ceiling:* the streaming dispatch hot path is still untested.
- **Long-tail pillars 4→5.** The Procure/Civic/Grow cross-user leak — the baseline's explicit drag — is
  genuinely closed (owner-scoping + guards + migration 217 + 18 isolation tests). Sec 3→4.
- **Specialized Agents 3→4.** SSRF guard + rate-limit on the public A2A endpoints. Sec 3→5, Test 3→4.
- **Agent Pay 4→5.** Passphrase-drop bug fixed; device attestation wired into the real submit path. Fn/Sec
  up, Prod 3→4. *Ceiling:* attestation is inert until signing certs are provisioned (operator).

## What did *not* move, and why (the honest holds)

- **Markets stays 3.** Phase 2 landed (loop-health detector, de-biased weight tuner, relabel) and Test
  rose 1→2 — but **live prediction accuracy is still not demonstrably > chance**, so the credibility cap
  holds. The detector is also poll-only (no cron/alert consumer yet), and 35 market services remain
  untested. This is the portfolio's one remaining "3", correctly.
- **Knowledge/RAG stays 4** even though Code rose 5→6 — the pgvector backend is exemplary but **default-off
  and mock-tested only**; the dominant ChromaDB query path is unchanged and still silently degrades to
  keyword search without `OPENAI_API_KEY`.
- **Orchestrator/Missions stay 4.** A single endpoint bug-fix (Orchestrator) and zero changes (Missions);
  both engines remain effectively untested and their autonomy claims unvalidated.
- **Pay / Business / Companion / Comm / Portals / Work / Risk Atlas stay flat** — mostly untouched by this
  remediation (which targeted backend/models/security), and their open items are operator-gated (Pay
  Play-Integrity number, Business FX oracle, Companion FCM/APNs keys) or pre-existing maturity gaps.

---

## Newly surfaced / residual gaps (candidate next roadmap)

The re-audit found issues **not** in the 2026-05-30 baseline — the real payoff of re-running:

1. **SSRF guard not applied to every egress.** The new `ssrf-guard.ts` covers the agent connector
   executor, but **Missions `api-call-executor.ts`** (makes outbound HTTP, explicitly allows
   localhost/metadata) and **Portals `portals.ts` LAN-proxy fetch + `portal-handler.ts` origin_endpoint
   forward** still fetch DB-stored URLs with no SSRF check. *Wire the guard into these two paths.*
2. **Raw-error leaks the sweep missed.** The `safeError` sweep + CI guard only cover the `error:` field;
   `task-agent.ts` (`detail: String(err)` at 335/360/1082) and `pathfinder.ts` (`message: String(err)` at
   163/189, SSE) still leak. *Extend the guard regex to `detail:`/`message:` fields.*
3. **App suites are outside the root CI gate.** Pay (107), Comm (120), Business (78), Agent Pay (147) pass
   locally but **no `.github/workflows` job runs them** — the headline "832 CI-gated" does not protect the
   apps. *Add `test:pay`/`test:comm`/`test:business`/agent-pay jobs to CI.*
4. **Comm stale comment** in `wallets.ts:19-23` still says the ledger is "NOT yet scoped per-wallet",
   directly contradicting the shipped per-wallet fix. *Delete the comment.*
5. **SSRF guard TOCTOU/DNS-rebinding window** — `assertSafeEgressUrl` resolves, then `fetch` re-resolves
   independently. *Pin the resolved IP or use a guarded agent.*
6. **Markets detector is poll-only** — `staleMarketLoops` has no cron/alert consumer, so the silent
   failure it targets still needs someone to poll `/markets/loop-health`. *Wire it to the radar/alert cron.*

---

## Cross-cutting themes (revised)

1. **Testing: gate closed, depth pending.** From "RED main, no CI" to "GREEN, hard-gated, 832 tests with
   structural guards." The remaining work is *depth* on the high-blast engines, not the gate.
2. **Claim-vs-reality: narrowed to Markets + Orchestrator autonomy.** Both are now honestly labelled and
   (Markets) instrumented; the proof still needs API-keyed live runs.
3. **Drift consolidated.** Model registries unified onto one SoT; pricing single-sourced; the `/claude/models`
   third table fixed. Remaining: frontend `MODELS[]` still hand-maintained (documented), `model-router`
   COST_RELATIVE not derived.
4. **Multi-tenant isolation: closed** across Procure/Civic/Grow (was the confidentiality drag).
5. **Security posture strengthened but not uniform** — SSRF guard + log-leak deletion + error-hygiene
   sweep landed, but coverage is per-path (see Newly-surfaced #1/#2), not a global egress/error policy.
6. **Apps ≈ Local now.** The baseline's "apps more mature than Local" inversion has narrowed: the Local
   backend's engine/infra/test posture caught up (LLM 4→5, Infra 5→6, Code/CI 4→5), while the apps held
   (their open items are operator-gated, not code debt).

---

## How to use this document

- **Now:** this is the current scorecard; `2026-05-30` is the prior snapshot for diffing.
- **Next:** the "Newly surfaced / residual gaps" list is the natural next mini-roadmap — all are
  small, code-completable, and mostly security/CI hygiene.
- **Re-audit** again after the next substantive change; keep dated snapshots so deltas stay legible.
