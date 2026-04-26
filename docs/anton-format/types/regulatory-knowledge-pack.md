# `regulatory-knowledge-pack` — Regulatory Knowledge Pack

> **Family:** Knowledge
> **Purpose:** Curated regulatory knowledge — frameworks, case law, guidance, templates — bundled per jurisdiction.
> **Typical transport:** Marketplace, AAP.

## Content directory layout

```text
manifest.json
contents/knowledge-packs/<pack-id>/
  ├── pack.json
  ├── documents/
  ├── citations/
  └── templates/
```

## Apply behaviour

Inserts into `regulatory_knowledge_packs` + `knowledge_pack_documents`. Active flag defaults to false.

## Signing

Strongly recommended — packs travel between organisations.

## Related

- Service: `server/services/knowledge-pack-service.ts`
- Tables: `regulatory_knowledge_packs`, `knowledge_pack_documents`
- Architecture: [`/docs/architecture/20b-database-knowledge.md`](../../architecture/20b-database-knowledge.md)
