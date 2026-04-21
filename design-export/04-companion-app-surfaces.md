# 04 — Companion App Surfaces

**Self-contained.** Someone reading only this file should understand what the Companion App is, who it serves, and what Claude Design is being asked to redesign.

---

## What the Companion App is

The Companion App is the **thin remote** for an ANTON instance. It runs as a PWA, an Android APK/AAB, and (templates-ready) an iOS native shell — one React + TypeScript codebase under `src/app/` shared across all three surfaces.

It is explicitly **not** a second ANTON. It contains no LLM keys, no modules, no databases, no execution. It is a secure remote control, capture surface, approval gate, and voice interface for an ANTON instance the user has paired with.

The user role is `connected_user` (distinct from the desktop `user` role) — defined in `connected_users` + `connected_user_orgs` tables (migration `094_app_gateway.sql`).

---

## Who it serves (three lenses)

Per `ANTON_COMPANION_APP_SPEC.md` §4. The same binary; first-run + defaults differ.

1. **Private individual** — running ANTON on their own laptop. Pairs with a single instance, voice-first, low-ceremony.
2. **Company / organisation employee** — bank, consultancy, NGO. Pairs via MDM-pushed enrollment; multi-instance (firm + client deployments). The enterprise wedge — must pass a CISO's 20-minute evaluation.
3. **NGO / humanitarian field worker** — pairs via sideload + `companion-profile` bundle; voice-first; works offline on LAN; must run on a 4-year-old Android Go device.

---

## Architecture (built April 2026, autonomous overnight build, Phases A–I)

### Pairing — Ed25519 enrollment ritual (spec §5.2)

1. Admin opens "Connect a device" on desktop ANTON → instance issues a 60-second TTL **enrollment package** (instance pubkey + cert fingerprint + endpoints + intended user/role + nonce + optional 6-digit OOB confirmation code).
2. Phone scans QR → generates a fresh Ed25519 keypair (private key in iOS Keychain / Android Keystore via `@aparajita/capacitor-secure-storage`).
3. Phone signs `${token}.${nonce}.${publicKey}`, POSTs to `/api/app/enrollment/complete` with the user-typed confirmation code.
4. Server verifies + issues a device certificate + session token; phone immediately runs a biometric setup (`@capgo/capacitor-native-biometric`) so future high-severity approvals are biometric-gated.

### Multi-instance (spec §4.2 + §8.9)

Users pair with multiple ANTON instances (e.g., consultant pairs with their firm's instance and a client-hosted one). State lives in `src/app/services/instances.ts`. The active instance is unambiguous via `InstanceTopBar` + `InstanceSwitcher` (Apple-Wallet-style stacked card sheet). `setActiveInstanceAsync()` is race-free.

### Approvals (spec §8.6) — the enterprise wedge

`app_checkpoints` table → `/api/app/checkpoints/*` → `ApprovalsScreen` (now a primary tab with live badge). Severity-sorted inbox (critical → high → normal → low). Biometric re-confirm on `severity ≥ high` or `requires_biometric=true`. Responses are signed envelopes (Ed25519 signature + replay-protected nonce) when an Ed25519 keypair exists.

### Push (spec §8.7) — end-to-end privacy

`app_push_tokens` table + APNs / FCM / web-push dispatcher. Push payload contains **only** `event_id + severity + opaque title + deep_link` — never confidential content. The app fetches details via the authenticated channel after the tap.

### Voice mode (spec §8.4)

Telegram-style hold-to-talk full-screen overlay (`VoiceMode.tsx`). On-device speech fallback via `@capacitor-community/speech-recognition`. Live captions stream as the instance responds. Platform TTS via `tts.ts`. Immediate barge-in (tap during speaking → cancel TTS instantly).

### Capture (spec §8.5)

Camera / library / OS share-target → resize to 2048px / 70% JPEG quality → 1MB-capped POST to `/query-sync`. Web fallback uses `<input type="file" capture="environment">` + Canvas resize.

### FAB + bottom sheets (spec §8.8 + §9.3)

`QuickActionsFab` (bottom-centre, elevated) opens a 2-column `BottomSheet` with the user's most common verbs: Voice / Capture / Ask / Approvals (badged) / Switch instance.

### mDNS LAN discovery (spec §5.1 Mode A)

Instance advertises `_anton._tcp.local` (and legacy `_anton-gateway._tcp` for compat) via `bonjour-service`. Authenticated apps can ask their paired instance to browse the LAN on their behalf via `/api/app/discover/lan` (env-gated `APP_GATEWAY_LAN_BROWSE=true`).

---

## Pages (17) — `src/app/pages/`

### Auth flow

| Name | Source | Function |
|---|---|---|
| `WelcomePage` | `WelcomePage.tsx` | Splash + "Pair with my ANTON" CTA. First-launch only. |
| `JoinPage` | `JoinPage.tsx` | The pairing surface — auto-detects modern enrollment vs legacy invitation token. QR scanner + manual entry. Confirmation-code prompt when admin pre-bound. Post-pair biometric setup. **30-second target**. |
| `ConnectionsPage` | `ConnectionsPage.tsx` | List of orgs the user is connected to. Picks one → enters the workspace. |

### Workspace tabs (5 primary + secondary)

| Name | Source | Function |
|---|---|---|
| `HomeScreen` | `HomeScreen.tsx` | Org dashboard — recent activity, suggestions, pinned org announcements. |
| `ChatPage` | `ChatPage.tsx` | Org-routed conversational interface. Messages stream in via WebSocket; falls back to `/query-sync` REST. Voice in-line via `VoiceInput`. |
| `ApprovalsScreen` | `ApprovalsScreen.tsx` | **Pending-checkpoint inbox.** Severity-sorted; biometric re-confirm on high/critical; signed-envelope responses. **Primary tab with live count badge.** |
| `CapturePage` | `CapturePage.tsx` | Camera + library + share-target capture with intent picker (analyse / summarise / extract / translate / answer) + note. |
| `OrgHomePage` | `OrgHomePage.tsx` | Alternate org-detail page — historical, kept for legacy flows. |
| `ScheduleScreen` | `ScheduleScreen.tsx` | Schedule / calendar view. In More menu. |
| `TaskScreen` | `TaskScreen.tsx` | Tasks assigned to the user. In More menu. |
| `SearchScreen` | `SearchScreen.tsx` | Search across the user's chats + outputs. In More menu. |
| `MarketsScreen` | `MarketsScreen.tsx` | Markets tile (mobile-friendly slice of the desktop Markets pillar). In More menu. |
| `RadarScreen` | `RadarScreen.tsx` | Radar alerts. In More menu. |
| `WalletScreen` | `WalletScreen.tsx` | FutureChain wallet view. In More menu. |
| `SessionHistoryPage` | `SessionHistoryPage.tsx` | Past chat sessions list + drill-in. |
| `ProfilePage` | `ProfilePage.tsx` | Per-user profile + theme picker (light/dark/corporate, default light). |
| `SettingsPage` | `SettingsPage.tsx` | App settings — biometric policy, notification categories, language, about. |

---

## Components (11) — `src/app/components/`

| Name | Source | Function |
|---|---|---|
| `BottomSheet` | `BottomSheet.tsx` | Reusable Material 3 / iOS sheet with backdrop, drag handle, ESC-to-dismiss, body-scroll lock, slide-up animation. |
| `ChatBubble` | `ChatBubble.tsx` | User / assistant chat bubble with markdown rendering. |
| `ConnectionStatus` | `ConnectionStatus.tsx` | Online / offline / queued indicator (offline queue per spec §10.1). |
| `InstanceSwitcher` | `InstanceSwitcher.tsx` | Wallet-card stacked-instance picker (bottom sheet). Per-instance unpair confirm. |
| `InstanceTopBar` | `InstanceTopBar.tsx` | Minimal top strip — active instance name + coloured status dot + chevron. Pings `/discover` every 30s. Tap → switcher. |
| `QuickActionsFab` | `QuickActionsFab.tsx` | Bottom-centre FAB. 2-col tile menu (Voice / Capture / Ask / Approvals + badge / Switch instance). |
| `ReasoningDrawer` | `ReasoningDrawer.tsx` | Collapsible "How ANTON Thought" thinking panel inside `ChatPage`. |
| `SuggestionChips` | `SuggestionChips.tsx` | Quick-reply chips below the chat input. |
| `TabBar` | `TabBar.tsx` | Bottom 5-tab nav with badge support. |
| `VoiceInput` | `VoiceInput.tsx` | In-chat hold-to-talk button + live captions popover. |
| `VoiceMode` | `VoiceMode.tsx` | Full-screen voice overlay — hold-to-talk + barge-in + captions + TTS playback. Three-phase animated ring. |

---

## Services (13) — `src/app/services/`

| Name | Source | Function |
|---|---|---|
| `api.ts` | `api.ts` | REST client for `/api/app/*`. Instance-aware base URL + session token. |
| `biometric.ts` | `biometric.ts` | Wraps `@capgo/capacitor-native-biometric`; web `confirm()` fallback. |
| `capture.ts` | `capture.ts` | Camera / library wrappers + share-intent reader + canvas resize. |
| `checkpoints.ts` | `checkpoints.ts` | List / get / respond client API for approvals. Wraps responses in signed envelopes. |
| `discovery.ts` | `discovery.ts` | Server reachability probes + saved-server list. |
| `enrollment.ts` | `enrollment.ts` | Ed25519 pairing — `fetchEnrollment` (POST/GET fallback), `completeEnrollment`, `legacyJoin`. |
| `haptics.ts` | `haptics.ts` | Wraps `@capacitor/haptics` (tick / light / success / warning / error). |
| `identity.ts` | `identity.ts` | `@noble/ed25519` keypair gen + sign + signed envelope + `hasPrivateKey`. |
| `instances.ts` | `instances.ts` | Multi-instance store with race-free `setActiveInstanceAsync`. |
| `lan-discovery.ts` | `lan-discovery.ts` | `discoverViaInstance` + `probeServer`. |
| `offline.ts` | `offline.ts` | Offline queue + cached sessions. |
| `pairing-url.ts` | `pairing-url.ts` | Pure URL parser + validator (extracted so it tests without `@noble`). |
| `push.ts` | `push.ts` | APNs / FCM / web-push registration + notification deep-link router. |
| `query.ts` | `query.ts` | REST `/query-sync` client (used by chat + voice + capture). |
| `secure-store.ts` | `secure-store.ts` | Tier-aware KV (native Keychain/Keystore → IDB → memory). |
| `socket.ts` | `socket.ts` | Socket.IO client for streaming chat. |
| `theme.ts` | `theme.ts` | Theme switcher (independent of main app's `useSettingsStore`). |
| `tts.ts` | `tts.ts` | Web Speech API wrapper with barge-in. |

---

## Distinctions to communicate to Claude Design

### Internet vs offline

The companion app distinguishes:
- **Internet mode** — instance reachable over WAN (`https://anton.example.com`) via standard TLS. The PWA + native paths look identical.
- **LAN mode** — instance discovered via mDNS (`_anton._tcp.local`) over Wi-Fi. Used by NGO offline deployments. Cleartext HTTP only on RFC1918 ranges + `*.local` (validated in `pairing-url.ts:validateServerUrl`).
- **Queued / offline** — instance unreachable. Captures + voice memos queued; **approvals are NOT queued** (stale approvals are dangerous). Status shown as the dot colour in `InstanceTopBar` (green / yellow / red).

These three states show up in the UI in three places: `InstanceTopBar` dot, `ConnectionStatus` ambient indicator, and the FAB's tile labels (some greyed when offline).

### `connected_user` ≠ desktop `user`

The companion-app user is a `connected_user` — a separate database record from desktop ANTON's `user`. One human can be both, paired via the same `contact_hash` (`ANTON-XXXX-XXXX-XXXX-XXXX`). The companion app never sees passwords; SSO (when used) is handled by the desktop instance.

### Org-scoped routing

Inside the workspace, every action is scoped to a `selectedOrgId` (one of the orgs the user is connected to via `connected_user_orgs`). Switching orgs returns the user to `ConnectionsPage`. Switching instances does the same — by design, to make the next action's target unambiguous (spec §4.2).

### iOS scaffold (templates only)

The Capacitor iOS project has not been generated on this repo (no Mac involved yet). Templates for `Info.plist`, `PrivacyInfo.xcprivacy`, `App.entitlements`, `Podfile` are ready in `ios-templates/`; the Mac bootstrap is a one-liner per `ios-templates/README.md`. Apple's Xcode 26 / iOS 26 SDK cutoff is April 28, 2026 — relevant for production submission timing.

### Android shell

`android/` directory is a Capacitor 8 project. `minSdk=26`, `targetSdk=36`. `AndroidManifest.xml` declares the full perm set (camera, mic, biometric, push, foreground-service-microphone, mDNS). Keystore signing configured. Distribution paths: Google Play (standard), Managed Google Play (MDM), sideload APK, optional F-Droid.

---

## Theme system

Same OKLCH token names as the main app (`adv-dark`, `adv-teal`, …). Local copy lives in `src/app/app.css`. Three themes: dark (baseline), light (default for the companion app per `services/theme.ts`), corporate.

The companion app additionally defines two animation classes used by its bottom sheets:
- `.animate-slideUp` — 0.22s `cubic-bezier(0.32, 0.72, 0, 1)` — the spec §9.3 sheet entry
- `.animate-fabPress` — 0.18s `ease-out` — the FAB tap micro-interaction

---

## v3 Evolution redesign (commit c0e05ed, April 2026) — NEW

The v3 integration of the Claude Design "Evolution" handoff landed five phases on top of the v2 base described above. **Claude Design iterations should start from these screens** — the v2 pages are being migrated incrementally.

### Light-theme-only + warm linen palette

`app.css` now uses `#F5F3EF` warm linen as the page background and `#0D7D6C` deep teal as the primary accent in light mode. The `adv-*` tokens stay as aliases so unmigrated screens still render correctly, but v3 components consume the Evolution palette directly. Dark + corporate themes are **disabled on the companion app** — the single light theme is enforced to keep the "calm professional surface" the CISO brief asks for.

### 8 personal accent palettes

`services/personalization.ts` + `<html data-accent="...">` triggers one of eight accent schemes (teal default + amber, rose, indigo, moss, copper, violet, slate). Status colours (`adv-red` / `adv-gold` / `adv-green` / `adv-blue`) are **locked** across accents so failure/success/info signalling never drifts. User picks the accent on `PersonalizePage`.

### Pro vs Standard mode

`services/personalization.ts.getMode()` returns `'pro' | 'standard'`. The `TabBar` component dispatches: Pro mode shows the 5-tab power-user variant, Standard mode shows a 4-tab simplified variant with bigger type + plainer language. Each Std-prefixed page is the Standard-mode counterpart of its Pro sibling — the user picks mode on first run or swaps later via `StdSettingsScreen`.

### New UI primitives — `src/app/components/ui/`

Drop-in components consumed by every v3 page. `Btn` (filled / ghost / danger variants), `Card` (with `interactive` flag for taps), `Pill` (status chips), `StatusDot`, `SectionLabel` (uppercase tracking-wide), `Avatar`, `Ico` (custom 1.75-stroke SVG set — 80+ icons replacing the Lucide dependency for v3 screens). `PersonalizationContext` wraps the tree so any descendant can read current accent + mode without prop-drilling.

### New pages (12 v3 screens + 3 rewrites)

**Pro mode:**
- `HomeScreen` rewrite — real priority approval card from `listPendingCheckpoints`, real Today list from `/api/app/org/:id/sessions`
- `CalendarScreen` — new, powered by `services/calendar.ts`
- `MarketsScreen` — new, consumes `services/markets.ts`
- `RadarScreen` rewrite — compliance radar from `services/radar.ts`
- `SchoolFeedScreen` — new school-mode feed from `services/school.ts`
- `SearchScreen` rewrite — Pathfinder-powered via `services/pathfinder.ts`
- `UnifiedMailScreen` — new inbox powered by `services/mail.ts`
- `WorkModulesScreen` — new, surfaces available expert modules per `services/modules.ts`
- `PersonalizePage` — new, accent + mode selector
- `EmailSetupScreen` — new, first-run mail adapter wizard

**Standard mode (simplified variants):**
- `StdHomeScreen` — "Waiting for you" hero with biometric-aware approve button
- `StdCalendarScreen`, `StdMailScreen`, `StdThreadScreen`, `StdSettingsScreen`, `StdVoiceScreen`, `StdWalletScreen`

**Shared:**
- `JoinPage` rewrite — larger type, clearer QR affordance
- `WelcomePage` rewrite — warm-linen hero matching the Evolution brief

### New services — `src/app/services/`

Four backend adapters added: `calendar.ts`, `mail.ts` (Gmail + Outlook hooks), `markets.ts`, `modules.ts`, `pathfinder.ts`, `radar.ts`, `school.ts`. All consume real ANTON endpoints — no fixture stubs.

### Font

Inter + JetBrains Mono via Google Fonts. The gap noted in "Known gaps" below (Inter not self-hosted) applies here.

---

## Known gaps (deferred from the April 2026 review)

- ApprovalsScreen DetailSheet duplicates the BottomSheet chrome instead of using the shared component (works but DRY).
- Web-tier IDB private key is currently unencrypted (fine for browser users; native Keychain/Keystore covers iOS + Android).
- Inter font is referenced but not self-hosted yet — relies on system fallback on devices without it.
- `space-*` design tokens not formally declared — components freely use Tailwind half-step utilities (`py-1.5`, etc.) and arbitrary values. This is the highest-value clean-up Claude Design could propose.

---

## Why the companion app is the right first iteration target for Claude Design

Per the brief §3.5 + the spec's "decision-maker holds it in their hand" framing:
- It is **the surface a CISO touches first** before they ever see the desktop. Quality bar = "would I stake my reputation on this?"
- It is **the surface a teacher / NGO field worker sees second** — the desktop instance is the classroom server they never open.
- It is **the smallest design surface** (17 pages vs 209 desktop pages) — fastest to iterate on, fastest to reach a "shipping" version.
- It is **the freshest code** (April 2026 build, all components reviewed) — Claude Design's input is least likely to fight legacy decisions.
