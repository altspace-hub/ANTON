# 01 — Design Tokens

**Extraction baseline: light mode.** Light is the default theme since v0.7.5 (`src/stores/useSettingsStore.ts:getInitialTheme()` returns `'light'`). Dark + corporate are listed for reference.

> All colours are stored in **OKLCH** (lightness 0–1, chroma 0–~0.4, hue 0–360°). Hex is computed from a colour-converter; the OKLCH values in source are canonical, not the hex.

---

## Token sources

| File | Scope | Status |
|---|---|---|
| `src/index.css` | Main app — `@theme` (dark baseline) + `html.light` + `html.corporate` | Canonical |
| `src/app/app.css` | Companion app — same three themes, app-internal copy | Canonical for `src/app/` |
| `src/theme/colors.ts` | Hex constants (`#2DD4A8`, etc.) | **Stale** — predates the OKLCH migration. Used by 1-2 legacy modules; kept for backwards compat. Do not extend. |
| `CLAUDE.md` § Design System | Hex palette comment | **Stale** — same drift as `colors.ts`. The CSS is canonical. |

No `tailwind.config.{js,ts}` exists. ANTON uses **Tailwind 4** with the in-CSS `@theme` block (the v4 mechanism that replaces `tailwind.config.js`).

---

## Colour palette

### Light mode (extraction baseline) — `src/index.css:53-97`

| Token | OKLCH | Hex (computed) | Role |
|---|---|---|---|
| `--color-adv-dark` | `oklch(0.965 0.005 80)` | `#F5F3EF` | Page background, inputs (warm linen) |
| `--color-adv-dark-2` | `oklch(0.985 0.003 80)` | `#FAFAF8` | Sidebar / header background |
| `--color-adv-card` | `oklch(1.0 0 0)` | `#FFFFFF` | Card backgrounds |
| `--color-adv-teal` | `oklch(0.47 0.14 175)` | `#0D7D6C` | Buttons, links, active state — WCAG AA 6.8:1 on white |
| `--color-adv-teal-dark` | `oklch(0.40 0.12 175)` | `#06655A` | Hover state |
| `--color-adv-teal-dim` | `oklch(0.92 0.04 175)` | `#D5F0EB` | Active selection background |
| `--color-adv-teal-soft` | `oklch(0.95 0.025 185)` | `#E5F5F2` | Info panels |
| `--color-adv-white` | `oklch(0.16 0.02 260)` | `#1A1B2E` | Headings / bold (19:1) |
| `--color-adv-off-white` | `oklch(0.28 0.015 260)` | `#3B3D50` | Body text / labels (15:1) |
| `--color-adv-gray` | `oklch(0.45 0.01 260)` | `#636577` | Secondary / inactive (7.4:1) |
| `--color-adv-gray-med` | `oklch(0.58 0.008 260)` | `#878999` | Captions / placeholders (4.3:1) — A11Y-07 compliant |
| `--color-adv-gold` | `oklch(0.62 0.16 65)` | `~#C8842B` | Warning |
| `--color-adv-red` | `oklch(0.52 0.22 25)` | `~#C7361F` | Error / destructive |
| `--color-adv-green` | `oklch(0.52 0.15 150)` | `~#1F8A5C` | Success |
| `--color-adv-blue` | `oklch(0.52 0.13 245)` | `~#3070C7` | Info |
| `--color-border` | `oklch(0.88 0.008 80)` | `#DDD9D2` | Warm gray borders |
| `--color-input` | `oklch(0.88 0.008 80)` | `#DDD9D2` | Input borders (== border) |
| `--color-ring` | `var(--color-adv-teal)` | — | Focus ring |

**Semantic mappings (light)** — `src/index.css:78-96`. Non-redundant pairings:

| Semantic | Resolves to |
|---|---|
| `--color-background` | `adv-dark` (page bg) |
| `--color-foreground` | `adv-off-white` (body text) |
| `--color-primary` | `adv-teal` |
| `--color-primary-foreground` | `adv-dark` (page bg on teal buttons — 6.2:1) |
| `--color-muted` | `oklch(0.96 0.003 80)` — warm muted bg |
| `--color-accent` | `adv-teal-dim` |
| `--color-accent-foreground` | `adv-teal` (deep teal on teal-dim — 5.4:1) |
| `--color-destructive-foreground` | `oklch(1 0 0)` — pure white |

### Dark mode — `src/index.css:3-46` (the @theme baseline)

| Token | OKLCH | Hex (computed) |
|---|---|---|
| `--color-adv-dark` | `oklch(0.15 0.02 250)` | `~#0B1426` |
| `--color-adv-dark-2` | `oklch(0.18 0.02 250)` | `~#0F1B2D` |
| `--color-adv-card` | `oklch(0.22 0.03 250)` | `~#152238` |
| `--color-adv-teal` | `oklch(0.78 0.15 170)` | `~#2DD4A8` (the brand teal) |
| `--color-adv-teal-dark` | `oklch(0.65 0.13 170)` | `~#1BA882` |
| `--color-adv-teal-dim` | `oklch(0.35 0.08 170)` | `~#144D3C` |
| `--color-adv-teal-soft` | `oklch(0.25 0.04 200)` | `~#0D2E3A` |
| `--color-adv-off-white` | `oklch(0.9 0 0)` | `~#E0E0E0` |
| `--color-adv-gray` | `oklch(0.75 0 0)` | `~#B0B0B0` |
| `--color-adv-gray-med` | `oklch(0.62 0 0)` | `~#9A9A9A` (raised from 0.5 for WCAG AA) |
| `--color-adv-gold` | `oklch(0.75 0.14 70)` | `~#F5A623` |
| `--color-adv-red` | `oklch(0.6 0.2 25)` | `~#E74C3C` |
| `--color-adv-green` | `oklch(0.65 0.17 145)` | `~#27AE60` |
| `--color-adv-blue` | `oklch(0.65 0.13 240)` | `~#3498DB` |
| `--color-border` | `oklch(0.3 0.02 250)` | `~#2A3A52` |

### Corporate mode — `src/index.css:104-148`

Cool blue-gray surfaces (hue 250) + royal blue accent + navy headings.

| Token | OKLCH | Hex (computed) |
|---|---|---|
| `--color-adv-dark` | `oklch(0.965 0.008 250)` | `#F3F5F9` |
| `--color-adv-dark-2` | `oklch(0.99 0.003 250)` | `#FCFCFE` |
| `--color-adv-card` | `oklch(1.0 0 0)` | `#FFFFFF` |
| `--color-adv-teal` | `oklch(0.50 0.16 250)` | `#2563B2` (royal blue, 6.0:1) |
| `--color-adv-teal-dark` | `oklch(0.43 0.14 250)` | `#1D4E9A` |
| `--color-adv-teal-dim` | `oklch(0.93 0.03 250)` | `#E0E8F5` |
| `--color-adv-white` | `oklch(0.25 0.08 265)` | `#1E3A7A` (navy headings, 16:1) |
| `--color-adv-off-white` | `oklch(0.20 0.01 260)` | `#1F2937` (near-black body, 18:1) |
| `--color-adv-gray` | `oklch(0.44 0.015 255)` | `#556178` (blue-gray secondary, 7.8:1) |
| `--color-adv-border` | `oklch(0.87 0.015 250)` | `#CDD5E1` |

### Companion App tokens — `src/app/app.css:8-58`

The companion app uses the **same names** but slightly different OKLCH values (no `--color-adv-white`, no `--color-adv-teal-soft`; `border` is unprefixed):

```
--color-adv-dark:        oklch(0.15 0.02 250)   /* dark base */
--color-adv-dark-2:      oklch(0.18 0.02 250)
--color-adv-card:        oklch(0.22 0.03 250)
--color-adv-teal:        oklch(0.78 0.15 170)
--color-adv-teal-dark:   oklch(0.65 0.13 170)
--color-adv-teal-dim:    oklch(0.35 0.08 170)
--color-adv-off-white:   oklch(0.9 0 0)
--color-adv-gray:        oklch(0.75 0 0)
--color-adv-gold:        oklch(0.75 0.14 70)
--color-adv-red:         oklch(0.6 0.2 25)
--color-adv-green:       oklch(0.65 0.17 145)
--color-adv-blue:        oklch(0.65 0.13 240)
--color-border:          oklch(0.3 0.02 250)
```

The `html.light` + `html.corporate` overrides in `src/app/app.css` (lines 27-58) follow the same pattern as the main app. **The companion app's light mode default is set in `src/app/services/theme.ts` (independent of the main `useSettingsStore`).**

---

## Typography

| Token | Source | Value |
|---|---|---|
| `--font-sans` (main) | `src/index.css:20` | `'Inter', 'Calibri', system-ui, sans-serif` |
| `--font-sans` (companion) | `src/app/app.css:23` | `'Inter', system-ui, -apple-system, sans-serif` |
| Corporate headings | `src/index.css:152-160` | `'Montserrat', system-ui, sans-serif` (h1–h6 only when `html.corporate`) |
| Base font size | `src/index.css:173` | `14px` (set on `html`) |
| School Mode RTL | `src/index.css:256-271` | `'Noto Nastaliq Urdu' / 'Noto Sans Devanagari' / 'Noto Naskh Arabic'` per-`:lang()` |

**No type scale tokens.** Font sizes live inline (`text-xs`, `text-sm`, etc., from Tailwind) or in component-specific CSS (`prose-output h1` is `1.5rem`, `h2` `1.25rem`, `h3` `1.1rem`, `h4` `1rem` — `src/index.css:209-213`).

**Line heights** — body `1.7`, lists `1.65` for `.prose-output`. Tailwind defaults elsewhere.

---

## Spacing scale

Inherited from Tailwind 4 defaults (no overrides in `@theme`). Standard 4px-grid: `space-1` = 4px, `space-2` = 8px, `space-3` = 12px, `space-4` = 16px, `space-6` = 24px, `space-8` = 32px, `space-12` = 48px.

ANTON does NOT define custom spacing tokens. Components freely use Tailwind's full scale including half-steps (`py-1.5`, `mt-2.5`) and arbitrary values (`text-[11px]`, `bottom-[calc(env(safe-area-inset-bottom)+72px)]`). The companion-app multi-expert review (April 2026) flagged this drift; the deferred fix is to introduce `space-*` tokens in the `@theme` block and lint arbitrary-value classes.

---

## Border radius — `src/index.css:42-45`

| Token | Value |
|---|---|
| `--radius-sm` | `0.375rem` (6px) |
| `--radius-md` | `0.5rem` (8px) |
| `--radius-lg` | `0.75rem` (12px) |
| `--radius-xl` | `1rem` (16px) |

Component conventions (from spec §9.5 + observed practice):
- Cards: 12px (`rounded-xl` = 16px also common)
- Inline controls (buttons, inputs): 8px (`rounded-lg`)
- Bottom sheets: 16px top corners
- Avatars + voice FAB: full round

---

## Shadows / elevation

No named shadow tokens — Tailwind defaults (`shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`, `shadow-2xl`) used throughout. Per-theme tinting:

```css
html.light .shadow-lg     { --tw-shadow-color: oklch(0 0 0 / 0.08); }
html.corporate .shadow-lg { --tw-shadow-color: oklch(0.25 0.08 265 / 0.06); }
```

(`src/index.css:163-165` + `:198-200`.) Dark mode uses Tailwind's default black-tinted shadows.

---

## Motion

Two named keyframes in the companion app (`src/app/app.css:93-110`):

| Class | Duration | Easing | Use |
|---|---|---|---|
| `.animate-slideUp` | 0.22s | `cubic-bezier(0.32, 0.72, 0, 1)` | Bottom sheets entering |
| `.animate-fabPress` | 0.18s | `ease-out` | FAB tap micro-interaction |
| `#app > *` (initial mount) | 0.2s | `ease-out` | `fadeSlideIn` keyframe — applied to every direct child |

The main app has no custom keyframes — motion is Tailwind's `transition-all` / `transition-colors` defaults plus per-component `animate-pulse` / `animate-spin` / `animate-ping`.

---

## Z-index scale

No named scale. Observed conventions:
- Bottom sheet backdrop: `z-50`
- FAB: `z-30`
- Sidebar collapsed/expanded: default (no z-index)
- Modal dialogs: `z-50`
- Notifications/toasts: `z-50`

If a designer needs a formal scale, Claude Design should propose one — ANTON has not yet committed to a numbered hierarchy.

---

## Accessibility

- WCAG AA contrast verified on the light palette (ratios noted in `src/index.css` comments).
- Focus rings — global `*:focus-visible { outline: 2px solid var(--color-adv-teal); outline-offset: 2px }` (`src/index.css:295-298`). Only fires on keyboard navigation; mouse clicks unaffected.
- Print styles — `@media print` resets dark theme to white background with black text (`src/index.css:301-334`).

---

## What changed recently

Per `CLAUDE.md` v0.7.5 notes: **Light mode became the default in v0.7.5**. The brand teal (`#0D7D6C` light / `#2DD4A8` dark) is locked in the SVG logo (`public/anton-logo.svg`), the `Sidebar` logo box, and the `LoginPage` logo so the brand mark stays consistent across themes.

---

## Stale token surfaces (do NOT use)

- `src/theme/colors.ts` — hex constants, dark-mode era. Two consumers: legacy `moduleColors` map. Will be deprecated once those callers migrate to OKLCH `@theme` references.
- `CLAUDE.md` § Design System — same hex values, kept as a comment for AI assistants. Trust the CSS, not the markdown.
