# ADR-005 — Settlement delegation envelope format

**Status:** SUPERSEDED (2026-05-14) — rolled back as part of the v2.0
architecture pivot away from a merchant-backend. The phone never signs
a server-held delegation in the new model; merchants arrange an exchange partner
sweep authority bilaterally with an exchange partner. The TS + Rust implementations
of this envelope live in `anton-business/_archive/` if we ever revive
a hosted-ANTON-Business SKU.

The text below preserves the original ADR for historical reference.

---

**Original Status:** Accepted (2026-05-14)
**Closes:** Spec §12.3 (settlement delegation), §19 OD-?? (envelope format)
**Decision:** Option 4 — Custom domain-separated SHA-256 envelope, signed
with the merchant's secp256k1 key. Deliberately distinct from PACS.008
transaction signing (which uses Keccak-256) to separate operational
signatures from on-chain transactions.

## The question

Spec §12.3 defines the data model for a settlement delegation — what the
merchant authorises `merchant-backend` to do on their behalf — but not
the **signing envelope**: how the payload is canonicalised, hashed, and
signed so the backend can re-derive the exact bytes that were signed and
verify them.

Without this nailed down, the SDK signer and the Rust backend verifier
can't agree on what "valid" means.

## The decision

Settlement delegations are signed using a **custom domain-separated
SHA-256 envelope**, distinct from FutureChain's PACS.008 signing (which
uses Keccak-256). Rationale:

1. **Operational ≠ transactional.** A delegation is an off-chain
   authorisation, not a transaction. Using a different hash function
   makes it impossible to confuse the two: a valid delegation signature
   can never accidentally validate a PACS.008.
2. **Stack alignment.** Both `@noble/hashes` (TS) and the `sha2` crate
   (Rust) ship SHA-256. No extra dependencies on either side.
3. **Versionable.** The domain string carries the version. Future
   schema evolution gets a new domain tag, never breaking old
   signatures.
4. **Auditable.** A 32-byte hash and a 65-byte recoverable secp256k1
   signature are easy to log + diff during incident response.

## The envelope

### Domain separation tag

```
anton-business:settlement-delegation:v1
```

UTF-8 bytes, exactly 39 characters. The `v1` suffix is the **envelope
version**, not to be confused with the payload's schemaVersion field
(currently also `v1` — they happen to align but evolve independently).

### Canonical JSON rules

The payload is serialised to JSON with these rules:

1. **Keys sorted lexicographically** at every nesting level
   (byte-wise sort on the UTF-8 encoding).
2. **No whitespace** anywhere — no spaces, no newlines, no tabs.
3. **Standard JSON escaping** of strings — escape `"`, `\`, control
   chars per RFC 8259. Do NOT emit `\u` escapes for printable
   non-ASCII (e.g. `é` stays as `é`, not `é`).
4. **BigInt as decimal string.** JSON numbers cannot represent
   arbitrary-precision integers. Fields documented as `bigint` in the
   TS interface MUST be serialised as JSON strings of their decimal
   form (e.g. `"1000000000"`). The validator/decoder parses them back.
5. **Regular numbers as JSON numbers.** Fields documented as `number`
   (e.g. Unix timestamps) serialise as JSON numeric literals.
6. **Booleans / null** standard JSON.
7. **UTF-8 encoding** before hashing.

This is a minimal subset of RFC 8785 JCS — sufficient for our flat
typed payloads, simpler to implement in both TS and Rust without
pulling in a full JCS library.

### Hash construction

```
hashInput = utf8(domain) || 0x0a || canonicalJson(payload)
hash      = SHA-256(hashInput)                              ; 32 bytes
```

The `0x0a` (newline) separator between domain and payload is mandatory
and unambiguous: the domain tag contains no `0x0a` byte, so a parser
cannot mistake the boundary.

### Signing

```
signature = secp256k1.signRecoverable(hash, privateKey)     ; 65 bytes
```

The signature is recoverable: 64 bytes (r, s) plus 1 byte recovery id
(0 or 1). Recoverability lets the backend derive the signer's public
key — and from that, their FutureChain address — without needing the
public key alongside the signature. Audit and dispute resolution
benefit; trust does not (the signature is still binding regardless).

### Wire format

The `SignedDelegation` envelope serialised over HTTP:

```json
{
  "schemaVersion": "v1",
  "payload": {
    "maxPerDayMicroFtc": "1000000000",
    "merchantId": "KTH00001",
    "nonce": "550e8400-e29b-41d4-a716-446655440000",
    "exchangeReceivingAddress": "fc_exchange_a1b2c3...",
    "validUntil": 1893456000,
    "walletAddress": "fc_merchant_x9y8z7..."
  },
  "signature": "0xabcd...0064"
}
```

- `schemaVersion` — payload schema version. Bumped when the
  `SettlementDelegation` interface changes. Backend rejects unknown
  versions with a clear error.
- `payload` — the `SettlementDelegation` object, keys sorted (the
  serializer enforces this; the wire shape is descriptive).
- `signature` — `0x`-prefixed hex of the 65-byte recoverable
  signature. 132 hex chars total.

The recipient (`merchant-backend`):

1. Re-serialises `payload` using the canonical rules above. **Does
   NOT** trust whatever bytes were on the wire — re-derives them from
   the parsed JSON.
2. Computes `hash` per the construction above.
3. Recovers the signer's public key from `signature` + `hash`.
4. Derives the FutureChain address from the recovered public key.
5. Compares to `payload.walletAddress`. Mismatch → reject.
6. Validates `validUntil > now()`, `nonce` not previously consumed
   for this merchant, payload field constraints met.
7. Persists if all checks pass.

### Replay protection

- `nonce` is the primary defence. Backend stores the set of nonces
  consumed by each merchant; rejects duplicates.
- `validUntil` bounds the validity window (spec §12.3: rotate every
  90 days). Backend rejects after expiry.
- The backend's storage is **per-merchant** keyed by `merchantId`.
  Within a merchant's namespace, only the latest delegation is
  active — submitting a new valid delegation supersedes the previous
  one (without need for explicit revocation). The nonce-uniqueness
  rule prevents the previous delegation's nonce from being used to
  resurrect it.

### Revocation

There is **no separate revocation envelope**. To revoke:

1. Merchant signs a new `SettlementDelegation` with the SAME
   `walletAddress` and `merchantId` but `maxPerDayMicroFtc: "0"` and
   a fresh `nonce`.
2. Backend verifies, supersedes the prior delegation.
3. Result: settlement loop reads `maxPerDayMicroFtc = 0` and skips.

Pro of this design: one envelope format, one verifier path, no
"revocation" attack surface to worry about. Con: forces the
merchant's wallet to be available + unlocked to revoke (which is
also when it was needed to authorise — symmetric requirement).

If a merchant has lost their device, recovery proceeds via spec
§13.3 (BankID + 12/24-word seed on a new device), then sign a
zero-cap delegation. Until that happens, the daily cap limits drain.

## Test fixtures

`anton-business/tests/fixtures/delegation/` (created in sprint 1 task 2)
will hold 12+ paired (payload, hash, signature, signerAddress) records
covering:

- Each field at its boundaries (max bigint, future validUntil, etc.)
- Empty/missing optional fields
- Wrong-signer signatures (must fail recovery → address mismatch)
- Tampered payload (signature valid but payload byte-modified)
- Replay (same nonce reused)
- Expired (`validUntil` in the past)

TS implementation generates the fixtures; Rust verifier consumes them.
CI fails on any divergence.

## What this unblocks

- `packages/futurechain-sdk/src/delegation/{encode,sign,verify}`
  — implementation can land now.
- `apps/merchant-backend/src/services/delegation.rs` — verify path.
- `apps/merchant-backend/src/routes/delegation.rs` — `POST /merchant/:address/delegate`.
- Onboarding screen "Authorise auto-convert" in the Business app.
- Settlement orchestration loop (an exchange partner flow in spec §12.2).

## Reference implementation snippets

### TS — encode + sign (target shape for the SDK)

```typescript
import { sha256 } from '@noble/hashes/sha256';
import * as secp256k1 from '@noble/secp256k1';

const DOMAIN = 'anton-business:settlement-delegation:v1';
const NL = new Uint8Array([0x0a]);
const enc = new TextEncoder();

function canonicalJson(obj: Record<string, unknown>): Uint8Array {
  const sorted = Object.fromEntries(
    Object.keys(obj).sort().map(k => [k, obj[k]])
  );
  // BigInt fields must already be string-converted by the caller.
  return enc.encode(JSON.stringify(sorted));
}

export function sign(payload: SettlementDelegation, privateKey: Uint8Array) {
  const wireObj = {
    ...payload,
    maxPerDayMicroFtc: payload.maxPerDayMicroFtc.toString(),
  };
  const body = canonicalJson(wireObj);
  const input = new Uint8Array(enc.encode(DOMAIN).length + 1 + body.length);
  input.set(enc.encode(DOMAIN), 0);
  input.set(NL, enc.encode(DOMAIN).length);
  input.set(body, enc.encode(DOMAIN).length + 1);
  const hash = sha256(input);
  const sig = secp256k1.sign(hash, privateKey, { recovered: true });
  return { schemaVersion: 'v1', payload, signature: '0x' + bytesToHex(packSig(sig)) };
}
```

### Rust — verify (target shape for the backend)

```rust
use sha2::{Sha256, Digest};
use secp256k1::{Secp256k1, ecdsa::{RecoverableSignature, RecoveryId}, Message};

const DOMAIN: &[u8] = b"anton-business:settlement-delegation:v1";

pub fn verify(env: &SignedDelegation) -> Result<Address, DelegationError> {
    let canonical = canonical_json(&env.payload)?;
    let mut input = Vec::with_capacity(DOMAIN.len() + 1 + canonical.len());
    input.extend_from_slice(DOMAIN);
    input.push(b'\n');
    input.extend_from_slice(&canonical);
    let hash = Sha256::digest(&input);
    let sig_bytes = decode_hex(&env.signature)?;
    let recovery_id = RecoveryId::from_i32(sig_bytes[64] as i32)?;
    let sig = RecoverableSignature::from_compact(&sig_bytes[..64], recovery_id)?;
    let msg = Message::from_digest_slice(&hash)?;
    let pubkey = Secp256k1::new().recover_ecdsa(&msg, &sig)?;
    let addr = address_from_pubkey(&pubkey);
    if addr != env.payload.wallet_address {
        return Err(DelegationError::SignerMismatch);
    }
    Ok(addr)
}
```

## Related

- [ADR-002 — Rust backend](ADR-002-rust-backend.md) — verifier lives there.
- [ADR-004 — Reference encoding](ADR-004-reference-encoding.md) — entirely
  separate signing context. Reference encoding is NOT signed; PACS.008
  signing is Keccak-256; this ADR's delegation signing is SHA-256.
- Spec §12.3 — original `SettlementDelegation` data model.
- Spec §13 — overall key management posture.
