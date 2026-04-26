-- 185_payments_invoice_register.sql — invoice register + revenue-share
-- splits for the Payments pillar.
--
-- Phase 1 of the Layer-6 (Economy) build-out: when an expert charges
-- for a module run / agent query / pack purchase, the system needs a
-- proper invoice + payment-status register, not just a transaction log.
-- This migration adds:
--   1) fc_invoice_register — header + status of every issued invoice
--   2) fc_invoice_lines — line-item detail (what was charged, qty, rate)
--   3) fc_revenue_shares — for `.anton` packs sold via Marketplace,
--      tracks the revenue split between author / curator / instance.

CREATE TABLE IF NOT EXISTS fc_invoice_register (
  id              TEXT PRIMARY KEY,
  invoice_no      TEXT NOT NULL UNIQUE,         -- human-readable, e.g. INV-2026-00042
  buyer_pubkey    TEXT NOT NULL,                -- the FC pubkey of the buyer
  seller_pubkey   TEXT NOT NULL,                -- the seller (this instance's wallet)
  issued_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_at          TIMESTAMP,
  amount_total    NUMERIC NOT NULL,
  amount_paid     NUMERIC DEFAULT 0,
  currency        TEXT DEFAULT 'FTC',
  status          TEXT NOT NULL DEFAULT 'issued',  -- 'draft' / 'issued' / 'partially_paid' / 'paid' / 'overdue' / 'cancelled' / 'refunded'
  payment_request TEXT,                          -- FC payment URI / address
  context_kind    TEXT,                          -- 'module_run' / 'agent_query' / 'pack_purchase' / 'subscription' / 'other'
  context_ref     TEXT,                          -- pointer into the relevant pillar table
  notes           TEXT,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS fc_invoice_register_buyer_idx
  ON fc_invoice_register(buyer_pubkey, issued_at DESC);

CREATE INDEX IF NOT EXISTS fc_invoice_register_status_idx
  ON fc_invoice_register(status, due_at) WHERE status IN ('issued', 'partially_paid', 'overdue');

-- Per-line-item detail. An invoice can have many lines (e.g., a multi-day
-- engagement billed per-hour with different rates per task type).
CREATE TABLE IF NOT EXISTS fc_invoice_lines (
  id              TEXT PRIMARY KEY,
  invoice_id      TEXT NOT NULL,
  line_no         INTEGER NOT NULL,
  description     TEXT NOT NULL,
  quantity        NUMERIC NOT NULL DEFAULT 1,
  unit_rate       NUMERIC NOT NULL,
  unit_kind       TEXT NOT NULL DEFAULT 'item',  -- 'item' / 'hour' / 'token' / 'call' / 'mb'
  amount          NUMERIC NOT NULL,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS fc_invoice_lines_invoice_idx
  ON fc_invoice_lines(invoice_id, line_no);

-- Revenue shares: for Marketplace `.anton` pack sales the rev is split
-- between author (who created it), curator (who reviewed/listed it),
-- and the instance host (infrastructure). This table records the
-- per-invoice split + payout status.
CREATE TABLE IF NOT EXISTS fc_revenue_shares (
  id              TEXT PRIMARY KEY,
  invoice_id      TEXT NOT NULL,
  recipient_role  TEXT NOT NULL,                  -- 'author' / 'curator' / 'instance' / 'platform'
  recipient_pubkey TEXT NOT NULL,
  share_pct       NUMERIC NOT NULL,               -- 0.0–100.0
  share_amount    NUMERIC NOT NULL,
  payout_status   TEXT NOT NULL DEFAULT 'pending',  -- 'pending' / 'released' / 'held' / 'failed'
  payout_at       TIMESTAMP,
  payout_tx_id    TEXT,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS fc_revenue_shares_invoice_idx
  ON fc_revenue_shares(invoice_id);

CREATE INDEX IF NOT EXISTS fc_revenue_shares_recipient_idx
  ON fc_revenue_shares(recipient_pubkey, payout_status);
