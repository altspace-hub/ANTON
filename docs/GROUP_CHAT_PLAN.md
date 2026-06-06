<!-- Generated 2026-06-05 via a 4-agent architecture mapping + design workflow. Phased build plan. -->

# E2E Group Chats in ANTON Comm — Phased Build Blueprint

**Constraints honored:** no central server, per-member fan-out only, reuse `sealForPeer`/relay/`messages` store, additive DB migration. Authoritative current state: `DB_VERSION = 13` (`src/comm/services/db.ts:16`), `STORE_MESSAGES` keyed by `id` with `by_thread = [threadHash, ts]` (`db.ts:113-117`), `sendStructuredMessage(peerContactHash, wire, opts)` is the single-recipient seal path (`chat.ts:340`), Pulse `publishPulsePost` is the proven jittered fan-out loop (`chat.ts:898-921`).

---

## 1. Architecture decisions

**1.1 Group identity = locally-generated UUIDv4, never derived from the member set.**
Creator runs `crypto.randomUUID()` at creation. Decisively *not* a hash-of-members, because membership mutates (add/remove/leave) and a derived ID would change the thread key on every roster edit, orphaning history. Stored in a new `STORE_GROUPS` record keyed by `groupId`. Reuses: nothing new — UUID is free, and `groupId` slots directly into the existing `threadHash` string field with zero schema change to `messages`.

**1.2 Membership authority = creator-owned (v1).** The creator's device is the single source of truth for the roster. Add/remove ops are only honored inbound if `wire.groupId`'s local record has `creatorHash === fromHash`. This kills two-phase-consensus bugs. Leave is the one exception: any member may broadcast `{action:'left', memberHash:self}`; the creator rebroadcasts a `remove` so the roster converges on every device. Reuses: the exact ownership-gate pattern already used in `applyEdit`/`applyDeleteForEveryone`/`applyReaction` (gate on `expectedOwnerHash === fromHash`, `messages.ts:437-472`) — roster gating is the same check against `creatorHash`.

**1.3 Message model = one plaintext, N sealed copies, shared `messageId`.** The sender generates a single `messageId` via the existing `generateMsgId()` (`chat.ts:320`) and seals the *same wire* once per member with `sealForPeer` (`crypto.ts:87-176`). Because static-DH ciphertext differs per peer (different shared secret) but the `messageId` is identical, the receiver coalesces by `(groupId, messageId)`. Reuses: `sealForPeer` unchanged — each member is just another `peerEd25519PubkeyHex`. No new crypto, no group key, no rekey-on-membership-change (a sender-keys/MLS scheme is explicitly deferred — v1 is fan-out, matching the constraint).

**1.4 Thread keying = `threadHash = groupId`.** A group message sets `threadHash = groupId`, `toHash = ''` (or `me`'s own hash on the local copy; see 2.3), and a new explicit `groupId?: string` discriminator field. 1:1 stays `threadHash = peerContactHash`, `groupId` undefined. The `by_thread = [threadHash, ts]` index (`db.ts:115`) already supports both with **zero new index** — `listThread(groupId)` and `listThread(peerHash)` are the same call. This is the single most important reuse: the entire paging/pagination/`getLatestPerThread` machinery works untouched.

**1.5 Inbound routing = sender-match unchanged, then group-roster gate.** `handleDeliverComm` already matches `fromRoutingId` against all contacts (`relay-client.ts:387-424`) and decrypts via `openFromPeer`. The decrypted wire's `kind` (now `group_text` etc.) carries `groupId`; routing into the thread is just `threadHash = wire.groupId` instead of `fromHash`. The new security gate lives in `applyInboundMessage` (`chat.ts:1315`): **if a `group_*` wire's `fromHash` is not in `getGroup(wire.groupId).memberHashes`, drop it.** Reuses: `openFromPeer` replay guard (`crypto.ts:178-194`) is per-sender/per-salt and already correct for groups — no change.

---

## 2. Data model + wires

**2.1 New store `STORE_GROUPS` (DB_VERSION 13 → 14).** Additive, no data migration (same pattern as v11 `STORE_CONTACT_REQUESTS`, `db.ts:177-179`):

```ts
// db.ts — new constant + v14 block in onupgradeneeded
export const STORE_GROUPS = 'groups';
// inside onupgradeneeded, after the v13 block:
if (!db.objectStoreNames.contains(STORE_GROUPS)) {
  db.createObjectStore(STORE_GROUPS, { keyPath: 'groupId' });
}
```

Group record shape (`groups.ts`, new file):
```ts
interface GroupRecord {
  groupId: string;            // UUIDv4
  name: string;
  memberHashes: string[];     // includes creator + self
  creatorHash: string;        // membership authority
  createdAt: string;          // ISO
  leftGroup?: boolean;        // self has left; blocks re-render in list
  disappearingTimerSec?: number; // per-thread, NOT per-contact (see 2.5)
  avatar?: string;            // optional base64
}
```

**2.2 `ChatMessage` gets one optional field — `groupId?: string` (`messages.ts:65-95`).** `threadHash` already holds it; `groupId` is the explicit discriminator so render code never has to guess "is this threadHash a UUID or a contactHash". `toHash` becomes effectively unused for group rows (set to `''` or `me.contactHash`); do **not** change its type to an array — the maps suggest `toHashes[]` but that breaks the `markReadUpTo` gate and the index for no benefit, since sealed copies are generated at send time, not stored per-recipient. Keep `toHash: string`.

**2.3 New wire kinds (add to the `WirePayload` union in `chat.ts`):**

| Wire kind | Persisted as ChatMessage? | Payload |
|---|---|---|
| `group_invite` | No (control) | `{groupId, name, memberHashes, creatorHash, createdAt}` |
| `group_roster_update` | No (control) | `{groupId, action:'add'\|'remove'\|'left', memberHash, ts}` |
| `group_text` | **Yes** (bubble) | `{messageId, groupId, text, replyTo?, disappearsAt?}` |
| `group_image`/`group_video`/`group_voice`/`group_file`/`group_poll`/`group_location`/`group_sticker` | Yes | Phase 6 — mirror the 1:1 media payloads + `groupId` |

`group_invite` and `group_roster_update` are **control wires** — they route through `sendInlinePayload` (ephemeral, persistent-queued, `chat.ts:503-621`), never `appendMessage`, exactly like `profile`/`event_update`. `group_text` routes through `appendMessage` with `threadHash=groupId`.

**2.4 Integration with `messages` store.** Nothing changes in the store. `appendMessage` is called with `{threadHash: groupId, groupId, fromHash, toHash:'', kind:'group_text', plaintext, messageId, ts, status}`. The `by_thread` index pages it. `getLatestPerThread` must be re-keyed to return a map by `threadHash` (it already keys by threadHash internally — the UI just needs to stop assuming threadHash == a contact, see Phase 4).

**2.5 Disappearing-timer ownership moves from Contact → GroupRecord.** `sendTimerChange(peerContactHash, sec)` reads `Contact.disappearingTimerSec`; the group equivalent reads `GroupRecord.disappearingTimerSec` and stamps `disappearsAt` on `group_*` kinds at seal time (same logic block, `chat.ts:369-373`).

---

## 3. Phased plan

Each phase is independently shippable: a later phase being absent never corrupts an earlier one's data.

### Phase 1 — Foundation: group store + create-from-contacts + appears in chat list
**Touchpoints:**
- `db.ts` — `STORE_GROUPS` + `DB_VERSION = 14`.
- `groups.ts` (new) — `listGroups()`, `getGroup(groupId)`, `createGroup({name, memberHashes})` (generates UUID, sets `creatorHash=me`, persists), `putGroup()`.
- Reuse `PulseAudienceSheet.tsx` (the existing multi-select, modes `everyone`/`specific`/`circle`) as the member picker — in `'specific'` mode it already returns `contactHashes`. A thin "New Group" entry point (FAB / ChatListScreen header) opens it, collects a name, calls `createGroup`.
- `ChatListScreen.tsx` — merge `listGroups()` into the thread list alongside `listContacts()`; render a group row (name + member-count badge) keyed by `groupId`. `getLatestPerThread()` already returns by `threadHash`; a group with no messages yet shows "No messages".

**Verification:** Create a group from 3 contacts → it persists across app restart, shows in the chat list with the member count, opens an (empty) thread.
**Shippable:** Yes — a local group entity with no networking. Zero risk to 1:1.

### Phase 2 — Send: fan-out a sealed group text
**Touchpoints:**
- `chat.ts` — `sendGroupMessage(groupId, plaintext, replyTo?)`:
  1. `getGroup(groupId)` → `memberHashes` minus self.
  2. ONE `generateMsgId()`.
  3. `appendMessage` the local copy once (`threadHash=groupId`, `groupId`, `status='queued'`).
  4. Fan-out loop modeled **exactly** on `publishPulsePost` (`chat.ts:907-921`): shuffle members, jitter 0–30s, for each call a new `sealForPeerFromQueued`-style seal → `sendSendComm(messageId, memberRoutingId, envelope)`. Reuse `sealForPeer(wireJson, member.publicKeyHex, me, member.contactHash)` per member.
- Factor the per-member seal+send out of the current single-recipient `flushOutbox`/`sendSendComm` (`chat.ts:1237-1313`, `relay-client.ts:301-321`) so both 1:1 and the group loop call it.

**Verification:** Send in a 3-member group → 2 sealed frames hit the relay (one per `targetRoutingId`); local copy shows `sent`. Confirm with relay frame logging that ciphertexts differ but `messageId` matches.
**Shippable:** Yes — outbound works even before receive lands (recipients just need Phase 3).

### Phase 3 — Receive: inbound routing + sender attribution + roster gate
**Touchpoints:**
- `chat.ts` `parseWirePayload` — recognize `group_text` (+ control wires).
- `chat.ts` `applyInboundMessage` (`chat.ts:1315-1824`) — new branch: for `group_*` bubble kinds, **gate**: `const g = await getGroup(wire.groupId); if (!g || !g.memberHashes.includes(fromHash)) return; // drop non-member`. Then `appendMessage` with `threadHash=wire.groupId, groupId, fromHash, toHash:me`. **Dedup**: before append, check `(groupId, messageId)` already present (a member may receive a redelivery) — skip if so. This is the new dedup the maps flag; 1:1 never needed it because there was one sender, but a group has fan-out + relay retries.
- `relay-client.ts handleDeliverComm` — unchanged; `fromRoutingId` match already yields the real sender; `openFromPeer` unchanged.

**Verification:** Two-phone live relay test — member B sends, member A receives into the group thread with B's name; a forged frame from a non-member contact is dropped (gate).
**Shippable:** Yes — full text group chat round-trips after this phase.

### Phase 4 — Group thread UI + header
**Touchpoints:**
- `App.tsx` — generalize `openChatHash` → still a string, but the thread screen branches on `getGroup(id)` existing.
- `GroupThreadScreen.tsx` (new) or branch inside `ChatThreadScreen.tsx`: header = `group.name` + "{n} members"; bubbles resolve `fromHash` → `displayName` via a `membersMap` built from `listContacts()` filtered to `memberHashes` (fallback `'Unknown'`). The `isMine = (m.fromHash === me.contactHash)` check (`ChatThreadScreen.tsx:844`) stays; the *else* branch now renders sender name + avatar above the bubble.
- `getLatestPerThread()` — confirm it keys by `threadHash` and the group row picks up its latest `group_text`.

**Verification:** Group thread shows distinct sender names/avatars per bubble; header shows correct member count; reply quoting shows the real sender's name.
**Shippable:** Yes — this is the "feels like a real group chat" milestone.

### Phase 5 — Membership: invite / add / remove / leave broadcast
**Touchpoints:**
- `groups.ts` — `addGroupMember(groupId, hash)`, `removeGroupMember`, `leaveGroup`.
- `chat.ts` — on `createGroup`, fan-out `group_invite` (sealed per member) so each member gets a local `GroupRecord`. `group_roster_update` handlers in `applyInboundMessage`: `add`/`remove` honored **only if `fromHash === group.creatorHash`**; `left` honored from any member (creator rebroadcasts `remove`).
- `GroupInfoScreen.tsx` (new) — roster viewer; Leave (any member) and Add/Remove (creator only, gated in UI + enforced on inbound).

**Verification:** Creator adds a 4th member → invite seals to the new member, roster-update seals to existing members, all devices converge. A non-creator's spoofed roster update is rejected. Leave removes self everywhere.
**Shippable:** Yes — turns a fixed group into a managed one.

### Phase 6 — Media + parity (reactions, edits, deletes, polls, location, typing, read, disappearing)
**Touchpoints:** generalize each single-peer sender to loop the `memberHashes` fan-out: `sendInlineWire`/`sendInlinePayload` (`chat.ts:503-621`) gains a group overload that loops; `sendReaction`/`sendEdit`/`sendDeleteForEveryone`/`sendPollVote`/`sendLocationUpdate` each fan-out. Read receipts: `markReadUpTo` gate (`messages.ts:397-430`) must change for groups — a group message is "read by whoever sent a `presence_read` with this `groupId`", tracked as a set, not a single `toHash` match. Disappearing timer reads `GroupRecord.disappearingTimerSec` (2.5).
**Verification:** Reaction/edit/delete/poll-vote from one member appears on all; per-thread disappearing timer sweeps correctly.
**Shippable:** Yes, incrementally — each feature is independent.

---

## 4. Risks + the single sharpest gotcha

**Risks (ranked):**
1. **Message dedup (new, real).** Fan-out + relay retries mean a device can receive the same `(groupId, messageId)` twice — 1:1 never had this. Must dedup on `messageId` before `appendMessage` (Phase 3). Without it, every group message double-renders.
2. **Fan-out under the relay/recipient cap.** `publishPulsePost` slices to `PULSE_MAX_RECIPIENTS` (`chat.ts:855`). A large group sealing+jittering N copies stresses the same path; reuse the jittered loop but cap group size (e.g. 32) and skip the 0–30s jitter for *interactive chat* (jitter is a Pulse anti-timing-analysis measure; in a chat the recipients already know they're co-members, so send promptly). Decision: **fan-out immediately for `group_text`, no jitter.**
3. **The 1:1 assumptions baked into dispatch.** `sendStructuredMessage` (`chat.ts:340`), `sendSendComm` (single `targetRoutingId`), `toHash` denorm, `markReadUpTo` toHash-gate, inline-outbox `stableId = sha256(peerContactHash|wireJson)` (collides if two members get the same wire — must fold `memberHash` into the stableId). Each is a per-recipient generalization, not a redesign.

**The single sharpest gotcha — a group member who is not your contact.** `sendStructuredMessage` hard-requires `getContact(peerContactHash)` with a `publicKeyHex` and throws `NO_CONTACT`/`NO_PEER_KEY` (`chat.ts:348-355`); inbound `handleDeliverComm` matches the sender by deriving `routingId = sha256(pubkey)` over **contacts only** (`relay-client.ts:387-424`), so a member you haven't added is *invisible to both send and receive*. The roster carries `memberHashes` but **not their pubkeys**, and you can't seal to a hash. **Resolution:** the `group_invite` wire must carry each member's `publicKeyHex` (not just hash), and on accepting an invite the device must auto-provision a *lightweight, group-scoped contact-like key entry* (or extend `getGroup` lookups to a `memberKeys: Record<hash,pubkeyHex>` map on the `GroupRecord`) so `sealForPeer` and the inbound routing-id match work for co-members who were never added as 1:1 contacts. This is the load-bearing design choice — get the member-pubkey distribution into `group_invite`/`group_roster_update` in Phase 5's wire shape *before* building send (Phase 2), or non-mutual members silently cannot participate.

**Relevant files:** `src/comm/services/db.ts`, `src/comm/services/groups.ts` (new), `src/comm/services/chat.ts`, `src/comm/services/messages.ts`, `src/comm/services/relay-client.ts`, `src/comm/services/crypto.ts`, `src/comm/services/inline-outbox.ts`, `src/comm/components/PulseAudienceSheet.tsx`, `src/comm/pages/ChatListScreen.tsx`, `src/comm/pages/ChatThreadScreen.tsx`, `src/comm/components/GroupThreadScreen.tsx` (new), `src/comm/components/GroupInfoScreen.tsx` (new), `src/comm/App.tsx`.

---

## 5. Roles + Scalability (v1) — SHIPPED 2026-06-06

**Authority model — OWNER is the single roster writer.** The creator (= owner) is the only one who
edits membership, roles, and settings, so there is NO concurrent-writer divergence and the roster
needs NO per-mutation signature: roles + the announce flag are DATA carried IN the existing
owner-authenticated `group_invite` (gated `creatorHash === relay fromHash`, applied only at a
strictly-greater `rosterVersion`). `roleOf` forces the creator to `owner` regardless of any stored
role, so authority can't be stripped by a malformed roster. An inbound roster that OMITS its own
creator is rejected (no un-removable ghost authority).

**Roles.** `GroupMember.role?: 'owner' | 'admin' | 'member'` (absent = member, back-compat).
- ADMIN (owner-granted): (a) may POST in announcement-mode groups, (b) may MODERATE = delete ANY
  message in the group. Recipients re-derive moderation authorization locally (target author +
  roster role) — no trust in a wire flag.
- Predicates in `groups.ts`: `roleOf`, `isGroupOwner`, `isGroupAdmin`, `canPostToGroup`,
  `canModerateGroup`, `canManageGroup`.

**Announcement mode** (`GroupRecord.announce`). Owner-set, carried in the roster. Only owner+admins
post (text + media + reactions all gated — reactions are a per-member fan-out too). Enforced on BOTH
the outbound send and the inbound apply, so a forged wire from a read-only member is dropped on
receipt. The scalability lever: a large read-only channel's fan-out is bounded by the few who post.

**Scalability.** `GROUP_MAX_MEMBERS` raised 32 → 256. The abuse bound `MAX_ROSTER_HARD = 1024` is now
SEPARATE from the product cap (the 32-cap used to live in `sanitizeMembers`, silently truncating a
larger inbound roster). Fan-out is throttled (pause every 16 live sends). Group read receipts are
suppressed (both send + inbound apply) for >32-member or announce groups. Durability: a live group
send that fails on a connected-but-broken socket now falls back to the durable outbox (no silent
roster/role/announce loss).

**Re-add convergence.** A member REMOVED by the owner (`removedByOwner`) rejoins when the owner
re-adds them (a newer owner roster re-including their hash clears `leftGroup`). A VOLUNTARY leaver is
never dragged back by a routine re-broadcast.

**No DB bump.** `role`, `announce`, `removedByOwner` are additive optional fields on the existing
`GroupRecord` JSON in `STORE_GROUPS` — no migration, no index change.

### 5a. Known v1 limitations (documented, not bugs)
1. **Old-client truncation.** A client predating this version still slices an inbound roster to 32 in
   its `sanitizeMembers` and stores the truncated roster as authoritative. So a >32-member group
   requires every member to be on ≥ this version. (New clients store the full roster intact.)
2. **Old-client announce enforcement.** An old client ignores the `announce` flag, so an old-client
   RECIPIENT would render a non-admin's post and an old-client SENDER could try to post — but every
   up-to-date recipient drops a non-admin post via the inbound gate, so announce is enforced as long
   as recipients are current. Not a hard guarantee for mixed-version groups.
3. **Media broadcast volume.** Per-member fan-out is unchanged: a 700 KB image at N=256 is ~178 MiB
   of relay egress for one send. Only a per-copy cap exists (no total-volume guard). Announcement
   mode is the mitigation (only admins post media); a normal 256-member group sending media is the
   user's explicit choice. A total-volume confirm is a follow-up.

### 5b. DEFERRED — signed multi-writer admin membership (the hard part)
Letting ADMINS (not just the owner) independently add/remove members is intentionally NOT in v1. It
reintroduces concurrent writers, which the single monotonic `rosterVersion` + strictly-greater apply
silently diverges on, and the unsigned roster gives recipients no per-edit proof to reject a forged
or removed-admin edit. Doing it safely needs (1) per-mutation Ed25519 signatures verified against the
actor's pubkey (signing exists in `identity.ts` but is unused for the roster), and (2) replacing the
single counter with a per-actor sequence / LWW tiebreak. That is its own build.
