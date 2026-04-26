# `market-index` — Market Index

> **Family:** Markets
> **Purpose:** ANTON-curated index definition — symbols, weights, rebalance rules.
> **Typical transport:** Marketplace, AAP, local.

## Content directory layout

```text
manifest.json
contents/markets/indexes/<index-id>.json
```

## Apply behaviour

Inserts into `market_indexes` + `market_index_holdings`.

## Signing

Recommended.

## Related

- Service: `server/services/market-bundle-importer.ts`
- Tables: `market_indexes`, `market_index_holdings`
- Architecture: [`/docs/architecture/future/f-50-markets-pillar.md`](../../architecture/future/f-50-markets-pillar.md)
