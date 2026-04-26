# Handoff: ANTON Web UX v2 — Direction A refined

## Overview
Redesign of the ANTON web application, focused on **Direction A (sidebar cockpit)**. Covers:
- **Home** — editorial brief with a toggleable right rail (Activity digest ↔ Agent status)
- **Sanctions Advisory** — full module run layout: run header, collapsible run-configuration panel, output + right rail, bottom chat composer for iteration
- **Shell extras** — collapsed icon-rail sidebar, ⌘K command palette, notifications dropdown, keyboard-shortcuts overlay

## About the Design Files
The files in this bundle are **design references created in HTML/JSX** — prototypes showing intended look and behaviour, not production code to copy directly. The task is to **recreate these HTML designs in the target codebase's existing environment** (the existing ANTON web app, presumably React/TypeScript) using its established patterns and libraries. Treat the JSX in `web/*.jsx` as Babel-transpiled prototypes — useful for exact pixel values, spacing, copy, and state shapes, but expect to re-implement each component inside the real app's design system and component library.

## Fidelity
**High-fidelity (hifi).** Colours, typography, spacing, and component behaviour are intended to be pixel-accurate. Tokens are defined in `web/web-tokens.jsx` (`buildWebTok(theme, accent)`). The design supports three themes (`light`, `dark`, `corporate`) and eight accent swatches via `WEB_ACCENTS`.

## Files
Open `Web UX v2.html` in a browser for the full canvas. Source modules under `web/`:

| File | Contents |
|---|---|
| `web-tokens.jsx` | `buildWebTok(theme, accent)` and `WEB_ACCENTS`. Authoritative colour / radius / shadow / font tokens. |
| `web-primitives.jsx` | `WIco` icon set (lucide-style 1.5 stroke), `WBtn`, `WPill`, `WDot`, `WSection`, `WKbd`. |
| `web-data.jsx` | `WEB_DATA` — pillars, favorites, user, sanctionsRun, pathfinder, chatHistory. Use as copy / content source of truth. |
| `web-chrome.jsx` | `WBrowserFrame`, `WPillarBar`, `WTopbarIcons`. |
| `web-shell-v2.jsx` | **V2 shell**: `WBreadcrumbs`, `WRunHeader`, `WActionBar`, `WRailCard`, `WSuggestedNext`, `WSidebarV2`, `WTopbarV2`. These are the shared structural components used across every screen. |
| `web-screens-1.jsx` | `WHome` — editorial home column. |
| `web-v3-screens.jsx` | **Final screens**: `WHomeCombined` (home with toggle rail), `WSanctionsFullRun` (full Sanctions run + settings panel + chat composer). |
| `web-overlays.jsx` | `WCommandPalette`, `WNotifPanel`, `WShortcutsOverlay`. |

## Screens

### 1. Home — combined
**Purpose.** Landing screen after sign-in. Shows today's brief (left column) and lets the user toggle the right rail between **Activity** (inbox digest) and **Agent status** (what ANTON is doing now + session resources).

**Layout (1520px canvas width).**
- Top: `WTopbarV2` — 46px height, breadcrumbs left, `WPillarBar` centre (7 pillars), connection chip + commands chip + bell/settings right.
- Left: `WSidebarV2` — 236px expanded / 56px collapsed. Brand block, jump-to search, Favorites (pinned), collapsible sections (Interactive Modes, Tools & Features, Modules), user footer with connection state.
- Main: 2-col grid `1fr 380px`.
  - Main column: `WHome` — editorial brief body. Single-column, generous whitespace.
  - Right rail: tab bar at top toggling `Activity` / `Agent status`; scrollable body below.

**Activity tab.** Filter chips (All, Mentions, Reviews, Radar). Feed items: 26×26 tonal icon tile, title (12.5px/500), sub (11px/muted), timestamp (mono 10px). Items divided by 1px border. Tones: accent / gold / red / green / blue with matching soft bg + dim border.

**Agent status tab.** Pulsing live indicator + running summary. Task cards (one per active/monitoring/waiting task): title + state pill, module + ETA (mono 10.5px), 3px progress bar. Session resources card below: API spend, tokens out, time saved, active since — 2×2 grid, label in mono, value in 13.5px/500.

### 2. Sanctions Advisory — full run
**Purpose.** The primary work-run screen. The user configures a run, reads the generated document, iterates via chat.

**Layout (1520 × 1080 canvas).** Stacked top-to-bottom:
1. `WRunHeader` — breadcrumbs (mono uppercase), title "Sanctions policy v4 — Board submission" (22px/600, -0.4 tracking), subtitle, chip row (Think Hard · model · precision · task · word count · citations · status). Right: Share, Export, Approve (primary green).
2. **Collapsible run-configuration row** — clickable bar: settings icon + "Run configuration" + inline summary ("Think Hard · Haiku 4.5 · Balanced · Persona · Multi-agent off · Sanctions Policy Review · DORA") + Show/Hide + chevron.
3. **Settings panel** (when open) — three rows of 4-col grids:
   - Row 1: Depth (6 segmented buttons with Beta badges), Model dropdown, Precision (5 buttons), Writing style (3 buttons) + description.
   - Row 2: Persona / Multi-Agent / Deliberation toggle rows · Output Controls (tone + reasoning) · Knowledge Memory (use prior / build & update toggles) · Module Settings (task type dropdown + Sanctions Regimes multi-select).
   - Row 3: Situation/Context textarea + Advanced Settings link · Uploaded Documents drop-zone + attached file row.
4. **Body** — 2-col `1fr 300px`.
   - Main: gold review-required banner, document card (22/28 padding, 13.5px body, 1.6 line-height, pre-wrap), `WActionBar` (Export DOCX/PDF/MD + Share + Explain differently · rating on right), "Transform this document" pill row (exec one-pager, plain language, board slides, client brief), `WSuggestedNext` card grid.
   - Right rail: Trust score card (87/100 with High pill), Citations (3 entries, title + mono source), Run timeline (mono time + dot + step).
5. **Bottom chat composer** — history strip ("History 3/6" + version pills, current active in accent) + composer card: placeholder text, bottom bar with Attach / Prompt Lib / KB buttons, token counter on right, Re-run + Send (primary with chevron).

### 3. Shell states

**Collapsed sidebar.** `WSidebarV2 collapsed`. 56px icon rail. Brand becomes a 30×30 accent square. Favorites render as 36×36 icon tiles; active item has accent soft bg + 2px left accent bar + optional red notification dot badge. Footer collapses to avatar only.

**⌘K command palette** (`WCommandPalette`). Absolute-positioned overlay. 580px wide modal, centered at top: input row (command icon + query + Commands/Ask pills), grouped results (Jump to / Recent sessions / Actions / Ask ANTON fallback), first item highlighted in accent soft with 2px left accent border. Footer row: ↑↓ navigate / ↵ select / ⌘↵ open in new tab.

**Notifications panel** (`WNotifPanel`). 380px dropdown anchored top-right of topbar. Header: title + red "3 new" pill + Mark all read. Filter tabs (All / Mentions / Reviews / Radar / System). Item rows: 28×28 tonal icon tile, title + timestamp, sub; unread items get surfaceAlt bg + accent dot.

**Shortcuts overlay** (`WShortcutsOverlay`). 780px centered modal. Title + close. 2-col grid of groups (Navigation / Actions / Depth / View), each group has label in accent + list of `[WKbd parts] · label`. Footer: "Press ? anywhere" · "Esc to close".

## Interactions & Behaviour

- **Sidebar collapse** — ⌘B toggles sidebar between 236px and 56px with 180ms width transition.
- **Home right-rail toggle** — click tab; re-render the body component. No animation needed.
- **Run configuration panel** — click bar to expand/collapse. Store state per-session; restore on return.
- **Sanctions chat composer** — ⌘↵ sends; `@` mentions, `/` commands would trigger menus (not built in the prototype).
- **Command palette** — ⌘K to open. Type to filter. ↑↓ to navigate. ↵ to select. Esc to dismiss.
- **Notifications** — click bell to open panel. Click an item to navigate + mark read. "Mark all read" clears unread dots.
- **Shortcuts** — `?` opens, `Esc` closes.
- **Theme / accent** — `buildWebTok(theme, accent)` returns the full token set. Persist the user's choice.

## State Management

```ts
type WebAppState = {
  theme: 'light' | 'dark' | 'corporate';
  accent: keyof typeof WEB_ACCENTS;         // emerald, indigo, amber, rose, teal, violet, slate, copper
  sidebar: { collapsed: boolean; expandedGroups: string[]; };
  home: { rightMode: 'digest' | 'agent'; activeFilters: string[]; };
  overlays: { commandPalette: boolean; notifications: boolean; shortcuts: boolean; };
  run: {
    id: string;
    title: string;
    configOpen: boolean;
    depth: 'quick'|'think'|'think-hard'|'investigate'|'plan-first'|'deep';
    model: string;
    precision: 0|1|2|3|4;                   // Strict → Exploratory
    writing: 0|1|2;
    persona: boolean;
    multiAgent: boolean;
    deliberation: boolean;
    outputTone: 'formal'|'professional'|'casual'|'conversational';
    reasoningTransparency: 'off'|'summary'|'detailed';
    knowledge: { usePrior: boolean; buildUpdate: boolean; };
    module: { taskType: string; sanctionsRegimes: string[]; };
    context: string;
    uploads: Array<{ name: string; size: number; }>;
    history: Array<{ version: string; label: string; current: boolean; }>;
  };
};
```

## Design Tokens

Tokens are theme-driven. Values below are the **light theme / emerald accent** defaults; switch themes by calling `buildWebTok(theme, accent)`.

### Colours (light · emerald)
| Token | Hex | Usage |
|---|---|---|
| `bg` | `#F6F4EE` | Page background |
| `surface` | `#FFFFFF` | Cards, topbar, composer |
| `surfaceAlt` | `#FAF8F2` | Input backgrounds, alt rows |
| `surfaceMuted` | `#EFECE5` | Segmented control track, progress track |
| `sidebar` | `#F0EDE5` | Sidebar bg |
| `topbar` | `#FFFFFF` | Topbar bg |
| `rail` | `#FAF8F2` | Right-rail bg |
| `border` | `#DDD9D2` | Standard border |
| `borderSoft` | `#E7E3DA` | Dividers |
| `text` | `#1A1B2E` | Primary text |
| `textBody` | `#3B3D50` | Body copy |
| `textMuted` | `#6D6F81` | Secondary |
| `textFaint` | `#9A9BA8` | Tertiary / placeholders |
| `accent` | `#0D7D6C` | Emerald accent |
| `accentFg` | `#FFFFFF` | On-accent text |
| `accentSoft` | `#E8F4F0` | Accent tint bg |
| `accentDim` | `#C6E3DA` | Accent border |
| `gold` | `#C8842B` | Warning / review |
| `red` | `#C7443A` | Danger / unread |
| `green` | `#1F8A5C` | Success |
| `blue` | `#2F6AB0` | Info |

Each colour has `Soft` and `Dim` companions for tonal tiles. Dark and corporate themes swap background greys and adjust accent luminance — see `web-tokens.jsx`.

### Typography
- Font stack: `'Inter', system-ui, sans-serif`
- Mono: `'JetBrains Mono', monospace`
- Scale: 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 16 / 22 / 24 / 34 px
- Weights: 400 body, 500 default UI, 600 headings/bold labels, 700 brand
- Letter-spacing: `-0.6` (canvas title), `-0.4` (run title), `-0.3` (section title), `-0.2` (tweak title), `+0.6` (uppercase mono labels)
- Line-heights: 1.3 (item titles), 1.4 (sub), 1.5 (UI), 1.6 (document body)

### Spacing & geometry
- Radii: `r1` 4, `r2` 6–8, `r3` 10–12 (tokenised)
- Shadows: `shadow` `0 1px 2px rgba(0,0,0,.06)`, `shadowLg` `0 12px 40px rgba(0,0,0,0.15)`
- Sidebar widths: 236 expanded / 56 collapsed
- Topbar height: 46
- Right rail: 300 (Sanctions) / 380 (Home)
- Content gutter: 28px horizontal

## Assets
All icons are inline SVG in `WIco` (lucide-style, 1.5 stroke). No bitmap assets. Replace with your icon library of choice (lucide-react recommended for a 1:1 mapping of names).

## Implementation Notes

1. **Start with shared primitives** — port `WBtn`, `WPill`, `WDot`, `WSection`, `WKbd` to your component library first; they're used everywhere.
2. **Then the shell** — `WSidebarV2`, `WTopbarV2`, `WRunHeader`, `WActionBar`, `WRailCard`, `WBreadcrumbs`. These are the structural frame; every screen embeds inside them.
3. **Settings panel is the densest UI** in Sanctions — there are ~14 distinct controls in one collapsible block. Consider extracting each row as its own component so Pathfinder / Radar / other modules can reuse the config panel with different field sets.
4. **Chat composer** should be a shared component. Open Chat, Sanctions, Pathfinder all need it with slightly different affordances (re-run vs. send vs. ask-more).
5. **Right rail cards** (`WRailCard`) are a pattern, not a one-off — Trust score, Citations, Run timeline, Session resources, Activity, etc. all use it.
