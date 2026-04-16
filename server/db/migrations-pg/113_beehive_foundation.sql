-- Migration 113: Beehive Protocol Foundation
--
-- Multi-party reasoning sessions where N ANTONs deliberate together over an
-- extended period. Each ANTON brings its own knowledge atoms, context, and
-- perspective; the group produces collaborative output that no single ANTON
-- could produce alone.
--
-- v1 (this migration) provides the data model for local-only mode: a single
-- ANTON can create hives, simulate participants, run rounds, and produce
-- synthesis. Phase 4 will wire this into AAP for true multi-instance hives.
--
-- See BEEHIVE_PROTOCOL_SPEC.md sections 3 and 5 for the full data model.

-- ── Sessions ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beehive_sessions (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  question                 TEXT NOT NULL,
  description              TEXT,
  type                     TEXT NOT NULL
    CHECK (type IN ('deliberation', 'build', 'review', 'brainstorm')),
  status                   TEXT NOT NULL DEFAULT 'forming'
    CHECK (status IN ('forming', 'active', 'converging', 'concluded', 'archived')),
  governance               JSONB NOT NULL DEFAULT '{}',
  created_by               TEXT NOT NULL,
  max_participants         INTEGER NOT NULL DEFAULT 12,
  ttl_hours                INTEGER,
  current_round            INTEGER NOT NULL DEFAULT 0,
  consensus_temperature    NUMERIC(4,3) NOT NULL DEFAULT 0.0
    CHECK (consensus_temperature >= 0.0 AND consensus_temperature <= 1.0),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluded_at             TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beehive_sessions_status     ON beehive_sessions(status);
CREATE INDEX IF NOT EXISTS idx_beehive_sessions_created_by ON beehive_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_beehive_sessions_created_at ON beehive_sessions(created_at DESC);

-- ── Participants ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beehive_participants (
  id                       BIGSERIAL PRIMARY KEY,
  hive_id                  TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  anton_contact_hash       TEXT NOT NULL,
  display_name             TEXT NOT NULL,
  role                     TEXT NOT NULL
    CHECK (role IN ('queen', 'worker', 'scout', 'observer')),
  disclosure_policy        JSONB NOT NULL DEFAULT '{}',
  invitation_status        TEXT NOT NULL DEFAULT 'invited'
    CHECK (invitation_status IN ('invited', 'joined', 'declined', 'left')),
  status                   TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'idle', 'left')),
  contribution_count       INTEGER NOT NULL DEFAULT 0,
  invited_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at                TIMESTAMPTZ,
  last_active_at           TIMESTAMPTZ,
  UNIQUE (hive_id, anton_contact_hash)
);

CREATE INDEX IF NOT EXISTS idx_beehive_participants_hive    ON beehive_participants(hive_id);
CREATE INDEX IF NOT EXISTS idx_beehive_participants_contact ON beehive_participants(anton_contact_hash);

-- ── Rounds ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beehive_rounds (
  id                       BIGSERIAL PRIMARY KEY,
  hive_id                  TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  round_number             INTEGER NOT NULL,
  phase                    TEXT NOT NULL
    CHECK (phase IN ('opening', 'deliberation', 'convergence', 'dissent_capture')),
  summary                  TEXT,
  consensus_temperature    NUMERIC(4,3) DEFAULT 0.0
    CHECK (consensus_temperature IS NULL OR (consensus_temperature >= 0.0 AND consensus_temperature <= 1.0)),
  contribution_count       INTEGER NOT NULL DEFAULT 0,
  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                 TIMESTAMPTZ,
  UNIQUE (hive_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_beehive_rounds_hive ON beehive_rounds(hive_id, round_number);

-- ── Contributions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beehive_contributions (
  id                       TEXT PRIMARY KEY,
  hive_id                  TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  round                    INTEGER NOT NULL,
  contributor_hash         TEXT NOT NULL,
  type                     TEXT NOT NULL
    CHECK (type IN ('position', 'evidence', 'challenge', 'synthesis', 'question', 'revision', 'dissent', 'build', 'review_note')),
  content                  TEXT NOT NULL,
  supporting_atoms         JSONB DEFAULT '[]',
  references_contributions JSONB DEFAULT '[]',
  confidence               NUMERIC(4,3) NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  reasoning_trace          TEXT,
  signature                TEXT NOT NULL,
  sequence                 BIGINT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beehive_contributions_hive        ON beehive_contributions(hive_id, round);
CREATE INDEX IF NOT EXISTS idx_beehive_contributions_contributor ON beehive_contributions(contributor_hash);
CREATE INDEX IF NOT EXISTS idx_beehive_contributions_seq         ON beehive_contributions(hive_id, sequence);

-- ── Shared Atoms ──────────────────────────────────────────────────────────
-- Records every atom disclosed into a hive (with redaction state) so the
-- audit trail captures exactly what each ANTON shared, when, with whom.

CREATE TABLE IF NOT EXISTS beehive_shared_atoms (
  id                       BIGSERIAL PRIMARY KEY,
  hive_id                  TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  contribution_id          TEXT REFERENCES beehive_contributions(id) ON DELETE CASCADE,
  source_anton_hash        TEXT NOT NULL,
  original_atom_id         TEXT,
  atom_type                TEXT NOT NULL,
  content                  TEXT NOT NULL,
  confidence               NUMERIC(4,3),
  domain                   TEXT,
  redacted                 BOOLEAN NOT NULL DEFAULT FALSE,
  shared_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beehive_shared_atoms_hive   ON beehive_shared_atoms(hive_id);
CREATE INDEX IF NOT EXISTS idx_beehive_shared_atoms_source ON beehive_shared_atoms(source_anton_hash);

-- ── Outputs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beehive_outputs (
  id                       TEXT PRIMARY KEY,
  hive_id                  TEXT NOT NULL UNIQUE REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  output_type              TEXT NOT NULL
    CHECK (output_type IN ('synthesis_report', 'anton_bundle', 'artifact', 'raw_trail')),
  synthesis_text           TEXT,
  dissents                 JSONB DEFAULT '[]',
  reasoning_trail          JSONB DEFAULT '[]',
  convergence_path         JSONB DEFAULT '[]',
  participant_approvals    JSONB DEFAULT '{}',
  output_file_path         TEXT,
  quality_score            NUMERIC(4,3),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Human Injections (private — never broadcast) ──────────────────────────
-- Guidance the local human types to influence their own ANTON between rounds.
-- Stored locally only; never serialized into any AAP message.

CREATE TABLE IF NOT EXISTS beehive_human_injections (
  id                       BIGSERIAL PRIMARY KEY,
  hive_id                  TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  user_id                  TEXT NOT NULL,
  content                  TEXT NOT NULL,
  applied_to_round         INTEGER,
  injected_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beehive_human_injections_hive ON beehive_human_injections(hive_id);

-- ── Message Log (full AAP audit) ──────────────────────────────────────────
-- Every BEEHIVE-typed AAP message logged for audit. Phase 4 populates this
-- when actual multi-instance protocol traffic begins.

CREATE TABLE IF NOT EXISTS beehive_message_log (
  id                       BIGSERIAL PRIMARY KEY,
  hive_id                  TEXT NOT NULL REFERENCES beehive_sessions(id) ON DELETE CASCADE,
  message_type             TEXT NOT NULL,
  sender_hash              TEXT NOT NULL,
  payload                  JSONB NOT NULL DEFAULT '{}',
  signature                TEXT NOT NULL,
  sequence                 BIGINT NOT NULL,
  received_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beehive_message_log_hive ON beehive_message_log(hive_id, sequence);
