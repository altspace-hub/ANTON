# ANTON Mesh — Threat Model v0.1

**Status:** Living document. Updated at the close of every phase. Final sign-off required before the default-transport switch (Phase 8).

**Last updated:** 2026-05-05.

---

## 0 · Scope

This document covers the **mesh transport layer only** — the path between a paired Companion App and its paired ANTON instance, through one or more relay servers. It does *not* cover:

- The application-layer security of the ANTON product (covered by the existing security model in `docs/SECURITY.md`)
- The host-machine security of the ANTON instance itself (covered by the local-first contract)
- The phone's host-OS security (covered by Android/iOS sandbox guarantees)

Anything explicitly out of scope is listed in §3 below.

---

## 1 · Actors

| Actor | What they want | What they can do |
|---|---|---|
| **Operator** | Run an ANTON instance for their household / firm. | Configures relay endpoints. Holds the instance's Ed25519 long-term key. |
| **User** | Use the Companion App to reach their paired instance from anywhere. | Holds a device Ed25519 keypair (biometric-gated where possible). |
| **Relay operator** | Run a relay (openexpert, an enterprise IT team, or a hostile third party who somehow gained relay control). | Sees only TLS-decrypted ciphertext + connection metadata. |
| **Passive network attacker** | Read traffic in transit. | Sees only TLS ciphertext. |
| **Active network attacker (MITM)** | Tamper, redirect, or impersonate. | Can break TLS only with a valid leaf cert; cannot break Noise without the responder static key. |
| **Compromised phone** | Stolen / unlocked device with biometric bypass. | Can read whatever the secure store releases. |
| **Compromised instance** | Operator's machine fully owned. | Game over — that's the local-first contract. |

---

## 2 · Threats and mitigations

### T1. Passive network observer reads traffic

- **Vector:** ISP, WiFi neighbour, transit AS sniffs the wire.
- **Mitigation:** Outer TLS WebSocket on both legs. ChaCha20-Poly1305 inner record protection.
- **Status:** Closed by design.
- **Test:** Wireshark capture during chat session. Only TLS records observable. Decrypted with key-log ⇒ Noise framing observable but no plaintext.

### T2. Compromised relay reads or modifies traffic

- **Vector:** Relay operator goes rogue, relay is hacked, government compels relay.
- **Mitigation:** Phone and instance perform Noise IK with each other directly through the relay. Relay never holds either party's static or ephemeral keys. Tampering breaks the AEAD tag and the receiving side closes the stream.
- **Status:** Closed by design (assuming primitives uncompromised).
- **Test:** Custom test relay that flips bytes in transit. Both sides should detect and disconnect with `MAC_FAIL` within one frame.

### T3. Compromised relay impersonates the instance to a phone (or vice versa)

- **Vector:** Relay tries to MITM the Noise handshake.
- **Mitigation:** Phone has the instance's static pubkey pinned (`pubkey_pinned` on the Instance record). Noise IK includes a static-key authentication step. A relay attempting to substitute its own static key for the responder's fails the handshake.
- **Status:** Closed by design.
- **Test:** Mock relay returning a different responder static. Phone's handshake must fail at message 1 with `STATIC_KEY_MISMATCH`.

### T4. MITM at QR scan time

- **Vector:** Attacker shows a fake QR with their own pubkey + relay endpoint. User scans it thinking it's their ANTON.
- **Mitigation:** Existing pairing flow already includes a 6-digit out-of-band confirmation code. Operator reads it from desktop UI; user types it on phone. Code is bound into the signature payload, so a substituted QR won't match.
- **Status:** Closed (existing mechanism, unchanged).
- **Test:** Phase 5 e2e regression — pairing fails when confirmation code differs.

### T5. Replay of an old message

- **Vector:** Compromised relay or network captures + replays a past request.
- **Mitigation:** Two layers — (a) Noise nonces per session prevent within-session replay. (b) Existing signed envelope monotonic nonce prevents cross-session replay. Server stores recent nonces in `app_signed_envelope_nonces`.
- **Status:** Closed (Noise) + closed (envelope, existing).
- **Test:** Replay a captured frame after handshake. Receiver discards on duplicate counter. Replay an envelope-signed request with prior nonce → 409 from server.

### T6. Cross-tenant leak at relay

- **Vector:** Relay accidentally pipes phone-A's bytes to instance-B.
- **Mitigation:** Relay matches by exact `instance_id` (16-byte SHA-256 prefix of pubkey). No partial match. Logged as `MATCH_FAIL` at any prefix mismatch.
- **Status:** Closed by relay implementation.
- **Test:** Concurrent test with 100 instance/phone pairs randomly interleaved. Zero cross-routing observed.

### T7. Stolen / unlocked phone exfiltrates the device key

- **Vector:** Attacker has physical phone, biometric defeated, device unlocked.
- **Mitigation:** Tier-1 — `@aparajita/capacitor-secure-storage` enforces biometric on every read of the device privkey. Tier-2 fallback (older Androids) — IndexedDB; less robust. Operator can revoke a stolen device via `app_devices` row update; subsequent handshakes fail at the membership check.
- **Status:** Partial. Hardware-backed key store is the user's main defence; ANTON adds remote revoke as belt-and-braces.
- **Test:** Manual revoke flow, confirm chat fails post-revoke within 30 seconds.

### T8. Lost or rotated instance privkey

- **Vector:** Operator's machine dies, restored from backup with old keys; or operator deliberately rotates after a scare.
- **Mitigation:** Existing privkey already encrypted at rest (`INSTANCE_KEY_ENCRYPTION_KEY`). Rotation procedure (Phase 1 spec): operator generates new keypair, all paired phones must re-pair, old `instance_id` is revoked at the relay.
- **Status:** Open. Procedure documented in spec; tooling lands in Phase 6.
- **Test:** End-to-end rotation drill in Phase 6.

### T9. DoS at relay

- **Vector:** Attacker floods relay with handshake attempts targeting one `instance_id`, or with general traffic.
- **Mitigation:** Per-IP rate limit on handshake messages. Per-instance_id ceiling on concurrent streams. Backpressure on slow consumers. Max message size cap (1 MiB framed). Audit log surfaces anomalies.
- **Status:** To be implemented in Phase 2.
- **Test:** Phase 2 load test — sustained 1k handshake/s from a single IP must not affect other instances' availability.

### T10. Side-channel timing across relay

- **Vector:** Relay correlates traffic timing/size to fingerprint conversation patterns.
- **Mitigation:** Out of scope for v0.1. Padding + cover traffic explored in v0.2+.
- **Status:** Open, deferred. Documented limitation.

### T11. Downgrade attack to plain HTTP / cleartext WebSocket

- **Vector:** Active attacker tricks the phone into talking to a plain-HTTP impostor instead of the mesh relay, or supplies a `ws://` URL in a forged QR.
- **Mitigation:** Capacitor `androidScheme: 'https'`, Android `network_security_config` blocks cleartext to non-localhost. Spec §1.3 requires phones to **reject pairing QRs whose `relay_endpoints` contain any non-`wss://` URL** at parse time — the relay list is validated before being persisted into the Instance record.
- **Status:** Spec-locked in Phase 1; enforced in code in Phase 4 (phone-side mesh transport) + Phase 6 (network_security_config tightening).
- **Test:** Phase 6 — feed a QR with a `ws://` relay; phone rejects pairing with a clear error.

### T12. Compromised relay correlates `instance_id` with operator identity

- **Vector:** Relay operator wants to know "who runs instance X"; can correlate the source IP of the instance's outbound dial with billing or CDN logs.
- **Mitigation:** Partial only. Operators concerned about this can run their own relay (open spec). Future v0.2 may add Tor egress option.
- **Status:** Open, partial (mitigated by self-hosting option).

### T13. Targeted enumeration of `instance_id`s

- **Vector:** Attacker who has captured a pairing QR (e.g., photographed it during pairing, exfiltrated it from a backup) knows the instance's pubkey and can derive its `instance_id`. They can then probe each known relay to learn whether *that* instance is currently online.
- **Mitigation:** Not prevented — this is treated as expected behaviour. The 128-bit `instance_id` space makes *untargeted* enumeration infeasible; *targeted* enumeration assumes the attacker already has access to the QR or pubkey, in which case "is the instance online right now" is a low-value leak. Operators concerned about this can run their own relay so the relay operator is them.
- **Status:** Open by design. Documented limitation.

### T14. Instance squats on another instance's `instance_id` at the relay

- **Vector:** Hostile party with relay access sends `HELLO_INSTANCE` with someone else's `instance_id` and their own static key, hoping to intercept phone connections.
- **Mitigation:** Spec §3.2 requires the relay to verify (a) `instance_id == sha256(static_pk)[0..16)` AND (b) `binding_sig` proves the Ed25519 / X25519 pair was deliberately signed by the operator AND (c) `proof_sig` signs over `instance_id || static_pk || ed_pk || relay_url || timestamp` AND (d) the relay verifies its own URL appears in the signed payload. The squatter would need the original instance's *private* key to satisfy (c) — at which point it's not "squatting," it's "key compromise" (covered by T8 rotation).
- **Status:** Closed by spec §3.2 verification steps 1–6.
- **Test:** Relay unit test — submit HELLO_INSTANCE with each individual mismatched field; relay rejects with BAD_HELLO / INVALID_PROOF at every individual mismatch.

### T15. Phone static-key leakage to anyone holding the instance pubkey

- **Vector:** Noise IK message 1 encrypts the phone's static pubkey using a key derived from `es` only (phone ephemeral × instance static). Anyone holding the instance's static pubkey — which includes anyone with access to a leaked / captured pairing QR — can decrypt the phone's static pubkey from passively-captured traffic. This lets a hostile relay (or anyone correlating across relays) link the same phone across instances.
- **Mitigation:** *Accepted limitation for v0.1.* The phone's static pubkey is already shared with the instance (it's in `app_devices`); the new exposure is to "anyone with the instance pubkey." For households + NGOs (the v0.1 personas), this is bounded — the instance pubkey is held only by the operator and paired devices. For mid-firms and enterprises, this is a real concern, addressed by switching to `Noise_IKpsk2` or `Noise_XX` in v0.2 (§12.3 item 12).
- **Status:** Open by design. Documented limitation. Re-evaluated for v0.2.

### T16. Relay misrouting delivers ENVELOPE to wrong leg

- **Vector:** A bug or table corruption in the relay's match table delivers an instance→instance ENVELOPE to the *same* instance leg (or phone→phone). AEAD eventually catches it (different keys per direction) but the receiver burns through Noise transport counters trying.
- **Mitigation:** Spec §3.6 adds a relay-set `from_role` byte (0x01 phone / 0x02 instance) inside ENVELOPE. Receiver MUST check it equals the *opposite* of its own role, drops the frame and ends the session before invoking AEAD.
- **Status:** Closed by spec §3.6.
- **Test:** Relay implementation must include a unit test that wires up two phone-side WS connections and verifies the relay rejects forwarding between them when their session_ids do not match.

### T17. Rotation advisory replay using compromised old key

- **Vector:** When an operator rotates an instance privkey because the *old* one was compromised, the attacker still holds the old private key for as long as it takes to revoke. Without temporal binding on the `INSTANCE_KEY_ROTATED` advisory (§7.1), the attacker can sign a *different* `new_pubkey` with the still-valid old key and downgrade-rotate any phone that hasn't yet migrated.
- **Mitigation:** Spec §7.1 advisory now includes `rotation_epoch` (monotonic per instance) and `not_after` (seconds-since-epoch expiry). Phone tracks `max_seen_epoch_per_instance`; advisories with a lower epoch are rejected, advisories past `not_after` are rejected.
- **Status:** Closed by spec §7.1.
- **Test:** Rotation drill — issue a valid advisory, then a second one with a lower epoch; phone must reject the lower-epoch advisory.

### T18. IPv6 /64 rate-limit bypass

- **Vector:** An attacker on an IPv6 host has 2^64 source addresses on a single /64. Per-/32 rate limits are trivially bypassed by rotating the lower 64 bits between requests. Conversely, per-/32 rate limits also false-positive on shared-NAT / CGN deployments where one IPv4 address fronts thousands of legitimate users.
- **Mitigation:** Spec §3.10 specifies the rate-limit bucket as `/32` for IPv4 sources and `/64` for IPv6 sources.
- **Status:** Closed by spec §3.10.
- **Test:** Relay load test — generate handshake floods across a /64 with rotating low bits; the relay should aggregate them into the same bucket.

---

## 3 · Out of scope for v0.1

These are real risks that we are **not** addressing in this version. Listed here so reviewers and users know what they're getting:

1. **Relay metadata correlation** (T10, T12). Knowing which instance_id is busy when. Mitigation requires onion routing.
2. **Compromised host machine.** If the operator's PC is owned, the attacker has the privkey. That's the local-first contract.
3. **Side-channel on the phone after biometric defeat.** Hardware enclaves are the best defence; we do nothing extra above what the OS provides.
4. **Quantum-future attacks on Curve25519 / X25519.** Post-quantum migration deferred to a future spec version.
5. **Browser-based web access over mesh.** The mesh is for the Companion App ↔ Instance only. Web access continues on the existing `public_https` transport.

---

## 4 · Sign-off

Phase 0 (this document): drafted by Claude.
Phase 1 (with wire format): expert review required before merge.
Phase 5 (default switch enabling): final security sign-off required.
Phase 6 (hardening): external pen-test or paired senior review.

---

## 5 · Change log

- **2026-05-05** — Initial draft. Phase 0 scaffolding.
- **2026-05-05** — Phase 1 review pass: T11 sharpened with the `wss://`-only requirement explicitly bound to the spec; added T13 (targeted instance_id enumeration — out of scope, documented assumption); added T14 (instance squatting at the relay — closed by §3.2 verification steps 1–5). No threat status regressions.
- **2026-05-05** — Phase 1.8 expert-review hardening: T14 verification step list updated (§3.2 expanded from 5 to 6 steps); added T15 (phone-static-key leakage to anyone with instance pubkey — accepted in v0.1, IKpsk2/XX deferred to v0.2); T16 (relay misrouting closed by ENVELOPE direction tag); T17 (rotation advisory replay closed by epoch + not_after); T18 (IPv6 rate-limit bypass closed by /64 bucketing). Scope of v0.1 narrowed to household + NGO + self-hosting SME — mid-firm and enterprise threats are deferred to a v0.2 enterprise-profile threat model rather than papered over.
