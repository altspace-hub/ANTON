-- Migration 120: ANTON Missions — Phase 5 Network (AAP-based delegation)
--
-- Adds cross-instance mission delegation:
--   • mission_delegations  — outbound + inbound records (one row per delegation)
--   • mission_delegation_log — append-only audit of state transitions
--
-- Outbound flow:  local mission task → delegate to peer ANTON via signed AAP
--                 message → peer creates sub-mission → peer returns result
-- Inbound flow:   peer ANTON sends signed delegation → we record it →
--                 user accepts + we create a local sub-mission → on completion
--                 we sign and return the result
--
-- The actual transport is the existing community_message_queue (P2P HTTP +
-- relay fallback). Delegations carry an Ed25519 signature so the recipient
-- can verify the originator's identity before accepting work.

CREATE TABLE IF NOT EXISTS missions.mission_delegations (
  id                          TEXT PRIMARY KEY,                  -- UUID — global so it can cross instances
  direction                   TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),

  -- Local linkage (the mission and task that originated or accepted the delegation)
  mission_id                  TEXT REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  sub_mission_id              TEXT REFERENCES missions.missions(id) ON DELETE SET NULL,

  -- Peer identity (Ed25519 contact_hash on both sides)
  peer_contact_hash           TEXT NOT NULL,
  peer_display_name           TEXT,
  peer_endpoint               TEXT,                              -- snapshot at time of send

  -- Briefing — what the peer is asked to do
  brief_title                 TEXT NOT NULL,
  brief_objective             TEXT NOT NULL,
  brief_context               JSONB NOT NULL DEFAULT '{}',
  required_modules            JSONB NOT NULL DEFAULT '[]',
  expected_output             TEXT,
  deadline                    TIMESTAMPTZ,
  payment_amount_ftc          NUMERIC(12,2),                     -- optional — links to mission_payments

  -- Status machine
  status                      TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',                -- outbound, not yet sent
      'sent',                 -- outbound, sent over AAP
      'received',             -- inbound, awaiting accept/decline
      'accepted',             -- accepted by the recipient
      'declined',             -- declined by the recipient
      'in_progress',          -- recipient is working on it
      'completed',            -- recipient submitted result; awaits originator review
      'approved',             -- originator approved the result
      'rejected',             -- originator rejected the result
      'cancelled',            -- originator cancelled before completion
      'failed'                -- delivery / signature / system failure
    )),

  -- Signed payload (Ed25519) and verification result on the receiving side
  signed_payload              JSONB,                             -- { payload_json, signature_b64, signer_contact_hash, sig_alg }
  signature_verified          BOOLEAN,                           -- NULL until verified; TRUE/FALSE after
  signature_verified_at       TIMESTAMPTZ,

  -- Result back from the recipient
  result_payload              JSONB,
  result_files                JSONB DEFAULT '[]',
  result_signed_payload       JSONB,                             -- recipient signs the result
  result_signature_verified   BOOLEAN,
  rejection_reason            TEXT,

  -- AAP transport linkage (for tracing)
  outbound_mail_id            TEXT,
  outbound_queue_id           TEXT,
  inbound_mail_id             TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at                     TIMESTAMPTZ,
  accepted_at                 TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ,
  closed_at                   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mission_delegations_mission ON missions.mission_delegations(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_mission_delegations_peer    ON missions.mission_delegations(peer_contact_hash, status);
CREATE INDEX IF NOT EXISTS idx_mission_delegations_active  ON missions.mission_delegations(status, updated_at)
  WHERE status IN ('sent', 'received', 'accepted', 'in_progress');

-- ── Append-only audit trail ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS missions.mission_delegation_log (
  id              BIGSERIAL PRIMARY KEY,
  delegation_id   TEXT NOT NULL REFERENCES missions.mission_delegations(id) ON DELETE CASCADE,
  event           TEXT NOT NULL
    CHECK (event IN (
      'created', 'sent', 'received', 'accepted', 'declined',
      'started', 'completed', 'approved', 'rejected', 'cancelled',
      'signature_verified', 'signature_failed', 'transport_failed', 'failed'
    )),
  actor           TEXT,                                          -- contact_hash or 'system'
  details         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_delegation_log_delegation ON missions.mission_delegation_log(delegation_id, created_at);

-- ── origin_delegation_id on missions ─────────────────────────────────────
-- When we accept an inbound delegation we create a sub-mission. The
-- sub-mission keeps a back-reference so the originator's identity and brief
-- can be reconstructed from the delegation row.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'missions' AND table_name = 'missions' AND column_name = 'origin_delegation_id'
  ) THEN
    ALTER TABLE missions.missions
      ADD COLUMN origin_delegation_id TEXT;        -- soft FK to missions.mission_delegations(id)
    CREATE INDEX IF NOT EXISTS idx_missions_origin_delegation ON missions.missions(origin_delegation_id)
      WHERE origin_delegation_id IS NOT NULL;
  END IF;
END
$$;

-- (No mission_type column exists in 115; inbound delegation provenance is
-- tracked by origin_delegation_id alone — no CHECK constraint needed.)
