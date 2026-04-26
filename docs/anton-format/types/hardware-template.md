# `hardware-template` — Hardware Template

> **Family:** Hardware
> **Purpose:** Reusable hardware-template definition (BoM scaffold, firmware skeleton, regulatory checklist).
> **Typical transport:** Marketplace, AAP, local.

## Content directory layout

```text
manifest.json
contents/hw-templates/<template-id>/
```

## Apply behaviour

Inserts into `hw_templates`; user instantiates per project.

## Signing

Recommended.

## Related

- Service: `server/services/anton-importer.ts`
- Tables: `hw_templates`, `hw_template_instantiations`
- Architecture: [`/docs/marketing/tier5-hardware-build.md`](../../marketing/tier5-hardware-build.md)
