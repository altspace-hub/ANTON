# `hardware-project` — Hardware Project

> **Family:** Hardware
> **Purpose:** Per-project workspace export — phases, BoM, firmware, signoffs.
> **Typical transport:** AAP, Marketplace.

## Content directory layout

```text
manifest.json
contents/hw-projects/<project-id>/
```

## Apply behaviour

Imports as a new project; preserves phase + signoff history.

## Signing

Recommended.

## Related

- Service: `server/services/anton-importer.ts`
- Tables: `hardware_projects`, `hardware_project_phases`
- Architecture: [`/docs/marketing/tier5-hardware-build.md`](../../marketing/tier5-hardware-build.md)
