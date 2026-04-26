/**
 * hubspot-adapter.ts — HubSpot CRM API v3 read-side adapter.
 *
 * Implements the CrmAdapter shape from crm-adapter.ts. Read-only in v1
 * (per ANTON_Improvement_and_Investigation_Brief.md §E.5).
 *
 * Auth: OAuth 2.0 or Private App access token. Caller resolves credentials.
 *
 * HubSpot v3 endpoints:
 *   - /crm/v3/objects/contacts    → CrmContact
 *   - /crm/v3/objects/companies   → CrmOrganisation
 *   - /crm/v3/objects/deals       → CrmOpportunity
 */

import type {
  CrmAdapter, CrmAdapterCredentials, CrmContact, CrmOpportunity, CrmOrganisation,
} from './crm-adapter.js';

interface HubSpotProperty {
  value: string | number | null;
}

interface HubSpotContact {
  id: string;
  properties: {
    email?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    phone?: string | null;
    associatedcompanyid?: string | null;
    lastmodifieddate?: string;
  };
  updatedAt: string;
}

interface HubSpotCompany {
  id: string;
  properties: {
    name?: string;
    domain?: string | null;
    industry?: string | null;
    country?: string | null;
  };
  updatedAt: string;
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    dealstage?: string;
    amount?: string | null;
    deal_currency_code?: string | null;
    closedate?: string | null;
  };
  updatedAt: string;
  associations?: {
    contacts?: { results: { id: string }[] };
    companies?: { results: { id: string }[] };
  };
}

interface HubSpotPage<T> {
  results: T[];
  paging?: { next?: { after: string; link: string } };
}

export class HubSpotAdapter implements CrmAdapter {
  readonly provider = 'hubspot' as const;
  private accessToken: string;
  private baseUrl: string;

  constructor(creds: CrmAdapterCredentials) {
    if (!creds.accessToken) throw new Error('HubSpot accessToken required');
    this.accessToken = creds.accessToken;
    this.baseUrl = (creds.baseUrl ?? 'https://api.hubapi.com').replace(/\/$/, '');
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!r.ok) throw new Error(`HubSpot ${path} failed: ${r.status} ${r.statusText}`);
    return await r.json() as T;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/crm/v3/objects/contacts', { limit: '1' });
      return true;
    } catch { return false; }
  }

  async fetchContacts(_since?: string, limit = 100): Promise<CrmContact[]> {
    const data = await this.get<HubSpotPage<HubSpotContact>>(
      '/crm/v3/objects/contacts',
      { limit: String(limit), properties: 'email,firstname,lastname,phone,associatedcompanyid,lastmodifieddate' }
    );
    return data.results.map(r => ({
      externalId: r.id,
      email: r.properties.email ?? null,
      firstName: r.properties.firstname ?? null,
      lastName: r.properties.lastname ?? null,
      phone: r.properties.phone ?? null,
      organisationExternalId: r.properties.associatedcompanyid ?? null,
      lastModifiedExternal: r.properties.lastmodifieddate ?? r.updatedAt,
    }));
  }

  async fetchOrganisations(_since?: string, limit = 100): Promise<CrmOrganisation[]> {
    const data = await this.get<HubSpotPage<HubSpotCompany>>(
      '/crm/v3/objects/companies',
      { limit: String(limit), properties: 'name,domain,industry,country' }
    );
    return data.results.map(r => ({
      externalId: r.id,
      name: r.properties.name ?? '(unnamed)',
      domain: r.properties.domain ?? null,
      industry: r.properties.industry ?? null,
      region: r.properties.country ?? null,
      lastModifiedExternal: r.updatedAt,
    }));
  }

  async fetchOpportunities(_since?: string, limit = 100): Promise<CrmOpportunity[]> {
    const data = await this.get<HubSpotPage<HubSpotDeal>>(
      '/crm/v3/objects/deals',
      {
        limit: String(limit),
        properties: 'dealname,dealstage,amount,deal_currency_code,closedate',
        associations: 'contacts,companies',
      }
    );
    return data.results.map(r => ({
      externalId: r.id,
      name: r.properties.dealname ?? '(unnamed deal)',
      stage: r.properties.dealstage ?? 'unknown',
      amount: r.properties.amount ? parseFloat(r.properties.amount) : null,
      currency: r.properties.deal_currency_code ?? null,
      closeDate: r.properties.closedate ?? null,
      primaryContactExternalId: r.associations?.contacts?.results?.[0]?.id ?? null,
      organisationExternalId: r.associations?.companies?.results?.[0]?.id ?? null,
      lastModifiedExternal: r.updatedAt,
    }));
  }
}
