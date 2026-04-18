-- ──────────────────────────────────────────────────────────────────────────────
-- 136_hardware_projects.sql — Hardware project lifecycle + quality pipeline.
--
-- Five tables, all designed so real PlatformIO / Clang-tidy / Wokwi outputs
-- slot in via the same row shape as the Phase 4 mock adapters.
--
--   hardware_projects             — top-level project + Phase 0 classification record
--   hardware_project_phases       — the 6 develop-path phases (or 5/6 for diagnose/maintain)
--   hw_quality_runs         — one run per "let's see if firmware is ready" press
--   hw_quality_results      — one row per gate (platformio / clang-tidy / sbom / cve / sim / scorecard)
--   hw_quality_scores                — final aggregated score per run (mandatory-gate enforced)
--
-- Owner-bound mutations enforced at the service layer (matching atlas pattern).
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Hardware projects ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hardware_projects (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  owner_id                 TEXT NOT NULL,
  title                    TEXT NOT NULL,
  description              TEXT,

  -- Phase 0 classification record (non-skippable per spec §13)
  family_id                TEXT NOT NULL,                  -- 'esp32', 'arduino', etc.
  path                     TEXT NOT NULL CHECK (path IN ('diagnose', 'maintain', 'develop')),
  tier                     INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
  region                   TEXT,                           -- ISO region or named
  working_language         TEXT NOT NULL DEFAULT 'en',     -- ISO 639-1
  offline_first            BOOLEAN NOT NULL DEFAULT TRUE,
  safety_critical          BOOLEAN NOT NULL DEFAULT FALSE,
  medical_adjacent         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Tier 1 acknowledgements (allow skipping secure-update chain only when explicit)
  tier1_secure_update_ack  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Linked HKP for prompt-builder Layer 6 (NULL until first build phase populates it)
  hkp_id                   TEXT REFERENCES hardware_knowledge_packs(id) ON DELETE SET NULL,

  -- Project state
  status                   TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paused', 'archived', 'shipped')),
  current_phase_id         TEXT,                           -- soft FK to hardware_project_phases.id

  metadata                 JSONB NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hw_projects_owner       ON hardware_projects(owner_id);
CREATE INDEX IF NOT EXISTS ix_hw_projects_family_path ON hardware_projects(family_id, path);
CREATE INDEX IF NOT EXISTS ix_hw_projects_tier        ON hardware_projects(tier);

-- ── Hardware project phases ──────────────────────────────────────────────────
-- For develop path: 6 phases (requirements / architecture / schematic / firmware /
-- assembly+tests / deploy+operate).
-- For diagnose: 5 phases.
-- For maintain: 6 phases.
-- The phase_key is the canonical identifier within a path; phase_index drives ordering.

CREATE TABLE IF NOT EXISTS hardware_project_phases (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id      TEXT NOT NULL REFERENCES hardware_projects(id) ON DELETE CASCADE,
  phase_key       TEXT NOT NULL,                          -- 'requirements', 'architecture', etc.
  phase_index     INTEGER NOT NULL,                       -- 0-based ordering within the path
  display_label   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'blocked', 'complete', 'skipped')),
  artefact_ref    TEXT,                                    -- pointer to the produced artefact (Reasoning Trail id, file path, etc.)
  blocking_reason TEXT,                                    -- when status='blocked'
  data            JSONB NOT NULL DEFAULT '{}',             -- phase-specific record (requirements doc, architecture doc, etc.)
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, phase_key)
);

CREATE INDEX IF NOT EXISTS ix_hw_phases_project ON hardware_project_phases(project_id, phase_index);
CREATE INDEX IF NOT EXISTS ix_hw_phases_status  ON hardware_project_phases(status);

-- ── Quality pipeline runs ────────────────────────────────────────────────────
-- One row per "is the firmware ready to ship?" check. A run is composed of
-- N adapter results (typically 6 for the full ESP32 develop pipeline).

CREATE TABLE IF NOT EXISTS hw_quality_runs (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id              TEXT NOT NULL REFERENCES hardware_projects(id) ON DELETE CASCADE,
  phase_id                TEXT REFERENCES hardware_project_phases(id) ON DELETE SET NULL,
  triggered_by            TEXT,                            -- user id or 'auto'
  trigger_reason          TEXT,                            -- 'manual', 'phase-advance', 'pre-ship', etc.
  artefact_ref            TEXT,                            -- firmware build artefact (path, hash, or build id)
  artefact_hash           TEXT,                            -- sha256 of the firmware binary if available
  status                  TEXT NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'complete', 'failed', 'cancelled')),
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_hw_quality_runs_project ON hw_quality_runs(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_hw_quality_runs_status  ON hw_quality_runs(status);

-- ── Quality pipeline results (per adapter / gate) ────────────────────────────
-- gate_key vocabulary (extensible — Phase 4 ships 6 mock adapters):
--   platformio-build, clang-tidy, cyclonedx-sbom, cve-scan, wokwi-sim, security-scorecard

CREATE TABLE IF NOT EXISTS hw_quality_results (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  run_id          TEXT NOT NULL REFERENCES hw_quality_runs(id) ON DELETE CASCADE,
  gate_key        TEXT NOT NULL,
  adapter_kind    TEXT NOT NULL CHECK (adapter_kind IN ('mock', 'real')),
  adapter_version TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('pass', 'warn', 'fail', 'skip', 'error')),
  score           NUMERIC(5, 2),                          -- 0-100 per-gate score (NULL for binary pass/fail)
  is_mandatory    BOOLEAN NOT NULL DEFAULT TRUE,
  duration_ms     INTEGER,
  summary         TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}',            -- adapter-specific structured output
  evidence_ref    TEXT,                                    -- link to detailed log / report artefact
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, gate_key)
);

CREATE INDEX IF NOT EXISTS ix_hw_quality_results_run     ON hw_quality_results(run_id);
CREATE INDEX IF NOT EXISTS ix_hw_quality_results_outcome ON hw_quality_results(outcome);

-- ── Aggregated quality scores ────────────────────────────────────────────────
-- One row per run, computed deterministically from the gate results.
-- ship_verdict is the load-bearing field — `block` means the firmware MUST NOT
-- ship, regardless of overall score.

CREATE TABLE IF NOT EXISTS hw_quality_scores (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  run_id                TEXT NOT NULL UNIQUE REFERENCES hw_quality_runs(id) ON DELETE CASCADE,
  project_id            TEXT NOT NULL REFERENCES hardware_projects(id) ON DELETE CASCADE,
  overall_score         NUMERIC(5, 2) NOT NULL,           -- 0-100 weighted average across non-skipped gates
  ship_verdict          TEXT NOT NULL CHECK (ship_verdict IN ('green', 'amber', 'block')),
  mandatory_gates_total INTEGER NOT NULL,
  mandatory_gates_pass  INTEGER NOT NULL,
  warnings_count        INTEGER NOT NULL DEFAULT 0,
  failures_count        INTEGER NOT NULL DEFAULT 0,
  reasoning             JSONB NOT NULL,                    -- structured rationale for the verdict
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hw_quality_scores_project ON hw_quality_scores(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_hw_quality_scores_verdict ON hw_quality_scores(ship_verdict);
