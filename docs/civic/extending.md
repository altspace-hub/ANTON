# Extending Civic

> How to add a new process pack, a new eligibility-rule kind, a new engagement phase, or a new jurisdiction.

---

## Add a new process pack

Three options:

### Option 1: SQL seed in a new migration

Add rows to `civic_process_packs` and `civic_eligibility_rules` in a new migration. Pattern matches the seeds in mig 170.

### Option 2: Programmatic via API

```bash
POST /api/civic/process-packs
Content-Type: application/json

{
  "id": "se-business-reg",
  "name": "Sweden — Business registration (Bolagsverket)",
  "jurisdiction": "SE",
  "authority": "Bolagsverket",
  "domain": "business_registration",
  "version": "1.0.0",
  "source_url": "https://bolagsverket.se/"
}
```

Then add rules separately via the (📋 future) rule-registration endpoint.

### Option 3: Import a `.anton civic-process-pack` bundle (📋 future)

Bundle type to be added to `BundleType` union when packs become a marketplace category. Until then use options 1 or 2.

---

## Add a new eligibility-rule kind

See [`eligibility-rules.md`](eligibility-rules.md) "Adding a new condition kind". Three steps: extend CHECK constraint → implement case → document.

The bar is deterministic JSON evaluation. LLM-evaluated rules go through `custom_predicate` with the rationale produced by an external service.

---

## Add a new engagement phase

Engagement phase is `civic_engagements.phase` enum:

```sql
phase IN ('situation', 'mapping', 'eligibility', 'gap', 'complete', 'track')
```

To add (e.g.) `appeal` between `track` and a terminal:

1. Extend the CHECK constraint via a new migration.
2. Update `civic-service.ts` phase-transition logic.
3. Surface in `CivicEngagementPage` workflow UI.

Phase additions should be additive — existing engagements in older phases continue to work.

---

## Add a new jurisdiction

Adding a jurisdiction means seeding at least one process pack for it. Per [`/docs/missions/use-cases/`](../missions/use-cases/) and [`/docs/school/extending.md`](../school/extending.md), follow the canonical-source-link discipline:

1. Identify the jurisdiction's canonical-source URLs for the processes you're adding.
2. Author the pack manifest (id, name, jurisdiction, authority, domain, version).
3. Author rules with `source_url` pointing at canonical publications.
4. Test with realistic applicant contexts.

---

## Anti-patterns

- **Don't bypass the eligibility evaluator.** The deterministic engine is the audit-defensibility commitment. Generated text saying "I think you're eligible" is not the product.
- **Don't hard-code jurisdiction-specific logic in service code.** Put it in the pack as data (rules / processes / documents). Keeps the service jurisdiction-agnostic.
- **Don't truncate the `source_url`.** Every rule cites its source. A regulator asking "where does this rule come from" must get a one-click answer.
- **Don't auto-submit on the user's behalf.** Civic touches government processes — every submission requires explicit user confirmation regardless of trust phase.

---

*Maintained alongside `server/services/civic-*.ts`. Refresh when a new pack family or rule kind ships.*
