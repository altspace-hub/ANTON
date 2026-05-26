# Financial Analyst

> **Template id:** `tmpl_financial_analyst_v1`
> **Status:** ✅ seeded (Phase 3)
> **Pillar:** Work · **Category:** finance · **Author:** ANTON

---

## What it does

Produces a structured markets digest with thesis tracking, position monitoring, and risk flags. v1 is LLM-only — runs against your stated portfolio focus and tracked theses. v2 (planned) will pipe in real-time market data from the Markets pillar.

## Who it's for

- A self-directed investor who wants a disciplined weekly / daily digest instead of doom-scrolling Twitter.
- A family-office analyst running tracking on a defined thesis set.
- A founder watching specific sectors as part of strategic positioning.

Not for: high-frequency trading (this is positioning-level, not tick-level); or replacement of a Bloomberg terminal (the Markets pillar's data pipes are needed for real-time integration — coming in v2).

## The workflow

| # | Task | Type | Tokens (est.) | Notes |
|---|---|---|---|---|
| 1 | **Frame portfolio focus** | LLM | 3,000 | Extract instruments, sectors, themes, correlation map |
| 2 | **Macro context** | analysis | 5,000 | Regime call + key indicators + tail risks |
| 3 | **Thesis review** | LLM | 7,000 | Per thesis: confirm / mutate / retire |
| 4 | **Position monitoring** | analysis | 5,000 | Concentration + correlation + drawdown sensitivity |
| 5 | **Risk flags** | LLM | 4,000 | Ordered by probability × impact |
| 6 | **Compose the digest** | LLM | 6,000 | Structured Markdown deliverable |
| 7 | **Checkpoint — review** | checkpoint | 0 | Human reviews before delivery |
| 8 | **Deliver digest** | notification | 0 | Mission Inbox |

Total estimated active time: ~45 minutes. Total elapsed (with checkpoint): up to 7 days.

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **Portfolio focus** | yes | Instruments, sectors, themes — be specific. Include tickers. |
| **Risk appetite** | yes | `conservative`, `balanced`, or `aggressive` |
| **Cadence** | yes | `daily` or `weekly` |
| **Theses to track** | no | Pre-existing theses to monitor; if blank ANTON proposes from focus |

No credentials needed for v1.

## Outputs delivered

A markets digest (Markdown) structured as:
1. **Headline view** (3 sentences — the single most important thing this period)
2. **Macro context** (one paragraph — regime call + indicators)
3. **Thesis updates** (one short paragraph per thesis with confirm / mutate / retire call)
4. **Position monitoring** (the risk matrix)
5. **Risk flags** (ordered list with trigger + impact + what to watch)
6. **Action recommendations** (3 things worth doing this period)

Delivered to Mission Inbox; recurring runs include a "delta from last digest" opener.

## Trust-phase compatibility

Designed for **trust phase 2+**. Single hard checkpoint before delivery means the human always sees the digest before it's marked complete — this is critical because the LLM has knowledge-cutoff limitations that matter here.

## Budget

| Setting | Value |
|---|---|
| Token budget | 350,000 max |
| Time budget (elapsed) | 7 days |
| Time budget (active) | 45 min |
| Default autonomy | `check_in` |

## Success criteria

1. Reads as a real analyst's output — opinions backed by reasoning
2. Honest about what we don't know (knowledge-cutoff limits explicit)
3. Tracks supplied theses with explicit confirm / mutate / retire calls
4. Produces 3 specific action recommendations toned to the supplied risk_appetite

## A real example

Run this mission with:
- **Portfolio focus:** "US large-cap tech (NVDA, MSFT, GOOGL, META), EU defence (RHM, BAESY, SAAB-B), gold (GLD), BTC"
- **Risk appetite:** `balanced`
- **Cadence:** `weekly`
- **Theses to track:**
  - "EU defence rotation continues through 2026 elections"
  - "AI capex peaks in 2026 H2 — model differentiation flattens"

Expected output: structured weekly digest with regime call, sector breakdowns, explicit thesis updates with confirm/mutate/retire calls, position-concentration warning (likely flags single-stock concentration in NVDA), and 3 action recommendations.

---

## Where to look

- **Code:** `server/services/missions/seed-templates.ts` (search `FINANCIAL_ANALYST_TEMPLATE`)
- **Catalogue UI:** `/missions/catalogue` → "Financial Analyst"
- **Roadmap:** v2 = Markets pillar integration for real-time data + ANTON 100 indices
