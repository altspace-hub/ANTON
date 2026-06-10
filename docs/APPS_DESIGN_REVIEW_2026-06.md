# ANTON Apps — Design Review (June 2026)

**Produced 2026-06-11** from four expert-designer critiques (payment / POS /
messenger-social / assistant lens), each grounded in **31 real device
screenshots** (`.artifacts/design-review/`) plus the token/component/screen
code. Read-only investigation. **Nothing implemented — confirm before we act.**

---

## The one-sentence verdict

**The bones are world-class; the seams aren't.** All four apps share a genuinely
good design foundation — warm-linen canvas, one disciplined accent, flat 1px-border
cards, a real token system with derived accent surfaces, locked status colours,
and (in Comm/Companion) documented WCAG work. What holds every app back is the
**same four execution-drift problems**, repeated across all four codebases. Fix
those four systemic issues once-per-app and everything lifts at once.

---

## Shared design-language findings (all four apps)

These recur identically — treat them as a cross-app standard, not four separate fixes.

### S1. No shared Icon component → stroke-weight drift
None of the four apps has an enforced `Icon`/`Ico` primitive used everywhere
(Comm's `Ico.tsx` is closest but bypassed in ~6 places; Pay has **zero** — ~60
inline SVGs). Result: the *same glyph* renders at 1.5/1.8/2.0/2.4/2.6/2.8 stroke
across screens. **Worse — semantic glyph collisions:** Comm `poll`=`grid`(Portals
tab), agreement=`check`(verified badge); Companion `user`=Community+Profile,
`briefcase`=Work+My-Work; Pay uses literal text-glyph arrows `↙↗` and **colour
emoji** (⭐🔥🕘👥) as section markers (the single biggest "hobby-grade" tell).
**Fix pattern:** one `Icon` component per app, 24-grid, stroke 1.8–2.0 standard /
2.5 hero-only, sizes 16/20/24; add the missing glyphs (`refresh`, `contract`);
kill all text-glyphs and emoji-as-icons.

### S2. The status palette exists but the status UI ignores it
Every app defines `--color-success/-warning/-error` (+`-bg`) tokens — and then
the actual badges/pills hardcode hex: Business confirmed = `#0D7D6C` (Comm's
brand teal) and Z-report cards use the **dark-theme** teal `#2DD4A8`; Pay/Business
reference `var(--color-danger, …)` where **`--color-danger` is never defined** so
the hex fallback always wins; pending uses `#B8860B` (a CSS named-colour artifact).
**Consequence:** the real dark modes break (light-theme tints on dark surfaces),
and one app shows green + orange for two positive facts on the same row.
**Fix pattern:** a `StatusBadge` component per app reading only tokens; define
`--color-danger: var(--color-error)`; sweep every status hex → token.

### S3. No type scale — five-decimal rem arithmetic per element
Pay, Companion, and Business all size text with pasted px-to-rem conversions
(`0.90625rem`, `0.84375rem`, `0.65625rem`…) — ~40 distinct sizes per app, no two
screens agreeing on "body." All three drop below the **project's own 14px-minimum
rule** (9–11px labels) — a problem for the stated 35–65 audience. **Fix pattern:**
a 7–8 step token ramp (`--text-2xs…--text-2xl`); mechanical sweep; lint rule
banning >4-decimal rem literals.

### S4. Localization bleed at trust-critical moments (the apps' biggest visible flaw)
The screenshots caught English fragments on the Swedish build at exactly the
payment/confirmation moments. **Key insight: most are fallback-only — the keys
are missing from `en.json` too, so all 38 locales are broken, not just Swedish.**
Pay is worst (review screen "Network fee"/"Total", whole `history.detail.*` +
`paymentType.*` namespaces missing, `formatAgo()` returns hardcoded "just now",
the remittance `f.ref`/`f.message` labelKey collision makes them *untranslatable
as built*). Business serves an English kvitto by default (OS-locale not org-nr).
Comm leaks "Security"/"DETAILS"/"Agreement". **Fix pattern:** per-app i18n sweep
of `t('…','English')` defaults with no catalogue key; re-key the remittance
collision to `remittanceTpl.f.{templateId}.{key}`; locale-aware number/date
formatting (Pay hardcodes `en-US`).

### S5 (cross-cutting honesty). "Decorative status" — fake telemetry in trust apps
Especially Companion: a **fake mic** (disabled, aria-label confesses it),
**fake "TTL 60s"** that never counts down, **"Awaiting scan"** pulsing on the
manual tab before any scanner opens, **stacked error+empty** states. In apps whose
entire pitch is cryptographic trust, decorative status is the most expensive polish
debt. **Fix pattern:** status indicators must reflect real state or not render.

---

## Per-app punch lists (ranked; full file:line detail in the agent reports)

### Pay (sunrise orange — locked; light-first)
**Keep:** fraud-assessment card, look-alike hard gate, confirm-pop motion,
listening-for-payment pulse, segmented manual/paste entry — all beat Wise at the
equivalent moment. **P1:** (C1) the complete i18n key list [M]; (C2) `formatAgo`
untranslatable [S]; (C3) remittance field-key collision re-key [M]; (C4) money-in
green / pending amber — stop orange meaning five things [S]; (C5) Review: skip
empty Mottagare/Order rows + de-clutter the 5-row hero [S]; (C6) persistent field
labels in the composer (the two `type=date` inputs render as anonymous empty
boxes) [S]; (C7) **balance is the hero on Home** — it's currently 18px, smaller
than the page title [M]. **P2:** extract `Icon.tsx` [M]; kill emoji headers [S];
History row de-noise (don't badge "Confirmed") [M]; tokenize hardcoded reds [S];
**bundle fonts** (currently loads from Google CDN — offline-fragile + GDPR smell)
[S]; `break-all`→`break-words` on human text ("S tockholm") [S]; tax review-flag
i18n + locale number format [S]; type floor 10→11px [M].
**Product conversation (not specced):** FTC-first vs fiat-first — promoting "≈ SEK"
to co-equal on the Review hero would help comprehension most, but touches
signed-truth presentation → a decision.

### Business (blue #3070C7 — locked; light-first; non-technical staff all day)
**Keep:** keypad ergonomics (115×72dp keys — Square-tier), the raw ISO 20022
expander, the SKVFS/Ed25519 day-close content, settings organization. **P1:**
(1) `StatusBadge` + kill the parallel status palette (fixes 4 screens + makes dark
mode viable) [S]; (2) financial-document spec for KvittoView/Z-report — tabular
numerals, one SEK formatter (`1 234,50` not `1234.50`/`40 kr` mixed), **one local
date formatter** (kills the UTC-vs-local 19:46/21:47 contradiction), heavy rule
above totals [M]; (3) **contain the customer-remittance block** — today it renders
unverified third-party "Total 40 kr" with the same bold/alignment as the kvitto's
own "Total 0.10" → a forgery-lookalike on a legal document; inset/tint/relabel +
mismatch caption [S/M]; (4) PIN-gate "Mark as paid" on the QR screen (the *more*
exposed surface is the unguarded one) [S]; (5) payment-success interstitial — a
cashier confirms by peripheral vision, a kvitto card can't [M]. **P2:** QR-screen
glanceability (amount is *smaller* on the customer-facing screen than entry) [S];
amount-first receipt rows + date groups + search [M]; Business-blue day-close
trust surface [S]; Home "today's takings" strip (turn launcher → dashboard) [M];
icon normalize + SVG backspace + keypad press feedback [S]; 14px type floor +
Swedish-default-for-SE-merchants [S].

### Comm (8-accent system — keep; privacy ethos; light+dark)
**Keep (explicitly world-class):** the rich-card bubble taxonomy, View-once-before-
capture pill, the tx-detail banking voice, Pulse's ephemerality-as-warmth, the
locked-status-colour token architecture. **P1:** (1) **humanized envelope previews**
— chat list currently shows raw `{"agreementId":"ABT2X…` JSON as the home-screen
preview; one shared `previewOf()` per kind + a raw-JSON last-ditch guard [S/M];
(2) designed "unrenderable message" bubble (stop baking English into the DB; render
as a system chip, not fake peer speech) [S]; (3) **quarantine the unverified
agreement card** — it shows full terms/amount in the trustworthy accent band with
only a quiet pill; blur content + red-dim band when signature fails [S]; (4) three
i18n key fills [S]; (5) chat-list right column: **time + unread badge** — currently
absent, the #1 scanability gap vs Signal [M]. **P2:** attach-sheet regroup
(Share/Create/Money&Agreements — the money/contract differentiators are last and
look like "File") [M]; wallet-home hierarchy (11 equal chips; Send/Receive weigh
the same as RPC-endpoint) [M]; empty-state warmth (group + Pulse dashed-border→
solid) [S]; icon hygiene sweep [S]; accent-fg contrast matrix (gold/sunrise fail AA
for bubble text) [S]; header subtitle (raw hash → E2E/last-seen) + collapse the
settings QR [S].

### Companion (green mark; light-only; Pro+Standard)
**Keep:** the security-onboarding copy (best-written reviewed), the no-bubble
ChatBubble, the token discipline, ConnectionsPage at its best. **P1 (all S/M,
mostly one-file):** (C1) error/empty precedence rule — stop stacking "Couldn't
load" above "No organisations yet" [S]; (C2) Join-page back affordance + hardware
back (currently a dead-end on the *first screen a new user meets*) [S]; (C3)
truthful pairing telemetry — real TTL countdown, status only when scanning [S];
(C4) status-bar contrast (white clock on cream) [S]; (C5) wire the composer mic to
the now-real VoiceMode (delete the confessional aria-label) [S]; (C6) **kill the
one-way door** — Pro Settings has no mode toggle AND no accent picker [M]; (C7)
More-sheet regroup into 4 labelled sections [M]; (C8) approvals card de-escalation
(full-perimeter severity borders = a wall of red; use a 3px left edge) [S].
**P2:** converge to one voice surface (keep Std's immersive art + VoiceMode's
engine) [M]; type-scale tokens [M]; palette unification (MonogramTile ships its own
red/blue/gold) [S]; in-app brand mark `#2DD4A8`→`#0D7D6C` [S]; chat polish (model
chip → header, cluster timestamps, mobile Enter=newline) [M].
**Strategic:** the Pro/Std fork is *two apps* (3 header patterns, opposite voice
art, re-derived primitives). **Recommendation: converge the chrome; keep the fork
only at IA level** (Standard = a 4-tab, hidden-surface, +2px configuration, not a
parallel codebase).

---

## Suggested sequencing

1. **Per-app the 4 systemic fixes (S1–S4)** — Icon component, StatusBadge + token
   sweep, type ramp, i18n sweep. These are the multipliers: each fixes 3–5 screens
   and makes the real dark modes viable. ~2–3 days/app, mechanical.
2. **The trust/honesty P1s** — Companion's fake-telemetry set + the Join dead-end;
   Comm's raw-JSON previews + unverified-agreement quarantine; Business's
   financial-document spec + the customer-block containment; Pay's Review hero +
   empty rows. These are the first-impression and trust risks.
3. **Hierarchy P1s** — Pay balance-as-hero, Comm wallet-home + chat-list time/unread,
   Business today-strip, Companion More-regroup + settings symmetry.
4. **P2 polish** by value.

Light mode is primary for all; dark mode comes "for free" once S2's token sweep
lands (the `-bg` tokens already have dark overrides — the hardcodes are what break
it today). No identity changes anywhere: orange stays Pay, blue stays Business,
green stays Companion, the 8 accents stay Comm.
