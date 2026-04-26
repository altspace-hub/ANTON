# `market-thesis` — Market Thesis

> **Family:** Markets
> **Purpose:** Investment thesis with supporting atoms + why-chain.
> **Typical transport:** Marketplace, AAP.

## Content directory layout

```text
manifest.json
contents/markets/theses/<thesis-id>/
  ├── thesis.md
  ├── why-chain.json
  └── atoms/
```

## Apply behaviour

Inserts into `market_theses` + `market_thesis_atoms`.

## Signing

Recommended.

## Related

- Service: `server/services/market-bundle-importer.ts`
- Tables: `market_theses`, `market_thesis_atoms`
- Architecture: [`/docs/architecture/future/f-50-markets-pillar.md`](../../architecture/future/f-50-markets-pillar.md)
