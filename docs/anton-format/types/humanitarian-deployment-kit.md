# `humanitarian-deployment-kit` — Humanitarian Deployment Kit

> **Family:** Hardware
> **Purpose:** Pre-configured ANTON + local LLM + curricula bundle for NGO / refugee field deployment.
> **Typical transport:** Local, AAP, physical media.

## Content directory layout

```text
manifest.json
contents/humanitarian-kit/<kit-id>/
  ├── deployment.json
  ├── llm-config/
  ├── curricula/
  └── knowledge-packs/
```

## Apply behaviour

Verifies signature against issuing org's pubkey before applying. Local pairing via mDNS once deployed.

## Signing

REQUIRED — verifies provenance for field operations.

## Related

- Service: `server/services/anton-importer.ts`
- Tables: `hw_humanitarian_deployments`
- Architecture: [`/docs/marketing/humanitarian-deployment-kit.md`](../../marketing/humanitarian-deployment-kit.md)
