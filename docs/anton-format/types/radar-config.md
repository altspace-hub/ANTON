# `radar-config` — Radar Config

> **Family:** Governance
> **Purpose:** Horizon Radar / Compliance Radar scan configuration — sources, frequency, alerting.
> **Typical transport:** Marketplace, local.

## Content directory layout

```text
manifest.json
contents/radar/<config-id>.json
```

## Apply behaviour

Imports as an additional radar configuration; user activates per-radar.

## Signing

Optional.

## Related

- Service: `server/services/anton-importer.ts`


