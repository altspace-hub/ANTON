# Comm App i18n — deliberate deferral until v0.2

**Decision date**: 2026-05-12 (Phase 8 of the post-roadmap audit)
**Status**: Deferred. English-only at 0.1.0 ship.
**Reviewer**: Daniel Bardun
**Captured by**: post-audit Phase 8 (P8-6).

## What the audit asked

The 10-agent audit closed with "decide on i18n now or defer". The Comm App has ~350 user-facing strings sprinkled across React components. They're all currently hard-coded English literals. The Companion App and the main Workspace already have a 30-locale stack via `public/locales/*.json` + a `t()` runtime — pulling the Comm App into the same pattern is a 1–2 day mechanical task.

The decision is whether to do that work **now** (before the 0.1.0 ship) or **later** (when we know which markets the app actually lands in).

## What we decided

**Defer to v0.2 or later.** Ship 0.1.0 with hard-coded English. Revisit when the first non-English locale has a concrete user / market behind it.

## Why

1. **Premature locale split costs more than it saves.** Wiring i18n now means every string lands in `locales/en.json` immediately, every PR has to round-trip through that file, and every new feature pays a translation-key tax. If no non-English user materialises, that tax is pure overhead.
2. **The translation work is the long pole, not the framework.** Setting up `t()` is hours. Getting 30 locales translated to a quality bar a native speaker doesn't roll their eyes at is weeks. Without committed translator capacity, half-translated strings are *worse* than English-only.
3. **The audience for 0.1.0 is a known sample.** First users are Daniel's circle + early-adopter contacts who are comfortable with English. There's no compelling user signal that says "I'd use this if it were in language X".
4. **The Companion App stack is reusable when we do it.** `public/locales/*.json` + the surrounding tooling already exists in the parent repo. When we trigger i18n on the Comm App we'll lift, not invent.
5. **Reversibility cost is low.** Adding i18n later is mechanical replace-string-with-t-call. Removing a half-baked i18n setup is similarly mechanical. We're not making a one-way door.

## What signals would flip the decision

Watch for any of these in the first 90 days post-0.1.0:

- A specific user / market request: "I'd use this with my Swedish/German/Spanish/etc. family but only in their language."
- An organic surge from a region whose primary language isn't English (Play Console install heatmap).
- A regulatory or distribution requirement (e.g., a partner app store in a non-English market).

If any of those land, trigger the v0.2 i18n pass:

## How the v0.2 i18n pass would look (sketch, not a commitment)

1. **Audit strings**: `grep -rh 'placeholder=\|aria-label=\|>[A-Z][a-z]\+'` across `src/comm/` to inventory user-facing English.
2. **Lift the Companion App's t() stack**: copy the runtime + `public/locales/en.json` shape. Tailor key prefixes to `comm.*` so it doesn't collide with `companion.*` or `workspace.*` if we ever bundle them.
3. **Extract by surface, not by file**: do one screen at a time (chat, wassup, events, profile, …). Each surface lands as one PR.
4. **Seed locales**: start with EN + 2 priority languages identified by the signal above. Don't ship 30 placeholder locales — empty translations are worse than English fallbacks.
5. **Add a test**: a smoke test that loads each locale's JSON and asserts every key in `en.json` exists in the other locales (catches missing-translation drift).

Estimated effort: 1.5–2 dev-days for the scaffold + first-screen rollout, then ~0.5 dev-day per additional screen.

## Decision log

This file is the canonical record. If a future contributor asks "why isn't there an i18n layer here when the Companion App has one?", point them here. Don't add i18n without re-litigating the signals above; don't remove this file once we DO add i18n — append a "Status: superseded by …" line at the top instead.
