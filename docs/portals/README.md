# Portals

> ANTON's universal public surface — every Portal is **simultaneously** a human-readable site and a machine-readable AAP endpoint.
> Portals absorb three previously-distinct concepts into one architectural primitive: **collaborative deliberation** (Beehive), **commerce** (Marketplace), and **public capability surfaces** (Recruitment, Talent, Knowledge-Pack libraries).
> The unifying insight: every public-facing artefact ANTON produces wants the same plumbing — registration, discovery, capability negotiation, content delivery, signed audit trails. Portals provides that plumbing once.

---

## Why Portals exist

Most platforms shipping AI capabilities to the public web reinvent the same surface for each: a marketplace builder for sales, a deliberation hub for collaboration, a candidate site for recruitment, a knowledge-pack catalogue for sharing. Each one needs:

- A registration model (who owns this surface, how is it identified?)
- Discovery (how do users / peer ANTONs find it?)
- Content delivery (how is HTML rendered? How is structured data served?)
- Capability negotiation (what can a peer do here? In what verb taxonomy?)
- Signed audit trails (who invoked what, when, with what attestation?)

Portals collapses these five concerns into one substrate. A "Beehive deliberation portal" and a "Recruitment portal" are now the same primitive with different `category` and capability-descriptor configurations.

This is the category-defining architectural idea that the v3 whitepaper missed. See `/docs/marketing/portals.md` for the strategic story.

---

## What's in this doc tree

| File | Audience | Purpose |
|---|---|---|
| `README.md` (this file) | everyone | Why Portals · the absorbed-concepts insight · index |
| [`portal-types.md`](portal-types.md) | contributors | The canonical list of portal sub-types currently supported |
| [`registry-protocol.md`](registry-protocol.md) | implementers | Canonical-JSON · envelopes · homoglyph defence — protocol used by both portals and bundle signing |
| [`capability-descriptor.md`](capability-descriptor.md) | implementers | What a capability descriptor declares · how peers negotiate · 12-verb taxonomy |
| [`extending.md`](extending.md) | contributors | How to add a new portal type |
| **External:** [`/docs/marketing/portals.md`](../marketing/portals.md) | strategic readers | The narrative for partners, board, investors |
| **External:** [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md) | architects | Architectural diagram + service tree |

---

## How Portals relates to the rest of ANTON

| Subsystem | Relationship |
|---|---|
| **AAP** ([`30-aap-protocol.md`](../architecture/30-aap-protocol.md)) | Portals travel between ANTON instances as `.anton portal` bundles signed via the AAP envelope format. Capability descriptors are the contract peers negotiate over. |
| **Pathfinder** ([`33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md)) | The `anton-portal` Pathfinder mode discovers + invokes portal capabilities — Portals provides the published surface, Pathfinder is the consumer. |
| **Marketplace** | A portal of `category='marketplace-listing'` is the v0.7+ implementation of marketplace listings. The dedicated "Marketplace" page is a portal-typed view, not a separate stack. |
| **Beehive** | A portal of `category='deliberation'` (per E.6 of `ANTON_Improvement_Brief_Addendum_1`) is how a multi-peer Beehive session publishes its results. Beehive-as-portal-type is the v0.8 framing. |
| **Recruitment / Talent** | A portal of `category='talent'` paired with a `career-profile` bundle is the surface for both job-seekers and hiring orgs. |
| **`.anton` bundle format** ([`32-anton-bundle-format.md`](../architecture/32-anton-bundle-format.md)) | `portal` is bundle type #41 — a complete signed portal bundle is portable between ANTON instances. |

---

## Service surface

Live in `server/services/portals/` (16 files) plus two specialised service trees:

| Service file | Responsibility |
|---|---|
| `portal-database-service.ts` | CRUD over the `portals` table |
| `portal-bundler.ts` | Build a `.anton portal` bundle from a portal row |
| `portal-handler.ts` | HTTP request handler for visitor-side rendering |
| `portal-renderer.ts` | HTML rendering of pages |
| `portal-search-engine.ts` | Local + cross-instance portal search |
| `portal-llm-suggest.ts` + `portal-prompt-enrichment.ts` | LLM-driven walkthrough suggestions |
| `portal-walkthrough-engine.ts` + `portal-walkthrough-templates.ts` | 8-phase guided portal builder |
| `walkthrough-depth.ts` | Depth controls (manual / guided / autonomous) for the walkthrough |
| `portal-capabilities-editor.ts` | Per-portal capability-descriptor editing |
| `portal-lan-discovery.ts` | mDNS-based LAN discovery of peer portals |
| `external-url-verifier.ts` | Bring-your-own-site reachability check |
| `starter-pack-service.ts` + `starter-pack-schema.ts` | 7 starter portal templates |
| `career-profile.ts` | Talent / mobility profile (consumed by talent-typed portals) |

Adjacent service trees:

- **`server/services/registry-protocol/`** — canonical-JSON (`canonical-json.ts`), envelope wrapping (`envelope.ts`), homoglyph defence (`homoglyph.ts`), and the operations sub-tree (`register`, `update`, `revoke`).
- **`server/services/capability-descriptor/`** — schema, builder, hash, signer, validator, plus a per-verb tree (`verbs/`).

---

## Schema

8 dedicated migrations (145–151 + 167 + 158 + 160). The shape:

| Migration | Concern |
|---|---|
| 145 | `portals` core table + indexes |
| 146 | `portal_pages`, `portal_assets`, `portal_structured_data` |
| 147 | `portal_capability_invocations` (the audit trail) |
| 148 | `portal_walkthrough_sessions` |
| 149 | Performance indexes |
| 150 | `portal_walkthrough_llm_calls` |
| 151 | `portal_lan_neighbors` |
| 158 | `portal_bookmarks` |
| 160 | `portal_category_associations` |
| 167 | `surface_mode` column (managed / external / hybrid) |

For the full ER + cross-references see [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md).

---

## The 8-phase walkthrough

Building a portal goes through eight guided phases. Per-phase walkthrough templates live in `portal-walkthrough-templates.ts`; the engine that orchestrates them is `portal-walkthrough-engine.ts`. Each phase emits suggestions via `portal-llm-suggest.ts` (LLM-backed) and persists the user's responses into `portal_walkthrough_sessions`.

The phases:

1. **Identify** — what is this portal *for*? (audience, purpose, scope)
2. **Brand** — name, palette, voice
3. **Structure** — pages + sub-pages
4. **Content** — fill the pages (manual or AI-assisted)
5. **Capabilities** — declare what AAP peers can do here
6. **Verify** — preview, fix, re-preview
7. **Sign + Register** — instance-key signature, then registration in the discovery layer
8. **Publish + Share** — visible at `/portals/p/<slug>`, discoverable via Pathfinder

---

## Where to start

- **Explore:** `/portals` (visitor home), `/portals/discovery` (browse), `/portals/p/:slug` (visit a portal).
- **Build:** `/portals/build` (start the walkthrough), `/portals/mine` (your portals).
- **Manage:** `/portals/:id/manage` (edit, capabilities, bundle).
- **Code:** `server/routes/portals.ts` is the REST entry; `server/services/portals/` is the implementation.

---

*Maintained alongside the Portals service tree. Refresh when the portal sub-types evolve, when registry-protocol changes, or when the walkthrough phase count changes.*
