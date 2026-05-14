# ANTON Business

Merchant-facing phone app for accepting FTC payments. See
[`../CLAUDE_ANTON_BUSINESS.md`](../CLAUDE_ANTON_BUSINESS.md) (v2.0)
for the full spec.

> **v2.0 architecture pivot (2026-05-14):** phone-only, like ANTON
> Comm. No backend, no Expo. The app source now lives at
> `../src/business/` (Vite + Capacitor + Tailwind), wrapped as an
> Android APK in `../android-business/`. Build with
> `pnpm build:business:cap` from the repo root.
>
> The previous Expo / React Native cut is preserved in
> `_archive/expo-attempt/` — see that dir's README for the
> toolchain story. The v1.0 backend + delegation flow is in
> `_archive/` proper if a hosted SKU is ever revived.

## What's in this directory

```
anton-business/
├── README.md                    (this file)
├── CLAUDE_ANTON_BUSINESS.md     v2.0 spec — phone-only architecture
├── docs/adr/                    ADRs (some superseded — see below)
├── packages/
│   ├── futurechain-sdk/         Shared TS SDK — wallet / pacs008 / rpc / reference
│   └── shared-types/            Cross-cutting TS interfaces
├── tests/                       Workspace-level integration tests
├── tsconfig.base.json
└── _archive/
    ├── expo-attempt/            ← previous app source (Expo / RN), kept for reference
    ├── merchant-backend/        ← v1.0 Rust backend (rolled back)
    └── sdk-delegation/          ← v1.0 delegation crypto (rolled back)
```

The phone app source lives **outside this directory** at
`../src/business/`. This directory now holds the shared SDK package,
the spec, ADRs, and the archived rolled-back implementations.

## ADRs

Closed:

| ADR | Decision |
|---|---|
| [ADR-003](docs/adr/ADR-003-subdirectory-layout.md) | Subdirectory of the ANTON repo |
| [ADR-004](docs/adr/ADR-004-reference-encoding.md) | Versioned remittance envelope (`v1:` / `v2:`) |

Superseded by the v2.0 pivot:

| ADR | Note |
|---|---|
| [ADR-001](docs/adr/ADR-001-rn-first.md) | RN + Expo — replaced by Capacitor + Vite on 2026-05-14 (Windows toolchain incompatibilities, see `_archive/expo-attempt/README.md`) |
| [ADR-002](docs/adr/ADR-002-rust-backend.md) | No backend in v2.0 |
| [ADR-005](docs/adr/ADR-005-delegation-envelope.md) | No delegation flow in v2.0 |

## Setup

```bash
# From the ANTON repo root
pnpm install

# Test the SDK
pnpm --filter @futurechain/sdk test

# Test the Business app's pure-logic services
pnpm test:business

# Build + install the Business app APK
pnpm build:business:cap
cd android-business && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
