# `patch-bundle` — Patch Bundle

> **Family:** Hardware
> **Purpose:** Firmware patch + staged rollout plan.
> **Typical transport:** AAP, Marketplace.

## Content directory layout

```text
manifest.json
contents/patches/<patch-id>/
  ├── firmware.bin
  ├── plan.json
  └── stages.json
```

## Apply behaviour

Inserts into `hw_patch_plans` + `hw_patch_stages` + `hw_patch_rollouts`. Stage activation requires user confirm.

## Signing

REQUIRED — firmware patches must be signed.

## Related

- Service: `server/services/anton-importer.ts`
- Tables: `hw_patch_plans`, `hw_patch_stages`, `hw_patch_rollouts`
- Architecture: [`/docs/marketing/tier5-hardware-build.md`](../../marketing/tier5-hardware-build.md)
