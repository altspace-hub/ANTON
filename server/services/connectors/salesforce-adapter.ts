/**
 * salesforce-adapter.ts — Salesforce REST API read-side adapter.
 *
 * Implements the CrmAdapter shape from crm-adapter.ts. Read-only in v1
 * (per ANTON_Improvement_and_Investigation_Brief.md §E.5). Bidirectional
 * sync is explicitly out of scope.
 *
 * Auth: OAuth 2.0. Caller resolves credentials (typically via
 * connection-manager.ts or credential-vault.ts) and passes the access token.
 *
 * Salesforce SOQL queries used (Standard Edition objects):
 *   - Account     → CrmOrganisation
 *   - Contact     → CrmContact
 *   - Opportunity → CrmOpportunity
 */

import type {
  CrmAdapter, CrmAdapterCredentials, CrmContact, CrmOpportunity, CrmOrganisation,
} from './crm-adapter.js';

interface SalesforceQueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

interface SalesforceContact {
  Id: string;
  Email: string | null;
  FirstName: string | null;
  LastName: string | null;
  Phone: string | null;
  AccountId: string | null;
  LastModifiedDate: string;
}

interface SalesforceAccount {
  Id: string;
  Name: string;
  Website: string | null;
  Industry: string | null;
  BillingCountry: string | null;
  LastModifiedDate: string;
}

interface SalesforceOpportunity {
  Id: string;
  Name: string;
  StageName: string;
  Amount: number | null;
  CurrencyIsoCode: string | null;
  CloseDate: string | null;
  Account: { Id: string } | null;
  Contact: { Id: string } | null;
  LastModifiedDate: string;
}

export class SalesforceAdapter implements CrmAdapter {
  readonly provider = 'salesforce' as const;
  private baseUrl: string;
  private accessToken: string;

  constructor(creds: CrmAdapterCredentials) {
    if (!creds.baseUrl) throw new Error('Salesforce baseUrl required (instance URL)');
    if (!creds.accessToken) throw new Error('Salesforce accessToken required');
    this.baseUrl = creds.baseUrl.replace(/\/$/, '');
    this.accessToken = creds.accessToken;
  }

  private async query<T>(soql: string): Promise<T[]> {
    const url = `${this.baseUrl}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!r.ok) throw new Error(`Salesforce query failed: ${r.status} ${r.statusText}`);
    const data = await r.json() as SalesforceQueryResult<T>;
    return data.records;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/services/data/v60.0/`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      return r.ok;
    } catch { return false; }
  }

  async fetchContacts(since?: string, limit = 200): Promise<CrmContact[]> {
    const where = since ? `WHERE LastModifiedDate >= ${since}` : '';
    const soql = `SELECT Id, Email, FirstName, LastName, Phone, AccountId, LastModifiedDate FROM Contact ${where} LIMIT ${limit}`;
    const rows = await this.query<SalesforceContact>(soql);
    return rows.map(r => ({
      externalId: r.Id,
      email: r.Email,
      firstName: r.FirstName,
      lastName: r.LastName,
      phone: r.Phone,
      organisationExternalId: r.AccountId,
      lastModifiedExternal: r.LastModifiedDate,
    }));
  }

  async fetchOrganisations(since?: string, limit = 200): Promise<CrmOrganisation[]> {
    const where = since ? `WHERE LastModifiedDate >= ${since}` : '';
    const soql = `SELECT Id, Name, Website, Industry, BillingCountry, LastModifiedDate FROM Account ${where} LIMIT ${limit}`;
    const rows = await this.query<SalesforceAccount>(soql);
    return rows.map(r => ({
      externalId: r.Id,
      name: r.Name,
      domain: r.Website,
      industry: r.Industry,
      region: r.BillingCountry,
      lastModifiedExternal: r.LastModifiedDate,
    }));
  }

  async fetchOpportunities(since?: string, limit = 200): Promise<CrmOpportunity[]> {
    const where = since ? `WHERE LastModifiedDate >= ${since}` : '';
    const soql = `SELECT Id, Name, StageName, Amount, CurrencyIsoCode, CloseDate, Account.Id, Contact.Id, LastModifiedDate FROM Opportunity ${where} LIMIT ${limit}`;
    const rows = await this.query<SalesforceOpportunity>(soql);
    return rows.map(r => ({
      externalId: r.Id,
      name: r.Name,
      stage: r.StageName,
      amount: r.Amount,
      currency: r.CurrencyIsoCode,
      closeDate: r.CloseDate,
      primaryContactExternalId: r.Contact?.Id ?? null,
      organisationExternalId: r.Account?.Id ?? null,
      lastModifiedExternal: r.LastModifiedDate,
    }));
  }
}
