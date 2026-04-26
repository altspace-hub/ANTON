/**
 * crm-adapter.ts — common shape for external CRM connectors (Salesforce, HubSpot).
 *
 * Read-side first per ANTON_Improvement_and_Investigation_Brief.md §E.5:
 *   - Pull contacts / organisations / opportunities into Grow tables.
 *   - External system wins on read; user can mark a Grow record as
 *     "owned by ANTON" to opt out of overwrite.
 *   - Bidirectional sync (write-back) explicitly out of scope for v1.
 */

import type { DatabaseAdapter } from '../../db/database.js';

export type CrmProvider = 'salesforce' | 'hubspot';

export interface CrmContact {
  externalId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  organisationExternalId: string | null;
  lastModifiedExternal: string;
}

export interface CrmOrganisation {
  externalId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  region: string | null;
  lastModifiedExternal: string;
}

export interface CrmOpportunity {
  externalId: string;
  name: string;
  stage: string;
  amount: number | null;
  currency: string | null;
  closeDate: string | null;
  primaryContactExternalId: string | null;
  organisationExternalId: string | null;
  lastModifiedExternal: string;
}

export interface CrmAdapterCredentials {
  /** OAuth access token, decrypted at call time. */
  accessToken: string;
  /** Optional refresh token. */
  refreshToken?: string;
  /** Provider-specific instance/base URL. */
  baseUrl?: string;
}

export interface CrmAdapter {
  provider: CrmProvider;
  /** Fetch contacts modified since the given ISO timestamp (or all if omitted). */
  fetchContacts(since?: string, limit?: number): Promise<CrmContact[]>;
  fetchOrganisations(since?: string, limit?: number): Promise<CrmOrganisation[]>;
  fetchOpportunities(since?: string, limit?: number): Promise<CrmOpportunity[]>;
  /** Health-check — returns true if credentials work. */
  healthCheck(): Promise<boolean>;
}

// ── Apply path: write fetched rows into Grow tables ────────────────────

export interface SyncResult {
  contactsImported: number;
  contactsSkipped: number;
  organisationsImported: number;
  organisationsSkipped: number;
  opportunitiesImported: number;
  opportunitiesSkipped: number;
  errors: string[];
}

/**
 * Apply a fetched batch into the Grow tables. Conflict policy:
 *   - If a Grow row exists with `owned_by_anton = true`, skip (user has taken ownership).
 *   - Otherwise, upsert from the external system.
 *
 * The Grow tables (grow_contacts, grow_organisations, grow_opportunities) are
 * shared with the standalone Grow CRM; the `external_provider + external_id`
 * unique key prevents duplication.
 */
export async function applyCrmSync(
  db: DatabaseAdapter,
  provider: CrmProvider,
  data: { contacts: CrmContact[]; organisations: CrmOrganisation[]; opportunities: CrmOpportunity[] }
): Promise<SyncResult> {
  const result: SyncResult = {
    contactsImported: 0, contactsSkipped: 0,
    organisationsImported: 0, organisationsSkipped: 0,
    opportunitiesImported: 0, opportunitiesSkipped: 0,
    errors: [],
  };

  // Helper: was the Grow row marked owned-by-ANTON?
  async function isOwned(table: string, externalId: string): Promise<boolean> {
    try {
      const row = await db.get(
        `SELECT owned_by_anton FROM ${table} WHERE external_provider = ? AND external_id = ?`,
        provider, externalId
      ) as { owned_by_anton: boolean } | undefined;
      return row?.owned_by_anton === true;
    } catch {
      // The owned_by_anton column may not exist if Grow tables haven't been
      // updated yet — treat as not-owned. A future migration adds the column.
      return false;
    }
  }

  // Organisations first so contact FKs resolve.
  // NB: Grow tables use real column names (`name`, `website`, `industry`, etc.) per
  // mig 093_grow_pillar.sql. The external_provider / external_id / owned_by_anton
  // columns + (external_provider, external_id) unique index come from mig 169.
  for (const o of data.organisations) {
    try {
      if (await isOwned('grow_organisations', o.externalId)) {
        result.organisationsSkipped++; continue;
      }
      await db.run(
        `INSERT INTO grow_organisations
           (id, name, website, industry, headquarters,
            external_provider, external_id, last_modified_external)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (external_provider, external_id) DO UPDATE SET
           name = EXCLUDED.name,
           website = EXCLUDED.website,
           industry = EXCLUDED.industry,
           headquarters = EXCLUDED.headquarters,
           last_modified_external = EXCLUDED.last_modified_external`,
        `${provider}-${o.externalId}`, o.name, o.domain, o.industry, o.region,
        provider, o.externalId, o.lastModifiedExternal
      );
      result.organisationsImported++;
    } catch (err) {
      result.errors.push(`org ${o.externalId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const c of data.contacts) {
    try {
      if (await isOwned('grow_contacts', c.externalId)) {
        result.contactsSkipped++; continue;
      }
      // organisation_id references the local Grow organisation row id we just
      // inserted (deterministic format: `${provider}-${externalId}`).
      const orgIdLocal = c.organisationExternalId ? `${provider}-${c.organisationExternalId}` : null;
      await db.run(
        `INSERT INTO grow_contacts
           (id, first_name, last_name, email, phone, organisation_id,
            external_provider, external_id, last_modified_external)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (external_provider, external_id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           organisation_id = EXCLUDED.organisation_id,
           last_modified_external = EXCLUDED.last_modified_external`,
        `${provider}-${c.externalId}`,
        c.firstName ?? '', c.lastName ?? '',
        c.email, c.phone, orgIdLocal,
        provider, c.externalId, c.lastModifiedExternal
      );
      result.contactsImported++;
    } catch (err) {
      result.errors.push(`contact ${c.externalId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const op of data.opportunities) {
    try {
      if (await isOwned('grow_opportunities', op.externalId)) {
        result.opportunitiesSkipped++; continue;
      }
      const orgIdLocal     = op.organisationExternalId  ? `${provider}-${op.organisationExternalId}`  : null;
      const contactIdLocal = op.primaryContactExternalId ? `${provider}-${op.primaryContactExternalId}` : null;
      await db.run(
        `INSERT INTO grow_opportunities
           (id, title, contact_id, organisation_id, stage_id, value, currency, expected_close_date,
            external_provider, external_id, last_modified_external)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (external_provider, external_id) DO UPDATE SET
           title = EXCLUDED.title,
           contact_id = EXCLUDED.contact_id,
           organisation_id = EXCLUDED.organisation_id,
           stage_id = EXCLUDED.stage_id,
           value = EXCLUDED.value,
           currency = EXCLUDED.currency,
           expected_close_date = EXCLUDED.expected_close_date,
           last_modified_external = EXCLUDED.last_modified_external`,
        `${provider}-${op.externalId}`, op.name,
        contactIdLocal, orgIdLocal,
        // stage_id has a NOT NULL FK to grow_pipeline_stages — default 'prospect'
        // (the seeded default stage from mig 093). External CRM stage strings
        // are surfaced separately via a follow-up; for v1 we anchor on prospect.
        'prospect',
        op.amount, op.currency, op.closeDate,
        provider, op.externalId, op.lastModifiedExternal
      );
      result.opportunitiesImported++;
    } catch (err) {
      result.errors.push(`opp ${op.externalId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Run a full sync for a provider — fetch + apply. Returns the SyncResult.
 * Caller is responsible for credential resolution (typically via connection-manager).
 */
export async function runFullSync(
  db: DatabaseAdapter,
  adapter: CrmAdapter,
  options?: { since?: string; pageLimit?: number }
): Promise<SyncResult> {
  const limit = options?.pageLimit ?? 200;
  const [contacts, organisations, opportunities] = await Promise.all([
    adapter.fetchContacts(options?.since, limit),
    adapter.fetchOrganisations(options?.since, limit),
    adapter.fetchOpportunities(options?.since, limit),
  ]);
  return await applyCrmSync(db, adapter.provider, { contacts, organisations, opportunities });
}
