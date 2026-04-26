# Grow — One-Pager

> **What it is:** ANTON's CRM + business-development pillar. Standalone Contacts / Organisations / Pipeline / Opportunities surface, with optional bidirectional integration to Salesforce + HubSpot (read-side shipped; write-side roadmap).
> **Who it's for:** small businesses without a CRM, consultancies bridging a CRM with their AI workspace, and anyone wanting AI-native pipeline + signals on top of their existing CRM data.
> **What makes it different:** **three-tier deployment model** — pure standalone, intelligence-overlay on an external CRM, or hybrid two-way sync. One pillar, three shapes, depending on where the buyer is in their CRM journey.

---

## The pitch

Most "AI for CRM" tools are bolt-ons to one specific CRM (Salesforce-only, HubSpot-only). They lock you in. They duplicate your contact data into a second silo. They don't integrate with the AI workspace where most modern knowledge work happens.

ANTON's Grow pillar is shaped differently:

- **Tier 1 — Standalone CRM.** If you have no CRM, Grow IS your CRM. Five surfaces (Contacts, Organisations, Pipeline, Opportunities, Briefings), no external dependency.
- **Tier 2 — Intelligence Overlay.** If you have Salesforce or HubSpot, Grow reads from them and adds AI-driven signals + briefings + relationship analytics on top. Your CRM remains the source of truth.
- **Tier 3 — Hybrid Sync.** Two-way sync with external CRM. Grow becomes a peer surface; data flows both directions; conflict resolution favours external on read but lets users mark records as "owned by ANTON" to opt out of overwrite.

Today: Tier 1 ✅, Tier 2 🟢 (read-side adapters for Salesforce + HubSpot shipped per E.5), Tier 3 📋.

---

## What you can do today

| Surface | What it does |
|---|---|
| `/grow` GrowPage | Per-org dashboard — pipeline summary, recent signals, upcoming actions |
| `/grow/contacts` GrowContactsPage | Contacts list + detail; filter by tag, organisation, last contact |
| `/grow/organisations` GrowOrganisationsPage | Organisations list + detail; industry, size, regulatory context |
| `/grow/pipeline` GrowPipelinePage | Visual pipeline (stages → opportunities → counts + value) |
| `/grow/opportunity/:id` GrowOpportunityPage | Per-opportunity detail; activities, briefings, decisions |

Five pages; 9-table schema (mig 093 + 169); 1 dedicated service (`grow-service.ts`) plus the CRM connectors (`salesforce-adapter.ts`, `hubspot-adapter.ts`, common `crm-adapter.ts`).

---

## CRM connectors (the Tier 2 wedge)

`server/services/connectors/`:

| File | Responsibility |
|---|---|
| `crm-adapter.ts` | Common `CrmAdapter` interface + apply-path with `owned_by_anton` opt-out |
| `salesforce-adapter.ts` | Salesforce REST API v60 read-side (Contact, Account, Opportunity → Grow) |
| `hubspot-adapter.ts` | HubSpot CRM API v3 read-side (Contact, Company, Deal → Grow) |

The apply path uses the **real Grow column names** (`first_name`, `value`, `expected_close_date`, etc.) and writes to columns added in migration 169 (`external_provider`, `external_id`, `owned_by_anton`, `last_modified_external`). Composite unique indexes on `(external_provider, external_id)` back the upserts.

Auth: OAuth 2.0 (Salesforce) or OAuth / Private App (HubSpot). Credentials live in the per-instance Credential Vault — never in the connector code.

---

## Mission integration

Migration 122 (`missions_grow_bridge.sql`) wires the Missions pillar to Grow:

- Outbound mission tasks write activity into `grow_signals` (e.g. "we sent 50 outreach emails to lead X's domain")
- `grow_interactions` records the touchpoints the mission produced
- `GrowOpportunityPage` surfaces these mission-driven activities alongside human-driven ones

This is how the (📋 coming-soon) **Outbound Sales Machine** mission integrates: the Mission orchestrates the outreach; Grow records the result; the human sees both in one timeline.

---

## Per-table schema

| Table | Rows |
|---|---|
| `grow_contacts` (mig 093) | One per contact; FK to `grow_organisations.id`; tags array; `owned_by_anton` opt-out (mig 169) |
| `grow_organisations` | One per org; industry, size enum, headquarters, regulatory context, notes |
| `grow_opportunities` | One per opportunity; FK to contact + org + stage; value, currency, probability, expected close |
| `grow_pipeline_stages` | One per pipeline stage; ordered (`prospect`, `qualification`, …) |
| `grow_activities` | Per-activity (calls, emails, meetings) |
| `grow_briefings` | AI-generated per-org / per-contact / per-opportunity briefings |
| `grow_interactions` | Discrete interaction events (more granular than activities) |
| `grow_relationships` | Multi-party relationships (e.g. introducer → introduced) |
| `grow_signals` | Detected signals (renewal, expansion, attrition risk) |

All schema is in mig 093 + 169.

---

## Why this matters strategically

The CRM market is enormous. Most challengers fail because they assume buyers want to migrate. They don't — they want intelligence on top of what they have.

Grow's three-tier model meets buyers where they are:

- **Salesforce-shop** wants AI signals on their existing data → Tier 2 today.
- **No-CRM small business** wants to start with something that won't lock them in → Tier 1 today; can graduate to Tier 2 if they later adopt an external CRM.
- **Mid-market in transition** wants to consolidate → Tier 3 (roadmap).

The connector-shaped architecture means adding **Dynamics 365 + Pipedrive** is a straightforward extension (📋 next; the `CrmAdapter` interface is already abstract).

---

## Where to look

- **Try it:** `/grow` (dashboard), `/grow/contacts`, `/grow/pipeline`.
- **Code:** `server/services/grow-service.ts`, `server/services/connectors/{crm-adapter,salesforce-adapter,hubspot-adapter}.ts`, `server/routes/grow.ts`.
- **Docs:** [`/docs/grow/`](../grow/).
- **Architecture:** [`/docs/architecture/future/f-53-future-pillars.md`](../architecture/future/f-53-future-pillars.md).
- **Schema:** mig 093 + 169.

---

*Refresh when a new connector ships (Dynamics 365, Pipedrive), when Tier 3 (bidirectional sync) lands, or when the three-tier model evolves.*
