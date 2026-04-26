# Extending Portals

> How to add a new portal type, a new walkthrough phase, or a new capability handler. Stays inside the Portals stack — the unification is the point.

---

## Add a new portal category

1. **Pick the category id.** Kebab-case, ≤ 32 chars, namespaced if appropriate (`marketplace-` / `talent-` / etc.).
2. **Add a row** to `docs/portals/portal-types.md` with the canonical sub-type table — one-line semantics + which services back it.
3. **No new top-level stack.** The whole point of Portals is that each new public surface reuses the existing render / discovery / capability / signing pipeline. If you find yourself wanting a new top-level service tree, ask whether the category really exists OR whether it's an orthogonal feature (a new bundle type, a new pillar) instead.
4. **If the category needs new schema** — add a migration that defaults safely for existing portals (NULL or a sensible default).
5. **If the category needs a new visitor render** — extend `portal-handler.ts` (and maybe `portal-renderer.ts`). Use category-keyed dispatch, not a parallel renderer.
6. **If the category needs new capability verbs** — go through the verb-extension process in [`capability-descriptor.md`](capability-descriptor.md). The bar is high; prefer composing existing verbs.
7. **Update the architecture diagram** [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md).

---

## Add a new walkthrough phase

The 8-phase walkthrough is in `portal-walkthrough-templates.ts`. To add a phase:

1. Define the phase in `portal-walkthrough-templates.ts` — id, label, prompts, validators, expected outputs.
2. If the phase needs LLM suggestions, add a prompt template in `portal-llm-suggest.ts`.
3. Update the phase order in `portal-walkthrough-engine.ts`.
4. Update [`/docs/portals/README.md`](README.md) — the phase count + table.

Phases must be additive — existing in-progress walkthroughs (rows in `portal_walkthrough_sessions`) need to migrate cleanly to the new phase order.

---

## Add a new capability handler

Capability handlers live in `server/services/capability-descriptor/verbs/`. To add a handler for an existing verb:

1. Create `verbs/<verb-name>/<handler-name>.ts`.
2. Implement the handler signature: `async (portalId, args, context) => Promise<ResponseShape>`.
3. Register it in the verb's index file.
4. The portal owner can then expose this handler via `portal-capabilities-editor.ts` on `/portals/:id/manage`.

To add a handler for a NEW verb — see the verb-extension process in [`capability-descriptor.md`](capability-descriptor.md). Adding a verb requires updating the wire-format spec at [`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md).

---

## Add a new starter pack template

The 7 starter portal templates ship in `starter-pack-service.ts`. To add an 8th:

1. Define the template in `starter-pack-schema.ts` — id, name, category, default pages, default capabilities.
2. Register it in `starter-pack-service.ts` `LISTED_TEMPLATES`.
3. Add a preview asset (screenshot or icon) under `data/portal-templates/`.
4. Refresh the visitor-side catalogue UI at `src/pages/portals/PortalsTemplateGalleryPage.tsx`.

---

## Modify the registry protocol

The registry protocol (`server/services/registry-protocol/`) is **versioned** — `schema_version` field on every payload. Any wire-incompatible change must:

1. Bump `schema_version` (currently 1).
2. Implement BOTH versions in `validator.ts` for at least one minor release so peers running the prior version don't immediately break.
3. Document the change in [`/docs/portals/registry-protocol.md`](registry-protocol.md) and [`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md).

Backwards-incompatible changes without a deprecation window break every paired ANTON instance — high blast radius.

---

## Anti-patterns to avoid

- **Don't fork render logic per category.** Use category-keyed dispatch within `portal-handler.ts`. Two parallel renderers means two divergent surfaces.
- **Don't add capabilities outside the 12-verb taxonomy** without going through the extension process. Closed taxonomy is what makes interop tractable.
- **Don't bypass signing.** Every published portal descriptor must travel through the registry-protocol envelope. An unsigned descriptor can't be discovered by peers.
- **Don't mix manageed + external surface modes for the same portal.** If you need both, that's `surface_mode='hybrid'` — a deliberate state, not an accidental one.

---

*Maintained alongside the Portals service tree. Refresh when the extension process changes.*
