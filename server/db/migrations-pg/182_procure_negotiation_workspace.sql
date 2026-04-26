-- 182_procure_negotiation_workspace.sql — back-and-forth negotiation
-- workspace + objection register for the Procure pillar.
--
-- The select / contract phases of a procurement cycle (mig 091) treat
-- the vendor as a static target, but real negotiations are iterative:
-- the buyer raises objections, the vendor counters, the buyer revises,
-- repeat. This migration adds the storage to capture that interaction
-- so the buyer doesn't lose the thread across weeks.

CREATE TABLE IF NOT EXISTS procure_negotiation_threads (
  id                  TEXT PRIMARY KEY,
  cycle_id            TEXT NOT NULL,
  vendor_id           TEXT NOT NULL,
  thread_label        TEXT NOT NULL,            -- 'pricing' / 'data_processing_addendum' / 'sla' / 'liability_cap' / 'auto_renewal_clause' / 'other'
  status              TEXT NOT NULL DEFAULT 'open',  -- 'open' / 'awaiting_vendor' / 'awaiting_buyer' / 'agreed' / 'parked' / 'closed'
  opened_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  opened_by           TEXT,
  closed_at           TIMESTAMP,
  resolution          TEXT,                     -- 'accepted_vendor' / 'accepted_buyer' / 'compromise' / 'walk_away'
  buyer_target        TEXT,                     -- the buyer's desired outcome
  walk_away_position  TEXT,                     -- the buyer's BATNA — what triggers walking away
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS procure_negotiation_threads_cycle_idx
  ON procure_negotiation_threads(cycle_id, vendor_id);

CREATE INDEX IF NOT EXISTS procure_negotiation_threads_open_idx
  ON procure_negotiation_threads(status, opened_at DESC) WHERE status NOT IN ('agreed', 'closed');

-- Each turn in a negotiation thread.
CREATE TABLE IF NOT EXISTS procure_negotiation_turns (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT NOT NULL,
  turn_number     INTEGER NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buyer', 'vendor')),
  recorded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  recorded_by     TEXT,
  channel         TEXT,                     -- 'email' / 'meeting' / 'document_redline' / 'call' / 'message'
  proposal_md     TEXT NOT NULL,            -- the proposal in markdown form
  rationale_md    TEXT,                     -- why this side is asking for it
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS procure_negotiation_turns_thread_idx
  ON procure_negotiation_turns(thread_id, turn_number);

-- Objection register: the buyer's standing objections to a vendor's
-- terms, surfaced in one place so they don't get lost across cycles.
-- Useful for repeat business with the same vendor.

CREATE TABLE IF NOT EXISTS procure_objections (
  id              TEXT PRIMARY KEY,
  vendor_id       TEXT NOT NULL,
  objection_kind  TEXT NOT NULL,            -- 'pricing' / 'liability' / 'data' / 'auto_renewal' / 'jurisdiction' / 'sla' / 'other'
  objection_text  TEXT NOT NULL,
  raised_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  raised_by       TEXT,
  status          TEXT NOT NULL DEFAULT 'open',   -- 'open' / 'resolved' / 'parked' / 'cannot_resolve'
  resolution_md   TEXT,
  resolved_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS procure_objections_vendor_idx
  ON procure_objections(vendor_id, status);
