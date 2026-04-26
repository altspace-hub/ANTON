# `module` — Expert Module

> **Family:** Work-pillar core
> **Purpose:** A custom expert module — system prompt + guided inputs + default config — that installs into a user's Build-Your-Own catalogue.
> **Typical transport:** Marketplace, AAP, local file.

## Content directory layout

```text
manifest.json
system-prompt.md            # Layer-3 module expertise
guided-inputs.json          # form fields presented to the user before run
default-config.json         # default model, thinking, knowledge sources
contents/modules/           # optional sub-modules if this is multi-stage
```

## Apply behaviour

Inserts a row into `custom_modules` for the importing user; no overwrite without explicit confirm. The user can then run the module from the Build-Your-Own surface like any built-in module.

## Signing

Optional. Signed bundles surface a "verified" badge in the marketplace; unsigned still install.

## Related

- Service: `server/services/anton-importer.ts`
- Table: `custom_modules`
- Architecture: [`/docs/architecture/11-seven-layer-prompt-builder.md`](../../architecture/11-seven-layer-prompt-builder.md) (Layer 3 origin)
