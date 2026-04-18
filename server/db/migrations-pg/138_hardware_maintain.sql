-- ──────────────────────────────────────────────────────────────────────────────
-- 138_hardware_maintain.sql — Maintain path schema (Phase 6).
--
-- Four tables, all foreign-keyed to hardware_projects from migration 136:
--
--   hw_patch_plans           — top-level patch ("we are about to change X")
--   hw_patch_stages          — sequenced stages with quantitative acceptance
--   hw_fleet_devices         — lightweight device registry per project
--   hw_patch_rollouts        — per-device per-stage rollout state
--
-- The hw_* prefix avoids colliding with any future engagement / atlas patch
-- concepts. Same naming convention as Phase 4's hw_quality_*.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Patch plans ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hw_patch_plans (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id               TEXT NOT NULL REFERENCES hardware_projects(id) ON DELETE CASCADE,
  title                    TEXT NOT NULL,
  description              TEXT,
  change_kind              TEXT NOT NULL CHECK (change_kind IN
                             ('firmware-update', 'config-change', 'calibration',
                              'partition-table', 'secure-boot-burn', 'recall')),
  source_event_id          TEXT REFERENCES lifecycle_events(event_id) ON DELETE SET NULL,
  -- Rollback artefact is mandatory before stages can advance — enforced at
  -- the service layer (locked invariant per spec §13).
  rollback_artefact_ref    TEXT,
  rollback_artefact_hash   TEXT,
  -- Tier 3 connected-device patches require these to be true before any
  -- stage runs (enforced at the service layer).
  signed_image             BOOLEAN NOT NULL DEFAULT FALSE,
  verified_boot            BOOLEAN NOT NULL DEFAULT FALSE,
  rollback_protected       BOOLEAN NOT NULL DEFAULT FALSE,
  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'ready', 'in_progress', 'paused', 'rolled_back', 'complete', 'cancelled')),
  audit_trail              JSONB NOT NULL DEFAULT '[]',     -- structured rationale entries
  created_by               TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hw_patch_plans_project ON hw_patch_plans(project_id);
CREATE INDEX IF NOT EXISTS ix_hw_patch_plans_status  ON hw_patch_plans(status);
CREATE INDEX IF NOT EXISTS ix_hw_patch_plans_event   ON hw_patch_plans(source_event_id);

-- ── Patch stages (sequenced, with quantitative acceptance) ──────────────────

CREATE TABLE IF NOT EXISTS hw_patch_stages (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  plan_id             TEXT NOT NULL REFERENCES hw_patch_plans(id) ON DELETE CASCADE,
  stage_index         INTEGER NOT NULL,
  stage_kind          TEXT NOT NULL CHECK (stage_kind IN
                        ('canary', 'wave', 'full-rollout', 'verification', 'soak')),
  title               TEXT NOT NULL,
  description         TEXT,
  -- Cohort: list of device_ids this stage targets, OR a wave-percentage rule.
  -- For canary: usually 1-5 devices.
  -- For wave: percentage e.g. {"percentage": 25}.
  -- For full-rollout: {"all": true}.
  cohort              JSONB NOT NULL DEFAULT '{}',
  acceptance_rules    JSONB NOT NULL DEFAULT '[]',         -- array of {metric, operator, threshold, observed_via}
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'soaking', 'passed', 'failed', 'rolled_back', 'skipped')),
  rollback_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  acceptance_results  JSONB NOT NULL DEFAULT '[]',         -- array of {metric, observed, pass}
  notes               TEXT,
  UNIQUE (plan_id, stage_index)
);

CREATE INDEX IF NOT EXISTS ix_hw_patch_stages_plan   ON hw_patch_stages(plan_id, stage_index);
CREATE INDEX IF NOT EXISTS ix_hw_patch_stages_status ON hw_patch_stages(status);

-- ── Fleet devices (lightweight registry per project) ────────────────────────

CREATE TABLE IF NOT EXISTS hw_fleet_devices (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id         TEXT NOT NULL REFERENCES hardware_projects(id) ON DELETE CASCADE,
  device_label       TEXT NOT NULL,                       -- human label, e.g. 'gateway-lagos-01'
  hardware_serial    TEXT,                                 -- chip id / mac if known
  region             TEXT,                                 -- ISO or named, may differ from project region for distributed fleets
  current_firmware   TEXT,                                 -- version string
  last_seen_at       TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'paused', 'decommissioned', 'lost')),
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, device_label)
);

CREATE INDEX IF NOT EXISTS ix_hw_fleet_project ON hw_fleet_devices(project_id);
CREATE INDEX IF NOT EXISTS ix_hw_fleet_region  ON hw_fleet_devices(region);

-- ── Patch rollouts (per-device per-stage state) ─────────────────────────────

CREATE TABLE IF NOT EXISTS hw_patch_rollouts (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  plan_id            TEXT NOT NULL REFERENCES hw_patch_plans(id) ON DELETE CASCADE,
  stage_id           TEXT NOT NULL REFERENCES hw_patch_stages(id) ON DELETE CASCADE,
  device_id          TEXT NOT NULL REFERENCES hw_fleet_devices(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'queued', 'sent', 'applying', 'verified', 'failed', 'rolled_back', 'skipped')),
  rollout_started    TIMESTAMPTZ,
  rollout_completed  TIMESTAMPTZ,
  pre_patch_state    JSONB,                                -- snapshot to validate against post-patch
  post_patch_state   JSONB,
  failure_reason     TEXT,
  delivery_channel   TEXT CHECK (delivery_channel IN ('ota', 'usb', 'aap-store-and-forward', 'manual')),
  notes              TEXT,
  UNIQUE (stage_id, device_id)
);

CREATE INDEX IF NOT EXISTS ix_hw_rollouts_plan   ON hw_patch_rollouts(plan_id);
CREATE INDEX IF NOT EXISTS ix_hw_rollouts_stage  ON hw_patch_rollouts(stage_id);
CREATE INDEX IF NOT EXISTS ix_hw_rollouts_device ON hw_patch_rollouts(device_id);
CREATE INDEX IF NOT EXISTS ix_hw_rollouts_status ON hw_patch_rollouts(status);
