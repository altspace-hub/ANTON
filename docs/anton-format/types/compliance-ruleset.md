# `compliance-ruleset` — Compliance Ruleset

> **Family:** Governance
> **Purpose:** Compliance-as-code rules (delegation rules, approval gates, evaluation criteria).
> **Typical transport:** Marketplace, AAP.

## Content directory layout

```text
manifest.json
contents/compliance/<ruleset-id>/rules.yaml
```

## Apply behaviour

Inserts into `delegation_compliance_rules`. Active flag defaults to false — explicit enable required.

## Signing

Recommended.

## Related

- Service: `server/services/delegation-compliance-service.ts`
- Tables: `delegation_compliance_rules`
- Architecture: [`/docs/architecture/20f-database-compliance.md`](../../architecture/20f-database-compliance.md)
