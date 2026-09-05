-- 264_regrade_directional_predictions.sql
--
-- Restate every directional grading under the rule that replaced the one which
-- contradicted itself.
--
-- ── What was wrong ────────────────────────────────────────────────────────
--
-- verifyDirectional classified each move three ways against a +/-1.5% band and
-- then graded the buckets by two different rules. 'flat' was correct only
-- inside the band; 'up'/'down' were correct on the SIGN alone. So a +0.2% move
-- scored an 'up' call correct AND a 'flat' call correct — two mutually
-- exclusive claims about one outcome, both right. `was_correct` did not
-- describe the world, it described which bucket had been guessed.
--
-- Fixed in code on 2026-09-05 (market-direction-grading.ts): the move is
-- classified once, a prediction is correct when it names that class, and the
-- band scales with the horizon because a fixed 1.5% made short-horizon calls
-- unfalsifiable — two-day predictions averaged 0.56% of movement, so all nine
-- landed "flat" before the market opened.
--
-- ── Why restate history rather than discard it ────────────────────────────
--
-- The alternative, taken on 2026-09-05, was to move the trusted window forward
-- and let the old gradings age out. That is safe but wasteful: the observed
-- move is stored in actual_outcome, so the correct grade is recoverable exactly,
-- with no price re-fetch and no model call.
--
-- That the leading token of actual_outcome IS the grader's own classification
-- is not assumed, it is proved by the data: 'flat' predictions were ALREADY
-- graded strictly, and all 13 in-window flat rows grade identically under both
-- rules. Their agreement is what licenses reading the string.
--
-- The band formula below duplicates market-direction-grading.ts, which is the
-- kind of duplication that has bitten this repository before. It was checked
-- rather than trusted: a script compared this exact SQL against the TypeScript
-- grader across all 186 affected rows and found 0 disagreements.
--
-- ── What this changes ─────────────────────────────────────────────────────
--
--     status              rows   old correct   new correct   flips
--     validated            106            71            39      32
--     validated_legacy      80            23            19       4
--
-- In-window accuracy moves from 67.0% to 36.8% and Brier from 0.2264 to 0.2681.
-- Under the corrected rule the market itself was flat 53.8% of the time, so the
-- constant "nothing much happens" scores 53.8% against the system's 36.8%. That
-- is the honest number, and it was always the number — the instrument was
-- reporting the other one.
--
-- 19 graded predictions of other claim shapes (price targets, spreads, band
-- claims) are untouched: they were never graded by the directional rule.
--
-- ── What it deliberately does NOT do ──────────────────────────────────────
--
-- Grading multiplies the parent thesis's confidence by 1.1 or 0.8 as a side
-- effect (market-prediction-verifier.ts). Those multiplications were applied
-- with the old verdicts, are clamped, and are therefore not cleanly invertible.
-- They are left alone rather than approximated: a thesis confidence that is
-- slightly wrong is better than one that has been "corrected" by arithmetic
-- nobody can check.

-- ── 1. Snapshot, before anything moves ───────────────────────────────────
CREATE TABLE IF NOT EXISTS market_prediction_regrade_2026_09_05 (
  prediction_id   TEXT PRIMARY KEY,
  old_was_correct INTEGER,
  old_brier_score NUMERIC(10,6),
  old_actual_outcome TEXT,
  snapshotted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO market_prediction_regrade_2026_09_05
  (prediction_id, old_was_correct, old_brier_score, old_actual_outcome)
SELECT id, was_correct, brier_score, actual_outcome
  FROM market_predictions
 WHERE was_correct IS NOT NULL
   AND actual_outcome ~ '^(up|down|flat) \([+-]?[0-9.]+%\)$'
ON CONFLICT (prediction_id) DO NOTHING;

-- ── 2. Regrade ───────────────────────────────────────────────────────────
-- was_correct becomes a strict three-way match; brier_score is recomputed from
-- the binary outcome; actual_outcome's leading token is rewritten so the stored
-- string cannot contradict the verdict. The observed move text is preserved
-- character for character — only the classification of it changes.
WITH g AS (
  SELECT id,
         predicted_direction,
         confidence,
         split_part(split_part(actual_outcome, '(', 2), ')', 1) AS move_text,
         replace(split_part(split_part(actual_outcome, '(', 2), '%', 1), '+', '')::float8 AS move_pct,
         LEAST(6.0, GREATEST(0.25,
           1.5 * sqrt(COALESCE(time_horizon_days, 14)::float8 / 14.0))) AS band
    FROM market_predictions
   WHERE was_correct IS NOT NULL
     AND actual_outcome ~ '^(up|down|flat) \([+-]?[0-9.]+%\)$'
), n AS (
  SELECT id, predicted_direction, confidence, move_text,
         CASE WHEN move_pct >  band THEN 'up'
              WHEN move_pct < -band THEN 'down'
              ELSE 'flat' END AS new_direction
    FROM g
)
UPDATE market_predictions p
   SET was_correct   = CASE WHEN n.new_direction = n.predicted_direction THEN 1 ELSE 0 END,
       brier_score   = POWER(p.confidence
                       - CASE WHEN n.new_direction = n.predicted_direction THEN 1 ELSE 0 END, 2),
       actual_outcome = n.new_direction || ' (' || n.move_text || ')',
       updated_at    = NOW()
  FROM n
 WHERE p.id = n.id;

-- ── 3. Per-row derived cache ─────────────────────────────────────────────
-- accuracy_score is written once at grading time as 1 - brier and never
-- recomputed, so it has to follow. (It also repairs two rows whose Brier had
-- been computed against the 0.7 partial-credit score rather than the binary —
-- an anomaly from 2026-08-29 that the 5b0cb147 repair did not reach.)
UPDATE market_prediction_feedback f
   SET accuracy_score = 1 - p.brier_score
  FROM market_predictions p
 WHERE p.id = f.prediction_id
   AND p.brier_score IS NOT NULL
   AND f.accuracy_score IS DISTINCT FROM (1 - p.brier_score);

-- ── 4. Derived aggregates that cannot be patched, only rebuilt ───────────
-- market_conditional_accuracy is an INCREMENTAL counter guarded by an
-- idempotence ledger: each prediction is claimed once and its outcome added.
-- There is no way to subtract a verdict that has changed, so both the counters
-- and the ledger are cleared and the nightly roll-up rebuilds them from the
-- corrected verdicts. Clearing the ledger without clearing the counters would
-- double-count; clearing the counters without the ledger would leave them
-- permanently empty. They go together or not at all.
DELETE FROM market_conditional_accuracy_applied;
DELETE FROM market_conditional_accuracy;

-- market_confidence_calibration is an append-only snapshot written after every
-- verification pass. Every existing row was computed from the contradictory
-- verdicts, and the Learning page renders them as one series with no marker
-- separating the eras. They are dropped rather than kept: a calibration history
-- that silently splices two different definitions of "correct" is worse than a
-- short one. The next verification pass writes a fresh snapshot.
DELETE FROM market_confidence_calibration;

-- ── 5. Materialized view ─────────────────────────────────────────────────
-- mv_prediction_track_record aggregates was_correct and brier_score and has no
-- on-demand refresh route — it would otherwise show the old figures until the
-- 04:00 cron.
REFRESH MATERIALIZED VIEW mv_prediction_track_record;
