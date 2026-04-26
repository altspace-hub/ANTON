-- 179_civic_filing_calendar.sql — recurring civic filings calendar +
-- per-jurisdiction filing reminders.
--
-- Many civic obligations are *recurring* (annual tax return, quarterly
-- VAT, monthly social-security filing, biennial company-register update).
-- A one-shot eligibility check (mig 170) doesn't capture this. This
-- migration adds the recurring-filing model so the user can see "what's
-- due this month" and "what's coming up in 30 / 60 / 90 days".

CREATE TABLE IF NOT EXISTS civic_filing_definitions (
  id                TEXT PRIMARY KEY,
  jurisdiction      TEXT NOT NULL,
  authority         TEXT,
  filing_kind       TEXT NOT NULL,            -- 'tax_return' / 'vat_return' / 'corp_register' / 'social_security' / 'license_renewal' / 'compliance_attestation' / 'other'
  filing_label      TEXT NOT NULL,
  cadence           TEXT NOT NULL,            -- 'annual' / 'quarterly' / 'monthly' / 'biennial' / 'on_event'
  applies_to        TEXT NOT NULL,            -- 'individual' / 'sole_trader' / 'small_business' / 'limited_co' / 'all'
  guidance_md       TEXT,
  process_pack_id   TEXT,                     -- optional FK to civic_process_packs for the linked process
  source_url        TEXT,
  is_active         BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS civic_filing_definitions_jurisdiction_idx
  ON civic_filing_definitions(jurisdiction, applies_to) WHERE is_active = TRUE;

-- A user's enrolment in specific filings — tells the system which
-- recurring filings to put on their calendar.

CREATE TABLE IF NOT EXISTS civic_filing_enrolments (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  definition_id   TEXT NOT NULL,
  enrolled_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notice_days     INTEGER NOT NULL DEFAULT 14,  -- how many days ahead to start reminding
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  UNIQUE (user_id, definition_id)
);

-- Concrete instances on the calendar: each row = one upcoming or past
-- filing event. Generated from definitions + enrolments by a scheduled job.

CREATE TABLE IF NOT EXISTS civic_filing_events (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  definition_id   TEXT NOT NULL,
  enrolment_id    TEXT NOT NULL,
  due_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'upcoming',  -- 'upcoming' / 'in_progress' / 'submitted' / 'late' / 'skipped' / 'not_required'
  reminder_sent_at TIMESTAMP,
  submitted_at    TIMESTAMP,
  reference_no    TEXT,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS civic_filing_events_user_due_idx
  ON civic_filing_events(user_id, due_date);

CREATE INDEX IF NOT EXISTS civic_filing_events_status_idx
  ON civic_filing_events(status, due_date) WHERE status IN ('upcoming', 'in_progress');

-- Anchor seed: the SE personal tax return (recurring annually). Mirrors
-- the eligibility-rule pack from mig 170 but adds the cadence dimension.
INSERT INTO civic_filing_definitions (id, jurisdiction, authority, filing_kind, filing_label, cadence, applies_to, guidance_md) VALUES
  ('def_se_personal_tax_return',
   'SE', 'Skatteverket', 'tax_return',
   'Personal income tax return (Inkomstdeklaration 1)',
   'annual', 'individual',
   'Filed annually by 2 May for the previous tax year. Pre-filled by Skatteverket; review, correct, sign electronically with BankID.'),

  ('def_uk_self_assessment',
   'GB', 'HMRC', 'tax_return',
   'Self-assessment tax return (SA100)',
   'annual', 'sole_trader',
   'Online filing deadline 31 January for tax year ending previous 5 April. Paper deadline 31 October. Late filing = automatic £100 penalty.'),

  ('def_se_vat_quarterly',
   'SE', 'Skatteverket', 'vat_return',
   'VAT return (quarterly)',
   'quarterly', 'small_business',
   'Quarterly filing for businesses with turnover under SEK 40m. Due 12th of second month after quarter end.')
ON CONFLICT (id) DO NOTHING;
