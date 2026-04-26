# CLAUDE.md — ANTON Web UX v2 handoff

You are implementing a redesign of the ANTON web application. Start by reading `README.md` in this folder — it has the full spec.

## Task

Recreate the HTML designs in `Web UX v2.html` (+ `web/*.jsx` source modules) inside the real ANTON web codebase, using its existing framework, component library, and design system.

## Priorities

1. **Shell components first** — `WSidebarV2`, `WTopbarV2`, `WRunHeader`, `WActionBar`, `WRailCard`, `WBreadcrumbs`. Every screen embeds inside them.
2. **Home combined** — editorial brief with toggleable right rail (Activity / Agent status).
3. **Sanctions Advisory full run** — run header, collapsible config panel, output + rail, bottom chat composer.
4. **Shell overlays** — ⌘K command palette, notifications dropdown, shortcuts overlay, collapsed sidebar state.

## Rules

- Treat the JSX files as **design references**, not production code. Use them for exact pixel values, tokens, copy, and state shape.
- Match colours / type / spacing from `web/web-tokens.jsx`. The design is high-fidelity.
- All three themes (light / dark / corporate) and all 8 accents must work.
- Sanctions settings panel is the densest UI — consider extracting each field as a reusable control since other modules will need similar config panels.
