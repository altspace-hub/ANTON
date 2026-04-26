# ANTON → Claude Design Export Brief

**Target:** Claude Code
**Author:** Daniel Bardun
**Version:** v0.1 (initial brief — addenda-style updates preferred over rewrites)
**Status:** Read-only extraction task. No ANTON source code modifications in this pass.

---

## 1. Purpose

Anthropic launched **Claude Design** on April 17, 2026 — a Labs product powered by Opus 4.7 that builds a team design system by reading a codebase and design files, then applies that system across prototyping, slides, and one-pagers. Output can be handed off back to Claude Code.

We are going to use Claude Design as an **external visual iteration tool** for ANTON's UX and for the ANTON Companion App. This is deliberate: Claude Design is NOT being embedded into ANTON (that would break the model-agnostic thesis — Mistral, Ollama, Azure OpenAI remain first-class). We are using it as a tool to build ANTON faster.

To feed Claude Design usefully, we need two inputs:

1. **A structured extraction** of ANTON's current design tokens, components, surfaces, and functional behaviour — produced by Claude Code (this brief).
2. **A set of light-mode screenshots** of each surface — produced by Daniel after the extraction is done.

These two inputs together become the onboarding package for Claude Design.

---

## 2. Investigation Protocol (mandatory — run before writing any extraction files)

Claude Code must complete this investigation and surface findings before producing any deliverables. Do not skip. Do not duplicate existing documentation if it already exists — reference it.

```bash
# 2.1 Design token and theme source
find . -type f \( -name "tailwind.config.*" -o -name "theme.*" -o -name "tokens.*" \) | grep -v node_modules
grep -rn --include="*.css" --include="*.ts" --include="*.tsx" -E "(--[a-z-]+:|theme\(|HSL|hsl\()" src/ | head -100
find . -type f -name "globals.css" -o -name "index.css" -o -name "app.css" | grep -v node_modules

# 2.2 Component library surface
ls -la src/components/ui/ 2>/dev/null || find src -type d -name "ui"
find src/components -maxdepth 3 -type f \( -name "*.tsx" -o -name "*.jsx" \) | head -50

# 2.3 Route / surface map
find src -type f \( -name "routes.*" -o -name "router.*" -o -name "App.tsx" \) | grep -v node_modules
grep -rn --include="*.tsx" --include="*.ts" -E "(Route|path:|createBrowserRouter|useRoute)" src/ | head -80

# 2.4 Pillar structure (Work / School / Life + Procure / Civic / Grow / Markets / Talent)
find src -type d | grep -iE "(work|school|life|procure|civic|grow|market|talent|pillar)" | head -30

# 2.5 Companion App Gateway surfaces (connected_user, PWA/Capacitor)
find . -type f -name "app-gateway.ts" -o -name "identity.ts" -o -name "intent-router.ts"
grep -rn --include="*.ts" --include="*.tsx" "connected_user" src/ | head -30
find . -type f \( -name "capacitor.config.*" -o -name "manifest.webmanifest" -o -name "manifest.json" \) | grep -v node_modules
find . -type d -name "companion*" -o -name "gateway*" -o -name "pwa*" | grep -v node_modules

# 2.6 Existing design documentation (do not duplicate)
find . -type f \( -name "DESIGN*.md" -o -name "STYLE*.md" -o -name "BRAND*.md" -o -name "UI*.md" \) | grep -v node_modules
ls docs/ 2>/dev/null

# 2.7 Light mode / dark mode implementation
grep -rn --include="*.tsx" --include="*.ts" -E "(useTheme|theme-provider|dark:|light:|ThemeProvider)" src/ | head -40
```

Report back:
- Which theme/token system is in use (CSS variables, Tailwind config, shadcn defaults, custom).
- Whether light mode is the default or requires a toggle, and where that toggle lives.
- Whether any existing design documentation already covers part of this — if so, **extend or reference it, don't duplicate**.
- Any gaps where the codebase has no clear source of truth (e.g. colours defined ad-hoc per component rather than centrally).

---

## 3. Deliverables

All deliverables go into a new folder: `design-export/` at the repo root. Each file is a standalone markdown document that Claude Design can ingest.

### 3.1 `design-export/00-README.md`
- Purpose of the folder
- How the files relate to each other
- Instructions for Daniel: which screenshots to take (see 3.7) and how to bundle everything for Claude Design
- Version + date stamp

### 3.2 `design-export/01-design-tokens.md`
Extract and document:
- **Colour palette** — all semantic colours (primary, secondary, accent, background, foreground, muted, destructive, border, ring) for **both light and dark modes**. Flag which mode is the extraction baseline (light).
- **Typography** — font families, weights, size scale, line-height scale, letter-spacing.
- **Spacing scale** — base unit, all named steps.
- **Border radii** — all named values.
- **Shadows / elevation** — all named values.
- **Motion** — any transition durations, easing curves, animation tokens.
- **Z-index scale** — if one exists.

Format: hex + HSL for colours. Reference the source file path for each group so Claude Design can verify. If tokens are scattered, flag it — do not invent a consolidation.

### 3.3 `design-export/02-component-inventory.md`
For every component in `src/components/ui/` (or equivalent) and every meaningfully reusable component in `src/components/`:
- Name
- Source path
- Variants / sizes (if any)
- Props summary (one-liner)
- Where it is used (grep for imports — top 3 call sites)
- Notes on whether it's a shadcn primitive, a wrapped primitive, or fully custom

Keep this factual. No opinions on quality. The point is inventory.

### 3.4 `design-export/03-anton-surfaces-by-pillar.md`
Organise every ANTON surface (screen / major view) by pillar. Use the actual pillar structure in the codebase — not an aspirational one. Structure:

```
## Work
### [Surface Name]
- Route: /work/...
- Source: src/pillars/work/...
- Function: [one-paragraph description of what this surface does]
- Primary components used: [list]
- Key interactions: [list]
- State of light mode: [clean / needs review / not yet styled]

## School
...

## Life
...
```

Include Work, School, Life. Include Procure, Civic, Grow, Markets, Talent only if they exist in code today — if they are spec-only, list them in a separate **"Specced, not yet in codebase"** section at the end so Claude Design knows the full vision without being misled about current state.

### 3.5 `design-export/04-companion-app-surfaces.md`
**This is a separate deliverable because the Companion App has a distinct user (`connected_user`) and a distinct form factor (lightweight PWA + Capacitor native shells).**

Document:
- Current state of the Companion App surfaces (PWA manifest, gateway routes, connection flow).
- The `connected_user` experience: onboarding, connecting via `ANTON-XXXX-XXXX-XXXX-XXXX` contact hash, primary use cases.
- Surfaces that exist today vs. surfaces that are specced but not yet built.
- Distinction between internet mode (WebSocket/HTTPS) and offline mode (mDNS/LAN) as it shows up in the UI.
- Capacitor native shell status (App Store / Play Store packaging state).

This file should be self-contained — someone reading only this file should understand what the Companion App is and what Claude Design is being asked to help redesign.

### 3.6 `design-export/05-functional-map.md`
Higher-level view: the **functional architecture as it shows up in the UI**, not the code. Example entries:
- "IRE (Iterative Reasoning Engine) surfaces: shown to user in Pathfinder council view, Mission observability dashboard, and Beehive deliberation view."
- "Knowledge atoms: visible as a sidebar in [X], editable in [Y], not surfaced in [Z]."
- "Earned autonomy progression: shown as a badge in [where], with state transitions visible in [where]."

This is the bridge between architectural concepts (documented elsewhere) and the visual surfaces a designer would need to understand. Keep it to a single page if possible — Claude Design needs a mental model, not a re-derivation of the whitepaper.

### 3.7 `design-export/06-screenshot-capture-list.md`
A **checklist** for Daniel. For each surface listed in 3.4 and 3.5, provide:
- [ ] Surface name
- Route / how to reach it
- Recommended state to capture (e.g. "with a recent mission in progress", "empty state", "with three knowledge atoms loaded")
- Light mode confirmed (yes/no)
- Suggested filename: `screenshots/pillar-surface-state.png`

Order the list in a sensible walkthrough sequence so Daniel can work through it top-to-bottom without jumping around the app.

---

## 4. Implementation Order

1. Run full investigation protocol (Section 2). Surface findings as a short report before proceeding.
2. Create `design-export/` folder + `00-README.md` stub.
3. Produce `01-design-tokens.md`. Verify against at least three source files.
4. Produce `02-component-inventory.md`.
5. Produce `03-anton-surfaces-by-pillar.md`.
6. Produce `04-companion-app-surfaces.md`. This is the most important single deliverable — the Companion App is the primary target for the first Claude Design iteration.
7. Produce `05-functional-map.md`.
8. Produce `06-screenshot-capture-list.md` last, once all other surfaces are catalogued.
9. Finalise `00-README.md` with the actual file list, version stamp, and handoff instructions.

---

## 5. Acceptance Criteria

- `design-export/` folder exists at repo root with all seven files listed above.
- Every surface referenced has a source path. No surfaces invented.
- Design tokens match what is actually in the codebase — no normalisation, no cleanup, no aspirational values.
- Light mode is clearly flagged as the extraction baseline throughout.
- Companion App surfaces are fully separated from main ANTON surfaces.
- Specced-but-not-yet-built pillars are clearly marked as such — Claude Design must not be misled about current state.
- No ANTON source code has been modified. This task is pure extraction.
- Final README tells Daniel exactly what to do next (take screenshots per checklist, bundle with this folder, upload to Claude Design).

---

## 6. What NOT to do

- Do not modify any file in `src/`. Read-only extraction.
- Do not invent design tokens, components, or surfaces that don't exist in the codebase.
- Do not cleanup / harmonise inconsistencies. Document them as-is. Claude Design is the place to propose improvements, not this extraction.
- Do not duplicate existing documentation — if `docs/DESIGN.md` or similar exists, reference and extend, never copy.
- Do not include dark mode tokens as the primary baseline. Light mode is the target for the first Claude Design iteration.
- Do not include backend architectural detail that has no UI surface. The functional map is about **what a user sees**, not what ANTON does internally.

---

## 7. Handoff (what Daniel does next)

Once Claude Code completes this brief, Daniel will:

1. Open each surface listed in `06-screenshot-capture-list.md` in the ANTON app.
2. Confirm light mode is active.
3. Capture screenshots per the checklist, saving them into `design-export/screenshots/` with the suggested filenames.
4. Upload the entire `design-export/` folder (markdown files + screenshots) to Claude Design as onboarding material.
5. Optionally point Claude Design at the ANTON codebase directly (once the exact import mechanism is confirmed — likely via the Claude Code bridge).
6. Begin prototyping the first Companion App iteration, then move to per-pillar iterations.

---

## 8. Notes for future addenda

If this brief needs extending, do it via numbered addenda at the bottom of this file. Do not rewrite Sections 1–7. Addendum format:

```
## Addendum A (YYYY-MM-DD) — [short title]
[content]
```

Typical reasons to add an addendum:
- New pillar added to the codebase that needs a new surface section in 3.4.
- Change to the Companion App scope that affects 3.5.
- Claude Design UX feedback that requires a different extraction shape.
- New screenshot requirements after first iteration with Claude Design.
