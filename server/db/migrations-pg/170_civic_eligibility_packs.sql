-- 170_civic_eligibility_packs.sql
-- Phase B.1: Civic build-out — eligibility-rule engine + process packs.
--
-- Adds two foundational systems:
--   1. civic_eligibility_rules — declarative rules per process, JSON conditions
--      evaluated by `civic-eligibility.ts` against an applicant context
--   2. civic_process_packs — bundled jurisdiction-specific process libraries
--      (similar to the risk-atlas industry-pack pattern); seeds 3 starter packs

-- ── Eligibility rules ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS civic_eligibility_rules (
  id                    TEXT PRIMARY KEY,
  process_id            TEXT REFERENCES civic_processes(id) ON DELETE CASCADE,
  pack_id               TEXT,                                       -- soft FK to civic_process_packs(id)
  rule_code             TEXT NOT NULL,                              -- e.g. 'ELIG-AGE-18+', 'ELIG-RESIDENCY-12M'
  rule_label            TEXT NOT NULL,
  condition_kind        TEXT NOT NULL CHECK (condition_kind IN (
    'age_min', 'age_max', 'residency_months', 'income_max', 'income_min',
    'jurisdiction_in', 'document_present', 'status_equals', 'custom_predicate'
  )),
  condition_value       JSONB NOT NULL,                             -- e.g. {"min": 18}, {"value": "EU citizen"}
  severity              TEXT DEFAULT 'mandatory' CHECK (severity IN ('mandatory', 'recommended', 'informational')),
  source_url            TEXT,                                       -- canonical source for the rule
  last_verified_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_civic_elig_rules_process ON civic_eligibility_rules(process_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_civic_elig_rules_pack    ON civic_eligibility_rules(pack_id)    WHERE is_active = TRUE;

-- ── Eligibility check results (per applicant per rule) ──────────────
CREATE TABLE IF NOT EXISTS civic_eligibility_results (
  id                    TEXT PRIMARY KEY,
  engagement_id         TEXT REFERENCES civic_engagements(id) ON DELETE CASCADE,
  rule_id               TEXT NOT NULL REFERENCES civic_eligibility_rules(id) ON DELETE CASCADE,
  applicant_context     JSONB NOT NULL,                             -- the input snapshot the rule was evaluated against
  outcome               TEXT NOT NULL CHECK (outcome IN ('eligible', 'ineligible', 'indeterminate', 'requires_evidence')),
  evidence              TEXT,                                       -- supporting evidence / explanation
  evaluated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_civic_elig_results_engagement ON civic_eligibility_results(engagement_id);

-- ── Process packs (jurisdiction-bundled libraries) ──────────────────
CREATE TABLE IF NOT EXISTS civic_process_packs (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  jurisdiction          TEXT NOT NULL,                              -- ISO 3166-1 alpha-2 + optional sub
  authority             TEXT,                                       -- e.g. "Skatteverket", "HMRC", "IRS"
  domain                TEXT,                                       -- e.g. 'tax', 'benefits', 'business_registration'
  version               TEXT NOT NULL DEFAULT '1.0.0',
  source_url            TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_civic_packs_jurisdiction ON civic_process_packs(jurisdiction, domain) WHERE is_active = TRUE;

-- ── Seed: 3 starter packs (SE / UK / US-CA) ─────────────────────────
-- These are anchor seeds — operators expand via the CivicProcessLibraryPage admin
-- or import additional packs as `.anton civic-process-pack` bundles.
INSERT INTO civic_process_packs (id, name, description, jurisdiction, authority, domain, source_url) VALUES
  ('seed-pack-se-tax-personal',
   'Sweden — Personal income tax',
   'Anchor pack for personal income tax filings (deklaration) under Skatteverket.',
   'SE', 'Skatteverket', 'tax', 'https://www.skatteverket.se/'),
  ('seed-pack-uk-business-reg',
   'UK — Business registration (Companies House)',
   'Anchor pack for incorporating a limited company at Companies House.',
   'UK', 'Companies House', 'business_registration', 'https://www.gov.uk/limited-company-formation'),
  ('seed-pack-us-ca-benefits',
   'US (California) — Benefits navigator',
   'Anchor pack for navigating California benefits (CalFresh, Medi-Cal, CalWORKs).',
   'US', 'California Department of Social Services', 'benefits', 'https://benefitscal.com/')
ON CONFLICT (id) DO NOTHING;

-- Seed eligibility rules (one anchor rule per pack)
INSERT INTO civic_eligibility_rules (id, pack_id, rule_code, rule_label, condition_kind, condition_value, severity, source_url) VALUES
  ('seed-elig-se-tax-residency',
   'seed-pack-se-tax-personal',
   'SE-TAX-RESIDENCY',
   'Swedish tax residency (≥183 days in calendar year OR domiciled in SE)',
   'residency_months',
   '{"min": 6, "jurisdiction": "SE"}'::jsonb,
   'mandatory',
   'https://www.skatteverket.se/'),
  ('seed-elig-uk-co-director-age',
   'seed-pack-uk-business-reg',
   'UK-CO-DIR-AGE',
   'At least one director aged 16+',
   'age_min',
   '{"value": 16, "applies_to": "director"}'::jsonb,
   'mandatory',
   'https://www.gov.uk/become-company-director'),
  ('seed-elig-us-ca-calfresh-income',
   'seed-pack-us-ca-benefits',
   'US-CA-CALFRESH-INCOME',
   'Household gross income at or below 200% of federal poverty level',
   'income_max',
   '{"value": "200_pct_fpl", "household_size_aware": true}'::jsonb,
   'mandatory',
   'https://benefitscal.com/')
ON CONFLICT (id) DO NOTHING;
