# `market-atom-collection` — Market Atom Collection

> **Family:** Markets
> **Purpose:** A curated set of market atoms (claims, observations, evidence).
> **Typical transport:** AAP, Marketplace.

## Content directory layout

```text
manifest.json
contents/markets/atoms/<collection-id>.jsonl
```

## Apply behaviour

Inserts into `market_atoms` (partition-aware).

## Signing

Recommended.

## Related

- Service: `server/services/market-bundle-importer.ts`


