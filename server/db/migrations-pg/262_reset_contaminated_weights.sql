-- 262_reset_contaminated_weights.sql
--
-- One-time repair. Undo the weight corrections that were derived from a
-- broken measuring instrument, so the now-windowed loops can re-derive them
-- from trustworthy data.
--
-- Two independent defects produced the state this migration cleans up.
--
-- ── 1. The unclamped optimizer INSERT ────────────────────────────────────
--
-- market-workflow-orchestrator.ts wrote its signal_weight_optimizer output
-- with no bounds at all, while every other writer clamped to a 0.3 floor.
-- On 30 August 2026 it produced:
--
--     price_target  0.0000
--     directional   0.0883
--     binary        0.9117
--
-- Measured over the trusted window on 31 August, those are close to exactly
-- backwards: directional ran 61.1% over 72 graded predictions (the only claim
-- type with a real sample and a real edge, and 259 more open), while binary
-- ran 40.0% over 5. The optimizer's source query had no date floor, so it
-- learned the ranking from the pre-14-August era when the grader itself was
-- broken.
--
-- 0.0000 is the worse half of that. Every other writer updates weights
-- multiplicatively, and zero is an absorbing state: no sequence of
-- multipliers ever lifts a weight off zero. Left alone, price_target could
-- never recover no matter how well it performed.
--
-- ── 2. The ratchet ───────────────────────────────────────────────────────
--
-- deriveFromSymbolFailure emitted `0.5 + accuracy * 0.5`, which tops out at
-- exactly 1.0 — so every multiplier it could ever produce was ≤ 1 and symbol
-- overrides could only fall. 8 of 13 symbols had already reached the 0.300
-- floor. Five of those were set on 14 August from pre-window gradings, and
-- the in-window record disagrees sharply: XLE 60% over 5, IWM 67% over 3,
-- EEM 100% over 3. They were condemned on evidence that has since been
-- withdrawn.
--
-- ── What this does, and what it deliberately does not ────────────────────
--
-- Resets to 1.0 (neutral), NOT to a hand-picked value. Choosing new weights
-- from the in-window numbers here would be fitting them by hand in a
-- migration and would be indistinguishable, later, from something the system
-- learned. Neutral is the honest starting point: it asserts only that the
-- previous correction was unfounded, and leaves the repaired loops to earn
-- the next one.
--
-- Symbol overrides applied on or after 15 August are LEFT ALONE. Those were
-- derived from in-window gradings, so the evidence behind them stands even
-- though the formula that applied it was one-directional. The symmetric
-- multiplier now in deriveFromSymbolFailure lets them climb back on their
-- own if the accuracy supports it — which is the loop doing its job rather
-- than a migration doing it for them.
--
-- The audit trail in market_signal_weight_adjustments is untouched. It is the
-- record of what happened, including the part that was wrong.

-- Claim-type weights: all three written by the unclamped, unwindowed optimizer.
UPDATE market_signal_weights
   SET weight = 1.0,
       last_calibrated_at = NOW(),
       updated_at = NOW()
 WHERE signal_type IN ('directional', 'price_target', 'binary', 'timing')
   AND category = 'general';

-- Anything else that slipped below the shared floor by the same route.
UPDATE market_signal_weights
   SET weight = 1.0,
       last_calibrated_at = NOW(),
       updated_at = NOW()
 WHERE weight < 0.3;

-- Symbol overrides condemned on pre-window evidence.
UPDATE market_symbol_weight_overrides
   SET weight_multiplier = 1.0,
       rationale = 'reset by migration 262 — prior override derived from pre-14-Aug gradings made by a defective verifier',
       updated_at = NOW()
 WHERE last_applied_at < DATE '2026-08-15';
