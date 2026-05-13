# ADR-002 — Rust + Axum for merchant-backend

**Status:** Accepted (2026-05-14)
**Closes:** Spec §19 OD-07

## Decision

Build `apps/merchant-backend` as a **Rust + Axum** service. Not Node.js +
Hono.

## Context

The spec §5.1 recommended Node.js + Hono (or Bun) for the merchant
backend on the grounds that:
- TypeScript end-to-end with the RN app.
- Shared types via `packages/shared-types`.
- Fastest iteration.

Daniel chose Rust against that recommendation. Reasons:

1. **Alignment with the FutureChain core.** The Rust core has the
   canonical PACS.008 structs in `iso20022_pacs008.rs`. A Rust backend
   can `crate-import` (or vendor) these structs and get compile-time
   guarantees that what we submit matches what the chain accepts.
2. **Settlement reconciliation throughput.** End-of-day settlement
   crunches thousands of transactions per merchant. Rust's throughput
   matters less for individual requests and more for cron-style batch
   work.
3. **Operational profile.** A single small Rust binary is easier to
   deploy and supervise than a Node process tree with native deps for
   crypto.

## Consequences

**Accepted:**
- No code sharing between backend and app (the app is TS, backend is
  Rust). The reference encoding and PACS.008 structure are defined
  twice — once in `packages/futurechain-sdk` (TS) and once in
  `merchant-backend` (Rust). Tests must check parity.
- Slower iteration during early app↔backend integration. Cargo builds
  are slower than Vite HMR.
- Smaller pool of contributors (Rust is less common than Node).

**Mitigations:**
- Define the wire schema in a language-agnostic format (`.proto` or
  JSON Schema) and code-gen both sides from it, OR write a deliberate
  conformance test suite. Spec §11 reference encoding will get
  paired-test fixtures in both languages.
- Use sqlx with offline mode (`cargo sqlx prepare`) so the backend
  builds in CI without a live Postgres connection.

## Stack details

- **Web framework:** axum 0.7+
- **Async runtime:** tokio
- **DB:** sqlx 0.8 (Postgres). Migrations in `migrations/` per
  sqlx-cli conventions.
- **Serde** for JSON; **secp256k1** crate for signature verification of
  delegations.
- **Cargo workspace** rooted at `apps/merchant-backend/Cargo.toml` so
  members (`merchant-backend`, future `merchant-cli`, etc.) share a
  `Cargo.lock`.

## Alternatives considered

- **Node + Hono (spec §5.1):** Type-sharing with the app. Rejected per
  Daniel's call.
- **Node + Express:** Mature but heavier than Hono. Rejected.
- **Go + Echo:** Reasonable middle ground but no team familiarity.

## Related

- [ADR-001 — RN first](ADR-001-rn-first.md)
- [ADR-005 — Delegation envelope](ADR-005-delegation-envelope.md) — backend verifies the merchant's signed delegation; envelope format MUST match the SDK's signer.
