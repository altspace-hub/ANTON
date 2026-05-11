# Comm-to-Comm Relay Protocol v0.1 — Design

**Status:** Draft, ready for implementation
**Date:** 11 May 2026
**Author:** Claude Code, with daniel.bardun
**Related:** `relay/` package (existing instance↔phone relay), `anton-communication-app-brief.md`, `docs/ANTON_MESH_SPEC.md` (the v0.1 mesh spec this extends)

---

## 1. Goals and non-goals

### Goals

1. Let two **ANTON Communication App** instances reach each other through the existing relay (`relay.futurechain.eu`), with the operator unable to read message content.
2. Be **additive** — never break or alter the existing `HELLO_INSTANCE` / `HELLO_PHONE` / `DIAL_INSTANCE` / `ENVELOPE` flows that the Companion App relies on.
3. Carry **offline delivery** for short windows (mailbox model).
4. Provide enough integrity guarantees that the relay operator can route but **cannot** forge messages or learn message content.

### Non-goals

- **No group chat at the relay layer.** Group fan-out is the sender's job (Phase 4 issues N separate `SEND_COMM` frames).
- **No directory / lookup service.** The relay does not publish a list of who's online. Comm Apps exchange contact hashes out-of-band (QR scan or paste).
- **No per-pair authorisation.** Anyone can send to anyone. Spam mitigation is two-layered: rate limits at the relay, contact-book filter at the receiving Comm App.
- **No content scanning.** The relay handles opaque ciphertext bytes. Period.
- **No payment routing.** Payments go through FutureChain + Heimdall on a separate seam (per `anton-communication-app-brief.md`).

---

## 2. Identifiers

Comm Apps are addressed by a **16-byte routing ID** derived from the user's Ed25519 public key:

```
routing_id = sha256(ed25519_pubkey)[0..16]
```

Where `ed25519_pubkey` is the raw 32-byte public key (the same key that produces the displayable `ANTON-XXXX-XXXX-XXXX-XXXX` contact hash). The relay routes by `routing_id`; the display hash is a UI concern.

> **Implementation note.** Identity in `src/comm/services/identity.ts` already derives the display hash from `sha256(pubkey)`. Add a `deriveRoutingId(pubkeyHex): Uint8Array` helper that returns the first 16 raw bytes of the same hash. Both forms come from the same pubkey, so a Comm App can always compute its own routing ID locally.

---

## 3. Wire format additions

Frame layout is unchanged from `docs/ANTON_MESH_SPEC.md` §2: `[version: u8 = 0x01][type: u8][len: u24 BE][payload: bytes]`.

New frame types — additive, no collisions with §3.1 of the mesh spec:

| Value | Name | Direction | Purpose |
|---|---|---|---|
| `0x20` | `HELLO_COMM` | client → relay | Register a Comm App by routing ID |
| `0x21` | `ACK_COMM` | relay → client | Registration accepted; pending-mailbox count |
| `0x22` | `SEND_COMM` | client → relay | Send opaque ciphertext to a target routing ID |
| `0x23` | `DELIVER_COMM` | relay → client | Deliver an inbound message |
| `0x24` | `ACK_DELIVERY` | client → relay | Optional client ack (for sender-side status ticks) |

Values `0x25–0x2F` reserved for Comm Pillar extension.

---

## 4. Frame payload layouts

### 4.1 `HELLO_COMM` (0x20)

```
[ 0..32)   ed25519_pubkey:   32 bytes
[32..36)   timestamp:        u32 BE (seconds since epoch)
[36..38)   relay_url_len:    u16 BE
[38..38+L) relay_url:        UTF-8 bytes (canonical relay URL)
[..]      proof_sig:        64 bytes Ed25519
[..+4)    caps:             u32 BE bitfield (reserved, send 0)
```

Minimum size: 32 + 4 + 2 + 0 + 64 + 4 = **106 bytes**.

**Proof signature input** (matches §3.2 HELLO_INSTANCE shape):
```
PROOF_DOMAIN || timestamp_u32_be || relay_url
```
where `PROOF_DOMAIN = "ANTON-COMM-HELLO/v1\n"` (distinct from mesh's `ANTON-MESH-HELLO-INSTANCE/v1\n` — domain separation).

### 4.2 `ACK_COMM` (0x21)

```
[ 0..16)   session_id:       16 random bytes
[16..18)   pending_count:    u16 BE
[18..22)   mailbox_ttl_secs: u32 BE (how long the relay keeps mailboxed messages)
```

The relay immediately follows ACK_COMM with `pending_count` `DELIVER_COMM` frames if the mailbox has anything.

### 4.3 `SEND_COMM` (0x22)

```
[ 0..16)   session_id:       16 bytes (must match ACK_COMM's)
[16..32)   target_routing_id: 16 bytes
[32..48)   message_id:       16 bytes (sender-generated, used for ACK_DELIVERY)
[48..]     ciphertext:       opaque bytes (the AAP-signed AES-GCM envelope from chat.ts)
```

Min: 48 bytes + non-empty ciphertext.

### 4.4 `DELIVER_COMM` (0x23)

```
[ 0..16)   from_routing_id:  16 bytes (relay-stamped, NOT client input)
[16..32)   message_id:       16 bytes (echoed from sender's SEND_COMM)
[32..36)   relay_ts:         u32 BE (when the relay accepted SEND_COMM)
[36..]     ciphertext:       opaque bytes
```

Note: `from_routing_id` is stamped by the relay from the sender's verified `HELLO_COMM` identity. Clients cannot spoof this.

### 4.5 `ACK_DELIVERY` (0x24)

```
[ 0..16)   message_id:       16 bytes (echoed from DELIVER_COMM)
[16..17)   kind:             u8 (0x01 = received, 0x02 = read)
```

The relay forwards this back to the original sender's session if they're still connected. If the sender is offline, the ack is dropped (best-effort).

---

## 5. Registration flow

```
Comm App → relay:  HELLO_COMM(pubkey, ts, relay_url, sig, caps)
relay verifies:
  1. timestamp within ±30s of relay's clock              → INVALID_PROOF
  2. relay_url matches relay's canonical URL             → BAD_HELLO
  3. Ed25519 verify(sig, PROOF_DOMAIN||ts||relay_url, pubkey)  → INVALID_PROOF
  4. proof_sig not in 60s replay cache                   → INVALID_PROOF
  5. derive routing_id = sha256(pubkey)[0..16]
  6. Displace any older session with the same routing_id (send ERROR/REPLACED, close)
  7. Register session by routing_id
  8. Look up mailbox[routing_id]; let pending_count = mailbox.size
relay → Comm App: ACK_COMM(session_id, pending_count, mailbox_ttl_secs)
relay drains mailbox → DELIVER_COMM × N
```

Identical structure to the existing `HELLO_INSTANCE` (§3.2 of the mesh spec) but simpler — no binding signature, no instance_id mismatch checks, because there's no separate Ed25519 / X25519 binding for Comm Apps (X25519 is derived deterministically from Ed25519 client-side; relay doesn't need to see it).

---

## 6. Routing flow

```
Sender (already HELLO_COMM'd) → relay:
  SEND_COMM(session_id, target_routing_id, message_id, ciphertext)

relay:
  1. Verify session_id matches the sender's session (else ERROR/PEER_GONE)
  2. Rate-check sender (see §8)
  3. Look up target routing_id in active sessions
     a. If online: forward DELIVER_COMM to target's session
     b. If offline: push to mailbox[target] (subject to §8 mailbox cap)
  4. Stamp from_routing_id = sender's verified routing_id

Recipient receives DELIVER_COMM, decrypts ciphertext using its long-term
X25519 + the AAD '<from_display_hash>:<to_display_hash>' that the sender
included when sealing (chat.ts §sealForPeer).
```

The relay never sees plaintext; it never derives X25519 keys. It routes 16-byte routing IDs and forwards opaque bytes.

---

## 7. Offline delivery and mailbox

Each `routing_id` gets a small **mailbox** at the relay:

- Capacity: **100 messages** per recipient (configurable, hard ceiling 1000)
- TTL: **7 days** from `SEND_COMM` arrival (signalled to clients in `ACK_COMM.mailbox_ttl_secs`)
- Eviction: when at capacity, oldest message dropped; sender of dropped message is **not** notified (avoids amplification)
- Drained on next `HELLO_COMM` for that routing_id

Mailbox is stored in-memory at the relay v0.1 (lost on relay restart, acceptable for "social chat between friends" use case). v0.2 may persist to disk.

> **Privacy note.** The mailbox holds ciphertext + 16-byte routing IDs + timestamps. No plaintext, no contact-book information. A relay-operator breach reveals who-messaged-whom over the last 7 days, no message content. This matches the controller-status-for-metadata posture in `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md` §1.

---

## 8. Abuse mitigations

| Vector | Mitigation |
|---|---|
| Spam (sender → many recipients) | Per-sender rate limit: **30 SEND_COMM/min** sliding window. Excess → ERROR/RATE_LIMITED, frame dropped, session not closed (so legit traffic resumes). |
| Spam (one sender → one recipient flood) | Same 30/min budget covers it; plus mailbox cap (§7) bounds storage. |
| Large messages | Reuse `MAX_PAYLOAD_BYTES = 1 MiB` from frame.ts. Ciphertext in `SEND_COMM` ≤ 1 MiB − 48 bytes of frame overhead. |
| Many concurrent connections from one source | Reuse existing per-IP connection limit (§3.10 of mesh spec: `maxSessionsPerInstance = 32`, hard ceiling 256; applied analogously to comm sessions). |
| Replay of `HELLO_COMM` proof | 60s replay cache (matches §3.2 step 6 of mesh spec). Sig keyed by `(ed25519_pubkey, timestamp, relay_url)`. |
| Spoofed `from_routing_id` | Impossible — relay stamps it from the verified session. Client cannot lie. |
| Sender impersonation at message layer | E2E AAD binds `from_display_hash:to_display_hash` into AES-GCM auth tag. Spoofed AAD → undecryptable for the legitimate recipient. |
| Unwanted contact (received by recipient) | Client-side — Comm App can show messages from unknown contact hashes in a separate "Requests" tray (Phase 1C-3 polish, not relay-side). |

---

## 9. Error codes

Reuse existing codes from `relay/src/match.ts` `RELAY_ERROR_CODE`:

- `BAD_HELLO` (0x0002) — malformed HELLO_COMM, wrong relay_url, expired timestamp
- `INVALID_PROOF` (0x0003) — sig verify failed, replay
- `NO_MATCH` (0x0004) — target offline AND mailbox full
- `PEER_GONE` (0x0006) — session_id unknown, peer disconnected
- `MSG_TOO_LARGE` (0x0007) — already enforced at frame layer
- `RATE_LIMITED` (0x0008) — sender exceeded SEND_COMM budget
- `RELAY_DRAINING` (0x0009) — relay shutting down

New code:
- `MAILBOX_FULL` (0x0010) — recipient's mailbox at cap; sender notified so they can retry or use a different channel

---

## 10. Compatibility

- No existing frame type (0x01–0x07, 0x0F, 0x10) is altered.
- Existing `MatchTable` (instance↔phone matching) keeps its semantics.
- New **`ContactRegistry`** module added in parallel under `relay/src/comm-registry.ts`. It uses the same `Action[]`-returning pattern so the server.ts dispatcher can call it the same way.
- The dispatcher in `relay/src/server.ts` inspects the frame type byte and routes 0x20–0x24 to the ContactRegistry and 0x01–0x10 to the MatchTable. A single WebSocket connection can only be one kind of leg at a time (instance, phone, or comm) — first HELLO frame locks the role.
- The Companion App is unaffected. The Comm App is the only client that sends 0x20–0x24 frames.

---

## 11. Test strategy

Mirror the existing `relay/tests/` layout:

1. **Unit tests for `comm-registry.ts`**: registration (good + bad sig), routing online, routing offline (mailbox), mailbox eviction, mailbox TTL, rate limit, session replacement, disconnect cleanup.
2. **Wire-format tests**: encode/decode each new frame type, error cases (truncation, length mismatch).
3. **Integration test via ws**: spin up the relay, two simulated Comm Apps, send messages between them online and offline, verify routing + mailbox.
4. **Compatibility regression**: existing mesh tests (`relay/tests/match.test.ts`, `hello.test.ts`) must still pass unchanged.

---

## 12. Open questions (v0.1 → v0.2)

1. **Persistent mailbox.** v0.1 uses in-memory. v0.2 should persist to disk so a relay restart doesn't lose 7 days of pending delivery. Probably SQLite or a small key-value store at the relay.
2. **Receipts.** `ACK_DELIVERY` is best-effort v0.1. v0.2 may persist delivery state per message so a sender can ask "was this delivered?" after reconnecting.
3. **Trusted-routing-id signalling.** A future version could let a recipient publish a list of "blocked routing IDs" to the relay so spam never reaches their mailbox. Trade-off: relay learns more metadata. Skip for v0.1.
4. **Cross-relay federation.** If FutureChain runs multiple relays, how does Comm App A on relay_us reach Comm App B on relay_eu? Out of scope for v0.1 — single relay.
5. **Reverse compatibility for the existing Companion App.** None planned. Companion App keeps using its own pairing model. If a user wants their Comm App identity to be reachable from a Companion App contact list, that's the Phase 2+ optional-linking feature, not a relay protocol concern.

---

## Appendix A — Implementation checklist

**Server (`relay/`):**

- [ ] `relay/src/frame.ts` — add type constants `HELLO_COMM=0x20` etc.
- [ ] `relay/src/comm-hello.ts` — parse + verify HELLO_COMM (mirror `hello.ts` shape)
- [ ] `relay/src/comm-registry.ts` — ContactRegistry class with `register / send / handleDisconnect / drainMailbox`
- [ ] `relay/src/server.ts` — frame dispatcher selects MatchTable vs ContactRegistry by type byte
- [ ] `relay/src/limits.ts` — add `commSendsPerMinute = 30`, `mailboxCapacity = 100`, `mailboxTtlSecs = 604800`
- [ ] `relay/tests/comm-registry.test.ts` — unit tests
- [ ] `relay/tests/comm-integration.test.ts` — end-to-end via ws

**Client (`src/comm/`):**

- [ ] `src/comm/services/identity.ts` — add `deriveRoutingId(pubkeyHex): Uint8Array`
- [ ] `src/comm/services/relay-client.ts` — WebSocket connection, HELLO_COMM, SEND_COMM, DELIVER_COMM handler, reconnect with backoff
- [ ] `src/comm/services/chat.ts` — wire `sendMessage` to push into relay outbox + handle inbound via `receiveEncryptedMessage`
- [ ] `src/comm/App.tsx` — start the relay client on app boot once identity exists
- [ ] `vite.config.comm.ts` — `VITE_COMM_RELAY_URL` env var

**Config:**

- [ ] Default relay URL: `wss://relay.futurechain.eu/comm/v0.1/` (path-prefixed to leave room for protocol upgrades)
- [ ] Dev relay URL: `ws://localhost:8082/comm/v0.1/` (pointing at the local relay package)
