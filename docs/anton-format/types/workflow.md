# `workflow` — Workflow Template

> **Family:** Work-pillar core
> **Purpose:** Multi-step workflow definition (steps, triggers, schedules).
> **Typical transport:** Marketplace, AAP, local file.

## Content directory layout

```text
manifest.json
contents/workflows/<workflow-id>.json    # per workflow-definitions.ts schema
```

## Apply behaviour

Inserts into `workflows` + `workflow_steps`. Triggers (`event_triggers`) and schedules (`schedules`) are NOT auto-activated — the user must enable to avoid surprise execution.

## Signing

Recommended for shared workflows that touch external systems.

## Related

- Service: `server/services/workflow-executor.ts`
- Step registry: `server/services/workflow-step-registry.ts`
- Architecture: [`/docs/architecture/24-workflow-engine.md`](../../architecture/24-workflow-engine.md)
