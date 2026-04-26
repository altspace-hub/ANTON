-- 178_procure_contract_register.sql — contract-renewal calendar +
-- supplier-risk-event log for the Procure pillar.
--
-- The base procure_contracts table ships in mig 091. This migration
-- adds two complementary tables:
--   1) procure_contract_renewal_events — tracks renewal milestones
--      (notice-period reminder, renewal-decision deadline, signed
--      renewal date) for each contract.
--   2) procure_supplier_risk_events — surfaces supplier-side risk
--      events (cyber incident, regulatory action, financial distress)
--      against a vendor; can be sourced from the Atlas pillar bridge.

CREATE TABLE IF NOT EXISTS procure_contract_renewal_events (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL,
  event_kind      TEXT NOT NULL,         -- 'notice_window_open' / 'decision_due' / 'renewed' / 'lapsed' / 'terminated' / 'extended'
  due_at          DATE,
  occurred_at     TIMESTAMP,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' / 'completed' / 'missed' / 'cancelled'
  decision        TEXT,                  -- 'renew' / 'renegotiate' / 'terminate' / 'replace'
  decided_by      TEXT,
  notes           TEXT,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS procure_contract_renewal_events_contract_idx
  ON procure_contract_renewal_events(contract_id, due_at);

CREATE INDEX IF NOT EXISTS procure_contract_renewal_events_pending_idx
  ON procure_contract_renewal_events(due_at) WHERE status = 'pending';

-- Supplier risk events: when something happens to a vendor that the
-- contract owner needs to know about (cyber incident, regulatory action,
-- ownership change, financial distress). This is the Atlas-Procure
-- bridge — a third-party risk Atlas finding can post a row here so the
-- Procure pillar surfaces it on the contract.

CREATE TABLE IF NOT EXISTS procure_supplier_risk_events (
  id              TEXT PRIMARY KEY,
  vendor_id       TEXT NOT NULL,
  contract_id     TEXT,
  event_kind      TEXT NOT NULL,         -- 'cyber_incident' / 'regulatory_action' / 'ownership_change' / 'financial_distress' / 'sla_breach' / 'other'
  occurred_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  source          TEXT,                  -- 'manual' / 'atlas_pillar' / 'news_feed' / 'community'
  severity        TEXT NOT NULL DEFAULT 'medium',  -- 'low' / 'medium' / 'high' / 'critical'
  description     TEXT NOT NULL,
  reference_url   TEXT,
  resolved_at     TIMESTAMP,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS procure_supplier_risk_events_vendor_idx
  ON procure_supplier_risk_events(vendor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS procure_supplier_risk_events_unresolved_idx
  ON procure_supplier_risk_events(severity, occurred_at DESC) WHERE resolved_at IS NULL;
