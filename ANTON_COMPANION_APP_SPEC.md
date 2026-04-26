# ANTON Companion App — Specification & Improvement Brief

> **Audience:** Claude Code
> **Purpose:** Full briefing on what the ANTON Companion App should be, how it connects to a user's ANTON instance (laptop, company server, NGO deployment), what Apple and Google require in 2026, and how the GUI should be crafted to match the quality of the main ANTON platform. This document is for comparing against the v1 already built and driving the next iteration.
> **First step for Claude Code:** Before writing a single line of code, run the investigation protocol in §1, then map every feature in this document against what already exists. Do not duplicate existing code. Extend where possible, replace only what is genuinely misaligned.
> **Scope boundary:** This spec is about the companion client app. The ANTON instance it connects to is outside scope — the Gateway spec owns the server side. Where they meet, this document references the Gateway contract but does not redefine it.

---

## 0. Context: Why a Companion App at All

ANTON runs as a full platform on a device someone owns or an organisation operates — a consultant's laptop, a company server, an NGO's offline node in a rural classroom. That is where the 238 modules, the 82 database tables, the seven-layer prompt builder, the full Coding Area, and soon AAP and the Beehive all live. That deployment model is non-negotiable: data stays local or organisational, and the frontier LLM capability is attached by API or served locally through Ollama.

The companion app exists because humans are not always sitting at that machine. A compliance officer needs to approve a mission checkpoint from a Stockholm train. A field teacher in Mali needs to dictate a voice note to the classroom's offline ANTON without opening a laptop. A consultant wants to glance at what ANTON drafted overnight while waiting for a coffee. A private user wants to speak to their personal ANTON while walking the dog.

The companion app is the thin, trusted, always-in-your-pocket surface to an ANTON instance. It is **not** a second ANTON. It contains no modules, no LLM keys, no databases, no execution. It is a secure remote control, capture device, approval surface, and voice interface for whichever instance the user has paired with.

This design preserves the P2P, local-first, no-centralised-relay principles. The app talks only to instances the user has explicitly paired with. No FutureChain servers broker the connection. There is no "ANTON cloud" between the app and the instance.

---

## 1. Investigation-First Protocol

Before changing anything, Claude Code must audit the existing codebase. The commands below are starting points; extend them as needed.

### 1.1 Find the current companion app

```bash
# Locate the companion app directory
find . -type d -name "*companion*" -o -name "*mobile*" -o -name "*-app" 2>/dev/null
ls -la
# Likely candidates: ./companion, ./mobile, ./anton-app, ./apps/companion
```

### 1.2 Identify the current platform stack

```bash
# Inside the companion app folder
cat package.json | grep -E "capacitor|ionic|react-native|expo|flutter"
ls capacitor.config.* 2>/dev/null
ls ios/ android/ 2>/dev/null
cat capacitor.config.ts 2>/dev/null
# Check Capacitor version
grep -E '"@capacitor/core"' package.json
```

### 1.3 Map the current feature surface

```bash
# List all screens/routes
find . -type f \( -name "*.tsx" -o -name "*.jsx" \) -path "*/pages/*" -o -path "*/screens/*" -o -path "*/routes/*" | head -50
# List stores/state
find . -type f -name "*.ts" | xargs grep -l "zustand\|redux\|jotai\|pinia\|valtio" 2>/dev/null | head -20
# List native plugins in use
grep -rE '"@capacitor(-community)?/[a-z-]+"' package.json
```

### 1.4 Audit the current secure-connection implementation

```bash
# Find pairing/enrollment flows
grep -rE "qr|pair|enroll|fingerprint|pin" --include="*.ts" --include="*.tsx" -l | head
# Find transport layer
grep -rE "websocket|ws://|wss://|fetch\(|axios" --include="*.ts" -l | head
# Find credential storage
grep -rE "secure-?storage|keychain|keystore|biometric" --include="*.ts" -l | head
# Find shared identity code
find . -name "identity.ts" -o -name "identity.js"
# Compare against the ANTON server's Gateway code
find ../server -name "app-gateway.ts" -o -name "identity.ts" 2>/dev/null
```

### 1.5 Check iOS and Android project health

```bash
# iOS: deployment target, entitlements, Info.plist declarations
cat ios/App/App/Info.plist 2>/dev/null | grep -E "UsageDescription|BackgroundModes" -A 1
grep -E "IPHONEOS_DEPLOYMENT_TARGET" ios/App/App.xcodeproj/project.pbxproj 2>/dev/null | head -3
# Android: target SDK, minSdk, permissions
grep -E "targetSdk|minSdk|compileSdk" android/app/build.gradle 2>/dev/null
grep -E "uses-permission|uses-feature" android/app/src/main/AndroidManifest.xml 2>/dev/null
```

### 1.6 Produce an audit report

After running the above, produce a short audit report with: (a) which platform/framework is in use, (b) which features from §8 are present/partial/missing, (c) which security controls from §5 are implemented, (d) which App Store / Play Store requirements from §6 and §7 are already met, (e) specific gaps against ANTON's design quality bar from §9. Do not start implementing before this report is reviewed.

---

## 2. Vision & Positioning

### 2.1 What the app IS

- A **thin, trusted remote** for an ANTON instance the user has paired with
- A **capture surface** — voice, camera, quick text — that feeds into the connected instance
- An **approval and review surface** for checkpoints, missions, and radar alerts from the instance
- A **voice-first entry point** to ANTON, particularly for the School pillar and accessibility contexts
- Available as both a **PWA** (for desktop and progressive install) and **native shells on iOS and Android** via Capacitor, sharing one web codebase

### 2.2 What the app IS NOT

- Not a standalone AI app — it has no API keys, no LLM access of its own, no modules
- Not a Cloud SaaS account — there is no "ANTON account" to sign up for
- Not a relay — it never proxies traffic between instances or users
- Not a replacement for the desktop ANTON UI — the full 36+ pages of modules, Coding Area, Intelligence Dashboard, etc. stay on the instance
- Not a self-contained offline mode — when paired with an offline NGO node, the app works on the LAN; when that node is unreachable, the app shows cached content and queues actions, it does not run ANTON features locally

### 2.3 Strategic frame

The companion app is a **wedge**. It is how a non-technical teacher in an NGO classroom, a compliance officer on the train, a senior partner between meetings, or a child learning with School Mode interact with ANTON without ever seeing a terminal. It is also **a persuasion surface for enterprises** — a CISO evaluating ANTON will open this app first. It has to be the best-looking, most trustworthy ANTON touchpoint in the product, because it is the one a decision-maker holds in their hand.

---

## 3. Platform Strategy

### 3.1 The recommendation: Capacitor + PWA, one codebase

The right architecture is a single React + TypeScript + Tailwind + shadcn/ui web codebase (matching ANTON's main stack) wrapped with **Capacitor** for iOS and Android native distribution, and also hosted as a PWA. This has three key properties:

1. **One codebase, three distribution surfaces** — PWA served from the ANTON instance itself (no separate domain needed), plus iOS App Store and Google Play binaries via Capacitor
2. **Design system parity with ANTON** — the main platform uses React + Tailwind + shadcn; the app can inherit the same design tokens and many of the same components, which is non-negotiable for the quality bar in §9
3. **Native APIs where it matters** — Capacitor's plugin bridge gives access to iOS Keychain / Android Keystore, biometrics, camera, QR scanning, push notifications, background fetch, filesystem, share sheet, and native speech recognition, while the rest of the UI remains web

Capacitor is now the de-facto standard for this pattern (its two big competitors — Cordova and pure React Native — have either declined or serve a different need). It is what modern hybrid apps like H&R Block's consumer app use in production.

### 3.2 Why not pure native (Swift + Kotlin)

Pure native would give marginal performance and platform-idiom gains at the cost of doubling the build and maintenance surface, losing design system parity with ANTON, and dropping the PWA distribution channel entirely. For a small team shipping to three surfaces, this is the wrong trade.

### 3.3 Why not pure PWA

As of iOS 17.4 Apple confirmed they will continue supporting Home-Screen Web Apps, but distribution through the App Store is still required for serious enterprise adoption — CISOs and procurement teams expect an App Store or Play Store listing, and NGOs increasingly require Managed Google Play distribution. A pure PWA cannot deliver that. The PWA surface stays as a low-friction fallback, not the primary distribution.

### 3.4 Why not React Native or Flutter

Both would throw away the React + Tailwind design parity with ANTON and force a UI rewrite. Capacitor keeps the existing web components in play.

### 3.5 Stack summary

```
Language:       TypeScript
UI Framework:   React 18 + React Router
Styling:        Tailwind CSS + shadcn/ui (same as ANTON)
Build:          Vite
Native shell:   Capacitor 7 (current at time of writing)
State:          Zustand or Jotai (small footprint — no Redux)
Data layer:     TanStack Query for instance API calls
Crypto:         @noble/ed25519, @noble/hashes (shared with ANTON core)
Storage:        @aparajita/capacitor-secure-storage (hardware-backed)
Biometrics:     @capgo/capacitor-native-biometric
QR scanning:    @capacitor-mlkit/barcode-scanning (Google ML Kit)
Speech:         @capacitor-community/speech-recognition + platform TTS
Push:           @capacitor/push-notifications (APNs + FCM)
PWA:            vite-plugin-pwa with Workbox
```

Android `minSdkVersion`: **26** (Android 8). `targetSdkVersion`: **36** (Android 16 — current Play requirement trajectory). iOS deployment target: **16.0**. iOS build with **Xcode 26 / iOS 26 SDK** minimum to satisfy the April 2026 App Store cutoff.

---

## 4. Three User Lenses

Every feature decision must be tested against three distinct lenses. The app is the same binary for all three, but the first-run flow, defaults, and emphasis differ.

### 4.1 Private Individual

**Who:** A person running ANTON on their own laptop or home server, using it for Life pillar tasks — news, personal finance, travel planning, community, maybe personal coding. Also the "solo consultant on their own machine" profile.

**Pairing scenario:** Opens ANTON on laptop, sees "Connect a phone" in settings, scans QR with the phone app. Done. Total time: under 30 seconds.

**Primary app use:** Quick voice capture ("remind me to look at X when I'm back at the laptop"), read morning radar digest, approve a mission checkpoint, ask an ANTON module a quick question while out, check on a long-running coding or research task.

**Design emphasis:** Personal, warm, low-ceremony. No enterprise chrome. Single-instance is the default. If the laptop is asleep or the user is off-network, the app shows the last sync and offers to queue.

**Key constraints:**
- Must work with a laptop that is not always on (discovery needs to degrade gracefully, queued actions sync when the laptop wakes)
- Zero friction to pair — no account creation anywhere
- Privacy story must be intuitive: "Your phone is talking to your laptop. Nothing goes through us."

### 4.2 Company / Organisation Employee

**Who:** A compliance officer at a bank whose employer runs ANTON on an internal server, a consultant at Advisense whose firm hosts a shared instance, a project manager in a corporate deployment. This is the `connected_user` role from the Gateway spec.

**Pairing scenario:** IT admin provisions the instance and generates either a per-user enrollment QR (one-time, 24h expiry) or a shared managed-enrollment profile pushed via MDM. User installs the app from their MDM-managed App Catalog, launches, scans or auto-enrolls, authenticates with their existing corporate SSO (the instance handles SSO, the app just rides it). Done.

**Primary app use:** Approving workflow checkpoints assigned to them, reading Regulatory Radar alerts their team subscribed to, reviewing outputs their ANTON drafted overnight, capturing meeting notes that flow into the firm's institutional memory, getting a mobile-friendly view of their deadlines.

**Design emphasis:** Professional, trustworthy, legible to a CISO. Supports multi-instance (an Advisense consultant might need to pair with client-hosted instances as well as the Advisense one). Supports MDM management (see §7.4). Clear data-residency story.

**Key constraints:**
- Must pass a CISO's 20-minute evaluation. This is probably the single most important constraint in the entire app.
- Must support multi-instance switching without ambiguity about which instance an action targets
- Must respect the instance's RBAC (the app shows only what the `connected_user` role is entitled to see)
- Must support Managed Google Play and Apple Business Manager distribution paths
- Must have a crisp Data Safety / Privacy Manifest story that matches what the company's legal team will verify

### 4.3 NGO / Humanitarian / Field Worker

**Who:** A teacher using School Mode on an offline classroom server, a health worker using ANTON for case documentation in a rural clinic, an NGO field coordinator working with a locally hosted instance running on Mistral + Ollama. This is where ANTON's humanitarian positioning lives.

**Pairing scenario:** NGO deployment comes pre-configured with an `.anton` profile bundle (§11.4) distributed via sideload APK or Managed Google Play for Work. Worker opens the app, selects their classroom/clinic from a list of local instances discovered via mDNS, authenticates with a PIN or locally-managed passcode. No cloud account, no SSO dependency.

**Primary app use:** Voice-first interaction (push-to-talk, long-press anywhere). Capture a photo of a form or a whiteboard and send it to ANTON for analysis. Read back the day's recommendations. Hand the phone to a student for School Mode voice interaction. All of this working offline or on sporadic LAN connectivity.

**Design emphasis:** Large tap targets, voice-first, high contrast, works at 10% battery, works in sunlight, works in any language the instance supports, works for users with low literacy via voice, works on cheap Android hardware from 2021.

**Key constraints:**
- **Must degrade gracefully on weak hardware** — the app should run on a 4-year-old Android Go device. This is a hard constraint, not a preference.
- Sideloaded APK distribution must be supported (not all NGOs can use Play Store)
- mDNS LAN discovery must work on networks with no internet connectivity at all
- Voice interaction must work with on-device speech recognition as a fallback when the instance's cloud speech is not available
- Language localisation is community-driven — the app must be i18n-ready with no hardcoded strings

---

## 5. Secure Connection Architecture

This is the single most important technical section. Get this wrong and the app is worse than useless — it is a risk.

### 5.1 Three connection modes

The app must handle all three transparently, choosing the best available:

**Mode A — LAN (mDNS / Bonjour):** When the phone and the ANTON instance are on the same Wi-Fi, the instance advertises itself via mDNS under a `_anton._tcp.local` service type. The app lists discovered instances during pairing. Traffic is direct, WebSocket over TLS with a self-signed cert pinned during pairing. This is the primary mode for home users and NGO field deployments.

**Mode B — WAN (public endpoint over HTTPS/WSS):** For company-hosted instances with a proper domain and public certificate, the app connects via `wss://anton.company.com` with a standard CA-signed cert plus optional certificate pinning. This is the primary mode for enterprise employees working from anywhere.

**Mode C — AAP P2P (deferred, integrates later):** Once the ANTON Agent Protocol is production, the app can act as an AAP observer of its paired instance — useful when the instance moves networks or is behind a strict NAT. Lower priority than A and B for v1, but the `identity.ts` shared with AAP is the reason this is trivial to add later (see §11.1).

The app tries Mode A first, falls back to Mode B, stays silent if neither succeeds. It never relays through any third party.

### 5.2 Enrollment flow (one-time, 30-second target)

The pairing protocol is inspired by Signal's device-linking and WireGuard key exchange. No passwords, no account creation.

1. **On the instance:** User opens a "Connect a device" flow. Instance generates a short-lived (60s TTL) **enrollment token** containing:
   - Instance public Ed25519 key
   - Instance contact hash (`ANTON-XXXX-XXXX-XXXX-XXXX` format, shared with AAP)
   - Instance endpoints (LAN mDNS name, optional WAN URL)
   - Instance self-signed cert fingerprint (for pinning)
   - A one-time nonce
   - For enterprise: the intended `connected_user` identity and its role
   - TTL expiry
   Encoded as a QR code (and a 6-word short code as fallback for NGO contexts where the QR doesn't scan cleanly).

2. **On the phone:** User opens app, taps "Pair with an ANTON", scans QR. App:
   - Generates its own fresh Ed25519 identity keypair (stored in Keychain/Keystore, never leaves the device)
   - Derives an X25519 shared secret with the instance
   - Sends a signed enrollment request back to the instance (containing its public key, device name, device model, OS)
   - Instance verifies the nonce, records the device, responds with a signed device certificate and connection config
   - App pins the instance cert fingerprint permanently

3. **Biometric confirmation:** App immediately requires the user to set up Face ID / Touch ID / device passcode as the unlock method for the device credential. No unlock = no instance access.

4. **Result:** App stores in Keychain/Keystore:
   - Its private key (hardware-backed where possible, protected by biometric)
   - The instance's public key and pinned cert fingerprint
   - The connection endpoints
   - The issued device certificate

All subsequent traffic uses this material. No passwords exist anywhere in this flow.

### 5.3 Transport security

- **TLS 1.3 minimum** for all WebSocket and HTTPS connections (both modes A and B)
- **Certificate pinning** — LAN mode pins the instance's self-signed cert fingerprint; WAN mode pins the cert chain at install time with a rotation window
- **mTLS** — the app's device certificate issued during enrollment is presented on every connection; the instance validates it
- **Signed message envelopes** — every request/response carries an Ed25519 signature over its payload with a monotonic nonce, defeating replay even if TLS is somehow stripped
- **No cookies, no bearer tokens** — the device certificate is the authentication primitive
- **Short-lived session tokens** — for individual API calls, a session token signed by the instance is issued on WebSocket handshake and expires in minutes

### 5.4 Credential storage on the phone

- **iOS:** Keychain Services with `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`, biometric access control (`LAAccessControl` with `.biometryCurrentSet`), Secure Enclave where available for the private key
- **Android:** Keystore with `setUserAuthenticationRequired(true)` and `setInvalidatedByBiometricEnrollment(true)`, hardware-backed when StrongBox is present, AES-256-GCM for symmetric material
- **Capacitor plugin:** `@aparajita/capacitor-secure-storage` (Capacitor 8 compatible, under active maintenance) wrapping the above, with the biometric plugin gating reads
- **Explicit delete on unpair** — removing an instance from the app must securely erase every credential associated with it
- **iCloud Keychain sync: OFF by default** for these credentials. A stolen iCloud account must not grant instance access.

### 5.5 What the app never stores

- Any LLM API key. These live only on the instance.
- Any user password. SSO, if used, is handled by the instance; the app never sees passwords.
- Any payment information. Out of scope entirely.
- Any instance data beyond a short cache of recent sessions and outputs the user has explicitly viewed (see §10).

---

## 6. iOS Requirements

### 6.1 SDK and tooling baselines (April 2026 cutoff)

- Built with **Xcode 26** and the **iOS 26 SDK** minimum (hard Apple cutoff from April 28, 2026)
- Deployment target: **iOS 16.0** (covers 98%+ of devices in use)
- Universal binary — iPhone and iPad (iPads are common in NGO and education contexts)
- 64-bit only

### 6.2 Privacy manifest and declarations

Every Capacitor plugin that reads from a privacy-impacting API (camera, microphone, biometrics, local network, etc.) must supply its own `PrivacyInfo.xcprivacy`. The app's own manifest must declare every reason code. Missing or incorrect privacy manifests are now the most common rejection reason.

Info.plist entries required:
- `NSCameraUsageDescription` — "Scan QR codes to pair with an ANTON instance and capture documents to send for analysis."
- `NSMicrophoneUsageDescription` — "Dictate messages and ask ANTON questions by voice."
- `NSSpeechRecognitionUsageDescription` — "Transcribe voice input on-device when your ANTON instance supports voice."
- `NSFaceIDUsageDescription` — "Use Face ID to unlock your ANTON credentials."
- `NSLocalNetworkUsageDescription` — "Discover and connect to ANTON instances on your local network." (required for mDNS)
- `NSBonjourServices` — `["_anton._tcp"]`
- `NSPhotoLibraryAddUsageDescription` — if exporting outputs
- `ITSAppUsesNonExemptEncryption` = `NO` (we use standard TLS and Apple crypto APIs — file an export-compliance self-classification)

### 6.3 App Review specifics

The typical App Review blocker for self-hosted-server companion apps is Guideline 4.2 ("Minimum Functionality"). To pass:

- The **first-launch experience must not be a dead end** if the user has not paired yet. Provide a demo/sandbox mode or a clear "connect your ANTON" illustrated walkthrough that reviewers can follow.
- Submit with **demo pairing credentials** pointing at a reviewer-accessible sandbox instance run by Anthropic… sorry, by FutureChain. This must be stood up before first submission.
- Make clear in the App Store description this is a companion to a self-hosted / org-hosted platform, not a standalone service. Guideline 3.1.3(b) "Multiplatform Services" and 3.1.3(c) "Enterprise Services" are the categories the app falls under and they explicitly permit this model without requiring IAP.
- User-generated content policy: the app displays outputs the user requested from their own instance. Moderation obligations do not apply in the usual sense, but Guideline 1.2 content-flagging UI should exist for anything like shared Beehive content that involves other users.
- If any part of the app lets minors interact (School Mode), age declaration and age-restriction guardian flows are required under the new 1.2.1(a) rules.

### 6.4 Distribution paths on iOS

- **Standard App Store** — primary distribution for private users and for NGO staff who can use Play Store / App Store freely
- **TestFlight** — beta pre-launch with up to 10,000 external testers. Use this for the Advisense early access and for NGO pilots.
- **Custom Apps via Apple Business Manager** — the right channel for a bank or enterprise deploying ANTON internally. The customer enrolls in ABM, selects the ANTON Companion as a custom app for their org, and distributes via their MDM.
- **Unlisted Apps** — hidden App Store listing accessible by private link. Good for small enterprise pilots that don't want a public listing.
- **Enterprise Program (Apple Developer Enterprise Program)** — **not the right choice**. It is explicitly for a company's own employees only and cannot be used by FutureChain to distribute a product.

---

## 7. Android Requirements

### 7.1 SDK and manifest baselines

- `targetSdkVersion` **36** (Android 16 — aligned with Play's 2026 trajectory)
- `compileSdkVersion` 36
- `minSdkVersion` **26** (Android 8). This is the lowest that still covers 99%+ of devices in active use and the lowest that supports hardware-backed Keystore reliably, which is a hard requirement.
- AndroidX throughout
- For NGO sideload scenarios: also produce a separate APK/AAB flavor with a more permissive minSdk (24) if hardware data from deployments warrants it

### 7.2 Permissions

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />  <!-- Android 13+ -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />  <!-- for long-running voice sessions -->

<!-- For mDNS LAN discovery -->
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
```

No `ACCESS_FINE_LOCATION`. We do not need it and requesting it triggers Data Safety consequences.

No `BLUETOOTH_*` unless the Beehive or AAP later use BLE for off-network peering (deferred to a later spec).

### 7.3 Data Safety section

Google Play's Data Safety form is enforced strictly in 2026. Fill it as follows:

- **Data types collected:** None directly by the app. Every piece of data the user sees came from their own paired instance. Declare "Data is not collected" — this is the correct answer and is the truthful one.
- **Data types shared:** None. Declare accordingly.
- **Security practices:**
  - "Data is encrypted in transit" — YES
  - "You can request that data be deleted" — YES (unpair wipes local cache; user controls everything else on the instance)
  - "Committed to follow Play's Families Policy" — YES if School Mode targets users under 13
  - "Independent security review" — optional but worth pursuing in year 1

This disclosure is a significant competitive advantage. Most AI apps cannot claim "no data collected."

### 7.4 Distribution paths on Android

- **Google Play (standard)** — primary public distribution
- **Managed Google Play** — for enterprise customers; they can whitelist ANTON Companion in their Google Workspace and push via Android Enterprise (MDM). QR-code enrollment (§5.2) pairs naturally with MDM provisioning.
- **Direct APK sideload** — essential for NGO deployments in regions where Play Store is unreliable or for fully offline environments. Maintain a signed APK on GitHub Releases. Note: from September 2026, Android requires developer verification for sideloaded apps in Brazil, Indonesia, Singapore, Thailand first, expanding globally by 2027. Complete Play Console developer verification now — it is required anyway for Play distribution and it insures against the sideload path closing.
- **F-Droid** — worth considering for NGO credibility. Requires a fully reproducible build and open source license, which ANTON's Apache 2.0 supports. Secondary priority.
- **Samsung Galaxy Store / Huawei AppGallery** — defer unless there is a specific NGO deployment that requires one.

---

## 8. Feature Scope

All features must respect the rule: **nothing runs in the app that should run on the instance.** The app surfaces, captures, and approves. The instance thinks.

### 8.1 First-run and pairing

- Opening splash with the ANTON mark and a single line: "Your AI coworker, remote."
- Three paths on first screen: "Pair with my ANTON", "Pair with my organisation's ANTON", "Learn more" (explainer, no account required)
- QR scanner full-screen, with 6-word short-code fallback below
- Post-pair biometric setup flow
- Post-pair quick tutorial: 3 screens, swipe to dismiss

### 8.2 Home / Inbox

The landing screen after pairing. Inspired by Linear's inbox and Arc's "sidebar as digest."

- Top: current instance name + status indicator (green/yellow/red dot), tap to open instance switcher
- Central feed grouped by type:
  - **For you to approve** — checkpoints, mission steps, compliance violations awaiting review
  - **Your radar** — new items from Regulatory Radar subscriptions
  - **Recent outputs** — sessions the instance finished overnight
  - **Missions running** — status of autonomous agent missions
- Each card: title, one-line preview, timestamp, tap to drill into full view
- Pull-to-refresh, bottom-tab navigation, floating action button bottom-centre for "New" (see §8.8)

### 8.3 Sessions / Module runner (mobile-optimised)

The full module runner lives on the instance. The app provides a mobile-appropriate subset.

- Module picker: search + recently used, not the full 238-module grid
- Mobile-optimised guided inputs — use bottom sheets with large tap targets, not dense forms
- Streaming output rendered as a chat-style transcript with extended thinking collapsible
- Quick actions at the bottom: copy, share, export to …, continue, open on desktop (deep link to the instance's web UI)
- Long outputs offer "email me when done" — user can close the app and get a push when the module finishes

### 8.4 Voice mode (first-class, not a toggle)

Voice is the differentiator for Life, School, and NGO lenses. It must be great.

- **Primary gesture:** long-press anywhere in the home feed to activate push-to-talk, or tap a persistent bottom mic button. Telegram-style hold-to-speak, release-to-send.
- **Wake word:** deferred. Battery and privacy cost too high for v1.
- **Turn-taking:** full-duplex where possible (ANTON starts speaking back as soon as first token arrives), natural barge-in (user can interrupt the response).
- **Visual feedback:** a single animated waveform in the mic button while listening, a subtle shimmer while the instance processes, captions appearing as the response streams. Haptic tick on each state transition.
- **Fallback stack:**
  1. Prefer the instance's speech pipeline (Whisper on Ollama, or whatever the instance has)
  2. Fall back to on-device Speech Recognition (iOS Speech framework, Android SpeechRecognizer) when the instance pipeline is slow or unavailable
  3. Always offer a "type to ANTON" toggle next to the mic — Apple's "Type to Siri" pattern, useful for quiet environments, accessibility, and literacy
- **TTS:** use platform TTS by default (iOS AVSpeechSynthesizer, Android TextToSpeech). Only use instance-side TTS when the user has selected a custom voice in their ANTON preferences.
- **School Mode:** the voice pipeline for a T1 School Mode session must work fully offline with a local Ollama+Whisper chain. This is the hard case; design for it first.

### 8.5 Capture

The app as a capture surface for the ANTON instance. All captures stream to the paired instance, processed there, never stored in the app beyond a short local cache.

- **Camera** — full-screen with a clean focus frame. Options: scan document (auto-crop + perspective correct), scan QR, quick photo. Documents can be multi-page (review and append before sending).
- **Voice memo** — hold-to-record with live transcription preview.
- **Quick text** — bottom-sheet with a compose box, large enough for two-handed typing, "paste and send" for URLs and snippets.
- **Share extension** (iOS) / **share target** (Android) — the app appears in the OS share sheet. User can share a webpage to "Send to ANTON" for reading list / research / radar context.
- Every capture lets the user pick the module/workflow to send it to: "Send to News reading list", "Analyse as a document", "Add to current gap analysis session", etc. Default is inferred from the capture type.

### 8.6 Approvals and checkpoints

The most important enterprise feature. When ANTON hits a checkpoint that needs human sign-off, the user gets a push. Tap the push → land directly on the approval view.

- Checkpoint card shows: module context, ANTON's recommendation with rationale, the full decision detail, similar past decisions (institutional memory pull), approve/modify/reject buttons
- Voice approval supported: "approve with a note that X compensating control is in place"
- Biometric re-confirmation required for high-severity checkpoints (configured by the instance's compliance rules)
- The app never makes the decision — it presents options and sends the signed user choice back to the instance

### 8.7 Notifications

Push notifications are the app's heartbeat. Rules:

- **Silent by default.** The user explicitly enables notification categories per instance. No surprise notifications.
- **Categories:** approvals (high priority, interrupt), radar alerts (priority level matches the radar item), mission completions (normal), mission errors (high), scheduled digests (low).
- **End-to-end privacy:** the push notification payload never contains confidential content. Only an opaque event ID. The app fetches details from the instance over the authenticated channel. This is standard for Signal, 1Password, etc.
- **iOS:** APNs + silent pushes for background refresh.
- **Android:** FCM. Managed Google Play deployments may use FCM topics per org.
- **Local fallback:** for NGO offline deployments that can't use APNs/FCM, fall back to WebSocket-persistent-connection with a foreground service (Android) or Background App Refresh (iOS) to surface events. Battery cost is real; make it a per-instance toggle.

### 8.8 Quick actions (FAB bottom-centre)

One tap opens a bottom-sheet menu with the user's most common verbs:

- 🎙 Voice to ANTON
- 📸 Capture document
- 💬 Ask a question
- ✅ Pending approvals (only if count > 0, with badge)
- 🔀 Switch instance (only if > 1 paired)

The menu is context-aware — different verbs surface depending on what the user does most with this instance.

### 8.9 Settings and multi-instance management

- **Instance list:** each paired instance is a card — name, endpoint, last sync, role (`connected_user` / `analyst` / `admin`), pairing date, unpair button
- **Add instance:** QR / short-code flow, same as first-run
- **Per-instance defaults:** default module, default notification settings, default voice language
- **Biometric policy:** unlock interval (immediate / 5min / 15min / session)
- **Theme:** auto / light / dark (dark is the default, see §9.1)
- **Language:** pulled from the instance; overridable locally
- **About:** version, instance version, licensing (Apache 2.0), link to the ANTON repo, transparency report on what data the app holds
- **Diagnostics:** a "collect logs" button that bundles local-only logs with no confidential content for support, user must explicitly opt in to send

---

## 9. UI/UX Design System (Matching ANTON's Quality)

The app must feel like it belongs to the same family as the main ANTON platform. ANTON's desktop UI already sets a quality bar (Advisense navy, teal accents, considered typography, dark theme). The mobile companion should feel like a sibling — not a child, not a clone.

### 9.1 Dark-first, not dark-sometimes

Following Linear, Arc, Raycast, Warp: the app is **designed dark-first** and the light theme exists but is secondary. Rationale is technical (OLED power, YouTube's confirmed 43% battery saving at full brightness), perceptual (modern tool apps feel right in dark), and brand (matches ANTON's desktop palette).

Base tokens:
- Background: `#0B1426` (Advisense navy, same as main ANTON)
- Surface (cards): `#111E36` with a 1px border at `#1C2C4A`
- Primary accent: `#2DD4A8` (ANTON teal)
- Secondary accent: `#0F766E` (deeper teal for hover / pressed states)
- Warning / attention: `#F59E0B` (amber)
- Error: `#EF4444`
- Foreground high-emphasis: `#F1F5F9`
- Foreground mid: `#94A3B8`
- Foreground low: `#475569`

### 9.2 Thumb-zone layout

Every primary action is in the bottom third of the screen. This is the 2026 standard and the reason Apple, Spotify, and Telegram have all moved primary controls to the bottom. Rules:

- **Bottom tab bar** with 4 or 5 tabs max, never more. v1 tabs: Home, Capture, Voice, Inbox, Settings.
- **Floating action button** bottom-centre, elevated, for the Quick Actions menu (§8.8).
- **Back button** respects platform — iOS uses swipe-from-left, Android uses the system back gesture. Do not render a software back button in the top bar.
- **Top bar** is minimal — instance name + status indicator only. No dense actions at the top.

### 9.3 Bottom-sheet architecture

Secondary content lives in bottom sheets, not full-screen takeovers. This is the 2026 pattern (iOS `UISheetPresentationController`, Android Material 3 bottom sheets). Use for:

- Module input forms
- Confirmation and approval flows (swipe up for full detail)
- Sharing / export menus
- Settings sub-pages
- Voice transcription preview

Full-screen transitions are reserved for: first-run, pairing, reading a long output.

### 9.4 Micro-interactions and haptics

Every state change gets a subtle signal:

- Haptic tick when voice recording starts (medium impact)
- Light haptic + colour pulse when an approval is signed
- Success haptic (double-tap) when a mission completes
- Warning haptic when an approval requires re-auth
- Never gratuitous — no haptic for scrolling, no haptic for screen changes

Animations are instructive, not decorative. Loading states show what's happening ("thinking", "searching your documents", "drafting output"), not just spinners.

### 9.5 Typography and spacing

- **Font:** Inter (already used by ANTON desktop). Self-hosted, variable font for weight.
- **Scale:** type scale is 1.25× ratio. Base 15px. Headings 20 / 24 / 30 / 36.
- **Line-height:** generous — 1.5× for body, 1.3× for headings.
- **Spacing:** 4px grid. Use `space-1` through `space-12` tokens. No arbitrary pixel values.
- **Corner radius:** 12px on cards, 8px on inline controls, full round only on avatars and the voice FAB.

### 9.6 Inspirations to steal (and the specific pattern to steal)

| App | Steal this |
|-----|-----------|
| **Linear (mobile)** | The inbox density, the keyboard-driven feel, the card pressable states, the way subtle 1px borders define hierarchy instead of shadows |
| **Raycast** | The quick-action command surface, the no-chrome aesthetic, the dark-first palette, the keyboard/gesture symmetry |
| **Signal** | The entire pairing UX, the E2EE story at enrolment, the device-list UI, the no-account philosophy |
| **Tailscale** | The zero-config feel, the device status indicators, the trust-on-first-use with explicit device approval |
| **1Password** | The biometric unlock rhythm, the recovery UX when biometrics fail, the managed-deployment pattern |
| **Arc Mobile** | The gesture-forward navigation, the way Arc treats the sidebar/inbox as the app |
| **Telegram** | Hold-to-talk voice UX, barge-in responsiveness, the way captions appear as transcription |
| **Notion** | Onboarding via a few smart questions generating a tailored home, the "no blank page" principle |
| **Apple Wallet** | The card metaphor for "a thing you hold" — paired instances could present as wallet-cards |
| **Duolingo** | Micro-celebration of small wins — ANTON can do this for completed missions, answered approvals, quality ratchet improvements |

Not on this list on purpose: Facebook, Instagram, TikTok, and any app optimised for attention-capture. The companion app is a **tool**, not an engagement product.

### 9.7 Specific anti-patterns to avoid

- **No neomorphism.** It is 2022-era and accessibility-hostile.
- **No glassmorphism in primary UI.** Acceptable as an overlay effect on bottom sheets if performance allows, forbidden on main surfaces.
- **No skeuomorphic 3D.** ANTON's quality is restraint, not ornament.
- **No hand-drawn illustrations.** Professional context.
- **No mascot.** (The ANTON name does heavy lifting.)
- **No full-width progress bars.** Use small, subtle indicators.
- **No dark-pattern consent flows** — first-run biometric setup must have a clear "skip" that actually works.

---

## 10. Offline, Resilience, and Network Quality

### 10.1 Offline queue

When the instance is unreachable:

- Captures (photo, voice memo, quick text) are queued locally with timestamp and intent
- Voice sessions recorded to completion are held in the outbox
- Approvals are NOT queued — stale approvals are dangerous. Show a "not connected" state and a retry-when-connected option requiring re-confirmation.
- Queue state is visible from the home screen status indicator (yellow dot = queued items waiting)

### 10.2 Cached content

- Last 50 outputs the user viewed — cached encrypted with a per-instance key
- Last radar digest
- Last inbox state
- Instance module index (for offline module browsing, even though execution requires connectivity)

Cache eviction: LRU, 100MB default, adjustable per instance.

### 10.3 Sync on reconnect

When connectivity returns:
- Outbox replays in order
- If any item fails (signature mismatch, instance rejected), it goes into a "needs attention" state, never silently dropped
- Conflict resolution is instance-side — the app sends its offline-generated timestamps and the instance decides authoritative order

### 10.4 Poor network behaviour

- Assume 3G-equivalent for NGO contexts. Every screen must be usable at 200kbps.
- Payloads compressed (gzip or brotli)
- Images from the instance served at request-time-appropriate resolution
- Streaming output: use SSE or WebSocket with explicit keepalive; if the connection drops mid-stream, the instance should resume from the last token rather than restart

---

## 11. Shared Infrastructure (Convergence Points)

### 11.1 `identity.ts` — shared with AAP and Gateway

The app's device identity uses the same cryptographic primitives and key format as AAP and the Gateway. A single `identity.ts` module in the shared workspace defines:

- Ed25519 keypair generation and signing
- X25519 key derivation
- Contact hash format (`ANTON-XXXX-XXXX-XXXX-XXXX`)
- Signed envelope format (payload + nonce + signature)
- Device certificate schema

This shared module is what makes Mode C (AAP P2P for the app) trivial to add later, and means there is exactly one security-critical crypto surface across all three (AAP, Gateway, Companion).

### 11.2 Mission observer role

For v1.5, the app can act as an observer on AAP-published missions. Receiving a signed Reasoning Trail from a mission, verifying the instance's signature, and displaying it in the Inbox is all that's needed. Do not implement mission **initiation** from the app in v1 — that belongs on the instance.

### 11.3 `.anton` bundle preview

The app should be able to receive a shared `.anton` bundle (via share sheet, URL, or QR) and render a **preview** of its contents — but the **import** action routes to the paired instance. The app never installs bundles into itself. It is a receiver and forwarder.

### 11.4 NGO profile bundles

A new bundle type, `companion-profile`, encodes a pre-paired configuration for an NGO deployment:
- Instance endpoint (LAN mDNS name)
- Instance public key and cert fingerprint
- Default language
- Default voice mode on
- Default theme
- Locked-down feature set (e.g. School Mode home as the only screen)

NGO admins distribute the APK alongside a profile bundle. On first launch the app sees the bundle in its documents directory, prompts the user to apply it, and pairs with minimal friction.

---

## 12. Implementation Phases

### Phase 1 — v1 alignment (current)

Audit the existing app against §1. Produce the audit report. Fix the highest-severity gaps against §5 (security) and §6/§7 (store compliance) first. Everything else is iterative.

### Phase 2 — Quality bar

Rework the UI to match §9. This is where the app goes from "works" to "worth showing a CISO." Focus: home / inbox, voice mode, pairing flow. These three screens are seen most and set the perceived quality.

### Phase 3 — The three lenses

Implement per-lens first-run and defaults (§4). Ship NGO profile bundles. Submit Custom Apps via Apple Business Manager and Managed Google Play distribution builds.

### Phase 4 — Convergence with AAP and Gateway

Refactor onto shared `identity.ts`. Add mission observer. Add `.anton` bundle preview. Prepare for Mode C transport.

### Phase 5 — School Mode specialisation

A focused school-mode build with voice-first home, guardian pairing flow, and offline-first everything. Potentially a separate App Store listing for the guardian-facing version.

---

## 13. Acceptance Criteria (what "done" looks like for Phase 2)

- [ ] Pairing with a local LAN instance via QR works in under 30 seconds end-to-end
- [ ] Pairing with a WAN instance (company-hosted) works with a pinned cert and survives the instance's cert rotation within the configured window
- [ ] Every credential stored on the phone is hardware-backed and biometric-gated; unpair wipes credentials verifiably
- [ ] Full round-trip voice conversation with the instance with natural turn-taking and barge-in, with captions streamed as the instance responds
- [ ] Approvals arrive as push notifications with no confidential content in the payload; tapping lands on the approval screen; biometric re-confirm works for high-severity approvals
- [ ] App passes App Store review with the Privacy Manifest, all usage descriptions, and a reviewer-accessible demo instance
- [ ] App passes Google Play review with a "no data collected" Data Safety declaration
- [ ] Home / Inbox / Voice / Pairing screens visually match the quality bar set by Linear, Raycast, and the ANTON desktop UI — evaluated by showing them to a neutral party with no context and asking "is this app from a serious company?"
- [ ] Works on a 2022 Android mid-range device (e.g. Samsung A23, 4GB RAM, Android 13) at acceptable performance — all animations 60fps, cold start under 2s
- [ ] Works on iPhone SE 3rd gen — the smallest reasonable iOS target

---

## 14. What This Document Does Not Cover

- The Gateway spec itself (`app-gateway.ts`, `connected_user` role semantics, server-side enrollment endpoints) — that's the server side, owned by the Gateway spec
- AAP P2P wire protocol — owned by the AAP spec
- School Mode curriculum and pedagogy — owned by the School Mode spec
- Push notification service infrastructure (do we need our own APNs/FCM bridge? or per-instance?) — worth a separate decision document
- In-app purchasing — out of scope; the app is free and Apache 2.0
- Wearable companion (Apple Watch, Wear OS) — explicit non-goal for v1; revisit after the three primary lenses are solid
- Desktop Electron wrapper — not needed; ANTON already has a desktop UI, the PWA covers casual desktop use

---

## 15. One more thing

The companion app will be many people's first impression of ANTON. A CISO evaluating whether to deploy ANTON across a 5,000-person bank will hold this app before she ever sees the desktop platform. A Minister of Education considering ANTON for rural classrooms will decide based on what the phone does, not the README. The quality bar is therefore not "good mobile app" — it is "would I stake my professional reputation on recommending this."

Everything in this document serves that bar.
