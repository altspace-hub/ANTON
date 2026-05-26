# Trend Scout

> **Template id:** `tmpl_trend_scout_v1`
> **Status:** ✅ seeded (Phase 3)
> **Pillar:** Work · **Category:** intelligence · **Author:** ANTON

---

## What it does

Stand up a structured trend-watching capability: domain framing → source map → signal scoring rubric → baseline scan → pattern analysis → briefing template. v1 delivers the scouting playbook + an initial baseline. v2 (planned) will integrate the Radar pillar for continuous source monitoring.

## Who it's for

- A strategy lead at a startup who needs structured intelligence on adjacent fields.
- A consultant building a recurring trend digest for clients.
- A policy researcher tracking emerging signals across academic / industry / regulatory sources.
- A founder watching their threat / opportunity landscape.

Not for: real-time news monitoring (use the Radar pillar directly); or single-shot deep dives on a known topic (use Knowledge Synthesis instead).

## The workflow

| # | Task | Type | Tokens (est.) | Notes |
|---|---|---|---|---|
| 1 | **Domain framing** | LLM | 4,000 | Decompose into 5–8 watchable sub-themes |
| 2 | **Source map** | analysis | 6,000 | Per sub-theme: academic / industry / news / social / regulatory |
| 3 | **Signal scoring rubric** | LLM | 4,000 | Thresholds + criteria + dismiss criteria |
| 4 | **Baseline scan** | analysis | 10,000 | Initial pass: signals per sub-theme with scores + confidence |
| 5 | **Pattern analysis** | LLM | 6,000 | Cross-reference for emerging convergence |
| 6 | **Checkpoint — review watchlist** | checkpoint | 0 | Human approves sub-themes + rubric |
| 7 | **Briefing template** | LLM | 4,000 | Recurring report format keyed to audience + cadence |
| 8 | **Deliver scouting playbook** | notification | 0 | Mission Inbox + how-to-run-each-cadence guide |

Total estimated active time: ~1 hour. Total elapsed (with checkpoint): up to 14 days.

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **Domains to watch** | yes | Be specific — "AI regulation in the EU" beats "AI regulation" |
| **Signal sensitivity** | yes | `low` (only major shifts), `medium` (patterns + meaningful singles), `high` (all worth noting) |
| **Preferred sources** | no | URLs / publications / accounts you already trust |
| **Report cadence** | yes | `daily`, `weekly`, or `monthly` |
| **Audience** | yes | Who reads the output — shapes tone and length |

No credentials needed for v1.

## Outputs delivered

A scouting playbook (Markdown) containing:
1. Domain framing (5–8 sub-themes with rationale)
2. Source map (per sub-theme, across 5 source categories)
3. Signal scoring rubric (thresholds + dismiss criteria)
4. Baseline scan (table: sub-theme | signal | source-type | score | confidence)
5. Pattern analysis (cross-cutting patterns the audience couldn't see solo)
6. Briefing template (recurring report structure)
7. "How to run this each cadence" one-page guide

Delivered to Mission Inbox.

## Trust-phase compatibility

Designed for **trust phase 2+**. Single hard checkpoint after rubric + baseline + pattern analysis — the human approves the watchlist and rubric before the briefing template format is locked.

## Budget

| Setting | Value |
|---|---|
| Token budget | 400,000 max |
| Time budget (elapsed) | 14 days |
| Time budget (active) | 1 hour |
| Default autonomy | `check_in` |

## Success criteria

1. Structured enough to be re-run each period without ANTON re-thinking the rubric
2. Surfaces patterns the audience couldn't see by reading the same sources individually
3. Honest about knowledge-cutoff and source-coverage limits

## A real example

Run this mission with:
- **Domains:** "Stablecoin regulation in the EU + US + Singapore"
- **Signal sensitivity:** `medium`
- **Preferred sources:** "EBA, MiCA implementation announcements, BIS publications, US Treasury statements, MAS, Coinbase / Circle blogs"
- **Report cadence:** `weekly`
- **Audience:** "Compliance leads at €1–10bn Nordic banks considering MiCA / stablecoin exposure"

Expected output: a structured scouting playbook with 6–8 sub-themes (issuance / reserves / disclosure / interoperability / consumer-protection / sanctioning / cross-border), 25+ named sources, a working rubric, an initial baseline, identified cross-jurisdiction patterns, and a recurring weekly briefing template.

---

## Where to look

- **Code:** `server/services/missions/seed-templates.ts` (search `TREND_SCOUT_TEMPLATE`)
- **Catalogue UI:** `/missions/catalogue` → "Trend Scout"
- **Roadmap:** v2 = Radar pillar integration for continuous source monitoring + signal scoring against the rubric
