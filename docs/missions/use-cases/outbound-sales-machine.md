# Outbound Sales Machine

> **Template id:** `tmpl_outbound_sales_machine_v1`
> **Status:** ✅ seeded (Phase 3)
> **Pillar:** Work · **Category:** sales · **Author:** ANTON

---

## What it does

Refine your ICP → build a target account list → research each account → draft personalised outreach + a follow-up sequence → produce a reply-handling playbook. v1 delivers the outreach pack to your Mission Inbox for manual execution. v2 (planned) will integrate CRM Service Packs for direct send + reply routing.

## Who it's for

- A founder running outbound personally and needing a structured operating system, not just AI-drafted emails.
- A sales leader briefing a junior SDR — the outreach pack becomes the SDR's run instructions.
- A consultant launching a new advisory offering who needs disciplined first-touch outreach.

Not for: high-volume / unpersonalised blast outreach (use a sequencer); or transactional outreach where personalisation is genuinely not worth it (use a templated email tool).

## The workflow

| # | Task | Type | Tokens (est.) | Notes |
|---|---|---|---|---|
| 1 | **Refine ICP into scorecard** | LLM | 4,000 | Prose → 5–8-criterion weighted rubric |
| 2 | **Generate target accounts** | analysis | 8,000 | N candidate accounts with fit reasoning |
| 3 | **Checkpoint — approve list** | checkpoint | 0 | Human prunes / replaces |
| 4 | **Per-account research** | LLM | 14,000 | Brief per account: signals, angle, buyer persona |
| 5 | **Draft personalised outreach** | LLM | 16,000 | First-touch email / LinkedIn opener keyed to research |
| 6 | **Build follow-up sequence** | analysis | 10,000 | 4-touch sequence: D1 / D3 / D7 / D14 with rotating angles |
| 7 | **Checkpoint — approve pack** | checkpoint | 0 | Human gate before reply playbook |
| 8 | **Reply-handling playbook** | LLM | 6,000 | Templates for warm / objection / decline / OOO / etc. |
| 9 | **Deliver outreach pack** | notification | 0 | Mission Inbox + Grow signal |

Total estimated active time: ~4 hours. Total elapsed (with checkpoints): up to 30 days.

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **ICP description** | yes | Specificity drives everything downstream |
| **Offering** | yes | Product / service / pricing approach / differentiators |
| **Value prop** | yes | Single sharpest reason a buyer takes the meeting |
| **Target count** | yes | How many accounts to research (10–50 sensible) |
| **Outreach channel** | yes | `email`, `linkedin`, or `both` |

No credentials needed for v1. v2 will integrate CRM (HubSpot / Pipedrive / Salesforce / Attio) for direct send + reply routing.

## Outputs delivered

The full outreach pack (Markdown) containing:
1. ICP scorecard (weighted rubric)
2. Approved account list (table with fit reasoning per row)
3. Per-account research briefs
4. First-touch outreach (per account, per channel)
5. 4-touch follow-up sequence (per account)
6. Reply-handling playbook (response templates by reply category)
7. Recommended cadence / volume / batching

Delivered to Mission Inbox. Grow pillar signal written noting the campaign launch.

## Trust-phase compatibility

Designed for **trust phase 4** because of the volume + risk profile. The two checkpoints are hard-coded — outreach personalisation must clear human review before reply templates are generated.

## Budget

| Setting | Value |
|---|---|
| Token budget | 800,000 max |
| Time budget (elapsed) | 30 days |
| Time budget (active) | 4 hours |
| Default autonomy | `check_in` |

## Success criteria

1. Genuinely personalised per account (no generic openers)
2. One clear ask per touch
3. 4-touch sequence advances different angles, not repeats
4. Reply-handling playbook the human can execute without re-thinking response logic

## A real example

Run this mission with:
- **ICP:** "Compliance leads at €1–10bn Nordic CASPs ahead of AMLR 2027 enforcement"
- **Offering:** "ANTON deployment + custom Risk Atlas configuration, 4-week engagement, €25k"
- **Value prop:** "Audit-defensible AMLR readiness in 4 weeks vs. 6-month consultancy"
- **Target count:** 25
- **Outreach channel:** `both`

Expected output: 25 personalised email/LinkedIn pairs, 4-touch sequence per account, reply playbook with 6 categorised response templates.

---

## Where to look

- **Code:** `server/services/missions/seed-templates.ts` (search `OUTBOUND_SALES_TEMPLATE`)
- **Catalogue UI:** `/missions/catalogue` → "Outbound Sales Machine"
- **Roadmap:** v2 = CRM Service Pack (HubSpot / Pipedrive / Attio) for direct send + reply routing
