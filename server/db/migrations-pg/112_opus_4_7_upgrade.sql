-- Migration 112: Upgrade Opus 4.6 → Opus 4.7
--
-- Renames the Anthropic Opus model ID from `claude-opus-4-6` to `claude-opus-4-7`
-- in every table that stores it as a value. Existing rows would otherwise reference
-- a model ID that no longer exists in the model registry, causing API calls and
-- cost lookups to fail.
--
-- Idempotent: re-running this migration is a no-op once all rows have been updated.
-- Safe on tables that don't exist (DO blocks with to_regclass checks).

DO $$
BEGIN
  -- ── Live configuration tables ─────────────────────────────────

  -- Orchestrator: briefing/planning model selections
  IF to_regclass('public.agent_orchestrator_runs') IS NOT NULL THEN
    UPDATE agent_orchestrator_runs SET briefing_model = 'claude-opus-4-7' WHERE briefing_model = 'claude-opus-4-6';
    UPDATE agent_orchestrator_runs SET planning_model = 'claude-opus-4-7' WHERE planning_model = 'claude-opus-4-6';
  END IF;

  -- Compliance policy: per-module enforced model
  IF to_regclass('public.compliance_policy') IS NOT NULL THEN
    UPDATE compliance_policy SET enforce_model = 'claude-opus-4-7' WHERE enforce_model = 'claude-opus-4-6';
  END IF;

  -- Approved-model whitelist
  IF to_regclass('public.model_allowed') IS NOT NULL THEN
    UPDATE model_allowed SET model_id = 'claude-opus-4-7' WHERE model_id = 'claude-opus-4-6';
  END IF;

  -- Specialized Agents default model
  IF to_regclass('public.agent_profiles') IS NOT NULL THEN
    UPDATE agent_profiles SET default_model = 'claude-opus-4-7' WHERE default_model = 'claude-opus-4-6';
  END IF;

  -- App Gateway default model (per-organization PWA setting)
  IF to_regclass('public.app_gateway_settings') IS NOT NULL THEN
    UPDATE app_gateway_settings SET default_model = 'claude-opus-4-7' WHERE default_model = 'claude-opus-4-6';
  END IF;

  -- ── Historical / audit tables ─────────────────────────────────
  -- These are not strictly required for runtime, but keeping them consistent
  -- means cost lookups and dashboards stay correct for past activity.

  IF to_regclass('public.messages') IS NOT NULL THEN
    UPDATE messages SET model_id = 'claude-opus-4-7' WHERE model_id = 'claude-opus-4-6';
  END IF;

  IF to_regclass('public.session_snapshots') IS NOT NULL THEN
    UPDATE session_snapshots SET model_id = 'claude-opus-4-7' WHERE model_id = 'claude-opus-4-6';
  END IF;

  IF to_regclass('public.audit_log') IS NOT NULL THEN
    UPDATE audit_log SET model = 'claude-opus-4-7' WHERE model = 'claude-opus-4-6';
  END IF;

  IF to_regclass('public.pathfinder_sources') IS NOT NULL THEN
    UPDATE pathfinder_sources SET model_id = 'claude-opus-4-7' WHERE model_id = 'claude-opus-4-6';
  END IF;

  IF to_regclass('public.compaction_events') IS NOT NULL THEN
    UPDATE compaction_events SET model_id = 'claude-opus-4-7' WHERE model_id = 'claude-opus-4-6';
  END IF;

  -- ── User profile preferences (JSON column) ────────────────────
  -- user_profiles.preferences is JSON text; only rewrite when the old value is present.

  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    UPDATE user_profiles
    SET preferences = REPLACE(preferences, 'claude-opus-4-6', 'claude-opus-4-7')
    WHERE preferences LIKE '%claude-opus-4-6%';
  END IF;

  -- ── Compliance rule (model whitelist) ─────────────────────────
  -- The MODEL_WHITELIST_001 rule's rule_logic JSON contains the allowed model list.

  IF to_regclass('public.compliance_rules') IS NOT NULL THEN
    UPDATE compliance_rules
    SET rule_logic = REPLACE(rule_logic, 'claude-opus-4-6', 'claude-opus-4-7')
    WHERE rule_logic LIKE '%claude-opus-4-6%';
  END IF;
END
$$;
