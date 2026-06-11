# Task Agent ↔ Missions Convergence

Wave 5.1 of the Core Experience Review 2026-06. **Directional, not a rewrite.**

## The diagnosis

ANTON had two proposal→confirm task systems with zero shared code:

| | Task Agent | Missions |
|---|---|---|
| Intake | Best in the product: approach proposal from the self-knowledge DB (`anton_capabilities` / `anton_approaches`), tag-fenced contracts, clarifying questions, `intake_complete` gate, document attach, knowledge packs | Weak: free-text brief → one LLM decomposition call |
| Execution | One prose-only LLM call per step (`execute-step`) — cannot ACT | The action layer: HTTP/browser/DB executors, credential vault, autonomy gates, service packs, the background runner |
| Quality | Hardened 4-dimension gate + critique-fed retries (`task-quality-gate.ts`) | `quality_score` column, no gate |
| Human gating | Manual "Run Step N" click between steps; mid-execution chat | Checkpoints + autonomy gate (`check_in` / `briefing` / `full_autonomy`) |

## What's shared NOW (after 5.1)

1. **The bridge** — a completed Task Agent intake can compile into a mission run:
   - `POST /api/task-agent/tasks/:id/execute-as-mission` → `compileTaskToMission()`
     (`server/services/task-agent-mission-compiler.ts`, pure) →
     `missionController.createMission` + `briefMissionWithGraph` (new, deterministic —
     no LLM decomposition spend) + `approvePlanAndStart`.
   - Prose steps → `llm` mission tasks carrying the Task Agent step prompt; intake
     answers + attached-doc excerpts + the framework-text grounding layer (item 1.3)
     ride in `mission.context`.
   - Steps may declare actions via the new optional `action_type` / `action_config`
     fields on the approach `execution_steps` JSON (additive — all 9 seeded
     approaches are prose-only; the compiler **never fabricates actions**).
   - Inter-step `checkpoint` tasks preserve the Task Agent's human-gated step
     progression; autonomy is locked to `check_in`.

2. **One shared step/quality-record type** — `server/types/step-record.ts`
   (`SharedStepRecord` + `StepQualityRecord` + `missionTaskToStepRecord`).
   - Task Agent classic execution writes it into `anton_tasks.execution_results`
     (field names were chosen to match the historically persisted JSON — existing
     rows already conform).
   - The mission sync bridge appends the same shape (`source: 'mission'`,
     `mission_task_id` set).

3. **Linkage** (migration `231_task_agent_mission_bridge.sql`):
   `anton_tasks.linked_mission_id` ⇄ `missions.missions.source_task_id`.

4. **Status round-trip**:
   - `GET /api/task-agent/tasks/:id` returns `linked_mission`
     (`summarizeLinkedMission`: status, progress, current task, awaiting-human flag).
   - `POST /api/task-agent/tasks/:id/sync-mission` (idempotent, pull-based): when the
     mission completes, its deliverable-producing task outputs become the task's
     `execution_results` + deliverable, the **existing task-quality-gate runs on the
     combined deliverable** (never blocking), approach learning stats update, and
     knowledge atoms are extracted — exactly like classic completion. An aborted
     mission marks the task failed.
   - The Task Agent UI polls while the mission runs and shows a linked-mission panel
     with a deep link to `/missions/:id`.

## What's honestly NOT representable in a mission (and how the compile handles it)

- **Mid-execution clarifying conversation** — missions have no chat. The compiler
  inserts checkpoint tasks between steps; approve/reject feedback is the steering
  surface. The checkpoint description states this explicitly.
- **Full attached-document text** — `mission.context` is injected into every task's
  system prompt, so docs are compiled in as budgeted excerpts (12k chars total).
  When truncation happens the compile emits a **warning note** recommending the
  classic path for full-document grounding.
- **Invalid/unknown declared actions** — fall back to an `llm` step with a warning
  note ("the action will NOT be performed automatically"), never silently degraded.
- **Mid-flight switching** — `execute-as-mission` is only offered before Step 1 runs
  in classic mode (mixing engines mid-task would double-execute steps).

## What's still duplicated (and why)

| Duplication | Why it stays for now |
|---|---|
| Two task stores (`anton_tasks` JSON columns vs `missions.*` relational rows) | Forcing a schema unification was explicitly out of scope; the shared `SharedStepRecord` type is the seam to grow along. |
| Per-step quality gate in classic path vs single end-of-mission gate on the bridge path | The mission executor doesn't call the gate per task yet; wiring `task-quality-gate` into `mission-executor` is the natural next step. |
| Two checkpoint/approval models (Task Agent "Run Step N" click vs mission checkpoints) | The bridge maps one onto the other; classic mode keeps its UX untouched (default behavior unchanged). |
| Two intake flows (Task Agent conversation vs mission brief + LLM decomposition) | This release converges execution, not intake. Missions created directly still decompose via LLM. |
| Credential vault unused by classic Task Agent steps | Classic steps are prose-only by design; actions only run inside missions where the vault + autonomy gate live. |

## Next steps (the roadmap)

1. **Per-task quality gate in missions** — call `scoreWithGate` from
   `mission-executor` on `llm`/`research`/`analysis` outputs, store critique in
   `module_config` or a new column, reuse retry-with-critique.
2. **Approach templates as mission templates** — generate a
   `missions.mission_templates` row from an `anton_approaches` row so the Missions
   catalog surfaces Task Agent approaches directly.
3. **Action-declaring approaches** — author new approaches with `action_type` steps
   (the compiler + autonomy gate already support them end-to-end).
4. **Checkpoint feedback → re-run** — pipe checkpoint reject feedback into a retry of
   the preceding llm task (today reject just fails the task).
5. **Single store** — once 1–3 are proven, migrate `execution_results` to a
   projection over mission tasks and retire the duplicated execution path.

## Tests

- `tests/services/task-agent-mission-compiler.test.ts` — pure compile mapping,
  fallbacks, context budgets, status summary, deliverable assembly (28 tests).
- `tests/services/task-agent-mission-bridge.test.ts` — live-PG linkage round-trip
  (skips without `DATABASE_URL`), no LLM calls.
- `tests/services/task-quality-gate.test.ts` — unchanged, still green.
