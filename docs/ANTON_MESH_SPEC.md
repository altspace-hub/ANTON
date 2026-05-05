# ANTON Mesh Transport — Protocol Spec v0.1

**Status:** Phase 1 complete + post-review hardening pass applied. Ready to drive Phase 2 implementation (reference relay).

**Target personas for v0.1:** *household / private-person* and *NGO with field workers* are the primary fit. *SME self-hosting their own relay* also works. **Mid-sized regulated firms with client-share requirements, and large enterprises, are explicitly NOT v0.1 targets** — they need an enterprise profile (HSM, mTLS layered under WSS, FIPS primitives, browser-share path, SAML/SCIM device-posture) which is roadmapped as v0.2. Those personas should continue using the `public_https` transport with their own reverse-proxy + corporate PKI in the meantime.

**Last updated:** 2026-05-05.

**Conventions:** All multi-byte integers are big-endian (network byte order) unless noted. `u8` = 1 byte, `u16` = 2 bytes, `u24` = 3 bytes, `u32` = 4 bytes. Byte ranges shown as `[a..b)` are half-open (a inclusive, b exclusive). The single exception: ChaCha20-Poly1305 nonce counters (§4.7) are little-endian per IETF / Noise convention.

---

## 0 · Purpose

Allow a paired ANTON Companion App on any phone, on any network (home WiFi, office LAN, cellular, foreign WiFi), to reach its paired ANTON instance over an end-to-end encrypted channel without requiring:

- The instance's machine to expose any inbound port to the Internet
- The instance operator to own a domain or manage TLS certificates
- The phone user to install a separate VPN client
- Any third party (including the relay operator) to be able to read traffic

Self-hostable. Open spec. The reference relay is a small Node process that any operator can run.

### 0.1 Scope and non-goals — what v0.1 does and does not promise

**v0.1 promises:**
- Household-scale concurrency (default 32 concurrent matched sessions per instance, configurable up to 256).
- NGO-scale geo-distributed access (multi-relay failover; phones on flaky 3G/4G can reach an HQ instance).
- E2E encryption between phone and instance via Noise IK; relay sees only ciphertext.
- Open spec + open relay code so SMEs/orgs can self-host the relay if they want zero third-party dependency.

**v0.1 does NOT promise:**
- Browser-based mesh access. Mesh is companion-app-and-instance only. Lawyers wanting to share a brief with a client outside the firm should use `public_https` with their own reverse proxy.
- Enterprise SSO/MDM/HSM integration. The pairing model is per-device QR + biometric — adequate for households + NGOs, premature for enterprises.
- DLP/WAF egress inspection compatibility. Mesh tunnels everything inside Noise; the firm's existing inspection stack will see ciphertext only. This is the privacy promise for the personas v0.1 serves; firms that *need* inspection should keep `public_https`.
- "Infinite free relay." Free openexpert relays are sustainable for personal-tier use; SMEs and orgs at scale should self-host. See §11.

---

## 1 · Design decisions (locked)

### 1.1 Cryptographic primitives

All audited, browser-and-server safe, single source per primitive across the codebase:

| Primitive | Library | Used for |
|---|---|---|
| **Ed25519** | `@noble/ed25519` | Long-term identity (already in use). Instance pubkey + device pubkey. |
| **X25519** | `@noble/curves` | Ephemeral ECDH for handshake. Conversion from Ed25519 long-term keys at use site. |
| **ChaCha20-Poly1305** | `@noble/ciphers` | AEAD record protection (Noise transport messages). |
| **BLAKE2b** | `@noble/hashes` | Handshake hash + key derivation per Noise spec. |
| **SHA-256** | `@noble/hashes` | `instance_id` derivation, audit-log keys. |

No DIY crypto. No new audit-untouched libraries.

### 1.2 Handshake — Noise_IK_25519_ChaChaPoly_BLAKE2b

Pattern: **Noise_IK** (Initiator-knows-static-Key). Same pattern, same cipher suite, same DH curve as WireGuard — existing peer-reviewed analyses apply.

```
  Initiator (phone)                 Responder (instance)
  ----------------                  ---------------------
  -> e, es, s, ss              [phone → instance]
  <- e, ee, se                 [instance → phone]
                                [transport messages now flow]
```

`s` (responder static) is the instance's X25519 pubkey, derived deterministically from its Ed25519 pubkey via `crypto_sign_ed25519_pk_to_curve25519`-equivalent mapping (well-defined birational; matches NaCl's standard). The phone has it from the QR.

### 1.3 Transport — TLS WebSocket to relay

Both legs (phone↔relay, relay↔instance) ride a TLS WebSocket. Outer TLS hides connection metadata from passive observers; inner Noise hides everything from the relay itself.

**Only `wss://` is accepted.** Pairing QRs containing `ws://` URLs MUST be rejected by the phone at parse time — defends against the cleartext-downgrade vector (T11 in the threat model).

Why WebSocket:
- Capacitor WebView supports WSS cleanly with no custom bridge
- Survives most corporate proxies and captive portals (looks like HTTPS)
- Built-in length-framing — each WS message = one of our frames
- `ws` library already a dependency

### 1.4 Relay topology

- **Two-leg, both clients dial out.** No P2P. No NAT traversal.
- **Multi-relay.** Pairing QR encodes a list of relay URLs in priority order.
- **Instance dials *all* configured relays in parallel** so any phone can reach it via any of them. Each relay sees an independent HELLO_INSTANCE.
- **Phone dials one relay at a time** in priority order, falling over only on connection failure or RATE_LIMITED. Once connected, the phone stays put.
- **Stateless except for live matches.** Relay restart drops live matches; both sides reconnect.
- **Bytes-only forwarding.** The relay reads HELLO + PING; everything else is opaque ENVELOPE bytes it pipes between matched legs. Audit logs MUST NOT include any byte from an ENVELOPE payload.

### 1.5 instance_id

`instance_id = sha256(instance_X25519_static_pubkey)[0..16)` — 16 bytes, hex-encoded for transport (32 hex chars).

Properties:
- Deterministic from the public key — no central registry, no name service
- 128-bit collision resistance for *birthday* / random collision (infeasible)
- Short enough for QR + URLs
- Reveals only "an instance with this pubkey exists somewhere" — not who runs it or where

**Targeted-collision caveat:** because `instance_id` is a 128-bit truncation of SHA-256, an adversary can grind X25519 keypairs until one's `instance_id` matches a victim's — ~2^64 work, expensive but feasible for a determined attacker (weeks on GPU farms). However, a colliding `instance_id` alone cannot impersonate the victim: §3.2 step 5 requires a valid `proof_sig` over the victim's `instance_static_pk`, and the relay only forwards traffic to the matching pre-message responder static, which the phone has pinned at QR scan. So a successful collision lets the attacker register at the relay (pollution / metadata DoS) but not steal traffic. Documented; not in scope to widen `instance_id` for v0.1.

### 1.6 Versioning

Every relay frame carries `version: u8 = 0x01`. Mixed-version peers fail closed at the first frame parse. Protocol changes that aren't wire-compatible bump the byte and require both sides to upgrade.

---

## 2 · Wire framing

Every WebSocket message contains exactly one frame. The header is 5 bytes; the payload follows immediately.

```
+--------+--------+--------+--------+--------+========+
|version |  type  |     payload_length (u24)  | payload|
| (u8)   | (u8)   |        big-endian         |  ...   |
+--------+--------+--------+--------+--------+========+
  [0]      [1]      [2..5)                     [5..)
```

### 2.1 Field semantics

| Field | Type | Value |
|---|---|---|
| `version` | u8 | `0x01` for this spec. Receivers MUST close connection on mismatch. |
| `type` | u8 | **Always a relay-layer code from §3.1.** End-to-end message types ride inside ENVELOPE payloads with their own framing (§4-5). |
| `payload_length` | u24 BE | Length of the payload field in bytes. Range 0..16,777,215. |
| `payload` | bytes | Type-specific. Empty allowed. |

### 2.2 Size limits

| Limit | Value | Rationale |
|---|---|---|
| Max frame payload | **1,048,576 bytes (1 MiB)** | Bounds DoS surface at the relay. Matches the existing `query-sync` capture-size cap. Spec allows up to 16 MiB; implementations MUST reject larger. |
| Max WebSocket message | **1,048,581 bytes (1 MiB + 5)** | Frame header + max payload. WS library MUST be configured with `maxPayload = 1,048,581` so a malicious peer can't claim a 4 GiB frame and starve the receive buffer before we even parse the length field. |
| Max in-flight requests per session | 8 | See §5.4 stream multiplexing. |

A receiver that gets a frame larger than its configured limit MUST close the connection with control-message `ERROR(0x0F, code = MSG_TOO_LARGE)` and stop reading further messages.

### 2.3 Endianness

Big-endian everywhere. Matches Noise spec, matches network byte order, matches every other binary protocol the team will read.

---

## 3 · Relay control protocol

### 3.1 Message types

| `type` byte | Name | Direction | Payload |
|---|---|---|---|
| `0x01` | HELLO_INSTANCE | instance → relay | §3.2 |
| `0x02` | HELLO_PHONE | phone → relay | §3.3 |
| `0x03` | ACK_INSTANCE | relay → instance | §3.4 |
| `0x04` | ACK_PHONE | relay → phone | §3.5 |
| `0x05` | PING | either → relay | empty |
| `0x06` | PONG | relay → either | empty |
| `0x0F` | ERROR | any → any | §6 |
| `0x10` | ENVELOPE | bidirectional via relay | §3.6 |

### 3.2 HELLO_INSTANCE

Sent by the instance immediately after the WSS handshake.

```
payload:
  [ instance_id        : 16 bytes      ]   // sha256(instance_static_pk)[0..16)
  [ instance_static_pk : 32 bytes      ]   // X25519 public key (used in Noise)
  [ instance_ed_pk     : 32 bytes      ]   // Ed25519 public key (signing key)
  [ binding_sig        : 64 bytes      ]   // Ed25519(instance_ed_pk) over (ed_pk||x_pk),
                                            //   self-binds the two keys forever; same
                                            //   sig appears in the pairing QR (§8).
  [ relay_url_len      : u16 BE        ]   // length of the canonicalized relay URL bytes
  [ relay_url          : variable      ]   // canonical URL the instance dialed (§4.2)
  [ timestamp          : u32 BE        ]   // seconds since UNIX epoch
  [ proof_sig          : 64 bytes      ]   // Ed25519 signature, see below
  [ caps               : u32 BE        ]   // bitfield, see §3.7
```

`proof_sig` is computed over the byte string:

```
"ANTON-MESH-HELLO-INSTANCE/v1\n"
  || instance_id
  || instance_static_pk
  || instance_ed_pk
  || relay_url
  || timestamp_u32_be
```

Domain-separation prefix, then everything that should be bound: both keys, the *specific relay URL this HELLO is being delivered to*, and the timestamp. Signature is verified with `instance_ed_pk`.

`binding_sig` is computed over:

```
"ANTON-MESH-IDENTITY/v1\n" || instance_ed_pk || instance_static_pk
```

It's a self-signed certificate proving the operator deliberately binds these two specific keys. The same `binding_sig` appears in the pairing QR; phones pin the **pair `(instance_ed_pk, instance_static_pk)` together with binding_sig as a unit**, never just one or the other. This closes the Ed25519↔X25519 ambiguity (the birational map drops the sign bit; without an explicit signed binding, two distinct Ed25519 keys can map to the same X25519, and a hostile party could substitute one without the operator's consent).

The relay MUST verify, **in this order**, before transitioning to WAITING_FOR_PHONE:

1. `instance_id == sha256(instance_static_pk)[0..16)` — otherwise the instance is squatting on a foreign id. Reject with `BAD_HELLO`.
2. `Ed25519_verify(instance_ed_pk, "ANTON-MESH-IDENTITY/v1\n"||instance_ed_pk||instance_static_pk, binding_sig)` succeeds — otherwise the identity certificate is invalid. Reject with `BAD_HELLO`.
3. `relay_url` matches **this relay's canonical URL** (the relay knows its own canonical URL from config). Mismatch ⇒ `BAD_HELLO`. This binds the proof to *this* relay so a captured proof_sig cannot be replayed at a different relay.
4. `timestamp` is in `[now − 30s, now + 30s]`. Out of window ⇒ `INVALID_PROOF`.
5. `Ed25519_verify(instance_ed_pk, signed_string_above, proof_sig)` is true. Otherwise ⇒ `INVALID_PROOF`.
6. The pair `(instance_id, sha256(proof_sig))` has not been seen in the last 60 seconds (replay window). Otherwise ⇒ `INVALID_PROOF`.

The 32-bit timestamp covers seconds, not milliseconds, so it doesn't wrap until 2106. The `relay_url` field is bytes-equal to the `prologue` `relay_endpoint_url` (§4.2 canonicalization rules) so a single canonical form is used everywhere.

Why both keys on the wire? The phone-side Noise handshake uses the X25519 key; proof-of-possession + identity binding is signed with Ed25519 (the long-term identity primitive used throughout ANTON). Step 2 ensures a hostile actor cannot register a HELLO_INSTANCE with a foreign Ed25519 key bound to their own X25519 key — the operator's `binding_sig` is the cryptographic proof that this specific pair was deliberately created together.

### 3.3 HELLO_PHONE

Sent by the phone immediately after the WSS handshake.

```
payload:
  [ instance_id        : 16 bytes      ]   // which instance the phone wants
  [ phone_ephem_pk     : 32 bytes      ]   // X25519 ephemeral, used in Noise IK msg 1
  [ noise_init_msg     : variable      ]   // Noise IK message 1, opaque to relay
```

The relay sees `instance_id` and uses it for matching only. `phone_ephem_pk` and `noise_init_msg` are passed through inside an ENVELOPE on the matched instance leg — relay never interprets them.

The phone provides `noise_init_msg` *up front*, fused with HELLO_PHONE, so the relay can deliver it to the instance the moment a match happens. This shaves one round-trip versus a HELLO-then-handshake design.

### 3.4 ACK_INSTANCE

Relay → instance after a successful match.

```
payload:
  [ phone_ephem_pk     : 32 bytes      ]
  [ noise_init_msg     : variable      ]   // opaque; instance feeds to its Noise responder
  [ session_id         : 16 bytes      ]   // relay-allocated, unique per match
```

`session_id` lets both sides reference this match in subsequent ENVELOPE frames + audit logs.

### 3.5 ACK_PHONE

Relay → phone after a successful match.

```
payload:
  [ session_id         : 16 bytes      ]
```

After ACK_PHONE, the phone awaits a Noise IK message 2 inside an ENVELOPE.

### 3.6 ENVELOPE

Bidirectional through the relay. The relay forwards the payload byte-for-byte to the matched leg.

```
payload:
  [ session_id         : 16 bytes      ]
  [ from_role          : u8            ]   // 0x01 = phone, 0x02 = instance
  [ inner              : variable      ]   // opaque to relay; see §4-§5
```

`from_role` is set by the **relay** based on which leg of the matched pair sent the frame (the relay knows — it has the WS connection identity). The receiver MUST verify on every ENVELOPE that `from_role` is the *opposite* of its own role:

- Phone receives ENVELOPE → `from_role` MUST be `0x02`. If `0x01`, drop the frame and end the session with RPC `ERROR(SEQ_UNKNOWN)`.
- Instance receives ENVELOPE → `from_role` MUST be `0x01`. If `0x02`, drop the frame and end the session.

This catches a relay-side table mismatch silently delivering instance→instance frames before they consume Noise counters. AEAD would catch it eventually (different keys per direction), but this catches it cheaper and earlier — before any decrypt attempt.

Relay validates:
- `session_id` matches a live match
- Total frame size ≤ 1 MiB
- Both legs are still connected (otherwise drop with ERROR `PEER_GONE`)
- `from_role` is set correctly based on which leg the frame arrived on (relay-set field; client-set values overwritten before forwarding)

### 3.7 caps bitfield

Reserved for future capability negotiation. v0.1 instances MUST send `0x00000000`. Phones MUST ignore unknown bits.

### 3.8 PING / PONG

Either side sends PING with empty payload at most every 25s of idle. Receiver MUST respond with PONG within 5s. No PONG within 10s ⇒ sender closes connection.

Idle threshold tracks any frame, not only PING.

### 3.9 Relay state machine

```
  +-------- state per-WS-connection --------+
  |  CONNECTED     (no HELLO yet)           |
  |     |                                   |
  |     +-- HELLO_INSTANCE valid --→ WAITING_FOR_PHONE   (instance)
  |     +-- HELLO_PHONE          --→ WAITING_FOR_INSTANCE (phone)
  |     +-- anything else        --→ CLOSE(BAD_HELLO)    |
  |                                                      |
  |  WAITING_FOR_X                                       |
  |     +-- match found          --→ MATCHED             |
  |     +-- no match in 30s      --→ CLOSE(NO_MATCH)     |
  |                                                      |
  |  MATCHED                                             |
  |     +-- ENVELOPE             --→ forward to peer     |
  |     +-- peer disconnect      --→ ERROR(PEER_GONE) → CLOSE
  |     +-- this side closes     --→ peer ERROR(PEER_GONE)
  +-----------------------------------------------------+
```

A second HELLO_INSTANCE with the same `instance_id` while one is already WAITING_FOR_PHONE displaces the older — this happens normally when the instance reconnects after a network blip. The displaced connection gets `INSTANCE_REPLACED` and closes. **Phones do not displace phones**; concurrent phone HELLOs for the same `instance_id` each match against the same instance using distinct `session_id`s.

### 3.10 Limits at the relay

| Limit | Default | Per |
|---|---|---|
| Concurrent matched sessions | **32** (configurable, hard ceiling 256) | instance_id |
| New HELLO rate | 5/s | source bucket (see below) |
| New HELLO_INSTANCE rate | 60/min | instance_id |
| New HELLO_PHONE rate | 60/min | instance_id |
| ENVELOPE rate | 200/s | session_id |
| PING rate | 1/s | connection |

**Source bucket** is the address bucket used for IP-based rate limits:
- IPv4 source ⇒ bucket = full /32
- IPv6 source ⇒ bucket = /64 prefix (an IPv6 host can rotate the lower 64 bits trivially; CGN deployments and consumer routers often hand out a full /64 to a single device)

This avoids both (a) IPv6 bypass via low-bits rotation and (b) shared-NAT false-positives where one /32 fronts thousands of legitimate users.

The previous default of 8 concurrent sessions per instance_id was too low for a household with multiple phones × multiple relays. New default 32 covers ~16 active phones with one redundant connection each. An instance can advertise an expected device count via the `caps` bitfield (Phase 2 use); the relay scales the limit per declaration up to the hard ceiling.

Exceeding triggers ERROR `RATE_LIMITED` and a 60-second source-bucket cooldown for HELLO floods. Phones treat `RATE_LIMITED` as "try the next configured relay" before backing off (§6.6.1).

---

## 4 · Noise IK handshake

### 4.1 Protocol identifier

`Noise_IK_25519_ChaChaPoly_BLAKE2b`

### 4.2 Prologue

```
prologue = "ANTON-MESH/v1\n" || relay_endpoint_url || "\n" || instance_id_hex
```

`relay_endpoint_url` is the **canonicalized** URL of the relay that brokered this match. Both sides must produce the same byte string or the handshake fails (MAC_FAIL). The same canonicalized form is used in the HELLO_INSTANCE `relay_url` field (§3.2), in the relay's own self-knowledge of its identity, and in the phone's `Instance.relay_endpoints`.

#### 4.2.1 Canonicalization algorithm

Given an input URL string, produce the canonical form by applying these steps in order:

1. **Parse** as a URL per WHATWG URL Living Standard. Reject if parse fails.
2. **Scheme** MUST be `wss`. ASCII-lowercase the scheme. Reject `ws`, `http`, `https`, anything else.
3. **Host:**
   - If the host is an IPv4 literal: preserve as-is.
   - If the host is a `[bracketed IPv6 literal]`: lowercase, preserve brackets.
   - Otherwise (a domain): convert to **lowercase ASCII via Punycode/IDNA2008 ToASCII**. The output is always pure ASCII; non-ASCII at this stage ⇒ reject.
4. **Port:** If the port is `443`, omit it. Otherwise include `:port`.
5. **Userinfo:** strip entirely. Reject if userinfo was present in input (relay URLs MUST NOT carry credentials in the URL).
6. **Path:** MUST be exactly empty (`""`) or a single `/`. Other paths ⇒ reject. Canonical output has **no path component** (no trailing slash).
7. **Query string:** MUST be absent. Reject if present.
8. **Fragment:** MUST be absent. Reject if present.

Examples:

| Input | Canonical |
|---|---|
| `wss://Relay.Example.com:443/` | `wss://relay.example.com` |
| `wss://r1.openexpert.org:8443` | `wss://r1.openexpert.org:8443` |
| `wss://relay.example.com/api` | reject (path not allowed) |
| `wss://user:pw@relay.example.com` | reject (userinfo) |
| `ws://relay.example.com` | reject (scheme) |
| `wss://Relay.中国.example/` | `wss://relay.xn--fiqs8s.example` |
| `wss://[2001:db8::1]:443/` | `wss://[2001:db8::1]` |

A canonicalized URL contains only ASCII bytes; both sides hash the same byte sequence into the prologue.

Test vectors for the canonicalizer ship in `tests/mesh-vectors/canonicalize.json` (Phase 2 deliverable).

#### 4.2.2 Why bind the relay URL?

Binding the relay URL into the prologue prevents a **relay-confusion / handshake-replay attack**: a malicious relay (or attacker who captured a handshake at one relay) cannot replay it at a different relay endpoint, because the prologue is hashed into the handshake's running state — different relay URL ⇒ different hash ⇒ MAC_FAIL on the second message. Bound to *both* the phone's Noise prologue *and* the instance's HELLO `relay_url` field (§3.2 step 3), the same canonical URL is the single source of truth across all three places it appears.

### 4.3 Pre-message

```
pre_message_pattern = ["s"]
pre_message_responder_static = instance_X25519_static_pubkey
```

The phone has the instance's static pubkey from the QR; it's pinned at pairing time (`Instance.pubkey_pinned`). A handshake against a different responder static fails immediately.

### 4.4 Ed25519 → X25519 conversion

Both parties hold long-term Ed25519 keypairs (existing scheme). For Noise IK we need X25519 versions:

```
x25519_pk = ed25519_pk_to_curve25519(ed25519_pk)
x25519_sk = ed25519_sk_to_curve25519(ed25519_sk)
```

Implementation per RFC 7748 § 5 + the standard Edwards-to-Montgomery birational map. We use libsodium's algorithm exactly (`crypto_sign_ed25519_*_to_curve25519`); reference vectors in `tests/mesh-vectors/ed-to-x.json` (Phase 2 deliverable).

### 4.5 Handshake message 1 (phone → instance)

After Noise IK pattern `e, es, s, ss`:

```
noise_init_msg layout:
  [ phone_ephem_pk     : 32 bytes  ]   // e
  [ phone_static_pk_ct : 48 bytes  ]   // s, encrypted (32 + 16-byte tag)
  [ payload_ct         : variable  ]   // optional 0-RTT app data + 16-byte tag
```

Phone authenticates itself by being able to use its static private key in the `ss` step. The instance verifies by checking that decryption succeeds (Poly1305 tag valid).

The 0-RTT payload field is **reserved but unused** in v0.1 (always empty). Allowing 0-RTT data here would let the phone send its first request inside handshake message 1, but introduces replay considerations we defer to v0.2.

### 4.6 Handshake message 2 (instance → phone)

```
noise_resp_msg layout:
  [ instance_ephem_pk  : 32 bytes  ]   // e
  [ payload_ct         : 16 bytes  ]   // empty payload + 16-byte Poly1305 tag
```

Empty payload (just the auth tag). Successful tag verification by the phone confirms the instance holds the static key for `pubkey_pinned`.

### 4.7 Transport mode

After both handshake messages, both sides hold matching `(send_key, recv_key)` ChaCha20-Poly1305 keys. From here:

- Each transport message on the wire is **just the AEAD ciphertext+tag**: `payload_ct: variable`. No counter prefix on the wire — receiver tracks the expected counter locally per-direction (this matches the Noise spec rev34 §5).
- Counter starts at 0 in each direction, increments after each message sent in that direction.
- Counter rollover (2^64) ⇒ session MUST end. Not reachable in any practical session lifetime.
- Tag fail ⇒ session MUST end with `MAC_FAIL`. Receivers MUST NOT skip ahead through counters trying to find a match.

Sender encrypts:

```
nonce_bytes  = 0x00 0x00 0x00 0x00 || u64_LE(counter)     // 12 bytes total
payload_ct   = ChaCha20Poly1305_Encrypt(key=send_key,
                                        nonce=nonce_bytes,
                                        ad=empty,
                                        plaintext=app_payload)
```

**The counter is encoded little-endian** in the low 8 bytes, with the high 4 bytes zero. This is the IETF ChaCha20-Poly1305 nonce layout used by Noise rev34 (§5.1) and by WireGuard. An earlier draft of this spec said "BE counter" — that was wrong; treat any prior draft as superseded.

The on-wire frame contains *no* counter field — the receiver knows what counter to use because it tracks `recv_counter` locally and increments after each successful decrypt. A frame that fails AEAD MUST cause the receiver to terminate the session immediately; do not advance `recv_counter` and do not try other values.

### 4.8 What's authenticated by what

| Property | Mechanism |
|---|---|
| Instance is who the phone paired with | Phone's `pubkey_pinned` (Ed25519) maps to the X25519 responder static used in pre_message |
| Phone is who the instance authorized | After handshake completes, the instance has `phone_static_pk_X25519` in cleartext. It looks up `app_devices` by `ed25519_pk_to_curve25519(app_devices.pubkey)`. (Conversion is deterministic; can be cached in a column added in Phase 3.) |
| No tampering in transit | ChaCha20Poly1305 AEAD on every transport message |
| No replay within session | Per-direction counters, never reused |
| No replay across sessions | Per-application-message envelope nonce (existing) layered on top |
| No MITM at QR scan | Existing 6-digit confirmation code |
| Fresh ephemerals on retry | Each handshake attempt generates a new ephemeral keypair. A retry after PEER_GONE / NO_MATCH MUST NOT reuse the ephemeral from the failed attempt. |

---

## 5 · RPC framing inside Noise transport

The Noise channel carries a sequence of length-prefixed RPC frames. Each frame is a complete request *or* a complete response. Pipelining multiple in-flight requests is supported (§5.4).

### 5.1 Request frame

```
+--------+--------+========+========+========+========+========+========+
| 0x01   |  seq            |  method  |  path  |   headers   |   body  |
| (req)  | (u32 BE)        |          |        |             |         |
+--------+--------+========+========+========+========+========+========+
```

Detail:

```
[ kind        : u8 = 0x01 ]
[ seq         : u32 BE   ]   // initiator-allocated, monotonic per Noise session
[ method_len  : u8       ]   // 1..16
[ method      : bytes    ]   // ASCII; one of GET/POST/PATCH/PUT/DELETE
[ path_len    : u16 BE   ]   // 1..4096
[ path        : bytes    ]   // UTF-8; includes /api/app prefix
[ header_n    : u8       ]   // 0..32
[ for each header:
    [ name_len  : u8     ]   // 1..64
    [ name      : bytes  ]   // ASCII, lowercased on send
    [ value_len : u16 BE ]   // 0..4096
    [ value     : bytes  ]   // UTF-8
  ]
[ body_len    : u32 BE   ]   // 0..1,048,000
[ body        : bytes    ]
```

### 5.2 Response frame

```
[ kind        : u8 = 0x02 ]
[ seq         : u32 BE   ]   // matches the request's seq
[ status      : u16 BE   ]   // HTTP status code
[ header_n    : u8       ]
[ headers     : same layout as request ]
[ body_len    : u32 BE   ]
[ body        : bytes    ]
```

### 5.3 Limits

| Limit | Value |
|---|---|
| Max method | 16 bytes |
| Max path | 4096 bytes |
| Max headers | 32 |
| Max header name | 64 bytes |
| Max header value | 4096 bytes |
| Max body | 1,048,000 bytes (~1 MiB; fits in one Noise frame after AEAD overhead) |
| Concurrent in-flight requests | 8 |

Exceeding any limit on receive ⇒ session terminated with ERROR `MSG_INVALID`.

### 5.4 Multiplexing semantics

The Noise channel is bidirectional and full-duplex. The phone may send a new request before the response to a prior request arrives. Up to 8 concurrent in-flight requests; the 9th MUST wait for one to complete or be cancelled.

`seq` is allocated by the phone, monotonically increasing, never reused within a session. The instance MUST respond with the matching `seq` in its response frame.

If the phone sends two requests with the same seq ⇒ instance replies ERROR `SEQ_DUPLICATE` and closes the session.

If the instance replies with a seq the phone never sent ⇒ phone closes the session with `SEQ_UNKNOWN`.

### 5.5 Cancellation (kind 0x04)

Promoted to v0.1 because a hung request would otherwise block 1/8 of the phone's capacity until session teardown — a real denial-of-self risk under any of: server-side stall, slow LLM call, instance's outbound network glitch.

Phone sends a CANCEL frame to abandon an in-flight request:

```
[ kind        : u8 = 0x04 ]
[ seq         : u32 BE   ]   // matches an in-flight request seq
```

Semantics:

- The instance, on receiving CANCEL for `seq`, MUST stop processing the request as soon as practical (cooperative — best effort to abort the underlying handler) and MUST NOT send a response or error frame for that `seq` afterwards.
- The phone MUST treat the seq slot as freed *immediately* on sending CANCEL and MAY allocate a new request to a freshly-issued seq right away.
- If the instance has already sent a response frame before processing CANCEL, both messages are valid; the phone discards the late response.
- CANCEL of an unknown seq is ignored (not an error — the response may have arrived first and the phone just hasn't processed it yet).
- CANCEL is one-shot. There is no "uncancel."

Server-side: each handler invocation gets an `AbortSignal` wired up; CANCEL fires it. Existing routes that respect `req.signal` (already true for `fetch`-based outgoing calls) cooperatively abort.

### 5.6 Error frame (kind 0x03)

A third RPC frame kind, used when the responder cannot produce a normal response. Replaces an in-flight request; the `seq` matches the request that triggered it.

```
[ kind        : u8 = 0x03 ]
[ seq         : u32 BE   ]
[ code        : u16 BE   ]   // from §6.4 RPC-transport range
[ message_len : u16 BE   ]   // 0..256
[ message     : bytes    ]   // UTF-8, optional debug string
```

A frame with `seq == 0` is session-level (not tied to a specific request) and ends the session.

### 5.7 What's NOT supported in v0.1

- **SSE / streaming responses.** Every response is a single frame. The existing `query` SSE endpoint stays on `public_https` for now.
- **Request bodies > 1 MiB.** Mirrors current `query-sync` capture cap.
- **HTTP/2 push, trailers, chunked transfer.** Not needed for the existing app surface.

---

## 6 · Error codes + close semantics

### 6.1 Layered error scheme

Three layers; each owns its own code space. Codes are u16 BE.

| Range | Layer |
|---|---|
| `0x0001..0x00FF` | Relay control |
| `0x0100..0x01FF` | Noise handshake |
| `0x0200..0x02FF` | RPC transport |

### 6.2 Relay-control errors

| Code | Name | Recoverable? | When |
|---|---|---|---|
| `0x0001` | BAD_VERSION | No | Frame `version` byte mismatch. |
| `0x0002` | BAD_HELLO | No | Malformed HELLO_*. |
| `0x0003` | INVALID_PROOF | No | HELLO_INSTANCE proof_sig fails verification. |
| `0x0004` | NO_MATCH | Retry | Phone HELLO with no matching instance for 30s. |
| `0x0005` | INSTANCE_REPLACED | Retry | Older instance leg displaced by new instance HELLO. |
| `0x0006` | PEER_GONE | Retry | The other matched leg disconnected. |
| `0x0007` | MSG_TOO_LARGE | No | Frame payload exceeds limit. |
| `0x0008` | RATE_LIMITED | Backoff | Per §3.10 limits exceeded. |
| `0x0009` | RELAY_DRAINING | Retry | Relay is shutting down for upgrade; phone tries next relay. |

### 6.3 Noise-handshake errors

| Code | Name | Recoverable? | When |
|---|---|---|---|
| `0x0101` | STATIC_KEY_MISMATCH | No | Phone's pinned pubkey ≠ responder static. |
| `0x0102` | MAC_FAIL | No | AEAD tag invalid (handshake or transport). |
| `0x0103` | DEVICE_REVOKED | No | Instance recognised the phone's static_pk but the device row is revoked / suspended. |
| `0x0104` | UNKNOWN_DEVICE | No | Instance has no `app_devices` row for the phone's static_pk. Phone needs to re-pair. |
| `0x0105` | COUNTER_ROLLOVER | No | Send counter would overflow. Should never happen in practice. |

### 6.4 RPC-transport errors

| Code | Name | Recoverable? | When |
|---|---|---|---|
| `0x0201` | MSG_INVALID | No | RPC frame fails parsing. |
| `0x0202` | SEQ_DUPLICATE | No | Two requests reused a seq. |
| `0x0203` | SEQ_UNKNOWN | No | Response seq the phone never asked for. |
| `0x0204` | CONCURRENCY_LIMIT | Retry | More than 8 in-flight requests. |

### 6.5 ERROR frame layouts

**Relay-layer (rides directly in the WS frame's `payload`, type byte `0x0F`):**

```
type = 0x0F (ERROR)
payload:
  [ code        : u16 BE   ]
  [ message_len : u16 BE   ]
  [ message     : bytes    ]
```

**Noise-handshake-layer**: handshake errors (0x0101–0x0105) ride inside an ENVELOPE as a Noise transport message AFTER the failed handshake stage when possible, otherwise as a relay-layer ERROR if the Noise channel never came up. Practically: the responder sends an unencrypted relay-layer ERROR so the initiator learns why; this is acceptable because the affected session never produced any sensitive material.

**RPC-transport-layer**: see §5.5 (ERROR is RPC frame kind 0x03 with a `seq` field, rides inside a Noise transport message).

### 6.6 Close behaviour

| Side | On receiving fatal error | On receiving recoverable error |
|---|---|---|
| Phone | Display error, mark instance offline, do not retry until user action | First exhaust the relay list (§6.6.1), then backoff (1s, 2s, 4s, 8s, capped 30s) and retry |
| Instance | Log + emit telemetry | Reconnect to relay (already does this) |
| Relay | Close offending WS, increment metric | Close offending WS only |

A "user action" that re-enables retry: tapping the Retry pill, switching networks, or app foregrounding.

#### 6.6.1 Phone failover across relays

The phone tries `Instance.relay_endpoints` in order. If it gets:

- **Connection refused / TLS error / DNS fail** ⇒ try next relay immediately (0s delay).
- **`RATE_LIMITED` from relay N** ⇒ try relay N+1 immediately. Only when *all* configured relays return RATE_LIMITED does the phone enter backoff.
- **`NO_MATCH`** ⇒ the instance isn't reachable via this relay. Try the next one.
- **`PEER_GONE`** ⇒ the instance briefly disconnected. Retry the *same* relay once (0s) before falling over.
- **`INSTANCE_REPLACED`** ⇒ the instance just reconnected with a fresh leg. Retry the same relay.
- **`MAC_FAIL` / `STATIC_KEY_MISMATCH` / `INVALID_PROOF`** ⇒ fatal. Do not retry. Surface to user.
- **Connection succeeded but instance never sends a Noise response within 10s** ⇒ relay-layer NO_MATCH equivalent; try next relay.

Each retry generates a fresh ephemeral keypair (no reuse).

---

## 7 · Key rotation

### 7.1 Instance privkey rotation (operator-driven)

When the operator chooses to rotate (compromise scare, post-incident hygiene, scheduled rotation):

1. Operator generates a new Ed25519 keypair on the desktop.
2. New keypair is **stored alongside** the old one with a `superseded_at` timestamp on the old row in `instance_identity`.
3. New `instance_id_new = sha256(new_static_pk)[0..16)` is registered with the relay (HELLO_INSTANCE with the new key).
4. Old `instance_id` continues to register too — for a **30-day grace period** — so already-paired phones can still reach the instance.
5. During the grace period: phones reaching the old instance_id receive a special signed message inside the Noise channel (`INSTANCE_KEY_ROTATED` advisory + new pubkey + Ed25519 signature by the *old* key proving the rotation is authorized) and prompt the user to re-confirm.
6. Phone re-confirms via biometric tap; then it updates `Instance.pubkey_pinned` locally and starts using the new instance_id.
7. After 30 days, the old keypair's relay registration is dropped. Any phone that hasn't migrated must re-pair from scratch.

The advisory is signed by the **old** key; the signed payload is:

```
"ANTON-MESH-ROTATE/v1\n"
  || old_ed_pk
  || old_x_pk
  || new_ed_pk
  || new_x_pk
  || new_binding_sig                 // 64 bytes — the new identity's self-binding (§3.2)
  || rotation_epoch_u32_be           // monotonic; instance increments per rotation event
  || not_after_u32_be                // seconds-since-epoch when this advisory expires
```

Phone-side verification on receiving an advisory:

1. `Ed25519_verify(old_ed_pk, signed_payload, advisory_sig)` succeeds.
2. `rotation_epoch > stored_max_epoch_seen_for_this_instance` (replay protection — an attacker with the old key after rotation cannot produce a *retroactive* advisory with a lower epoch).
3. `now ≤ not_after`. The phone refuses an expired advisory; operator must re-issue.
4. The new identity's `new_binding_sig` is itself a valid self-binding signature over `(new_ed_pk, new_x_pk)`.
5. User confirms via biometric tap.

Without `rotation_epoch` + `not_after`, the advisory was replayable forever — fatal if the *old* key is later compromised (the very reason for rotation): the attacker could sign a *different* `new_pubkey` with the still-valid old key and downgrade-rotate any phone that hadn't migrated yet. Now that's bounded by both freshness and monotonicity.

### 7.2 Device key rotation (user-driven)

User got a new phone, or wants to revoke a lost one:

1. User adds the new device via the desktop pairing UI as if it were a fresh enrollment. New device pubkey, new device_id, new session token.
2. Operator can revoke the old device row (`UPDATE app_devices SET status='revoked'`). Subsequent handshakes from the old device fail with `DEVICE_REVOKED`.
3. `app_signed_envelope_nonces` for the revoked device are not garbage-collected immediately — they protect against replay during the revocation window.

There's no cryptographic "device key rotation" path that preserves identity; a phone losing its device key effectively has to re-pair. This is a deliberate simplification: device keys live only on one phone, biometric-protected.

### 7.3 Pairing re-pair without losing history

Sessions, messages, calendar items, etc. live in the database keyed by `org_id` + user. A re-pair issues a new device row + session token but doesn't affect data. The user sees the same chats and approvals as before.

---

## 8 · Pairing extension

The pairing QR (built by `server/services/app-enrollment-service.ts`) is extended with mesh-transport fields. The legacy fields (`instance_pubkey` etc.) stay for back-compat with `public_https` pairings.

```jsonc
{
  // ── existing fields (back-compat) ──────────────────────────────
  "instance_pubkey": "<hex Ed25519>",         // legacy — Ed25519 only

  // ── endpoints ──────────────────────────────────────────────────
  "endpoints": {
    "lan": "http://192.168.x.x:3001",
    "wan": "https://anton.example.com",
    "mdns_name": "_anton._tcp.local"
  },

  // ── transport ──────────────────────────────────────────────────
  "transport": "mesh",                          // 'public_https' (default) | 'mesh'
  "relay_endpoints": [                          // required when transport='mesh',
    "wss://r1.openexpert.org",                  //   each MUST canonicalize per §4.2.1
    "wss://r2.openexpert.org"
  ],

  // ── identity pair (mesh-only) ──────────────────────────────────
  // For mesh, pinning is the (ed_pk, x_pk) pair together with
  // binding_sig — substituting either key alone fails verification.
  "instance_ed_pk":   "<hex Ed25519, 32 bytes>",
  "instance_x_pk":    "<hex X25519,  32 bytes>",
  "binding_sig":      "<hex Ed25519, 64 bytes>"   // §3.2 self-binding signature
}
```

### 8.1 Phone-side QR verification (mesh pairings)

On scanning, before persisting any of it to `Instance`:

1. Reject if any `relay_endpoints` URL fails canonicalization (§4.2.1) or is non-`wss://` (§1.3).
2. Compute `expected_x_pk = ed25519_pk_to_curve25519(instance_ed_pk)`. Verify `expected_x_pk == instance_x_pk`. (Necessary — establishes that the X25519 key wasn't substituted post-hoc.)
3. Verify `Ed25519_verify(instance_ed_pk, "ANTON-MESH-IDENTITY/v1\n"||instance_ed_pk||instance_x_pk, binding_sig)`. (Sufficient — proves the operator deliberately created this pair.)
4. Verify `instance_id` (if present in QR) `== sha256(instance_x_pk)[0..16)`.
5. Persist `(instance_ed_pk, instance_x_pk, binding_sig)` together as the pinned identity. Subsequent connections require both keys to match — substituting either alone breaks verification.

`Instance.pubkey_pinned` (existing field, currently Ed25519-only) is widened to carry the JSON `{ed: ..., x: ..., binding_sig: ...}` for mesh pairings. `public_https` pairings keep the old single-pubkey form. Migration handled at read time by inspecting the structure.

Existing pairings (no `transport` field) default to `public_https`. No migration required for them.

A re-pair switches a phone to mesh transport without losing session history (sessions live in DB; only the device cert + session token get reissued).

---

## 9 · Authentication chaining

The mesh sits *underneath* the existing app-auth layer:

- **Noise IK** authenticates the phone's *device* (long-term static key)
- **`x-app-session` header + signed envelope** authenticates the *request* (existing replay-protected layer)
- **`connected_user_orgs` row check** authenticates the *user-org membership* (existing DB check)

A compromise at any one layer doesn't grant impersonation at the others. Every mesh-borne request still goes through the existing Express middleware pipeline unchanged.

---

## 10 · Threat model

Lives in `docs/ANTON_MESH_THREAT_MODEL.md`. Updated every phase. Sign-off required before Phase 5 (default-switch).

---

## 11 · Open spec, open relay

The reference relay implementation lives in `relay/` of this repo (Phase 2 deliverable). Apache 2.0 licensed. Anyone can run one for their org, point their pairings at it, and never touch openexpert infra. Wire compatibility across implementations is verified by `tests/mesh-vectors/` test vectors (Phase 2).

---

## 12 · Out-of-scope for v0.1 (explicit)

The deferral list is split into two tiers based on what blocks scale.

### 12.1 v0.2 — Operational hardening (lands BEFORE security extras)

These are deployment-level items the spec review surfaced as critical for sustainable operation past household scale. They ride ahead of onion routing because without them an SME-scale relay is operationally unsustainable.

1. **Idle-eviction policy.** Relay under memory pressure evicts long-idle sessions before active ones. Default: close any session with no ENVELOPE for 30 minutes via `RELAY_DRAINING` so the phone migrates cleanly.
2. **LAN shortcut hint.** When phone and instance share a LAN, relay-tunnelling doubles bandwidth. A `caps`-bit hint can enable a direct path; falls back to relay if direct fails. Doubles relay-bandwidth efficiency for the home-WiFi-most-of-the-time household case.
3. **PING interval tuning.** Raise idle PING from 25s to 60s. Idle keepalives currently dominate ~90% of relay bandwidth; 60s is still inside most cellular NAT timeouts. Enables a single relay box to host ~3× more idle users.
4. **Jittered failover.** §6.6.1's "0s immediate retry" causes thundering-herd when a relay restarts. Add 0–5s uniform jitter on every immediate retry path.
5. **`RELAY_DRAINING` pre-shutdown.** Relay emits draining 30s before SIGTERM; connected phones pre-migrate to the next relay instead of cascading on the failover one.

### 12.2 v0.2 — Enterprise profile

Lands when there is a credible enterprise pilot to motivate it.

6. **HSM / PKCS#11 integration** for `instance_identity.privkey_encrypted`. Required for FIPS / Common Criteria.
7. **mTLS leg under WSS.** Defense-in-depth for security teams that won't trust Noise alone.
8. **Signed audit-log export** in a format MDM/SIEM stacks can ingest.
9. **SAML/SCIM + device-posture checks** in the pairing flow.
10. **Browser-share surface** — a signed-link path that lets a non-paired client view a single brief without installing the Companion App.

### 12.3 v0.2 — Security extras (genuine future work)

11. **Onion routing / metadata privacy across relays.** Hides "which instance_id is busy when" from the relay.
12. **Phone-identity hiding.** Switch from Noise IK to IKpsk2 or XX so the phone's static pubkey isn't decryptable by anyone holding the instance pubkey (T15 limitation).
13. **0-RTT application data** in handshake msg 1. Field is reserved; populating it requires a replay-resistance design.
14. **SSE / streaming responses** for the chat path. Today every response is a single frame.
15. **Encrypted file transfer optimization.** Large `.anton` bundle exchanges currently share the same channel; no out-of-band fast path.
16. **Multi-hop relay forwarding.** All traffic is phone → relay → instance directly. No relay-to-relay.
17. **Post-quantum migration.** Curve25519 only. PQ-hybrid handshake deferred.

---

## 13 · Change log

- **2026-05-05** — Phase 0: structure + decisions locked.
- **2026-05-05** — Phase 1: full wire format, control protocol, handshake, RPC framing, error codes, key rotation.
- **2026-05-05** — Phase 1.7 self-review pass — 13 issues fixed before any code lands.
- **2026-05-05** — Phase 1.8 expert-review hardening pass — 9 wire-format / spec issues found by three independent expert reviews + scope re-statement:
   - **§4.7 nonce endianness** (CRITICAL): wire counter dropped entirely; AEAD nonce explicitly little-endian per Noise/IETF; receiver tracks counter locally. Earlier draft's "BE counter" superseded.
   - **§3.2 replay across relays** (CRITICAL): proof_sig now binds the canonical relay URL, blocking captured-proof replay at a different relay.
   - **§3.2 + §8 (ed_pk, x_pk) pair pinning** (HIGH): identity is now `(instance_ed_pk, instance_x_pk, binding_sig)` together — substituting either key alone fails verification. Closes the Ed25519↔X25519 birational sign-bit ambiguity.
   - **§3.6 ENVELOPE direction tag** (HIGH): added `from_role` field set by the relay; receiver drops mismatched-direction frames before AEAD.
   - **§4.5 phone-static-key visibility** (HIGH): documented in threat model T15. Phone's static pubkey is decryptable by anyone holding the instance pubkey — accepted limitation in v0.1, IKpsk2/XX deferred to v0.2.
   - **§7.1 rotation advisory replay** (MEDIUM): added `rotation_epoch` (monotonic) + `not_after`. Phones track max-seen-epoch.
   - **§3.10 IPv6 rate-limit bypass** (MEDIUM): rate buckets are now `/32` for IPv4 and `/64` for IPv6. Default concurrent-session ceiling raised from 8 to 32 (configurable to 256).
   - **§4.2 prologue canonicalization** (MEDIUM): full step-by-step algorithm spec'd with examples + test-vector commitment.
   - **§5.5 cancellation** (MEDIUM, scope decision): promoted to v0.1 as RPC kind 0x04. Closes the denial-of-self risk of a hung request blocking 1/8 capacity.
   - **§0 + §12 scope re-statement**: v0.1 explicitly targets *household + NGO + self-hosting SME*; mid-firm and enterprise need a v0.2 enterprise profile (HSM, mTLS, FIPS, browser-share, SAML/SCIM). Operational hardening items (idle eviction, LAN shortcut, PING tuning, failover jitter, RELAY_DRAINING) ride v0.2 ahead of onion routing.
- **Status:** Ready to drive Phase 2 implementation.
