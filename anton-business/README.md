# ANTON Business

Merchant-facing phone app for accepting FTC payments. See
[`../CLAUDE_ANTON_BUSINESS.md`](../CLAUDE_ANTON_BUSINESS.md) (v2.0)
for the full spec.

> **v2.0 architecture pivot:** ANTON Business is a phone-only app, like
> ANTON Comm. There is no merchant-backend in the production stack —
> the merchant arranges Safello sweep authority bilaterally, the phone
> talks directly to FutureChain RPC. The v1.0 backend + delegation
> implementation is preserved in `_archive/` if a hosted SKU is ever
> revived.

## Layout

```
anton-business/
├── apps/
│   └── anton-business-app/      React Native + Expo (TypeScript)
└── packages/
    ├── futurechain-sdk/          Shared TS SDK (wallet, pacs008, rpc, reference)
    └── shared-types/             Cross-cutting TS interfaces
```

Workspace is registered in the parent repo's `pnpm-workspace.yaml`.

## ADRs

Closed:

| ADR | Decision |
|---|---|
| [ADR-001](docs/adr/ADR-001-rn-first.md) | React Native + Expo for v1.0 |
| [ADR-003](docs/adr/ADR-003-subdirectory-layout.md) | Subdirectory of the ANTON repo |
| [ADR-004](docs/adr/ADR-004-reference-encoding.md) | Versioned remittance envelope (`v1:` / `v2:`) |

Superseded by the v2.0 pivot:

| ADR | Note |
|---|---|
| [ADR-002](docs/adr/ADR-002-rust-backend.md) | No backend in v2.0 |
| [ADR-005](docs/adr/ADR-005-delegation-envelope.md) | No delegation flow in v2.0 |

## Setup

```bash
# From the ANTON repo root
pnpm install

# Tests
pnpm --filter @futurechain/sdk test

# Run the app
cd anton-business/apps/anton-business-app
npx expo start                            # dev server (Expo Go)
npx expo run:android --device             # build + install APK
```

Phone install on Windows currently needs Defender exclusions added
first — see `apps/anton-business-app/README.md` for the workaround.

## What's in `_archive/`

The rolled-back v1.0 work: Rust + axum + sqlx merchant-backend with
working sqlx storage layer + 7 HTTP endpoints + ADR-005 delegation
verifier + 51 passing tests + cross-language parity fixtures. Read
`_archive/README.md` for the rollback rationale and recovery commands.
