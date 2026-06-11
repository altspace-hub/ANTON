# Extending the `.anton` Format

> **Audience:** open-source contributors and integration partners adding a new bundle type.
> **Owner of the format:** `server/services/anton-bundler.ts` (the `BundleType` union and `BUNDLE_REGISTRY` map). All other documentation is downstream.

---

## When to add a new bundle type

Add a new type when you need to **transport a coherent unit of work between ANTON instances** and none of the existing 46 types fits. Don't add a type for:

- Anything that's a single document (use `evidence-pack` with attachments).
- Anything pillar-internal that never leaves the instance (use the pillar's tables).
- Anything ephemeral (use a session message).

A good test: would I want a peer ANTON to be able to import and apply this without me being on the call?

---

## The seven steps

### 1. Add the type to the `BundleType` union

`server/services/anton-bundler.ts`:

```ts
export type BundleType =
  | 'module'
  | 'skill'
  // … existing types …
  | 'my-new-bundle-type';   // ← new
```

### 2. Add an entry to `BUNDLE_REGISTRY`

```ts
export const BUNDLE_REGISTRY: Record<BundleType, BundleMeta> = {
  // …
  'my-new-bundle-type': {
    label: 'My New Bundle Type',
    description: 'One-line purpose. Avoid jargon.',
    contentsKey: 'my_new_things',          // singular_plural snake_case
    primaryContentDir: 'my-new-things',    // ZIP subdir name
  },
};
```

### 2b. Write the manifest through `buildSpecManifest()` — non-negotiable

The manifest envelope is the contract (`docs/anton-format/README.md`). Your
bundler MUST call `buildSpecManifest({ bundleType, id, name, … })` from
`server/services/anton-bundler.ts` and may spread bespoke fields **alongside**
the returned envelope — never replace it:

```ts
const manifest = {
  ...buildSpecManifest({
    bundleType: 'my-new-bundle-type',
    id: thingId,
    name: thing.title,
    contentsCount: { my_new_things: 1 },
    governance,            // optional KP-03 trust metadata — never fabricate
  }),
  // bespoke per-type fields here
};
```

This guarantees `format_version`, `bundle_type`, `created_at`, `generator`,
`package`, `contents`, `compatibility` and (optionally) `governance` are
present, which is what lets the dispatching validator
(`/api/exchange/validate`) structurally accept your type with zero extra work.

### 3. Implement the apply path

`server/services/anton-importer.ts` (or a new `*-importer.ts` if the bundle is large):

```ts
async function applyMyNewBundle(db: DatabaseAdapter, contents: BundleContents) {
  // Validate per-type contents schema.
  // Insert/update the relevant tables.
  // Write a row to the bundle-import audit log.
}
```

### 4. Implement the build path

`server/services/anton-bundler.ts` `buildBundle()` — add a case that knows how to lay out the contents directory for your type.

### 5. Add a per-type doc page

Create `docs/anton-format/types/my-new-bundle-type.md` from the template at the bottom of this file. Cross-link from the index (`docs/anton-format/README.md`).

### 6. Add an example payload

Drop an example at `data/examples/my-new-bundle-type.example.anton` (or in a more pillar-specific location). The G.4 narrative-opportunities scan looks for examples — if you don't ship one, you'll appear as an "under-documented bundle type" in the next monthly audit.

### 7. Refresh the architecture diagram

Update `/docs/architecture/32-anton-bundle-format.md`:

- Bump the count in the title (currently "46 bundle types"). 
- Add the new type to the family table.
- Refresh the *Source-of-truth references* section.

---

## Per-type doc-page template

```markdown
# `<bundle-type-id>` — `<Label>`

> **Family:** <work-pillar core / coding / governance / school / knowledge / markets / network / risk-atlas / hardware / portals / compliance / misc>
> **Purpose:** One-sentence summary.
> **Typical transport:** AAP / Marketplace / Local / Companion-App-Gateway / multiple.

## Content directory layout

\`\`\`text
contents/<primary-content-dir>/
  ├── <required files>
  └── <optional files>
\`\`\`

## Apply behaviour

When this bundle is imported, the receiver will:

1. <action>
2. <action>

Conflicts with existing data are resolved by <strategy>.

## Signing requirements

<unsigned ok / signature required / signature required + verifying-key cross-check>

## Example payload

[Link to example or inline minimal example.]

## Related

- Service: `server/services/<owner-service>.ts`
- Tables: `<table_1>`, `<table_2>`
- Architecture diagram: [Link to relevant `/docs/architecture/` file.]
```

---

## Anti-patterns to avoid

- **Don't reinvent existing transport.** `evidence-pack` already exists; if you find yourself wanting to pack signed audit material, use it.
- **Don't bundle huge attachments inline.** Reference external URIs where appropriate; bundles are for portable, durable units, not for shipping gigabytes.
- **Don't forget the receiver.** Half the work is the apply path. A bundle that builds but doesn't apply isn't shipped.
- **Don't skip the example.** The next monthly G.4 narrative-opportunities scan will surface your type as un-exemplified, and someone will either delete it (per "delete or document" rule) or you'll have to write the example then anyway.

---

*This guide complements `docs/anton-format/README.md` (the canonical 46-type index) and `/docs/architecture/32-anton-bundle-format.md` (the lifecycle diagram).*
