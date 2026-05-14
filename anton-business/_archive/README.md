# _archive/

Rolled-back code from the v1.0 spec.

## Why this is here

The original `CLAUDE_ANTON_BUSINESS.md` v1.0 spec assumed a three-tier
architecture: phone app → Rust merchant-backend → FutureChain RPC +
Safello. After a design re-think on 2026-05-14, we switched to a
phone-first model:

- The merchant has a **direct** KYC + sweep arrangement with Safello,
  set up out-of-band. They configure the Safello receive address in
  the app once; thereafter all customer QRs point at that address.
- Safello sweeps + converts independently of anything we build.
- The phone is the **only** component we ship. It talks directly to
  FutureChain RPC, generates QRs, builds receipts locally, and
  optionally emails them via a transactional email API.
- No merchant-backend exists in our production stack.

Spec v2.0 documents the new architecture. See
`CLAUDE_ANTON_BUSINESS.md` at the repo root.

## What's archived

| Path | What it was |
|---|---|
| `merchant-backend/` | Full Rust Axum + sqlx service. 51 tests passing, 7 HTTP endpoints, Postgres schema, ADR-005 delegation verifier. Built and live-tested against Postgres before the rollback (commit `df11e43`). |
| `sdk-delegation/` | The `@futurechain/sdk` delegation TS module — `SettlementDelegation`, `SignedDelegation`, sign/verify with canonical JSON + SHA-256 + recoverable secp256k1. 20 passing tests. Cross-language parity verified against the Rust verifier above. |
| `delegation-fixtures.json` | The TS-generated delegation parity fixtures the Rust side consumed. |

## Why preserved rather than deleted

These represent ~2 sessions of careful crypto + spec work, all with
passing tests. If we ever want a **"hosted ANTON Business"** SKU (a
managed-service tier where FutureChain AB runs the merchant-backend
on behalf of merchants), this is a 90%-done starting point. The ADR-005
delegation envelope is also a clean reusable pattern for any other
"merchant signs a server-held authorisation" flow we might want.

## Recoverable in full from git history

If you need the full pre-rollback state with the working backend +
delegation wired into the SDK:

```
git show df11e43        # sqlx + Postgres storage swap commit
git show a4b62f2        # route handlers commit
git show 1cd65a9        # SDK delegation impl commit
git show 3430e6c        # Rust counterpart + parity tests commit
```
