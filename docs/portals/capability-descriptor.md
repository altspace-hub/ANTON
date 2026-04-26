# Capability Descriptor

> A capability descriptor declares **what an AAP peer can do** at a given portal. It's the contract peers negotiate over before exchanging any operational message. Defined in `server/services/capability-descriptor/`.

---

## The 12-verb taxonomy

Every capability is expressed as one of twelve verbs. The closed taxonomy keeps cross-instance interop tractable — an AAP client knows ahead of time what verbs to expect.

| Verb | Meaning | Typical use |
|---|---|---|
| `get` | Fetch a single resource by id | Get one portal page |
| `list` | Enumerate resources | List portal pages |
| `search` | Free-text or structured search | Search a knowledge-pack library |
| `render` | Return human-renderable view (HTML / Markdown) | Render a portal page |
| `submit` | Accept user input (form / payload) | Submit a comment, application, contact request |
| `verify` | Verify a claim / signature / fact | Verify an attestation against a known key |
| `attest` | Produce a signed assertion | Issue a credential or compliance attestation |
| `resolve` | Resolve identifier → resource | Resolve `ANTON-XXXX-…` to its portal home |
| `invoke` | Execute an action with side effects | Trigger a workflow on the portal owner's instance |
| `subscribe` | Push subscription | Subscribe to portal updates |
| `publish` | Publish to a channel | Post into a deliberation portal |
| `index` | Register for inclusion in indexes | Opt into discovery indexes |

Per-verb reference implementations live in `server/services/capability-descriptor/verbs/`.

---

## Descriptor shape

A capability descriptor is a JSON object with this top-level shape:

```jsonc
{
  "schema_version": 1,
  "portal_id": "<UUID>",
  "portal_contact_hash": "ANTON-XXXX-XXXX-XXXX-XXXX",
  "version": "1.0.0",
  "issued_at": "<ISO8601>",
  "capabilities": [
    {
      "id": "list-pages",            // unique per portal
      "verb": "list",                 // one of the 12
      "resource": "portal_page",      // logical resource type
      "input_schema": { ... },        // JSON Schema for invocation input
      "output_schema": { ... },       // JSON Schema for the response
      "auth": "public" | "peer" | "owner",
      "rate_limit": { "per_minute": 60 },
      "description": "List the public pages of this portal."
    },
    // … more capabilities
  ],
  "signature": "<see envelope.ts>"
}
```

The descriptor is signed via the registry protocol envelope. Recipients verify the signature, then use the schemas to construct invocations.

---

## Files

| File | Responsibility |
|---|---|
| `schema.ts` | TypeScript types + JSON Schema for the descriptor itself |
| `builder.ts` | Programmatic construction (used by the walkthrough's "Capabilities" phase) |
| `hash.ts` | Stable content hash of the descriptor (stored in `portals.descriptor_hash`) |
| `signer.ts` | Sign the descriptor envelope with the portal's Ed25519 key |
| `validator.ts` | Validate an incoming descriptor (schema + signature + homoglyph) |
| `verbs/` | Per-verb reference handlers |

---

## How peers negotiate

1. **Discovery:** Pathfinder fetches a portal's descriptor via `registry-client` (cached in `portal_descriptor_cache`).
2. **Validation:** the descriptor is run through `validator.ts` — schema check + signature check + homoglyph check. Failures abort.
3. **Capability filter:** Pathfinder retains only capabilities the requesting verb supports.
4. **Invocation:** `pathfinder-engine.ts` calls `portal-handler.ts` `invokeCapability(portal_id, verb, args)`.
5. **Response:** the portal returns a structured response shaped by the capability's `output_schema`.
6. **Audit:** every invocation appends to `portal_capability_invocations` (mig 147) — replay-protected via signed-envelope nonces (`portal_signed_envelope_nonces`).

The full sequence is in [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md).

---

## Per-portal capability editing

Owners edit their portal's capabilities at `/portals/:id/manage` via `portal-capabilities-editor.ts`. The editor validates each change against `schema.ts` and resigns the descriptor on save (so the `descriptor_hash` updates and peers learn about changes via cache invalidation).

---

## Adding a new verb

The 12-verb taxonomy is intentionally closed — adding a verb is a deliberate architectural decision. If you find an interop need that none of the 12 cover:

1. Open a discussion (don't extend silently).
2. Confirm no composition of existing verbs satisfies the use case.
3. Add the verb to `schema.ts` (TypeScript union), `verbs/`, and `validator.ts`.
4. Document it in the table above + in [`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md).

The bar is high because every peer ANTON needs to know the verb to interoperate.

---

*Refresh when the verb taxonomy extends or the descriptor schema bumps.*
