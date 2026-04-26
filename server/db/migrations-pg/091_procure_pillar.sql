-- Migration 091: Procure Pillar — Phased Procurement Pipeline
-- 5 phases: Prepare → Source → Select → Contract → Manage

CREATE TABLE IF NOT EXISTS procure_cycles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  phase TEXT NOT NULL DEFAULT 'prepare' CHECK (phase IN ('prepare', 'source', 'select', 'contract', 'manage')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  company_size TEXT CHECK (company_size IN ('small', 'medium', 'large', 'enterprise')),
  budget_range TEXT,
  category TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procure_requirements (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES procure_cycles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low', 'nice_to_have')),
  category TEXT,
  source TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'revised', 'dropped')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procure_criteria (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES procure_cycles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'functional',
  weight NUMERIC(5,2) DEFAULT 1.0,
  is_must_have BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procure_vendors (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES procure_cycles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  contact_name TEXT,
  contact_email TEXT,
  status TEXT DEFAULT 'longlist' CHECK (status IN ('longlist', 'shortlist', 'finalist', 'selected', 'rejected', 'declined')),
  notes TEXT,
  overall_score NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procure_documents (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES procure_cycles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('rfi', 'rfp', 'rfq', 'evaluation', 'contract', 'report', 'other')),
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'final', 'sent', 'archived')),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procure_evaluations (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES procure_cycles(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES procure_vendors(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES procure_criteria(id) ON DELETE CASCADE,
  score NUMERIC(5,2),
  notes TEXT,
  evaluated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendor_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS procure_contracts (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES procure_cycles(id) ON DELETE CASCADE,
  vendor_id TEXT REFERENCES procure_vendors(id),
  title TEXT NOT NULL,
  contract_type TEXT,
  start_date DATE,
  end_date DATE,
  value NUMERIC(15,2),
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'negotiation', 'signed', 'active', 'expired', 'terminated')),
  terms_summary TEXT,
  risk_flags TEXT,
  renewal_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_procure_cycles_status ON procure_cycles(status);
CREATE INDEX IF NOT EXISTS idx_procure_requirements_cycle ON procure_requirements(cycle_id);
CREATE INDEX IF NOT EXISTS idx_procure_criteria_cycle ON procure_criteria(cycle_id);
CREATE INDEX IF NOT EXISTS idx_procure_vendors_cycle ON procure_vendors(cycle_id);
CREATE INDEX IF NOT EXISTS idx_procure_vendors_status ON procure_vendors(cycle_id, status);
CREATE INDEX IF NOT EXISTS idx_procure_documents_cycle ON procure_documents(cycle_id);
CREATE INDEX IF NOT EXISTS idx_procure_evaluations_cycle ON procure_evaluations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_procure_evaluations_vendor ON procure_evaluations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_procure_contracts_cycle ON procure_contracts(cycle_id);
