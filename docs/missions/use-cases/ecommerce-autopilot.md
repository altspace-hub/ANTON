# E-Commerce Autopilot

> **Template id:** `tmpl_ecommerce_autopilot_v1`
> **Status:** ✅ seeded (Phase 3)
> **Pillar:** Work · **Category:** commerce · **Author:** ANTON

---

## What it does

Audit your current e-commerce setup → produce a listing-optimisation plan → ad-spend recommendation → inventory-health review → order-ops runbook → reporting cadence. v1 delivers the operating model for manual execution. v2 (planned) integrates Shopify / Amazon / Etsy Service Packs for direct listing + ad-spend management.

## Who it's for

- A solo founder running a Shopify or Etsy store who needs a structured operating model instead of ad-hoc tactics.
- A small e-commerce team rationalising their playbook across SKUs and channels.
- A consultant doing a 1-week e-commerce diagnostic for a client.

Not for: large enterprise e-commerce (the playbook is generalist; large operations need specialist tooling); or single-product launches (use a launch playbook instead).

## The workflow

| # | Task | Type | Tokens (est.) | Notes |
|---|---|---|---|---|
| 1 | **Current-state audit** | LLM | 6,000 | Per focus area: quick-wins + structural improvements |
| 2 | **Listing optimisation plan** | analysis | 8,000 | Titles, descriptions, imagery, SEO, pricing |
| 3 | **Ad-spend recommendation** | LLM | 5,000 | Channel mix + budget bands + KPIs |
| 4 | **Inventory + order-ops** | analysis | 7,000 | Stocking patterns + returns / complaints / disputes |
| 5 | **Checkpoint — review plan** | checkpoint | 0 | Human gate before reporting cadence |
| 6 | **Reporting cadence spec** | LLM | 4,000 | Daily / weekly / monthly dashboards |
| 7 | **Final checkpoint — sign off** | checkpoint | 0 | Human approves full bundle |
| 8 | **Deliver operating model** | notification | 0 | Mission Inbox + first-30-days checklist |

Total estimated active time: ~3 hours. Total elapsed (with checkpoints): up to 30 days.

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **Store platform** | yes | `shopify`, `amazon`, `etsy`, `woocommerce`, `tiktok_shop`, `multi` |
| **Catalog description** | yes | Categories, top SKUs, price range, differentiators |
| **Markets served** | yes | Geographies — drives tax / shipping / compliance |
| **Focus areas** | yes | Comma-separated: listing-optimisation, ad-spend, inventory, order-ops, returns, customer-service |
| **Monthly revenue** | no | For ad-spend prioritisation only |

No credentials needed for v1. v2 will integrate platform APIs (Shopify Admin, Amazon SP-API, Etsy API) for direct listing updates and ad-spend management.

## Outputs delivered

A complete operating model (Markdown) containing:
1. Current-state audit per focus area
2. Listing-optimisation plan (titles / descriptions / imagery / SEO / pricing per SKU pattern)
3. Ad-spend recommendation (channel mix + budget bands + 4 KPIs to watch)
4. Inventory health framework
5. Order-ops playbook (returns / refunds / complaints / disputes)
6. Reporting cadence (daily / weekly / monthly dashboards with thresholds)
7. First-30-days implementation checklist

Delivered to Mission Inbox.

## Trust-phase compatibility

Designed for **trust phase 4**. Two checkpoints are hard-coded — both the mid-plan review and the final sign-off must clear human review.

## Budget

| Setting | Value |
|---|---|
| Token budget | 700,000 max |
| Time budget (elapsed) | 30 days |
| Time budget (active) | 3 hours |
| Default autonomy | `check_in` |

## Success criteria

1. Grounded in the platform + market constraints supplied (no platform-agnostic advice)
2. Addresses every requested focus area with both quick-wins and structural moves
3. Specific enough that the operator can execute without re-thinking

## A real example

Run this mission with:
- **Store platform:** `multi` (Shopify + Etsy)
- **Catalog description:** "Handmade ceramics — 40 SKUs, €25–180 price range, 5 collections / year, mostly retail"
- **Markets:** "EU + UK + US"
- **Focus areas:** `listing-optimisation,ad-spend,inventory,order-ops`
- **Monthly revenue:** 18000

Expected output: cross-channel listing playbook (titles + photo briefs per collection), €600/mo ad-spend starter allocation across Meta + Etsy Ads + Pinterest, inventory reorder framework keyed to collection cadence, order-ops runbook in matching brand voice, and a weekly + monthly reporting spec.

---

## Where to look

- **Code:** `server/services/missions/seed-templates.ts` (search `ECOMMERCE_AUTOPILOT_TEMPLATE`)
- **Catalogue UI:** `/missions/catalogue` → "E-Commerce Autopilot"
- **Roadmap:** v2 = Shopify / Amazon / Etsy Service Pack for direct listing + ad management
