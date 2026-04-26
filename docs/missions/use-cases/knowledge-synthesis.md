# Knowledge Synthesis

> **Template id:** `tmpl_knowledge_synthesis_v1`
> **Status:** ✅ seeded (Phase 1)
> **Pillar:** Work · **Category:** research · **Author:** ANTON

---

## What it does

A generic **research → analysis → synthesis** flow. Use this when you have a topic or question you want ANTON to investigate, organise its findings on, and produce a written deliverable for review. No external system access needed.

The mission frames the question, investigates sub-questions independently, synthesises findings, and pauses for human review before marking complete.

## Who it's for

- A consultant kicking off a new engagement and needing a structured background brief.
- A team lead asking "what should we know about X?" before a strategy meeting.
- A regulator triaging a thematic enquiry.
- Anyone who wants a defensible, structured first pass at understanding something.

Not for: time-sensitive lookups (use a single-shot module instead), or tasks that need external data integration (use AMLR Readiness or a custom Service Pack).

## The workflow

| # | Task | Type | Tokens (est.) | Notes |
|---|---|---|---|---|
| 1 | **Frame the question** | LLM | 4,000 | Restates the topic precisely; identifies 3–5 sub-questions worth investigating |
| 2 | **Investigate sub-questions** | analysis | 12,000 | Substantive answer per sub-question; flags evidence quality + gaps |
| 3 | **Synthesise findings** | analysis | 10,000 | TL;DR + key findings + supporting evidence + open questions + next steps |
| 4 | **Human review checkpoint** | checkpoint | 0 | Pauses; user approves or rejects with feedback |

Total estimated active time: ~30 minutes. Total elapsed (with checkpoints): up to 3 days.

## Inputs the user provides

| Input | Required | Notes |
|---|---|---|
| **Topic or question** | yes | Free-text; should be specific |
| **Depth** | yes | `quick` (~3 tasks, ~10 min) · `standard` (~5 tasks, ~30 min) · `deep` (~7 tasks, ~1 hour). Default: `standard`. |
| **Intended audience** | no | e.g. "board of directors", "engineering team" — shapes tone and depth |

No credentials, no Service Pack — Knowledge Synthesis runs purely on built-in capability.

## Outputs delivered

A Markdown synthesis document, structured as:

1. TL;DR (3 sentences)
2. Key findings (5–8 bullets)
3. Supporting evidence summary
4. Open questions / gaps
5. Recommended next steps

Delivered to the Mission Inbox. Optionally pushed to email / Companion App if the user has those channels enabled.

## Trust-phase compatibility

| Orchestrator phase | Behaviour |
|---|---|
| Observer | Mission proposes itself; user must explicitly create + start |
| Guided | User confirms each task transition; checkpoint always required |
| Supervised | Tasks 1–3 auto-execute; checkpoint still required |
| Autonomous | Same as Supervised — checkpoint is hard-coded into the template, not a phase override |

Knowledge Synthesis intentionally has a `task_type='checkpoint'` step so the human always reviews before the mission marks complete, regardless of trust phase.

## Budget

| Setting | Value |
|---|---|
| Token budget | 250,000 max |
| Time budget (elapsed) | 3 days |
| Time budget (active) | 30 min |
| Default autonomy | `check_in` |

## Success criteria

The mission is judged successful when the synthesis:

1. Directly addresses the framed sub-questions
2. Flags gaps in evidence honestly
3. Is suitable for the stated audience

The Quality Ratchet (`server/services/quality-ratchet.ts`) auto-scores the output against these criteria and flags regressions if the same template's quality average drops materially.

## A real example

Run this mission with:

- **Topic:** "What changed in EU sanctions on Russian dual-use goods between 2022 and 2026?"
- **Depth:** `deep`
- **Audience:** "compliance team at a Nordic mid-size bank"

Expected output: ~6 sub-questions covered (regulatory timeline, scope changes, enforcement signals, list updates, sectoral implications, supervisory expectations), with a 2-page synthesis and a "what to monitor" appendix.

---

## Where to look

- **Code:** `server/services/missions/seed-templates.ts:11–110`
- **Catalog UI:** `/missions/create` → select "Knowledge Synthesis"
- **Architecture:** [`/docs/architecture/24-workflow-engine.md`](../../architecture/24-workflow-engine.md)
