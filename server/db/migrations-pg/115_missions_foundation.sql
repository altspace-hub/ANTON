-- Migration 115: ANTON Missions — Foundation (Phase 1)
--
-- Creates the `missions` schema and the 6 core tables, plus the
-- mission_type_autonomy pair for earned-autonomy tracking. Adds
-- mission_id + mission_scope tagging columns to public.knowledge_atoms.
--
-- Decisions (per ANTON_MISSIONS_SPEC_v2.md):
--   • PostgreSQL only — no SQLite syntax anywhere
--   • All Mission tables live in a dedicated `missions` schema
--   • Cross-schema FKs to public.users for created_by
--   • PG-native types throughout: BIGSERIAL, JSONB, TIMESTAMPTZ,
--     BOOLEAN DEFAULT FALSE, NUMERIC for scores
--   • Idempotent: safe to re-run (CREATE … IF NOT EXISTS, conditional
--     ALTER via DO block)
--
-- This migration is the FIRST in the codebase to use schema separation.
-- All `missions.*` tables MUST be referenced with the schema prefix in
-- application code; do not rely on search_path.

-- ── Schema bootstrap ─────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS missions;

-- ── Tag public.knowledge_atoms with mission scope (idempotent) ──────────
-- Atoms produced by missions stay in public.knowledge_atoms so the
-- intelligence funnel and cross-session queries continue to work. The
-- new columns identify which atoms came from which mission.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_atoms' AND column_name = 'mission_id'
  ) THEN
    ALTER TABLE public.knowledge_atoms ADD COLUMN mission_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_atoms' AND column_name = 'mission_scope'
  ) THEN
    ALTER TABLE public.knowledge_atoms ADD COLUMN mission_scope TEXT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_mission ON public.knowledge_atoms(mission_id);

-- ── missions.mission_templates ──────────────────────────────────────────
-- Created first because missions.missions has an FK to it.

CREATE TABLE IF NOT EXISTS missions.mission_templates (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  description                 TEXT,
  pillar                      TEXT NOT NULL CHECK (pillar IN ('work', 'life', 'school')),
  category                    TEXT,
  version                     TEXT NOT NULL DEFAULT '1.0.0',
  author                      TEXT,

  -- Template content (JSONB)
  parameters_schema           JSONB NOT NULL DEFAULT '[]',
  task_graph_template         JSONB NOT NULL DEFAULT '{}',
  default_data_scope          JSONB NOT NULL DEFAULT '{}',
  default_budget              JSONB NOT NULL DEFAULT '{}',
  default_autonomy_level      TEXT NOT NULL DEFAULT 'check_in'
    CHECK (default_autonomy_level IN ('check_in', 'briefing', 'full_autonomy')),
  success_criteria_template   TEXT,
  required_modules            JSONB NOT NULL DEFAULT '[]',

  -- Metrics (populated as missions complete)
  times_used                  INTEGER NOT NULL DEFAULT 0,
  avg_completion_time_seconds INTEGER,
  avg_quality_score           NUMERIC(4,3),
  avg_token_consumption       BIGINT,

  -- Metadata
  is_builtin                  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_templates_active ON missions.mission_templates(is_active, pillar, category);

-- ── missions.missions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS missions.missions (
  id                          TEXT PRIMARY KEY,
  title                       TEXT NOT NULL,
  objective                   TEXT NOT NULL,
  context                     TEXT,
  success_criteria            TEXT NOT NULL,
  autonomy_level              TEXT NOT NULL DEFAULT 'check_in'
    CHECK (autonomy_level IN ('check_in', 'briefing', 'full_autonomy')),
  status                      TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'briefed', 'active', 'paused', 'review', 'completed', 'aborted')),
  priority                    TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  -- Budget
  token_budget_max            BIGINT NOT NULL DEFAULT 5000000,
  token_budget_consumed       BIGINT NOT NULL DEFAULT 0,
  time_budget_max_seconds     INTEGER NOT NULL DEFAULT 604800,    -- 7 days
  time_active_max_seconds     INTEGER NOT NULL DEFAULT 86400,     -- 24 h active
  time_active_consumed_seconds INTEGER NOT NULL DEFAULT 0,
  financial_budget_max        NUMERIC(12,2) NOT NULL DEFAULT 0,
  financial_budget_consumed   NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Configuration (JSONB)
  data_scope                  JSONB NOT NULL DEFAULT '{}',
  notification_preferences    JSONB NOT NULL DEFAULT '{}',
  model_strategy              JSONB NOT NULL DEFAULT
    '{"planning_model":"auto","execution_model":"auto","utility_model":"auto","provider_preference":"any","fallback_enabled":true,"cost_optimise":false}',

  -- Metadata
  template_id                 TEXT REFERENCES missions.mission_templates(id) ON DELETE SET NULL,
  created_by                  TEXT NOT NULL REFERENCES public.users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at                  TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ,
  deadline                    TIMESTAMPTZ,

  -- Compressed context for fast wake-up
  mission_summary             TEXT,
  mission_summary_updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_missions_status     ON missions.missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_created_by ON missions.missions(created_by);
CREATE INDEX IF NOT EXISTS idx_missions_template   ON missions.missions(template_id);
CREATE INDEX IF NOT EXISTS idx_missions_created_at ON missions.missions(created_at DESC);

-- ── missions.mission_tasks ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS missions.mission_tasks (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  parent_task_id              TEXT,                                -- self-FK added below
  title                       TEXT NOT NULL,
  description                 TEXT,
  task_type                   TEXT NOT NULL
    CHECK (task_type IN ('llm', 'research', 'analysis', 'export', 'review', 'notification',
                          'checkpoint', 'conditional', 'parallel_group', 'browser', 'api_call', 'database_query')),
  status                      TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'active', 'completed', 'failed', 'skipped', 'blocked', 'paused')),
  priority                    INTEGER NOT NULL DEFAULT 0,

  -- Module mapping
  module_id                   TEXT,
  area_id                     TEXT,
  module_config               JSONB NOT NULL DEFAULT '{}',

  -- Model used (recorded at execution time)
  provider                    TEXT,
  model                       TEXT,
  model_tier                  TEXT,                                -- planning/execution/utility

  -- Effort + execution
  estimated_tokens            INTEGER,
  actual_tokens_consumed      INTEGER NOT NULL DEFAULT 0,
  estimated_duration_seconds  INTEGER,
  actual_duration_seconds     INTEGER,

  -- Results
  output_summary              TEXT,
  output_full                 TEXT,
  quality_score               NUMERIC(4,3),
  confidence_score            NUMERIC(4,3),
  atoms_produced              INTEGER NOT NULL DEFAULT 0,

  -- Error handling
  retry_count                 INTEGER NOT NULL DEFAULT 0,
  max_retries                 INTEGER NOT NULL DEFAULT 3,
  last_error                  TEXT,

  -- Ordering
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at                  TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ
);

-- Self-FK for parent_task_id (added separately so it works on first creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_mission_tasks_parent'
  ) THEN
    ALTER TABLE missions.mission_tasks
      ADD CONSTRAINT fk_mission_tasks_parent
      FOREIGN KEY (parent_task_id) REFERENCES missions.mission_tasks(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_mission_tasks_mission ON missions.mission_tasks(mission_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_status  ON missions.mission_tasks(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_mission_tasks_parent  ON missions.mission_tasks(parent_task_id);

-- ── missions.mission_task_dependencies (DAG edges) ──────────────────────

CREATE TABLE IF NOT EXISTS missions.mission_task_dependencies (
  id                          BIGSERIAL PRIMARY KEY,
  task_id                     TEXT NOT NULL REFERENCES missions.mission_tasks(id) ON DELETE CASCADE,
  depends_on_task_id          TEXT NOT NULL REFERENCES missions.mission_tasks(id) ON DELETE CASCADE,
  dependency_type             TEXT NOT NULL DEFAULT 'blocking'
    CHECK (dependency_type IN ('blocking', 'informational')),
  UNIQUE (task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_task_deps_task    ON missions.mission_task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_mission_task_deps_depends ON missions.mission_task_dependencies(depends_on_task_id);

-- ── missions.mission_activity (audit trail) ─────────────────────────────
-- Phase 2 will partition this by month. For Phase 1 a single table is fine.

CREATE TABLE IF NOT EXISTS missions.mission_activity (
  id                          BIGSERIAL PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activity_type               TEXT NOT NULL,
  description                 TEXT,
  details                     JSONB NOT NULL DEFAULT '{}',
  tokens_consumed             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mission_activity_mission ON missions.mission_activity(mission_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_mission_activity_type    ON missions.mission_activity(mission_id, activity_type);

-- ── missions.mission_decisions (autonomous-decision audit) ──────────────

CREATE TABLE IF NOT EXISTS missions.mission_decisions (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision_type               TEXT NOT NULL
    CHECK (decision_type IN ('approach_selection', 'module_selection', 'data_source_selection',
                              'quality_tradeoff', 'priority_adjustment', 'scope_adjustment',
                              'escalation_decision', 'self_correction', 'task_spawn', 'plan_decomposition')),
  description                 TEXT NOT NULL,
  options_considered          JSONB NOT NULL DEFAULT '[]',
  selected_option             TEXT NOT NULL,
  confidence                  NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  reasoning                   TEXT,
  overridden_by_human         BOOLEAN NOT NULL DEFAULT FALSE,
  override_reasoning          TEXT,
  compliance_check_passed     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mission_decisions_mission ON missions.mission_decisions(mission_id, timestamp DESC);

-- ── missions.mission_type_autonomy (earned per-template autonomy) ───────

CREATE TABLE IF NOT EXISTS missions.mission_type_autonomy (
  id                          BIGSERIAL PRIMARY KEY,
  template_id                 TEXT REFERENCES missions.mission_templates(id) ON DELETE CASCADE,
  mission_category            TEXT,
  current_level               TEXT NOT NULL DEFAULT 'check_in'
    CHECK (current_level IN ('check_in', 'briefing', 'full_autonomy')),
  total_completions           INTEGER NOT NULL DEFAULT 0,
  successful_completions      INTEGER NOT NULL DEFAULT 0,
  override_rate               NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  avg_quality_score           NUMERIC(4,3),
  last_promotion_at           TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_type_autonomy_template ON missions.mission_type_autonomy(template_id);

CREATE TABLE IF NOT EXISTS missions.mission_type_autonomy_history (
  id                          BIGSERIAL PRIMARY KEY,
  autonomy_id                 BIGINT NOT NULL REFERENCES missions.mission_type_autonomy(id) ON DELETE CASCADE,
  previous_level              TEXT NOT NULL,
  new_level                   TEXT NOT NULL,
  reason                      TEXT,
  metrics_snapshot            JSONB NOT NULL DEFAULT '{}',
  timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
