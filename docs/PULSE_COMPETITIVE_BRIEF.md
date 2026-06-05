<!-- Generated 2026-06-05 via a 5-agent competitive analysis (Pulse code inventory + Tumblr/Instagram/Snapchat surveys + synthesis). Strategy doc — not a spec. -->

# Pulse Strategy Brief: A Double-Take Against Tumblr, Instagram & Snapchat

*Where the privacy-first social feed stands, and where it goes next — without betraying the ethos.*

The thesis up front: **Pulse is not a smaller Instagram. It is a structurally different thing** — a social feed that is cryptographically incapable of surveillance, virality, or engagement-farming. Every "gap" against the incumbents must be judged not by "do they have it?" but by "does adding it make Pulse *more* itself?" The features below that survive that test are the roadmap. The ones that fail it are the moat.

---

## 1. Scorecard

✓ = first-class · ◐ = partial/possible · ✗ = absent or rejected-by-design

| Capability area | Pulse | Tumblr | IG | Snap |
|---|---|---|---|---|
| **Create** (post types, media) | ◐ text + 2-5 photos + voice; no typed composer, no reblog, no queue | ✓ 7 rich types, reblog chains, queue | ✓ carousel + Reels + photo | ◐ snaps + short video, thin text |
| **Express / React** (identity-in-content, tags) | ◐ hashtags local; fixed emoji palette; no themes, no tag-whisper | ✓ tags-as-voice, custom themes, sideblogs | ◐ captions, limited styling | ◐ filters/lenses, bitmoji |
| **Converse** (comments, replies, threads) | ✓ signed threaded comments + @mentions + relay | ✓ replies, reblog commentary, asks | ◐ comments, no threads | ✗ ephemeral DM only |
| **Identity** (who you are, pseudonymity) | ✓ keypair + self-chosen handle/avatar; no real-name | ✓ pseudonymous, multi-blog | ✗ real-name, verified, public | ◐ username + bitmoji |
| **Curate** (filter, save, favorites) | ✓ mute/favorite/bookmark, hashtag search (local) | ✓ blacklist, Savior, tags | ◐ favorites, save | ✗ |
| **Ephemeral / Stories** | ✓ ephemeral *by construction* (24h default), stories rail, viewer | ✗ permanent | ✓ stories + stickers + close-friends | ✓ snaps, map, streaks |
| **Connect** (reactions, lightweight social, circles) | ◐ reactions + comments; no polls, no close-friends ring, no ask box | ✓ asks, ask-games, mutuals, likes-vs-reblogs | ✓ poll/quiz/slider stickers, close-friends | ✓ streaks, reactions, stickers |
| **Delivery** (how it reaches people) | ✓ E2E sealed per-recipient, jittered O(n) fan-out, no central feed | ✗ central server, public | ✗ central, algorithmic | ✗ central, algorithmic |

**Read of the table:** Pulse is *ahead* on Identity, Converse, Curate, Ephemeral, and Delivery — the privacy-load-bearing columns. It is *behind* exactly where the incumbents spent a decade of design polish: **Create** (post variety, reblog, queue) and **Connect** (lightweight playful social rituals). That's the roadmap shape: borrow the *creative and social texture* of old Tumblr + IG's stickers, and never touch their distribution engines.

---

## 2. Where Pulse Already Wins (the ethos as free moat)

These are not aspirations — they fall out of the architecture, and **no mainstream app can match them without rebuilding from zero:**

1. **Surveillance is impossible, not merely promised.** There is no central feed server to run ranking, count views, or sell ads. "No algorithm" isn't a setting that a future PM can flip — it's an absence of the machine that would do it. IG/Snap *say* "your privacy matters"; Pulse can say "we are structurally unable to watch you," and it's true.

2. **Forge-proof social.** Reactions, comments, mentions, and (future) reblog segments are signed over canonical JSON. On every other platform, the *server* asserts who said what — and can be subpoenaed, hacked, or simply wrong. On Pulse the *cryptography* asserts it. A comment attributed to your friend provably came from your friend. This is a genuinely novel property in consumer social.

3. **Friends-only is the *default texture*, not a privacy mode.** IG's Close Friends is a green-ring exception inside a public-by-default app. Pulse is Close-Friends all the way down — everyone in your graph is a key-exchanged mutual. The warmest, most intimate tier of every other app is Pulse's *baseline*.

4. **Ephemeral that's actually ephemeral.** Snap "deletes" on its servers (and keeps metadata, and has been breached). Pulse posts expire and self-sweep from each device's IndexedDB; there's no server copy to leak because there was never a server copy. Per-recipient sealing means there isn't even a master object to recover.

5. **No vanity metrics by design.** No follower counts, no public like tallies, no "seen by 1,204." The author privately sees who appreciated; nobody competes for a number. This removes the single biggest driver of social-media anxiety — and it's free, because the metric infrastructure simply doesn't exist.

**The one-sentence pitch this enables:** *"The only social feed where the company physically cannot see your posts, count your views, rank your friends, or keep your deleted memories."*

---

## 3. High-Value Gaps That FIT the Ethos (ranked Phase 4+ roadmap)

Ranked by **(warmth + differentiation) ÷ effort**. Each respects E2E sealing, O(n) fan-out, ~1 MiB relay cap, and local-first.

### Tier 1 — Ship next (highest warmth-per-unit-effort)

**① Close-Friends Circles (reuse the audience picker)** — *from IG · effort S*
A saved, named subset of contacts ("close-friends", "art-crew"). The audience picker already targets `audience[]`; this just persists reusable circles and adds a green ring on the stories rail. **Why it's almost free and almost mandatory:** it's *more* private than IG's because non-members are cryptographically excluded (sealed bytes never reach them), not UI-hidden. No new wire. **Payoff:** unlocks vulnerable, real sharing — the #1 driver of "different truths for different circles." **This is the single best effort-to-value item on the board.**

**② Poll / Slider / Question stickers (signed-response)** — *from IG · effort M*
Poll options ride in the post wire; a tap sends `pulse_poll_vote` to the author only; the author re-broadcasts an **aggregate count** via the existing `pulse_meta` path (the monotonic-ts staleness guard already exists in `applyInboundMeta`). **Critical ethos rule:** counts only, *never a voter list* — no IG-style "see who voted." **Payoff:** turns broadcast into a two-way game; the lightest possible way to make a post social. Reuses an already-built rail.

**③ Content Warnings + reader-side tag filtering (Tumblr Savior)** — *from Tumblr · effort S*
Author adds CW tags inside the sealed payload; each recipient's device applies *their own* local blacklist to blur/collapse matching posts pre-render. **Why it's strictly better than Tumblr:** the relay literally cannot inspect content (it's E2E), so reader-side consent filtering is the *only* possible model — and it's the right one. Care-culture for free. **Payoff:** makes Pulse safe for vulnerable communities, which is exactly where intimate social thrives.

**④ Ask Box → "Curtained Ask"** — *from Tumblr · effort M*
A contact sends a question; you answer by composing a post that embeds the signed question. **The hard part, solved:** true anonymity is undesirable in a friends-only E2E graph (no accountability = abuse). Adaptation: the asker is *always* cryptographically known to your device (for blocking), but chooses to hide their name from the *published* answer — the client strips the name before fan-out and keeps the signature encrypted locally so you can unmask-and-block a harasser. **Payoff:** the famous "send me asks" engine — the door-in for shy people — without untraceable abuse.

### Tier 2 — High value, more build

**⑤ Typed composer: Quote / Link / GIF / Chat / Long-form** — *from Tumblr · effort M-L*
Structured JSON inside the sealed payload (type + fields), one renderer each — *exactly the renderer-registry pattern ANTON already uses*. Quote/Chat are pure layout (zero cost). GIF/audio transcode to fit the ~1 MiB frame; oversized degrades to thumbnail + on-demand chunked fetch. **Payoff:** turns the feed from "status updates" into "mixed-media self-expression" — the texture that made Tumblr feel hand-made. Start with Quote + Long-form (free), add GIF later.

**⑥ Reply-with-media** — *from IG/Tumblr · effort S-M*
Comments already signed and relayed; extend the comment wire to carry one compressed image/voice clip (same media-normalization as posts, same relay-cap discipline). **Payoff:** the conversational connective tissue gets richer — reaction GIFs, "here's mine too," visual back-and-forth — without a new subsystem.

**⑦ Queue + scheduled + drafts (local scheduler)** — *from Tumblr · effort M*
Entirely on-device: a local scheduler seals + fans out at each tick. No server-side scheduling (there's no server). Drafts never leave the device. **Payoff:** "de-weaponizes posting" — a calm ambient rhythm instead of burst-then-silence. Plays perfectly with per-post expiry. Genuinely controls what friends see *when*, because the feed is chronological.

**⑧ Channels (sideblogs reframed)** — *from Tumblr · effort M-L*
Named posting personas under one keypair, each with its own display name/theme **and its own audience subset**. Fan-out is already per-recipient, so an audience-scoped channel is natural — "art" channel seals to art-friends, "personal" to close-friends. Overlaps heavily with ①; build circles first, channels as the richer evolution. **Payoff:** curatorial compartmentalization (the multi-faceted self) with zero public multi-blog graph.

**⑨ Ask-games / prompt templates** — *from Tumblr · effort S*
Built-in typed templates (number lists, this-or-that, tag games) that produce a post inviting signed replies, riding the existing reply + curtained-ask rails. **Payoff:** social glue — a *script* for shy people to interact. Cheap warmth that seeds engagement among contacts with zero virality.

### Tier 3 — The signature bet (its own section below)

**⑩ Pass-along reblog chains** — *from Tumblr · effort L* — see §5.

### Notable reframes worth a line

- **Sandboxed themes** (Tumblr custom blogs): a curated set of *safe style tokens* (palette/accent/font from a bundled set, header image) shipped inside your sealed posts so friends render your post "in your aesthetic." **No HTML/CSS/JS** — that's a script-injection/tracking-pixel non-starter in an E2E client. Effort M, lower priority, high charm.
- **Tag-whisper layer** (Tumblr tag commentary): a distinct muted-text region on each post, signed like a comment. The single most-beloved intimacy signal of old Tumblr. Bundle it with ⑤. Effort S.
- **Streaks, reframed non-creepily**: *not* a Snap-style pressure mechanic that punishes you for missing a day. Reframe as a private, local "you and Sam have shared 30 days running" warmth note — local computation, never broadcast, never a guilt-trip badge. Effort S, optional.
- **Local provenance view** (reblog-graph): render only the chain slice your device holds, with signed attribution — "look who built this together," scoped to your friend-visible portion. Pairs with ⑩.

---

## 4. Deliberately REJECT (the guardrails are the product)

These are not gaps. **Each rejection is a feature you can put on the box.** Frame them as promises:

| Rejected feature | Source | Why it dies on contact with the ethos |
|---|---|---|
| **Explore / Reels-recommendation / Discover / Spotlight** | IG/Snap | Algorithmic feeds of strangers optimized for watch-time. There is no public graph and no central server to rank — it is *impossible by construction*, and that's the whole pitch. Ship the Reels *format* (short clips, if relay-cap allows), **never** the For-You engine. |
| **Ads / sponsored / promoted posts** | all | The feed is sealed E2E; the operator can't read it to target ads even if it wanted to. "No ads" is a structural guarantee, not a pricing tier. |
| **Quick-Add / contact-graph mining / PYMK** | Snap/IG | Suggesting friends-of-friends requires a server-side social graph — the exact thing Pulse refuses. "Mutuals-in-common" is allowed *only* as a local, opt-in intersection of lists you each chose to share. |
| **Snap Map / location broadcast** | Snap | Continuous GPS broadcast is a surveillance dossier. Location stickers must be *typed free-text labels*, never device GPS / map lookup that phones home. |
| **Screenshot detection / "they screenshotted your story"** | Snap | This is surveillance dressed as safety — it watches the *viewer*. Antithetical to no-surveillance-metrics. Reject outright. |
| **Public follower counts / like tallies / vanity badges** | all | The engagement-anxiety engine. No global number is ever displayed. Author privately sees who appreciated; nobody competes for a count. |
| **Read receipts / view counts on posts** | all | Already excluded by design. Even in a trusted circle, "seen by" is a surveillance metric that changes behavior. Keep it absent. |
| **Giphy/network GIF search, music-catalogue integration** | IG | Each is a third-party network call that leaks metadata (which GIF, which song, your IP) to a surveilling third party. GIFs from a bundled local set or your own media; music = your own clip or a title string. |

**The framing to lead with:** *"Pulse will never have an Explore page, a follower count, a 'seen by,' or an ad — not because we haven't built them, but because the architecture makes them impossible. That's the point."*

---

## 5. The One Bold Bet: **Pass-Along — consent-gated reshare with cryptographic attribution**

If Pulse builds one thing no mainstream app can, it is **Tumblr's reblog chain, made cryptographically forge-proof and structurally un-viralizable.**

**What it is.** Any post can be "passed along" by a friend onto *their* feed. Each hop appends a **signed segment** (the rebloager's own text/image below the original), building a visible, threaded stack of contributions — the chain becomes the shared artifact, exactly like old Tumblr.

**Why only Pulse can build *this version*:**
- **Attribution is cryptographic, not server-asserted.** Every segment is signed by its author. On Tumblr, the server vouches for the chain (and can be wrong/hacked/subpoenaed). On Pulse, the *signatures* prove who added the killer line — forge-proof provenance, a property no centralized app has.
- **It's structurally un-viralizable, which is a *feature*.** A chain only propagates between **mutually-contacted nodes** — each rebloager re-fans-out only to *their* already-key-shared contacts. So a chain organically stays inside overlapping friend circles and *cannot* go viral. You get Tumblr's collaborative-creativity magic with zero outrage-amplification, zero context-collapse, zero stranger-pile-ons. The exact thing that *broke* Tumblr (and Twitter) is impossible here.
- **It decays by design.** Ephemerality applies per-segment — each contributor's 24h clock runs independently, so old chains naturally rot away instead of haunting you years later. The "Tumblr post that resurfaces to ruin your life" cannot happen.
- **Provenance you can actually see.** A local, partial chain-visualization shows the signed authorship slice your device legitimately holds — "look who built this together," forge-proof, no central tree, no view counts.

**The hard constraints, named:** media in a chain must be re-compressed inline under the ~1 MiB frame (large galleries collapse to thumbnails + lazy fetch); a hop only reaches contacts the rebloager *already* shares a key with (no public-graph leak); each segment is sealed per-recipient like any post. Effort **L** — this is the flagship, not a quick win.

**Why it's the bet and not just feature ⑩:** every other roadmap item makes Pulse a *nicer* private feed. Pass-along makes it a *new category* — **collaborative creativity that is intimate, attributable, ephemeral, and impossible to weaponize.** It is the single clearest answer to "why would I use this instead of a group chat or a finsta," and it is *only* expressible because Pulse is E2E + friends-only + signed + ephemeral. The constraints that look like limitations are precisely what make this feature unique. Lead the Phase 4 vision with it.

---

**Bottom line for the roadmap:** Ship Tier-1 (Circles → Polls → Content Warnings → Curtained Ask) for fast, ethos-pure warmth wins on already-built rails. Build the typed composer + reply-with-media + queue as the Tier-2 expressiveness layer. And make **Pass-along** the headline of Phase 4 — the one feature that turns "a private feed" into "the only place collaborative creativity can be both intimate and un-weaponizable." Don't chase the incumbents' distribution engines; the absence of them *is* the product.
