# `market-data-source-config` — Market Data Source Config

> **Family:** Markets
> **Purpose:** Per-source configuration for FMP / news / RSS / partner feeds.
> **Typical transport:** Marketplace, local.

## Content directory layout

```text
manifest.json
contents/markets/data-sources/<source-id>.json
```

## Apply behaviour

Inserts into `market_data_sources`.

## Signing

Optional.

## Related

- Service: `server/services/market-bundle-importer.ts`


