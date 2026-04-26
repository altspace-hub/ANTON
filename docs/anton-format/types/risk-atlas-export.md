# `risk-atlas-export` — Risk Atlas Export

> **Family:** Risk Atlas
> **Purpose:** Signed snapshot of an Atlas — board-ready DOCX + per-path PDF + heatmap SVG + canonical JSON.
> **Typical transport:** AAP, Marketplace.

## Content directory layout

```text
manifest.json
contents/atlas-export/<atlas-id>/
  ├── board-pack.docx
  ├── threat-paths/*.pdf
  ├── heatmap.svg
  └── atlas.json   # canonical body for re-import
```

## Apply behaviour

Recipients can re-import as a new Atlas (preserving stage history) or render reports without import.

## Signing

REQUIRED — the export is the audit artefact.

## Related

- Service: `server/services/risk-atlas/atlas-export.ts`

- Architecture: [`/docs/marketing/risk-atlas.md`](../../marketing/risk-atlas.md)
