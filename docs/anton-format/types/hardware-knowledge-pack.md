# `hardware-knowledge-pack` — Hardware Knowledge Pack

> **Family:** Hardware
> **Purpose:** Per-MCU / per-region pack of components, claims, regional alternatives.
> **Typical transport:** Marketplace, AAP.

## Content directory layout

```text
manifest.json
contents/hkp/<pack-id>/
  ├── components.json
  ├── claims.json
  └── regional-alternatives.json
```

## Apply behaviour

Inserts into `hardware_knowledge_packs` + sub-tables. Activated per-project.

## Signing

Recommended.

## Related

- Service: `server/services/hkp-service.ts`
- Tables: `hardware_knowledge_packs`, `hkp_components`, `hkp_claims`, `hkp_regional_alternatives`
- Architecture: [`/docs/marketing/tier5-hardware-build.md`](../../marketing/tier5-hardware-build.md)
