# `lifecycle-advisory-bundle` — Lifecycle Advisory Bundle

> **Family:** Hardware
> **Purpose:** Lifecycle event + impact assessment for fielded hardware.
> **Typical transport:** AAP, Marketplace.

## Content directory layout

```text
manifest.json
contents/lifecycle/<advisory-id>/
  ├── event.json
  └── impact.json
```

## Apply behaviour

Inserts into `lifecycle_events` + `lifecycle_event_project_impacts`.

## Signing

Recommended.

## Related

- Service: `server/services/anton-importer.ts`
- Tables: `lifecycle_events`, `lifecycle_event_project_impacts`
- Architecture: [`/docs/marketing/tier5-hardware-build.md`](../../marketing/tier5-hardware-build.md)
