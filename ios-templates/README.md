# iOS scaffolding templates — companion app

These files cover the spec §6 (iOS Requirements) gaps the Phase B audit
flagged. They're stored under `ios-templates/` because we cannot run
`npx cap add ios` on Windows — the Xcode project itself has to be
generated on a Mac.

## Bootstrap on a Mac (one-time)

```bash
# from repo root
pnpm install
npx cap add ios

# Overlay the templates onto the generated project:
cp ios-templates/App/App/Info.plist             ios/App/App/Info.plist
cp ios-templates/App/App/PrivacyInfo.xcprivacy  ios/App/App/PrivacyInfo.xcprivacy
cp ios-templates/App/App/App.entitlements       ios/App/App/App.entitlements
cp ios-templates/Podfile                        ios/App/Podfile

cd ios/App && pod install && cd ../..
npx cap open ios
```

## Why each file matters

| File | Spec | Purpose |
|---|---|---|
| `Info.plist` | §6.2 | Every privacy-impacting API needs a usage description; missing strings are the #1 App Store rejection reason. Includes `NSBonjourServices` for mDNS LAN discovery (§5.1 Mode A). |
| `PrivacyInfo.xcprivacy` | §6.2 | Mandatory privacy manifest. Declares "no data collected, no tracking" — a major competitive advantage in the Data Safety story. |
| `App.entitlements` | §5.4 + §6 | Keychain access group (private key storage), APS environment for push, optional associated-domains for universal links. |
| `Podfile` | §3.5 | Lists every Capacitor plugin used by the app. Updated as new plugins are added in Phases A–G. |

## Build targets

- Deployment target: **iOS 16.0** (98%+ device coverage)
- Build SDK: **Xcode 26 / iOS 26 SDK** — required by Apple from
  April 28, 2026.
- Universal binary — iPhone + iPad.
- 64-bit only (default).

## Distribution paths (spec §6.4)

1. App Store (standard) — primary public distribution
2. TestFlight — beta with up to 10,000 external testers; use for
   Advisense early access + NGO pilots
3. Custom Apps via Apple Business Manager — bank / enterprise internal
   distribution
4. Unlisted Apps — small enterprise pilots
5. Apple Developer Enterprise Program — **NOT** the right channel
   (FutureChain employees only, can't be used for product distribution)

## Reviewer-ready demo instance

App Review will reject under Guideline 4.2 ("minimum functionality") if
the first launch is a dead end. Stand up a reviewer-accessible sandbox
ANTON instance + ship demo pairing credentials in the App Store Connect
"Notes for Reviewer" field before first submission.
