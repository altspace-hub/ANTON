# `coding-review-profile` — Coding Review Profile

> **Family:** Coding
> **Purpose:** Configurable review profile — what to check for, severity thresholds, ignored patterns.
> **Typical transport:** Marketplace, local.

## Content directory layout

```text
manifest.json
contents/review-profiles/<profile-id>.json
```

## Apply behaviour

Inserts into the user's review-profile catalogue. Selectable per Tier-1 (Code Review) run.

## Signing

Optional.

## Related

- Service: `server/services/anton-importer.ts`

- Architecture: [`/docs/architecture/25-coding-area.md`](../../architecture/25-coding-area.md)
