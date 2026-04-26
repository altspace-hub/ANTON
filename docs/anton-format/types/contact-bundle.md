# `contact-bundle` — Contact Bundle

> **Family:** Network / AAP
> **Purpose:** Initial peer introduction — pubkey, contact-hash, capability descriptors.
> **Typical transport:** AAP.

## Content directory layout

```text
manifest.json
contents/contact/contact.json    # pubkey, hash, capabilities, friendly name
```

## Apply behaviour

Inserts into `connected_users` after signature verification.

## Signing

REQUIRED — signature is the trust anchor.

## Related

- Service: `server/services/aap-rollout-bridge.ts`
- Tables: `connected_users`
- Architecture: [`/docs/architecture/30-aap-protocol.md`](../../architecture/30-aap-protocol.md)
