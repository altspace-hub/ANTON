# Grow

> ANTON's CRM + business-development pillar. Five-page UI on a 9-table schema, with the **three-tier deployment model** (standalone / intelligence-overlay / hybrid-sync) as its strategic shape.

---

## Quick map

| If you want to… | Read |
|---|---|
| Understand the strategic positioning | [`/docs/marketing/grow.md`](../marketing/grow.md) |
| Add a new CRM connector | [`crm-connectors.md`](crm-connectors.md) |
| Extend Grow with new pages / signals | [`extending.md`](extending.md) |
| See the architecture | [`/docs/architecture/future/f-53-future-pillars.md`](../architecture/future/f-53-future-pillars.md) |

---

## Service surface

| File | Responsibility |
|---|---|
| `server/services/grow-service.ts` | Core pillar service — CRUD + signal detection + briefing generation |
| `server/services/connectors/crm-adapter.ts` | Common `CrmAdapter` interface; apply-path with `owned_by_anton` opt-out |
| `server/services/connectors/salesforce-adapter.ts` | Salesforce REST API v60 read-side adapter |
| `server/services/connectors/hubspot-adapter.ts` | HubSpot CRM v3 read-side adapter |
| `server/routes/grow.ts` | REST surface |

The pillar is intentionally services-light because Grow shares infrastructure with Work (modules), Missions (outbound automation), and Specialized Agents (per-account agents). Grow's contribution is the **three-tier model + connector abstraction + signal detection**, not parallel infrastructure.

---

## Pages

5 pages in `src/pages/grow/`:

| Page | Purpose |
|---|---|
| `GrowPage` | Per-org dashboard — pipeline summary, recent signals, upcoming actions |
| `GrowContactsPage` | Contacts list + detail (filter by tag, org, last contact) |
| `GrowOrganisationsPage` | Organisations list + detail |
| `GrowPipelinePage` | Visual pipeline view (stages → opportunities → counts + value) |
| `GrowOpportunityPage` | Per-opportunity detail (activities, briefings, decisions) |

---

## Schema

| Migration | Tables introduced |
|---|---|
| `093_grow_pillar.sql` | `grow_contacts`, `grow_organisations`, `grow_opportunities`, `grow_pipeline_stages`, `grow_activities`, `grow_briefings`, `grow_interactions`, `grow_relationships`, `grow_signals` |
| `122_missions_grow_bridge.sql` | Bridge — Missions write activity into `grow_signals` and `grow_interactions` |
| `169_grow_crm_external_columns.sql` | `external_provider`, `external_id`, `owned_by_anton`, `last_modified_external` columns + composite unique indexes; enables the CRM adapters |

---

## The three tiers

### Tier 1 — Standalone CRM

Grow IS the CRM. No external connector. All data created + edited in Grow's UI; persisted in `grow_*` tables. Suitable for solo operators, small consultancies, anyone without an existing CRM.

### Tier 2 — Intelligence Overlay (read-side, today)

External CRM (Salesforce / HubSpot) remains source of truth. Grow's connector reads contacts / orgs / opportunities and upserts into Grow tables with `external_provider` + `external_id` set. AI signals + briefings + analytics happen on top of the imported data. Conflict resolution: external wins on read; user can mark a Grow row `owned_by_anton = TRUE` to opt out of overwrite.

### Tier 3 — Hybrid Sync (📋 roadmap)

Bidirectional. Grow writes back to the external CRM. Conflict resolution becomes a serious topic — likely modeled on a "last-modified-wins with explicit override" pattern.

---

## Mission integration

The bridge in mig 122 lets Missions write activity into Grow's signals + interactions tables. Pattern:

1. A Mission (e.g. Outbound Sales Machine, when seeded) sends an outreach email
2. The mission writes a row to `grow_interactions` (with the contact_id + interaction_type + content reference)
3. Optionally writes a `grow_signals` row if the action implies a signal (e.g. "lead engaged with content X")
4. `GrowOpportunityPage` surfaces both human + mission activities in one timeline

This is what makes the (📋) Outbound Sales Machine concrete — the mechanics are already in place.

---

## How a Salesforce import flows

1. User adds a Salesforce credential to the Credential Vault.
2. User configures the Salesforce connector at `/grow/settings` (vault credential reference, sync cadence).
3. `salesforce-adapter.ts` queries Salesforce SOQL (`Account`, `Contact`, `Opportunity`).
4. Apply path (`crm-adapter.ts`):
   - Inserts orgs first (so contact FKs resolve)
   - For each row: checks `owned_by_anton` — skips if true; else upserts on `(external_provider, external_id)`
5. Counts returned: `{contactsImported, organisationsImported, opportunitiesImported, ... contactsSkipped, ... errors}`

Same flow for HubSpot via `hubspot-adapter.ts` (HubSpot CRM v3 endpoints).

---

## Where to start

- **Try it:** `/grow` (dashboard).
- **Code:** `server/services/grow-service.ts`, `server/services/connectors/`.
- **Marketing:** [`/docs/marketing/grow.md`](../marketing/grow.md).
- **Connectors:** [`crm-connectors.md`](crm-connectors.md).
- **Extending:** [`extending.md`](extending.md).

---

*Refresh when Tier 3 ships, when a new connector lands, or when mission-bridge expands.*
