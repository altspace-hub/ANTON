# Registry Protocol

> The registry protocol is the cross-instance trust + transport layer. It sits beneath both Portals (publishing + discovery) and the `.anton` bundle format (signing + verification). Defined in `server/services/registry-protocol/`.

---

## Canonical JSON (`canonical-json.ts`)

Every signed payload in ANTON — portal descriptor, capability descriptor, evidence-pack item, AAP envelope body — is canonicalised to a deterministic JSON string before signing or hashing. Without canonicalisation, two semantically-identical payloads can produce different bytes (key ordering, whitespace, escape variants), breaking signatures.

The rules:

1. Object keys are sorted lexicographically.
2. No whitespace inside the JSON output.
3. Arrays preserve original ordering — order is meaningful.
4. Numbers serialised in shortest unambiguous form (no trailing `.0`).
5. Strings use minimal escaping (no `\uNNNN` for printable ASCII).

The function exported is `canonicaliseJSON(value: unknown): string`. It accepts any JSON-compatible JavaScript value and returns the canonical UTF-8 string.

**Use it for:** anything that will be signed or hashed and might be transmitted between systems. **Don't use it for:** general API responses (clients shouldn't depend on key ordering for parsing).

---

## Envelopes (`envelope.ts`)

An envelope wraps a canonical body + signature + metadata into a transmissible unit. Format:

```
{
  body: <canonical-JSON-stringified payload>,
  body_hash: "sha256:<hex>",
  signature: "<base64url Ed25519 sig>",
  signing_key_fingerprint: "<first 16 hex chars of SHA-256(pubkey)>",
  algorithm: "ed25519",
  signed_at: "<ISO8601 UTC>"
}
```

Wrapping operations:

- `wrapEnvelope(body, signingKey)` → produces the envelope above. Used by portal publishers, bundle signers, AAP `BUNDLE` messages.
- `unwrapEnvelope(envelope, expectedPubkey?)` → parses + verifies. Returns the parsed body or throws on signature mismatch.

The envelope is the same shape used in `community_signed_trail_entries` (mig 080) — so receivers can persist a verification record using the existing signed-trail infrastructure.

---

## Homoglyph defence (`homoglyph.ts`)

Portal names and contact-hash-derived display strings are vulnerable to homoglyph attacks: an attacker registers `АNTON-portal` (Cyrillic А) that visually mimics `ANTON-portal`. The defence:

- `normaliseDisplayName(name)` — folds confusable scripts (Cyrillic → Latin lookalikes) into a canonical Latin form for collision detection.
- `detectHomoglyphCollision(name, knownNames)` — returns the closest known name if the input collides under normalisation.

Used in two places:

1. Portal registration — checked before write to `portals.name` to prevent confusable squatting.
2. Pathfinder discovery — surfaced as a warning badge when search results contain near-identical normalised names.

---

## Operations (`operations/`)

Sub-directory with one file per registry op:

- `register.ts` — create a new registry entry (portal or bundle)
- `update.ts` — amend an existing registry entry (versioned)
- `revoke.ts` — mark an entry as revoked (cryptographic revocation; previous signatures still verify but new use should be refused)

Each operation produces a transparency-log entry — append-only record of what was registered, by whom, when, with which key. The transparency log is the foundation for "show me the history of this portal" claims that regulators and counterparties may ask for.

---

## Where to look

- **Code:** `server/services/registry-protocol/`
- **Outbound client:** `server/services/registry-client/` — wraps the protocol for cross-instance fetches
- **Architecture:** [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md) and [`/docs/architecture/30-aap-protocol.md`](../architecture/30-aap-protocol.md) for the broader picture
- **AAP wire format:** [`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md) — uses canonical-JSON + envelopes for every signed message

---

*Refresh when a new operation type ships, when the canonical-JSON rules change, or when the homoglyph script set is extended.*
