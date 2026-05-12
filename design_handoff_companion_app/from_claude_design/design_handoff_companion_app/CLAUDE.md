# Claude Code — read this first

You are integrating the **ANTON Companion App** redesign into an existing React + TypeScript + Tailwind codebase. The existing repo structure (\`App.tsx\`, \`pages/\`, \`components/\`, \`services/\`, \`app.css\`, \`index.html\`, \`main.tsx\`) is your target. The designs in this bundle are **primary** — where the existing code disagrees with the new designs, update the existing code.

## Your job, in order

1. **Read \`README.md\`** in full. It has the complete brief, tokens, screens, interactions, and implementation order.
2. **Open \`Companion App.html\`** in a browser to see every screen in situ across the full canvas. Use it as visual ground truth.
3. **Treat \`design/tokens.jsx\` as the source of truth for colour, type, radii, spacing.** Port it to Tailwind config + CSS variables in \`app.css\`. Delete conflicting dark-theme tokens (\`adv-*\`) — the new design is light-theme, warm-linen canvas.
4. **Treat \`design/primitives.jsx\` as the source of truth for shared components** (Btn, Pill, Card, SectionLabel, Dot, TopBar, BottomTabs, PhoneBG, Ico). Port them verbatim to \`components/ui/\` — do not substitute for external libraries (lucide-react, headlessui, etc.) unless you replicate the exact stroke-width and rounding.
5. **Treat \`design/screens-*.jsx\` as the source of truth for each screen's layout and copy.** These are in plain React JSX. Recreate each one in the corresponding \`pages/*.tsx\`, adapting inline-styles to Tailwind classes and replacing the \`tok\` prop with tokens resolved from context.
6. **Do not ship the HTML/JSX files themselves.** They are references. Your output is TypeScript React in the existing file tree.

## Non-negotiables

- **Light theme only** for v1. Drop the existing \`dark\` / \`corporate\` branches of \`services/theme.ts\` unless the user explicitly asks to keep them.
- **Status colours (red/gold/green/blue) are locked** — they never change with the user's personal accent. Enforce at token level.
- **Personal accent** is a runtime swap across 8 presets (emerald default). Every primary button, live/pulse dot, accent-tinted surface, and section marker re-colours. Persist to \`localStorage\` key \`anton-companion-accent\`.
- **App mode toggle** (Pro ↔ Standard) persists to \`anton-companion-mode\`. Standard hides Work / Markets / Pathfinder / Horizon Radar tabs and uses bigger type + looser density. Same data, same accounts, same ANTON.
- **Mobile-first, 320 → 480 px**. All touch targets ≥ 44 px. Use \`safe-area-inset-*\` for top bars and bottom tabs. Horizontal rails scroll; nothing wraps.
- **Mono typography is reserved** for hashes, status codes, metadata rows, section labels, and numeric stats — not for body text. Inter is the primary face.
- **No illustrations, no emoji, no stock icons.** Use the \`Ico\` set from \`primitives.jsx\`. Empty states: icon + text.

## Backend stubs you'll need

The designs reference endpoints that may not exist yet. Stub them with fixture data matching the JSX demo, and mark \`TODO: wire to real API\`:

- \`GET /api/radar/items\`, \`POST /api/radar/scan\`, \`GET/PUT /api/radar/sources\`, \`GET/PUT /api/radar/terms\`
- \`GET /api/mail/unified\` (merges ANTON-native \`user@anton.<org>\` + configured providers)
- \`GET /api/calendar/unified\` (merges ANTON events + external)
- Markets / Pathfinder already partially exist — keep existing endpoints, extend where designs need more.

## Suggested commit cadence

1. Tokens + Tailwind config (one commit)
2. Primitives ported (one commit)
3. App shell + contexts (accent + mode) (one commit)
4. Home + TabBar in both Pro and Standard variants (one commit)
5. One module per commit: Horizon Radar, Markets, Pathfinder, Unified Mail, Unified Calendar, Work grid, School, Money
6. Auth + onboarding + accent picker (one commit)
7. Standard-mode screens (one commit)

## When in doubt

- **Layout / spacing / copy** → check \`design/screens-*.jsx\`.
- **Colours / radii / type** → check \`design/tokens.jsx\`.
- **Component API / variants** → check \`design/primitives.jsx\`.
- **What the whole thing looks like together** → open \`Companion App.html\`.
- **Why a design decision was made** → check \`context/\` (original design briefs and functional maps).

Ask the user before making destructive changes to files that aren't part of this redesign.
