# Civic — One-Pager

> **What it is:** ANTON's government-services and public-institution navigator. Helps citizens, small businesses, and operators figure out **what they're eligible for** + **how to apply** + **track submissions** across jurisdictions.
> **Who it's for:** new arrivals navigating an unfamiliar system, small-business owners staring at a permits maze, NGOs helping clients access benefits, anyone whose interaction with government is expensive in time + uncertainty.
> **What makes it different:** **declarative eligibility rules + jurisdiction-bundled process packs**. Not a chatbot guessing — deterministic rule evaluation with evidence per outcome.

---

## The pitch

Most government-services AI is a chatbot reading the agency's website. Useful, but:

- Can't tell you with confidence whether you actually qualify (probabilistic guess at best)
- Doesn't track your submissions across multiple processes
- Re-explains the same rule every conversation (no per-citizen state)
- Vendor-locked to a specific agency or platform

ANTON's Civic pillar is shaped around **deterministic eligibility evaluation + per-engagement state + jurisdiction-bundled process packs**:

- **Eligibility rules** are declarative (JSON conditions) and evaluated by `civic-eligibility.ts` against the applicant's context
- **Process packs** bundle jurisdiction-specific knowledge — a "UK business registration" pack, a "Sweden personal income tax" pack, a "California benefits" pack
- **Per-engagement state** persists across sessions — the citizen / advisor doesn't re-explain context every time
- **Submissions tracked** across all engagements at `/civic/submissions`

---

## What you can do today

| Surface | Purpose |
|---|---|
| `/civic` (CivicPage) | Pillar landing — list of active engagements |
| `/civic/eligibility` (CivicEligibilityCheckPage) | **Citizen-facing eligibility checker** — pick a process pack, fill in your context, get verdict per rule |
| `/civic/processes` (CivicProcessLibraryPage) | Browse jurisdiction-bundled process packs |
| `/civic/submissions` (CivicSubmissionsPage) | Cross-engagement view of all submissions |
| `/civic/engagement/:id` (CivicEngagementPage) | Per-engagement workspace |

5 pages. 4 services (`civic-service`, `civic-eligibility`, `civic-process-library`, `civic-knowledge-pack`). 2 migrations (092 foundation + 170 build-out).

---

## How eligibility evaluation works

The flow:

1. User picks a process pack (e.g. "California benefits")
2. User provides applicant context (jurisdiction, age, residency months, income, household size)
3. `civic-eligibility.ts` evaluates each rule in the pack against the context
4. Per-rule outcome: **eligible / ineligible / indeterminate / requires_evidence** (with evidence string)
5. Overall verdict: rolled up from rule outcomes; mandatory ineligibility blocks
6. Results persisted to `civic_eligibility_results` for audit

Rule kinds supported (mig 170):

- `age_min` / `age_max` — numeric age threshold
- `residency_months` — duration + jurisdiction
- `income_max` / `income_min` — numeric or named threshold (FPL-style values flagged for external resolution)
- `jurisdiction_in` — allowed-list of jurisdictions
- `document_present` — required document
- `status_equals` — arbitrary field equals expected value
- `custom_predicate` — externally-evaluated complex predicate

The deterministic-engine pattern matches Risk Atlas: numbers are formulas, the LLM (when used) writes the rationale prose around them.

---

## Process packs (today: SE / UK / US-CA)

Three seeded packs in mig 170:

| Pack | Jurisdiction | Authority | Domain |
|---|---|---|---|
| Sweden — Personal income tax | SE | Skatteverket | tax |
| UK — Business registration (Companies House) | UK | Companies House | business_registration |
| US (California) — Benefits navigator | US (California) | CA Dept Social Services | benefits |

Each pack ships eligibility rules + process descriptions. Operators expand by importing additional packs as `.anton civic-process-pack` bundles or via `POST /api/civic/process-packs`.

The pattern matches Risk Atlas industry packs — composable, signed, jurisdiction-scoped.

---

## Why this matters strategically

Civic is the small-but-leveraged pillar. Most B2B-AI platforms ignore the citizen / small-business / NGO segment because the buyer profile is fragmented. ANTON's Civic pillar serves it because the same engine that runs FCP risk assessment runs benefits eligibility — different rules, same primitive.

For consultancies advising new arrivals on residency + tax + benefits: Civic is a structured workspace, not yet-another-chatbot.
For NGOs helping refugees access services: deterministic outcomes + per-applicant audit trail = defensible casework.
For governments themselves: the same engine could surface their citizen-facing services consistently across departments.

---

## Where to look

- **Try it:** `/civic` (engagements), `/civic/eligibility` (checker), `/civic/processes` (library)
- **Code:** `server/services/civic-*.ts` (4 services), `server/routes/civic*.ts`
- **Schema:** `server/db/migrations-pg/092_civic_pillar.sql` + `170_civic_eligibility_packs.sql`
- **Docs:** [`/docs/civic/`](../civic/)
- **Architecture:** [`/docs/architecture/future/f-53-future-pillars.md`](../architecture/future/f-53-future-pillars.md)

---

*Refresh when a new process pack ships, when a new jurisdiction is added, or when the eligibility-rule set extends.*
