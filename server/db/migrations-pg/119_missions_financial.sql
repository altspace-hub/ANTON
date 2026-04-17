-- Migration 119: ANTON Missions — Phase 4 Financial (FutureChain wallet integration)
--
-- Adds:
--  • Mission-level financial settings (per-tx cap, approved categories, cancel window, wallet binding)
--  • mission_payments — proposal → approval → execution with cancel window
--  • mission_payment_log — every state transition for the audit trail
--
-- Note: column financial_budget_max + financial_budget_consumed already exist
-- on missions.missions (added in migration 115). This migration only extends.

-- ── Mission-level financial settings (idempotent ALTERs) ───────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'missions' AND table_name = 'missions' AND column_name = 'financial_max_per_transaction'
  ) THEN
    ALTER TABLE missions.missions
      ADD COLUMN financial_max_per_transaction NUMERIC(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN approved_spend_categories     JSONB        NOT NULL DEFAULT '[]',
      ADD COLUMN payment_approval_delay_seconds INTEGER     NOT NULL DEFAULT 900,
      ADD COLUMN payment_requires_human_approval BOOLEAN    NOT NULL DEFAULT TRUE,
      ADD COLUMN payment_wallet_id              TEXT;        -- references fc_wallets(id) — soft FK
    -- Soft FK only: fc_wallets lives in public schema and may be cleared/rotated
    -- independently of missions; we don't want CASCADE behaviour.
  END IF;
END
$$;

-- ── mission_payments — payment proposals with cancel window ────────────────

CREATE TABLE IF NOT EXISTS missions.mission_payments (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  wallet_id                   TEXT NOT NULL,                  -- soft FK to fc_wallets(id)
  recipient_address           TEXT NOT NULL,
  recipient_label             TEXT,                            -- friendly name (vendor, contact)
  amount_ftc                  NUMERIC(12,2) NOT NULL CHECK (amount_ftc > 0),
  category                    TEXT NOT NULL,                   -- must match an approved category or trigger approval
  purpose                     TEXT NOT NULL,                   -- human-readable reason
  status                      TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'cancelled', 'executing', 'executed', 'failed')),
  cancel_window_until         TIMESTAMPTZ NOT NULL,            -- approval cannot execute before this
  approved_by                 TEXT,                            -- user_id who approved (or 'auto' if auto-approved)
  approved_at                 TIMESTAMPTZ,
  cancelled_by                TEXT,                            -- user_id who cancelled
  cancelled_at                TIMESTAMPTZ,
  cancel_reason               TEXT,
  executed_at                 TIMESTAMPTZ,
  fc_transaction_id           TEXT,                            -- soft FK to fc_transactions(id)
  budget_check_result         JSONB,                           -- snapshot of the FC budget check
  failure_reason              TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_payments_mission ON missions.mission_payments(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_mission_payments_pending ON missions.mission_payments(status, cancel_window_until)
  WHERE status IN ('proposed', 'approved');
CREATE INDEX IF NOT EXISTS idx_mission_payments_fc_tx ON missions.mission_payments(fc_transaction_id)
  WHERE fc_transaction_id IS NOT NULL;

-- ── mission_payment_log — append-only audit trail of every transition ─────

CREATE TABLE IF NOT EXISTS missions.mission_payment_log (
  id              BIGSERIAL PRIMARY KEY,
  payment_id      TEXT NOT NULL REFERENCES missions.mission_payments(id) ON DELETE CASCADE,
  event           TEXT NOT NULL
    CHECK (event IN ('proposed', 'approved', 'cancelled', 'execute_started', 'executed', 'failed', 'budget_blocked')),
  actor           TEXT,                                       -- user_id or 'system'
  details         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_payment_log_payment ON missions.mission_payment_log(payment_id, created_at);
