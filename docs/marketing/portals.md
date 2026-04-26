# Portals — One-Pager

> **What it is:** ANTON's universal public surface. Every portal is simultaneously a human-readable site and a machine-readable AAP endpoint.
> **Who it's for:** anyone whose AI workflow needs to reach the public web — consultancies publishing knowledge packs, businesses fronting AI capabilities, deliberation hosts, recruiters, marketplaces.
> **What makes it different:** instead of building a marketplace stack, then a recruitment stack, then a deliberation stack, then a knowledge-pack catalogue, you build one stack — Portals — and configure each as a category.

---

## The architectural insight

Most platforms ship distinct stacks for distinct public surfaces:

- A marketplace builder for sales
- A deliberation hub for collaboration
- A candidate site for recruitment
- A knowledge-pack catalogue for sharing

Each one needs the same five things: registration, discovery, content delivery, capability negotiation, signed audit trails. Each one builds them from scratch. Each one diverges over time.

ANTON collapsed those five concerns into one substrate called **Portals**. A "deliberation portal" and a "recruitment portal" are now the same primitive with different `category` configurations and different capability descriptors. The walkthrough that builds one builds them all. The discovery that finds one finds them all. The signing that signs one signs them all.

This is the category-defining architectural idea.

---

## What you can do with Portals

| Goal | Portal category |
|---|---|
| Publish a curated regulatory-knowledge-pack library | `knowledge-pack-library` |
| Host a multi-peer deliberation session as a public artefact | `deliberation` |
| Run a marketplace listing | `marketplace-listing` |
| Stand up a candidate / recruitment surface | `talent` |
| Front an existing third-party site (Wix / Squarespace) with ANTON-signed metadata | `general` + `surface_mode='external'` |
| Expose pure machine capabilities to AAP peers | `anton-portal` |
| Share a signed evidence pack with a regulator | `evidence-pack-share` |
| Stand up a humanitarian / NGO field portal | `humanitarian` |

Each one is the same plumbing — a different category + a different capability descriptor.

---

## How peer ANTONs find you

Portals interoperate over the **ANTON Agent Protocol (AAP)** ([`/docs/aap/wire-format-v1.md`](../aap/wire-format-v1.md)). A peer ANTON discovers your portal via the registry protocol:

1. Your portal publishes a signed descriptor to the registry (`registry-protocol/operations/register`).
2. A peer ANTON's Pathfinder fetches your descriptor (cached client-side).
3. Pathfinder validates the signature against your contact-hash → pubkey mapping.
4. Pathfinder negotiates capabilities — what verbs you expose, what schemas they take.
5. The peer invokes a capability; your portal responds.
6. Both sides log the invocation as a signed trail entry.

Result: an AI on another instance can discover, verify, and use your portal — without humans being on a call.

---

## How humans find you

Three paths:

1. **Direct URL** — `/portals/p/<slug>` is the canonical visitor URL.
2. **Discovery surface** — `/portals/discovery` lets humans browse by category, recency, popularity.
3. **Pathfinder** — natural-language search ("find me a regulator-friendly AML pack") returns ranked portals with confidence scores.

---

## Why this matters strategically

The next decade of AI-on-the-web is going to look like a hundred half-built marketplace stacks, each with their own auth, their own discovery, their own listing schema. ANTON skipped that future by deciding once: **public surfaces are a primitive, not a per-feature build**.

Every capability ANTON ships next — a new pillar, a new tool, a new collaborative mode — gets a public surface for free. That's the compounding advantage Portals provides.

---

## Where to look

- **Try it:** `/portals` (visitor home), `/portals/build` (start your own).
- **Code:** `server/services/portals/` (16 services), `server/routes/portals.ts`.
- **Docs:** [`/docs/portals/`](../portals/) — README, portal-types, registry-protocol, capability-descriptor, extending.
- **Architecture:** [`/docs/architecture/33-portals-pathfinder.md`](../architecture/33-portals-pathfinder.md).
- **Bundle format:** `portal` is bundle type #41 — a complete portal travels between ANTON instances as a signed `.anton` archive. See [`/docs/anton-format/types/portal.md`](../anton-format/types/portal.md).

---

*Document maintained alongside the Portals service tree. Refresh when a new portal category ships, when a new strategic positioning emerges, or when the absorbed-concept boundary shifts.*
