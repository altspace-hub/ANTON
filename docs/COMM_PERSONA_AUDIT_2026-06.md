# ANTON Comm — 15-Persona Audit & Priority Matrix (2026-06-06)

Method: 6 agents mapped the **real** feature surface (so personas critique what ships, not
hallucinations); 15 personas (age 15→70, across messaging / social / events / wallet / safety /
accessibility / privacy) each did a grounded deep evaluation; a synthesizer clustered + ranked
and a completeness critic caught cross-cutting gaps no single persona named. 23 agents total.

## Headline verdict

**Would adopt & stay: 0 "yes" · 5 "maybe" · 10 "no".**

The privacy ethos (E2E, friends-only, no algorithm/ads/vanity-metrics) is *praised by nearly every
persona* — it is the differentiator and must not be diluted. But the app is missing **everyday
table-stakes** that make it churn-prone today. The gaps cluster tightly: the same handful of
missing things block most personas.

## The three systemic findings

1. **You can't find anything.** No message search anywhere (Chat or Pulse) — **14 of 15 personas**
   call this a dealbreaker. This is the single highest-leverage gap.
2. **Notifications are all-or-nothing — and partly broken.** Only 3 coarse channels (DMs / Events /
   Portals), no per-chat mute, no snooze/DND. **Verified bug:** `maybeNotifyInbound` (chat.ts:2719)
   never checks `getNotificationChannelEnabled` (settings.ts:61) — *turning the DMs channel off does
   nothing.* 11 personas hit this.
3. **Safety controls exist in code but not in the UI.** `Contact.blocked` and its full two-way
   enforcement are wired (drops messages, posts, asks), but there is **no block/unblock UI** for a
   chat contact (only the Pulse "ask" sheet sets it). 8 personas can't protect themselves. Same
   shape for contact-request approval (RequestsScreen exists but is undiscoverable / unbadged).

A recurring meta-pattern: **several "missing" features are 80% built and just need UI wiring** —
the cheapest, highest-ROI work in the whole list.

## Priority matrix

Impact = breadth across personas × severity (1–5). Effort = S/M/L/XL. Tier = P0 (broad dealbreaker)
→ P3 (nice-to-have). `x N` = personas affected.

| Tier | Item | Impact | Effort | Personas | Category |
|---|---|---|---|---|---|
| **P0** | Message search in Chat (full-text index + UI) | 5 | L | 14 | messaging |
| **P0** | Per-chat muting (`NotificationPreference` per contact/group) | 5 | M | 11 | notifications |
| **P0** | **Fix:** notification channel toggle is ignored (check `getNotificationChannelEnabled`) | 3 | **S** | 11* | notifications |
| **P0** | Contact blocking UI (backend already wired) | 4 | **M** | 8 | safety |
| **P0** | Contact-request approval flow — badge + discoverability (UI exists) | 4 | **S/M** | 7 | contacts |
| **P0** | Multi-photo send in Chat (gallery multi-select; Pulse already has it) | 4 | M | 5 | messaging |
| **P0** | Payment request / invoice (pull-based; wallet is send-only) | 4 | L | 5 | wallet |
| **P0** | Recurring events (RRULE + UI) | 4 | M | 5 | events |
| **P1** | Identity backup & recovery (lost phone = total loss; wallet has BIP-39, identity has nothing) | 4 | XL | 6 | safety |
| **P1** | Group event creation (create/invite inside a group) | 4 | M | 4 | groups |
| **P1** | Multi-device sync / Companion pairing | 4 | XL | 3 | wallet/identity |
| **P1** | Real-time voice/video calling (WebRTC) | 4 | XL | 3 | calling |
| **P1** | Message pinning / anchor key decisions | 3 | M | 4 | messaging |
| **P1** | Accessibility: scalable fonts + high-contrast mode | 3 | M | 3 | accessibility |
| **P1** | Location sharing in group chat (1:1 only today) | 3 | M | 2 | messaging |
| **P1** | Calendar export/sync (iCal / Google / Outlook) | 3 | L | 2 | events |
| **P1** | Increase 32-member group cap (or roles/subgroups) | 3 | M–L | 1 | groups |
| **P1** | Contact verification UI (safety-number fingerprint) | 3 | M | 1 | safety |
| **P1** | FTC live price feed (oracle) + bill-splitting | 3 | M | 2 | wallet |
| **P2** | Parental controls / child account mode | 4 | L | 1 | safety |
| **P2** | Snooze / focus / DND mode | 3 | M | 1 | notifications |
| **P2** | Language fallback (27/29 locales fall back to English → mixed UI) | 3 | L | 1 | i18n |
| **P2** | Remittance currencies (BRL/PKR/INR) + "received" confirmation | 3 | M | 1 | wallet |
| **P2** | Duress PIN / panic-delete / decoy (high-risk threat model) | 3 | L | 1 | privacy |
| **P2** | Server-anchored disappearing-message expiry | 3 | L | 2 | privacy |
| **P2** | Group RSVP "who hasn't replied" + co-organizer permissions | 2–3 | M | 2 | events |
| **P2** | Data export before account deletion (GDPR archive) | 3 | M | 2 | data |
| **P2** | Offline message retry queue (voice/media fail silently) | 3 | M | 2 | reliability |
| **P2** | Onboarding: "device loss = permanent identity loss" warning | 2 | **S** | 2 | onboarding |
| **P2** | Story reply · GIF reactions · @mention notify · forward-to-many | 2 | M | 1–2 | social/messaging |
| **P3** | Pulse photo + caption together · undo-on-delete · in-app version/update · bubble de-clutter | 1 | S | 1 | polish |

\* the notification-bug fix is a prerequisite for the per-chat-muting work landing correctly.

## Recommended sequencing

**Wave 1 — "make the privacy features usable" (days, mostly UI on existing backends).**
The cheapest churn-reduction in the list. Notification-toggle bug fix → Contact blocking UI →
Contact-request badge/discoverability → onboarding identity-loss warning → undo-on-delete.
*Several of these are wiring UI onto logic that already exists.*

**Wave 2 — P0 features (weeks).** Per-chat muting (build the `NotificationPreference` system) →
Multi-photo send in Chat → Recurring events → Payment request/invoice. Then the big one:
**Message search** (full-text index over the messages store + a search surface in Chat and Pulse).

**Wave 3 — big bets (deliberate, multi-week, architectural).** Identity backup & recovery (the
sev-5 cross-cutting gap — a lost phone wipes the entire social identity today). Voice/video
calling. Multi-device. Group scalability + roles. Each is its own design+review cycle.

## Quick wins (do first — high ROI, S/M effort, much already built)

- **Notification channel toggle fix** — gate `maybeNotifyInbound` on `getNotificationChannelEnabled` (verified ~1-line bug).
- **Contact blocking UI** — a block/unblock toggle in the contact/chat header + a blocked-list panel in Settings; the enforcement is already wired.
- **Contact-request tray** — badge it on the Chat tab and surface approve/reject clearly (screen exists).
- **Onboarding warning** — one screen before identity creation: "if you lose this device, this identity is gone" (until recovery ships).
- **Undo-on-delete** — 1-second toast buffer before "delete for everyone".
- **In-app version + update notice** — show build/version in Settings.

## Big bets (high impact, XL — plan deliberately)

- **Message search** (14 personas) — the single most-requested capability.
- **Identity backup & recovery** (sev 5) — today there is *no* recovery for the chat identity (the wallet has a BIP-39 seed; the identity has nothing).
- **Real-time voice/video calling** — explicit dealbreaker for the grandparent persona; assumed-present by several.
- **Multi-device** — new phone = everything gone today.
- **Group scalability + roles** — unblocks the community-organizer use case (hard 32-member cap).
- **Parental controls / child mode** — unblocks the family-safety use case (zero oversight today).

## Ethos conflicts — deliberately NOT building

These were requested by some personas but violate the product's core promise. Keep them out; where
a real need hides underneath, satisfy it privacy-respectingly.

- **Algorithmic / Explore / suggested-contacts feed** — contradicts "no algorithm, no discovery." Friends-only is by design.
- **Follower/view/vanity counts** — "the absence is the product." Pulse is intimate broadcast, not a status platform.
- **Ads / sponsored content / data selling** — incompatible; funding must be subscription/donation, stated openly.
- **Surveillance-style "who's active / read-by-whom" dashboards** — aggregate "seen by N" is fine; per-person activity timelines are not.
- **Known accepted limitations to document (not fix blindly):** Travel-Rule plaintext address in payment QR (regulatory, document the tradeoff); at-rest plaintext in IndexedDB (web has no portable device-key encryption — document for high-risk users).

## Per-persona verdicts

| Persona | Adopt? | One-line |
|---|---|---|
| Student (Maya, 20) | maybe | Compelling privacy, but no bill-split / multi-photo / search; wallet unused without request. |
| Professional (David, 38) | **no** | Too bare-bones for coordination: no search, pinning, calendar sync, granular notifications. |
| Mom (Sara, 42) | **no** | Beautiful but hostile to busy parents: no search, no per-chat mute, no parental controls. |
| Teen boy (Leo, 15) | maybe | Good bones; lacks playful UX, group notifications, story replies, GIF reactions. |
| Teen girl / social (Zoe, 16) | maybe | Solid E2E, but no search / multi-photo / granular mute, and blocking UI is missing. |
| Sports guy (Marcus, 28) | maybe | Good event bones; missing recurring events, group location, group event creation. |
| Grandparent (Ingrid, 70) | **no** | Broken for her: no calling, tiny fonts, no low-vision support. |
| Freelancer (Priya, 33) | **no** | No invoicing, client separation, portfolio sharing, backup, or request-payment. |
| Privacy activist (Sam, 30) | **no** | Sound architecture, naive ops: at-rest plaintext, no verification UI, no duress options. |
| Immigrant (Carlos, 35) | **no** | Partial language support, no remittance currencies, weak cross-border/timezone UX. |
| LDR couple (Aisha, 24) | **no** | First-message friction, no search for memories, voice-note delivery, no presence. |
| Organizer (Tom, 45) | **no** | Hard wall at 32 members; no roles, subgroups, or "who didn't RSVP". |
| Crypto-curious (Nina, 27) | maybe | Solid crypto, but no identity recovery, no live FTC price, device-bound graph. |
| Neurodivergent (Ravi, 22) | **no** | Broken notification settings, no snooze/mute, cluttered bubbles overwhelm. |
| Family-safety parent (Elena, 39) | **no** | Zero oversight, no real blocking UI, no age-gating. |

## Source

Full per-persona findings (~90) + matrix in the workflow result; this doc is the decision-ready
distillation. Re-run: the `comm-persona-audit` workflow.
