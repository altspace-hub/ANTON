# `lesson-plan` — Lesson Plan

> **Family:** School
> **Purpose:** Teacher-authored lesson plan (objectives, activities, assessments).
> **Typical transport:** School-internal, Marketplace.

## Content directory layout

```text
manifest.json
contents/lesson-plans/<plan-id>/
  ├── plan.md
  ├── activities/
  └── assessments/
```

## Apply behaviour

Available to the teacher's students under the assigned subject + year-level.

## Signing

Recommended (so students/guardians can verify provenance).

## Related

- Service: `server/services/school-prompt-builder.ts`

- Architecture: [`/docs/architecture/future/f-54-school-mode.md`](../../architecture/future/f-54-school-mode.md)
