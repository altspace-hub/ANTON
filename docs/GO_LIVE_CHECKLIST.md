# ANTON Go-Live Checklist — Early July 2026 Launch

**Status as of 2026-06-09 · re-verified 2026-06-11.** Owners: `[ENG]` coding/in-repo · `[OPS]` operator/infra ·
`[LEGAL]` counsel/compliance · `[iOS]` needs a Mac + Apple account.

This is the single source of truth for the launch. It was produced from a 6-surface readiness
audit (see *Appendix C*) and the in-repo fixes that followed. Tick boxes as items complete.

---

## ⏱ 2026-06-11 re-verification (HEAD `eb0b9074`, ~3.5 weeks to launch)

**63 commits landed since the 06-09 snapshot** — most of two large improvement plans
(`docs/APP_SECURITY_AND_UX_ROADMAP_2026-06.md` + `docs/ANTON_LOCAL_UPDATE_PLAN_2026-06.md`)
plus device-verified payment fixes. Everything below was ground-truthed against code/env/CI,
not taken from the doc's checkboxes.

**At-a-glance verdict:** the scoped launch (Android + ANTON Local, self-custody) is **on track
from the engineering side**. Launch is gated almost entirely on **operator + legal**.

**GREEN (verified):** all 4 keystores present + gitignored + never committed; EdDSA R8
`-dontwarn` in all 4 proguard files; `versionName` standardized `1.0.0`/`versionCode 1`;
typecheck clean; GitHub CI green + substantive; risk-disclosure gate now in ALL THREE money apps
(not just Pay); `stub_mode` auto-cutover wired; both 06-10 plans largely executed (Business
refund UI + address-poisoning guard, Companion real voice + relabeled wallet, Pay reset/haptics/
deep-link, Comm safety-number + avatar editor; ANTON Local: 33 modules surfaced, real Pathfinder,
autonomous Missions, Agents detail page + mesh fix, Markets loop repair, in-app Anthropic key,
cheap-model spine, A2A demo ladder; remittance i18n 2,830 keys). Test counts: server 1070, relay
219, Pay 246/Comm 629/Business 164/Companion 11.

> **Release-build re-verification (the #1 gate): ✅ 4/4 PASS from HEAD (2026-06-11).** All four
> apps produce signed release APKs; R8 + resource-shrink ran clean (the new @capacitor/haptics,
> @capacitor-community/speech-recognition, avatar, and refund code all shrank with the existing
> EdDSA `-dontwarn` rules — no proguard changes). Distinct signers verified:
> `CN=ANTON Communication` 24.2 MB · `CN=ANTON Pay` 2.9 MB · `CN=ANTON Business` 2.5 MB ·
> `CN=ANTON Companion` 24.2 MB. All versionCode 1 / versionName 1.0.0. (Companion's
> `android/capacitor.settings.gradle` was regenerated to hoisted paths by `cap sync` and committed
> so future builds don't depend on sync running first.) Remaining: bump versionCode per Play upload.

**OPEN — engineering (small):**
1. **E2E Cross-Browser CI workflow is RED** every run — the job starts the server with no
   `DATABASE_URL`, falls back to SQLite, crashes (`no such table: entity_nodes`,
   `server/db/init.ts:45`), `wait-on` times out. **CI-config issue (needs a Postgres service
   container), not an app regression** — but it's the one red signal on main.
2. **Companion APNs/FCM push dispatch still stubs** (`app-push-service.ts:193-203` throws); no
   `google-services.json` in any android project. Web-push works once VAPID keys set. → push
   scope is a **decision**, not done.
3. Minor residuals: mDNS endpoints default port 3011 (moot — `.env` PORT=3001 — wrong for fresh
   installs); `loggingBehavior:"production"` synced only in Business's `assets/capacitor.config.json`
   (debug-only gap); `APPS_SECURITY_AUDIT.md` §5 "no deep-link on money apps" now stale for Pay
   (the futurechain: intent filter landed); `dist-installer/win-unpacked/` + `builder-*.yml` still
   present (exclude from shipped tree); 14 untracked scratch files to delete; `pnpm audit` still
   `|| true`, no gitleaks/CodeQL; `ws` moderate advisory not yet bumped.

**OPERATOR ACTION LIST (ordered by lead-time):**
1. `[LEGAL]` **#1 risk, start now** — counsel-approved disclosure copy (bump `DISCLOSURE_VERSION`
   from 1 when it lands), real ToS/Privacy (drafts bannered at terms.futurechain.eu), MiCA/CASP
   classification, DPO/DPA. Brief: `docs/LEGAL_ACTION_BRIEF.md`.
2. `[OPS]` 🔑 **back up the 4 keystores + `.env`** — local-only on this machine (verified
   gitignored). Highest-risk single item; recipe in `SESSION_HANDOVER_2026-06-10.md §0`.
3. `[OPS]` **set `INSTANCE_KEY_ENCRYPTION_KEY` in `.env`** — still ABSENT (verified name-only);
   without it the instance Ed25519 privkey sits plaintext in Postgres. (`ENCRYPTION_KEY` present.)
4. `[OPS]` **mainnet node + `stub_mode→false` cutover + small live payments** on Pay/Business/Comm.
5. `[OPS]` **terms.futurechain.eu DNS + Caddy + relay redeploy** (`docs/LEGAL_PAGES_DEPLOY.md`) —
   prod relay is a flat-file copy drifted since ~06-01 (missing the FCM wake-push commit + legal
   pages); full `relay/src` re-sync recommended.
6. `[OPS]` **real `google_cloud_project_number`** (Pay strings.xml still `0` → Play Integrity is a
   prod no-op); Play Console accounts + 4 listings + data-safety + screenshots; rotate dev API
   keys; clean-machine portable-bundle test.

**Open product decisions:** Pay brand colour (orange `#C97220` is current; the design brief
assumed blue) · dark-mode scope for July · Companion push in/out of launch. (Companion-wallet
decision already taken + executed = relabel/hide.)

---

## 1. Launch scope (decided 2026-06-09)

**SHIP:** ANTON Local (public GitHub download) **+** the four Android apps — Comm, Pay, Business,
Companion — in **self-custody / local-first** mode, on the **FutureChain mainnet**.

**DEFER to a fast-follow** (explicitly out of scope for the first launch):

- **iOS** — no Xcode projects exist yet; Pay/Business have no iOS templates. Almost certainly slips.
- **The hosted relay** — running a hosted EU relay triggers the heavy GDPR-controller + MiCA
  obligations. Self-custody / local-first collapses most of these. Enable the relay only after legal
  closes.
- **KYC / travel-rule enforcement** — deferred with the hosted relay (no custodial service at v1).

> **Audit verdict:** a full four-platform, hosted-relay, real-value early-July launch is **not**
> realistic. The scoped launch above **is**. Likeliest things to slip, in order: (1) iOS,
> (2) MiCA/GDPR legal sign-off, (3) mainnet-node day-one stability.

---

## 2. Status at a glance

| Surface | Status | Notes |
|---|---|---|
| ANTON Local build | ✅ Ready | `pnpm build` produces `dist/client` (+ PWA). |
| Android release builds | ✅ Verified | All 4 apps produce **signed** release APKs (see §6). |
| App signing keys | ✅ Exist · ⚠️ **must back up** | 4 distinct keystores, local-only. **§4.1 is the top risk.** |
| Self-custody risk disclosure | ✅ In code · ⚠️ copy placeholder | Legal must approve copy + URLs (§5). |
| FutureChain mainnet | ⏳ `[OPS]` | Node must be live + `stub_mode→false` (§4.2). |
| MiCA / GDPR legal | 🔴 `[LEGAL]` | **#1 risk, longest lead — start now** (§5). |
| Store accounts + listings | ⏳ `[OPS]` | Play + (later) App Store (§4.3, §6). |
| iOS | ⛔ Deferred | Fast-follow (§8). |

---

## 3. Critical path (≈3 weeks)

Front-load the long-lead items — legal and the mainnet node gate everything and cannot be compressed
by engineering.

**Week 1 — unblock + start the long-lead items**
- `[LEGAL]` **Engage EU counsel today.** Begin sign-off on `HOSTED_ANTON_COMPLIANCE_PLAN.md`, appoint
  a DPO, start the Bahnhof Article-28 DPA. (Even scoped self-custody needs the disclosure copy + URLs
  approved.)
- `[OPS]` Confirm the FutureChain mainnet node behind `rpc.futurechain.eu` is producing blocks; verify
  the `stub_mode→false` cutover end-to-end.
- `[OPS]` **Back up the 4 signing keystores** (§4.1) and create Play Console + App Store Connect
  accounts; reserve the four listings.
- `[OPS]` Secure a Mac + Xcode + Apple Developer account if iOS is wanted (long pole — start now even
  though iOS is a fast-follow).

**Week 2 — content + compliance execution**
- `[OPS]` Provide the real `google_cloud_project_number` (Pay Play Integrity) + `google-services.json`
  per app if FCM push is in scope.
- `[OPS]` Prepare store listings: screenshots, descriptions, data-safety forms, content ratings.
- `[LEGAL]` Article 30 records, signed Bahnhof DPA, DSR inbox + SLA, breach runbook (these are
  *hosted-relay* gates — needed before the relay, not the scoped launch, but start them).
- `[ENG]` Final production web builds + version-code bumps per app (§6); generate a real
  `ENCRYPTION_KEY`; confirm the shipped bundle ships `.env.example` only.

**Week 3 — submit + go/no-go**
- `[ENG]` Build signed release AABs for all 4 apps; verify each installs + runs on a real device.
- `[OPS]` Submit to Play (internal → closed → production); include a demo/reviewer note.
- `[OPS]` Flip `stub_mode→false`; do a **small live on-chain payment** on Pay, Business, and Comm.
- `[ENG]` Re-verify the ANTON Local portable bundle on a **clean Windows machine**.
- **Go/No-Go review** against §7. If iOS or legal slips, ship **Android + ANTON Local first**;
  fast-follow iOS.

---

## 4. Operator checklist `[OPS]`

### 4.1 🔑 Back up the app signing keystores — **DO THIS FIRST**

These are the apps' **permanent signing identities**. They are gitignored and currently exist **only
on the build machine**. Lose one and you can never publish an update to that app again.

| App | Keystore file | Alias | Config (passwords) |
|---|---|---|---|
| Pay | `anton-pay-release.keystore` | `anton-pay` | `android-pay/keystore.properties` |
| Comm | `anton-comm-release.keystore` | `anton-comm` | `android-comm/keystore.properties` |
| Business | `anton-business-release.keystore` | `anton-business` | `android-business/keystore.properties` |
| Companion | `android/anton-release.keystore` | `anton` | `android/keystore.properties` |

- [ ] Copy all 4 `.keystore` files **and** their `keystore.properties` (which contain the passwords)
      to secure, offline backup (password manager + an encrypted offline copy).
- [ ] Ensure they're present on whatever machine builds releases (they are NOT in git by design).
- [ ] **Enroll each app in Google Play App Signing** at first upload — Google then holds the real
      signing key and you can reset a lost *upload* key. Strongly recommended.

### 4.2 FutureChain mainnet

- [ ] Mainnet node behind `rpc.futurechain.eu` (Bahnhof) is up and producing blocks.
- [ ] Server `stub_mode→false` cutover verified (apps + ANTON Local switch from demo to real wallets).
- [ ] Small live on-chain payment confirmed on **Pay**, **Business**, **Comm**.
- [ ] Device-attestation tokens accepted by Bahnhof for `/submit_signed_transaction`.

### 4.3 Accounts, secrets, store config

- [ ] Google Play Console + App Store Connect accounts; four app listings reserved.
- [ ] Real `google_cloud_project_number` set in `android-pay/.../res/values/strings.xml` (currently
      placeholder `0`) — Pay Play Integrity verdicts fail without it.
- [ ] `google-services.json` per app if FCM push notifications are in scope for launch.
- [ ] Production `ENCRYPTION_KEY` (64-hex) generated and set in the server `.env`.
- [ ] **Rotate the dev API keys** that were in the local `.env` (Anthropic / Mistral / FMP / EODHD) —
      the audit quoted them into its output. (They were never committed to git — verified.)
- [ ] Shipped artifacts contain `.env.example` only, never a real `.env`.

---

## 5. Legal / MiCA checklist `[LEGAL]` — #1 risk, longest lead

Nothing in code can compress these. **Start week 1.** Scoping to self-custody / local-first defers
the heaviest hosted-relay obligations, but these are still required before launch:

- [ ] Counsel approves the **self-custody risk disclosure copy** (currently placeholder in
      `src/pay/components/RiskDisclosureSheet.tsx`) — bump `DISCLOSURE_VERSION` in
      `src/pay/services/disclosure.ts` when final copy lands so users re-accept.
- [ ] Real, published **Terms of Service** + **Privacy Policy** URLs (the sheet points at
      `https://terms.futurechain.eu/{terms,privacy}` — publish those pages, see step 5 / `docs/LEGAL_PAGES_DEPLOY.md`).
- [ ] Counsel sign-off on `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md` (currently Draft v0.2).

**Required before the HOSTED RELAY is ever enabled** (deferred with the relay, but long lead):
- [ ] DPO appointed + published. [ ] Bahnhof Article-28 DPA signed. [ ] Article 30 records populated
      (`docs/compliance/` does not exist yet). [ ] DSR inbox + 1-month SLA. [ ] Breach-response
      runbook + tabletop. [ ] SCC/adequacy stance for APNs/FCM (US transfer) before enabling push.

---

## 6. Per-app Android store submission `[ENG]` + `[OPS]`

All four apps: `minSdk 24`, `compileSdk/targetSdk 36`, `versionCode 1`.

| App | Package ID | versionName | Vite build | Android project |
|---|---|---|---|---|
| Pay | `com.futurechain.anton.pay` | `0.0.1` | `pnpm build:pay:cap` | `android-pay` |
| Comm | `com.futurechain.anton.communication` | `0.1.0` | `pnpm build:comm:cap` | `android-comm` |
| Business | `com.futurechain.anton.business` | `0.1.0` | `pnpm build:business:cap` | `android-business` |
| Companion | `com.futurechain.anton.companion` | `1.0` | `pnpm build:app:cap` | `android` |

**Release build, per app** (Comm/Pay/Business — manual asset copy; Companion uses `cap sync`):

```bash
# Comm / Pay / Business (X = comm|pay|business):
pnpm build:X:cap
rm -rf android-X/app/src/main/assets/public && mkdir -p android-X/app/src/main/assets/public
cp -r dist/X/* android-X/app/src/main/assets/public/
(cd android-X && ./gradlew.bat bundleRelease)     # AAB for Play upload (or assembleRelease for APK)

# Companion:
pnpm build:app:cap && npx cap sync android
(cd android && ./gradlew.bat bundleRelease)
```

Per app:
- [ ] Bump `versionCode` (+1) in `app/build.gradle` before every Play upload (never reuse a code).
- [ ] Build a **signed** release AAB; confirm it installs + runs on a real device.
- [ ] (Optional, recommended) Standardize `versionName` to a single pre-1.0 scheme — Companion is at
      `1.0` while the others are `0.x` (cosmetic, not blocking).
- [ ] Play listing: title, description, screenshots, **Data Safety** form, content rating, privacy
      policy URL.
- [ ] Push through internal → closed → production tracks.

> ✅ All four already verified to produce **signed** release builds with distinct identities
> (`CN=ANTON Pay` / `Communication` / `Business` / `Companion`).

---

## 7. ANTON Local (GitHub download) `[ENG]` + `[OPS]`

- [ ] `pnpm build` produces `dist/client/index.html` + assets (✅ verified) and `pnpm start` serves it.
- [ ] Re-verify the portable bundle on a **clean Windows machine** (no dev tools):
      `scripts/portable/build-portable.ps1` then `scripts/portable/test-bundle.ps1`; double-click
      `Start ANTON (portable).bat`.
- [ ] (Optional FTC pillar) `Start FutureChain (portable).bat` brings up the bundled node; ANTON Local
      auto-detects it and leaves stub mode. Core ANTON Local (expert modules) works without it.
- [ ] Remove dev build intermediates (`dist-installer/win-unpacked/`, `builder-*.yml`) from the
      shipped tree.
- [ ] Confirm the shipped repo/zip ships `.env.example` only (no real `.env`).
- [ ] LICENSE present (Apache-2.0 ✅).

---

## 8. iOS (deferred — fast-follow) `[iOS]`

Not required for the early-July launch. To do later, on a Mac:
- [ ] Mac + Xcode + Apple Developer account.
- [ ] Author iOS templates for **Pay** and **Business** (Companion + Comm have overlays in
      `ios-templates/`; Pay/Business have none).
- [ ] `npx cap add ios` per app; overlay `Info.plist` / `PrivacyInfo.xcprivacy` / entitlements /
      Podfile; complete the required-reason API entries (Camera/Mic/FaceID/Geolocation).
- [ ] Configure signing/provisioning; submit to TestFlight → App Store.

---

## 9. Go / No-Go gates

Ship the scoped launch only when **all** of these are true:

- [ ] All 4 Android apps: signed release AAB built + installs + runs on a clean device.
- [ ] FutureChain mainnet live; a real small-value payment succeeded on Pay/Business/Comm.
- [ ] Self-custody risk disclosure copy + real ToS/Privacy URLs **approved by counsel** and live.
- [ ] The 4 signing keystores backed up (and ideally Play App Signing enrolled).
- [ ] ANTON Local portable bundle verified on a clean machine.
- [ ] Production secrets set (`ENCRYPTION_KEY`); dev keys rotated.

**Fallback:** if iOS or hosted-relay legal isn't ready, **ship Android + ANTON Local first** and
fast-follow the rest. Do not let the apps touch real FTC value until the risk disclosure + counsel
sign-off are both in place.

---

## Appendix A — Signing keystore inventory

See §4.1. All gitignored (`*.keystore`, `keystore.properties`). `*.keystore.properties.example` files
are tracked and document the per-app pattern. **Each app must have its OWN key** — Business previously
shared Comm's key (fixed 2026-06-09).

## Appendix B — In-repo fixes shipped 2026-06-09

| Fix | Commit | Why it mattered |
|---|---|---|
| R8 EdDSA `-dontwarn` (all 4 apps) | `74501d5c` | Every app's *first* release build would crash (`X509Key`). |
| Pay release keystore + `.example` | `74501d5c` | Pay couldn't produce a signed APK. |
| Enrollment QR port 3011→3001 + LAN fallback | `74501d5c` | Companion pairing QR pointed at the wrong port. |
| Pay self-custody risk-disclosure gate | `3f96121d` | MiCA: no consent before real-wallet creation. |
| Business dedicated keystore + `.example` | `185e1cbc` | Business was signing with Comm's identity. |

## Appendix C — Audit + false-positive note

Full readiness audit: workflow output at `tasks/wvo5s1y7z.output`. **Five audit "blockers" were false
positives** (already done / never broken): frontend build, secrets-in-git, Comm on-chain send, Business
wallet-backup screens, and the portable-bundle FutureChain launcher. The real fixes are in Appendix B.
**Lesson: ground-truth every audit finding before acting on it.**

## Appendix D — Build / run facts

- `pnpm build` = `tsc -b tsconfig.app.json && vite build` (typechecks the **app** project only).
- `pnpm start` = `tsx server/index.ts` (runtime TypeScript — pre-existing server `tsc` errors do not
  block runtime or the build; worth cleaning up but not launch-blocking).
- Apps are independent Capacitor/Vite builds; release signing is read from each app's
  `keystore.properties`.
