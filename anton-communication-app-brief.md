# ANTON Communication App — Architecture Brief

**For:** Claude Code
**Date:** 11 May 2026
**Status:** Build brief — execution starts immediately after commit
**Related:** `hosted-anton-default-connection-brief.md`, `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md`, AAP wire format (`server/services/aap-transport-server.ts`), Visitor Layer v0.8 (`project_visitor_layer_v0_8.md`)

---

## 1. What we are building

A **separate, standalone mobile application** — referred to in this brief as the **ANTON Communication App** (working name **anton-comm**, app ID `com.futurechain.anton.communication`) — distinct from the existing **Companion App** (`src/app/`, app ID `com.futurechain.anton.companion`). The Comm App is a consumer-facing social product. The Companion App stays exactly as it is and continues to serve its role as "your ANTON's hands on your phone."

The Comm App has four tabs:

1. **Chat** — E2E encrypted 1:1 and small-group messaging between Comm App users
2. **Events** — native social calendar for friends-and-family use cases (dinners, concerts, travel, parties, birthdays)
3. **Portals** — visitor surface for ANTON Portals (browse, search, invoke capabilities)
4. **Payments** — UI shell only; full FutureChain + Heimdall wiring is a future development run with their data

### Why two apps, not one

The two apps cover **legitimately different use cases for the same person**:

- **Companion App** = professional / work context. Paired to the user's local or organisation ANTON. Surface for approvals, voice, capture, knowledge queries, missions, markets — all the heavy ANTON work tools projected onto a phone.
- **Comm App** = personal / social context. Paired to a hosted ANTON. Surface for chat with friends, social events, portals, payments. Does not need a local ANTON to be useful.

This is the same separation a user already makes between a personal email and a work email. Forcing both into a single identity creates a "your boss can find you via your party-planner profile" leak. Each app generates its own identity; the user can choose to publish a verified link between the two later (Phase 2+).

### Privacy posture — same as hosted ANTON brief

The operator of the hosted instance can see *who connects when* and *who messages whom* — connection metadata, peer identifiers, message timing, payload sizes. The operator **cannot** see message content; everything is end-to-end encrypted with keys that never leave the user's device. This is the Signal-vs-Briar trade. The hosted instance is not a back door for content; it is a known metadata controller, with the legal status set out in `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md`.

The hosted instance still **does not run AI or Work modules.** Comm App users without a local ANTON cannot run modules. That is by design — the consumer surface is chat / events / portals / payments, not Work.

---

## 2. Identity model

**Each app generates its own identity at first install. No mandatory linking.**

- On first launch, Comm App generates a fresh Ed25519 keypair via `@noble/ed25519`
- Private key stored in Keychain (iOS) / Keystore (Android) via `@aparajita/capacitor-secure-storage`
- Contact hash (`ANTON-XXXX-XXXX-XXXX-XXXX`) derived as SHA-256 of the public key, formatted in unambiguous charset
- Comm App pairs with hosted ANTON (`connect.anton.network` over HTTPS or `relay.futurechain.eu` over mesh) using the existing enrollment ritual from `server/services/app-enrollment-service.ts`
- A user with both apps has **two contact hashes**, intentionally — same person, two personas

**Optional cross-app linking** is deferred to Phase 2+. When implemented, the user can:

1. Open Companion App → Settings → "Link my Comm App identity"
2. Scan a QR shown on the Comm App side
3. Both apps sign a small claim ("I, contact-hash A, am the same person as contact-hash B") with their respective private keys
4. The signed claim is published to either app's contact directory, optionally visible to selected contacts

This is the natural binding point for **payments**: when FutureChain wires in, payments need a wallet, the wallet lives on heavy ANTON, and the Comm App user needs to bind to their heavy ANTON identity to transact. Until then, no linking is required.

---

## 3. The four tabs — scope per tab

### 3.1 Chat

**Reuses:**
- All E2E primitives from `server/services/community-e2e.ts`, `community-crypto.ts`, `community-signing-service.ts`
- AAP wire envelope from `server/services/aap-transport-server.ts`
- Mesh + HTTPS dual transport from `peer-transport-service.ts`, `message-queue-service.ts`, `relay-service.ts`
- Conceptual patterns from Companion App's `src/app/pages/CommunityChatScreen.tsx` (but rebuilt — see below)

**Builds new:**
- Proper message store with persistence and sync state machine (Companion App's 4s-poll + in-memory state isn't acceptable for the social use case)
- Contact-add flow optimised for the social context: QR scan, contact-hash share, in-band invite via SMS link or share-sheet
- Beehive pairwise group encryption capped at ~10 members for v1, with a clear UI message about the limit. MLS is a future upgrade path.
- Read receipts, typing indicators, presence (optional Phase 2)

### 3.2 Events (Calendar)

**Use case:** friends and family. Invite people to dinner, drinks, concerts, travel, parties, birthdays. Not enterprise meetings, not work-calendar sync.

**Reuses:**
- The existing `community_events` table — fields `title`, `start_at`, `end_at`, `all_day`, `location`, `description`, `creator_hash`, `rsvp_required` are already a near-perfect fit
- Existing routes: `GET /api/app/org/:orgId/calendar/today`, `POST /api/app/org/:orgId/calendar/events`

**Builds new (Phase 2):**
- Event invitee list — new table `community_event_invitees` with `(event_id, invitee_hash, rsvp_status, responded_at)`
- RSVP read/update endpoints
- Push notifications on invite / RSVP change / event reminder
- Event types as enum or tag set: `dinner`, `drinks`, `concert`, `travel`, `party`, `birthday`, `other` — each with an icon
- Per-event chat thread (links to a hidden ANTON chat group)
- Event detail view (location with map link, description, attendees, comments)

**Builds later (Phase 2.5 or 3):**
- Recurrence (RFC 5545 RRULE) — birthdays alone justify this
- ICS export/import (one-way at first — invitee can save to native calendar)
- Reminder logic (1 hour before, 24 hours before, configurable)

**Explicitly out of v1:** Google Calendar / M365 OAuth sync, enterprise meeting features (video links, room booking), corporate calendar invite parsing.

### 3.3 Portals

**Reuses (consumer surface, all public-no-auth):**
- `GET /api/portals/search?text=&verbs=&categories=` → portal address + verb list
- `GET /api/portals/visit/{address}/capabilities` → signed capability descriptor
- `GET /api/portals/visit/{address}/page?path=/` → rendered HTML
- `GET /api/portals/visit/{address}/asset/{path}` → static assets
- `POST /api/portals/visit/{address}/capabilities/{capId}/inquire` → metadata probe
- `POST /api/portals/visit/{address}/capabilities/{capId}/invoke` → execute capability

**Reuses patterns from:**
- `src/pages/portals/PortalVisitorPage.tsx` — descriptor fetching, capability invoke, HTML rendering. Extract the consumption logic into a mobile-friendly variant.
- `src/pages/portals/PortalsDiscoveryPage.tsx` — verb / category / language filters

**Builds new:**
- Mobile-tuned discovery: tap-friendly category chips, search-first layout, infinite scroll
- Capability invoke UX adapted for phone: keyboard-aware forms, async result presentation
- Saved portals / favourites (local-only at first)

**Explicitly out of v1:** portal authoring (8-phase walkthrough). Authoring stays on Companion App + desktop. The Comm App is consumer-only for portals.

### 3.4 Payments — SHELL ONLY

**This tab is a UI placeholder until FutureChain + Heimdall data arrives.**

What we build now:
- `WalletScreen.tsx` placeholder showing static "Coming soon — FutureChain wallet" copy
- Empty balance/history layout so the visual scaffold is in place
- Optional: a single button "Link your ANTON for payments" that for now opens a dialog explaining the future flow
- **No** AAP payment message types
- **No** `fc_*` migrations beyond what already exists in stub form (migrations 081-087 are untouched)
- **No** wallet signing / broadcast / KYC code
- **No** AMLR-scope table reservations (Heimdall + FutureChain own all AML compliance)
- **No** mission-budget integration

When the user returns with FutureChain + Heimdall specifications, a separate development run replaces this shell with the real payment client. Heimdall handles the financial-crime-prevention obligations; the Comm App is a thin client.

---

## 4. Build organisation

**Separate codebase under `src/comm/`. No shared services with `src/app/` for v1.**

```
src/
  app/                    # Companion App — STAYS AS IS, untouched
  comm/                   # NEW — Communication App
    App.tsx
    app.css
    main.tsx
    index.html
    pages/
      OnboardingScreen.tsx
      ChatListScreen.tsx
      ChatThreadScreen.tsx
      EventsScreen.tsx
      EventDetailScreen.tsx
      PortalsBrowseScreen.tsx
      PortalDetailScreen.tsx
      WalletScreen.tsx           # shell
      ProfileScreen.tsx
    components/
      tabs/
      ...
    services/
      api.ts                     # hosted-only HTTP client (no LAN logic)
      identity.ts                # Ed25519 + secure storage
      chat.ts                    # message store + sync
      events.ts                  # calendar service
      portals.ts                 # visitor API client
      push.ts                    # APNs / FCM
      crypto.ts                  # X25519 / AES-GCM (port of community-e2e logic)
    types/
```

**Build configuration:**

- `vite.config.comm.ts` — own Vite config, builds to `dist/comm/`, dev port 5185
- `capacitor.config.comm.ts` — Capacitor 8 config, `appId: 'com.futurechain.anton.communication'`, `appName: 'ANTON Communication'`, `webDir: 'dist/comm'`
- Separate Android Studio module under `android-comm/` (or single Android project with flavour, decide in Phase 0)
- `package.json` scripts: `dev:comm`, `build:comm`, `build:comm:cap`, `build:android:comm`

**Why no shared code yet:** the Companion App is mature and we don't want a refactor to destabilise it. Comm App copies what it needs from `src/app/services/` and they evolve independently. If duplication becomes painful in Phase 3+, refactor to a `src/shared/` library then — informed by the actual divergence, not speculation.

**Server side:** mostly reuse. `server/services/community-*.ts`, AAP transport, message queue, relay, app-enrollment, app-checkpoint, app-push — all generic enough to serve both apps. Add a small number of Comm-App-specific endpoints (event invitees, event RSVP).

---

## 5. Hosted ANTON infrastructure required

Most of what we need is **already built**. The compliance plan and brief assumed hosted ANTON would be the default connection for the Companion App; with this pivot it becomes the backend for the Comm App. Same infrastructure, different framing.

**Already exists and works:**

- User registration: `POST /api/app/register`, `POST /api/app/register-simple`
- Org membership: `connected_user_orgs` table
- Calendar read/write: `/api/app/org/:orgId/calendar/today`, `/api/app/org/:orgId/calendar/events`
- Mail / chat surface: `community_mail`, `community_messages` tables and routes
- Approvals / checkpoints: `app_checkpoints`, `/api/app/checkpoints/*`
- Push notifications: `app-push-service.ts` (APNs / FCM / web-push)
- Portal visitor surface: all public endpoints under `/api/portals/visit/`
- Identity service: `server/services/identity.ts` (Ed25519 + contact-hash derivation)
- Mesh + HTTPS dual transport (Track A from May commits)

**To add:**

- `community_event_invitees` table + RSVP endpoints (Phase 2)
- Event push notifications (uses existing `app-push-service.ts` plumbing)
- Friend-add flow with QR scan (mostly client-side)
- "Hosted instance mode" detection / config — when running as hosted, disable LAN discovery, mDNS, mesh-default behaviours that don't apply. A single config flag (`HOSTED_MODE=true`) suffices.

**Compliance plan unchanged.** Everything in `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md` v0.2 still applies. The product framing shifts from "default connection" to "Comm App backend"; the legal posture is identical. Phase 0.5 (legal entity + DPO + DPIA) still gates Phase 2 production rollout.

---

## 6. Phase plan

### Phase 0 — Scaffold (this run)

- Create `src/comm/` directory structure with minimal Hello World
- `vite.config.comm.ts` building to `dist/comm/`
- `capacitor.config.comm.ts` with new app ID
- `package.json` scripts (`dev:comm`, `build:comm`, `build:comm:cap`)
- Stub `App.tsx` with 4-tab bottom navigation (Chat / Events / Portals / Payments)
- Empty page components for each tab, themed consistently with the design system
- Verify `pnpm dev:comm` runs and `pnpm build:comm` produces a working bundle
- Commit

### Phase 1 — Identity + first-launch + 1:1 chat

- Onboarding flow: name input → generate Ed25519 keypair → register with hosted ANTON → contact hash issued
- Profile screen (display name, contact hash, avatar)
- Contact-add flow: QR scan + manual contact-hash entry
- Chat list screen + 1:1 thread screen
- Message persistence in IndexedDB (or `@capacitor-community/sqlite` for native)
- Send / receive via existing community-mail endpoints with X25519 + AES-GCM encryption
- Push notifications on new message
- Hosted-mode config flag on server

### Phase 2 — Events tab

- Event creation form (title, type, date/time, location, description, invitees)
- Event detail screen with RSVP + comment thread
- Invitee table + RSVP endpoints on server
- Event push notifications (invite, RSVP change, reminder)
- Today / upcoming / past tabs in event list
- Event types with icons (dinner, drinks, concert, travel, party, birthday, other)

### Phase 3 — Portals tab

- Portal discovery / search with category chips
- Portal detail screen (descriptor render, capabilities list)
- Capability invoke UI with keyboard-aware forms
- Result presentation (response render or inbox confirmation)
- Saved portals (local-only)

### Phase 4 — Small-group chat

- Group creation (≤10 members, hard cap)
- Beehive pairwise broadcast
- Group settings, leave group, kick member (admin)
- Per-event group chats (auto-created when event is created)

### Phase 5 — Payments shell

- Wallet screen placeholder
- Static balance / history layout
- "Coming soon" copy
- Optional: "Link your ANTON" dialog explaining the future flow

### Deferred — FutureChain dev run

When the user provides FutureChain wallet setup, commands, Heimdall integration, AMLR posture from Heimdall side: a separate development run replaces the Payments shell with the real payments client. Likely includes AAP payment-message types, mobile-initiated payment intent, biometric-confirmed approval via `app_checkpoints`, balance / transaction-history queries to the user's bound heavy ANTON.

### Deferred — Phase 2+ identity linking

When useful (probably triggered by Payments going live), add the optional "link my Comm App identity to my Companion App / heavy ANTON" flow as described in §2.

### Deferred — RRULE recurrence + ICS export

Phase 2.5 or 3 if user demand is there. Birthdays alone justify recurrence; ICS export is for people who want to save events to native calendar.

### Deferred — MLS / Sender Keys for groups

When Beehive pairwise hits its practical limit (probably the ~10-member cap stops being acceptable). Multi-month project; not blocking.

---

## 7. Open questions

Few — most decisions are pinned in this brief. Outstanding:

1. **Android: separate project vs flavour?** Single `android/` directory with a `comm` flavour vs separate `android-comm/`. Decide in Phase 0 based on what plays best with `cap sync` and the existing Companion App build. Default: separate to keep them fully independent.

2. **iOS scaffold timing.** iOS templates exist for Companion (`ios-templates/`). Mirror for Comm App now or defer until ready to ship? Default: defer to Phase 1 end, focus on Android + PWA first.

3. **App naming.** "ANTON Communication" is the working name. Final brand name (e.g. "ANTON Connect," "ANTON Social," or just "ANTON") is a marketing call, not blocking development. Use working name throughout code; rename at release time.

4. **Hosted-mode flag specifics.** Decide whether `HOSTED_MODE=true` lives in `.env` or in instance config. Either works; `.env` is simpler for a dedicated hosted deployment. Default: `.env`.

5. **Message store choice.** IndexedDB (web-portable, slower, larger storage limits per origin) vs `@capacitor-community/sqlite` (native-only, faster, real DB). Default: SQLite via Capacitor plugin with IndexedDB fallback for PWA.

---

## 8. Files to read first (for future runs)

When you pick this up later or in a fresh session, read in this order:

1. This brief
2. `hosted-anton-default-connection-brief.md` — backbone privacy posture
3. `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md` — legal scope
4. `src/app/services/identity.ts` — identity primitives to port
5. `src/app/services/api.ts` — HTTP client patterns
6. `server/services/community-e2e.ts` — E2E crypto contract
7. `server/services/aap-transport-server.ts` — wire envelope
8. `src/pages/portals/PortalVisitorPage.tsx` — portal consumption logic
9. `vite.config.app.ts` + `capacitor.config.ts` — build templates to mirror
10. The investigation report in this conversation's history for full file-path inventory

---

## 9. What success looks like for v1

A second app installable on the same phone as Companion App, with its own icon, paired to hosted ANTON, where the user can:

- Onboard with a name + generated identity in under 30 seconds
- Add a friend via QR scan and exchange a 1:1 chat message
- Create an event, invite friends, see RSVPs come in
- Browse portals and invoke a capability (e.g. "send me a message")
- See a Payments tab that clearly communicates "this is where your wallet will appear"

No regressions in Companion App. No new sub-processors required. No AMLR machinery on hosted ANTON. No content scanning. Group chat works for groups ≤10. Push notifications deliver. Compliance plan v0.2 acceptance gates still gate Phase 2 production launch.
