# ANTON Communication App — Feature Roadmap

**For:** Claude Code (and operators picking up between sessions)
**Date:** 12 May 2026
**Status:** Living document — iteration 3 in progress
**Related:** `anton-communication-app-brief.md`, `docs/COMM_RELAY_PROTOCOL_v0_1.md`

The 13 features below were identified from the research round in iteration 2 — Snapchat / Telegram / Signal / WhatsApp comparison plus a new user-requested **Wassup** status-feed tab. They are listed in **execution order**, not value-rank order: items that share infrastructure are grouped, and structural/architectural features come before pure-polish ones to avoid rework.

Each item has a stable id (`R1`–`R13`) so commits and issues can cite it cleanly.

---

## R1 — Reply / quote message

**Why first:** universal expectation, almost no infrastructure, immediate UX win, and the wire-payload pattern (a message that references another message id) is the same pattern used by reactions, edits, and deletes — so we shake out that shape early.

**Scope:** S (½–1 day)

**Wire format:**
- Extend `WirePayload` with `{ kind: 'text', text, replyTo?: ReplyContext }` (and similar fields on image/video).
- `ReplyContext = { msgId: string, snippet: string, kind: ContentKind }` — snippet is ≤80 chars so we can render the quoted bubble without re-fetching the original.

**UI:**
- Long-press / swipe-left a bubble → "Reply" action in a small sheet.
- Composer shows a quoted-strip above the input with `× Cancel`.
- Sent bubble renders quoted-strip above the body.

**Acceptance:** A swipe-reply round-trips end-to-end on the phone APK; quoted strip renders for both sender and recipient; tapping the quoted strip scrolls the thread to the original message if still in view.

---

## R2 — React (emoji reactions, one per user per message)

**Why with R1:** same wire pattern (message references). Ship together.

**Scope:** S (½ day on top of R1)

**Wire format:**
- New `WirePayload` variant: `{ kind: 'react', data: { targetMsgId, emoji, op: 'add' | 'remove' } }`.
- Local message store extended with `reactions: Record<emoji, contactHash[]>`.

**UI:**
- Long-press bubble → emoji shelf (six picks + "more") above the action sheet.
- Reactions render below the bubble as small chips.

**Acceptance:** Reaction adds/removes round-trip; chips render under the bubble; multiple reactors aggregate.

---

## R3 — Wassup (status-feed tab, between Chat and Events)

**Why third:** this is a structural feature — new tab, new wire payload, new IDB store. Do it before locking in more UI infrastructure. Design comes from a separate research note (see `docs/WASSUP_DESIGN.md`, written alongside this roadmap).

**Scope:** L (3–5 days)

**Headline design** (full design doc in `docs/WASSUP_DESIGN.md`):
- **Closed-graph by default.** Posts go to all contacts unless the user picks a smaller audience. WeChat Moments / WhatsApp Status pattern, not Twitter's open graph.
- **Distribution = N×SEND_COMM** for now. Acceptable for ≤50 contacts. Migrate to group-broadcast (MLS) when groups land.
- **Default 7-day expiry**, configurable per-post (None / 24h / 7d). Old posts evict locally.
- **Post types**: text, text+image, text+video, poll (reuses R6).
- **Interactions**: like (tap heart) + comment (flat list, no threading). Flow back peer-to-peer.

**Schema:**
- New IDB store `posts` with `(id, authorHash, body, kind, mediaPayload?, audience, createdAt, expiresAt)`.
- New IDB store `post_interactions` with `(postId, kind: 'like' | 'comment', fromHash, body?, ts)`.
- Wire payloads: `kind: 'post'`, `kind: 'post_like'`, `kind: 'post_comment'`, `kind: 'post_delete'`.

**UI:**
- New tab "Wassup" between Chat and Events in `TabBar`.
- `WassupFeedScreen` — vertical feed, pull-to-refresh, post composer FAB.
- `WassupComposeScreen` — text + media + audience picker.
- `WassupPostDetailScreen` — full post + comments + like list.

**Acceptance:** Two phones can post, see each other's posts, like, comment. Posts older than expiry are hidden client-side. Audience subset works (Alice posts to Bob only; Carol doesn't see it).

---

## R4 — Voice notes

**Why fourth:** biggest "feels like a real messenger" feature, but isolated — doesn't need to wait on or depend on anything before it.

**Scope:** M (1 week)

**Wire format:** `{ kind: 'voice', data: { audio: base64, mimeType: 'audio/webm' | 'audio/m4a', durationSec, waveform: number[] } }`. Waveform is a small array (≤200 numbers, 0-1) for visual rendering.

**UI:**
- Hold the mic button in the composer to record. Show recording timer.
- Swipe up to lock recording (Telegram pattern). Swipe left to cancel.
- Waveform preview on send.
- Playback in chat bubble with play/pause + scrub bar.

**Native bits:** Capacitor's MediaRecorder + WebAudio for waveform extraction. iOS Safari has WebAudio quirks — test before assuming parity.

**Acceptance:** Hold-record + swipe-lock + swipe-cancel all gesture-correct on Android APK. Recording <60s stays under 1 MiB at 32kbps. Playback works for both sender and recipient.

---

## R5 — Disappearing messages (per-chat timer)

**Why fifth:** timer infrastructure is reused by R6 (view-once). Cheap to ship after R4 because no new wire shape needed beyond a `disappearsAt` field on existing message kinds.

**Scope:** S (2-3 days)

**Wire format:** add optional `disappearsAt: string` (ISO) to every existing WirePayload. Both sides delete locally when that timestamp passes.

**UI:**
- Chat thread header → settings → "Disappearing messages" sheet with options: Off / 5 sec / 1 hour / 1 day / 1 week.
- Setting is per-chat; sender stamps each message with the chat's current timer.
- Visual cue: tiny clock icon on disappearing bubbles.

**Acceptance:** Two phones share a chat with 1-hour timer. Both sides delete locally after the timer. Timer change is communicated to the peer (via a system-message with `kind: 'system_timer_change'`).

---

## R6 — View-once media (Snap-style)

**Why with R5:** rides the same expiry primitive. One extra flag.

**Scope:** XS (1 day on top of R5)

**Wire format:** add `viewOnce: true` to MediaPayload. Recipient renders a blurred placeholder; tapping reveals once, then deletes locally.

**UI:**
- Toggle in the AttachmentSheet: "View once" pill above the four tiles.
- Bubble for view-once media: blurred, "Tap to view once" overlay. Single-tap reveals; bubble flips to "Viewed" state after dismissal.

**Acceptance:** View-once photo round-trips; after the recipient taps + dismisses, the local copy is wiped; the sender sees a "Viewed" status tick.

---

## R7 — Polls

**Why seventh:** valuable for friends-and-family ("where are we going?"), structured message type, no new infra.

**Scope:** S (3-4 days)

**Wire format:** `{ kind: 'poll', data: { question, options: string[], multiSelect: boolean, expiresAt? } }`, with votes as separate messages `{ kind: 'poll_vote', data: { pollId, optionIdx[] } }`.

**UI:**
- AttachmentSheet gains a "Poll" tile → `PollComposeScreen` (question + 2-6 options + multiselect toggle).
- Poll bubble in chat with tappable option list; vote tallies update as `poll_vote` messages arrive.

**Acceptance:** Two phones can create a poll, both vote, both see tallies.

---

## R8 — Forward / Edit / Delete (rest of the message-actions bundle)

**Why eighth:** can ship after voice + disappearing because each is small and independent.

**Scope:** S (2-3 days for all three)

**Wire format:**
- `forward`: a new outbound message with the same payload, copied from another message. No wire change.
- `edit`: `{ kind: 'edit', data: { targetMsgId, newText } }`. Only text messages are editable. Both sides update the local copy.
- `delete-for-everyone`: `{ kind: 'delete', data: { targetMsgId } }`. Recipient replaces the bubble with a "Message deleted" placeholder.

**UI:** all three sit in the long-press action sheet alongside Reply + React.

**Acceptance:** All three round-trip; edited messages show a small "edited" annotation; deleted messages show the placeholder.

---

## R9 — Read receipts + typing indicator (both togglable, default off — Signal stance)

**Why ninth:** ephemeral presence pings, no IDB writes, but requires relay support for transient "this message was read" signal. The relay can carry these as small SEND_COMM frames with a special `kind: 'presence_*'` payload that recipients don't store.

**Scope:** S (3 days)

**Wire format:** `{ kind: 'presence_read', data: { lastMsgId } }`, `{ kind: 'presence_typing', data: { isTyping: boolean } }`.

**UI:**
- Profile screen → "Privacy" → "Send read receipts" toggle (default off).
- Two single-grey-tick / two-blue-tick states on outbound bubbles (same as the status ticks today, just upgraded to show actual delivery + read).
- "Typing…" indicator below the contact name in the chat thread header.

**Acceptance:** Toggle works; receipts only fire when the recipient also has receipts enabled; typing indicator surfaces within 1s of keystroke and clears 3s after last keystroke.

---

## R10 — Scheduled messages (send-later, up to 100 per chat)

**Why tenth:** purely client-side. Telegram-style. Lightweight.

**Scope:** S (2-3 days)

**Wire format:** none on wire — these are queued locally. The transport flush in `relay-client.ts` skips messages whose `scheduledFor > now`.

**UI:**
- Long-press send button → "Schedule" → date/time picker.
- "Scheduled" badge inside the chat thread shows pending count; tapping opens a sheet listing them with cancel/edit.

**Acceptance:** Schedule a message for 1 min in the future on the phone. After 1 min the message is sent automatically; recipient receives it.

---

## R11 — Event reminders + push notifications (close out the Events surface)

**Why eleventh:** needs FCM keys from the operator. Until those are wired this is a client stub: the app schedules local notifications for events the user said yes to.

**Scope:** S (1-2 days local-only; M with FCM)

**UI:** event detail has a "Remind me 1 hour before" toggle. Local notification via Capacitor `LocalNotifications`. Push reminder (server-pushed) added when FCM keys are configured.

**Acceptance:** Set a reminder on an event 5 min in the future. Local notification fires when 1 minute before the event start.

---

## R12 — Stickers / GIF packs

**Why twelfth:** high emotional value, but pure asset-pipeline work — large scope to source/import packs. Defer until everything else is shipped.

**Scope:** M (1 week, including pack curation)

**Wire format:** `{ kind: 'sticker', data: { packId, stickerId, packUrl? } }`. Stickers cached locally by hash.

**UI:** AttachmentSheet gains a "Stickers" tile → grid picker. User-importable `.anton-sticker` bundle as a future enhancement.

**Acceptance:** Send a sticker, recipient sees it inline at the right size, no PNG re-download per send.

---

## R13 — Location share (one-shot pin + optional live-for-N-minutes)

**Why last:** pairs with Events ("I'm 5 min away") but is a self-contained feature.

**Scope:** M (1 week)

**Wire format:** `{ kind: 'location', data: { lat, lng, accuracyM, label?, liveUntil? } }`. Live-location sends a sequence of `location_update` messages until `liveUntil`.

**UI:** AttachmentSheet "Location" tile → map preview (Capacitor `Geolocation` + a static-image map provider, e.g. OpenStreetMap tile or Mapbox static URL). Bubble shows the map preview; tap opens full map.

**Acceptance:** Share a one-shot pin; recipient sees a map preview with correct coords. Live-location updates every 15s for the picked duration, then stops.

---

## Explicitly **out** of this roadmap

These were researched and explicitly skipped — they don't fit ANTON's brand or are too costly:

- Public channels / broadcast accounts (open-graph; conflicts with QR-trust onboarding)
- Snap Map (privacy posture wrong)
- Slack-style threading (enterprise pattern; not friends-and-family)
- Last-seen presence (Signal's stance: drop it)
- Supergroups beyond ~1,000 members
- Screenshot detection (unreliable on iOS, gives false sense of security)
- In-composer camera with warm-on-focus (deferred — too platform-specific for this iteration, R4 voice notes is a bigger UX uplift)
- Groups (deferred — needs MLS or Sender-Keys decision; significant separate effort)

---

## Execution order summary

```
Session 1 (this one):
  R1 Reply           — 0.5 day
  R2 React           — 0.5 day
  R3 Wassup          — 3-5 days   ← biggest item this session

Session 2:
  R4 Voice notes     — 1 week     ← single biggest "feels real" win
  R5 Disappearing    — 2-3 days
  R6 View-once       — 1 day

Session 3:
  R7 Polls           — 3-4 days
  R8 Forward/Edit/Delete — 2-3 days
  R9 Read receipts + typing — 3 days

Session 4:
  R10 Scheduled      — 2-3 days
  R11 Event reminders — 1-2 days
  R12 Stickers       — 1 week
  R13 Location       — 1 week
```

Total estimated effort: **8-12 weeks** of focused work for all 13. We ship session-by-session.

Each session ends with: build + typecheck clean, native APK installed and tested on the phone, one or two screenshots verifying the new surface, commit message citing the R-IDs landed.
