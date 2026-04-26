# `quality-baseline` — Quality Baseline

> **Family:** Governance
> **Purpose:** Captured baseline of quality scores per (module, area) for regression detection by the quality ratchet.
> **Typical transport:** Local, AAP.

## Content directory layout

```text
manifest.json
contents/quality/<baseline-id>.json
```

## Apply behaviour

Sets a baseline against which the quality-ratchet (Layer 4 of the cross-workflow funnel) compares new outputs.

## Signing

Recommended.

## Related

- Service: `server/services/quality-ratchet.ts`

- Architecture: [`/docs/architecture/26-cross-workflow-intelligence.md`](../../architecture/26-cross-workflow-intelligence.md)
