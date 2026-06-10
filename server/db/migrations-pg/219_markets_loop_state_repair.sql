-- Migration 219: Markets closed-loop state repair (Wave-1 cluster C, plan 1.10)
--
-- Two data repairs that pair with code fixes shipped in the same change:
--
-- 1. Pattern→weight feedback (1.10b): the derivers in
--    market-pattern-weight-feedback-service.ts required `typeof meta.total ===
--    'number'`, but pattern metadata stores aggregate counts as JSON STRINGS
--    (pg returns COUNT/SUM bigints as strings), so every actionable pattern
--    was stamped applied_to_weights_at while ZERO rows were ever written to
--    market_signal_weight_adjustments (182 consumed / 0 adjustments live).
--    The code now coerces with Number(); this migration un-stamps exactly the
--    patterns that produced no adjustment so the (fixed) 03:00 cron
--    re-derives them on its next run. History-preserving: any pattern that
--    DID write adjustments is left untouched, and the adjustments audit table
--    is never modified.
--
-- 2. Workflow-run finalization (1.10c): 151 markets workflow_runs rows are
--    stuck in status='running' forever (103 prediction_validation, 40
--    weekly_pulse, 8 daily_intelligence) — runs orphaned by crashes/restarts
--    before recordRun could finalize them. They can never complete; mark them
--    'failed' with an explanatory error_message. started_at history is
--    preserved; only runs older than 1 hour are touched so a genuinely
--    in-flight run at migration time is not clobbered.
--
-- Idempotent: both UPDATEs are predicate-guarded, so re-running is a no-op.

DO $$
BEGIN
  -- ── 1. Reset wrongly-consumed pattern detections ────────────────────────
  IF to_regclass('public.market_pattern_detections') IS NOT NULL
     AND to_regclass('public.market_signal_weight_adjustments') IS NOT NULL THEN
    UPDATE market_pattern_detections p
    SET applied_to_weights_at = NULL
    WHERE p.applied_to_weights_at IS NOT NULL
      -- Only the three types the derivers act on; other types (e.g.
      -- source_performance_gap) legitimately produce no adjustment.
      AND p.pattern_type IN ('directional_bias', 'confidence_miscalibration', 'symbol_failure_cluster')
      -- Closed patterns stay consumed — the feedback query skips them anyway.
      AND p.status NOT IN ('resolved', 'false_positive')
      -- The defining symptom: consumed but no adjustment ever written.
      AND NOT EXISTS (
        SELECT 1 FROM market_signal_weight_adjustments a
        WHERE a.pattern_id = p.id
      );
  END IF;

  -- ── 2. Finalize orphaned markets workflow runs ──────────────────────────
  IF to_regclass('public.workflow_runs') IS NOT NULL THEN
    UPDATE workflow_runs
    SET status = 'failed',
        error_message = COALESCE(
          error_message,
          'Finalized by migration 219: run was orphaned in status=''running'' (interrupted before completion; see plan 1.10c)'
        ),
        completed_at = NOW()::text
    WHERE workflow_id LIKE 'wf_markets_%'
      AND status = 'running'
      AND started_at < NOW() - INTERVAL '1 hour';
  END IF;
END
$$;
