# Extending Grow

> How to add a new pipeline stage, a new signal type, a new briefing template, or a new CRM connector.

---

## Add a new pipeline stage

Pipeline stages live in `grow_pipeline_stages` (mig 093) — referenced by `grow_opportunities.stage_id`. To add (e.g.) `enterprise-procurement-review` between `qualification` and `proposal`:

1. **Insert** the stage row with the appropriate `order_idx` (between the surrounding stages):

```sql
INSERT INTO grow_pipeline_stages (id, label, order_idx, probability_default, color)
VALUES ('enterprise-procurement-review', 'Enterprise Procurement Review', 25, 30, 'amber')
ON CONFLICT (id) DO NOTHING;
```

2. **Existing opportunities** keep their stage. If you want to migrate some, run an UPDATE based on opportunity attributes.

3. **No code change** required — `GrowPipelinePage` reads stages dynamically.

---

## Add a new signal type

Signals live in `grow_signals` (mig 093). Currently detected: renewal, expansion, attrition risk, dormancy, response. To add (e.g.) "competitor mentioned":

1. **Detection** — extend `grow-service.ts` with a detector that runs on activity ingestion. Could be a simple keyword scan, or an LLM call against a per-org prompt.
2. **Persistence** — write a `grow_signals` row with `signal_type = 'competitor_mentioned'`, `confidence`, supporting evidence reference.
3. **Surfacing** — `GrowPage` and `GrowOpportunityPage` show recent signals; new types automatically appear.

Heavier signals can fire a Mission (e.g. competitor-mentioned → kick off a Trend Scout mission for that competitor).

---

## Add a new briefing template

Briefings live in `grow_briefings`. Currently produced: per-org weekly briefing, per-opportunity decision briefing, per-contact relationship summary. To add a new template:

1. **Define the prompt** in `grow-service.ts` (or a new `grow-briefings.ts` if the file gets too large).
2. **Trigger** — either on cadence (cron via Workflow Engine) or on demand (button on the relevant page).
3. **Output** — written to `grow_briefings` with the template id; surfaced in the relevant page section.

Briefings can be enriched by Specialized Agents — e.g. an `FCP-Researcher` agent could enrich an org's compliance posture briefing.

---

## Add a new CRM connector

See [`crm-connectors.md`](crm-connectors.md) — that's the connector-specific extending guide.

---

## Add a new mission integration

The bridge in mig 122 already wires Missions to write `grow_signals` and `grow_interactions`. To extend (e.g.) so a new Mission writes to a new entity:

1. **Identify the right Grow table** for the activity — usually `grow_interactions` (touchpoints) or `grow_signals` (events).
2. **Add the write call** in the mission's task graph (typically in a "record-activity" step).
3. **Use the deterministic id format** `${mission-id}:${task-id}:${counter}` so the row is traceable back to the originating mission.

The `GrowOpportunityPage` activity-timeline section is mission-agnostic — new mission-driven activities surface automatically.

---

## Anti-patterns

- **Don't bypass the `owned_by_anton` flag.** The opt-out is the user's contract that ANTON won't overwrite their manual edits.
- **Don't hard-code provider names.** Use the `CrmProvider` union and `external_provider` column — keeps multi-provider deployments clean.
- **Don't write to Grow tables from outside `grow-service.ts` (or the mission bridge).** Centralised writes mean signals + briefings + audits stay consistent.
- **Don't surface CRM credentials in any frontend payload.** The vault stays server-side; the connector fetches at call time.

---

*Maintained alongside `grow-service.ts`. Refresh when new pipeline stages or signal types are added.*
