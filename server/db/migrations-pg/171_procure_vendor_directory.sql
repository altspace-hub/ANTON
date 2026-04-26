-- 171_procure_vendor_directory.sql
-- Phase B.2: Procure build-out — vendor directory + benchmarks + RFQ templates.
--
-- Adds three foundational systems:
--   1. procure_vendor_directory — searchable vendor catalogue per category
--   2. procure_benchmarks — pricing + delivery benchmarks per category
--   3. procure_rfq_templates — RFQ templates by category (jurisdiction-aware)

-- ── Vendor directory ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procure_vendor_directory (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  website               TEXT,
  category              TEXT NOT NULL,                          -- e.g. 'cloud-infra', 'professional-services', 'office-supplies'
  jurisdictions         TEXT[],                                 -- where the vendor operates
  certifications        TEXT[],                                 -- e.g. ['ISO27001', 'SOC2', 'CE']
  size_band             TEXT CHECK (size_band IN ('startup', 'sme', 'mid', 'enterprise')),
  contact_email         TEXT,
  notes                 TEXT,
  trust_score           NUMERIC(3,2),                           -- 0.00–1.00 — operator-curated trust signal
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procure_vendors_category ON procure_vendor_directory(category) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_procure_vendors_trust    ON procure_vendor_directory(trust_score DESC) WHERE is_active = TRUE;

-- ── Benchmarks (per category, per region) ───────────────────────────
CREATE TABLE IF NOT EXISTS procure_benchmarks (
  id                    TEXT PRIMARY KEY,
  category              TEXT NOT NULL,
  metric                TEXT NOT NULL,                          -- e.g. 'unit_price', 'lead_time_days', 'support_sla_hours'
  region                TEXT,                                   -- ISO 3166-1 alpha-2 or NULL for global
  metric_value_p25      NUMERIC,
  metric_value_p50      NUMERIC,
  metric_value_p75      NUMERIC,
  unit                  TEXT,                                   -- e.g. 'EUR', 'days', 'hours'
  sample_size           INTEGER,
  source                TEXT,
  last_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procure_bench_category ON procure_benchmarks(category, metric);

-- ── RFQ templates ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procure_rfq_templates (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  category              TEXT NOT NULL,
  jurisdiction          TEXT,                                   -- NULL = generic
  template_body         TEXT NOT NULL,                          -- Markdown RFQ template
  required_sections     TEXT[],                                 -- e.g. ['scope', 'deliverables', 'timeline', 'pricing', 'terms']
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procure_rfq_category ON procure_rfq_templates(category, jurisdiction) WHERE is_active = TRUE;

-- ── Seed: 3 vendors + 3 benchmarks + 1 RFQ template per category anchor ──
INSERT INTO procure_vendor_directory (id, name, description, category, jurisdictions, certifications, size_band, trust_score) VALUES
  ('seed-vendor-anthropic',
   'Anthropic',
   'Foundation-model provider for Claude. Used as default LLM provider in ANTON.',
   'ai-llm-provider', ARRAY['US','UK','EU'], ARRAY['SOC2'], 'enterprise', 0.95),
  ('seed-vendor-aws',
   'Amazon Web Services',
   'Cloud infrastructure provider — compute, storage, networking, managed databases.',
   'cloud-infra', ARRAY['US','UK','EU','SE','APAC','LATAM'], ARRAY['ISO27001','SOC2','HIPAA','PCI-DSS','FedRAMP'], 'enterprise', 0.92),
  ('seed-vendor-stripe',
   'Stripe',
   'Payment processing + financial infrastructure for SMEs and platforms.',
   'payments', ARRAY['US','UK','EU','SE','APAC'], ARRAY['PCI-DSS-L1','SOC2'], 'enterprise', 0.93)
ON CONFLICT (id) DO NOTHING;

INSERT INTO procure_benchmarks (id, category, metric, region, metric_value_p25, metric_value_p50, metric_value_p75, unit, sample_size, source) VALUES
  ('seed-bench-cloud-infra-eur', 'cloud-infra', 'monthly_spend',  'EU', 500, 2000, 8000, 'EUR', 120, 'Operator panel data 2026Q1'),
  ('seed-bench-payments-fee',    'payments',    'transaction_fee_pct', NULL, 1.4, 1.7, 2.4, 'pct', 200, 'Public pricing pages 2026Q1'),
  ('seed-bench-ai-llm-cost',     'ai-llm-provider', 'per_1m_input_tokens', NULL, 3.0, 8.0, 15.0, 'USD', 50, 'Public pricing 2026Q1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO procure_rfq_templates (id, name, category, jurisdiction, template_body, required_sections) VALUES
  ('seed-rfq-cloud-infra-generic',
   'Cloud infrastructure RFQ (generic)',
   'cloud-infra',
   NULL,
   '# RFQ — Cloud infrastructure\n\n## Scope\n[Describe workload, expected scale, geographic constraints]\n\n## Required services\n- Compute\n- Storage\n- Networking\n- Managed database (specify engines)\n\n## Compliance\nList required certifications: ISO27001, SOC2, HIPAA, etc.\n\n## Timeline\n- Decision by: [date]\n- Cutover by: [date]\n\n## Pricing\nProvide: monthly committed spend, on-demand rate, support tier costs, exit-data-egress fees.\n\n## Terms\n[SLA, data residency, support hours, exit clauses]\n',
   ARRAY['scope','required_services','compliance','timeline','pricing','terms'])
ON CONFLICT (id) DO NOTHING;
