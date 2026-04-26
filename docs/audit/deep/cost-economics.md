# G.16 — Cost & Token Economics Audit (real)

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.16
**Scanned:** 529 TS files (server/services/, server/routes/)
**Findings:** 23

> The headline risk: a single missing cap on Phase 4 autonomous mission execution
> is "your AI agent burned $50,000 in one weekend." This audit catches:
> 1) routes that trigger LLM calls without auth (cost-amplification abuse surface),
> 2) mission auto-execution without spend caps,
> 3) workflow recursion without termination guards,
> 4) IRE invocations without iteration ceilings,
> 5) LLM calls inside loops without per-iteration cost guards.

NOT detected (require runtime data): cache hit rates, per-route cost projection,
cost-tier mismatches (Opus where Haiku suffices).

## Severity rollup

| Severity | Count |
|---|---|
| HIGH | 22 |
| MEDIUM | 1 |
| LOW | 0 |

## By pattern

| Pattern | Count |
|---|---|
| Unauthed route invokes LLM | 22 |
| LLM call in loop without explicit cap | 1 |

## HIGH — drop-everything risks

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/routes/ai-assist.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/alignment-reviewer.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/batch.ts` | 15 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/civic.ts` | 446 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/custom-modules.ts` | 215 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/eurlex.ts` | 107 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/finance.ts` | 176 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/grow.ts` | 609 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/health.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/instruction-builder.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/knowledge.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/market-consul.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/news.ts` | 165 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/pe-vc.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/pptx-pipeline.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/presentations.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/procure.ts` | 536 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/radar.ts` | 129 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/reviews.ts` | 19 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/trades.ts` | 1 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/travel.ts` | 174 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |
| `server/routes/workflows.ts` | 1231 | Unauthed route invokes LLM | no requireAuth/authMiddleware/rate-limit/req.user check found at file or mount level — cost-amplification abuse surface |

## MEDIUM

| File | Line | Pattern | Detail |
|---|---|---|---|
| `server/services/claude-client.ts` | 87 | LLM call in loop without explicit cap | loop body invokes LLM without an iteration-aware budget guard — fan-out cost risk |

---

**Cadence (per addendum §G.16):** monthly + pre-release + after any new auto-execution feature.

**Acceptance:**
- HIGH: drop-everything fix. Unauthed LLM routes need requireAuth or rate-limit middleware.
- HIGH: missing spend cap on auto-execution → wire `checkSpending(amount)` before each LLM call.
- MEDIUM: workflow recursion / loop-LLM patterns — add max_runs guard or per-call cost-tracking.
