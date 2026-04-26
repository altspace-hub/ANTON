# `risk-atlas-fcp-domain-pack` — Risk Atlas FCP Domain Pack

> **Family:** Risk Atlas
> **Purpose:** FCP-domain overlay (AML/CFT, sanctions, fraud, ABC, market-abuse, tax-evasion-facilitation, export-controls).
> **Typical transport:** Marketplace, AAP, local.

## Content directory layout

```text
manifest.json
contents/fcp-packs/<domain-id>/
```

## Apply behaviour

Activated per Atlas via `atlas_fcp_scope`. Composes into Stage 7b company-wide rollup.

## Signing

Recommended.

## Related

- Service: `server/services/risk-atlas/atlas-fcp-scope-service.ts`
- Tables: `atlas_fcp_scope`
- Architecture: [`/docs/marketing/risk-atlas.md`](../../marketing/risk-atlas.md)
