# ADR-003 — Subdirectory of ANTON repo (not separate)

**Status:** Accepted (2026-05-14)
**Closes:** Project-level location question (not in spec §19, raised in review).

## Decision

`anton-business/` lives as a **subdirectory of the ANTON repo**
(`altspace-hub/ANTON`). Not a separate `anton-business` repository.

## Context

The spec §6 implies a separate top-level `anton-business/` monorepo with
its own git history. The reviewer (Claude Code) recommended a separate
repo on the grounds that:
- `@futurechain/sdk` should be publishable to npm independently.
- Different release cadence for the merchant app vs. ANTON.

Daniel chose subdirectory anyway. Reasons:

1. **Single source of truth during early build.** While the Business
   work is in v0.x and the team is one person + one AI agent, the
   coordination cost of two repos is higher than the isolation benefit.
2. **Memory continuity.** This repo's `CLAUDE.md` and the memory
   system already capture context Claude Code needs (PostgreSQL
   migration, fc-* services, FutureChain integration patterns).
   Splitting would dilute that.
3. **The `fc-*` services in this repo** (`server/services/fc-gateway-service.ts`
   etc.) need to coordinate with the new SDK. Same repo makes the
   migration easier to do incrementally.

## Consequences

**Accepted:**
- `@futurechain/sdk` cannot be published to npm yet (it lives inside a
  product repo). Workaround: when ANTON Wallet needs it, either also
  live in this repo, or use a pnpm workspace include trick, or split
  out the SDK only.
- The parent repo's `pnpm-workspace.yaml` gets entries for the new
  packages. Single `node_modules` at the repo root.
- The parent repo's `.gitignore` covers the new directories.
- Tooling like `pnpm --filter` works from the repo root.

**Mitigations:**
- The SDK package's `package.json` is set up as if it were independent
  (own `name`, own version, own publishConfig). When the split moment
  comes, `git subtree split --prefix=anton-business/packages/futurechain-sdk`
  gives a clean new repo with full history.
- Cargo workspace stays inside `apps/merchant-backend/` — fully
  isolated from any future Cargo workspaces ANTON might add.

## When to revisit

Split into a separate repo when ANY of the following is true:
- `@futurechain/sdk` v1.0 ships and ANTON Wallet needs to consume it.
- More than 3 contributors work primarily on Business code.
- The build/test minutes for ANTON outweigh the Business tooling's
  weight on the parent CI pipeline.

## Related

- [ADR-001 — RN first](ADR-001-rn-first.md)
- [ADR-002 — Rust backend](ADR-002-rust-backend.md)
