# FutureChain payment fee policy — client/node contract

**Audience:** the FutureChain node + RPC operator (the `rpc.futurechain.eu` side) AND the ANTON wallet apps. Both MUST implement the identical formula, because the fee is part of the **signed** transaction (`change = totalIn − amount − fee`); the node cannot silently recompute it without invalidating the signature. It can only **accept or reject**. A mismatch ⇒ every payment is rejected.

**Date:** 2026-06-02.

## The fee

For a transfer of `amountSatoshi` (1 FTC = 100,000,000 satoshi):

```
pct  = roundHalfUp(amountSatoshi / 1000)     // 0.1%, nearest satoshi, EXACT integer math
fee  = min(pct, CAP)                          // cap first
fee  = max(fee, MIN)                          // then floor
```

- **Rate:** 0.1% = `amountSatoshi / 1000`.
- **Rounding — `roundHalfUp`, exact integer (no float):**
  `q = floor(amountSatoshi / 1000); r = amountSatoshi mod 1000; pct = q + (r >= 500 ? 1 : 0)`.
  Both sides MUST use this exact rounding (round half up at 500/1000).
- **CAP = 10,000,000 sat = exactly 0.1 FTC.** Any payment whose 0.1% exceeds 0.1 FTC pays exactly 0.1 FTC.
- **MIN (floor):**
  - **Node (network minimum):** **200 sat** (≈ a 200-byte tx at 1 sat/byte). The node rejects a tx whose fee is below the required minimum.
  - **App:** **250 sat** — a deliberate +50 buffer above the network min so a slightly larger tx never falls under and gets rejected. The app always pays ≥ what the node requires.

## Accept rule (node)

The node accepts a tx iff `tx.fee >= required(amountSatoshi)`, where
`required = clamp(roundHalfUp(amountSatoshi/1000), 200, 10_000_000)`.
**Overpayment is allowed** (this is what lets the app use the 250 floor while the network min is 200). The node should NOT require an exact match.

## App computation (ANTON)

```
fee = clamp(roundHalfUp(amountSatoshi / 1000), 250, 10_000_000)
```

The app pays exactly the 0.1% (capped), with a 250-sat floor for tiny payments. It never overpays above the 0.1 FTC cap. Single source of truth in the SDK: `computeNetworkFee(amountSatoshi)`.

## Worked examples

| amount | 0.1% (pct) | app fee | node required | accepted? |
|---|---|---|---|---|
| 0.2 FTC (20,000,000 sat) | 20,000 sat | 20,000 (0.0002 FTC) | 20,000 | yes |
| 0.0025 FTC (250,000 sat) | 250 sat | 250 | 250 (>200) | yes |
| 0.001 FTC (100,000 sat) | 100 sat | **250 (floor)** | **200 (floor)** | yes (250 ≥ 200) |
| 100 FTC (1e10 sat) | 10,000,000 | **10,000,000 (cap)** | 10,000,000 | yes |
| 200 FTC (2e10 sat) | 20,000,000 | **10,000,000 (cap)** | 10,000,000 | yes |

## Open question for the node side

Confirm the node uses **`fee >= required`** (minimum, overpay-OK), not `fee == required`. The 250-vs-200 split only works with the `>=` rule. If the node insists on exact, the app must drop its floor to 200 to match — tell the ANTON side and we will.

## Best (drift-proof) option

Expose the rule on **`GET /info`** (or `GET /fee`):
`{ "fee": { "rate_permille": 1, "cap_satoshi": 10000000, "min_satoshi": 200, "rounding": "half_up" } }`.
Then the ANTON client reads the structure from the node instead of hardcoding it — they can never diverge. Until that exists, both sides hardcode the constants above.
