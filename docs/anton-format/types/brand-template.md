# `brand-template` — Brand Template

> **Family:** Governance
> **Purpose:** Per-org branding (logo, colour palette, voice) injected into output transforms.
> **Typical transport:** Local, AAP.

## Content directory layout

```text
manifest.json
contents/brand/<template-id>/
  ├── logo.svg
  ├── palette.json
  └── voice.md
```

## Apply behaviour

Available as an output transformation override; one active brand per org.

## Signing

Optional.

## Related

- Service: `server/services/anton-importer.ts`


