# `portal` — Portal

> **Family:** Portals
> **Purpose:** Portal definition — pages, capability descriptors, walkthrough config.
> **Typical transport:** AAP, Marketplace.

## Content directory layout

```text
manifest.json
contents/portals/<portal-id>/
  ├── portal.json
  ├── pages/
  ├── capabilities/
  └── walkthroughs/
```

## Apply behaviour

Inserts into `portals` + `portal_pages` + capability cards. Owner-bound.

## Signing

Recommended (signed portals get a verified badge in Pathfinder discovery).

## Related

- Service: `server/services/portals/portal-bundler.ts`
- Tables: `portals`, `portal_pages`, `capability_cards`
- Architecture: [`/docs/architecture/33-portals-pathfinder.md`](../../architecture/33-portals-pathfinder.md)
