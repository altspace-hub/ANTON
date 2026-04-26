# Portals Visitor Layer & Category Destinations — Build Brief v2 (Deep Scope)

**Target version:** v0.8.0 (multi-sprint, phased)
**Audience:** Claude Code
**Based on audit:** `ANTON_CURRENT_STATE_v1.md` (commit `c6b591e`, repo v0.7.5)
**Supersedes:** `PORTALS_VISITOR_LAYER_BUILD_BRIEF.md` (v1, minimal scope)

---

## 0. Framing

### 0.1 What changed from v1

v1 was a minimal ship-it brief that stubbed every category. Daniel corrected the scope: **five categories land as real, usable product from the start; seven land as honest placeholders waiting for partners**. This brief reflects that distinction.

### 0.2 The two tiers

**Tier A — "We own this" (build substantively):**

1. **Pathfinder** — visitor-facing search and discovery across portals
2. **Jobs** — candidate-side hiring and recruitment (extends existing Talent)
3. **Marketplace** — `.anton` bundle discovery, purchase, installation
4. **Friends** — peer social running on Beehive/Gateway substrate
5. **Video** — creator uploads, playback, peer sharing (net-new)

These are the five where ANTON has either shipped infrastructure (Pathfinder, Beehive, Talent, bundle marketplace DB) or where building a complete v1 is credible without a partner (Video). Each gets its own detailed section in this brief.

**Tier B — "Placeholder until partnered" (build shell, no content):**

6. Food
7. Shop
8. Sport
9. News
10. Money
11. Travel
12. Health
13. Places
14. Learn
15. Music

For these, a consistent destination template with a "Partner portals coming" state, a tiny ANTON-native utility where one fits cleanly, and a pre-scoped Pathfinder box. They're shells that hold the grid together and let the home page feel complete while partner conversations happen.

Yes, that's 15 categories — expanded from 12 because Learn and Music deserve their own tiles once Video is its own thing.

### 0.3 What this brief still is not

- A replacement for the existing Portals infrastructure. Track B-LAN is shipped; Track B-WAN has its own punch list at `docs/PORTALS_TRACK_B_WAN_GAPS.md`. Don't touch.
- A whitepaper, marketing copy, or public positioning document.
- A Life-pillar redesign beyond adding category routes.
- Any work on Tier B placeholders beyond the shell + utility + Pathfinder box.

### 0.4 Phasing

Because this is substantially larger than v1, it ships in **three phases** with independent value at each. Claude Code must complete each phase fully before starting the next.

- **Phase 1 — Foundation:** Visitor Home, bookmark bar, starter-pack bundle type, 15-category routing shell, all Tier B placeholders done. School-mode auto-swap.
- **Phase 2 — "We own" core:** Pathfinder visitor UI, Marketplace page, Jobs candidate-side experience. All three live end-to-end.
- **Phase 3 — Friends and Video:** The two heaviest builds. Friends extends Beehive with a consumer UX. Video is substantially net-new and may need to slip to v0.8.1 if scope runs long.

---

## 1. Investigation-First Protocol

Before any code, Claude Code audits the following and posts an investigation response to Daniel.

### 1.1 Read in full

```bash
view CLAUDE.md
view ANTON_Portals_Spec.md
view docs/PORTALS_TRACK_B_WAN_GAPS.md

# Bundle registry
view server/services/anton-bundler.ts

# Existing portal pages
view src/pages/portals/PortalLandingPage.tsx
view src/pages/portals/PortalDiscoveryPage.tsx
view src/pages/portals/PortalVisitorPage.tsx
view src/pages/portals/PortalInboxPage.tsx
view src/pages/portals/PortalManagePage.tsx
view src/pages/portals/PortalTemplateGalleryPage.tsx
view src/pages/portals/PortalBuilderPage.tsx

# Pathfinder
view server/services/pathfinder-engine.ts
view server/routes/pathfinder.ts
view src/pages/PathfinderPage.tsx
view server/prompts/pathfinder-search.md
view server/prompts/pathfinder-synthesis.md
ls src/components/pathfinder/

# Talent (Jobs extends this)
view src/pages/talent/TalentPage.tsx
view src/pages/talent/TalentCampaignPage.tsx
view server/routes/talent.ts
grep -rn "aspiration\|career-profile" server/services/ src/pages/talent/

# Beehive (Friends extends this)
view src/pages/BeehivePage.tsx
view src/pages/BeehiveSessionPage.tsx
ls src/components/beehive/
view server/services/beehive/beehive-protocol.ts

# Bundle marketplace foundation
find server/db/migrations-pg -name "*marketplace*"
find src -iname "*marketplace*"

# Life pillar as it stands
view src/pages/LifePage.tsx

# App mode / routing
view src/stores/useSettingsStore.ts
head -200 src/App.tsx
```

### 1.2 Investigation response — answer these before coding

1. **Portal descriptor fields today** — what does a portal row contain? Is there an existing `categories` / `tags` field?
2. **Portal visitor flow** — what does `PortalVisitorPage.tsx` currently render? Is it already a public-facing view, or an operator preview?
3. **Pathfinder modes** — list all supported `mode=` values and what each returns. Especially `anton-portal` behaviour.
4. **Talent state of play** — is the candidate-side flow built, or just the recruiter side? What does the route tree look like under `/talent/*`?
5. **Bundle marketplace** — is there a marketplace PAGE, or only the DB migration? Is there a purchase flow, or is that entirely absent?
6. **Beehive session UX** — what does a non-technical user see when they enter a Beehive? Is there a 1:1 chat path, or is it multi-party only?
7. **Video infrastructure** — any evidence of video storage, streaming, upload, or transcoding anywhere in the codebase? Expect "no" but confirm.
8. **Existing bookmark/pin mechanism** — search for `favourite`, `pin`, `bookmark`, `shortcut`, `star` in src/.
9. **Portal categories** — any existing category taxonomy, tagging system, or topic labels on portals today?
10. **"My ANTON" existing page** — is there a per-user dashboard the "My ANTON" bookmark can point at, or does that also need to be built?

If any of 1–10 are already built, the phasing in §0.4 may compress. Report findings, then proceed.

---

## 2. Visitor Home & Bookmark Bar (Phase 1)

### 2.1 The Visitor Home

**Route:** `/portals` (the default when clicking Portals in the pillar nav)

**Existing conflict check:** If `/portals` already resolves to the operator landing (`PortalLandingPage`), the new Visitor Home becomes the default and the operator landing moves to `/portals/manage` or similar. Confirm with Daniel before renaming.

**Layout (top-to-bottom):**

1. Bookmark Bar — persistent, full-width row
2. Pathfinder inline search box ("Search portals, people, things…") with scope chip showing the user's current portal context if any
3. 15-category tile grid — 5 columns × 3 rows on desktop, 3 columns × 5 rows on tablet, 2 × 8 (with overflow) on mobile
4. "Recently visited portals" — max 6, lazy-loaded, collapsible
5. "Featured today" — up to 3 portals surfaced by Pathfinder's trending/quality signal

That's the whole page. No hero, no ads, no feed, no engagement metrics.

### 2.2 Bookmark Bar specification

**Default bookmarks (left to right):**

1. **Pathfinder** — platform, undeletable
2. **Jobs** — first-party, deletable, replaceable
3. **Marketplace** — first-party, deletable, replaceable
4. **My ANTON** — platform, undeletable
5. User-added bookmarks (up to 8 additional)
6. **+ Add** button

**Adding a bookmark:** A star/pin icon on the header of `PortalVisitorPage.tsx`, on the header of any category page, and on any Pathfinder result card. Clicking adds the target to the user's bookmark list.

**Interactions:**
- Click → navigate to target
- Long-press (mobile) / right-click (desktop) → context menu: Rename / Remove / Reorder / Open in new tab
- Drag-to-reorder
- Platform bookmarks can be hidden via Settings → Portals → Show platform bookmarks (on by default) but cannot be deleted

**Per-category bookmarks:** Separately, within a category page, users can save individual portals to a "Saved in this category" list. These don't appear in the main bookmark bar — they're scoped to the category page.

### 2.3 "My ANTON" target logic

If the user has no portal of their own: the button routes to a "Create your portal" onboarding (reuse existing `PortalBuilderPage` entry). If they have one: routes to their own portal's visitor view. If they have multiple: shows a dropdown listing them.

### 2.4 Data model additions

```sql
-- Migration: 158_portal_bookmarks.sql
CREATE TABLE IF NOT EXISTS portal_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bookmark_type TEXT NOT NULL CHECK (bookmark_type IN ('platform', 'portal', 'route', 'external')),
  target_portal_id UUID REFERENCES portals(id) ON DELETE CASCADE,
  target_route TEXT,
  target_url TEXT,
  category_id TEXT,            -- nullable; if set, bookmark is category-scoped
  label TEXT NOT NULL,
  icon_ref TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_target CHECK (
    (target_portal_id IS NOT NULL)::int +
    (target_route IS NOT NULL)::int +
    (target_url IS NOT NULL)::int = 1
  )
);
CREATE INDEX idx_portal_bookmarks_user_global ON portal_bookmarks (user_id, sort_order)
  WHERE category_id IS NULL;
CREATE INDEX idx_portal_bookmarks_user_category ON portal_bookmarks (user_id, category_id, sort_order)
  WHERE category_id IS NOT NULL;
```

### 2.5 What to build

- `src/pages/portals/PortalVisitorHomePage.tsx`
- `src/components/portals/BookmarkBar.tsx`
- `src/components/portals/CategoryTile.tsx`
- `src/components/portals/RecentlyVisited.tsx`
- `src/components/portals/FeaturedToday.tsx`
- `src/stores/useBookmarksStore.ts`
- `server/routes/portal-bookmarks.ts` — full CRUD + reorder endpoint
- Migration `158_portal_bookmarks.sql`

---

## 3. Starter Pack Bundle Type (Phase 1)

### 3.1 Why

Hard-coding bookmark and category defaults works for exactly one audience. Starter-packs make the Visitor Home configurable per region, per pillar-mode, per deployment — as `.anton` bundles users or admins import.

### 3.2 Schema

```typescript
// server/services/portals/starter-pack-schema.ts
interface StarterPackBundle {
  bundle_type: 'starter-pack';
  spec_version: '1.0';
  id: string;               // e.g. 'global-default', 'school-default', 'sverige-se'
  name: string;
  description: string;
  target_mode?: 'global' | 'school' | 'work' | 'life';
  locale?: string;          // BCP-47, e.g. 'en-GB', 'sv-SE', 'de-DE'
  bookmarks: BookmarkConfig[];
  categories: CategoryConfig[];  // replaces default 15 when present
  featured_portals?: Record<string, string[]>;  // category_id -> portal_ids for seed content
  signed_by?: string;       // Ed25519 public key of pack publisher
  signature?: string;       // pack content signature
}

interface BookmarkConfig {
  bookmark_type: 'platform' | 'portal' | 'route' | 'external';
  target_portal_id?: string;
  target_route?: string;
  target_url?: string;
  label: string;
  icon_ref?: string;
  sort_order: number;
  undeletable?: boolean;
}

interface CategoryConfig {
  id: string;
  label: string;
  icon_ref: string;
  native_tool_ref?: { type: 'module' | 'page' | 'service'; ref: string };
  featured_query?: { capabilities?: string[]; tags?: string[]; jurisdictions?: string[] };
  pathfinder_scope?: string;
  design_principle?: string;
  tier?: 'we-own' | 'placeholder';
  sort_order: number;
}
```

### 3.3 Registration

Add to `BUNDLE_TYPE_REGISTRY` in `server/services/anton-bundler.ts` as bundle type #43.

### 3.4 Default packs to ship

Three `.anton` files in `data/starter-packs/`:

1. **`global-default.anton`** — the 15 categories from §5, Jobs + Marketplace + Pathfinder bookmarks
2. **`school-default.anton`** — school-mode categories from §10, age-appropriate bookmark set
3. **`sverige-se.anton`** — Swedish locale, same 15 categories with reordering (Money higher, localised design principles in Swedish), `locale: 'sv-SE'`

Swedish pack ships with placeholder `featured_portals` (empty arrays) — specific partner portals require consent.

### 3.5 Import behaviour

On import, user sees a preview:
"Apply this starter-pack? It will change your bookmarks and category layout. Your portals, data, and saved content are not affected."

Yes → set `user_starter_packs.active_pack_id` and re-render Visitor Home.

### 3.6 Data model

```sql
-- Migration: 159_starter_packs.sql
CREATE TABLE IF NOT EXISTS user_starter_packs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_pack_id TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customizations JSONB DEFAULT '{}'
);
```

---

## 4. The 15 Categories — Layout and Principles (Phase 1)

### 4.1 Grid

```
Row 1:  Pathfinder*  Jobs*        Marketplace*  Friends     Video
Row 2:  Music        Food         Shop          Sport       News
Row 3:  Money        Travel       Health        Places      Learn
```

*Row 1 cols 1–3 are also in the bookmark bar — the grid tiles are additional, bigger-touch-target entry points for discoverability.

### 4.2 Data model

```sql
-- Migration: 160_portal_category_associations.sql
CREATE TABLE IF NOT EXISTS portal_category_associations (
  portal_id UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL CHECK (source IN ('manual', 'self-declared', 'pathfinder-inferred', 'curator-featured')),
  curator_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (portal_id, category_id)
);
CREATE INDEX idx_pca_category_score ON portal_category_associations (category_id, score DESC);
```

### 4.3 Category page template (for Tier B / Placeholder)

Every Tier B page uses `CategoryPage.tsx` parameterised by the config from the active starter-pack. Sections:

1. Category header: icon, label, design principle (one sentence, muted)
2. If `native_tool_ref` resolves: the native tool embedded or linked prominently
3. Featured portals (from `featured_portals[category_id]` or curated list)
4. "Saved in this category" — user's scoped bookmarks
5. Pathfinder box pre-scoped to the category
6. "Partner portals coming" panel — honest, acknowledges the placeholder state, invites portal operators to claim the category via a `/portals/new?category={id}` link

### 4.4 Design principles (per-category, one line each)

- **Food:** No dark-pattern upsells. No opaque fees.
- **Shop:** No fake reviews. Quality signals are AAP attestations, not stars.
- **Sport:** No engagement-optimised rankings.
- **News:** Ranking is transparent and time-decayed, not outrage-weighted.
- **Money:** No hidden spread. No gamified trading. Quality Ratchet on providers.
- **Travel:** No dark-pattern booking funnels. Pricing transparent.
- **Health:** Medical privacy by default. No commercialisation of health data.
- **Places:** No surveillance tracking. Location stays on-device.
- **Learn:** Content is inspectable. No black-box AI tutors.
- **Music:** Creators paid via FutureChain. No platform ads.
- (Pathfinder, Jobs, Marketplace, Friends, Video have principles inline in §5–§9.)

### 4.5 What to build in Phase 1

For all 15: the tile on the Visitor Home grid + route mount. For the 10 Tier B categories only: the shared `CategoryPage.tsx` template rendering the 6 sections above with placeholder states where content doesn't yet exist. Routes: `/life/food`, `/life/shop`, `/life/sport`, `/life/news`, `/life/money`, `/life/travel`, `/life/health`, `/life/places`, `/life/learn`, `/life/music`.

No work on any of the Tier B native tools in this phase. Placeholder messaging is the goal.

---

## 5. Pathfinder Visitor UI (Phase 2, "We own" #1)

### 5.1 Scope

The Pathfinder engine already exists (`server/services/pathfinder-engine.ts`, route, prompts, components per audit). This sub-brief is about the **visitor-facing surface** that makes Pathfinder feel like a destination — similar in spirit to what Google Search, Perplexity, or Kagi present to a user — while staying true to ANTON's manifest-first, AAP-attested ranking model.

### 5.2 New visitor surface

Route: already `/pathfinder` (exists). Augment, don't rebuild.

Add a new visitor-focused layout at `/pathfinder` that includes:

**Above-the-fold:**
- Large search input with mode chips: All / Portals / People / Bundles / Jobs / Marketplace / Content
- Recent searches (collapsible)
- Trending searches today (from anonymised aggregate query log — opt-in only)

**Below, on submit:**
- Results list grouped by result type
- Each result card shows: icon, portal/item label, 1-line description, **transparent ranking breakdown** ("Ranked #1 because: 47 AAP attestations, 91/100 quality, EU jurisdiction match"), primary action button, bookmark star
- Right rail: result facets (filter by jurisdiction, language, category, portal type, etc.)
- Bottom: "Not finding it? Publish a portal" CTA

**Ranking transparency is mandatory.** Every result displays its reason. No opaque relevance scores. This is a design principle with product consequences: it trains users to understand why X outranks Y, and it makes SEO-style gaming pointless because there's no hidden algorithm to optimise against.

### 5.3 Design principle

**Search that tells you why.** Every result includes its ranking rationale. No dark patterns, no engagement optimisation, no paid placement surfaced as organic.

### 5.4 New endpoints and types

Extend `server/routes/pathfinder.ts`:
- `GET /api/pathfinder/trending?since=24h&limit=10` — trending queries (aggregate, anonymised, opt-in)
- `POST /api/pathfinder/search` — augment response shape to include `ranking_breakdown: { signal: string; weight: number; contribution: number }[]` per result
- `POST /api/pathfinder/feedback` — user marks result as "helpful" / "wrong match" / "low quality" for improvement signal (stored, privacy-respecting)

### 5.5 Data model

```sql
-- Migration: 161_pathfinder_visitor.sql
CREATE TABLE IF NOT EXISTS pathfinder_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- nullable; anonymous allowed
  query_hash TEXT NOT NULL,      -- hashed for privacy
  mode TEXT NOT NULL,
  scope TEXT,
  result_count INTEGER NOT NULL,
  clicked_result_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pfsl_trending ON pathfinder_search_log (created_at DESC) WHERE created_at > NOW() - INTERVAL '7 days';

CREATE TABLE IF NOT EXISTS pathfinder_result_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  search_log_id UUID REFERENCES pathfinder_search_log(id) ON DELETE CASCADE,
  result_ref TEXT NOT NULL,
  signal TEXT NOT NULL CHECK (signal IN ('helpful', 'wrong-match', 'low-quality', 'spam')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.6 Components

- `src/components/pathfinder/VisitorSearchInput.tsx`
- `src/components/pathfinder/TrendingQueries.tsx`
- `src/components/pathfinder/ResultCard.tsx` — with `RankingBreakdown` subcomponent
- `src/components/pathfinder/ResultFacets.tsx`
- `src/components/pathfinder/FeedbackButtons.tsx`

### 5.7 What NOT to do

- Don't reimplement pathfinder-engine.ts. Consume the existing API.
- Don't add a trending algorithm beyond simple time-windowed frequency. No ML ranking in this phase.
- Don't surface paid placement in this phase. Monetisation surfaces come later and must be labelled.

---

## 6. Jobs (Phase 2, "We own" #2)

### 6.1 Context

The Talent module is the most comprehensively specified feature in the project. Daniel has produced four spec documents: full module spec, Claude Code implementation brief, internal mobility addendum, and internal mobility Claude Code addendum. Key commitments:
- Discovery-driven hiring
- 3 job ad variants (Mirror, Complement, Future-Proof)
- Dual-model architecture (primary assessor + bias auditor)
- EU AI Act Annex III compliance, human-in-the-loop throughout
- EU Pay Transparency Directive: salary ranges mandatory, salary history blocked
- Internal mobility with opt-out default aspiration profiles
- `.anton` career-profile bundle type as portable CV

The recruiter-side pages exist (`TalentPage.tsx`, `TalentCampaignPage.tsx`). **This brief focuses on completing the candidate side — the Jobs experience from the applicant's point of view.**

### 6.2 Scope

**`career-profile` `.anton` bundle type** — register this in `BUNDLE_TYPE_REGISTRY` as bundle type #44. It's already designed; just needs registration and parse/render implementation. See the existing talent spec docs for schema.

**Candidate Jobs home** — `/jobs` route (with alias from `/talent/jobs`).
- Search bar (powered by Pathfinder in `jobs` mode)
- Filters: location, jurisdiction, remote/hybrid/onsite, salary range, industry, required skills, EU AI Act transparency flag
- Job result list
- Right rail: saved searches, application status overview
- "My career profile" CTA for candidates with no `.anton` yet

**Job detail page** — `/jobs/:id`
- Job ad content (one of the three variants)
- **Published Assessment Framework** (dimensions and weights visible to candidate — this is non-negotiable per EU AI Act transparency requirements)
- Salary range (mandatory display)
- The 5 ad-specific questions
- Company / portal link
- Apply button

**Application flow:**
1. Candidate uploads CV (PDF/Word) OR imports `.anton` career-profile bundle
2. System parses CV (if traditional) to structured JSON or reads `.anton` directly
3. Candidate answers the 5 ad-specific questions
4. Candidate reviews what will be submitted (transparency before send)
5. Submit

**Candidate dashboard** — `/jobs/applications`
- List of applications with status (Submitted → Under Review → Follow-up Questions → Interview → Decision)
- Per-application transparency pane: which dimensions scored how, what weights applied, bias audit flags if any
- Follow-up question inbox: when the recruiter-side workflow sends 3 clarifying questions, candidate answers here
- Withdraw application button

**Career profile editor** — `/jobs/profile`
- Build or edit the `.anton` career-profile bundle through guided conversation (reuse Discovery-style UI)
- Import existing CV → parsed → structured → editable
- Export as `.anton` bundle (portable, user-owned)
- Export as PDF/Word CV (auto-rendered from structured data — candidate never hand-maintains a CV again)
- Aspiration profile section (if the user's org has internal mobility enabled)

### 6.3 Design principle

**Transparent hiring or none at all.** Every candidate sees the assessment framework, the weights, the salary range. Every decision has a visible rationale. No "we'll let you know" vagueness; dashboards show real status.

### 6.4 Data model (minimal additions — most tables already exist)

```sql
-- Migration: 162_jobs_candidate_side.sql
CREATE TABLE IF NOT EXISTS job_applications_candidate_view (
  -- Materialised view of the candidate's application status
  -- Backed by existing talent_applications table but exposes only candidate-visible fields
) -- see existing schema; add views not new tables

-- Add career_profile reference to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS career_profile_bundle_id UUID REFERENCES anton_bundles(id);
```

### 6.5 `career-profile` bundle schema

Registered as bundle type #44. Schema follows the existing Talent spec docs — Daniel has already specified `career_path`, `growth_map`, `aspirations`, `assessments`, `cv_rendered`. Claude Code should read those 4 spec docs if still present in the project knowledge or repo `docs/`, and implement exactly to that schema.

### 6.6 What NOT to do

- Don't touch the recruiter-side flow in this phase (it's shipped).
- Don't implement the bias auditor from scratch — it exists as dual-model architecture in the Talent spec. Consume.
- Don't build a general job-board crawler. Jobs displayed are jobs published on portals in the ANTON network, period. Cross-network federation arrives later.

### 6.7 What to build

- `src/pages/jobs/JobsHomePage.tsx`
- `src/pages/jobs/JobDetailPage.tsx`
- `src/pages/jobs/ApplicationFlowPage.tsx`
- `src/pages/jobs/CandidateDashboardPage.tsx`
- `src/pages/jobs/CareerProfilePage.tsx`
- `src/components/jobs/AssessmentFrameworkDisplay.tsx`
- `src/components/jobs/ApplicationStatusCard.tsx`
- `src/components/jobs/CVImporter.tsx`
- `src/components/jobs/CareerProfileEditor.tsx`
- `src/components/jobs/AspirationProfileSection.tsx`
- Server: career-profile bundle parser/renderer in `server/services/portals/career-profile.ts`
- Register `career-profile` bundle type #44 in `anton-bundler.ts`
- Register `starter-pack` bundle type #43 (if not done in Phase 1)
- Route all of `/jobs/*`; alias `/talent/jobs` → `/jobs` for backward compat

---

## 7. Marketplace (Phase 2, "We own" #3)

### 7.1 Context

Migration `104_bundle_marketplace.sql` exists per audit. The DB foundation is there. What's missing (likely — confirm in investigation) is the visitor-facing marketplace experience: browse, search, purchase, install.

This is NOT a general app store. It's a **`.anton` bundle marketplace** specifically — modules, skills, personas, workflows, compliance rulesets, starter-packs, coding blueprints, portals, etc. All 42 existing bundle types + the 2 new ones (#43 starter-pack, #44 career-profile) can be listed.

### 7.2 Scope

**Marketplace home** — `/marketplace`
- Search bar (Pathfinder in `bundles` mode)
- Category tabs: Modules / Skills / Personas / Workflows / Compliance Rulesets / Starter Packs / Templates / Coding Blueprints / Portal Types / Other
- Featured bundles (curated, visibly so)
- Recently added
- Most installed this week
- Filters: price (free/paid), licence (Apache / MIT / CC / proprietary), verified publisher, jurisdiction relevance

**Bundle detail page** — `/marketplace/:bundle_id`
- Bundle name, publisher (with verified badge if signed by Ed25519 key in trust registry)
- Readable description + what's inside (schema-aware preview — modules listed, skills shown, etc.)
- Signature verification result (green check if signature validates against publisher's public key)
- Price in FutureChain units (or "Free")
- Licence
- Install count, quality score, review summary
- "Preview contents" button — shows the full JSON+Markdown contents inside the `.anton` ZIP before install (this is the security model — you can see everything before running it)
- Install button (free) / Purchase button (paid, via FutureChain)
- "Versions" tab showing history
- "Related bundles" section

**Purchase flow:**
1. User clicks Purchase
2. Price shown in FutureChain units + local fiat equivalent
3. Wallet confirmation (reuse existing FutureChain payment UI)
4. Bundle downloaded signed
5. User reviews preview one more time
6. Install confirmation
7. Bundle added to user's library

**My Library** — `/marketplace/library`
- Installed bundles
- Purchased but not installed
- Published bundles (if user is a publisher)
- Uninstall / reinstall / update

**Publisher onboarding** — `/marketplace/publish`
- Create publisher identity (reuse portal identity Ed25519 keys)
- Upload `.anton` bundle
- Set price (free or FutureChain amount)
- Set licence
- Sign with Ed25519 private key (signed at upload)
- Submit for listing

### 7.3 Design principle

**Inspect before you install.** Every bundle can be read in full before installation. No hidden payloads, no surprise behaviour. Signatures verify publisher identity. Purchases settle via FutureChain; no Stripe, no PayPal, no card surface.

### 7.4 Data model

Extend the existing `104_bundle_marketplace` schema (don't replicate). Likely additions:

```sql
-- Migration: 163_marketplace_visitor.sql
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES anton_bundles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT,
  version_reviewed TEXT,
  verified_install BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bundle_id, user_id)
);

CREATE TABLE IF NOT EXISTS marketplace_user_library (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bundle_id UUID NOT NULL REFERENCES anton_bundles(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('purchased', 'installed', 'uninstalled', 'updated')),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_installed_version TEXT,
  PRIMARY KEY (user_id, bundle_id)
);
```

### 7.5 What to build

- `src/pages/marketplace/MarketplaceHomePage.tsx`
- `src/pages/marketplace/BundleDetailPage.tsx`
- `src/pages/marketplace/PurchaseFlowPage.tsx`
- `src/pages/marketplace/LibraryPage.tsx`
- `src/pages/marketplace/PublishPage.tsx`
- `src/components/marketplace/BundleCard.tsx`
- `src/components/marketplace/BundleContentsPreview.tsx` — schema-aware renderer for each bundle type
- `src/components/marketplace/SignatureBadge.tsx`
- `src/components/marketplace/PriceDisplay.tsx` — FutureChain + fiat
- `src/components/marketplace/ReviewList.tsx`
- `server/routes/marketplace.ts` — search, list, detail, install, purchase, review
- `server/services/marketplace/` — signature verification, preview generation, install orchestration
- Migration `163_marketplace_visitor.sql`

### 7.6 What NOT to do

- No third-party payment surfaces. FutureChain only.
- No algorithmic "recommended for you" feed beyond simple explicit filters.
- No obfuscated bundle contents — the preview MUST render all modules, skills, prompts, etc.

---

## 8. Friends (Phase 3, "We own" #4)

### 8.1 Context

Beehive Phase 4 AAP routing is complete. The protocol is shipped. What's missing is the consumer-facing UX that makes Beehive feel like "messaging with friends" to a non-technical user. The infrastructure is enterprise-collab-grade; Friends is the thin, warm, everyday layer on top.

### 8.2 Scope

**Friends home** — `/friends`
- Contact list (AAP contacts from the user's Gateway identity)
- Active conversations (1:1 and groups)
- Invite friend button (generates an invite envelope)
- Search own contacts
- Activity feed: things friends have shared (opt-in, time-ordered, not algorithmic)

**Contact detail & 1:1 chat** — `/friends/:contact_id`
- Chat history (messages are signed envelopes via Gateway)
- Send message (text, `.anton` bundle share, portal link, voice note, image)
- "Start a Beehive" button — spin up a small collaborative session with this contact
- Shared items: list of `.anton` bundles, portals, files exchanged

**Group (Beehive-backed)** — `/friends/groups/:session_id`
- Reuse existing BeehiveSessionPage, styled for casual use
- Member list
- Shared content
- Group settings (managed by creator)

**Invite flow:**
1. User clicks Invite
2. System generates a signed invitation envelope with the user's Ed25519 public key
3. Share via link, QR code, or in-ANTON-network direct (if recipient is reachable via AAP)
4. Recipient accepts → AAP contact added on both sides

**Activity feed:**
- Per-contact privacy settings: "Share with me" (contact shares their portal updates with this user) / "Share with friends circle" / "Private"
- No algorithmic scoring. Strictly reverse-chronological. No ads.
- User can mute contacts without removing them.

### 8.3 Design principle

**Social without the surveillance.** Your ANTON talks to your friends' ANTONs via signed envelopes. No central server holds the graph. No ad targeting. No algorithmic feed. Reverse chronological. You own your contacts.

### 8.4 Data model

Most exists already for Beehive. Additions:

```sql
-- Migration: 164_friends_layer.sql
CREATE TABLE IF NOT EXISTS friend_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_public_key TEXT NOT NULL,      -- Ed25519 pubkey of the friend's ANTON
  peer_portal_id TEXT,                -- optional if they have a portal
  display_name TEXT NOT NULL,         -- user-set alias
  contact_status TEXT NOT NULL CHECK (contact_status IN ('invited', 'pending', 'accepted', 'blocked', 'removed')),
  activity_share_setting TEXT NOT NULL DEFAULT 'private' CHECK (activity_share_setting IN ('private', 'me', 'friends-circle')),
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, peer_public_key)
);

CREATE TABLE IF NOT EXISTS friend_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitation_envelope TEXT NOT NULL,  -- signed envelope payload
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('portal-updated', 'bundle-shared', 'content-published', 'status-change')),
  payload JSONB NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'friends-circle', 'specific')),
  specific_audience UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.5 What to build

- `src/pages/friends/FriendsHomePage.tsx`
- `src/pages/friends/ContactDetailPage.tsx`
- `src/pages/friends/ChatPage.tsx`
- `src/pages/friends/GroupsPage.tsx`
- `src/pages/friends/InviteFlowPage.tsx`
- `src/components/friends/ContactList.tsx`
- `src/components/friends/ChatBubble.tsx`
- `src/components/friends/ActivityFeed.tsx` (reverse-chrono, no scoring)
- `src/components/friends/InviteQRCode.tsx`
- `server/routes/friends.ts`
- `server/services/friends/` — contact management, invitation envelope creation, activity event publishing/subscribing
- Wire Beehive 1:1 mode if it doesn't exist (check in investigation)
- Migration `164_friends_layer.sql`

### 8.6 Critical safety considerations

- **Minors** (School mode): friend contacts must be guardian-approved. Hard constraint. If `appMode === 'school'`, new friend requests require guardian approval before they're visible to the minor, and the invited peer's identity is surfaced to the guardian.
- **Blocking** is a hard disconnect at the AAP layer — blocked peers cannot route messages.
- **Abuse reporting** surfaces at `/friends/:contact_id/report`, flags the peer portal to the Pathfinder trust-scoring pipeline (negative signal), logs to moderation queue.
- **No read receipts** by default. Opt-in per contact.
- **No typing indicators** by default. Opt-in per contact.

### 8.7 What NOT to do

- No algorithmic feed. None. Reverse chronological or bust.
- No public "following" graph. Contacts are explicit and mutual.
- No likes, no emoji reactions beyond basic, no comments on feed items beyond replies.
- No ads. Ever.

---

## 9. Video (Phase 3, "We own" #5)

### 9.1 Context

Video is the heaviest net-new build. No existing infrastructure. Has genuine potential to slip. Claude Code must flag early if scope risks bleeding past v0.8 — acceptable to land Video in v0.8.1 as a follow-on.

Claude Code should understand: we are NOT trying to build YouTube. We're trying to build a **peer-native, creator-owned, non-algorithmic video surface** where video is a first-class shareable object over AAP, creators own their uploads, and payment flows via FutureChain.

### 9.2 Scope — Minimum Viable Video

**Video home** — `/video`
- Search (Pathfinder in `video` mode)
- Category chips: educational / creative / news / entertainment / how-to / research
- "From friends" row (videos shared by AAP contacts)
- "From portals you follow" row
- "New on ANTON" row
- No infinite feed. No autoplay-next by default.

**Video detail page** — `/video/:video_id`
- Player (HTML5, hls.js for adaptive bitrate)
- Title, description, creator, portal link
- Published date, duration, view count (public) / engagement count (creator-only)
- Chapter markers if provided
- Transcript (if auto-generated or uploaded)
- Share: via AAP to friend, to Beehive, to external link
- Like/dislike NOT shown; "Save" and "Share" only
- Comments: opt-in per video; when enabled, moderated by creator, federated via AAP envelopes, threaded, no upvoting

**Creator upload** — `/video/upload`
- Upload video file (mp4, mov, webm — max 2 GB for v1, configurable)
- Server-side transcoding pipeline (ffmpeg) to HLS with 3–4 renditions
- Thumbnail generation (auto + upload override)
- Metadata: title, description, category, language, tags, licence, monetisation choice (free / pay-per-view / tip)
- AI-assisted transcription via Whisper (reuse existing ANTON infra or OpenAI API)
- AI-assisted chapter detection (optional)
- Publish to own portal OR to a category directly

**Creator studio** — `/video/studio`
- Own uploads list
- Stats per video (views, completion rate, tips received, shares)
- Comment moderation queue
- Monetisation overview (FutureChain earnings)

**Playlists** — user-curated; shareable as `.anton` bundles

### 9.3 Design principle

**Video that respects you.** No algorithmic feed. No autoplay. No dark patterns. Creators own their content. Payment flows directly to creators via FutureChain. Comments are federated and creator-moderated. Transcripts are default. Viewing analytics are creator-only, never sold.

### 9.4 Infrastructure decisions

- **Storage:** S3-compatible object store (MinIO for self-hosted; AWS S3 / Wasabi / Backblaze for cloud). Configurable in deployment.
- **Transcoding:** ffmpeg as child process, queue-based (reuse existing job infrastructure if present; otherwise build a minimal queue with `pg-boss` or similar).
- **Streaming:** HLS over HTTPS. `hls.js` on the client.
- **CDN:** optional in v1; serve directly from object store with Cloudflare in front for cloud deployments. Self-hosted = no CDN, direct serve.

### 9.5 Data model

```sql
-- Migration: 165_video.sql
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publisher_portal_id UUID REFERENCES portals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category_id TEXT NOT NULL,
  language TEXT,
  tags TEXT[],
  licence TEXT,
  monetisation_mode TEXT NOT NULL CHECK (monetisation_mode IN ('free', 'pay-per-view', 'tip', 'subscriber-only')),
  price_fcx NUMERIC,                -- FutureChain units for PPV; NULL if free
  duration_seconds INTEGER,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'transcoding', 'ready', 'failed', 'unpublished')),
  storage_key TEXT NOT NULL,        -- S3 key for original + renditions
  hls_manifest_url TEXT,
  thumbnail_url TEXT,
  transcript TEXT,
  chapter_markers JSONB,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  viewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- nullable, anonymous allowed
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completion_percent INTEGER,
  is_ppv_paid BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS video_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES video_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  signed_envelope TEXT NOT NULL,    -- AAP envelope for federation
  moderation_state TEXT NOT NULL CHECK (moderation_state IN ('pending', 'approved', 'hidden', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS video_playlist_items (
  playlist_id UUID NOT NULL REFERENCES video_playlists(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, video_id)
);
```

### 9.6 What to build

- `src/pages/video/VideoHomePage.tsx`
- `src/pages/video/VideoDetailPage.tsx`
- `src/pages/video/UploadPage.tsx`
- `src/pages/video/CreatorStudioPage.tsx`
- `src/pages/video/PlaylistPage.tsx`
- `src/components/video/VideoPlayer.tsx` — hls.js wrapper
- `src/components/video/VideoCard.tsx`
- `src/components/video/UploadForm.tsx`
- `src/components/video/CommentThread.tsx`
- `src/components/video/TranscriptPanel.tsx`
- `server/routes/video.ts`
- `server/services/video/` — upload handler, transcoding queue manager, HLS manifest generator, transcription integrator, thumbnail generator
- `server/workers/video-transcoder.ts` — background worker running ffmpeg
- Storage adapter abstraction (S3-compat) in `server/services/storage/`
- Migration `165_video.sql`
- Playlist as `.anton` bundle type #45 (if Daniel confirms; could also be stored as data only)

### 9.7 Acceptance — MVV (Minimum Viable Video)

MVV is the smallest slice that still feels like a real video platform:
- Creator uploads a file
- It transcodes and becomes streamable
- Viewer finds it via Pathfinder or home
- Viewer watches with adaptive bitrate
- Viewer can share it to a Friend via AAP
- Creator sees views + earnings

Comments, playlists, subscriptions can come in a v0.8.1 follow-on.

### 9.8 What NOT to do

- No algorithmic feed.
- No autoplay of next video without user opt-in.
- No like/dislike buttons.
- No ads. Creator monetisation is via FutureChain direct (PPV, tips, subscriber-only), never ad-inserted.
- No shorts-style vertical-scroll feed. Not now, not ever without explicit product review.
- No DRM — content is open, licensed as the creator chooses.
- No scraping / crawling of other video platforms.

---

## 10. School-Mode Default (Phase 1 finalisation)

### 10.1 Categories in school mode

```
Row 1:  Pathfinder  Class     Study     Friends*  Video*
Row 2:  Music       Read      Create    Games     Places
Row 3:  Explore     Health    (empty)   (empty)   (empty)
```

*Friends and Video in school mode are guardian-moderated variants of the same infrastructure.

### 10.2 Behavioural differences

- **Friends:** new contact requires guardian approval; all traffic can be logged for guardian review (opt-in by guardian, disclosed to minor)
- **Video:** curated library only; no uploads without guardian approval; no monetisation; no comments
- **Marketplace:** read-only, age-appropriate bundles only, no purchases
- **Jobs:** hidden entirely
- **Money:** limited to allowance/pocket-money utilities if any

### 10.3 What to build

- `data/starter-packs/school-default.anton` — the config above
- Conditional rendering in the Visitor Home: if `appMode === 'school'`, load school-default starter-pack if user has no custom one
- Friends and Video components must check `appMode` and gate features

---

## 11. Data Model Summary

Total new tables added across all phases:

| Migration | Name | Purpose | Phase |
|---|---|---|---|
| 158 | `portal_bookmarks` | User bookmark bar + per-category saves | 1 |
| 159 | `user_starter_packs` | Active starter-pack per user | 1 |
| 160 | `portal_category_associations` | Portals tagged to categories | 1 |
| 161 | `pathfinder_search_log`, `pathfinder_result_feedback` | Visitor Pathfinder analytics, ranking feedback | 2 |
| 162 | Jobs candidate-side views (mostly reuses existing talent schema) | — | 2 |
| 163 | `marketplace_reviews`, `marketplace_user_library` | Marketplace visitor experience | 2 |
| 164 | `friend_contacts`, `friend_invitations`, `friend_activity_events` | Friends layer | 3 |
| 165 | `videos`, `video_views`, `video_comments`, `video_playlists`, `video_playlist_items` | Video | 3 |

All PostgreSQL. No SQLite variants.

---

## 12. Bundle Registry Additions

| Type # | Name | Purpose | Phase |
|---|---|---|---|
| 43 | `starter-pack` | Bookmark + category configuration | 1 |
| 44 | `career-profile` | Portable CV + aspiration data | 2 |
| 45 | `video-playlist` (optional) | Curated video collections | 3 |

---

## 13. Non-Goals (Reiterated)

- Track B-WAN portal gaps (separate punch list)
- Federated Pathfinder registries (Track A, separate repo)
- Whitepaper updates
- Marketing copy, landing pages, or public positioning
- Native tools for Tier B placeholder categories (Food, Shop, Sport, etc.)
- Content moderation at platform scale (per-portal and per-creator is the model)
- DSA / UK Online Safety Act platform-level conformance (separate workstream)
- Mobile app surface changes (the Companion App gets these as a natural consequence of the routes existing, but no new mobile-specific work)
- New LLM providers

---

## 14. Build Order

### Phase 1 (2 weeks estimated)

1. Investigation response
2. Starter-pack bundle type (#43) registered with schema
3. Migrations 158, 159, 160
4. Portal bookmarks API routes
5. Category config file with 15 configs
6. `BookmarkBar`, `CategoryTile`, `PortalVisitorHomePage`
7. Tier B placeholder category pages (10 of them)
8. Pathfinder scope query parameter support
9. School-mode starter-pack auto-swap logic
10. Three default starter-packs as `.anton` files
11. Smoke tests

### Phase 2 (3 weeks estimated)

12. Migration 161, 162, 163
13. Pathfinder visitor UI (new layout at `/pathfinder`)
14. Ranking transparency component + API response extension
15. Jobs routes and pages (home, detail, application flow, candidate dashboard, career profile)
16. `career-profile` bundle type (#44)
17. Marketplace pages (home, detail, purchase, library, publish)
18. FutureChain wallet integration for marketplace purchases
19. Signature verification for published bundles
20. E2E tests for Pathfinder, Jobs, Marketplace

### Phase 3 (4 weeks estimated; Video may slip to v0.8.1)

21. Migration 164
22. Friends layer (contacts, invites, chat, activity feed, 1:1 Beehive mode if needed)
23. Guardian approval flow for school-mode Friends
24. Migration 165
25. Video infrastructure (storage adapter, transcoding worker)
26. Video pages (home, detail, upload, studio, playlist)
27. HLS player with `hls.js`
28. Transcription integration
29. AAP-federated comments
30. E2E tests for Friends and Video

**If Video risks slipping past v0.8:** land Phase 1 + Phase 2 + Friends as v0.8; Video lands as v0.8.1. Flag early, don't ship partial Video.

---

## 15. Tests

### Phase 1

- `tests/e2e/portals-visitor-home.spec.ts`
- `tests/e2e/bookmark-bar.spec.ts`
- `tests/e2e/category-placeholder.spec.ts`
- `tests/e2e/school-mode-bookmarks.spec.ts`
- `tests/e2e/starter-pack-import.spec.ts`
- Unit: bookmark reducers, starter-pack bundle validation, category config loader

### Phase 2

- `tests/e2e/pathfinder-visitor-search.spec.ts`
- `tests/e2e/pathfinder-ranking-transparency.spec.ts`
- `tests/e2e/jobs-candidate-flow.spec.ts` — upload CV → answer questions → submit → see status
- `tests/e2e/career-profile-bundle.spec.ts` — export/import roundtrip
- `tests/e2e/marketplace-browse-install.spec.ts`
- `tests/e2e/marketplace-purchase.spec.ts` — with test FutureChain wallet
- `tests/e2e/marketplace-preview-before-install.spec.ts`
- Unit: signature verification, bundle contents preview rendering per type

### Phase 3

- `tests/e2e/friends-invite-accept.spec.ts`
- `tests/e2e/friends-1to1-chat.spec.ts`
- `tests/e2e/friends-activity-feed-reverse-chron.spec.ts` — assert NO algorithmic ordering
- `tests/e2e/friends-school-mode-guardian-approval.spec.ts`
- `tests/e2e/video-upload-transcode-play.spec.ts`
- `tests/e2e/video-share-to-friend.spec.ts`
- `tests/e2e/video-creator-earnings.spec.ts`
- Unit: AAP envelope signing/verification for friend invites, comment federation, HLS manifest generation

---

## 16. Acceptance Criteria

### Phase 1
- Visitor Home at `/portals` renders bookmark bar + 15-category grid
- All 10 Tier B categories show the placeholder template consistently
- Bookmark add/remove/reorder persists
- School-mode toggle auto-swaps bookmarks and categories within the same session
- Starter-pack import changes the user's active pack and reloads the Visitor Home accordingly

### Phase 2
- Pathfinder visitor search shows ranking breakdown per result (visible "Ranked #1 because…")
- Every Pathfinder result has a bookmark star and feedback buttons
- A candidate can upload a CV, answer job questions, submit an application, see transparent assessment
- A candidate can export a `.anton` career-profile and re-import it on another ANTON instance
- Marketplace preview shows full bundle contents before install
- Marketplace purchase flow settles via FutureChain; purchase receipt visible in library
- Signed bundles display verified badge; unsigned bundles display warning

### Phase 3
- A user can send an invite, a peer can accept, and they appear in each other's contact list
- 1:1 chat delivers messages via Gateway envelopes; messages verify on receipt
- Activity feed is strictly reverse-chronological (asserted in test by comparing to expected order)
- School-mode friend invites require guardian approval before the minor sees them
- A creator can upload a video, have it transcode successfully, and a viewer can play it with adaptive bitrate
- A viewer can share a video to a Friend via AAP
- Creator studio shows view counts and FutureChain earnings

### Cross-cutting
- No changes to Track B-WAN portal files
- No changes to existing Portal operator pages
- No changes to Pathfinder engine internals beyond adding the `scope` parameter
- All new tables PostgreSQL-only
- All new APIs auth-gated and CSRF-protected per existing middleware
- All new pages respect `appMode` for school-mode gating

---

## 17. Open Questions for Daniel

Answer before Phase 1 kickoff:

1. **`/portals` conflict:** If the existing operator landing occupies `/portals`, move to `/portals/manage` — confirmed?
2. **Life vs Portals pillar relationship:** Categories mount under `/life/*` but are surfaced from `/portals`. Does clicking "Life" in the nav go to the Visitor Home too, or keep the existing LifePage?
3. **"My ANTON" bookmark target when user has multiple portals:** dropdown in bookmark bar, or always route to `/portals/manage`?
4. **Swedish starter-pack featured portals:** ship with empty placeholders, or hold until specific partners (Blocket, Hemnet, SEB, etc.) sign off — which?
5. **Marketplace pricing surface:** show FutureChain + fiat equivalent, or FutureChain only?
6. **Friends activity feed default:** `private` (no sharing unless explicit), `me` (share only with yourself as read state), or `friends-circle` (default opt-in to mutual contacts)?
7. **Video max file size in v1:** 2 GB reasonable? Lower for initial deployment?
8. **Video storage:** self-hosted MinIO as default, or S3 (AWS) as default, or admin chooses per deployment?
9. **Comments on Video in MVV:** include, or defer to v0.8.1?
10. **Playlist as bundle type #45:** register now, or keep playlists as DB-only for v1?

Don't invent answers to any of these. Ask.

---

## 18. Completion Report

At the end of each phase, Claude Code produces a short report at `docs/PORTALS_VISITOR_LAYER_REPORT_P{phase}.md` with:
- Files added (paths)
- Files modified (paths)
- Migrations added (numbers)
- Bundle types added (names and numbers)
- Tests added (paths and pass counts)
- Open items deferred with reasons
- Any deviations from this brief with justification
- Specific followups for the next phase

At end of Phase 3, a consolidated `PORTALS_VISITOR_LAYER_FINAL.md` replaces the three phase reports.

---

*End of brief v2.*
