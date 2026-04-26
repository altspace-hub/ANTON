-- 180_civic_authority_directory.sql — searchable directory of civic
-- authorities + their digital channels, per jurisdiction.
--
-- Companion to civic_process_packs (mig 170): the packs describe *what*
-- a process is, this directory describes *who* you submit it to and
-- *where*. A user navigating an unfamiliar jurisdiction can browse the
-- directory to find the right authority.

CREATE TABLE IF NOT EXISTS civic_authorities (
  id                  TEXT PRIMARY KEY,
  jurisdiction        TEXT NOT NULL,
  authority_kind      TEXT NOT NULL,            -- 'tax' / 'company_register' / 'social_security' / 'immigration' / 'data_protection' / 'sanctions' / 'consumer_protection' / 'health' / 'other'
  short_code          TEXT NOT NULL,            -- e.g. 'SKV' (Skatteverket), 'BV' (Bolagsverket), 'HMRC', 'IRS'
  name                TEXT NOT NULL,
  description         TEXT,
  website_url         TEXT,
  digital_portal_url  TEXT,                     -- where you actually file
  contact_phone       TEXT,
  contact_email       TEXT,
  service_languages   JSONB DEFAULT '[]',       -- array of ISO codes
  hours_local         TEXT,                     -- "Mon-Fri 8-18" / "24/7" / etc.
  notes_md            TEXT,
  is_active           BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS civic_authorities_jurisdiction_idx
  ON civic_authorities(jurisdiction, authority_kind) WHERE is_active = TRUE;

-- Linkage: which authority handles which process pack.
-- A process pack can have multiple authorities (e.g., AMLR registration
-- might involve both the financial supervisor + the company register).

CREATE TABLE IF NOT EXISTS civic_process_authorities (
  process_pack_id   TEXT NOT NULL,
  authority_id      TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'primary',  -- 'primary' / 'copied' / 'consulted' / 'enforcing'
  PRIMARY KEY (process_pack_id, authority_id)
);

-- Anchor seeds.
INSERT INTO civic_authorities (id, jurisdiction, authority_kind, short_code, name, description, website_url, digital_portal_url, service_languages) VALUES
  ('auth_se_skatteverket',
   'SE', 'tax', 'SKV', 'Skatteverket',
   'Swedish Tax Agency — personal + corporate tax, VAT, population register.',
   'https://www.skatteverket.se',
   'https://www.skatteverket.se/privat/etjansterochblanketter/inkomstdeklaration1.html',
   '["sv","en"]'::jsonb),
  ('auth_se_bolagsverket',
   'SE', 'company_register', 'BV', 'Bolagsverket',
   'Swedish Companies Registration Office — limited company registration, annual reports, beneficial-ownership register.',
   'https://www.bolagsverket.se',
   'https://www.verksamt.se',
   '["sv","en"]'::jsonb),
  ('auth_uk_hmrc',
   'GB', 'tax', 'HMRC', 'HM Revenue & Customs',
   'UK tax authority — income tax, corporation tax, VAT, customs duties.',
   'https://www.gov.uk/government/organisations/hm-revenue-customs',
   'https://www.gov.uk/log-in-register-hmrc-online-services',
   '["en","cy"]'::jsonb),
  ('auth_uk_companies_house',
   'GB', 'company_register', 'CH', 'Companies House',
   'UK companies register — incorporation, annual confirmation statement, accounts filing.',
   'https://www.gov.uk/government/organisations/companies-house',
   'https://find-and-update.company-information.service.gov.uk',
   '["en","cy"]'::jsonb),
  ('auth_us_irs',
   'US', 'tax', 'IRS', 'Internal Revenue Service',
   'US federal tax authority — Form 1040, employer filings, EIN issuance.',
   'https://www.irs.gov',
   'https://www.irs.gov/payments/online-account-for-individuals',
   '["en","es"]'::jsonb)
ON CONFLICT (id) DO NOTHING;
