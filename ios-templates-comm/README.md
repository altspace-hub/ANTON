# iOS scaffolding templates — Comm App

These files cover the iOS-specific surfaces the Capacitor scaffold doesn't generate correctly out of the box (privacy manifest, usage descriptions, entitlements, Podfile). They're stored under `ios-templates-comm/` because we cannot run `npx cap add ios` on Windows — the Xcode project itself has to be generated on a Mac.

> **Companion App vs Comm App**: the Companion App's iOS templates live at `ios-templates/`. The two apps ship as separate iOS products with different bundle IDs (`com.futurechain.anton.companion` vs `com.futurechain.anton.communication`) and different URL schemes (`anton://` vs `anton-comm://`). Do **not** mix them up — copying the Companion App's Info.plist into the Comm App's Xcode project will fail App Store review.

## Bootstrap on a Mac (one-time)

Capacitor 8 doesn't accept a `--config` flag on `cap add`. Two options:

### Option A — temporarily swap the default config (recommended)

```bash
# from repo root, on a Mac
pnpm install

# Capacitor reads capacitor.config.ts by default. Back it up and
# swap in the Comm App's config for the duration of the add.
mv capacitor.config.ts capacitor.config.companion.ts.bak
cp capacitor.config.comm.ts capacitor.config.ts

# Generate the iOS project — lands at ios/ by default. capacitor.config.comm.ts
# sets ios.path = 'ios-comm' so cap will write there.
npx cap add ios

# Restore the default config.
rm capacitor.config.ts
mv capacitor.config.companion.ts.bak capacitor.config.ts
```

### Option B — point Capacitor at the file via env var

Some Capacitor releases honour `CAPACITOR_CONFIG_FILE`. Try it; fall back to Option A if it doesn't:

```bash
CAPACITOR_CONFIG_FILE=capacitor.config.comm.ts npx cap add ios
```

## Overlay the templates

After `npx cap add ios` succeeds, copy the templates into the generated project:

```bash
# from repo root
cp ios-templates-comm/App/App/Info.plist             ios-comm/App/App/Info.plist
cp ios-templates-comm/App/App/PrivacyInfo.xcprivacy  ios-comm/App/App/PrivacyInfo.xcprivacy
cp ios-templates-comm/App/App/App.entitlements       ios-comm/App/App/App.entitlements
cp ios-templates-comm/Podfile                        ios-comm/App/Podfile

cd ios-comm/App && pod install && cd ../..
npx cap open ios   # opens Xcode at ios-comm/App/App.xcworkspace
```

Then in Xcode:
1. Select the `App` target → **Signing & Capabilities**, set your Team.
2. Add **Push Notifications** capability (entitlement file already declares `aps-environment=development`).
3. Verify the bundle identifier matches `com.futurechain.anton.communication`.
4. Run on a device — the simulator can't exercise Camera / Microphone / Push.

## Why each file matters

| File | Purpose |
|---|---|
| `Info.plist` | Every privacy-impacting API needs a usage description; missing strings are the #1 App Store rejection reason. Plus our `anton-comm://` URL scheme for deep links. |
| `PrivacyInfo.xcprivacy` | Mandatory privacy manifest (Apple requirement since May 2024). Declares "no data collected, no tracking" — a real differentiator in the Data Safety story. |
| `App.entitlements` | Push notifications. The only entitlement we need. |
| `Podfile` | CocoaPods spec listing every Capacitor plugin pod. Capacitor's default Podfile is fine but missing a few of our optional plugins. |

## Subsequent syncs (after the bootstrap)

Once the project exists, `cap sync` honours `capacitor.config.comm.ts` more reliably:

```bash
pnpm build:comm:cap                      # CAPACITOR_BUILD=1 + correct base
# manual copy is still safer on Capacitor 8:
rm -rf ios-comm/App/App/public/*
cp -r dist/comm/* ios-comm/App/App/public/
```

Open Xcode and Cmd-R.

## Release checklist (for an App Store / TestFlight submission)

- [ ] Increment `CFBundleVersion` in Info.plist (or use Xcode's auto-increment).
- [ ] Set `CFBundleShortVersionString` to match `android-comm/app/build.gradle`'s `versionName`.
- [ ] Flip `aps-environment` to `production` in `App.entitlements` for the App Store build.
- [ ] Update `App Store Connect → App Privacy` answers to match `PrivacyInfo.xcprivacy` (the manifest informs the questionnaire but doesn't fill it in for you).
- [ ] Upload via Xcode Organizer or `xcrun altool`.
