# `project-template` — Project Template

> **Family:** Governance
> **Purpose:** Reusable project scaffold (sessions + datasets + module config defaults).
> **Typical transport:** Marketplace, local.

## Content directory layout

```text
manifest.json
contents/project-templates/<template-id>/
  ├── project.json
  ├── sessions/
  └── module-configs/
```

## Apply behaviour

Spawns a new project with the template's defaults pre-populated.

## Signing

Optional.

## Related

- Service: `server/services/anton-importer.ts`


