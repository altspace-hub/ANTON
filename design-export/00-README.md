# ANTON Design Export — for Claude Design

**Version:** 1.0
**Date:** 2026-04-18
**Source brief:** `ANTON_Design_Export_for_Claude_Design.md` (repo root)
**Target tool:** Anthropic's Claude Design (Labs, launched 2026-04-17)
**Author of extraction:** Claude Code
**Author of brief:** Daniel Bardun

---

## What this folder is

A **read-only extraction** of ANTON's current design tokens, components, surfaces, and functional behaviour, in a shape Claude Design can ingest without re-deriving the whitepaper.

**Light mode is the extraction baseline** (it is the default theme since v0.7.5 — `src/stores/useSettingsStore.ts:getInitialTheme()` returns `'light'`). Dark + corporate variants are referenced where the token sources carry them.

The Companion App (`src/app/`) is a separate deliverable from the main ANTON workspace (`src/`). They share design tokens but have distinct user roles, form factors, and surface vocabulary.

---

## What this folder is NOT

- Not a redesign — Claude Design produces that. This is the input package.
- Not a cleanup of ANTON's design system — inconsistencies (e.g., the stale `src/theme/colors.ts` hex constants vs the canonical OKLCH `@theme` block) are documented as-is in `01-design-tokens.md`.
- Not a duplicate of `ANTON_COMPANION_APP_SPEC.md`, `CLAUDE.md`, or `docs/*` — those are referenced where relevant.
- Not exhaustive — surface enumeration in `03` is deliberately representative (~5 per pillar) with a full route appendix at the end so nothing is hidden.

---

## File map

| # | File | One-line purpose |
|---|---|---|
| 00 | `00-README.md` | This file — orientation + handoff. |
| 01 | `01-design-tokens.md` | Live OKLCH palette + typography + spacing + radii + motion across the three themes. |
| 02 | `02-component-inventory.md` | 179 main-app + 11 companion-app components grouped by source folder, with top-3 callsites for shared primitives. |
| 03 | `03-anton-surfaces-by-pillar.md` | Pillar-organised surface map (~5 representative per pillar) + full 209-route appendix. |
| 04 | `04-companion-app-surfaces.md` | Companion App self-contained brief — Ed25519 pairing, multi-instance, approvals, push, voice, capture. **Most important deliverable.** |
| 05 | `05-functional-map.md` | One-page UI-visible architecture — where IRE, atoms, autonomy, FAB, instance switcher live across surfaces. |
| 06 | `06-screenshot-capture-list.md` | Walkthrough checklist for Daniel — 50+ captures in walkthrough order. |

---

## Key facts up front

- **Tailwind 4** with in-CSS `@theme` block (no `tailwind.config.{ts,js}`).
- **OKLCH colour space**, not hex. Hex in `src/theme/colors.ts` is a legacy/stale artefact.
- **Three themes** sharing token names: dark (the `@theme` baseline) / **light (default)** / corporate.
- **No shadcn `ui/` primitives layer.** Components are domain-organised. The closest thing to primitives lives in `src/components/shared/` (~54 components). Pages compose with raw Tailwind utilities.
- **209 main-app pages + 17 companion-app pages.** 11 pillars + 5 cross-cutting surface clusters (Risk Atlas, Missions, Agents, Settings, Auth).
- **Brand teal locked**: `#0D7D6C` (light mode) / `#2DD4A8` (dark mode) appears in the SVG logo + sidebar logo box + login page logo across themes.

---

## Daniel's next steps

1. Read `06-screenshot-capture-list.md` end-to-end before starting captures so you know the prerequisites (one Atlas, one Engagement, one Mission, one or two Companion-App instances paired).
2. Run `pnpm run dev` and confirm light theme is active in the Header switcher.
3. Capture screenshots into `design-export/screenshots/` per the suggested filenames.
4. Bundle the entire `design-export/` folder (markdown + screenshots) and upload to Claude Design as onboarding material.
5. Optionally: in Claude Design, point at the ANTON repo directly via the Claude Code bridge so Claude Design can verify the token extraction against live source.
6. **Begin prototyping the first Companion App iteration.** It is the highest-leverage surface, the smallest design surface (17 pages), the freshest code (April 2026), and the surface that decision-makers (CISOs, ministers of education, NGO heads) hold first.
7. Move per-pillar after the Companion App iteration ships.

---

## Where to add updates

Per the brief §8, future updates ride as numbered addenda at the bottom of `ANTON_Design_Export_for_Claude_Design.md`. The corresponding extraction file in this folder gets a dated section appended — never a rewrite.

Example trigger events that would warrant an addendum:
- A new pillar lands in the codebase → addendum to `03`.
- A new design token (`space-*`, named shadows) is committed → addendum to `01`.
- Companion App scope changes → addendum to `04`.
- Claude Design's first iteration produces a v2 component library → addendum to `02` documenting the new primitives.

---

## Acceptance check (per brief §5)

- [x] `design-export/` folder exists at repo root with all seven files.
- [x] Every surface referenced has a source path. No surfaces invented — all routes verified against `src/App.tsx`.
- [x] Design tokens match what is actually in the codebase — no normalisation, no cleanup, no aspirational values. Stale `src/theme/colors.ts` flagged but not modified.
- [x] Light mode flagged as the extraction baseline throughout.
- [x] Companion App surfaces are fully separated from main ANTON surfaces (`04` is self-contained).
- [x] No specced-but-not-built pillars to flag (every CLAUDE.md pillar has at least one page in `src/pages/`).
- [x] No ANTON source code modified. Pure extraction.
- [x] Final README tells Daniel exactly what to do next.

---

## Notes for the next person

If Claude Design's onboarding mechanism changes after this brief was written (April 2026, two days post-launch), treat the upload-the-folder + point-at-repo guidance in step 5 as guidance rather than gospel — the import surface is the part most likely to evolve.

The token + component + surface extractions themselves are stable until the codebase moves. The screenshot list will get stale fastest — review it whenever a pillar surface is added or removed from `src/App.tsx`.
