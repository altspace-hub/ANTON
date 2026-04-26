# Portal Sub-Types

Every portal carries a `category` field (NOT NULL on the `portals` table per migration 145). That field selects which sub-type of public surface the portal is. Categories are not a fixed enum at the SQL level — they're conventional strings so contributors can extend them — but the canonical set below is what the visitor / discovery / Pathfinder surfaces understand today.

## The canonical set (post-D.5)

| Category | Public surface | What it is | Backing services |
|---|---|---|---|
| **`general`** | `/portals/p/:slug` standard render | The default — a free-form portal anyone can build via the 8-phase walkthrough | core portal services |
| **`marketplace-listing`** | `/portals/p/:slug` + `/marketplace` discovery slice | A commerce listing — the v0.7+ implementation replaces the stand-alone Marketplace stack | core + `marketplace_visitor` (mig 163) |
| **`talent`** | `/jobs` discovery + `/portals/p/:slug` profile | Talent profile (org-side or candidate-side). Pairs with the `career-profile` bundle. | core + `career-profile.ts` + `jobs_candidate_side` (mig 162) |
| **`knowledge-pack-library`** | `/portals/p/:slug` with structured pack catalogue | Curated `.anton regulatory-knowledge-pack` collection — published by a consultancy, regulator, or trade body | core + `knowledge-pack-service` |
| **`deliberation`** | `/portals/p/:slug` + Beehive workspace deep-link | Multi-peer Beehive session published as a portal so the deliberation has a public address. *Status: Addendum 1 §E.6 in progress.* | core + `beehive-*` services |
| **`anton-portal`** *(Pathfinder)* | machine-only — no human render | Pure capability surface for AAP peers. Discovered + invoked by Pathfinder's `anton-portal` mode (`pathfinder-engine.ts`). | core + `pathfinder-engine.ts` |
| **`evidence-pack-share`** | `/portals/p/:slug` + viewer | Read-only signed view of an evidence pack for regulator / external auditor sharing | core + `evidence-pack-*` |
| **`humanitarian`** | `/portals/p/:slug` | Public-facing portal for humanitarian / NGO deployments — surfaces deployment kit + curricula | core + `humanitarian-deployment-kit` bundle |

## Surface modes

Each portal additionally carries a `surface_mode` column (added in mig 167):

| Surface mode | Meaning | Use |
|---|---|---|
| `managed` (default) | ANTON renders the portal pages | Walkthrough-built portals |
| `external` | Portal points at a third-party URL ANTON owner already runs | Bring-your-own-site mode (existing Wix/Squarespace/etc. site fronted by ANTON's signed metadata) |
| `hybrid` | ANTON renders some pages; an external URL handles others | Migration paths (e.g. moving from external to managed gradually) |

The `external-url-verifier.ts` service confirms the external URL is reachable + matches the portal's claimed identity.

## Adding a new category

If you find a coherent public surface that doesn't fit any of the above:

1. Pick a kebab-case category id.
2. Add a row to the table above with one-line semantics.
3. If the category needs new schema, add a migration that backfills `category` defaults safely.
4. If the category needs new visitor render logic, extend `portal-handler.ts` (NOT a parallel stack — the unification is the point).
5. If the category needs new capability verbs, register them in `capability-descriptor/verbs/`.
6. Update [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md).

The "extend, don't fork" rule is hard. A new top-level Marketplace or Recruitment stack is what Portals exists to prevent.

## Relationship to bundle types

Each portal type maps to a sub-type of the `portal` `.anton` bundle (#41 in the union). The bundle's `manifest.json` carries the category; recipients can decide whether to import based on the category they're prepared to host.

| Bundle sub-type | Portal category |
|---|---|
| `portal:general` | `general` |
| `portal:marketplace-listing` | `marketplace-listing` |
| `portal:talent` | `talent` |
| `portal:knowledge-pack-library` | `knowledge-pack-library` |
| `portal:deliberation` | `deliberation` |
| `portal:anton-portal` | `anton-portal` (machine-only) |
| `portal:evidence-pack-share` | `evidence-pack-share` |
| `portal:humanitarian` | `humanitarian` |

See [`/docs/anton-format/types/portal.md`](../anton-format/types/portal.md) for the complete bundle format.

---

*Refresh when a new portal category ships or when the surface-mode enum extends.*
