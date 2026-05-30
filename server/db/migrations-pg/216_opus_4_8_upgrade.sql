-- Migration 216: Make Opus 4.8 the default (4.7 → 4.8)
--
-- Unlike migration 112 (which RENAMED 4.6 → 4.7 because 4.6 was removed from the
-- registry), `claude-opus-4-7` and `claude-opus-4-6` REMAIN valid, selectable
-- models after this upgrade. Therefore this migration is deliberately NOT a blanket
-- rename:
--   • Forward-looking config defaults that pointed at the previous default (4.7)
--     are bumped to 4.8 so existing installs adopt the new default model.
--   • Model whitelists are EXPANDED to also permit 4.8 (4.7 is kept).
--   • Historical / audit rows (messages, session_snapshots, audit_log, …) are LEFT
--     UNTOUCHED — rewriting them would falsify provenance, and 4.7 still resolves
--     correctly for cost lookups.
--
-- Idempotent: every UPDATE is guarded so re-running is a no-op. Safe on tables that
-- don't exist (to_regclass checks).

DO $$
BEGIN
  -- ── Forward-looking configuration defaults (4.7 → 4.8) ─────────

  -- Orchestrator config: the model used for planning new runs.
  IF to_regclass('public.orchestrator_config') IS NOT NULL THEN
    UPDATE orchestrator_config SET planning_model = 'claude-opus-4-8' WHERE planning_model = 'claude-opus-4-7';
    -- New rows should default to 4.8 as well.
    ALTER TABLE orchestrator_config ALTER COLUMN planning_model SET DEFAULT 'claude-opus-4-8';
  END IF;

  -- Legacy orchestrator runs table (if present on older installs): bump only the
  -- column default for future inserts; existing per-run records are history.
  IF to_regclass('public.agent_orchestrator_runs') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_orchestrator_runs' AND column_name = 'planning_model'
    ) THEN
      ALTER TABLE agent_orchestrator_runs ALTER COLUMN planning_model SET DEFAULT 'claude-opus-4-8';
    END IF;
  END IF;

  -- Compliance policy: per-module enforced model. An enforcement of "use Opus"
  -- should track to the newest Opus tier.
  IF to_regclass('public.compliance_policy') IS NOT NULL THEN
    UPDATE compliance_policy SET enforce_model = 'claude-opus-4-8' WHERE enforce_model = 'claude-opus-4-7';
  END IF;

  -- Specialized Agents default model.
  IF to_regclass('public.agent_profiles') IS NOT NULL THEN
    UPDATE agent_profiles SET default_model = 'claude-opus-4-8' WHERE default_model = 'claude-opus-4-7';
  END IF;

  -- App Gateway default model (per-organization PWA setting).
  IF to_regclass('public.app_gateway_settings') IS NOT NULL THEN
    UPDATE app_gateway_settings SET default_model = 'claude-opus-4-8' WHERE default_model = 'claude-opus-4-7';
  END IF;

  -- ── Whitelist EXPANSION (add 4.8 alongside 4.7, never remove) ──

  -- model_allowed table: wherever 4.7 is permitted, also permit 4.8 so the new
  -- default is not blocked under model enforcement. NOT EXISTS keeps it idempotent
  -- and correct for NULL (global) user_id rows.
  IF to_regclass('public.model_allowed') IS NOT NULL THEN
    INSERT INTO model_allowed (user_id, model_id, created_by)
    SELECT DISTINCT m.user_id, 'claude-opus-4-8', m.created_by
    FROM model_allowed m
    WHERE m.model_id = 'claude-opus-4-7'
      AND NOT EXISTS (
        SELECT 1 FROM model_allowed e
        WHERE e.model_id = 'claude-opus-4-8'
          AND (e.user_id = m.user_id OR (e.user_id IS NULL AND m.user_id IS NULL))
      );
  END IF;

  -- compliance_rules MODEL_WHITELIST_001 rule_logic JSON: inject 4.8 into any
  -- allowed-values list that currently contains 4.7 but not yet 4.8.
  IF to_regclass('public.compliance_rules') IS NOT NULL THEN
    UPDATE compliance_rules
    SET rule_logic = REPLACE(rule_logic, '"claude-opus-4-7"', '"claude-opus-4-8","claude-opus-4-7"')
    WHERE rule_logic LIKE '%"claude-opus-4-7"%'
      AND rule_logic NOT LIKE '%"claude-opus-4-8"%';
  END IF;
END
$$;
