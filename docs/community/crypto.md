# Community Cryptography

> Quick reference for the cryptographic stack underpinning Community + AAP. The full protocol-level detail lives in [`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md); this file is the **what + why** rather than the **byte-level format**.

---

## Identity

| Concept | Implementation |
|---|---|
| Long-term identity | Ed25519 keypair per ANTON instance |
| Contact hash | `ANTON-XXXX-XXXX-XXXX-XXXX` over hex of SHA-256(pubkey) |
| Storage at rest | Privkey AES-256-GCM encrypted via `INSTANCE_KEY_ENCRYPTION_KEY` (32-byte hex env) |
| Builder | `community-crypto.generateContactHash()` + per-pubkey-derivation in `identity.ts` |
| Validator | `community-crypto.isValidContactHash(hash)` |
| Anti-spoof | `community-crypto.contactHashMatchesPubkey(hash, pubkey)` — confirms a peer's claimed hash actually derives from their pubkey |

---

## Signing

| Concept | Implementation |
|---|---|
| Canonical-JSON | `registry-protocol/canonical-json.ts` (sorted keys, no whitespace, deterministic numbers) |
| Envelope wrap | `registry-protocol/envelope.ts` |
| Signing | `community-signing-service.sign(body)` — Ed25519 over canonical-JSON of the body |
| Verification | `community-crypto.verifyEnvelopeSignature(envelope, sig, pubkey)` — Node's `crypto.verify` against an Ed25519 SPKI-prefixed key |

The same envelope format is used by:

- AAP messages (HELLO / WELCOME / BUNDLE / ACK / etc.)
- `.anton` bundle signatures
- Evidence Pack item signatures
- Atlas signed exports

---

## Session encryption

For E2E messaging (and AAP session-level bundle bodies):

1. Each peer generates an ephemeral X25519 keypair for the session.
2. Ephemeral pubkeys exchanged in HELLO/WELCOME.
3. Shared secret derived: `X25519(ephemeralPriv, peerEphemeralPub)`.
4. Symmetric key derived via HKDF-SHA-256.
5. Bundle bodies / message contents encrypted with AES-256-GCM (12-byte IV per message, 16-byte auth tag).

Per-session ephemeral keys provide forward secrecy: long-term Ed25519 compromise doesn't decrypt past sessions.

Per-conversation key state persisted in `e2e_keys` (mig 102) — enables resuming a long-lived conversation across instance restarts.

---

## Replay protection

Every signed message carries a `nonce` (32 bytes hex). Recipients persist into:

| Table | Used by |
|---|---|
| `p2p_message_nonces` (mig 110) | AAP message envelopes between ANTON instances |
| `app_signed_envelope_nonces` (mig 130) | Companion-app responses to checkpoints |
| `portal_signed_envelope_nonces` (mig 147) | Portal capability invocations |

Reuse → reject with `ERROR { code: "bad_nonce" }`. Nonces older than 24h may be GC'd.

---

## Homoglyph defence

`registry-protocol/homoglyph.ts` folds confusable scripts (Cyrillic → Latin lookalikes etc.) before name comparisons. Used by:

- Portal registration (prevent `АNTON-portal` impersonating `ANTON-portal`)
- Pathfinder discovery (warning badges on near-collisions)

---

## What's NOT in the model (yet)

- **Forward-secret message archives.** Decrypted messages persist locally in `friend_messages` — if local DB is compromised, past message contents are accessible. Mitigations: at-rest encryption of the local DB (operational, not built-in).
- **Post-quantum.** Ed25519 + X25519 are classical schemes. PQ migration is a 2027+ topic.
- **Centralised key revocation.** No revocation registry yet; rely on contact-hash regeneration + notifying peers manually.

These gaps are documented honestly. The model is good for today's threat surface; future-proofing is on the roadmap.

---

## Where to look

- `server/services/community-crypto.ts` — primitives
- `server/services/community-signing-service.ts` — sign helper
- `server/services/community-e2e.ts` — E2E session wrappers
- `server/services/registry-protocol/` — canonical-JSON + envelope + homoglyph
- [`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md) — protocol spec
