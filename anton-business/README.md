# ANTON Business

Merchant-facing FTC payment-acceptance app. See
[`../CLAUDE_ANTON_BUSINESS.md`](../CLAUDE_ANTON_BUSINESS.md) for the full
spec.

## Layout

```
anton-business/
├── apps/
│   ├── anton-business-app/      React Native + Expo (TypeScript)
│   └── merchant-backend/         Rust + Axum + sqlx + Postgres
└── packages/
    ├── futurechain-sdk/          Shared TS SDK (signing, PACS.008, RPC)
    └── shared-types/             Cross-cutting TS interfaces
```

`merchant-backend` is a Rust Cargo workspace; everything else is a TypeScript
pnpm workspace, registered in the parent repo's `pnpm-workspace.yaml`.

## Stack decisions

Three open decisions from the spec are closed via the ADRs in `docs/adr/`:

| ADR | Decision | Rationale (one line) |
|---|---|---|
| [ADR-001](docs/adr/ADR-001-rn-first.md) | React Native + Expo for v1.0 (not PWA) | Native secure storage + biometric from day 1 |
| [ADR-002](docs/adr/ADR-002-rust-backend.md) | Rust + Axum (not Node + Hono) | Type-level alignment with the FutureChain core; settlement reconciliation perf |
| [ADR-003](docs/adr/ADR-003-subdirectory-layout.md) | Subdirectory of the ANTON repo (not separate repo) | Single source of truth during early build; can split later if `@futurechain/sdk` graduates |

Two ADRs still open and blocking SDK work:

- [ADR-004 — Reference field encoding](docs/adr/ADR-004-reference-encoding.md) (stub)
- [ADR-005 — Delegation envelope format](docs/adr/ADR-005-delegation-envelope.md) (stub)

## Setup

```bash
# From the ANTON repo root
pnpm install                                    # picks up the new workspaces
pnpm --filter anton-business-app start          # Expo dev server
cd anton-business/apps/merchant-backend && cargo run    # backend
```

Real first-run setup (Expo prebuild, sqlx migrations, .env) is in each app's
own README.

## First sprint

Per spec §21, this scaffold is task 1 of the v1.0 first sprint. Next:

2. Implement `@futurechain/sdk` core (secp256k1 wallet, PACS.008 builder,
   reference encoder, RPC client) — needs ADR-004 closed first.
3. Wire the Expo app's onboarding flow (PIN + seed) against the SDK.
4. End-to-end smoke test against the FutureChain testnet.
