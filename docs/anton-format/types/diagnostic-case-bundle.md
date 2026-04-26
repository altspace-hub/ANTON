# `diagnostic-case-bundle` — Diagnostic Case Bundle

> **Family:** Hardware
> **Purpose:** Diagnostic case library export — symptoms → diagnoses → cross-references.
> **Typical transport:** Marketplace, AAP.

## Content directory layout

```text
manifest.json
contents/diagnostics/<bundle-id>/cases.jsonl
```

## Apply behaviour

Inserts into `diagnostic_cases` + outcomes + cross-refs.

## Signing

Recommended.

## Related

- Service: `server/services/anton-importer.ts`
- Tables: `diagnostic_cases`, `diagnostic_case_outcomes`, `diagnostic_case_cross_references`
- Architecture: [`/docs/marketing/tier5-hardware-build.md`](../../marketing/tier5-hardware-build.md)
