# f-53-future-pillars — Procure / Civic / Grow

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`); refreshed 2026-04-26 PM after E.5 (Salesforce + HubSpot adapters).

**E.5 closure (refined post-second-take):** `server/services/connectors/{crm-adapter,salesforce-adapter,hubspot-adapter}.ts` ship the read-side scaffolding for both CRMs. Common `CrmAdapter` interface ensures parity. The apply path uses the **real Grow column names** (`first_name`, `value`, `expected_close_date`, etc. — second-take review caught the original placeholder names) and the new `external_provider` / `external_id` / `owned_by_anton` / `last_modified_external` columns added in **migration 169** (`server/db/migrations-pg/169_grow_crm_external_columns.sql`). Composite unique indexes on `(external_provider, external_id)` back the upserts. **Salesforce + HubSpot promoted from 📋 → 🟢** for the read-side; bidirectional write-back remains 📋. Dynamics 365 + Pipedrive remain 📋.
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Document type:** Pillar deep-dive. Procure / Civic / Grow are **all built ✅** (per audit) but treated as a future-state diagram per the brief because their full enterprise-grade scope (especially Grow's three-tier model with external CRM connectors) is still maturing.
**Maintainer note:** Regenerate when Grow connectors ship (Salesforce / HubSpot / Dynamics 365 / Pipedrive), when Civic adds new processes, or when Procure adds new evaluation methods.

Three pillars, each domain-specific, each path-routed (not in `AppMode` toggle — see `_audit-notes.md` §6 D1).

## Diagram — Procure pillar

```mermaid
flowchart TD
  classDef ui fill:#1E3A8A,stroke:#93C5FD,color:#EFF6FF
  classDef svc fill:#0F766E,stroke:#5EEAD4,color:#F0FDFA
  classDef store fill:#581C87,stroke:#D8B4FE,color:#FAF5FF

  ProcUI["ProcurePage / ProcureCyclePage<br/>(/procure · /procure/cycle/:id)"]:::ui
  ProcSvc["procure-service.ts"]:::svc

  ProcUI --> ProcSvc

  ProcSvc --> Cycle[procure_cycles]:::store
  ProcSvc --> Req[procure_requirements]:::store
  ProcSvc --> Vend[procure_vendors]:::store
  ProcSvc --> Crit[procure_criteria]:::store
  ProcSvc --> Eval[procure_evaluations]:::store
  ProcSvc --> Doc[procure_documents]:::store
  ProcSvc --> Cont[procure_contracts]:::store

  Cycle -->|phases| Req
  Cycle --> Vend
  Vend --> Eval
  Crit --> Eval
  Eval --> Cont
  Doc -.-> Cycle
```

## Diagram — Civic pillar

```mermaid
flowchart TD
  classDef ui fill:#1E3A8A,stroke:#93C5FD,color:#EFF6FF
  classDef svc fill:#0F766E,stroke:#5EEAD4,color:#F0FDFA
  classDef store fill:#581C87,stroke:#D8B4FE,color:#FAF5FF

  CivicUI["CivicPage / CivicEngagementPage<br/>(/civic · /civic/engagement/:id)"]:::ui
  CivicSvc["civic-service.ts"]:::svc

  CivicUI --> CivicSvc

  CivicSvc --> CEng[civic_engagements]:::store
  CivicSvc --> CProc[civic_processes]:::store
  CivicSvc --> CElig[civic_eligibility_checks]:::store
  CivicSvc --> CDoc[civic_documents]:::store
  CivicSvc --> CSub[civic_submissions]:::store
  CivicSvc --> CKP[civic_knowledge_packs]:::store

  CKP --> CProc
  CEng --> CProc
  CProc --> CElig
  CElig --> CDoc
  CDoc --> CSub
```

## Diagram — Grow pillar (three-tier intelligence model)

```mermaid
flowchart TD
  classDef ui fill:#1E3A8A,stroke:#93C5FD,color:#EFF6FF
  classDef svc fill:#0F766E,stroke:#5EEAD4,color:#F0FDFA
  classDef store fill:#581C87,stroke:#D8B4FE,color:#FAF5FF
  classDef tier fill:#7C2D12,stroke:#FDBA74,color:#FFF7ED
  classDef partial stroke-dasharray: 5 3

  GrowUI["GrowPage / GrowContacts /<br/>GrowOrganisations / GrowPipeline /<br/>GrowOpportunity"]:::ui
  GrowSvc["grow-service.ts"]:::svc

  GrowUI --> GrowSvc

  GrowSvc --> GContact[grow_contacts]:::store
  GrowSvc --> GOrg[grow_organisations]:::store
  GrowSvc --> GPipe[grow_pipeline_stages]:::store
  GrowSvc --> GOpp[grow_opportunities]:::store
  GrowSvc --> GAct[grow_activities]:::store
  GrowSvc --> GBrief[grow_briefings]:::store
  GrowSvc --> GInter[grow_interactions]:::store
  GrowSvc --> GRel[grow_relationships]:::store
  GrowSvc --> GSig[grow_signals]:::store

  subgraph Tiers["Three-tier deployment model (per CLAUDE.md / spec)"]
    direction TB
    T1["Tier 1 — Standalone<br/>ANTON CRM out-of-the-box"]:::tier
    T2["Tier 2 — Intelligence Overlay<br/>(read external CRM, suggest only)"]:::tier
    T3["Tier 3 — Hybrid<br/>(bidirectional sync with external CRM)"]:::tier
  end

  GrowSvc -. T1 .-> Standalone[Standalone use ✅]
  Tiers -. priority connectors 📋 .-> Connectors

  subgraph Connectors["Connector backlog (📋)"]
    direction TB
    SF["Salesforce 📋"]
    HS["HubSpot 📋"]
    MS["Dynamics 365 📋"]
    PD["Pipedrive 📋"]
  end

  Connectors -. via integrations/ + db-drivers/ .-> GrowSvc
```

## Persistence summary

| Pillar | Tables (count) | Key migrations |
|---|---|---|
| Procure | 7 (`procure_cycles`, `procure_requirements`, `procure_vendors`, `procure_criteria`, `procure_evaluations`, `procure_documents`, `procure_contracts`) | `091_procure_pillar.sql` |
| Civic | 6 (`civic_engagements`, `civic_processes`, `civic_eligibility_checks`, `civic_documents`, `civic_submissions`, `civic_knowledge_packs`) | `092_civic_pillar.sql` |
| Grow | 9 (`grow_contacts`, `grow_organisations`, `grow_pipeline_stages`, `grow_opportunities`, `grow_activities`, `grow_briefings`, `grow_interactions`, `grow_relationships`, `grow_signals`) | `093_grow_pillar.sql` |

## Mission integration (Grow)

`server/db/migrations-pg/122_missions_grow_bridge.sql` wires Missions to push activity into `grow_signals` + `grow_interactions`. Outreach missions create durable Grow trail.

## Source-of-truth references

- `server/services/procure-service.ts`, `civic-service.ts`, `grow-service.ts`.
- `server/routes/procure.ts`, `civic.ts`, `grow.ts`.
- `src/pages/procure/{ProcurePage,ProcureCyclePage}.tsx`.
- `src/pages/civic/{CivicPage,CivicEngagementPage}.tsx`.
- `src/pages/grow/{GrowPage,GrowContactsPage,GrowOrganisationsPage,GrowPipelinePage,GrowOpportunityPage}.tsx`.
- `src/components/layout/Sidebar.tsx:351–353` — path-based mode detection (these pillars use isProcureMode/isCivicMode/isGrowMode).
- `server/db/migrations-pg/091_procure_pillar.sql`, `092_civic_pillar.sql`, `093_grow_pillar.sql`, `122_missions_grow_bridge.sql`.
- `_audit-notes.md` §2, §6 D1 — pillar status + path-routing discrepancy.

## Open questions

- **Grow connectors** — which connector ships first (Salesforce vs HubSpot)? Each is non-trivial: `connection-manager.ts` + `db-drivers/` + per-vendor schema mapping.
- **Civic country packs** — `civic_knowledge_packs` is per-jurisdiction; rollout cadence (which countries) is a roadmap decision.
- **Procure compliance hooks** — link to `delegation_compliance_rules` for spend-threshold gates not investigated.
- **AppMode promotion** — should Procure / Civic / Grow be added to the `AppMode` toggle? Architectural decision for the team.

## Related diagrams

- `03-pillar-topology` — these are the path-routed pillars.
- `30-aap-protocol` — Civic-pack distribution between consenting peers.
- `20c-database-workflows.md` — Missions integration with Grow signals.
