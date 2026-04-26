# `coding-blueprint` — Coding Blueprint

> **Family:** Coding
> **Purpose:** Architectural blueprint for a software project — discovery summary + architecture + persona panel critiques.
> **Typical transport:** Marketplace, AAP, local.

## Content directory layout

```text
manifest.json
contents/blueprints/<blueprint-id>/
  ├── discovery-summary.md
  ├── architecture.md
  └── critiques/
      ├── security-analyst.md
      ├── compliance.md
      ├── product-manager.md
      └── solutions-architect.md
```

## Apply behaviour

Imports as a Coding Tier-4 starting point. The receiver can step into Stage 2 (Architecture review) directly.

## Signing

Optional. Recommended when sharing across orgs.

## Related

- Service: `server/services/anton-importer.ts`

- Architecture: [`/docs/architecture/25-coding-area.md`](../../architecture/25-coding-area.md)
