# ADR-001 — React Native + Expo for v1.0

**Status:** Accepted (2026-05-14)
**Closes:** Spec §19 OD-01

## Decision

Build the v1.0 merchant app as a **React Native + Expo** application from
day 1. Not a PWA. Not Tauri Mobile.

## Context

The spec §5.2 recommended PWA-first on the grounds that:
- One codebase covers iOS Safari + Android Chrome installs without App
  Store review.
- Faster iteration, no reinstalls.
- Camera and notifications available.

Daniel chose RN+Expo against that recommendation. Reasons (captured at the
time of the decision):

1. **Secure-enclave key storage from day 1.** PWA on iOS is capped at Web
   Crypto + IndexedDB-encrypted-at-rest. RN+Expo can use the iOS Keychain
   and Android Keystore via `expo-secure-store`, which is the correct
   posture for a device handling real merchant transactions in a bar.
2. **Reliable background push.** iOS PWA background notifications are
   unreliable; merchants need the device to confirm incoming payments
   even when the screen is off.
3. **App Store distribution is the long arc.** Eventually we want to be
   in the Apple Business store and Managed Google Play. Starting native
   avoids the v1→v1.1 PWA→RN port the spec assumed.

## Consequences

**Accepted:**
- Slower first iteration (Expo Go on iOS requires a paid Apple Developer
  account for distribution beyond TestFlight; Android can sideload an
  APK like Comm App does).
- App Store review cycle on every release (typically 1–3 days).
- Native-module compatibility risk for some libraries (e.g.
  `sqlite-wasm` is web-only; switch to `expo-sqlite`).

**Mitigations:**
- The `@futurechain/sdk` stays pure TS / pure JS — no React, no Expo
  imports — so it works in both RN (now) and a later web context.
- Use Expo's managed workflow (no bare workflow) until we hit a feature
  Expo doesn't support; defer ejecting until forced.

## Alternatives considered

- **PWA first (spec §5.2):** Faster iteration but weaker security
  posture on iOS. Rejected per Daniel's call.
- **Tauri Mobile:** Spec §5.3 already rejected for v1.0. Re-evaluate for
  v1.1 if the iOS toolchain matures.

## Related

- [ADR-002 — Rust backend](ADR-002-rust-backend.md)
- [ADR-003 — Subdirectory layout](ADR-003-subdirectory-layout.md)
