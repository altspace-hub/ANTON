# Pass-Along — Pulse consent-gated, signature-attributed, bounded reshare

**Status:** design corrected (2026-06-06), implementing. Flagship of Pulse Phase 4.
**Product choices (locked by the user):** up to **2 hops**; **quote-reshare** (resharer may add a
signed note); received pass-alongs are **read-only** (no reactions/comments on a copy).

## Why this is hard
Pulse is E2E + friends-only + no central server. A post is sealed per-recipient to **A's**
audience; **A's** audience pubkeys are unknown to anyone else. For **B** (in A's audience) to
pass A's post to **B's** friends — who are NOT in A's audience and don't have A as a contact —
B must **re-seal** A's content to each of B's friends, and those friends must be able to
verify A really authored it **without** trusting B or the relay, and **without** having A as a
contact. Pulse **posts are not signed today** (only comments + asks are). So Pass-Along
introduces an **author content-consent signature** that travels with the post.

## The corrected cryptographic model (the auto-synthesis had 3 fatal flaws — see end)

### Two signatures
1. **A's content-consent signature** — made once at publish, when A opts a post into
   pass-along. Binds authorship + the exact content + ephemerality + the hop bound. A can
   sign this at publish because it contains **no** reshare-time values.

   ```
   pulsePassAlongConsentCanonical = JSON.stringify([
     'pulse-pass-along/v1',
     originalPostId,
     originalAuthorHash,
     originalCreatedAt,
     originalExpiresAt ?? '',
     contentHash,          // sha256 over the canonical content (binds text+media+poll+cw+ask)
     maxHops,              // 2 — A's signed, un-forgeable virality bound
   ])
   consentSig = sign(consentCanonical)   // by A
   ```

   `contentHash = bytesToHex(sha256(utf8(pulsePostContentCanonical)))` where
   ```
   pulsePostContentCanonical = JSON.stringify([
     'pulse-content/v1', text ?? '', mediaDigest, poll ?? null, cw ?? [], ask ?? null, createdAt
   ])
   ```
   `mediaDigest` = `postImages(post).map(i => [i.mimeType, i.data])` ++ (voice ? `[mime,audio,durationSec]` : null).
   Content-binding is what stops B mutating A's text/media; A's sig only covers IDs/timestamps
   in the auto-design (flaw #2).

2. **Per-hop resharer signature** — each resharer signs their hop, chaining to the previous
   hop's signature. This makes the visible provenance chain + the note + the hop position
   tamper-evident.

   ```
   pulsePassAlongHopCanonical = JSON.stringify([
     'pulse-pass-along-hop/v1',
     originalPostId,
     hopCount,             // 1 = first resharer, 2 = second
     resharerHash,
     reshareTs,
     note ?? '',           // the quote-reshare note (signed → B's words, not A's, un-alterable)
     prevHopSig ?? '',     // '' for hop 1; hops[i-1].hopSig for hop 2
   ])
   hopSig = sign(hopCanonical)   // by the resharer
   ```

### Where A's consent bundle reaches B
`publishPulsePost`, when `passAlongAllowed`, computes `contentHash` + `consentSig` and attaches
`passAlong: { allowed:true, authorPubkey, contentHash, maxHops, consentSig }` to **both** the
`PulsePostWire` (new optional field — back-compat, old clients ignore) and the local `PulsePost`.
So every audience member receives A's pubkey + signed consent, enabling them to reshare.
A's pubkey **must** ride the wire (flaw #3): the far recipient has no other way to get it
(they don't have A as a contact). Exposing A's pubkey reveals nothing beyond `originalAuthorHash`,
which is already `deriveContactHash(pubkey)`.

### The wire
```ts
interface PassAlongHop {
  hopCount: number;        // 1-based position
  resharerHash: string;
  resharerName: string;
  resharerPubkey: string;  // verifies hopSig
  reshareTs: string;       // ISO
  note: string;            // '' if none
  prevHopSig: string;      // '' for hop 1
  hopSig: string;
}
interface PulsePassAlongWire {
  // A's content, VERBATIM (contentHash must recompute on the far side):
  originalPostId; originalAuthorHash; originalAuthorName; originalCreatedAt;
  originalExpiresAt: string | null;
  text; image?; images?; voice?; poll?; cw?; ask?;     // same shapes as PulsePostWire
  // A's consent bundle:
  authorPubkey; contentHash; maxHops; consentSig;
  // The chain (length === current hopCount, 1..maxHops):
  hops: PassAlongHop[];
}
```

### Inbound verify ladder (C or D receiving `pulse_pass_along`) — all-or-nothing, silent drop
1. **okShape** — all fields present, correct types, `hops` non-empty array.
2. **okBind** — `deriveContactHash(authorPubkey) === originalAuthorHash`.
3. **okContent** — `pulsePostContentHash(contentFields) === wire.contentHash`.
4. **okConsent** — `verify(consentCanonical, consentSig, authorPubkey)`.
5. **okMaxHops** — `maxHops` a positive int; `1 <= hops.length <= maxHops`.
6. **okChain** — for each `hops[i]`: `hopCount===i+1`,
   `deriveContactHash(resharerPubkey)===resharerHash`,
   `prevHopSig === (i===0 ? '' : hops[i-1].hopSig)`,
   `verify(hopCanonical(hops[i]), hopSig, resharerPubkey)`.
7. **okSender** — `hops[last].resharerHash === fromHash` (the relay-authenticated immediate
   sender IS the last resharer; a peer can't spoof another's fromHash).
8. **okExpiry** — `originalExpiresAt` null OR `> now` (don't accept an already-expired post).
9. **okBlocked** — drop if `fromHash` is a blocked contact, or `originalAuthorHash` is one.
10. **okNotMine** — drop if `originalAuthorHash === me` (don't echo my own post back to me).
11. **okExisting** — dedup by copy id `PA|${originalPostId}|${last hopSig .slice(0,16)}`;
    if present, drop (idempotent).

On success: store a **read-only PulsePost copy**: `id=copyId`, `authorHash/Name=original*`,
content verbatim, `createdAt = hops[last].reshareTs` (sorts fresh), `expiresAt=originalExpiresAt`,
`passAlongCopy:{ originalAuthorHash, originalAuthorName, originalCreatedAt, authorPubkey,
contentHash, maxHops, consentSig, hops }`, `likeCount:0, commentCount:0`.

### Resharing (`publishPulsePassAlong(sourcePostId, note, recipientHashes)`)
- Source consent bundle + base chain:
  - original received-with-consent post → `source.passAlong` (allowed), `baseHops=[]`, `currentHop=0`.
  - a received copy → `source.passAlongCopy`, `baseHops=hops`, `currentHop=hops.length`.
  - else throw (not reshareable).
- `newHop = currentHop + 1`; throw if `> maxHops`.
- `prevHopSig = baseHops.length ? baseHops[last].hopSig : ''`.
- Sign the hop; append; build the wire carrying A's consent bundle **verbatim** + the content
  **verbatim** (so contentHash still matches downstream) + the full `hops`.
- `sendInlinePayload(recipient, {kind:'pulse_pass_along', data:wire})` per non-blocked recipient
  (seals per recipient; queues offline).

### Un-viralizability — honest framing
`maxHops` is signed by A → a given wire's hop bound and each hop's count are **un-forgeable**
(tampering breaks a signature → dropped). Honest clients enforce `hopCount ≤ maxHops`, so chains
stop at 2. **Residual:** a holder running a modified client could re-inject received content as a
fresh hop-1 (cryptographically indistinguishable from a legitimate first reshare, since the
consent bundle is forwardable) — this is **equivalent to manual copy-paste / screenshot-and-repost**
and is unpreventable in any system without a central authority. The feature prevents *algorithmic
virality* and *forged attribution/content*, not a human re-distributing what they were shown.
This is consistent with the ethos ("the absence is the product": friends-only, no algorithm, no
Explore — the structural bounds, not a server, are what cap reach).

## Privacy invariants (the review will hammer these)
- B→C never leaks A's original audience (per-recipient sealing; no audience list on any wire).
- C's identity never reaches A (no back-channel; received copies are read-only → no interaction wire).
- B's audience never reaches A (B's fanout is per-recipient sealed).
- A curtained ask stays curtained (askerName absent on the wire; it's inside contentHash → can't be
  added/altered without breaking okContent).
- Content warnings can't be stripped (inside contentHash).
- A's pubkey on the wire reveals nothing past originalAuthorHash (the hash IS derived from it).

## Edit sites
- `pulse.ts`: types (`PassAlongHop`, `PulsePassAlongWire`, PulsePost `passAlong?`/`passAlongCopy?`,
  PulsePostWire `passAlong?`), `pulsePassAlongConsentCanonical`, `pulsePassAlongHopCanonical`,
  `pulsePostContentCanonical`/`pulsePostContentHash`, `applyInboundPassAlong` (verify ladder +
  store), `buildPassAlongConsent` (publish-time), `reshareableState(post)` helper.
- `chat.ts`: WirePayload union + parseWirePayload + dispatch case + sendStructuredMessage guard;
  `publishPulsePost` gains `passAlongAllowed` (compute + attach consent bundle to wire + local);
  `publishPulsePassAlong`; block filters already two-way.
- UI: compose "Allow friends to pass this along" toggle; feed/detail render of a copy (attribution
  chain + notes + ↻ badge, read-only); a "Pass along" action on a reshareable post → recipient
  picker + optional note → `publishPulsePassAlong`; gate the affordance to reshareable && hop<max.
- i18n en+sv. **No DB version bump** (copies live in `pulse_posts`; only optional fields added).

## Test plan
- Unit: canonical determinism; real-Ed25519 — consent sig verifies, flip any consent field fails;
  content tamper (alter text/strip cw/add askerName) → contentHash mismatch → reject; hop chain
  verifies, reorder/insert/truncate fails; hopCount>maxHops reject; prevHopSig mis-link reject;
  okSender mismatch reject; expiry reject; dedup idempotent; reshareableState transitions
  (original-with-consent → hop1; copy hop1 → hop2; copy hop2 → terminal).
- Device: A publishes with allow-share → B sees Share → B passes with a note → (sim) C copy renders
  "A · passed along by B" + note, read-only, Share still available (hop1<2) → C passes → hop2 copy
  terminal (no Share). Verify on the funded phone (inject the inbound wire as needed; the A→B→C
  relay loop is unit-covered).

## The 3 fatal flaws in the auto-generated synthesis (corrected above)
1. Its signed canonical included `reshareTs` + `resharedByHash` — reshare-time values A cannot
   have signed at publish. → A signs a **content-consent** canonical with no reshare-time fields.
2. No content hash in A's signature → B could mutate A's text/media undetectably. → bind `contentHash`.
3. Inbound gates `okAllowed` (`getPost(originalPostId)` on C) and `okAuthorized` (A must be C's
   contact) reject every real pass-along — C is not in A's audience and doesn't have A. → consent
   + attribution come from **A's signature on the wire** (+ A's pubkey), not local lookups.
