-- 169_grow_crm_external_columns.sql
-- Adds the columns and unique constraints the Salesforce / HubSpot adapters
-- need to upsert from external CRMs into the Grow tables.
--
-- Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.5 follow-up
-- (second-take review caught the missing columns referenced by
-- server/services/connectors/crm-adapter.ts).
--
-- Pattern:
--   external_provider     — 'salesforce' | 'hubspot' | 'dynamics365' | 'pipedrive'
--   external_id           — provider-side id (Salesforce Id, HubSpot id, etc.)
--   owned_by_anton        — true when the user has taken ownership; sync skips
--   last_modified_external — provider's LastModifiedDate / updatedAt

ALTER TABLE grow_contacts
  ADD COLUMN IF NOT EXISTS external_provider      TEXT,
  ADD COLUMN IF NOT EXISTS external_id            TEXT,
  ADD COLUMN IF NOT EXISTS owned_by_anton         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_modified_external TIMESTAMPTZ;

ALTER TABLE grow_organisations
  ADD COLUMN IF NOT EXISTS external_provider      TEXT,
  ADD COLUMN IF NOT EXISTS external_id            TEXT,
  ADD COLUMN IF NOT EXISTS owned_by_anton         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_modified_external TIMESTAMPTZ;

ALTER TABLE grow_opportunities
  ADD COLUMN IF NOT EXISTS external_provider      TEXT,
  ADD COLUMN IF NOT EXISTS external_id            TEXT,
  ADD COLUMN IF NOT EXISTS owned_by_anton         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_modified_external TIMESTAMPTZ;

-- Composite unique constraints — required by ON CONFLICT clauses in the adapters.
-- Partial unique indexes so existing pre-CRM rows (NULL external_provider) don't
-- conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_grow_contacts_external
  ON grow_contacts (external_provider, external_id)
  WHERE external_provider IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_grow_organisations_external
  ON grow_organisations (external_provider, external_id)
  WHERE external_provider IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_grow_opportunities_external
  ON grow_opportunities (external_provider, external_id)
  WHERE external_provider IS NOT NULL AND external_id IS NOT NULL;

-- Indexes to make owned-check fast.
CREATE INDEX IF NOT EXISTS idx_grow_contacts_owned         ON grow_contacts(owned_by_anton)         WHERE owned_by_anton = TRUE;
CREATE INDEX IF NOT EXISTS idx_grow_organisations_owned    ON grow_organisations(owned_by_anton)    WHERE owned_by_anton = TRUE;
CREATE INDEX IF NOT EXISTS idx_grow_opportunities_owned    ON grow_opportunities(owned_by_anton)    WHERE owned_by_anton = TRUE;
