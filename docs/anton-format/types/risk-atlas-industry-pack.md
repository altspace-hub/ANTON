# `risk-atlas-industry-pack` — Risk Atlas Industry Pack

> **Family:** Risk Atlas
> **Purpose:** Industry-specific Risk Atlas overlay (sme-general, fcp-bank, sector-*, etc.).
> **Typical transport:** Marketplace, AAP, local.

## Content directory layout

```text
manifest.json
contents/atlas-packs/<pack-id>/
  ├── pack.json
  ├── exposures/
  ├── threat-paths/
  └── controls/
```

## Apply behaviour

Loaded by `atlas-pack-loader.ts`; inheritance via `parent_pack_id` (cycle-protected).

## Signing

Recommended.

## Related

- Service: `server/services/risk-atlas/atlas-pack-loader.ts`
- Tables: `atlas_industry_packs`
- Architecture: [`/docs/marketing/risk-atlas.md`](../../marketing/risk-atlas.md)
