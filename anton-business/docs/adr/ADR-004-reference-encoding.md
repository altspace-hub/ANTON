# ADR-004 — Reference field encoding format

**Status:** Open (BLOCKING SDK work)
**Owner:** Daniel Bardun

## The question

The PACS.008 remittance field is 140 chars in FutureChain Phase 1. We
need a structured encoding so the merchant backend can reconcile
incoming transactions to merchants, orders, refunds, etc.

Two formats are already in play:

**Format A — spec §11 proposal:**

```
M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL [I:3] [V:12500000] [D:..] [R:<uetr>]
```

- `M:` 8-char merchant id, `O:` 12-char order id, `P:` purpose
- Extended-mode tokens: `I:` items, `V:` VAT micro-FTC, `D:` discount
- Refund token: `R:` original UETR

**Format B — current `server/services/fc-transaction-service.ts`:**

```typescript
function buildRemittance(purpose: string, nature: string, goal: string, taskRef?: string) {
  let rem = `P:${purpose} N:${nature} G:${goal}`;
  if (taskRef) rem += ` T:${taskRef}`;
  return rem.slice(0, 140);
}
```

- `P:` purpose, `N:` nature, `G:` goal, `T:` task ref

These are **incompatible**. A receiver scanning the remittance can't
tell whether `P:RETAIL` is Format A purpose or Format B purpose, since
both use the same prefix but different semantics.

## Options

1. **Format A wins.** Migrate the existing ANTON gateway code to emit
   merchant-id-bearing remittances. The current `N:nature G:goal` data
   moves to a separate metadata channel.
2. **Format B wins.** The Business app emits `P:RETAIL N:order-A1B2C3 G:bar M:KTH00001`
   etc. Merchant id is just another tag, not a primary key.
3. **Versioned envelope.** Prefix every remittance with `v1:` (Format A)
   or `v2:` (Format B) so receivers can dispatch on version. Each format
   is internally consistent; cross-talk is impossible because the prefix
   guarantees the schema.
4. **TLV-style binary.** Tag-length-value encoded as base64. Denser but
   loses human-readability — and the field is meant to be auditable by
   a Skatteverket auditor reading the kvitto.

## Recommendation

**Option 3 (versioned envelope).** Pros:
- Backwards-compatible with the existing fc-* code (they keep writing
  `v2:P:OTHR N:agent-payment G:service`, just with a version prefix).
- Future-proof when we want to expand the schema.
- Stays human-readable (auditor can read it).

Required for the Business app:
- Define `v3:` as the merchant-bearing schema.
- SDK exports `encodeReference()` / `decodeReference()` per spec §11.3.
- Backend rejects unknown versions with a clear error.

## What this blocks

- `packages/futurechain-sdk/src/reference/encode.ts` cannot be
  implemented until this is decided.
- `apps/merchant-backend/src/services/reconciliation.rs` cannot match
  incoming transactions to merchants until the format is fixed.
- The `fc-transaction-service.ts` in the parent repo cannot be
  reconciled until this ADR is closed.

## Decision pending — Daniel to confirm

Once Daniel confirms a direction, this ADR moves to `Accepted` and the
test fixtures get written in both TS and Rust.
