# Missions

> **What it is:** ANTON's autonomous-business-AI primitive. A Mission is a multi-step, multi-day workflow that ANTON runs largely-autonomously to deliver a business outcome.
> **Who it's for:** users who want AI to *run a function*, not just *help do their job*.
> **Position in the platform:** Missions sit at the intersection of the Workflow Engine (mechanics), the Orchestrator's trust phases (autonomy), the Service Pack catalogue (templated capability), and the Credential Vault (external-system access).

---

## Mission ↔ workflow: what's the difference?

| Workflow | Mission |
|---|---|
| Single-purpose task graph | Long-running programme over days / weeks |
| Steps run in seconds–minutes | Tasks span minutes–hours, with explicit checkpoints |
| One author, one output | Templated; tracks `times_used`, `avg_quality_score`, `avg_completion_time` |
| Configured per-run | Service Pack provisions credentials + capability bundle once, reused across missions |
| Manual trigger / cron | Templates spawn missions via the Mission Creator UI |
| No autonomy semantics | Autonomy level (`check_in` / `confirm_each` / `report_only`) controls when it pauses |

A Mission *uses* the Workflow Engine under the hood — but it's a higher-level construct with its own state, budget, autonomy controls, delivery surface, and credential bindings.

---

## Use Case Library

Per-mission documentation lives in [`use-cases/`](use-cases/). Each page covers what the mission does, target user, workflow steps, inputs, outputs, Service Pack reference, trust-phase compatibility, and a real or illustrative example.

### Seeded today (built and runnable)

| Mission | File | Status |
|---|---|---|
| Knowledge Synthesis | [`use-cases/knowledge-synthesis.md`](use-cases/knowledge-synthesis.md) | ✅ seeded (Phase 1) |
| AMLR Readiness Programme | [`use-cases/amlr-readiness.md`](use-cases/amlr-readiness.md) | ✅ seeded (Phase 2) |
| Content Factory | [`use-cases/content-factory.md`](use-cases/content-factory.md) | ✅ seeded (Phase 3) |
| Outbound Sales Machine | [`use-cases/outbound-sales-machine.md`](use-cases/outbound-sales-machine.md) | ✅ seeded (Phase 3) |
| E-Commerce Autopilot | [`use-cases/ecommerce-autopilot.md`](use-cases/ecommerce-autopilot.md) | ✅ seeded (Phase 3) |
| Financial Analyst | [`use-cases/financial-analyst.md`](use-cases/financial-analyst.md) | ✅ seeded (Phase 3) |
| AI Agency | [`use-cases/ai-agency.md`](use-cases/ai-agency.md) | ✅ seeded (Phase 3) |
| Property Manager | [`use-cases/property-manager.md`](use-cases/property-manager.md) | ✅ seeded (Phase 3) |
| Trend Scout | [`use-cases/trend-scout.md`](use-cases/trend-scout.md) | ✅ seeded (Phase 3) |

All seven Phase-3 missions are **LLM-only v1** — they deliver structured playbook bundles to the Mission Inbox. Service Pack integrations (CRM, CMS, e-commerce platforms, payment rails) land in v2 of each template.

---

## Supporting docs

| File | Purpose |
|---|---|
| [`service-packs.md`](service-packs.md) | What a Service Pack is + how `service-pack-manager.ts` provisions them |
| [`credential-vault.md`](credential-vault.md) | Vault contents, encryption, rotation policy |
| [`extending.md`](extending.md) | How to define a new mission template |
| [`/docs/marketing/missions.md`](../marketing/missions.md) | Strategic positioning for partners + investors |

---

## Service surface

15 mission services in `server/services/missions/`:

| Service | Responsibility |
|---|---|
| `mission-controller.ts` | Top-level orchestration |
| `mission-state.ts` | Per-mission state machine |
| `mission-decomposition.ts` | Template → task graph instantiation |
| `mission-executor.ts` | Run the next-ready task |
| `mission-checkpoint.ts` | Human-gate interactions |
| `mission-delegation.ts` | Hand a step to a peer ANTON via AAP |
| `mission-budget.ts` | Token + time budget enforcement |
| `mission-delivery.ts` | Output-delivery to channels (inbox/email/push/webhook) |
| `mission-grow-bridge.ts` | Write activity into Grow's signals + interactions (mig 122) |
| `mission-credential.ts` | Per-mission credential binding |
| `mission-identity.ts` | Per-mission identity for external calls |
| `mission-browser.ts` | Browser tab for headless web tasks |
| `service-pack-manager.ts` | Provision + validate Service Packs |
| `seed-templates.ts` | Built-in template definitions (currently 2) |

Plus the route layer at `server/routes/mission-*.ts` (5 routes) and the UI at `src/pages/missions/*` (6 pages).

---

## Schema

8 dedicated migrations (115–122):

| Migration | Concern |
|---|---|
| 115 | `missions`, `mission_templates` foundation |
| 116 | Action layer — task graph |
| 117 | `mission_tracks`, `mission_events` |
| 118 | `mission_deliveries` |
| 119 | Financial / budget tracking |
| 120 | `mission_delegation` (peer hand-off) |
| 121 | Review fixes |
| 122 | Grow bridge — `grow_signals` + `grow_interactions` writes |

---

## How a mission flows

1. **Create** — user selects a template in the Mission Creator UI; template's `parameters_schema` produces the form.
2. **Decompose** — `mission-decomposition.ts` instantiates the `task_graph_template` with the provided parameters → concrete task rows.
3. **Bind** — Service Pack provisions credentials + capability bundle for any external systems the mission needs.
4. **Execute** — `mission-executor.ts` runs each ready task. Tasks can be LLM, analysis, browser, or checkpoint types.
5. **Checkpoint** — at each `task_type='checkpoint'`, the mission pauses and prompts the user. Approval / rejection / feedback.
6. **Deliver** — final outputs surface in the Mission Inbox; can additionally be pushed via email / webhook / Companion App.
7. **Trail** — every task emits trail entries (revelation chains for LLM tasks; signed delivery trails for external sends).

The flow integrates with the Orchestrator's trust phases ([`/docs/architecture/21-orchestrator-trust-phases.md`](../architecture/21-orchestrator-trust-phases.md)) — `default_autonomy_level` on a template can be raised once the orchestrator promotes the user to a higher trust phase.

---

## Where to start

- **Try it:** `/missions` (dashboard), `/missions/create` (start one).
- **Code:** `server/services/missions/`, `server/routes/mission-*.ts`.
- **Architecture:** [`/docs/architecture/24-workflow-engine.md`](../architecture/24-workflow-engine.md) shows the workflow primitives Missions builds on.

---

*Refresh when a new template is seeded, when a marketing-named mission ships, or when the credential-vault model changes.*
