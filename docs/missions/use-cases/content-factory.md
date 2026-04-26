# Content Factory

> **Status:** 📋 Coming soon — marketing-named mission, not yet seeded in `seed-templates.ts`.
> **Pillar:** Work · **Category:** marketing

---

## Concept

Generate, schedule, and publish content (blog posts, social posts, newsletters) end-to-end across configured channels with brand-voice consistency.

## Why it's not seeded yet

Per the addendum reconciliation (`ANTON_Improvement_Brief_Addendum_1_Portals_Missions.md` §D.6 decision point): only the 2 missions actually present in `server/services/missions/seed-templates.ts` (Knowledge Synthesis, AMLR Readiness) ship with full use-case pages today. The remaining marketing-named missions are positioning — they'll get full treatment as they're seeded.

## What it would take to ship

To move this mission from 📋 to ✅:

1. **Define the template** in `server/services/missions/seed-templates.ts` — `id`, `parameters_schema`, `task_graph_template`, `default_budget`, `default_autonomy_level`.
2. **Identify the Service Pack** that provisions credentials + capability bundle (e.g. CMS auth for Content Factory, CRM auth for Outbound Sales).
3. **Confirm the trust-phase ladder** — which orchestrator phases enable which level of autonomy for this mission's actions.
4. **Write the use-case page** to replace this stub — see [`knowledge-synthesis.md`](knowledge-synthesis.md) for the structure.
5. **Update [`/docs/missions/README.md`](../README.md)** — flip from 📋 to ✅ in the Use Case Library table.

## Where to track

If you want this mission, open an issue referencing this file. We'd expect implementation to take 1–2 weeks per mission depending on Service Pack complexity.

---

*Marketing positioning lives in [`/docs/marketing/missions.md`](../../marketing/missions.md). Underlying primitives (Workflow Engine, Credential Vault, Trust Phases) are all built — these missions are configurations of them.*
