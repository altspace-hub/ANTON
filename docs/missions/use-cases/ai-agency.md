# AI Agency

> **Template id:** `tmpl_ai_agency_v1`
> **Status:** ✅ seeded (Phase 3)
> **Pillar:** Work · **Category:** agency · **Author:** ANTON

---

## What it does

Build the operating system for a productized AI service offering: refine your offering → client intake script → SOW template → delivery playbook with quality gates → reporting cadence → invoicing + payment terms → client expansion plan. v1 delivers the full playbook bundle.

## Who it's for

- A solo operator or 2–5 person team running an AI / advisory / fractional service.
- A consultant moving from hourly billing to productized engagements.
- A new agency founder who needs the operating system, not just the marketing site.

Not for: large agencies with established ops (you have an EOS / Traction system already); or pure-creative agencies (this is templated for AI / advisory / professional-services delivery patterns).

## The workflow

| # | Task | Type | Tokens (est.) | Notes |
|---|---|---|---|---|
| 1 | **Refine service offering** | LLM | 5,000 | Positioning, scope inclusions / exclusions, deliverable spec, value claim |
| 2 | **Client intake script** | analysis | 6,000 | 45-min discovery + qualification call structure |
| 3 | **SOW / proposal template** | LLM | 8,000 | Adapted to pricing_model |
| 4 | **Delivery playbook** | analysis | 10,000 | Phase-by-phase with quality gates + client touchpoints |
| 5 | **Checkpoint — review foundation** | checkpoint | 0 | Human gate before billing + expansion |
| 6 | **Reporting + comms cadence** | LLM | 4,000 | Weekly / mid-engagement / closeout templates |
| 7 | **Invoicing + payment template** | LLM | 4,000 | Invoice, terms, late-payment cadence |
| 8 | **Client expansion plan** | analysis | 5,000 | Retainer conversion, referrals, retention triggers |
| 9 | **Final checkpoint — sign off** | checkpoint | 0 | Human approves operating model |
| 10 | **Deliver playbook bundle** | notification | 0 | Mission Inbox + first-engagement checklist |

Total estimated active time: ~3 hours. Total elapsed (with checkpoints): up to 30 days.

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **Service offering** | yes | What you sell — be specific about engagement format + pricing |
| **Target client profile** | yes | Who you serve — size, stage, sector, decision-maker role |
| **Pricing model** | yes | `fixed_fee`, `hourly`, `retainer`, or `value_based` |
| **Delivery window** | yes | Standard engagement length in days |
| **Team size** | no | Default 1; > 1 triggers handoff specs in delivery playbook |

No credentials needed for v1.

## Outputs delivered

A complete agency operating system (Markdown) containing:
1. Refined offering (positioning + scope + deliverable + value claim)
2. Client intake script (45-min call structure + 8 specific questions + disqualification criteria)
3. SOW / proposal template (adapted to pricing model)
4. Delivery playbook (phase-by-phase with quality gates)
5. Reporting cadence (weekly / mid-engagement / closeout)
6. Invoicing + payment template (terms + late-payment escalation)
7. Client expansion plan (retainer conversion + referrals + retention)
8. First-engagement implementation checklist

Delivered to Mission Inbox.

## Trust-phase compatibility

Designed for **trust phase 3+**. Two hard checkpoints — mid-build (foundation review) and final (sign-off) — both required.

## Budget

| Setting | Value |
|---|---|
| Token budget | 700,000 max |
| Time budget (elapsed) | 30 days |
| Time budget (active) | 3 hours |
| Default autonomy | `check_in` |

## Success criteria

1. Specific to the supplied offering — generic templates unacceptable
2. Gives the operator a runnable system from first contact through engagement closeout
3. Covers the boring-but-critical parts (invoicing, late-payment, scope-creep) as carefully as the work itself

## A real example

Run this mission with:
- **Service offering:** "Local-first AI deployment for compliance teams — 4-week engagement, fixed-fee €15k, deliverable = configured ANTON instance + Risk Atlas + 2-day team training"
- **Target client profile:** "€1–10bn Nordic banks + CASPs, compliance lead as decision-maker, urgency triggered by AMLR enforcement"
- **Pricing model:** `fixed_fee`
- **Delivery window:** 28
- **Team size:** 1

Expected output: complete operating system from positioning through invoicing, scoped to a solo operator running fixed-fee compliance-AI engagements.

---

## Where to look

- **Code:** `server/services/missions/seed-templates.ts` (search `AI_AGENCY_TEMPLATE`)
- **Catalogue UI:** `/missions/catalogue` → "AI Agency"
- **Roadmap:** v2 = client-handover Service Pack (DocuSign / HelloSign for SOW signing, Stripe for invoice payment)
