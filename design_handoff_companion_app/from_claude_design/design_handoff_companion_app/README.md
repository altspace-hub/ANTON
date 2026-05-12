# Handoff: ANTON Companion App — complete design

## Overview

This handoff covers the **full ANTON Companion App** redesign: a mobile app with two modes — **Pro** (full cockpit for operators: unified Mail & Calendar, all work modules, Markets, Pathfinder search, Horizon Radar) and **Standard** (a simpler companion for daily life — bigger type, plain language, hidden technical metadata). It also covers the shared infrastructure: personalization (per-user accent colour across 8 options), auth/onboarding, and the Evolution visual system that both modes share.

The design is presented as a single-page HTML canvas (`Companion App.html`) with the current project's `design/` folder as the source of truth for screen-by-screen React JSX. You'll find ~30 screens across authentication, home, messaging, work modules, school, markets, pathfinder, horizon radar, money, and personalization.

## About the Design Files

The files in this bundle are **design references created in HTML** — high-fidelity prototypes showing intended look, behaviour, and the design system. They are **not** production code to lift verbatim.

Your job is to **recreate these designs inside the existing React + TypeScript + Tailwind companion codebase** (project root holds `App.tsx`, `pages/`, `components/`, `services/`, `app.css`, `index.html`, `main.tsx`). The existing files are the target; the HTML/JSX mocks in `design/` are the north star. Merge or overwrite wherever the new designs disagree with what's in the repo today — **the designs in this handoff are primary**.

## Fidelity

**High-fidelity.** Exact colours, typography scale, spacing, border-radii, shadows, and component patterns are all defined. The Horizon Radar, Markets, Pathfinder, Mail and Calendar screens are pixel-intentional. You should recreate them exactly as shown, adapted to Tailwind classes and your existing service layer (`services/api.ts`, `services/socket.ts`, etc.).

Where existing patterns in the repo (e.g. `HomeScreen.tsx`'s `QuickAction` / `FeatureCard` primitives, Tailwind colour tokens like `adv-teal` / `adv-gold`) align, keep them. Where they disagree with the new designs (the new designs use a **light** warm-linen canvas, not dark), **the new designs win** — update the Tailwind palette and `app.css` accordingly. See **Design Tokens** below.

## Responsive behaviour

The designs are drawn at iPhone 14 Pro (390×844 CSS px) and Android (360×800). **Target range: 320px → 480px wide phones.** Rules:

- Layout uses **flex + `safe-area-inset-*`** — never fixed widths on cards. Horizontal padding is **14–16px** on card grids, **18px** on section labels.
- All touch targets **≥ 44×44px**.
- Type scale never drops below **12px** on metadata, **14px** on body.
- Horizontal rails (category chips, day-pickers, watchlist tapes) must scroll horizontally with `overflow-x: auto` — never wrap.
- Bottom nav is **fixed**; `PhoneBG` content area is scrollable between top bar and bottom tabs.
- For tablets / wide phones (>520px), centre content in a `max-w-[440px]` column — do **not** stretch cards to full width.

## Screens / Views

Screens are grouped by area. Each maps to a file in `design/` (JSX source, authoritative) and to a target file path in the repo under `pages/` or `components/`.

### A. Authentication & onboarding  (`design/screens-auth.jsx`)
1. **Welcome / Join org** — QR scan + code entry. Target: `pages/WelcomePage.tsx`, `pages/JoinPage.tsx`.
2. **Instance connection** — shows instance badge (org colour), trust hash, connection method. Target: `pages/ConnectionsPage.tsx`.
3. **Personal accent picker** — 8 swatches (emerald default, ocean, sunrise, ember, plum, slate, forest, gold). Target: new `pages/PersonalizePage.tsx`.

### B. Home & shell  (`design/screens-*.jsx` — multiple)
4. **Home (Pro)** — greeting, quick actions, announcements, feature cards (Markets / Horizon Radar / Documents). Target: `pages/HomeScreen.tsx` (rewrite — the current one is dark/emoji-based; new design is light/icon-based).
5. **Home (Standard)** — bigger type, fewer cards, no technical metadata.
6. **Bottom tabs** — Home · Messages · Calendar · More. Target: `components/TabBar.tsx`.

### C. Communications  (`design/screens-comms.jsx`)
7. **Unified Mail** — one inbox blending ANTON-native (`user@anton.<org>`) + external providers. Four tabs: All / Work / Life / Priority.
8. **Unified Calendar** — timeline merging ANTON events, external calendars, suggested blocks.
9. **Chat / ANTON thread** — existing `pages/ChatPage.tsx` stays; restyle to match light theme.

### D. Work modules  (`design/screens-work.jsx`, `design/screens-modules.jsx`)
10. **Work grid** — 8 modules (Sanctions, Counsel, Gap Assessment, Finance, Trades, Coding, NGO Impact, Build).
11. **Find-the-right-module** — natural-language router that sits at the top of Work. Describe task → routes to module.
12. **Each module detail screen** — lift pattern from JSX files as-is.

### E. School  (`design/screens-modules.jsx` — `SchoolFeedScreen`)
13. **Lesson feed** — phone-first, offline-capable, voice + photo primary.
14. **Homework capture** — teaches the steps, never just hands over the answer.

### F. Markets  (`design/screens-modules.jsx` — `MarketsScreen`)
15. **Markets briefing + tape** — morning brief produced by *your* ANTON against *your* positions. Your watchlist only; no public feed; no sponsored content; no data leaves device. Includes local Monte Carlo prediction card (10,000 runs visualised as horizontal stacked bar). Target: `pages/MarketsScreen.tsx` (rewrite).

### G. Pathfinder  (`design/screens-modules.jsx` — `PathfinderScreen`)
16. **Thinking search** — search that shows its thinking trace (N steps, each ✓), cites private sources (your instance docs, tinted in accent) *alongside* public sources, tagged distinctly. Target: `pages/SearchScreen.tsx` (rewrite).

### H. Horizon Radar  (`design/screens-modules.jsx` — `HorizonRadarScreen`)
17. **Radar feed** — regulators, competitors, threats, trends. Layout:
    - Top bar: name + custom **radar glyph** (concentric circles + sweep), live "scanning" dot, sources count, "N scanned today".
    - **3-up summary strip**: "N new today" / "N high relevance" / "N action suggested" — numbers in mono, labels in uppercase mono.
    - **Horizontal category chips** (All · Regulatory · Competitors · Products · Threats · Trends · Other) with counts.
    - **Morning brief hero card** — accent-tinted, 2-sentence summary by *your* ANTON, "Read brief" + "Play 90s" buttons.
    - **Signal cards** stack: tag pill (HIGH RELEVANCE red / WATCHLIST gold / ACTION SUGGESTED gold / FYI neutral), source line in mono ("REGULATORY · EUR-LEX · Official"), title, 2-line blurb, **relevance bar** (4px tall, fills 0–100, **red ≥85 / gold ≥65 / accent < 65**), meta line ("Matches: X · Nh ago").
    - **Sources footer** — 8 source pills + the line *"Nothing is scraped without your say-so. No source sells your queries back to you."*
    - Target: `pages/RadarScreen.tsx` (rewrite — the current file is a stub; `design/screens-modules.jsx` is the authoritative source, lines ~646 onwards).

### I. Money / Finance  (`design/screens-finance.jsx`)
18. **Wallet / Money** — accounts, tape, send/receive.
19. **In Standard mode**: labelled simply *"Money"*, not "FutureChain 0xA7f…". No mono hashes shown.

### J. Personalization & settings  (`design/screens-personalize.jsx`)
20. **Settings / You tab** — account, privacy, **App mode toggle** (Pro ↔ Standard — same data, different surface).
21. **Accent picker sheet** — applies live across the app.

### K. Standard mode  (`design/screens-standard.jsx`)
22–28. **7 Standard-mode screens** — Home, Messages, ANTON thread, Calendar, Money, Voice, You/Settings. Same data + accounts + ANTON as Pro, but:
- Bigger type (base 16px → 18px).
- Plain language ("Money" not "FutureChain"; "Confirmed" not "0xA7f2…c5 · SIG OK").
- **No** hashes, trust scores, IDs, mono typography, or Work/Markets/Pathfinder/Horizon Radar modules.
- One card, one action per view (looser density).

## Interactions & Behavior

- **Navigation**: tab switch = instant (no animation). Stack push = 250ms slide-from-right. Modal sheets = 300ms slide-up, backdrop 0.35 opacity.
- **Accent switch**: when the user picks a new accent, *every* primary button, pulse dot, section marker, and accent-tinted surface recolours live. Persist to `localStorage` key `anton-companion-accent`. See `design/tokens.jsx` → `withAccent(baseTok, accentKey)`.
- **App-mode switch** (Pro ↔ Standard): persist to `localStorage` key `anton-companion-mode`. Navigation rebuilds (different tab set + hidden modules); same accounts/data.
- **Horizon Radar** interactions:
  - Category chip tap → filter list (active chip = `bg: tok.text, fg: tok.surface`).
  - Signal card tap → detail screen (not drawn; use standard Chrome detail pattern).
  - "Scan now" button in top right → shows spinner 1–2s → updates scanned count.
  - Relevance bar is view-only; sort is fixed (highest relevance first within each category).
- **Pulse dots** (live-state indicators): `● LIVE` / `● SCANNING` / `● CONNECTED` — 2s pulse (0.4s fade to `rgba(accent, 0.4)`, 1.6s return). Green uses `tok.green`, accent uses `tok.accent`.
- **Form validation** (auth / join flow): inline errors in `tok.red`, error text 12px below field.
- **Loading states**: skeleton shimmer (`tok.surfaceMuted` → `tok.surface`) on card-shaped placeholders. No spinners in content — only on explicit user-triggered async actions.
- **Offline**: show a `tok.gold` banner at top "Offline — showing last sync at HH:MM". ANTON still answers from local cache.

## State Management

Use the existing pattern (`services/*.ts` + React state). New state slices needed:

- `personalization.ts`: `{ accent: AccentKey, mode: 'pro' | 'standard' }` — persisted to localStorage, emitted on change so screens re-render.
- `radar.ts` (new service): `{ sources: Source[], watchTerms: string[], items: Signal[], lastScanAt: number }`. API endpoints expected: `GET /api/radar/items`, `POST /api/radar/scan`, `GET/PUT /api/radar/sources`, `GET/PUT /api/radar/terms`. Backend work is out of scope for this handoff — stub with mock data matching the JSX fixture.
- `mail.ts` (new): unified inbox merging ANTON-native + configured providers. Stub for now.
- `calendar.ts` (new): merges ANTON events + external. Stub for now.

## Design Tokens

The authoritative token file is **`design/tokens.jsx`**. Three directions are defined; **use `evolution`** (warm linen, deep teal) as the primary. Port these into Tailwind config and `app.css` CSS variables.

### Direction: Evolution (primary)

**Canvas**
- `bg`: `#F5F3EF` — warm linen
- `surface`: `#FFFFFF` — cards
- `surfaceAlt`: `#FAFAF8` — header, raised
- `surfaceMuted`: `#EFECE5`

**Text**
- `text`: `#1A1B2E`
- `textBody`: `#3B3D50`
- `textMuted`: `#636577`
- `textFaint`: `#878999`

**Lines**
- `border`: `#DDD9D2`
- `borderSoft`: `#EAE7E0`

**Accent (brand default — emerald)**
- `accent`: `#0D7D6C`
- `accentDark`: `#06655A`
- `accentDim`: `#D5F0EB`
- `accentSoft`: `#E5F5F2`
- `accentFg`: `#FFFFFF`

**Status (locked — always these colours regardless of user accent)**
- `gold`: `#C8842B` / dim `#F7ECD9`
- `red`: `#C7361F` / dim `#F9E2DD`
- `green`: `#1F8A5C` / dim `#DCEEE4`
- `blue`: `#3070C7` / dim `#DEE8F6`

**Radii**
- `r1`: 8, `r2`: 12, `r3`: 16, `r4`: 22

**Type**
- `font`: `"Inter", "Helvetica Neue", system-ui, sans-serif`
- `fontMono`: `"JetBrains Mono", ui-monospace, monospace` (used only for: hashes, status codes, metadata rows, section labels, numeric stats)
- Scale: 10 (mono meta) · 11 (section labels uppercase tracking 0.8) · 12 (body-s) · 13 (body) · 14 (body-lg, card titles) · 15 (emphasis) · 18 (hero) · 20 (top-bar page title) · 22 (summary numerals) · 28+ (only on landing canvas)

### Accent palette (personal colour — picker shows 8)

Each swatch swaps `accent/accentDark/accentDim/accentSoft` via `withAccent(tok, key)`. Status colours never change.

| Key | Accent | Dark | Dim | Soft |
|---|---|---|---|---|
| emerald | `#0D7D6C` | `#06655A` | `#D5F0EB` | `#E5F5F2` |
| ocean | `#1F5FAE` | `#174880` | `#D5E2F2` | `#E8EFF9` |
| sunrise | `#C97220` | `#A15A15` | `#F5DDC0` | `#FBEEDB` |
| ember | `#B02E3B` | `#8A1F2A` | `#F0CDD1` | `#F8E2E4` |
| plum | `#6A3E8F` | `#522D71` | `#E0D0ED` | `#EEE3F5` |
| slate | `#2D3142` | `#1A1C2A` | `#D3D6DC` | `#E6E8EC` |
| forest | `#3E6B3A` | `#2C4F2A` | `#D4E2D1` | `#E5EEE3` |
| gold | `#A07C26` | `#7E5F15` | `#EADFBE` | `#F3EDD6` |

### Spacing scale

Follow density 'default'. Horizontal padding on cards: 14–16. Vertical padding in cards: 13. Section label → first item: 8. Item → item: 6–8. Page horizontal padding: 14. Top bar padding: 14 × 12.

## Components (to build / port from primitives.jsx)

Port from `design/primitives.jsx` to `components/ui/`:

- **`<Btn variant="primary|secondary|ghost" size="sm|md|lg" block icon>`** — primary = accent bg, secondary = surface + border, ghost = transparent. `r1` radius. Min touch target 44px.
- **`<Pill tone="neutral|teal|gold|red|green|blue" mono>`** — 3×8 padding, 999 radius, 11px font.
- **`<Card>`** — surface bg, 1px border, r2 radius, 14px padding.
- **`<SectionLabel>`** — uppercase mono, 11px, tracking 0.8, colour `textMuted`.
- **`<Dot c pulse>`** — pulse ring is `boxShadow: 0 0 0 3px {c}22`.
- **`<TopBar left right border>`** — 14×12 padding, 1px border-bottom (unless `border={false}`).
- **`<BottomTabs active badge>`** — fixed, 4 tabs, tall enough to clear safe-area-bottom.
- **`<PhoneBG>`** — outer background `tok.bg`, flex column, full height.
- **`Ico`** — 1.75-stroke lucide-style SVG icon set. The full list is in `design/primitives.jsx`. Use these exactly; don't swap for lucide-react unless you port the styling too (stroke-width, rounding).

## Assets

- **Icons**: custom SVG set in `design/primitives.jsx` → `Ico` object. Lucide-style but hand-tuned stroke-width (1.75). **Port verbatim** — do not substitute.
- **Horizon Radar glyph**: custom concentric-circles + sweep SVG, drawn inline in `HorizonRadarScreen`'s TopBar. Lift directly.
- **Fonts**: Inter + JetBrains Mono. Already loaded via the mock's `<link>` tags — add the same to `index.html`.
- **No images / illustrations** are used. Empty states should use icon + text, not illustrations.

## Files in this bundle

- `Companion App.html` — the single-page canvas showing every screen in context (sections 01 Accent, 02 Accent variants, 03 Pro cockpit, 04 Standard mode, 05 Verification / handoff notes). **Open this first** to see the whole thing laid out.
- `design/tokens.jsx` — the design token source of truth.
- `design/primitives.jsx` — all shared components (Btn, Pill, Card, SectionLabel, TopBar, BottomTabs, PhoneBG, Ico, etc.).
- `design/screens-auth.jsx` — auth + join + accent picker.
- `design/screens-comms.jsx` — chat / messages surfaces.
- `design/screens-finance.jsx` — Money / wallet.
- `design/screens-modules.jsx` — Work, School, Markets, Pathfinder, **Horizon Radar**, and Unified Mail/Calendar.
- `design/screens-personalize.jsx` — accent + settings.
- `design/screens-standard.jsx` — the 7 Standard-mode screens.
- `design/screens-work.jsx` — Work modules grid + detail patterns.
- `design/ios-frame.jsx`, `design/android-frame.jsx` — device chrome (for the canvas preview only; do **not** port — your app is the frame).
- `design/design-canvas.jsx` — the canvas layout utility for the mocks.
- `uploads/01-design-tokens.md`, `uploads/02-component-inventory.md`, `uploads/03-anton-surfaces-by-pillar.md`, `uploads/04-companion-app-surfaces.md`, `uploads/05-functional-map.md` — the original design briefs and functional maps used to build these screens. Useful context.

## Implementation order (suggested)

1. **Tokens first** — port `design/tokens.jsx` → Tailwind config + CSS variables in `app.css`. Delete `adv-*` dark-theme tokens that conflict. Wire up accent swap.
2. **Primitives** — port `Btn`, `Pill`, `Card`, `SectionLabel`, `Dot`, `TopBar`, `BottomTabs`, `Ico` into `components/ui/`.
3. **App shell** — rewrite `App.tsx` to load accent + mode from `services/personalization.ts`, provide them via context, and render the right tab set per mode.
4. **Home + bottom tabs** — rewrite `HomeScreen.tsx` + `TabBar.tsx` to the new light/icon design. Match both Pro and Standard variants.
5. **One module at a time** — port Horizon Radar, Markets, Pathfinder, Unified Mail, Unified Calendar, Work grid, School, Money. Each is 1–2 screens + a service stub.
6. **Standard mode** — ship the 7 Standard screens reusing primitives but with looser density + bigger base type.
7. **Auth + onboarding + accent picker** last.

## Open questions / things to decide during impl

- **Dark mode**: the designs are light-only. Decide whether to ship dark later or drop it. The current repo has a `services/theme.ts` with dark/light/corporate — if you keep dark, you'll need to derive dark tokens (not in this handoff).
- **Backend**: Radar / Mail / Calendar endpoints don't exist yet. Stub with fixtures matching the JSX demo data.
- **Instance badge colour vs personal accent**: the org badge keeps the *org*'s colour; the personal accent is everywhere else. Make sure both render side-by-side without clashing (verification section of the mock shows this).
- **Status-colour lock**: red/gold/green must stay constant regardless of user accent. Enforce at token level.
