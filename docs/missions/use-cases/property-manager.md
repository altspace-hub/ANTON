# Property Manager

> **Template id:** `tmpl_property_manager_v1`
> **Status:** ✅ seeded (Phase 3)
> **Pillar:** Work · **Category:** real-estate · **Author:** ANTON

---

## What it does

Stand up a property-management operating model: portfolio audit → listing templates → tenant comms playbook → maintenance triage rubric → rent collection workflow → compliance register → vendor management. v1 delivers the playbook bundle. v2 (planned) will integrate property-management platforms for direct tenant comms + maintenance routing.

## Who it's for

- An owner-manager of 5–50 residential units who needs a system that scales beyond the spreadsheet phase.
- A small short-term rental operator (Airbnb / Booking) standardising guest comms + maintenance.
- A small commercial portfolio operator rationalising tenant comms + compliance reminders.

Not for: large institutional portfolios (use a specialist PMS like AppFolio); or single-unit Airbnb hosts (overkill — use a single-shot module).

## The workflow

| # | Task | Type | Tokens (est.) | Notes |
|---|---|---|---|---|
| 1 | **Portfolio audit** | LLM | 5,000 | Operational profile + 3 biggest risks + quick-wins |
| 2 | **Listing template pack** | analysis | 6,000 | Per unit type: headline / description / photo brief / pricing |
| 3 | **Tenant comms playbook** | LLM | 8,000 | Lifecycle templates: onboarding → renewal → complaints → move-out |
| 4 | **Maintenance triage rubric** | analysis | 5,000 | Severity bands + vendor routing + SLA targets |
| 5 | **Checkpoint — review core model** | checkpoint | 0 | Human gate before billing + compliance |
| 6 | **Rent collection workflow** | LLM | 5,000 | Invoice cadence + D+0 to D+30 late-payment escalation |
| 7 | **Compliance + risk register** | analysis | 4,000 | Fire / gas / electrical / insurance / local-authority reminders |
| 8 | **Vendor management** | LLM | 4,000 | Sourcing / onboarding / job-card / performance-review templates |
| 9 | **Final checkpoint — sign off** | checkpoint | 0 | Human approves operating model |
| 10 | **Deliver playbook bundle** | notification | 0 | Mission Inbox + first-90-days checklist |

Total estimated active time: ~3 hours. Total elapsed (with checkpoints): up to 30 days.

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **Portfolio size** | yes | Number of units / properties |
| **Unit types** | yes | `residential`, `commercial`, `short_term_rental`, or `mixed` |
| **Jurisdiction** | yes | Where the properties are — drives compliance register |
| **Tenant comms channel** | yes | `email`, `sms`, `app`, or `mixed` |
| **Pain points** | no | What's hardest right now — drives where the playbook leans |

No credentials needed for v1.

## Outputs delivered

A complete property-management operating model (Markdown) containing:
1. Portfolio audit (operational profile + risks + quick-wins)
2. Listing templates per unit type
3. Tenant comms playbook (lifecycle templates + SLA targets)
4. Maintenance triage rubric (severity bands + vendor routing)
5. Rent collection workflow (invoice + late-payment escalation cadence)
6. Compliance + risk register (jurisdiction-aware statutory obligations)
7. Vendor management playbook (sourcing + onboarding + performance reviews)
8. First-90-days implementation checklist

Delivered to Mission Inbox.

## Trust-phase compatibility

Designed for **trust phase 4**. The compliance register section explicitly acknowledges its knowledge-cutoff limits — the operator must confirm any regulatory specifics against current local law. Two hard checkpoints.

## Budget

| Setting | Value |
|---|---|
| Token budget | 700,000 max |
| Time budget (elapsed) | 30 days |
| Time budget (active) | 3 hours |
| Default autonomy | `check_in` |

## Success criteria

1. Addresses every lifecycle phase from listing to move-out
2. Keyed to the supplied jurisdiction with honest acknowledgement of regulatory-currency limits
3. Gives the operator runnable templates rather than generic principles

## A real example

Run this mission with:
- **Portfolio size:** 18
- **Unit types:** `residential`
- **Jurisdiction:** "Sweden — Stockholm + Göteborg"
- **Tenant comms channel:** `email`
- **Pain points:** "Maintenance backlog. No standard process for late rent. Compliance register lives in my head."

Expected output: a complete operating model tailored to mid-portfolio Swedish residential management, with specific reference to Hyreslagen / Hyresnämnden timelines for rent disputes and a jurisdictional compliance register covering brandsynsprotokoll, OVK, energideklaration etc.

---

## Where to look

- **Code:** `server/services/missions/seed-templates.ts` (search `PROPERTY_MANAGER_TEMPLATE`)
- **Catalogue UI:** `/missions/catalogue` → "Property Manager"
- **Roadmap:** v2 = property-management platform Service Pack (Buildium / AppFolio / Booqable) for direct tenant comms + maintenance routing
