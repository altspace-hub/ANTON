# `evidence-pack` — Evidence Pack

> **Family:** Compliance
> **Purpose:** Signed audit-trail bundle for regulator / external-auditor sharing.
> **Typical transport:** AAP, Marketplace, local.

## Content directory layout

```text
manifest.json
contents/evidence-pack/<pack-id>/
  ├── pack.json
  ├── items/
  │   ├── sessions/
  │   ├── module-outputs/
  │   ├── attachments/
  │   └── citations/
  └── signatures.jsonl
```

## Apply behaviour

Inserts into `evidence_packs` + `evidence_pack_items`. Per-item signatures verified independently.

## Signing

REQUIRED — signing is the entire point.

## Related

- Service: `server/services/anton-importer.ts`
- Tables: `evidence_packs`, `evidence_pack_items`, `evidence_pack_compliance_gaps`
- Architecture: [`/docs/architecture/20f-database-compliance.md`](../../architecture/20f-database-compliance.md)
