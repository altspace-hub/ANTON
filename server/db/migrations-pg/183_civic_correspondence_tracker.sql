-- 183_civic_correspondence_tracker.sql — correspondence + reference-no
-- tracker for the Civic pillar.
--
-- A civic engagement (e.g., applying for permit, appealing a decision,
-- responding to an audit) typically generates many touch-points: letters
-- in, letters out, reference numbers, deadlines for responses. Without a
-- single place to track these, things slip — and missed deadlines in
-- civic contexts can be expensive.

CREATE TABLE IF NOT EXISTS civic_correspondence (
  id                TEXT PRIMARY KEY,
  engagement_id     TEXT,                     -- optional FK to civic_engagements
  user_id           TEXT NOT NULL DEFAULT 'default',
  authority_id      TEXT,                     -- FK to civic_authorities (mig 180)
  correspondence_kind TEXT NOT NULL,          -- 'inbound_letter' / 'outbound_letter' / 'inbound_email' / 'outbound_email' / 'inbound_call' / 'outbound_call' / 'in_person' / 'portal_message'
  occurred_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reference_no      TEXT,                     -- the authority's reference number for the correspondence
  subject           TEXT,
  body_md           TEXT,
  document_uri      TEXT,                     -- pointer to the stored PDF / scan
  requires_response BOOLEAN DEFAULT FALSE,
  response_due_at   DATE,
  response_status   TEXT NOT NULL DEFAULT 'no_action',  -- 'no_action' / 'draft' / 'sent' / 'overdue' / 'resolved'
  responded_at      TIMESTAMP,
  payload           JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS civic_correspondence_engagement_idx
  ON civic_correspondence(engagement_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS civic_correspondence_user_idx
  ON civic_correspondence(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS civic_correspondence_response_due_idx
  ON civic_correspondence(response_due_at) WHERE response_status IN ('no_action', 'draft', 'overdue');

-- Reference-number registry: many civic processes generate one or more
-- reference numbers (case number, application number, decision number,
-- payment reference). A single registry per user lets the user search
-- "what is reference no 12345?" without remembering which engagement
-- it belongs to.

CREATE TABLE IF NOT EXISTS civic_reference_numbers (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  authority_id    TEXT,
  reference_no    TEXT NOT NULL,
  reference_kind  TEXT NOT NULL,              -- 'case_no' / 'application_no' / 'decision_no' / 'payment_ref' / 'tax_id' / 'permit_no' / 'invoice_no' / 'other'
  engagement_id   TEXT,
  description     TEXT,
  issued_at       TIMESTAMP,
  expires_at      TIMESTAMP,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS civic_reference_numbers_user_ref_idx
  ON civic_reference_numbers(user_id, reference_no);

CREATE INDEX IF NOT EXISTS civic_reference_numbers_authority_idx
  ON civic_reference_numbers(authority_id, reference_kind);
