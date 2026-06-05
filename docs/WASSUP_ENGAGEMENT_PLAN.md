# Wassup — Engagement Plan (make the Comm feed feel alive)

**Status:** scoped 2026-06-05 (3-agent investigation). Not started. Goal: make Wassup —
the Comm app's social feed — somewhere you *want* to open daily, with the feel of **early
Instagram (2011–2014) + early Tumblr (2010–2013)**: post pics + thoughts, react and comment
on friends' things, a small creative community.

## The framing insight

Wassup is **mechanically sound but emotionally flat.** And its "limitations" — friends-only,
no algorithm, no ads, no public discovery, E2E-encrypted — are *exactly* the qualities that
made early IG/Tumblr feel intimate and delightful before the feeds got optimised and noisy.
**So the plan leans INTO the privacy ethos as the product, not around it.** No engagement-bait,
no surveillance metrics, no growth-hacking. Just richer ways for a small circle of friends to
share and react.

## What Wassup is today (the foundation)

- **Screens:** `src/comm/pages/Wassup{Feed,Compose,PostDetail}Screen.tsx`. Reverse-chronological
  feed, polled every 3s.
- **A post** (`src/comm/services/wassup.ts` `WassupPost`): text (≤500) + EITHER one image OR one
  voice note, an **audience** (everyone / specific contacts, ≤256), an **expiry** (1h…7d…forever),
  denormalised like/comment counts.
- **Interactions** (`WassupInteraction`): flat `like` | `comment`. A like/comment is sent to the
  **post author ONLY** (not re-fanned to the audience) — so interaction visibility is author-centric.
- **Wire** (`chat.ts`): `wassup_post` / `wassup_like` / `wassup_comment` / `wassup_delete`, each
  E2E-sealed **per recipient** and fanned out at publish with jittered 0–30s delays.
- Relay frame cap ~1 MiB; image/voice are inline base64.

## The hard E2E constraints (a plan must respect)

- **No central server, no public graph** → no global discovery/trending. Your feed = your friends'
  posts. (This is the *feature*, per the framing above.)
- **Fan-out is O(n) per-recipient E2E sends** (≤256) at publish. Multi-photo = 3–5× wire but fine.
- **Likes/comments reach the author only.** "Who else liked this" requires the author to
  *re-broadcast* counts/reactor-names to the audience (deferred in v1).
- **Repost/reblog is the genuinely hard one:** re-broadcasting someone's post to *your* friends
  leaks it beyond its original audience → needs **author consent** + re-encryption to your graph.
- **No surveillance:** the investigation flagged that read-receipts / post-view-counts would feel
  creepy even among trusted friends. Skip them.

## Phased plan

### Phase 1 — Richness + delight (low friction, NO protocol/privacy change)
The biggest "feels like IG" wins, all client-side or tiny additions:
1. **Multi-photo carousel** (2–5 photos/post) — `WassupMedia` → `WassupMedia[]`; compress to stay
   under the ~1 MiB cap. The single highest-impact change (posts stop feeling lonely).
2. **Captions** — text persists alongside the photo(s); a snapshot becomes a little story.
3. **Double-tap-to-like** — the classic delightful micro-interaction.
4. **Emoji reactions** (beyond the heart) — a small fixed set (❤️🔥😂👍😮😢); reuse the interaction
   model (+ an `emoji` field / `wassup_reaction` wire), still author-directed.
5. **Inline voice playback** in the feed — reuse `VoicePlayer`; no new wire.

### Phase 2 — Social velocity + conversation
6. **Comment threads** (`replyToInteractionId`) — nested replies; start with author-only visibility
   (cheap, E2E-safe).
7. **Social proof** — the deferred v1 piece: the author re-broadcasts like/reaction/comment
   tallies + reactor names to the audience, so you see "Maria and 3 others reacted."
8. **@mentions** — tag a contact in a post/comment and notify them (ties into the now-working
   message-notification layer).
9. **Profile / post gallery** — a contact's posts you've received, as a grid. Pure UI over existing
   data; reuse the avatar/profile work.

### Phase 3 — Curation + discovery *within the closed graph*
10. **Hashtags + a local hashtag feed/search** — client-side extraction + index; topical browsing
    without any server.
11. **Follow / mute per contact** — a local feed filter so you curate *whose* posts surface
    (no wires; purely your view).
12. **Bookmarks / saved posts** — a local store; lightweight "keep this."
13. **Stories / "moments" lane** — surface the *already-existing* 24h-expiry posts as a distinct
    ephemeral rail at the top of the feed (Instagram's permanent-vs-ephemeral split, for free).

### Phase 4 — Consent-gated reshare (the hard one)
14. **Reblog/repost-to-your-feed** — author opt-in **"allow reshare"** flag on a post; resharing
    re-encrypts + fans out to *your* graph with attribution to the original author. Never leaks a
    post the author didn't mark shareable.

## Principles (keep the early-social charm)
- Friends-only, chronological-by-default, no algorithmic manipulation, no ads — **this is the
  product**, not a gap.
- No surveillance metrics (no read receipts / view counts on posts).
- Reshare and audience changes are **consent-first** — never re-disclose beyond the original scope.
- Every media change stays under the relay cap (compress; degrade gracefully).

## Reuse map
`src/comm/services/wassup.ts` (post/interaction model + apply-inbound), `chat.ts` wassup wires,
`VoicePlayer`, the image/`MediaPayload` + capture pipeline (already handles the relay cap),
`AvatarCircle`/profile work, the message-notification layer (for @mentions + reaction notifies).
DB version bumps only where a store/field is added (multi-photo, reactions, threads, hashtags index).
