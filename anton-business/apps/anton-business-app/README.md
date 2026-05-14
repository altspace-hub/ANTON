# anton-business-app

React Native + Expo merchant app — **phone-first** (v2.0 spec). See
[`../../docs/adr/ADR-001-rn-first.md`](../../docs/adr/ADR-001-rn-first.md)
and [`../../../CLAUDE_ANTON_BUSINESS.md`](../../../CLAUDE_ANTON_BUSINESS.md).

No backend; the app talks directly to FutureChain RPC and stores
everything locally.

## Setup

```bash
# From the ANTON repo root
pnpm install

# Then in this directory:
pnpm start            # Metro bundler + Expo Dev Tools (Expo Go path)
pnpm android          # Build + launch on a connected Android device
pnpm ios              # Build + launch on iOS (Mac only)
```

## Windows + Gradle gotcha

Building the Android APK on Windows currently hits a Windows-Defender
file-lock that breaks Gradle's `dependencies-accessors` rename step.
Fix once via admin PowerShell:

```powershell
Add-MpPreference -ExclusionPath "C:\ANTON_PostgreSQLv2"
```

Or: install Expo Go from the Play Store and run `pnpm start` only.
Expo Go bundles `expo-secure-store` so the wallet flow works in it.

## Onboarding flow

| Route | Screen | Status |
|---|---|---|
| `/` | Wallet/config gate, redirects appropriately | ✅ |
| `/onboarding/welcome` | Pitch + Get Started | ✅ |
| `/onboarding/generate` | secp256k1 keypair into Keychain/Keystore | ✅ |
| `/onboarding/register` | Local merchant configuration form | ✅ (v2.0: no HTTP call) |
| `/onboarding/done` | Confirmation + next steps | ✅ |
| `/home` | Post-onboarding landing | ✅ stub |

## Sprint 2 (next)

| Route | Status |
|---|---|
| `/simple` — keypad → QR | TODO |
| `/extended` — cart → QR | TODO |
| `/transactions` — history + refund detail | TODO |
| `/settings/items` — saved item catalogue | TODO |
| `/settings/profile` — edit merchant config | TODO |

## Notes

- **All money values** are stored as `bigint` micro-FTC, never as
  floating-point JS `Number`. Display layer formats.
- **Strings in Swedish by default**, English available. UI strings
  live in `src/i18n/` (sprint 2).
- **PIN-encrypted key in expo-secure-store**, not in plain
  AsyncStorage. v2.0 keeps the OS-keychain encryption as the only
  layer; PIN-derived AES is deferred per CLAUDE_ANTON_BUSINESS.md §11.2.
- **No `console.log` of payloads or addresses** — only event types and
  IDs.
