-- Migration 284: Make Opus 5.5 the default (4.8 → 5.5), owner decision 2026-09-23.
--
-- The same shape as migration 216 (4.7 → 4.8): `claude-opus-4-8` REMAINS a valid,
-- selectable model, so this is not a rename.
--   • Forward-looking config that still points at the previous default (4.8) moves
--     to 5.5, and column defaults for new rows follow.
--   • Model whitelists are EXPANDED to also permit 5.5 (4.8 is kept) — otherwise
--     MODEL_WHITELIST_001 would flag every run on the new default.
--   • Historical / audit rows (messages, session_snapshots, audit_log, …) are left
--     untouched; rewriting them would falsify provenance.
--
-- Idempotent: every UPDATE is guarded so re-running is a no-op. Safe on tables that
-- don't exist (to_regclass checks).

DO $$
BEGIN
  -- ── Forward-looking configuration defaults (4.8 → 5.5) ─────────

  IF to_regclass('public.orchestrator_config') IS NOT NULL THEN
    UPDATE orchestrator_config SET planning_model = 'claude-opus-5-5' WHERE planning_model = 'claude-opus-4-8';
    ALTER TABLE orchestrator_config ALTER COLUMN planning_model SET DEFAULT 'claude-opus-5-5';
  END IF;

  IF to_regclass('public.agent_orchestrator_runs') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_orchestrator_runs' AND column_name = 'planning_model'
    ) THEN
      ALTER TABLE agent_orchestrator_runs ALTER COLUMN planning_model SET DEFAULT 'claude-opus-5-5';
    END IF;
  END IF;

  -- An enforcement of "use Opus" tracks to the newest Opus tier.
  IF to_regclass('public.compliance_policy') IS NOT NULL THEN
    UPDATE compliance_policy SET enforce_model = 'claude-opus-5-5' WHERE enforce_model = 'claude-opus-4-8';
  END IF;

  IF to_regclass('public.agent_profiles') IS NOT NULL THEN
    UPDATE agent_profiles SET default_model = 'claude-opus-5-5' WHERE default_model = 'claude-opus-4-8';
  END IF;

  IF to_regclass('public.app_gateway_settings') IS NOT NULL THEN
    UPDATE app_gateway_settings SET default_model = 'claude-opus-5-5' WHERE default_model = 'claude-opus-4-8';
  END IF;

  -- ── Whitelist EXPANSION (add 5.5 alongside 4.8, never remove) ──

  IF to_regclass('public.model_allowed') IS NOT NULL THEN
    INSERT INTO model_allowed (user_id, model_id, created_by)
    SELECT DISTINCT m.user_id, 'claude-opus-5-5', m.created_by
    FROM model_allowed m
    WHERE m.model_id = 'claude-opus-4-8'
      AND NOT EXISTS (
        SELECT 1 FROM model_allowed e
        WHERE e.model_id = 'claude-opus-5-5'
          AND (e.user_id = m.user_id OR (e.user_id IS NULL AND m.user_id IS NULL))
      );
  END IF;

  IF to_regclass('public.compliance_rules') IS NOT NULL THEN
    UPDATE compliance_rules
    SET rule_logic = REPLACE(rule_logic, '"claude-opus-4-8"', '"claude-opus-5-5","claude-opus-4-8"')
    WHERE rule_logic LIKE '%"claude-opus-4-8"%'
      AND rule_logic NOT LIKE '%"claude-opus-5-5"%';
  END IF;
END
$$;
