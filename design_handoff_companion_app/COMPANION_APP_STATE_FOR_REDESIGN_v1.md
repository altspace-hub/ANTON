# ANTON Companion App — State of the App (for redesign)

> **Audience:** Claude Design (or any designer doing the next pass)
> **Date:** 2026-05-03
> **Status:** App is functionally complete and pairs end-to-end. Visual treatment is the v3 "Evolution" pass; this doc is the brief for the next visual evolution.
> **Codebase scope:** `src/app/` only. The desktop ANTON UI lives at `src/` and is a separate redesign target.

---

## TL;DR

The ANTON Companion App is the phone surface for an ANTON instance — a personal AI workspace running on the user's own machine or a small server. Users pair their phone with their org's ANTON via QR, then use the app to chat, approve sensitive actions, capture documents, browse mail/calendar/markets, and act on push notifications. There are **two distinct UX modes** — Pro (power users, dense, technical) and Standard (everyone else, generous spacing, plain language). The Pro mode is the enterprise wedge; Standard mode is what gets handed to a parent or a non-technical colleague.

**The redesign opportunity:** the current Evolution treatment is solid (warm linen canvas, 8 runtime accents, careful icon work) but the screens-as-shipped feel functional rather than crafted. Several flows that should feel calm (Approvals, VoiceMode, Capture) are still pattern-grids of buttons. The redesign should push toward **moments**: each screen earns one clear action, with everything else stepped back.

---

## 1. What this app actually is

ANTON is a local-first AI workspace. The desktop app runs on the user's PC; it's where the heavy work happens (modules, compliance work, knowledge packs, multi-LLM routing). The Companion App is the phone, and it does four things:

1. **Be there for approvals.** When ANTON wants to do something sensitive (send an email, post to Slack, file a regulatory submission, charge a card), it pauses and asks the user. The phone is where they say yes / no / modify, with biometric re-confirm on critical items. This is the enterprise wedge — the reason ops people install it.
2. **Capture context.** Photos, documents, voice notes, share-sheet from any other app — a fast way to drop something into ANTON's lap from the field.
3. **Quick conversation.** A chat with the user's ANTON, voice or text, with the same context the desktop has. Used for "what was that thing I asked about last week?" and "remind me what's on my plate."
4. **Glance at signals.** Mail (Gmail/M365/IMAP/Exchange/ANTON-native unified), markets, radar (alerts), calendar, school feed, wallet — quick read-only-ish surfaces for situational awareness.

The app is **always paired with at least one ANTON instance** (an org). Users can pair multiple — a personal ANTON, a work ANTON, a family ANTON — and switch between them in one tap. Identity is per-device (Ed25519 keypair generated on first launch, never leaves the phone), and the pairing ritual issues a device certificate that's used for all future calls.

---

## 2. The two modes — biggest design decision

The app has a runtime toggle between **Pro** and **Standard** mode, set in Settings. This is the most important pattern in the app: **don't design either one in isolation**.

| Aspect | Pro | Standard |
|---|---|---|
| Audience | Operators, admins, power users | Family members, non-technical staff, daily-life users |
| Base font-size | 14 px | 16 px |
| Heading scale | Tight (24 / 18 / 14) | Generous (24+ / 22 / 18) |
| Tap targets | 44 px min | 48 px min, more padding |
| Tabs | 5 (Home, Chat, Approvals, Capture, More) | 4 (Home, Messages, Ask, You) |
| Top bar | InstanceTopBar (instance name + status + switcher) | None — single instance assumed |
| FAB | QuickActionsFab at bottom-centre with 5 actions | None |
| More menu | 13-tile bottom sheet | None |
| Surfaces hidden | — | Approvals, Markets, Radar, Pathfinder, Capture, Schedule, Tasks, Wallet (advanced), Profile (advanced), History |
| Density | Dense lists, technical labels, hashes/IDs visible | Sparse cards, plain language, single action per card |
| Voice | VoiceMode overlay (hold-to-talk, captions, TTS) | Full-screen StdVoiceScreen (always-on Ask tab) |

**Reading this table the right way:** Pro is information-dense and trusts the user to know technical concepts (org IDs, contact hashes, instance switching). Standard is closer to a banking app or messaging app — one big card, one big button, generous whitespace.

The Pro design today is solid. **Standard mode needs the most love** — it currently uses the same components rescaled, but the right design here is probably a different visual rhythm entirely (Mailbox / Hey-style?).

---

## 3. The four user journeys to design for

### A. First-time user (the install + pair flow)

```
Install APK
  ↓
Welcome — type name, pick language → Get started
  ↓
Join — scan QR or enter server + token + device name → Pair
  ↓ (60s TTL on the QR; admin may show a 6-digit confirmation code)
Personalize — pick one of 8 accent colours → Continue
  ↓
Connections — list of paired orgs → tap one
  ↓
Org workspace home (Pro: HomeScreen, Standard: StdHomeScreen)
```

This is currently 4 screens (Welcome → Join → Personalize → Connections). The Personalize step could become an inline post-pair celebration moment instead of a full screen. Welcome's name+language form is functional but bland — opportunity for a warmer first impression.

### B. Returning user, normal day

```
Tap app icon
  ↓
Home (Pro) or StdHome (Standard)
  ↓
[time-of-day greeting + pending approvals card if any + recent sessions]
```

The Home screen does a lot today. It's the single most-used surface and probably the least crafted.

### C. Push-driven approval

```
Push notif lands ("3 approvals waiting")
  ↓
Tap notif
  ↓
Approvals screen, opened to the specific checkpoint
  ↓
Read summary + ANTON's recommendation + rationale
  ↓
Approve / Reject / Modify
  ↓
[Biometric challenge if severity = high or critical]
  ↓
Done — back to inbox
```

This is the **enterprise wedge flow** — the main reason this app exists in a business context. It needs to feel **deliberate, calm, trustworthy, fast**. Today the Approvals screen is a list-of-cards that works but doesn't shine.

### D. Quick capture

```
User points camera at a whiteboard / receipt / contract page
  ↓
[Or shares a PDF from another app via system share-sheet]
  ↓
Capture screen — preview + optional note
  ↓
Send → routes to Chat with the captured context attached
```

The "share to ANTON" path is one of the highest-leverage interactions but barely visible in the UI today.

---

## 4. Screen catalogue

Every screen in the app, what it does, what state it has. Use this as a checklist when you redesign.

### Auth flow (4 screens — both modes)

| Screen | Purpose | Notes for redesign |
|---|---|---|
| **WelcomePage** | Name + language picker → save identity locally | Bland. Opportunity: a warmer, more human first impression. Consider language-as-default-from-locale. |
| **JoinPage** | Scan QR or manually enter server + invitation token → pair → optional 6-digit code prompt | Currently has dual modes (scan / manual) as tabs. Manual entry hardly ever used in the wild — can it be reframed as a fallback rather than a peer? |
| **PersonalizePage** | Pick one of 8 accent colours, explained in plain language | This could be a moment, not a chore. Maybe show a live-coloured preview of HomeScreen behind the swatches. |
| **ConnectionsPage** | List of paired orgs with status dots; tap to enter; "+ Join new org" button | Today this is just a list. Should probably feel more like a "wallet" of identities — inspired by the Wallet app. |

### Pro mode workspace (5 tabs + More + FAB)

| Screen | Tab | Purpose | Density notes |
|---|---|---|---|
| **HomeScreen** | Home | Time-of-day greeting, pending approvals card, last 4 sessions, announcements | Top priority for redesign. Currently a stack of sections; should breathe more. |
| **ChatPage** | Chat | Conversational interface — bubbles, suggestion chips, voice input, org branding override | Solid foundation. Org branding via `--org-brand-color` is a clever touch — surface this more (e.g., subtle accent on bubble border). |
| **ApprovalsScreen** | Approvals | List of pending checkpoints, severity-coloured. Open one → summary + ANTON rationale + Approve/Reject/Modify (biometric for high/critical). Push deep-links land here directly. | The crown jewel flow. Today it's competent but doesn't feel as serious as the action requires. |
| **CapturePage** | Capture | Camera / library / share-target; preview + optional note → routes to Chat | Underdesigned. Should feel as fast as Snapchat camera. |
| **More menu** | More (BottomSheet) | 13 tiles: Work, Mail, Calendar, School, Schedule, Tasks, Pathfinder, Markets, Radar, Wallet, History, Profile, Settings, Switch Org | Tile grid is functional. Consider grouping: Inbox-y stuff, Knowledge stuff, Account stuff. |

### Pro mode More menu destinations (13 screens)

| Screen | Purpose | State today |
|---|---|---|
| **WorkModulesScreen** | Tiles for org's custom work modules (CRM, project mgmt, HR…) | Org-specific, often empty for personal users |
| **UnifiedMailScreen** | Inbox aggregating Gmail / M365 / IMAP / Exchange / ANTON-native, with AI action labels (Drafted / Summarized / Your action) | Mostly stubbed — providers don't sync in v1, but the UI is there |
| **CalendarScreen** | Month view + create/edit events | Read works, write is wired but provider-dependent |
| **SchoolFeedScreen** | LMS feed (assignments, grades, announcements) | Org-specific, hidden if no integrations |
| **ScheduleScreen** | Time-blocks + meetings | Stub-ish, depends on integrations |
| **TaskScreen** | Task list with status badges | Stub-ish |
| **SearchScreen** (Pathfinder) | Full-text search across org data + chat history | Functional |
| **MarketsScreen** | Watchlist + tickers | Empty state today (markets cron paused) |
| **RadarScreen** | Real-time signal cards | Empty state today (radar paused) |
| **WalletScreen** | Token balances + transactions | Empty state (no wallet provider yet) |
| **SessionHistoryPage** | Past chat sessions, paginated | Functional |
| **ProfilePage** | Edit name / language / linked accounts | Functional |
| **SettingsPage** | Accent + mode toggle + notifications + cache | Functional, gateway to Standard mode |

### Standard mode workspace (4 tabs)

| Screen | Tab | Purpose | Notes |
|---|---|---|---|
| **StdHomeScreen** | Home | One large approvals-or-greeting card, last 3 sessions in a list | Plain language ("Waiting for you" beats "3 pending approvals") |
| **StdMailScreen** → **StdThreadScreen** | Messages | Inbox + thread detail with reply box; "Open in Pro" escape hatch for complex replies | The "escape hatch" pattern is a great template — borrow it for other Standard screens |
| **StdVoiceScreen** | Ask | Full-screen voice. Hold-to-talk mic, partial transcript, TTS playback, barge-in | Already feels right. Gold standard for Standard mode. |
| **StdSettingsScreen** | You | Accent + mode toggle + notifications | Mirror of Pro settings, simpler |

Plus secondary Standard screens (`StdCalendarScreen`, `StdWalletScreen`) reachable from Home navigation but not as primary tabs.

---

## 5. Cross-cutting components (the design system surfaces)

These are the parts that appear across many screens. Coherence here matters more than individual screen polish.

### Layout primitives

- **TabBar** — bottom navigation. Different visual treatment per mode (Pro = thin top indicator + small label; Standard = accent-coloured icon + larger label). Supports badge count (red number).
- **BottomSheet** — slide-up modal with optional drag handle, backdrop tap to dismiss, optional footer actions. Used for More menu, FAB actions, instance switcher, confirmations. Animation is `cubic-bezier 220ms`.
- **InstanceTopBar** — Pro only. Instance display name + status dot (green/red/grey, pulsing when online) + transport badge (LAN/WAN/offline) + switcher trigger. Sits above the active tab content.
- **QuickActionsFab** — Pro only. Floating circular button at bottom-centre, just above TabBar. Tap opens a 2×3 grid of action tiles (Voice, Capture, Ask, Approvals, Switch Instance) with approval count badge. Press animation: scale 0.92 → 1.

### Conversational

- **ChatBubble** — role-styled. User: accent-tinted right-aligned. Assistant: white card left-aligned with markdown rendering. Error: red-tinted.
- **SuggestionChips** — horizontal pills under chat input.
- **VoiceInput** / **VoiceMode** — mic button (hold-to-talk) → live captions → TTS playback → barge-in cancels. VoiceMode is the full-screen overlay variant.
- **ReasoningDrawer** — expandable "Show ANTON's thinking" affordance. Currently underused — opportunity to make ANTON's reasoning a first-class surface in Approvals.

### UI atoms (the building blocks)

- **Btn** — 4 variants (primary / secondary / ghost / danger), 3 sizes (sm / md / lg). Min 44 px on md/lg. Active scale-down on press.
- **Card** — 1 px border, r2 radius, white surface, default 14 px padding. The default container.
- **Pill** — small badge with 6 tones (neutral / teal / gold / red / green / blue). 11 px text, 999 px radius. Used for severity, status, AI action labels.
- **Avatar** — circle with initials. Default uses accent-soft + accent text; can be overridden with explicit colour.
- **Ico** — 25+ custom SVG icons. **Stroke width 1.75 px exactly** (Evolution spec). Don't use Lucide/Heroicons here — the line weight will clash.
- **SectionLabel** — uppercase mono label, 11 px, weight 600, tracking 0.8 px, muted grey.
- **StatusDot** — 8 px circle, optionally pulsing.

---

## 6. Design system tokens

### Colour (Evolution palette)

Locked tokens defined in `src/app/app.css`:

**Canvas:** `--color-bg #F5F3EF` (warm linen) / `--color-surface #FFFFFF` / `--color-surface-alt #FAFAF8` / `--color-surface-muted #EFECE5`

**Text:** `--color-text #1A1B2E` / `--color-text-body #3B3D50` / `--color-text-muted #636577` / `--color-text-faint #878999`

**Lines:** `--color-border #DDD9D2` / `--color-border-soft #EAE7E0`

**Accent (8 runtime swatches via `html[data-accent="..."]`):**
| Name | accent | dark | dim (badge bg) | soft (card tint) |
|---|---|---|---|---|
| Emerald (default) | #0D7D6C | #06655A | #D5F0EB | #E5F5F2 |
| Ocean | #1F5FAE | #174880 | #D5E2F2 | #E8EFF9 |
| Sunrise | #C97220 | #A15A15 | #F5DDC0 | #FBEEDB |
| Ember | #B02E3B | #8A1F2A | #F0CDD1 | #F8E2E4 |
| Plum | #6A3E8F | #522D71 | #E0D0ED | #EEE3F5 |
| Slate | #2D3142 | #1A1C2A | #D3D6DC | #E6E8EC |
| Forest | #3E6B3A | #2C4F2A | #D4E2D1 | #E5EEE3 |
| Gold | #A07C26 | #7E5F15 | #EADFBE | #F3EDD6 |

**Status (LOCKED — never re-tint to match accent):**
- Red `#C7361F` — critical, reject, error
- Gold `#C8842B` — warning, normal-priority approval, draft
- Green `#1F8A5C` — success, complete, approved
- Blue `#3070C7` — info, link, pending sync

### Typography

- **Sans:** Inter (400 / 500 / 600 / 700) — body, headings, UI
- **Mono:** JetBrains Mono (400 / 500 / 600) — codes, hashes, technical metadata, SectionLabel

Loaded from Google Fonts at the moment (`<link rel="stylesheet" href="https://fonts.googleapis.com/...">` in `index.html`). Performance opportunity: self-host or use `font-display: swap`.

Scale used in practice (no formal token):
- 24 px — H1 (HomeScreen greeting, modal title)
- 18 px — section headings, card titles
- 14 px — body (Pro mode default), button text
- 12 px — secondary labels, TabBar text
- 11 px — SectionLabel, Pill, fine print
- 10 px — timestamps, micro-badges

In Standard mode the body bumps to 16 px and headings inflate proportionally.

### Radii

- `r1` 8 px — buttons, small inputs
- `r2` 12 px — cards (default)
- `r3` 16 px — approval card, larger containers
- `r4` 22 px — BottomSheet top corners, full-screen overlays

### Spacing

4 px base unit. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48 px. Tailwind's defaults plus per-component custom padding.

### Elevation

The Evolution spec calls for borderline-only treatment: 1 px borders, no drop shadows on cards. Modals and FAB do use shadows (`shadow-2xl`), and the FAB has a coloured shadow tint (`shadow-adv-teal/40`) — that's intentional and worth preserving as a "this is the action" cue.

### Motion

- Screen entrance: `fadeSlideIn` (200ms, opacity + 8px translateY)
- BottomSheet: `slideUp` (220ms cubic-bezier)
- FAB press: `fabPress` (180ms, scale 1 → 0.92 → 1)
- Status pulse: `pulse-dot` (2s ease-in-out box-shadow)
- Button press: `active:scale-[0.98]` (instant)

Haptics fire at the same moments via `services/haptics.ts`: `tick` on state change, `success` on approval, `warning` on biometric prompt, `error` on rejection.

---

## 7. Personalization

Three levers a user can pull:

1. **Accent colour** — 8 swatches, set in Personalize (post-pair) or Settings. Stored in localStorage, applied via `<html data-accent="...">`.
2. **Mode** — Pro / Standard, toggled in Settings. Applied via `<html data-mode="standard">`. Triggers the typography + density shifts described above.
3. **Per-org branding** — when a user is in Org X's workspace, the chat surface optionally adopts Org X's brand colour (`--org-brand-color`). Useful for white-labelled deployments.

Personalization is stored locally — nothing about the user's accent or mode is sent to the server. Future work: sync these prefs across the user's paired instances.

---

## 8. Multi-instance pattern

A user can pair the same phone with multiple ANTON instances — one personal, one work, one family-shared. The InstanceTopBar shows which one is active. Tap → InstanceSwitcher BottomSheet → list of paired instances → tap to switch.

When a user switches, every tab content remounts (the React tree uses `instanceVersion` as a key) so all data re-fetches against the new server. The active instance's name appears in the top bar; its server URL is used by every API call.

In Standard mode, multi-instance is hidden — Standard assumes one instance. (If a Standard user is paired with multiple, the switcher is reachable through Settings → "Switch ANTON" — but it's not promoted.)

---

## 9. Identity & security (light touch)

Per-device Ed25519 keypair generated on first launch. Public key + display name + language are mirrored in localStorage; private key lives in Keychain (iOS) / Keystore (Android) via `@aparajita/capacitor-secure-storage`. Each paired instance issues a device certificate stored alongside.

For high-severity approvals (severity = `high` or `critical`, or any approval marked `requires_biometric: true`), the response is signed with the device key after a biometric challenge. Failures soft-fall to a warning, not a hard block — design implication: never make biometric a wall.

---

## 10. Tech constraints for redesign

These are the non-negotiables. Anything proposed must work within them or call them out as a needed change.

| Constraint | Detail |
|---|---|
| **WebView only** | Android: Chromium WebView. iOS: WKWebView. No native UI primitives. CSS + DOM + canvas only. |
| **Capacitor plugins available** | Camera, Biometric, Haptics, Share, Push, Network, Status Bar, Splash Screen, Secure Storage, ML Kit Barcode (QR), Speech Recognition. New plugins = native build change. |
| **Touch targets** | 44 pt minimum (Pro), 48 pt (Standard). Apple HIG / Material Design baseline. |
| **Safe areas** | `env(safe-area-inset-top/bottom)` for notch + home-indicator. `<meta viewport-fit=cover>` is set. |
| **Performance baseline** | Snapdragon 680 / mid-range Android. Avoid heavy animations on scroll; sparing on parallax; no 3D except via canvas if essential. |
| **Offline-first** | App must boot and show cached state without network. Service worker is currently DISABLED in Capacitor (caused JSON-parse bugs on failed API calls), so caching happens in `localStorage` + per-service in-memory only. Designs must tolerate empty / stale data gracefully. |
| **Fonts** | Google Fonts (Inter + JetBrains Mono). Load is deferred — first paint may use system fallback briefly. Designs that depend on exact metrics may flicker on first launch. |
| **Orientation** | Portrait-locked. No landscape design needed. |
| **Tablet** | Phone-only for v1. No iPad-specific layouts. |
| **Dark mode** | Not yet supported. Evolution is light-only by design intent. (User can change accent but not the canvas.) Adding dark mode is a future possibility but not in this round. |

---

## 11. Known limitations / what's stubbed

So you know not to over-design things that won't be wired soon:

| Area | Status |
|---|---|
| **Push notifications** | Web-push (PWA) wired and works. Android FCM dispatch is a TODO — registration works, dispatch returns "not implemented". So the design should account for "the badge updates when the app is open" but not assume background ring-tone. |
| **Mail provider sync** | Connection store + UI exist; OAuth flows for Gmail/M365 not wired; IMAP/Exchange not wired. ANTON-native messages flow normally. Currently the inbox is always empty in v1. |
| **Wallet** | UI exists; no provider connected. Empty state. |
| **Standard-mode voice STT** | Currently uses manual text-input fallback. Full Capacitor speech recognition wiring (already in Pro `VoiceMode`) needs porting. |
| **Markets / Radar** | Backend loops are paused for cost reasons (Apr 2026 audit). UI exists; data is stale. Don't over-design these screens until the backend is unfrozen. |
| **Reasoning drawer** | The "show ANTON's reasoning" affordance is wired but rarely used today — opportunity to surface it more in Approvals. |
| **School / Work modules** | Org-dependent. Many orgs won't have these. Should hide gracefully when empty. |

---

## 12. Accessibility hooks (and gaps)

The Pro / Standard toggle IS the headline accessibility feature — Standard mode is the "approachable" setting for older users, less-technical users, anyone who finds Pro overwhelming.

What's wired:
- 44 pt+ touch targets
- ARIA labels on all primitives (Btn, Pill, Ico via title/aria-label)
- Focus ring (`focus-visible:ring-2 focus-visible:ring-[--color-accent]`)
- Keyboard nav for forms
- High-contrast text on accent backgrounds (accent-fg colour token)

What's NOT yet wired (opportunities):
- Reduced motion (`prefers-reduced-motion`) — animations currently always on
- Dark mode (see above)
- Screen reader audit — never done
- Colour-blind safe approval-severity icons (currently rely on red/gold/green colour alone)
- Dynamic Type support on iOS

---

## 13. What we're explicitly NOT optimizing for

So you don't waste design effort:

- Tablet / large screens (phone-only v1)
- Landscape orientation (portrait locked)
- One-handed use of every screen (some lists need both hands; we accept that)
- Dark mode (not in this round)
- Right-to-left languages (not in this round; the language picker doesn't include Arabic / Hebrew yet)

---

## 14. Existing design assets you should look at

- **Previous handoff:** `design_handoff_companion_app/` — Claude Design's v3 work (where the current Evolution treatment came from). The `context/` and `design/` subfolders have the source files. Treat that as the foundation; the next pass should iterate from there, not from scratch.
- **Spec:** `ANTON_COMPANION_APP_SPEC.md` (root of repo) — the canonical spec for everything functional. Read sections §4 (auth), §5 (pairing), §8 (features), §9 (UX details).
- **Memory:** `project_companion_app_v3_design_integration.md` (Claude memory file) — a record of how the v3 redesign was integrated. Mentions all 12 new screens that landed and their repo file mappings.
- **Live app:** Build with `pnpm run build:android:debug`, install via `adb install -r ...`. Pairing: `adb reverse tcp:3001 tcp:3001`, then enter `http://localhost:3001` in the manual-entry tab. Token from desktop ANTON's `/app-gateway` page.

---

## 15. The redesign brief (what we're hoping for)

A non-prescriptive list of the moments that need the most design love:

1. **HomeScreen + StdHomeScreen** — the most-visited surface. Should feel like opening a calm dashboard, not a dump-truck of widgets. Time-of-day greeting + ONE clear next action + ambient secondary content.
2. **ApprovalsScreen** — the enterprise wedge. Should feel deliberate and trustworthy. Make the rationale a first-class surface, not a hidden drawer.
3. **VoiceMode + StdVoiceScreen** — already feels right; opportunity to push it further. The TTS playback + barge-in moment should feel like a conversation, not a button-mash.
4. **CapturePage** — should be as fast as opening Snapchat. The share-target path is underdesigned.
5. **JoinPage** — the first impression for half of users. Currently reads as form-heavy; should feel like a moment.
6. **BottomSheet** patterns — used 5+ places. A consistent visual rhythm here pays everywhere.
7. **Standard mode as a whole** — currently a rescaled Pro. Probably wants a different visual rhythm (mailbox / Hey / Things-style).

---

## Appendix A — File map (for reference)

```
src/app/
├── App.tsx                      Root router + tab logic + auth gates
├── main.tsx                     Bootstrap (mounts React, hides splash on Capacitor)
├── app.css                      Evolution design tokens + accent palettes + animation keyframes
├── index.html                   Static template (Inter + JetBrains Mono link, viewport meta)
├── pages/
│   ├── WelcomePage.tsx          First-time identity
│   ├── JoinPage.tsx             QR / manual pairing
│   ├── PersonalizePage.tsx      Accent picker
│   ├── ConnectionsPage.tsx      Paired-instance list
│   ├── HomeScreen.tsx           Pro home dashboard
│   ├── ChatPage.tsx             Pro chat
│   ├── ApprovalsScreen.tsx      Pro approvals inbox
│   ├── CapturePage.tsx          Pro photo / share-target capture
│   ├── SearchScreen.tsx         Pathfinder search
│   ├── MarketsScreen.tsx        Markets watchlist (stubbed data)
│   ├── RadarScreen.tsx          Radar signals (stubbed data)
│   ├── WalletScreen.tsx         Wallet (empty)
│   ├── SessionHistoryPage.tsx   Past chat sessions
│   ├── ProfilePage.tsx          User profile
│   ├── SettingsPage.tsx         Settings (mode + accent + notif)
│   ├── UnifiedMailScreen.tsx    Mail aggregator (provider sync stubbed)
│   ├── EmailSetupScreen.tsx     Provider connect flow (stubbed)
│   ├── WorkModulesScreen.tsx    Org-custom modules
│   ├── SchoolFeedScreen.tsx     LMS feed
│   ├── CalendarScreen.tsx       Calendar
│   ├── ScheduleScreen.tsx       Time-blocking + meetings
│   ├── TaskScreen.tsx           Task list
│   ├── StdHomeScreen.tsx        Standard home
│   ├── StdMailScreen.tsx        Standard mail inbox
│   ├── StdThreadScreen.tsx      Standard mail thread
│   ├── StdCalendarScreen.tsx    Standard calendar (read-only)
│   ├── StdWalletScreen.tsx      Standard wallet
│   ├── StdVoiceScreen.tsx       Standard always-on Ask
│   └── StdSettingsScreen.tsx    Standard settings
├── components/
│   ├── TabBar.tsx               Bottom tabs (Pro / Standard variants)
│   ├── BottomSheet.tsx          Slide-up modal primitive
│   ├── InstanceTopBar.tsx       Pro top bar
│   ├── InstanceSwitcher.tsx     Bottom-sheet instance picker
│   ├── QuickActionsFab.tsx      Pro FAB
│   ├── ChatBubble.tsx           Chat message bubble
│   ├── SuggestionChips.tsx      Chat suggestion pills
│   ├── VoiceInput.tsx           Mic button (in input rows)
│   ├── VoiceMode.tsx            Full-screen voice overlay
│   ├── ConnectionStatus.tsx     Status banner
│   ├── ReasoningDrawer.tsx      Expandable reasoning panel
│   └── ui/
│       ├── Btn.tsx              Button primitive
│       ├── Card.tsx             Card primitive
│       ├── Pill.tsx             Badge primitive
│       ├── Avatar.tsx           Avatar primitive
│       ├── Ico.tsx              Custom 25+ icon set
│       ├── SectionLabel.tsx     Uppercase mono label
│       ├── StatusDot.tsx        Status dot primitive
│       └── PersonalizationContext.tsx  Accent + mode React Context
└── services/                    REST client, identity, push, biometric, capture, mail, calendar, etc.
```

---

End of doc. Build, pair, poke around, then propose the next visual evolution.
