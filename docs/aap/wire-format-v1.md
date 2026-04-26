# ANTON Agent Protocol — Wire Format v1

> **Status:** v1 specification, post-E.2 (`ANTON_Improvement_and_Investigation_Brief.md`).
> **Audience:** anyone implementing an AAP client or server (including non-ANTON peers that want to interoperate).
> **Authoritative implementations:** `server/services/aap-transport-server.ts` and `server/services/aap-transport-client.ts`.

---

## Transport

- **WebSocket over HTTPS (wss://)** — the only supported transport in v1.
- Default endpoint path: `/aap/v1`.
- TLS termination at the ANTON instance (or its reverse proxy). Self-signed certs permitted for LAN-only deployments; the contact-hash anchors trust, not the cert chain.
- mDNS advertisement for LAN discovery: service type `_anton-aap._tcp.local`, TXT record `version=1` + `contact_hash=<peer's contact hash>`. Coexists with the existing `_anton._tcp.local` Companion-App service.

---

## Identity

- Each ANTON instance has an Ed25519 long-term identity keypair stored in `instance_identity` (privkey AES-256-GCM-encrypted at rest via `INSTANCE_KEY_ENCRYPTION_KEY`).
- The instance's **contact hash** is `ANTON-XXXX-XXXX-XXXX-XXXX` over hex (`/^ANTON-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/`) derived from SHA-256 of the public key.
- Peers exchange contact hashes out-of-band (QR, link, paste) before a session begins.

---

## Session lifecycle

| Phase | Direction | Message type |
|---|---|---|
| 1. Connect | client → server | WebSocket upgrade to `/aap/v1` |
| 2. Hello | client → server | `HELLO` |
| 3. Welcome | server → client | `WELCOME` (or `REJECT`) |
| 4. Session | both | `BUNDLE`, `ACK`, `PING`, `ERROR` |
| 5. Close | either | `GOODBYE` (clean) or close frame (abrupt) |

All messages are JSON-encoded text frames. Binary frames are reserved for future bundle-streaming optimisation.

---

## Message envelopes

Every AAP message has a top-level envelope:

```json
{
  "v": 1,
  "type": "<message-type>",
  "id": "<uuid v4>",
  "ts": "<ISO8601 UTC>",
  "from": "ANTON-AAAA-AAAA-AAAA-AAAA",
  "nonce": "<32-byte hex>",
  "payload": { ... },
  "sig": "<base64url ed25519 signature>"
}
```

- `v` — wire-format version. Always `1` for this spec.
- `type` — see **Message types** below.
- `id` — message id. Recipients dedupe.
- `ts` — issuance time. Recipients reject messages with skew > 5 minutes.
- `from` — issuer's contact hash.
- `nonce` — replay-protection nonce. 32 bytes hex. Recipients persist into `p2p_message_nonces` (mig 110); reuse rejected.
- `payload` — message-type-specific body.
- `sig` — Ed25519 signature over canonical-JSON of `{v, type, id, ts, from, nonce, payload}` using `registry-protocol/canonical-json.ts`. Recipients verify with the issuer's pubkey (resolved via `connected_users.contact_hash`).

---

## Message types

### `HELLO` (client → server)

```json
{
  "type": "HELLO",
  "payload": {
    "pubkey": "<base64url ed25519 pubkey>",
    "capability_descriptors": [
      { "id": "evidence-pack-publisher", "version": "1" },
      { "id": "market-thesis-share", "version": "1" }
    ],
    "ephemeral_pubkey": "<base64url x25519 ephemeral pubkey>"
  }
}
```

Server verifies that:
- `payload.pubkey` derives to `from` contact hash (anti-spoof).
- `sig` validates against `payload.pubkey`.
- `nonce` not previously seen.

### `WELCOME` (server → client)

```json
{
  "type": "WELCOME",
  "payload": {
    "pubkey": "<base64url ed25519 pubkey>",
    "ephemeral_pubkey": "<base64url x25519 ephemeral pubkey>",
    "session_id": "<uuid>",
    "accepted_capabilities": ["evidence-pack-publisher"]
  }
}
```

After exchange, both sides derive a shared symmetric key via X25519(ephemeral_priv, peer_ephemeral_pub) → HKDF-SHA-256. **Bundle payloads carried in subsequent `BUNDLE` messages are AES-256-GCM-encrypted with this key.** The envelope itself remains plaintext (signed) so middleware can route.

### `REJECT` (server → client)

```json
{
  "type": "REJECT",
  "payload": {
    "code": "unknown_peer | rate_limited | capability_unsupported | tls_required | clock_skew",
    "detail": "<human-readable>"
  }
}
```

### `BUNDLE` (either direction, post-handshake)

```json
{
  "type": "BUNDLE",
  "payload": {
    "session_id": "<from WELCOME>",
    "bundle_type": "evidence-pack | market-thesis | risk-atlas-export | …",
    "encrypted_body": "<base64url AES-256-GCM ciphertext>",
    "iv": "<base64url 12-byte IV>",
    "auth_tag": "<base64url 16-byte GCM tag>"
  }
}
```

The decrypted body is a complete `.anton` bundle (manifest + content). Recipient runs the standard `anton-importer.unzip()` + `anton-validator.verify()` pipeline.

### `ACK` (response to `BUNDLE`)

```json
{
  "type": "ACK",
  "payload": {
    "in_reply_to": "<BUNDLE message id>",
    "status": "received | applied | rejected_signature | rejected_schema | rejected_owner_locked",
    "detail": "<optional human-readable>"
  }
}
```

### `PING` / `PONG`

Keep-alive. Empty payload. Either side may issue; the other must respond within 30s or the session is considered stale.

### `ERROR` (either direction)

```json
{
  "type": "ERROR",
  "payload": {
    "in_reply_to": "<offending message id, if any>",
    "code": "bad_signature | bad_nonce | clock_skew | capability_denied | quota_exceeded",
    "detail": "<human-readable>"
  }
}
```

### `GOODBYE` (either direction)

Clean session shutdown. No payload. Recipient should close the WebSocket.

---

## Replay protection

- Every message carries `nonce` (32 bytes hex).
- Recipient persists into `p2p_message_nonces (nonce, peer_contact_hash, used_at)`.
- Reuse → reject with `ERROR { code: "bad_nonce" }`.
- Nonces older than 24h may be GC'd.

---

## Capability negotiation

Capabilities are advertised in `HELLO`. The server returns the intersection of advertised + supported in `WELCOME.accepted_capabilities`. Bundle types not under an accepted capability are rejected with `ACK { status: "capability_denied" }`.

Standard capability ids in v1:

| Capability id | Allows |
|---|---|
| `evidence-pack-publisher` | `BUNDLE` of type `evidence-pack` |
| `market-thesis-share` | `BUNDLE` of type `market-thesis`, `market-investigation`, `market-atom-collection` |
| `risk-atlas-export` | `BUNDLE` of type `risk-atlas-export`, `risk-atlas-industry-pack`, `risk-atlas-fcp-domain-pack` |
| `portal-publisher` | `BUNDLE` of type `portal` |
| `career-profile-exchange` | `BUNDLE` of type `career-profile` (consenting peers only) |
| `humanitarian-deployment` | `BUNDLE` of type `humanitarian-deployment-kit` |
| `hardware-share` | `BUNDLE` of type `hardware-knowledge-pack`, `hardware-template`, `hardware-project`, `patch-bundle`, `lifecycle-advisory-bundle`, `diagnostic-case-bundle` |

Peers MAY advertise non-standard capabilities; receivers SHOULD ignore unknown ones rather than reject the handshake.

---

## Error codes

| Code | When |
|---|---|
| `tls_required` | Connection upgraded over plain WebSocket (ws://); reject |
| `unknown_peer` | `from` contact-hash not in `connected_users`; reject (peers must be introduced first) |
| `bad_signature` | Signature failed verification |
| `bad_nonce` | Nonce previously seen, malformed, or too short |
| `clock_skew` | `ts` more than 5 minutes off recipient clock |
| `rate_limited` | Recipient is rate-limiting this peer |
| `capability_unsupported` | `HELLO` advertised no capabilities the recipient supports |
| `capability_denied` | Bundle type sent that wasn't covered by accepted capabilities |
| `quota_exceeded` | Recipient quota for this peer exceeded |

---

## Observability

Every AAP message is logged to `community_signed_trail_entries` (existing table). The full session is one trail; each `BUNDLE` adds an entry. Recipients write `community_trail_verifications` rows after signature checks.

The `/audit-trail` consolidated viewer (post-C.2) surfaces these alongside other trail kinds.

---

## Versioning

`v: 1` is this spec. Future versions will be negotiated at `HELLO` time:

- Sender sends `HELLO` with the highest version it supports.
- If the recipient supports it, `WELCOME` echoes the same version.
- If not, recipient may downgrade in `WELCOME.payload.version_downgrade` (caller must confirm).

---

## What's NOT in v1

These are explicitly deferred to v2 / future:

- Multi-recipient broadcast (one bundle to N peers in a single send).
- Streaming bundles (large hardware-projects in chunks).
- Session resumption after disconnect.
- Federation discovery (a directory of peers).

---

## Reference implementation

- **Server:** `server/services/aap-transport-server.ts` — WebSocket endpoint, handshake, bundle dispatch.
- **Client:** `server/services/aap-transport-client.ts` — outbound peer client.
- **mDNS:** `server/services/mdns-advertiser.ts` — extended to advertise `_anton-aap._tcp.local`.
- **Architecture diagram:** [`/docs/architecture/30-aap-protocol.md`](../architecture/30-aap-protocol.md).
