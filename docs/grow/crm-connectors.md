# CRM Connectors

> The connector layer that powers Grow's Tier 2 (Intelligence Overlay) deployment. Today: Salesforce + HubSpot read-side. Roadmap: Dynamics 365, Pipedrive, then Tier 3 write-back across all four.

---

## The common interface (`crm-adapter.ts`)

Every connector implements:

```ts
interface CrmAdapter {
  provider: CrmProvider;                                    // 'salesforce' | 'hubspot'
  fetchContacts(since?: string, limit?: number): Promise<CrmContact[]>;
  fetchOrganisations(since?: string, limit?: number): Promise<CrmOrganisation[]>;
  fetchOpportunities(since?: string, limit?: number): Promise<CrmOpportunity[]>;
  healthCheck(): Promise<boolean>;
}
```

The unified `Crm{Contact, Organisation, Opportunity}` shapes (defined in `crm-adapter.ts`) are what the apply path consumes. Each connector's job is to translate the provider's API into these shapes.

The `applyCrmSync()` function in `crm-adapter.ts`:

1. Inserts organisations first (so contact FKs resolve)
2. For each row in each entity: checks `owned_by_anton` flag — if `TRUE`, skips
3. Else: upserts on `(external_provider, external_id)` composite unique index
4. Returns a `SyncResult` with imported / skipped / error counts per entity type

---

## Salesforce (`salesforce-adapter.ts`)

| Property | Value |
|---|---|
| API version | v60 (REST + SOQL) |
| Auth | OAuth 2.0 (Authorization Code or JWT Bearer) |
| Salesforce object → unified shape | `Account` → `CrmOrganisation`, `Contact` → `CrmContact`, `Opportunity` → `CrmOpportunity` |
| Endpoints | `/services/data/v60.0/query?q=<SOQL>` |
| Required credential fields | `accessToken` + `baseUrl` (instance URL like `https://yourorg.my.salesforce.com`) |
| Optional | `refreshToken` (for long-lived sync) |

SOQL field selection per entity:

```sql
-- Contact
SELECT Id, Email, FirstName, LastName, Phone, AccountId, LastModifiedDate FROM Contact
-- Account
SELECT Id, Name, Website, Industry, BillingCountry, LastModifiedDate FROM Account
-- Opportunity
SELECT Id, Name, StageName, Amount, CurrencyIsoCode, CloseDate, Account.Id, Contact.Id, LastModifiedDate FROM Opportunity
```

`since` parameter adds `WHERE LastModifiedDate >= <ISO>` — incremental sync is built in.

---

## HubSpot (`hubspot-adapter.ts`)

| Property | Value |
|---|---|
| API version | CRM API v3 |
| Auth | OAuth 2.0 OR Private App access token |
| HubSpot object → unified shape | `companies` → `CrmOrganisation`, `contacts` → `CrmContact`, `deals` → `CrmOpportunity` |
| Endpoints | `/crm/v3/objects/{contacts,companies,deals}` |
| Required credential fields | `accessToken` |
| Optional | `baseUrl` (defaults to `https://api.hubapi.com`) |

HubSpot's property model differs from Salesforce — properties are explicitly listed in each request:

```
GET /crm/v3/objects/contacts?properties=email,firstname,lastname,phone,associatedcompanyid,lastmodifieddate
```

Deals are fetched with `?associations=contacts,companies` so the primary contact + organisation associations resolve.

---

## Adding a new CRM connector

The `CrmAdapter` interface is the contract. To add (e.g.) Dynamics 365 or Pipedrive:

### 1. Create the adapter file

`server/services/connectors/<provider>-adapter.ts`. Implement `CrmAdapter`:

```ts
export class DynamicsAdapter implements CrmAdapter {
  readonly provider = 'dynamics365' as const;
  private accessToken: string;
  private baseUrl: string;

  constructor(creds: CrmAdapterCredentials) {
    if (!creds.accessToken) throw new Error('Dynamics accessToken required');
    if (!creds.baseUrl) throw new Error('Dynamics baseUrl required');
    this.accessToken = creds.accessToken;
    this.baseUrl = creds.baseUrl.replace(/\/$/, '');
  }

  async healthCheck(): Promise<boolean> { /* ... */ }
  async fetchContacts(since?, limit?): Promise<CrmContact[]> { /* ... */ }
  async fetchOrganisations(since?, limit?): Promise<CrmOrganisation[]> { /* ... */ }
  async fetchOpportunities(since?, limit?): Promise<CrmOpportunity[]> { /* ... */ }
}
```

### 2. Add to `CrmProvider` union

```ts
// crm-adapter.ts
export type CrmProvider = 'salesforce' | 'hubspot' | 'dynamics365' | 'pipedrive';
```

The composite unique constraint on Grow tables already accepts any string for `external_provider` — no schema change.

### 3. Register the auth + credential schema

Document expected credential shape in [`README.md`](README.md) "External provider authentication" table.

### 4. Add to the Tier 2 status

Update [`/docs/marketing/grow.md`](../marketing/grow.md) connector status (📋 → 🟢 → ✅).

### 5. Add tests

`tests/services/connectors/dynamics-adapter.test.ts` — at minimum a contract test for each fetch method.

---

## Tier 3 write-back (📋 roadmap)

The current architecture is read-only by deliberate scope. Adding write-back requires:

- **Provider write methods** on each adapter (`createContact`, `updateContact`, …)
- **Conflict-resolution policy** — last-modified-wins is the default; explicit override per-record via the `owned_by_anton` flag (already in schema)
- **Sync direction tagging** — each write needs to be tagged with originating system to prevent infinite update loops
- **Webhook/polling** — for receiving external changes (push notification or scheduled poll)

The `CrmAdapter` interface will extend additively. Existing read-side code paths won't change.

---

## Where to look

- **Code:** `server/services/connectors/`
- **Schema:** `server/db/migrations-pg/169_grow_crm_external_columns.sql`
- **Strategic positioning:** [`/docs/marketing/grow.md`](../marketing/grow.md)

---

*Refresh when a new connector ships or when the Tier 3 write-back model lands.*
