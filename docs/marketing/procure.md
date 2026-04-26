# Procure pillar — buy what you need without becoming a procurement specialist

> **Audience:** the operator who has to buy software, services, hardware, or
> consulting — but isn't a procurement professional and doesn't want to become
> one. Founders, ops leads, single-person finance teams, and small-business
> owners.

---

## The problem

Procurement is one of those domains where small operators consistently lose
money simply because they don't know:

- **Who else exists** other than the first vendor they Googled
- **What a fair price looks like** for the thing they're buying
- **What questions to ask** to compare vendors apples-to-apples
- **What a defensible decision trail** looks like when finance / audit asks

Most "procurement software" is built for procurement teams of 10+. It assumes
purchase requisitions, three-way matching, and a category manager. That isn't
the operator described above — they need a thin layer of structure, not a
full SAP rollout.

## What Procure does

The Procure pillar is a **phased pipeline** (`prepare → source → select →
contract → manage`) plus three reference catalogues that turn a vague
"we need to buy X" into a defensible decision in days, not months.

### The pipeline

Each procurement need becomes a **cycle** that walks through five phases:

1. **Prepare** — write a one-page requirement, set a budget, name a category
2. **Source** — pull candidates from the **vendor directory** + add your own
3. **Select** — score vendors against your criteria; surface winner + runner-up
4. **Contract** — track signed contract, term, renewal date, key clauses
5. **Manage** — record performance notes; flag for re-tender at renewal

You can run the same cycle on a $500 SaaS subscription and a $500k
multi-year deal. The structure scales because the structure is light.

### The three catalogues

The cycle is what you do; the catalogues are what you reach for while doing it.

| Catalogue       | What it gives you                                                                                  |
|-----------------|----------------------------------------------------------------------------------------------------|
| **Vendor directory** | Searchable list of vendors with category, jurisdictions, certifications, size band, and a trust score. Pre-seeded with Anthropic, AWS, Stripe — extend with your own as you go. |
| **Benchmarks**       | P25/P50/P75 pricing + delivery benchmarks per category (cloud-infra spend, payments fees, AI-LLM cost). Validate that a quote sits in the market range, not above it. |
| **RFQ templates**    | Per-category RFQ scaffolds with required sections. Render with `{{variable}}` substitution. No procurement boilerplate to write from scratch. |

### What stays out

Procure deliberately does **not** try to be:

- A purchase-order / approval workflow system (your finance tool does that)
- A contract-management platform (track key dates here, store the PDF in your
  document system)
- A spend-analytics tool (that's a job for Markets + your accounting export)

The wedge is **structured decision-making**, not transaction processing.

## Where it fits in ANTON

- **Atlas:** every signed vendor contract is a candidate exposure on the
  organisation's risk atlas — Procure can hand off the vendor + contract terms
  for a third-party-risk assessment.
- **Grow:** vendor relationships often become channel partners; the directory
  is shared semantic ground.
- **Markets:** category benchmarks (cloud spend, AI cost) feed back into
  market intelligence and vice versa.
- **Civic:** when a procurement triggers a regulatory obligation (e.g., DORA
  third-party register entry), the Civic pillar's process library has the
  filing scaffold.

## How to start

1. Open Procure → click **New cycle** with a one-line need (e.g., "Replace
   Postgres hosting with managed service, $2-5k/mo budget").
2. Browse the **vendor directory** for candidates; add ones you find via
   your own research.
3. Hit the **benchmarks** page to see what the P50 looks like in your
   category — anchor your expectations.
4. Open the matching **RFQ template**, fill the variables, send to the
   shortlist.
5. Score responses, advance through phases, capture the contract.

The whole flow can run in a single afternoon for a $500/month decision and
across two weeks for a six-figure one — same shape, different depth.

---

> **Status:** Procure pillar is at v0.7.5 — pipeline + 3 catalogues live;
> `.anton` category-pack format is on the roadmap so a community-curated
> "SaaS sourcing pack" or "EU GovTech vendor pack" can extend the directory
> + benchmarks + templates in one bundle.
