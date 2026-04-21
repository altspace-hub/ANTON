# Portals Visitor Layer — Investigation Response (v2 brief)

**Date:** 2026-04-21
**Brief:** `PORTALS_VISITOR_LAYER_BUILD_BRIEF_v2.md` (Deep Scope)
**Repo:** commit `770bcd9` on `main`, v0.7.5
**Auditor:** Claude Code (Opus 4.7, 1M context)

Completing the Investigation-First Protocol (§1.2) before any code lands.
Below: 10 fact-finding answers with file citations, then observations about
scope/phasing risks, then the 10 Daniel-questions from §17 that must be
answered before Phase 1 kicks off.

---

## Part 1 — Investigation findings (§1.2 answers)

### Q1. Portal descriptor fields today — is there an existing `categories` / `tags` field?

**No for "categories", partial yes for tags (inside JSONB).**

The `portals` table (`server/db/migrations-pg/145_portals_client.sql:24-59`)
has:

- `category TEXT NOT NULL` — a single category per portal, **not** plural.
- `capability_summary JSONB` — flattened summary used for search; includes
  a `tags: string[]` field inside (per Capability Schema §10.1).
- `metadata JSONB` — misc.

**The category enum** is defined in
`server/services/registry-protocol/operations/register.ts:20-32` —
**11 values**: `personal`, `business`, `community`, `commerce`, `team`,
`creator`, `bulletin`, `classroom`, `teacher`, `organisation`, `other`.

This is **not** the same taxonomy as the brief's 15-category grid
(Pathfinder/Jobs/Marketplace/Friends/Video/Music/Food/Shop/Sport/News/Money/
Travel/Health/Places/Learn). **The brief's `portal_category_associations`
table (migration 160) is therefore genuinely new** — it maps portals to the
Visitor-Home taxonomy, separate from the registry-level `category` enum.

**Implication for the brief:** §4.2 needs to be explicit that
`portal_category_associations` is ANTON-local, not a registry concept, and
that the registry-level `category` column stays untouched. Otherwise a
future Phase 2 looking for "the category of a portal" will find two
answers with different semantics.

### Q2. Portal visitor flow — what does `PortalVisitorPage.tsx` render?

**It's the real public-facing view**, at route `/portals/p/:address`
(`src/App.tsx:623` mounts `<Route path="/portals/p/:address" element={<PortalVisitorPage />} />`).

File header explicitly says (`src/pages/portals/PortalVisitorPage.tsx:1-7`):

> Visitor view of any portal. Resolves the address, fetches the page HTML
> (already rendered server-side via the interpolation engine), shows it in
> a sandboxed container, and surfaces the capability descriptor so the
> visitor can invoke or inquire on each declared capability.

It fetches from `/api/portals/visit/:address/page` (per `server/routes/
portals.ts:965`), renders sandboxed HTML, and shows capability cards.

**The conflict flagged in §2.1 of the brief is real.** `/portals`
currently resolves to `PortalsLandingPage` which is the **operator's
own-portals hub** ("Hub for the Portals area. … focuses on the user's
own portals + quick stats + a CTA" — header of
`src/pages/portals/PortalsLandingPage.tsx:1-7`).

**Implication:** The new `PortalVisitorHomePage` displacing `/portals`
means the operator landing must move. Candidate target routes:
`/portals/mine` or `/portals/manage` (the brief proposes the latter but
that name already means something specific — the per-portal management
page is at `/portals/:id/manage`). **Cleanest relocation: `/portals/mine`**
to avoid name collision.

### Q3. Pathfinder modes — which are supported, and what does `anton-portal` do?

**8 modes** (per `server/services/pathfinder-engine.ts:65`):

```typescript
export type SearchMode =
  | 'knowledge' | 'shopping' | 'travel' | 'food'
  | 'fix' | 'news' | 'local' | 'anton-portal';
```

Each maps to a short directive in `MODE_DIRECTIVES` at `:43-62`. Example
excerpts:
- `knowledge`: "general research; cite sources"
- `shopping`: "product research; show prices + providers"
- `news`: "fresh news; time-decayed ranking"
- `anton-portal`: "Discover ANTON portals … Match user intent to
  capability verbs. Filter by category, tag, service area, language."
  (`:49`)

**`anton-portal` mode is distinct from the others.** Per `:658-697`:

> When searchMode === 'anton-portal' we bypass the web-LLM dispatch and
> serve hits from the portal-search-engine. No tokens spent; no LLM
> calls.

The result is tagged `modelId: 'anton-portal-search'` (`:697`) so the
API response shape stays uniform with LLM-based modes, but the dispatch
path is different.

**Implication for brief §5:** the brief's visitor-UI mode chips
"All / Portals / People / Bundles / Jobs / Marketplace / Content" do
**not** correspond 1:1 to existing Pathfinder modes. Either:

(a) add new Pathfinder modes (`people`, `bundles`, `jobs`, `marketplace`,
    `content`) and extend the engine — non-trivial, each needs its own
    directive + search path, and
(b) reuse `anton-portal` behind the hood and have the UI chips refine
    the query scope via a **facet** parameter rather than a mode switch.

**Recommendation: option (b)**. Less engine surgery. Brief needs a small
change: chip semantics become filters on `anton-portal` mode + the
knowledge / news / shopping modes already present, not a new mode per
chip.

### Q4. Talent state of play — is the candidate side built?

**No. Only the recruiter side exists.**

`src/pages/talent/` contains exactly two files:
- `TalentPage.tsx` — recruiter hub
- `TalentCampaignPage.tsx` — per-campaign recruiter dashboard with tabs:
  `discovery | candidates | scoring | assessments | shortlist | audit`
  (`src/pages/talent/TalentCampaignPage.tsx:type TabId = …`).

**Candidate-side evidence (absence):**
- `grep -rE "aspiration|career-profile" server/ src/` finds **zero**
  hits in any candidate-side context. All matches are either advisory
  copy in area system-prompts (`strategy`, `cyber`, `esg` modules
  warning about aspirational goals) or `artisan-craft` area-context.
- No `/jobs` route in `src/App.tsx`.
- No `candidate_view` / `job_applications_candidate_view` table.
- No `career-profile` bundle type in `BUNDLE_TYPE_REGISTRY`
  (`server/services/anton-bundler.ts` — 42 types listed, none named
  `career-profile`).

**Implication:** §6 of the brief is essentially a greenfield build of the
candidate surface. Scope estimate holds: 5 new pages + ~5 new components
+ 1 new bundle type + migration. Realistic ~2 weeks of Phase-2 time.

### Q5. Bundle marketplace — page or only DB?

**Both DB and a page exist — but the page is an import/upload tool, not a
visitor marketplace.**

- **Migration 104** (`server/db/migrations-pg/104_bundle_marketplace.sql`)
  creates `marketplace_bundle_listings` + `marketplace_reviews` tables.
  **Both tables already exist.**
- **Page**: `src/pages/MarketplacePage.tsx` exists (508 lines). Route
  `src/App.tsx:528` — `<Route path="/marketplace" element={<MarketplacePage />} />`.
  The page handles `.anton` file upload + bundle preview + install to the
  user's local registry. **It does NOT implement browse / search /
  purchase / library.**
- **Route file**: `server/routes/marketplace.ts` exists. `UNCONFIRMED`
  what endpoints are there without deeper read.
- **Purchase flow**: NO. There's a separate `FCMarketplacePage` at
  `/futurechain/marketplace` (`src/App.tsx:607`) for FutureChain paid
  services, but that's not `.anton` bundle purchasing.

**Important correction to the brief §7.4**: it says "Migration 163:
`marketplace_reviews`, `marketplace_user_library`" as NEW tables.
**`marketplace_reviews` already exists** in migration 104. Claude Code
must:

- Use `marketplace_reviews` as-is (not re-create).
- Only create `marketplace_user_library` in migration 163 — confirm schema
  match for reviews before proceeding.
- Possibly extend `marketplace_reviews` with fields the brief requires
  (e.g. `verified_install BOOLEAN`) via an `ALTER TABLE` rather than a
  second CREATE.

### Q6. Beehive session UX — 1:1 path or multi-party only?

**Multi-party by design, no dedicated 1:1 path.**

- Pages: `src/pages/community/BeehivePage.tsx` + `BeehiveSessionPage.tsx`
  (found under `community/`, not top-level).
- The protocol (`server/services/beehive/beehive-protocol.ts`) supports
  star-topology broadcast — Queen relays to participants. No message type
  is 1:1-specific.
- Participant count: no hard floor found; technically a Beehive with just
  Queen + one worker is 1:1 semantically, but the UX surfaces as a small
  meeting, not as a chat.

**Implication for §8 Friends:** the brief's assumption that "spin up a
small collaborative session with this contact" works is correct at the
protocol level, but the Friends UX needs a deliberate **lightweight chat
styling** over `BeehiveSessionPage` — NOT a simple re-use. The brief
lists this as `Wire Beehive 1:1 mode if it doesn't exist (check in
investigation)` in §8.5 — **confirmed: it doesn't exist as a distinct
mode**. Build work: either a new `ChatPage.tsx` that uses the Beehive
protocol directly with custom UI (recommended), or a Beehive session
type toggle that renders differently when participants == 2.

### Q7. Video infrastructure — any evidence?

**Effectively none.**

- Single component exists: `src/components/school/VideoPlayer.tsx`. A
  read of it (not attempted in this investigation) likely shows an HTML5
  `<video>` player for embedded educational content — not a platform.
- No `videos` table in any migration.
- No `ffmpeg` dep in `package.json`. No `hls.js`. No `@ffmpeg/ffmpeg`.
- No S3 / MinIO / storage-adapter code.
- No transcoding worker.
- No `server/services/video/` or `server/workers/`.

**Implication:** §9 is genuinely net-new. The brief's own scope caveat
("may need to slip to v0.8.1") is well-founded. Realistic estimate:

- **MVV (brief §9.7)**: 3-4 weeks if a single engineer.
- **Full spec (incl. comments, playlists, subscriber-only, AAP-federated
  moderation)**: 6-8 weeks.

**Recommendation: honour the brief's slip-to-v0.8.1 allowance.** Phase 3
ships Friends as v0.8 (~4 weeks), Video lands v0.8.1 (~4-6 weeks).

### Q8. Existing bookmark/pin mechanism?

**Partial.** `src/components/layout/NavLinkWithStar.tsx` exists:

> NavLinkWithStar.tsx …
> `title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}`

It's scoped to sidebar nav-link stars — lets a user favourite a
route/module within the sidebar for quick access. It's **not**
portal-scoped; it operates on React Router routes only.

**Implication:** the brief's `portal_bookmarks` table and `BookmarkBar`
component are genuinely new. Reusing the "star" affordance metaphor is
good UX consistency; the underlying data model is separate.

`UNCONFIRMED`: where `isFavorite` is persisted today (DB? localStorage?
Zustand store?). A read of `NavLinkWithStar.tsx` is needed before Phase 1
coding to decide whether the new `portal_bookmarks` table should absorb
it or stay parallel. **Recommendation: stay parallel** — nav favorites
are one model (route slugs), portal bookmarks are another (portal UUIDs
+ external URLs + platform pointers).

### Q9. Portal categories — existing taxonomy?

**Yes, but only the 11-value registry enum.** See Q1.

Full list from `server/services/registry-protocol/operations/register.ts:20`:

```
personal / business / community / commerce / team / creator /
bulletin / classroom / teacher / organisation / other
```

No free-form tag taxonomy beyond `capability_summary.tags` (a JSONB
string array inside each portal's descriptor). No topic labels.

**Implication for brief §4:** the 15-category Visitor-Home grid is
**orthogonal** to the registry category enum. A portal with registry
`category='business'` could be tagged to Visitor-Home categories `Food`
(if it's a catering business) + `Shop` (if it sells products). The
brief's model (`portal_category_associations` with `source` = manual /
self-declared / pathfinder-inferred / curator-featured) handles this
correctly — but Claude Code must resist the temptation to conflate or
rename the registry's `category` field during this work.

### Q10. "My ANTON" existing page?

**Partial.** Two candidate targets:

- `src/pages/Dashboard.tsx` — general user dashboard (likely cross-pillar
  summary).
- `src/pages/portals/PortalsLandingPage.tsx` — the user's own portals
  hub (per its header: "focuses on the user's own portals + quick
  stats + a CTA").

**No purpose-built "My ANTON" page.** The brief's §2.3 logic (dropdown
for multiple portals, onboarding for none, direct route for one) is
sound. Simplest v1:

- 0 portals → `/portals/build` (PortalTemplateGalleryPage)
- 1 portal → `/portals/p/<the-address>`
- 2+ portals → open a dropdown in-place in the bookmark bar
  (no new page needed)

The existing `PortalsLandingPage` is a good candidate to become the
"manage my portals" fallback. This ties back to the Q2 conflict: if
`/portals` becomes the new Visitor Home, `PortalsLandingPage` moves to
`/portals/mine` and doubles as the "My ANTON" target for multi-portal
users who want to see their set.

---

## Part 2 — Scope, phasing, and risk observations

### 2a. Net-new surface count

| Component | New files brief projects | Existing equivalent |
|---|---|---|
| Visitor Home + Bookmark Bar | 7 files + 1 migration + 1 store + 1 route | None; net-new |
| Starter-pack bundle type | 1 schema + 3 data packs + registration | None |
| 15-category routing | 10 Tier-B placeholder pages + shared template | None |
| Pathfinder visitor UI | 5 new components + 2 routes + 1 migration | Existing PathfinderPage to extend |
| Jobs | 5 new pages + 5 new components + 1 service + 1 migration + 1 bundle type | Zero candidate-side today |
| Marketplace | 5 new pages + 5 new components + 1 route + 1 service dir + 1 migration | MarketplacePage (upload-only); migration 104 already has listings+reviews |
| Friends | 5 new pages + 4 new components + 1 route + 1 service dir + 1 migration | Beehive protocol reusable; no 1:1 chat UX |
| Video | 5 new pages + 5 new components + 1 route + 1 service dir + 1 worker + 1 storage adapter + 1 migration | Zero |

**Total estimate across all phases:** ~40 new pages, ~30 new components,
~10 new migrations, 3 new bundle types, 6 new service directories,
1 new storage adapter, 1 new transcoding worker.

This is realistic for the 9-week phased plan **only if** Phase 3 Video
slips to v0.8.1 as the brief explicitly allows.

### 2b. Brief errors / corrections found

1. **§7.4**: `marketplace_reviews` is NOT new — it already exists in
   migration 104. Only `marketplace_user_library` is new.
2. **§2.1 route conflict**: the proposed move target "`/portals/manage`"
   collides with the existing per-portal management route
   `/portals/:id/manage`. **Use `/portals/mine` instead.**
3. **§5 Pathfinder mode chips**: don't correspond 1:1 to existing modes.
   Need either new engine modes or a facet parameter on `anton-portal`
   mode. Recommend facet.
4. **§4.1 grid layout**: states "Pathfinder Jobs Marketplace Friends
   Video" as Row 1, but §2.2 lists the bookmark-bar as
   "Pathfinder / Jobs / Marketplace / My ANTON". Friends and Video are
   in Row 1 of the grid but NOT in the default bookmark bar. That's
   likely intentional (grid = all categories, bar = most-frequent) but
   warrants an explicit statement.
5. **§1 investigation protocol**: refers to files by names that don't
   match the repo (`PortalLandingPage.tsx` vs actual `PortalsLandingPage
   .tsx`; `PortalDiscoveryPage` vs actual `PortalsDiscoveryPage`). Minor,
   but Claude Code must verify exact file names before reading.

### 2c. Scope recommendations

**Phase 1 (2 weeks):** holds. All components listed are small + mechanical.
Real risk is the ten Tier-B placeholder pages drifting into "minor polish"
work that bloats the sprint — keep them **truly placeholder** (shared
`CategoryPage.tsx` parameterised by config, no per-category UI work).

**Phase 2 (3 weeks):** holds, but split `Jobs` into "application submit
flow" (week 1) + "candidate dashboard" (week 2) + "career-profile bundle
type + editor" (week 3) so each week produces something demonstrable.

**Phase 3 (4 weeks or 4+4 with Video split):** recommend the split.

- **v0.8 delivery:** Phase 1 + Phase 2 + Friends (9 weeks).
- **v0.8.1 delivery:** Video (MVV in 3-4 weeks, full in 6-8 weeks).

This matches the brief's §0.4 allowance and gives Video room to ship
well rather than rushed.

### 2d. Cross-cutting risks

- **School-mode gating**: §10 requires `Friends`, `Video`, `Marketplace`,
  `Jobs` to behave differently when `appMode === 'school'`. Only one
  component today reads `appMode` (`src/components/school/ModeToggle.tsx`
  per `ANTON_CURRENT_STATE_v1.md §2`). Every new page in Phase 2–3 that
  has school-mode differences needs the dispatch pattern built in from
  the start — **not** retrofitted. Add a `useAppMode()` convention
  before Phase 2 coding begins.
- **Guardian-approval flow (§8.6):** The brief says "new contact
  requires guardian approval" for minors. There is no existing guardian
  model in the code (`grep -rE "guardian" src/` finds only mentions in
  school area-context prose). This is a net-new concept with significant
  data-model implications (who is a guardian? how do they authenticate?
  how are they linked to a minor?). **Recommend: treat as a sub-scope
  requiring its own design pass before Phase 3.**
- **FutureChain marketplace purchase (§7.2):** the existing
  FCMarketplacePage is at `/futurechain/marketplace`. The new
  Marketplace at `/marketplace` needs to reuse FutureChain wallet UI but
  not replace or conflict with FCMarketplace. Need a shared payment
  component (`src/components/payments/FutureChainPayment.tsx`
  `UNCONFIRMED` existence).
- **AAP-federated comments (§9.2 + §9.5):** the brief specifies
  `video_comments.signed_envelope` for federation. No existing code
  federates comments across ANTON instances. Plus there's no moderation
  escalation pattern. This is a real design rabbit hole — recommend
  **deferring comments to v0.8.2** and shipping Video MVV without them.

---

## Part 3 — Daniel-questions (§17) that block Phase 1 kickoff

The brief itself lists 10 open questions "Don't invent answers to any of
these. Ask." Copy-pasted here so Daniel can respond inline:

1. **`/portals` conflict**: If the existing operator landing occupies
   `/portals`, move to `/portals/manage` — confirmed? **[RECOMMEND
   `/portals/mine` because `/portals/:id/manage` already exists.]**
2. **Life vs Portals pillar relationship**: Categories mount under
   `/life/*` but are surfaced from `/portals`. Does clicking "Life" in
   the nav go to the Visitor Home too, or keep the existing LifePage?
3. **"My ANTON" bookmark target when user has multiple portals**:
   dropdown in bookmark bar, or always route to `/portals/manage`?
4. **Swedish starter-pack featured portals**: ship with empty
   placeholders, or hold until specific partners (Blocket, Hemnet, SEB,
   etc.) sign off — which?
5. **Marketplace pricing surface**: show FutureChain + fiat equivalent,
   or FutureChain only?
6. **Friends activity feed default**: `private` (no sharing unless
   explicit), `me` (share only with yourself as read state), or
   `friends-circle` (default opt-in to mutual contacts)?
7. **Video max file size in v1**: 2 GB reasonable? Lower for initial
   deployment?
8. **Video storage**: self-hosted MinIO as default, or S3 (AWS) as
   default, or admin chooses per deployment?
9. **Comments on Video in MVV**: include, or defer to v0.8.1? **[I
   recommend defer to v0.8.2 — AAP-federated comments is a non-trivial
   design problem.]**
10. **Playlist as bundle type #45**: register now, or keep playlists as
    DB-only for v1?

---

## Part 4 — Brief-generated questions (new, for Daniel)

Beyond §17, the investigation surfaced two more that need answers before
Phase 1:

**Q11.** Should Pathfinder's visitor-UI mode chips use new engine modes
(a real mode per chip with its own directive) or facets on `anton-portal`?
My strong recommendation: **facets** (smaller engine surgery, richer
filter space). Want me to proceed on that basis?

**Q12.** Guardian model for School-mode Friends (§8.6). Zero infra today.
Scope options:
- **(a) Minimal**: a `guardians` table linking user to guardian by
  email; guardian receives friend-request notifications via email +
  `app_checkpoints` for their own ANTON; approves/rejects from
  companion app.
- **(b) Full**: guardian has their own ANTON account with a "supervise"
  link to the minor; in-app approval flow; all activity optionally
  mirrored to guardian.

Option (a) can ship in Phase 3. Option (b) is a separate
design-then-build (~3 weeks). Confirm direction before Phase 3 planning.

---

## Part 5 — Proposed execution contract

If Daniel answers the 10 §17 questions + Q11 + Q12, Phase 1 can start
immediately with the following contract:

**Phase 1 deliverables (2 weeks):**

- Migration 158 `portal_bookmarks`
- Migration 159 `user_starter_packs`
- Migration 160 `portal_category_associations`
- Bundle type #43 `starter-pack` registered in `anton-bundler.ts`
- 3 `.anton` starter-packs in `data/starter-packs/`
- New page: `src/pages/portals/PortalVisitorHomePage.tsx` mounted at
  `/portals`; existing `PortalsLandingPage` relocated to `/portals/mine`
  (or target confirmed in Q1)
- New components: `BookmarkBar`, `CategoryTile`, `RecentlyVisited`,
  `FeaturedToday`, `CategoryPage` (Tier-B shared template)
- 10 Tier-B category routes: `/life/food`, `/life/shop`, `/life/sport`,
  `/life/news`, `/life/money`, `/life/travel`, `/life/health`,
  `/life/places`, `/life/learn`, `/life/music` (all using
  `CategoryPage`)
- Routes: `/portals` (new home), `/portals/mine` (relocated landing),
  `/portals/:id` or `/portals/p/:address` (unchanged visitor view)
- Store: `useBookmarksStore.ts`
- Server route: `server/routes/portal-bookmarks.ts`
- School-mode starter-pack auto-swap using existing `useSettingsStore.appMode`
- Tests: `portals-visitor-home`, `bookmark-bar`,
  `category-placeholder`, `school-mode-bookmarks`, `starter-pack-import`

**Completion report:** `docs/PORTALS_VISITOR_LAYER_REPORT_P1.md`.

Phases 2 + 3 scoped after Phase 1 acceptance.

---

## Appendix — file-citation summary

All facts above are backed by:
- `server/db/migrations-pg/145_portals_client.sql:24-59` — portals schema
- `server/db/migrations-pg/104_bundle_marketplace.sql:4-38` — existing marketplace tables
- `server/services/registry-protocol/operations/register.ts:20-32` — category enum
- `server/services/pathfinder-engine.ts:43-62, 65, 658-697` — Pathfinder modes + anton-portal dispatch
- `src/pages/portals/PortalVisitorPage.tsx:1-7` — visitor page role
- `src/pages/portals/PortalsLandingPage.tsx:1-7` — operator landing role
- `src/pages/talent/TalentCampaignPage.tsx` — recruiter-only tabs
- `src/pages/MarketplacePage.tsx` (508 lines, upload-focused)
- `src/pages/community/BeehivePage.tsx`, `BeehiveSessionPage.tsx` — multi-party
- `src/components/school/VideoPlayer.tsx` — sole video-adjacent file
- `src/components/layout/NavLinkWithStar.tsx` — existing favourite mechanism
- `src/App.tsx:528, 607, 623` — route mounts

---

*End of investigation. Awaiting Daniel's answers to §17 Q1–Q10 + Q11–Q12
before Phase 1 coding begins.*
