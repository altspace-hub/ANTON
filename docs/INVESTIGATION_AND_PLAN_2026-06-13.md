# ANTON — Investigation & Improvement Plan (2026-06-13)

**Author:** Lead architect synthesis of a 9-agent investigation (1 device-evidence agent + 8 ground-truthing agents).
**Scope:** Seven user-raised areas across Comm, Pay, Business, Portals, HR/Talent, and a strategic web-checkout flagship.
**Method:** Every claim below is ground-truthed against the actual codebase with `file:line` evidence. Device behaviour confirmed via adb + Chrome DevTools Protocol on two Sony phones (A=QV7202N48K, B=QV7101L31T), read-only / non-destructive.

**BUG vs FEATURE legend used throughout:**
- 🐞 **BUG** — broken or misleading *right now*; a user hits it.
- 🧩 **FEATURE** — net-new capability; nothing is broken, the gap is "doesn't exist yet."

---

## Executive Summary

Of the seven areas, **three are quick bug-fixes** (Comm Pulse profile-pic, the tax "no calculation" symptom, the Business mode-lock), **one is a small but pivotal setting** (manual FTC↔fiat rate, on which the *real* tax fix depends), **one is a test + small pipeline fix** (remove Celebrini, build a NOLF end-to-end portal test), and **three are larger builds** (Business retail/restaurant features, HR/Talent positioning, and the strategic flagship — a "Pay with FutureChain" web-checkout SDK).

The headline insight from the investigation is that **almost none of the "big" work is greenfield.** The tax engine, the QR/URI format, the PACS.008 settlement path, the watch-only wallet model, the active-poll payment matcher, the animated-QR encoder, the Talent dual-model assessment engine, the discount cart-math, and the per-portal page/invoke pipeline are **all already built and (mostly) device-verified.** The recurring failure mode is **"built-but-not-wired"**: a working backend behind a placeholder UI (Talent assessment), working cart-math with no button (Business discounts), a working tax engine that mathematically zeroes out under a flat rate, a working portal pipeline pointed at an unreachable origin, and working chat avatars never read by the Pulse renderers. This makes the plan unusually high-leverage: many items are *wiring*, not *building*.

The single most important coupling: **the tax fix is structurally blocked by the absence of a per-transaction rate**, and the rate setting is the same primitive a multi-currency Pay/Business needs — so the manual-rate setting is the lynchpin that unblocks two areas at once. The web-checkout flagship, in turn, reuses the *exact same* rate, QR, and active-poll rails — making it cheap relative to its strategic value.

---

## Area 1 — Comm Pulse: profile picture not porting chat → Pulse 🐞 BUG

### (a) Verified root cause (file:line)
Device-confirmed: on the Pulse feed every author avatar is a letter-initial `<div>`, while the *same* person's real photo renders in the chat list and the Pulse header. The only `<img>` on the Pulse feed is the header avatar + a post image attachment; **no author avatar is ever an `<img>`** (`.artifacts/investigation-2026-06-13/A-01-comm-pulse-feed.png`, DOM-confirmed).

The avatar data already exists on-device, keyed correctly — the Pulse renderers simply never read it:
- Chat renders avatars via the shared `AvatarCircle`, fed `avatarImage`/`avatarMime` keyed by `contactHash` — e.g. `src/comm/pages/ChatListScreen.tsx:192`.
- The avatar is learned over the `profile` wire and written onto the contact at `src/comm/services/chat.ts:3169-3182` (`case 'profile'` → `updateContact(fromHash, { avatarImage, avatarMime })`).
- A Pulse post's `authorHash` equals `me.contactHash` for own posts (`chat.ts:1733`, `:1751`) and the relay-stamped `fromHash` for inbound posts (`chat.ts:2820`) — **the exact key contacts are stored under.** The keys already align; no new wire data is needed.

The four hardcoded letter-circle render sites (none look up any avatar source):
1. **Feed card** — `src/comm/pages/PulseFeedScreen.tsx:311-318` — `<button>` rendering `{post.authorName.slice(0,1).toUpperCase()}`. (Verified at lines 314-317.) **Own posts are broken too** — `isMine` posts also show the bare letter; identity avatar is never read.
2. **Post detail** — `src/comm/pages/PulsePostDetailScreen.tsx:267-272` (author) and `:217-222` (comment authors).
3. **Stories rail** — `src/comm/components/StoriesRail.tsx:47` — *does* use `AvatarCircle` but passes only `name`, never `avatarImage`/`avatarMime`, so it always falls back to the letter.
4. **Pulse profile** — `src/comm/pages/PulseProfileScreen.tsx:79-84`.

### (b) Recommended fix
Resolve avatars at **render time** from the existing contact store + identity — do **not** add the avatar to the Pulse post wire (it would bloat every fanout with a ~256px base64 blob, go stale on avatar change, and duplicate a source of truth already keyed identically).

Add a small shared resolver `useAvatarResolver()` under `src/comm/` that loads `listContacts()` into a `Map<contactHash, Contact>` plus `getIdentity()`, and returns `resolve(hash) => { name, avatarImage, avatarMime }` (for `hash === me.contactHash` use the identity avatar, else the map). Then swap the four hardcoded letter circles for `<AvatarCircle name avatarImage avatarMime .../>`. `PulsePostDetailScreen` already loads `contacts` (`:44`) and `me` (`:42`) and can reuse them directly.

### (c) Effort: **S–M**
S if the contact-map lookup is inlined per screen; M if the shared hook is factored (recommended — it is needed in 4 places and keeps the own-vs-contact branch in one spot). No wire/schema/migration changes, no E2E-crypto changes.

### (d) Risk + dependencies
**Very low risk.** Pure render-layer change; the data source and the `AvatarCircle` component already exist. No dependency on any other area. Device re-check needed after the fix: confirm own + contact avatars render on feed, detail, comments, stories rail, and Pulse profile.

---

## Area 2 — Manual FTC↔fiat rate + multi-currency in Pay/Business 🧩 FEATURE (lynchpin)

### (a) Verified ground-truth (file:line)
There are **two parallel rate paths**, and they currently disagree:

**Path A — the live in-use rate `ftcPerSek` (default 0.1 = 1 FTC ≈ 10 SEK), never editable in any UI:**
- Pay: `src/pay/services/profile.ts:15` (`DEFAULT_FTC_PER_SEK = 0.1`) → `PayProfile.ftcPerSek` (`src/pay/services/types.ts:39`), written once at onboarding (`src/pay/pages/onboarding/WelcomeScreen.tsx:46`).
- Business: `src/business/services/merchant.ts:19` → `MerchantConfig.ftcPerSek` (`src/business/services/types.ts:141`), written once at onboarding (`src/business/pages/onboarding/RegisterScreen.tsx:80`). Also snapshotted per-receipt/refund (`Receipt.ftcPerSek`) — a good accounting-rate pattern already in place.

**Path B — the dormant oracle seam `src/{pay,business}/services/fx.ts` (identical in both apps):** already multi-currency (`FiatCurrency = 'SEK'|'EUR'|'USD'`), has `getPreferredFiat`/`setPreferredFiat`, a `Quote` type, and display/signing/accounting rate lifecycles. **`fetchFromSource()` is a stub returning `null`** (`src/pay/services/fx.ts:196-201`, same in Business). This is the single seam the real oracle *and* the interim manual rate should hook into. The already-built `FiatAmountInput.tsx` (currency-swap fiat-first input, wired into `ReceiveScreen.tsx` + `AddScheduleScreen.tsx`) is **inert today only because `fetchFromSource` returns null.**

**Live read-sites of `ftcPerSek` that must consume the new setting:**
- Pay: `ReviewScreen.tsx:77,192,356,435` (primary), `PaymentDetailScreen.tsx:70-74,112,120-121,194-206,303-304`, `tax-bridge.ts:56-58,79,95,112,127`, helpers in `payment.ts:261,267,275`.
- Business: `SimpleScreen.tsx:68,94,125,158`, `ExtendedScreen.tsx:88,115,144`, `qr.ts:111,113,136,183-195`, `receipts.ts`, `refunds.ts`, `KvittoDetailScreen.tsx`.

**Multi-currency lock points (SEK-hardcoded):** `tax-bridge.ts:61` `const FIAT_CCY = 'SEK'` (**confirmed at line 61**); `payment.ts:268` `formatSek` hardcodes `sv-SE`; `KvittoView.tsx:262` literal `' kr'`; ~64 SEK/`kr`/`sv-SE` literals in `src/pay` (13 files), ~102 in `src/business` (28 files). Business's entire sale model is SEK-typed (`amountSek`/`vatSek`/`discountSek`).

### (b) Recommended fix
**Implement the manual rate inside `fx.ts`, not as a third field.** Make `fetchFromSource` (or a new `getManualQuote`) return a real `Quote` (`source: 'Manual rate (set by you)'`) from a stored manual rate when no oracle is present. This instantly lights up the already-built `FiatAmountInput`, the EUR Travel-Rule tier, and the multi-currency display path — far higher leverage than only patching `ftcPerSek`.
- New secure-store key `fc.fx.manual_rate` (per-currency fiat-per-FTC) + reuse `fc.fx.preferred_fiat`.
- One Settings screen each in Pay (`src/pay/pages/settings/`, add a `NavCard` in `SettingsScreen.tsx`) and Business (`src/business/pages/settings/SettingsScreen.tsx`): currency picker (SEK/EUR/USD) + numeric rate, labelled **"Manual rate — used until a live FutureChain market price is available."**
- **Bridge the two paths:** keep `ftcPerSek` as the canonical conversion number, make the manual setting its editor, and have `fx`'s manual quote derive from the same stored value so both display paths agree.

### (c) Effort
Manual-rate setting: Pay **S**, Business **S** (screen) + **M** (fx wiring/bridge, shared). Currency-selection display: Pay **M**; Business **L** (sale model SEK-typed end-to-end across ~28 files + persisted receipt schema). Tax-engine coordination **S** (swap `FIAT_CCY` + rate source).

### (d) Risk + dependencies
Low risk for the manual SEK/EUR/USD *rate* + *display*. **Recommend scoping Business merchant-*pricing* in a non-SEK currency as a separate, later L effort** — ship the rate + display first, keep merchant pricing in SEK for v1. **This area is the lynchpin: the real tax fix (Area 3, the M item) depends on having a per-transaction rate to stamp.** Device re-check: confirm the manual rate flows into Review estimate, the "1 FTC ≈ X" notes, and `FiatAmountInput`.

---

## Area 3 — Tax calculation "not working" 🐞 BUG (symptom) + 🧩 valuation-design fix

### (a) Verified root cause (file:line)
**The tax engine is not broken — it is working exactly as coded, but the design produces a structurally-zero result that reads as "nothing computed."** Two interacting causes:

**Symptom seen on device:** Pay → Skatteposition on device B (20 payments) shows the empty state — *"Ange din skattehemvist…"* + a single "Set tax residence" button (`.artifacts/.../B-05-pay-tax-position.png`). Device A (residence = SE set) shows a populated calc: 120.00 SEK est., 38 disposals (`A-05-pay-tax-position.png`). So **the first "no calculation" symptom is the no-residence empty state, not a compute bug.**

**Primary (deeper) cause — flat single-rate valuation forces every gain to 0.** `tax-bridge.ts:56-59` (`sekValue`, **confirmed lines 56-59**) values *both* acquisition and disposal at the same `ftcPerSek` rate (`:95` spend, `:112` receive). The SDK cost-basis computes `gain = proceeds − costBasis` (`anton-business/packages/futurechain-sdk/src/tax/cost-basis/average.ts:80`, `fifo.ts:95,108`); since both legs derive from the identical rate, **gain ≡ 0 for every disposal** in the normal receive-then-spend flow. The file header even admits it (`tax-bridge.ts:14-16`). The earlier "120 SEK" worked only because that fleet had spends with *no prior recorded receive* → zero-basis disposals where `gain = full proceeds`. Once wallets accumulated recorded receives, the pool got a basis and gains collapsed to 0.

**Secondary — rate-missing zeroes everything.** `sekValue` returns 0 when `ftcPerSek <= 0` (`:58`); default `?? 0.1` fallback at `buildTaxInputs` (`:127`, **confirmed**) so this only bites a stored profile with `ftcPerSek = 0`.

**Verdicts on the hypotheses:** rounding/de-minimis truncation = **FALSE** (`se.ts:85 de_minimis_per_transaction: 0`, no truncation, disposals never dropped). "No disposals detected" / "no market connection" = **FALSE** (engine runs fully offline; a `spend` always yields a `perTransaction` entry). It is a **valuation-design issue, not a regression.**

### (b) Recommended fix (three steps)
1. **S — surface the state honestly (do first).** When `perTransaction.length > 0` but `estimatedTaxFiat === 0` under a flat rate, show a banner: *"Estimated at your manual FTC↔SEK rate; with a single flat rate, spends net to ~0 gain. Set a market rate to see real gains."* When `ftcPerSek <= 0`, route to a "Set your FTC rate" CTA instead of a silent 0.00. Files: `TaxPositionScreen.tsx` (after `:162`), `TaxReportScreen.tsx`. ~half a day.
2. **S — guard the `<=0` rate.** In `buildTaxInputs` (`tax-bridge.ts:127`), if the resolved rate is `<= 0`, return a sentinel so the screen renders "set your rate" rather than all-zero. ~1-2h.
3. **M — value at time-of-event rates (the real cause-#1 fix).** Stamp each `PaymentRecord`/`ReceivedRecord` with the FTC↔SEK rate at transaction time (capture `getDisplayQuote`/`fx.ts` output at send/receive), and have `tax-bridge.ts:56,95,112` use that per-record `rateAtTx` instead of one global `ftcPerSek`. Files: `payment.ts` (record path), `received.ts` (`normaliseItem`), `types.ts` (add `rateAtTx`), `tax-bridge.ts`. ~2-3 days.

### (c) Effort: **S** (steps 1-2, ship immediately) + **M** (step 3)
### (d) Risk + dependencies
Steps 1-2 are display-only, near-zero risk, ship now. **Step 3 depends on Area 2** — it needs a real per-transaction rate source (the `fx.ts` quote), so do Area 2's manual-rate wiring first, then stamp `rateAtTx`. Device re-check: set residence + manual rate, confirm the banner appears under a flat rate and real gains appear once `rateAtTx` differs between acquire and spend.

---

## Area 4 — HR/job .anton capabilities inventory + Talentium comparison 🧩 FEATURE (positioning + one UI wire)

### (a) Verified ground-truth (file:line)
ANTON's people-domain is **two systems sharing `talent_*` tables**:

**HR area (generic LLM modules)** — `server/areas/hr/area.json`, 13 real one-shot prompt modules (`server/areas/hr/modules/*`), registered `src/lib/constants.ts:2859-2873`, 5 fully defined at `:1547-1627`. Real but shallow (no persistent workflow). **Orphan IDs:** `constants.ts:2872` lists `talent-discovery`/`talent-ad-generator`/`talent-assessment`/`talent-aspiration` — **none have a module definition** (functionality lives in the dedicated Talent workspace, not the module runner). Adjacent `server/areas/workers-rights/` (8 modules) is the employee-protection counterpart.

**Talent Discovery & Recruitment engine (the real depth)** — 7-phase pipeline + internal mobility + candidate job-search:
- Data: 16+ `talent_*` tables across migrations `107_talent_recruitment.sql`, `108_talent_compliance_rules.sql`, `109_talent_internal_mobility.sql`, `162_jobs_candidate_side.sql`.
- Services: `server/services/talent-service.ts` (679 lines, audited CRUD) + `server/services/talent-ai-service.ts` (597 lines) — **dual-model `assessCandidate` (primary assessor + independent bias auditor, `:262-300`)**, `runBiasSimulation` (pre-flight weight audit, `:429`), deterministic `checkCompliance` (`:505-583`), all via `provider-router` (model-agnostic).
- Routes: `server/routes/talent.ts` (784 lines) — blocks advancing past discovery without a salary range (`:176-188`, EUPT-RECRUIT-001), GDPR hard-delete (`:660`), k-anonymized analytics (`MIN_GROUP=5`, `:727`). `server/routes/jobs.ts` (294 lines) — candidate side.
- Portable artifact: `server/services/portals/career-profile.ts` — **candidate-owned, AAP-signed `.anton` bundle** (type #44, `anton-bundler.ts:175`); `aspirations.opt_in` defaults false (`:35`). Spec `docs/anton-format/types/career-profile.md` ("manager-blind by default", "signing REQUIRED"). **Caveat: `parseCareerProfile` accepts unsigned bundles — signature is specified-as-required but not enforced in this import path.**

**The one real UI gap (🐞-adjacent):** the most powerful feature — dual-model bias-audited scoring — is **fully built server-side but the recruiter UI shows a "Assessment engine coming in Session 4" placeholder** (`src/pages/talent/TalentCampaignPage.tsx:452`). `talent_skill_gaps` is a scaffold (table exists, no service populates it).

### (b) Recommended build
1. **Wire the assessment UI** (`TalentCampaignPage.tsx:452`) to the live `assessCandidate` backend — surface scores, the bias-auditor pass, reasoning/uncertainties. **S–M, highest-ROI in this area** (the backend is done).
2. **Enforce signature verification** in `jobs.ts` `/profile/import` (call the AAP verify the bundler supports). **S.**
3. **Positioning, not code:** ANTON's differentiator is *architectural*, not a shipped competitor product — frame it honestly (table below). Optionally populate `talent_skill_gaps` via a generator (**M**).

### (c) Effort: **S–M** (UI wire) + **S** (signature enforce). No new pipeline.
### (d) Risk + dependencies
Low risk. No dependency on other areas. **Honesty flag:** the Talentium comparison is "shipped product vs. capability/architecture," not product-vs-product — ANTON has no shipped, focused hiring *product*; it has a deep, EU-AI-Act-instrumented platform + a portable candidate-owned format.

#### Talentium vs ANTON — comparison table
| Dimension | Talentium (talentium.io, Stockholm; €3.5M EQT pre-seed Dec 2024) | ANTON |
|---|---|---|
| **Candidate data ownership** | Employer-owned workflow; candidate data **scraped & enriched from the open web** (GitHub, portfolios); candidate is the *subject*, not the owner. | Local-first; `.anton` career-profile bundle is **candidate-authored, candidate-signed, candidate-held** (`career-profile.ts:1-11`). Recruiter verifies authorship *without trusting the candidate's instance*. |
| **Openness / portability** | Closed SaaS; data in Talentium's cloud; no portable format. | Open `.anton` bundle — portable, import/export, peer-to-peer shareable by construction. |
| **Local-first / privacy** | Cloud SaaS; GDPR + AES-256 + regional hosting + no model-training-on-user-data (strong *operator* posture, but centralized). | Runs on localhost; only LLM calls leave the machine. Privacy by data-residency-on-device. |
| **Explainability / audit (EU AI Act)** | Claims "alignment" + security advisory board; **no public detail** on how matching/ranking is explained. (Recruitment AI = high-risk, Annex III §4.) | Every AI action → `talent_audit_trail` w/ `eu_ai_act_category`; every candidate-affecting decision → `talent_human_decisions` (Art. 14); assessments store reasoning + thinking_trace + confidence + uncertainties. |
| **Bias mitigation** | Not stated. | **Independent second-model bias auditor** + pre-flight weight bias-simulation (`talent-ai-service.ts:262-300, :429`). |
| **Pay transparency** | Not stated. | **Enforced in code** — cannot advance past discovery without a salary range (`talent.ts:176-188`); salary-history questions flagged prohibited. |
| **Employer vs jobseeker** | Heavily employer-tilted; jobseeker is sourced/tracked, not served. | Two-sided: candidate surface (`jobs.ts` + 5 pages) + recruiter surface + a `workers-rights` area defending the employee. |
| **Vendor lock-in** | High (proprietary engine "Ted", cloud data). | Low — local-first, open format, multi-LLM (Claude/GPT/Gemini/Mistral/Ollama). |
| **Cost / accessibility** | Freemium → VC-priced recruiter SaaS. | Self-hostable, free to run (user pays only their own LLM API). |
| **Internal mobility** | Not a focus. | Opt-in, manager-blind, GDPR-deletable, k-anonymized (`talent.ts:660,727`). |
| **Maturity (honest)** | **Shipping, funded product** (Klarna/Voi users, 1,000-co waitlist). | **Deep platform + format; recruiter assessment UI lags its own backend** (`TalentCampaignPage.tsx:452`). |

**ANTON's open-approach differentiators (verifiable):** (1) the individual *owns and physically carries* signed career data — no lock-in by construction; (2) no central data lake (local-first, org's own Postgres); (3) EU-AI-Act-native auditability the *subject* can inspect; (4) bias audited by an independent model + weights audited pre-scoring; (5) pay transparency enforced *for the candidate*; (6) two-sided + a worker-rights area, not employer-only; (7) model-agnostic.

---

## Area 5 — Portals: Celebrini unreachable → remove + new NOLF end-to-end test 🐞 BUG + 🧩 TEST

### (a) Verified root cause (file:line)
Device-confirmed: the `sjsharks-celebrini` portal **opens only as a cached copy** with the banner *"Offline — visar den senast cachade kopian. Utgivaren är onåbar."* (`.artifacts/.../A-04-comm-portal-celebrini-open.png`).

**Exact cause:** the descriptor's `originEndpoint` points at `http://localhost:3001`, which a phone cannot reach. Celebrini was created by `scripts/e2e-portal-sharks.mjs`, which hard-defaults the origin: `scripts/e2e-portal-sharks.mjs:36` — `const ORIGIN_ENDPOINT = process.env.PUBLISHER_ORIGIN ?? 'http://localhost:3001';` (**confirmed at line 36**), written into the signed descriptor (`:560`) and submitted/auto-approved (`:664`/`:699`).

**Data flow & break point:** Discover (relay `/v1/portals/search`) ✅ → Resolve (relay `/v1/portals/resolve`, returns the descriptor with the bad origin) ✅ → **Render breaks** at `src/comm/services/portals.ts:188` `originAddress()` → `GET http://localhost:3001/api/portals/visit/...` → on the phone `localhost:3001` is the phone itself → `fetch()` throws → catch (`portals.ts:262`) → cached/blank. The relay/discovery half is healthy; the **publisher-origin transport half** is the failure. It only ever rendered via `adb reverse tcp:3001 tcp:3001` (`scripts/e2e-portal-live.mjs:9-18`). Architecturally load-bearing per `docs/PORTALS_TRACK_B_WAN_GAPS.md` (relay = discovery only; page-fetch + invoke go *directly* to the publisher origin). The Comm app (native Capacitor) fetches `originEndpoint` directly — it does **not** go through the server-side `assertSafeLanEgressUrl` SSRF guard (that only applies to the server-to-server proxy at `portals.ts:1227`).

### (b) Recommended fix + build
**Step 0 (the pipeline fix, do first):** make the descriptor carry an origin the phone can actually reach. Options: **A — LAN** (`APP_GATEWAY_PUBLIC_URL=http://10.14.247.166:3001`, same Wi-Fi, firewall allows inbound 3001 — *recommended for the test*); **B — `adb reverse`** (USB, matches Celebrini/live-e2e); **C — WAN** (Cloudflare tunnel / relay reverse path per `PORTALS_TRACK_B_WAN_GAPS.md` item 5 — the only true go-live answer). Walkthrough-published portals already pull the origin from `APP_GATEWAY_PUBLIC_URL` (`portal-walkthrough-engine.ts:422`).

**Step 1 — remove Celebrini:** relay revoke (per `relay/RUNBOOK.md`: admin login → reject/revoke so `revoked_at` is set; search excludes it, resolve 404s — `handlers/resolve.ts:56`); locally `UPDATE portals SET status='inactive' WHERE name='sjsharks-celebrini';`. Expected: Comm search for "sharks"/"celebrini" returns nothing.

**Step 2 — author NOLF** (*No One Lives Forever*): clone `e2e-portal-sharks.mjs` → `e2e-portal-nolf.mjs` (`PORTAL_NAME='nolf-archive'`, origin per Step 0), template `community`, pages `/` `/guide` `/lore`, capabilities `inquire`/`contact`/`subscribe`, tags `['nolf','no-one-lives-forever','cate-archer','retro','fps','fan']`.

**Step 3 — publish:** submit+approve to the relay (`POST /v1/portals/submit`, signature over `canonicalize(descriptorJson)` per `relay-submit.ts:167-172`). Expected `resolve/nolf-archive.global` → `originEndpoint = <Step-0 origin>` (**eyeball this string — it's what broke Celebrini**).

**Step 4 — verify per-hop on device:** A Discover → B Resolve → **C Page-list `GET <origin>/api/portals/visit/nolf-archive.global.portal/pages` → 200 (the hop Celebrini failed, `portals.ts:1217`)** → D Page render in `sandbox=""` iframe → E Invoke `.../capabilities/<id>/invoke` → 200 `invoke_accepted` + inboxId (`portals.ts:313-372`) → F origin inbox row recorded. **Pass criteria: hop D renders AND hop E returns `invoke_accepted`.**

**Optional coverage fix:** `e2e-portal-sharks.mjs:644-653` inserts into `portal_descriptor_cache` *without* `origin_endpoint`, so the server-side proxy path (`portals.ts:1220-1224`) is never exercised. Populate it in the NOLF clone to also validate ANTON-Local-as-proxy.

### (c) Effort: **M** (≈ half a day) for the test + Step-0 LAN/adb fix; **L** only if Step-0 Option C (real WAN tunnel) is chosen.
### (d) Risk + dependencies
Low risk (revoke is reversible-ish; non-destructive test). **Dependency:** the NOLF test *is blocked by* the Step-0 origin fix — without it NOLF fails at the identical hop. Device re-check is the entire point. **Honest unknown:** whether the operator wants the LAN/`adb` shortcut (proves the loop) or the WAN tunnel (proves go-live reachability) — these are different efforts.

---

## Area 6 — Business simple/advanced mode lock + retail/restaurant gaps 🐞 BUG (mode-lock) + 🧩 FEATURES (gaps)

### (a) Verified ground-truth (file:line)
**Mode-lock (🐞):** the mode is **not actually locked at the sale level** — it's a one-time cosmetic default with no editor. Device-confirmed: Settings shows *"Default mode: Extended"* as a **read-only, non-clickable `<div>`** with no button/chevron ancestor (`.artifacts/.../A-07/A-08`; **confirmed `SettingsScreen.tsx:438-442`** — a plain `<div>` inside a static card). Both `SaleCard`s always render on Home (`HomeScreen.tsx:87-100`); `defaultMode` only decides which is `large`. The field: `types.ts:131` (`defaultMode: SaleMode`), persisted once at `RegisterScreen.tsx:75`, read-backfilled at `merchant.ts:32`. **Switching it is a safe single-field write** — no migration, no data tied to it (catalogue in `items.ts` is mode-independent; each receipt records its own `mode` at `types.ts:21`). The only way to change it today is the destructive "Reset app."

**Feature gaps (🧩):** see the table. Highlights — **discounts are fully built cart-math + unit-tested but `cart.discount` is never set (no UI button)** — dead code from the user's POV (`cart.ts:33-43,112-120`, `cart.test.ts:86-116`). **Tipping `tipsSek` is a Z-report field hardcoded to 0** ("hooked to the tip-pool table when that lands", `z-reports.ts:201`). No table/tab, split-bill, item-modifier, per-staff, shift, barcode, or loyalty concepts.

### (b) Recommended fix + builds
**Mode-lock fix (do now):** make the read-only display interactive. Replace the static line at `SettingsScreen.tsx:433-442` with a two-button segmented control (reuse the Appearance-mode pattern at `:495-509`), add a `changeDefaultMode(next)` handler calling `saveConfig({ ...config, defaultMode: next })` (`saveConfig` already imported at `:13`). `HomeScreen.tsx:29-33` re-reads config on mount (auto-updates); `App.tsx:123/134` caches it for the tablet NavRail (re-read on return to home). i18n keys already exist. **Effort S (~30 lines), no migration.**

**Feature gaps — prioritized:**
- **Tier 1 (small effort, large gap — mostly wiring):** (1) **Discounts UI (S)** — wire existing math to a button in `ExtendedScreen`; (2) **Tipping/dricks (M)** — the `tipsSek` slot is reserved; add a tip step before the QR; (3) **Email-receipt-to-customer (S)** — `kvittoEmail` already captured (`RegisterScreen.tsx:144`), add the action to `KvittoDetailScreen`.
- **Tier 2 (medium, clear demand):** (4) **Item modifiers/variants (L, foundational)** — biggest café/restaurant gap; touches `CatalogueItem` + `CartLine` + grid + kvitto; (5) **Cash-drawer reconciliation (M)** — float in/out + counted-vs-expected at day close; (6) **Barcode scanning (M)** — add `barcode` to `CatalogueItem`, reuse the existing scan overlay.
- **Tier 3 (large, restaurant-specific):** (7) **Open tabs/table mgmt (L) + split bills (M/L)** — needs a persisted "open order" model the app lacks; (8) **Per-staff accounts + clock-in/shift (L)** — currently one shared PIN; (9) **Loyalty (L)**.

### (c) Effort: mode-lock **S**; Tier-1 **S/M**; Tier-2 **M/L**; Tier-3 **L**.
### (d) Risk + dependencies
Mode-lock fix: very low risk, no dependencies. Tier-1 discounts/email are pure wiring (low risk); tipping touches the QR amount (test on device). Modifiers (#4) is the structural keystone for café/restaurant and unblocks faithful tabs/splits later. **Honest summary:** the app is already a credible Swedish-compliant single-operator POS (per-item multi-VAT, gap-free kvitto/kreditnota/Z-report, SIE 4, hash chains, signed Z-reports, inventory, analytics). Gaps concentrate in **multi-person ops** and **restaurant service flow**.

---

## Area 7 — Web e-commerce checkout: "Pay with FutureChain" (Swish-style) 🧩 FEATURE (strategic flagship)

### (a) Verified ground-truth (file:line)
**The entire payment primitive already exists and is device-verified; a web checkout reuses ~90% unchanged.** What's genuinely new is one thin server (a "merchant gateway") + one thin JS widget.

Reusable rails (all pure / device-thin):
- **URI/QR builder** — `src/business/services/qr.ts` (pure, no I/O): `futurechain:pay?to=…&amount=<µFTC>&ref=<ADR-004 v1>&inv=<orderId>&exp=<+15min>&v=1[+creditor+order=AntonRemittance]`. Runs identically in Node. **100% reusable.**
- **ADR-004 ref + AntonRemittance envelope** — `@futurechain/sdk` (`reference`, `pacs008`). Pure. Reuse.
- **Settlement** — `src/pay/services/payment.ts` `executePayment()` (biometric → PIN → build PACS.008 → `submit_signed_transaction` → `pollConfirmation` against the recipient's UTXO set). **Entirely customer-side, self-custodial, ZERO change** — the same Pay app scans a web QR as a POS QR.
- **Watch-only merchant wallet** — `src/business/services/wallets.ts` `addWatchOnlyWallet(address)` (receiving address only, no key on device). The right web model — nothing to steal.
- **Active-poll payment detection (the keystone)** — `src/business/services/received.ts` `pollIncomingDetailed()` + `confirmReceiptByMatch()` (match on amount-exact + ref-substring + address, multi-match guard) and `active-sync.ts` `startActiveSync()` (1.5s→4s→10s→20s backoff, flips to PAID within ~1.5s). **Reuse the logic server-side.**
- **Animated-QR encoder** — `src/business/services/qr-transfer/encoder.ts` (fountain-coded UR, `needsAnimatedQr()` switches above 600 bytes). Pure, runs in the browser. `AnimatedQrDisplay.tsx` is the render-loop reference.
- **Host already exists** — ANTON Local's `server/services/fc-gateway-service.ts` (API-key issuance, `validateApiKey`, limits, audit log) + `fc-wallet-service.ts`/`fc-transaction-service.ts` with at-rest key encryption.

**POS-app-specific pieces to replace:** IndexedDB store → server store; Capacitor `native-http` CORS bypass → server fetch (no CORS server-side); per-*install* enrollment → per-*merchant* enrollment; on-screen pollers → per-request server poller; React QR screens → an embeddable JS widget.

### (b) Recommended architecture + new components
**Design principle:** the customer's Pay app is the *only* thing touching a private key; the merchant's site/gateway never sign and never custody; "instant" = honest UX states `scanned → submitting → seen(mempool) → confirmed(mined)` — never "Paid – final" on `seen` alone.

| New component | New? | Built on |
|---|---|---|
| `@anton/checkout` JS widget (~10KB) | NEW (thin) | `AnimatedQrDisplay` loop + status poller |
| Merchant Gateway REST (`server/routes/fc-checkout.ts` + `checkout-service.ts`) | NEW (thin) | extends existing `fc-gateway-service.ts` |
| `web_payment_requests` table | NEW | mirrors `Receipt` shape |
| Server-side per-request poller | reuse logic | `pollIncomingDetailed` + `confirmReceiptByMatch` |
| Webhook dispatcher (HMAC-SHA256 `ANTON-SIG`, BTCPay-style) | NEW (small) | crypto stdlib + relay signed-record pattern |
| URI/QR builder, ADR-004 ref, animated encoder, settlement, watch-only wallet, hub enrollment | reuse as-is | (above) |

**Reference models (sourced):** Swish Handel (token → QR → mandatory `callbackUrl` on final state PAID/DECLINED/ERROR; `payeePaymentReference` = our ADR-004 ref; mTLS = our signed merchant cert) and **BTCPay Server** (the closer match: self-custodial, invoice → QR → on-chain detection; `BTCPAY-SIG` HMAC webhook; `New → Processing → Settled` lifecycle = our `pending → seen → confirmed`; API keys server-side only, node watches the chain). **ANTON's edge over both:** settlement is *customer*-self-custodial, and the customer gets the **kvitto in-app *before* paying** (the `order=` envelope rides in the QR — neither Swish nor BTCPay has this).

**Flow:** merchant server `POST /checkout/v1/requests` (Bearer apiKey, amount sealed server-side) → builds the QR via the exact `qr.ts` functions, persists a request row, arms a poller, returns `{id, qrUri, needsAnimated, exp}`. The widget mounts by `id` (never sees the amount/key), renders the (animated) QR, long-polls/SSE status, fires `onSettled`/`onExpired`. Gateway polls `/iso_received/<merchant_addr>` + matches → flips `seen` then `confirmed` (mined) → POSTs the merchant's `webhookUrl` with `ANTON-SIG` + persists a hash-chained kvitto via ported `persistReceipt`.

**Security:** no key on the merchant (receiving address + read-only hub `X-API-Key` + gateway API key + webhook secret); replay/expiry via `exp` (enforced client + gateway) + single-use `orderId` + multi-match guard; tampered amount can't confirm (amount-exact match, amount sealed server-side at creation); webhook authenticity via timing-safe HMAC.

### (c) Effort: **L** overall, but cheap relative to value (most rails shipped).
**Phasing:** Phase 0 — extract the pure rails into `@anton/checkout-core` (~2-3 days). Phase 1 — MVP gateway + widget, end-to-end create→scan-with-real-Pay→`seen`/`confirmed` (~1 week). Phase 2 — `ANTON-SIG` webhooks + hash-chained receipts + SSE + FX capture + expiry sweeper (~1 week). Phase 3 — hosted multi-tenant + relay `/v1/checkout/notify` fan-out + CMS plugins (WooCommerce/Shopify) (~1-2 weeks). **Total realistic MVP→production ≈ 3-4 weeks.**

### (d) Risk + dependencies
Medium risk (new server surface; webhook/HMAC + replay correctness must be exact — copy BTCPay's verified patterns). **Dependencies:** reuses the **active-poll + animated-QR rails** (same `pollIncomingDetailed`/`confirmReceiptByMatch`/`encoder`) and benefits from the **manual-rate setting (Area 2)** for FX capture at request creation. **Unknown / device re-check:** FutureChain block-confirmation latency (governs the `seen → confirmed` gap) must be measured and surfaced honestly; demoable with the existing hub + a funded Pay wallet.

---

## CONSOLIDATED RANKED EXECUTION PLAN

Quick bug-fixes first → the rate setting (which the tax fix depends on) → the NOLF test + portals-pipeline fix → the bigger builds.

| # | Item | Type | Area | Effort | Depends on | Notes |
|---|------|------|------|--------|-----------|-------|
| 1 | **Comm Pulse avatar resolver** (4 call-sites + shared hook) | 🐞 BUG | 1 | S–M | — | Pure render-layer; data already on-device, keyed by `contactHash` |
| 2 | **Tax: honest empty/zero banner + `<=0` rate guard** | 🐞 BUG | 3 | S | — | Surface state honestly now; do *not* wait for the valuation fix |
| 3 | **Business mode-lock: Settings toggle for `defaultMode`** | 🐞 BUG | 6 | S | — | ~30 lines, single-field write, no migration |
| 4 | **Manual FTC↔fiat rate setting** (wire into `fx.ts`) + currency display | 🧩 FEATURE | 2 | S (Pay) / S+M (Business) | — | **Lynchpin** — unblocks #5 and multi-currency; lights up `FiatAmountInput` |
| 5 | **Tax: stamp `rateAtTx` per record + read it in tax-bridge** | 🧩 FEATURE | 3 | M | **#4** | The *real* cause-#1 fix; needs a per-tx rate source |
| 6 | **Remove Celebrini + NOLF end-to-end test** (incl. Step-0 origin fix) | 🐞 BUG + 🧩 TEST | 5 | M (LAN/adb) / L (WAN) | origin reachable | Proves the portal loop; fixes the load-bearing origin transport |
| 7 | **Talent assessment UI wire** (`TalentCampaignPage.tsx:452`) + signature enforce | 🧩 FEATURE | 4 | S–M | — | Backend already built (dual-model); surfaces the flagship HR feature |
| 8 | **Business Tier-1: discounts UI + tipping + email-receipt** | 🧩 FEATURE | 6 | S + M + S | — | Discounts = pure wiring of built+tested math |
| 9 | **Business Tier-2/3: modifiers, cash-drawer, barcode, tables/splits, staff/shift** | 🧩 FEATURE | 6 | L | #8 (modifiers foundational) | Restaurant + multi-person ops; scope per demand |
| 10 | **HR positioning** (Talentium framing, candidate-owned `.anton`) | 🧩 (docs) | 4 | S | #7 | Honest "platform/architecture vs shipped product" |
| 11 | **Web checkout SDK** ("Pay with FutureChain") | 🧩 FEATURE | 7 | L (3-4 wk) | reuses #4 FX + active-poll/QR rails | **Strategic flagship** — thin server + widget over shipped rails |

**BUGS (broken now):** #1 (Pulse avatars), #2 (tax silent zero / no-rate), #3 (mode unchangeable), #6 (Celebrini unreachable).
**FEATURES (new):** #4 (rate setting), #5 (per-tx valuation), #7 (assessment UI), #8/#9 (Business POS), #10 (positioning), #11 (web checkout).

### Single highest-leverage item
**#4 — the manual FTC↔fiat rate setting wired into the existing `fx.ts` seam.** It is small (S–M), it directly unblocks the *real* tax fix (#5), it brings the already-built `FiatAmountInput` + EUR Travel-Rule tier + multi-currency display alive "for free," and it supplies the FX-capture primitive the strategic web-checkout flagship (#11) needs at request creation. One small setting touches three areas.

### Cross-area dependencies (one line)
The **tax valuation fix (#5) depends on the rate setting (#4)** (needs a per-transaction rate to stamp); **multi-currency in Pay/Business (#4) and FX-capture in the web checkout (#11) share that same rate primitive**; the **web checkout (#11) reuses the active-poll matcher + animated-QR rails** (`pollIncomingDetailed`/`confirmReceiptByMatch`/`qr-transfer/encoder`) that already power the Business POS; the **NOLF test (#6) is blocked by the portal-origin transport fix**; and **Business item-modifiers (#9) is the structural prerequisite** for faithful restaurant tabs/splits.

---

## Honest unknowns / what needs a device re-check
- **#1** — re-verify own + contact avatars render on feed, post-detail, comments, stories rail, Pulse profile after the fix.
- **#5** — confirm real gains appear once `rateAtTx` differs between acquire and spend (today everything nets to 0 under a flat rate).
- **#6** — operator decision needed: LAN/`adb` shortcut (proves the loop) vs WAN tunnel (proves go-live reachability) — different efforts; NOLF fails at the identical hop without it.
- **#11** — FutureChain block-confirmation latency governs the `seen → confirmed` gap and must be measured + surfaced honestly; never claim "Paid – final" on `seen`.
- **Talent (#4/area)** — `parseCareerProfile` accepts unsigned bundles despite "signing REQUIRED"; enforcement is a real gap to close.
