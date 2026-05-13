# merchant-backend

Rust + Axum service for settlement orchestration, email kvitto delivery,
KYB lookups, and (v2.0) webhook delivery. See
[`../../docs/adr/ADR-002-rust-backend.md`](../../docs/adr/ADR-002-rust-backend.md)
for why this is Rust and not Node.

## Local setup

```bash
# 1. Postgres (any 16+). Suggest reusing the dev box:
createdb anton_business
createuser anton_business --pwprompt

# 2. Copy env
cp .env.example .env
# Edit DATABASE_URL if you used different creds.

# 3. sqlx tooling
cargo install sqlx-cli --no-default-features --features postgres,native-tls

# 4. Run
cargo run
# health check: curl http://localhost:8787/health
```

## What's stubbed (sprint 1 carries these)

- `/health` — works.
- Everything else — not wired yet. Sprint 1 task 2 adds:
  - `POST /merchant/register` (matches `RegisterMerchantRequest` in
    `@anton-business/shared-types`)
  - `GET  /merchant/:address/transactions`
  - `GET  /merchant/:address/balance_history`
  - `GET  /transaction/:uetr/status`
  - `POST /merchant/:address/delegate` (verifies a `SignedDelegation`
    per ADR-005)

## Tests

```bash
cargo test
# Parity tests require the SDK's fixtures — see Section §11 of the spec.
# Once ADR-004 is closed, fixtures live in
# anton-business/packages/futurechain-sdk/tests/fixtures/reference/
```
