# ADR-004 — Reference field encoding format

**Status:** Accepted (2026-05-14)
**Closes:** Spec §19 OD-04 (reference field encoding)
**Decision:** Option 3 — Versioned envelope. `v1:` = merchant-bearing schema
for ANTON Business; `v2:` = the existing `P:N:G:T:` schema used by the
ANTON gateway / agent payments.

## The question

The PACS.008 remittance field is 140 chars in FutureChain Phase 1. Two
schemas were already in play and **incompatible**:

- Spec §11 Format A (merchant-bearing): `M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL`
- Existing `fc-transaction-service.ts` Format B: `P:OTHR N:agent-payment G:service`

Both use the same `P:` prefix with different semantics. A receiver
scanning a remittance can't tell which schema it is.

## The decision

Every remittance written by FutureChain-aware code is prefixed with a
**version tag** of the form `<version>:` followed by an ASCII space (0x20)
and the format-specific body. The version tag is the first thing the
decoder reads; it dispatches on the tag and ignores the body's structure
otherwise.

Two versions are defined:

- **`v1:`** — Merchant-bearing schema for ANTON Business. Emitted by the
  Business app for retail/restaurant/event/service payments and refunds.
- **`v2:`** — Operational schema for the existing ANTON gateway / agent
  payment flow (`server/services/fc-transaction-service.ts`). Emitted by
  ANTON instances when an AI agent or human user pays through the gateway.

Anything that doesn't start with a recognised version tag is treated as
**free-text remittance** (legitimate — third-party wallets paying a
merchant won't know our schemas).

## v1 — Merchant-bearing schema

### Grammar

```
v1-remittance     = "v1:" SP token-list
token-list        = required-tokens (SP optional-token)*
required-tokens   = m-token SP o-token SP p-token
m-token           = "M:" merchant-id
o-token           = "O:" order-id
p-token           = "P:" purpose
optional-token    = i-token / v-token / d-token / r-token
i-token           = "I:" item-count
v-token           = "V:" vat-micro-ftc
d-token           = "D:" discount-micro-ftc
r-token           = "R:" original-uetr

merchant-id       = 8(ALPHA-UP / DIGIT)
order-id          = 12(ALPHA-UP / DIGIT)
purpose           = "RETAIL" / "RESTAURANT" / "EVENT" / "SERVICE" / "REFUND"
item-count        = "0" / (NZDIGIT 0*2DIGIT)               ; 0..999
vat-micro-ftc     = "0" / (NZDIGIT 0*17DIGIT)              ; 0..10^18 - 1
discount-micro-ftc= "0" / (NZDIGIT 0*17DIGIT)
original-uetr     = 8HEXLO "-" 4HEXLO "-" 4HEXLO "-" 4HEXLO "-" 12HEXLO

SP                = %x20
ALPHA-UP          = %x41-5A                                ; A-Z
DIGIT             = %x30-39                                ; 0-9
NZDIGIT           = %x31-39                                ; 1-9
HEXLO             = DIGIT / %x61-66                        ; 0-9 a-f
```

### Constraints

- Total encoded length **must be ≤ 140 chars**. Encoder validates and
  throws `ReferenceTooLongError` if exceeded (in practice unreachable
  given the field constraints — a fully-populated v1 record is 136
  chars).
- Required token order is fixed: `M` then `O` then `P`. Optional tokens
  may appear in any order, but the canonical encoder emits them as
  `I V D R` for byte-stability.
- `R:` (refund-of) is REQUIRED when `P:REFUND`; PROHIBITED otherwise.
  Validator enforces both directions.
- Whitespace: exactly one ASCII space (0x20) between tokens. No tabs,
  no leading/trailing spaces, no double spaces.

### Examples

Simple-mode RETAIL purchase (33 chars):

```
v1: M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL
```

Extended-mode RESTAURANT, 3 items, 12.5 SEK VAT (56 chars):

```
v1: M:KTH00001 O:A1B2C3D4E5F7 P:RESTAURANT I:3 V:12500000
```

Full refund of a prior tx (74 chars):

```
v1: M:KTH00001 O:A1B2C3D4E5F8 P:REFUND R:550e8400-e29b-41d4-a716-446655440000
```

### Merchant-ID allocation

Strategy (deferred to merchant-backend at `POST /merchant/register`):

1. Compute candidate = first 8 chars of `base32(keccak256(orgNr || pubkey))`.
2. If `merchant_id` already taken in `merchants` table, append a
   1-digit incrementer (`KTH00001A`, `KTH00002A`, …). After 35
   collisions, regenerate with a different deterministic input.
3. Return the allocated `merchantId` in the registration response.

Result: deterministic for the merchant's first registration, network-
unique, and stable across re-onboarding from the same org.

## v2 — Operational schema (existing)

### Grammar

```
v2-remittance     = "v2:" SP token-list
token-list        = p-token SP n-token SP g-token (SP t-token)?
p-token           = "P:" iso-purpose-code
n-token           = "N:" tag-value
g-token           = "G:" tag-value
t-token           = "T:" tag-value

iso-purpose-code  = 4(ALPHA-UP)                            ; ISO 20022 ExternalPurposeCode
tag-value         = 1*32(ALPHA / DIGIT / "_" / "-")
ALPHA             = %x41-5A / %x61-7A
```

### Backward compatibility

The existing `buildRemittance()` in `server/services/fc-transaction-service.ts`
emits the unversioned form `P:OTHR N:agent-payment G:service`. Two
options for that code:

1. **Migrate forward.** Prepend `v2: ` to every output. Atomic flag-day
   change. Affects every new ANTON-emitted transaction but is invisible
   to recipients (they'd still match on `P:` if they were doing dumb
   pattern matching — which they shouldn't be).

2. **Bilingual decoder.** Leave the emitter unversioned for now, but
   the decoder accepts both versioned and unversioned `P:N:G:T:`
   strings as v2. Phase out the unversioned form later.

Recommendation: **Option 2 first** (no breaking change to in-flight
ANTON instances), **Option 1 after** ANTON gateway is tested with the
versioned form for one release cycle.

## Decoder behaviour

The shared TS decoder in `@futurechain/sdk/reference` returns:

```typescript
type DecodeResult =
  | { kind: 'v1'; fields: V1Fields }
  | { kind: 'v2'; fields: V2Fields }
  | { kind: 'unversioned-v2'; fields: V2Fields }   // legacy fallback
  | { kind: 'unknown'; raw: string }               // free-text remittance
  | { kind: 'invalid'; reason: string };
```

- Never throws on input. Bad input yields `kind: 'invalid'` with a
  human-readable reason; the caller decides whether to log/escalate.
- `unknown` is the expected outcome for third-party transactions. The
  merchant-backend reconciler attaches these to merchant accounts by
  matching the creditor address only.

Rust side (`apps/merchant-backend/src/services/reference.rs`) exposes
the same `DecodeResult` enum with serde derive for snapshot testing.

## Parity testing

`tests/fixtures/reference/` (created in sprint 1 task 2) will hold a JSON
file of `{ input, expected }` pairs covering:

- Roundtrip: encode → decode → equal input (≥ 30 cases per version)
- Boundary lengths: 140 chars exact, 141 chars rejected
- Every `kind: 'invalid'` reason path
- Versioned + unversioned v2 acceptance
- Free-text passthrough

TS and Rust implementations both consume the fixture. CI fails if the
implementations diverge.

## What this unblocks

- `packages/futurechain-sdk/src/reference/index.ts` — implementation
  can land now.
- `apps/merchant-backend/src/services/reconciliation.rs` — can match
  incoming PACS.008s to merchants via the decoder.
- `server/services/fc-transaction-service.ts` in the parent repo — can
  migrate to emit `v2:` prefix (Option 2 → Option 1 path above).
- Spec §11 implementation work in the Business app onboarding,
  Simple-mode, Extended-mode, and refunds.

## Open question (not blocking)

**Should v1 carry a checksum?** Argument for: a typo in a manually-
constructed remittance would silently rebind a transaction to the wrong
merchant. Argument against: the merchant address (`to`) in PACS.008 is
the actual binding — the reference is metadata. Decision: **no checksum
in v1**. If we see real reconciliation errors, add `K:` (CRC-32 over the
preceding tokens) in v1.1.

## Related

- [ADR-001 — RN first](ADR-001-rn-first.md)
- [ADR-002 — Rust backend](ADR-002-rust-backend.md) — Rust decoder
  must produce identical DecodeResult to the TS one.
- [ADR-005 — Delegation envelope](ADR-005-delegation-envelope.md) —
  uses a different signing scheme; reference encoding is not signed.
