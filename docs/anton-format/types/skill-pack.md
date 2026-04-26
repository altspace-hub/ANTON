# `skill-pack` — Skill Pack

> **Family:** Work-pillar core
> **Purpose:** Curated bundle of modules + workflows + skills, distributed as a single unit.
> **Typical transport:** Marketplace, AAP.

## Content directory layout

```text
manifest.json
contents/skill-packs/<pack-id>/
  ├── modules/
  ├── workflows/
  ├── skills/
  └── personas/
```

## Apply behaviour

Iterates each contained type and applies via the type-specific importer. Atomic — if any sub-import fails, the whole pack is rolled back.

## Signing

Recommended.

## Related

- Service: `server/services/anton-importer.ts`
- Architecture: [`/docs/architecture/32-anton-bundle-format.md`](../../architecture/32-anton-bundle-format.md)
