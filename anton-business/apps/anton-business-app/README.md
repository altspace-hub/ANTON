# anton-business-app

React Native + Expo merchant app. See
[`../../docs/adr/ADR-001-rn-first.md`](../../docs/adr/ADR-001-rn-first.md)
for why this is RN and not a PWA.

## Setup

```bash
# From the ANTON repo root
pnpm install

# Then in this directory:
pnpm start            # Metro bundler + Expo Dev Tools
pnpm android          # Build + launch on a connected Android device/emulator
pnpm ios              # Build + launch on iOS (Mac only)
```

First time on iOS you'll need to `npx expo prebuild --platform ios` and
have a valid Apple Developer team set in `app.json`. We're keeping the
managed workflow until forced to eject.

## Routes (planned for sprint 1)

| Route | Screen | Status |
|---|---|---|
| `/` | Wallet-gate landing | stub |
| `/onboarding/activate` | Activation code + BankID | TODO |
| `/onboarding/wallet` | Generate / verify seed + PIN | TODO |
| `/onboarding/settlement` | Safello + bank config | TODO |
| `/simple` | Keypad → QR | TODO |
| `/extended` | Cart → QR | TODO |
| `/transactions` | History list | TODO |
| `/transactions/[uetr]` | Receipt detail + refund | TODO |
| `/settings` | Profile, items, security, devices | TODO |

## Notes

- **All money values** are stored as `bigint` micro-FTC, never as
  floating-point JS Number. Display layer formats.
- **Strings in Swedish by default**, English available. UI strings
  live in `src/i18n/` (sprint 1).
- **PIN-encrypted key in expo-secure-store**, not in plain AsyncStorage.
- **No `console.log` of payloads or addresses** — only event types and
  IDs, matching the `safeError()` pattern from the ANTON repo.
