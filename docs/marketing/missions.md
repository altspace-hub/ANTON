# Missions — One-Pager

> **What it is:** ANTON's bet on autonomous AI for business. Missions don't help you do your job — they *run a function*.
> **Who it's for:** users who want a process to operate on its own, on cadence, with the AI checking in only when consequential.
> **What makes it different:** Missions compose ANTON's other primitives — the Workflow Engine, Service Packs, the Credential Vault, the Orchestrator's trust phases — into a single autonomy-graded, audit-defensible business workflow.

---

## The category we're building

The first wave of "AI for business" tools is mostly *AI assists you*. Chat with a sidebar, autocomplete a draft, summarise a thread. Useful, but the human is still in every loop.

The next wave is *AI runs a function*. The user defines what they want done, on what cadence, against which systems, with which guardrails. The AI runs. The human reviews when consequential. The audit trail is permanent.

That's Missions.

---

## What you can do with Missions

The 2 missions seeded today:

- **Knowledge Synthesis** — research → analysis → synthesis flow. Generic; needs no external systems.
- **AMLR Readiness Programme** — end-to-end AMLR Article 16 stand-up for an obliged entity. 6–12 weeks. Couples to the Risk Atlas pillar.

The 7 marketing-named missions on the roadmap (📋 not yet seeded — see [`/docs/missions/`](../missions/)):

| Mission | Pitch |
|---|---|
| **Content Factory** | Plan, generate, schedule, publish — across blog + newsletter + social — with brand-voice consistency |
| **Outbound Sales Machine** | Research, draft, send, follow up — driven off your CRM |
| **E-Commerce Autopilot** | Run a small shop's catalogue + customer comms + inventory triage |
| **Financial Analyst** | Periodic financial analysis from configured sources, board-ready briefings |
| **AI Agency** | Compose multiple missions into a managed engagement on behalf of a client |
| **Property Manager** | Tenant comms, renewals, rent reminders, maintenance triage |
| **Trend Scout** | Continuous source monitoring, periodic intelligence briefings |

Each is a configuration of the same primitives: workflow + service pack + credential vault + trust-phase ladder.

---

## How autonomy graduates

Every mission template has a `default_autonomy_level`. The Orchestrator's four-phase trust progression ([`/docs/architecture/21-orchestrator-trust-phases.md`](../architecture/21-orchestrator-trust-phases.md)) raises that ceiling as the user earns trust:

| Orchestrator phase | What missions can do |
|---|---|
| **Observer** | Missions can be created and inspected; cannot run autonomously |
| **Guided** | Each task transition gated by user confirm |
| **Supervised** | Low-risk tasks auto-execute; medium/high gated |
| **Autonomous** | Low + medium auto-execute; high-risk (data deletion, signed publishes, external workflow triggers) ALWAYS gated |

This means a brand-new ANTON user can't accidentally let a mission send a thousand outbound emails on day one. Trust is earned with measurable behaviour. Then the autonomy ceiling lifts.

---

## How it stays defensible

Every mission action emits an audit trail entry. Every external-system call goes through the Credential Vault. Every signed deliverable carries the instance Ed25519 signature. The full sequence is queryable at `/audit-trail`.

For regulated users, the question "show me how the AI got from input X to output Y" has a one-word answer: yes (here's the trail).

---

## Where to look

- **Try it:** `/missions` (dashboard), `/missions/create` (start a mission).
- **Code:** `server/services/missions/` (15 services), `server/routes/mission-*.ts` (5 routes).
- **Docs:** [`/docs/missions/`](../missions/) — README, use-cases/, service-packs, credential-vault, extending.
- **Architecture:** [`/docs/architecture/24-workflow-engine.md`](../architecture/24-workflow-engine.md) for the underlying engine; [`/docs/architecture/21-orchestrator-trust-phases.md`](../architecture/21-orchestrator-trust-phases.md) for the autonomy ladder.

---

*Document maintained alongside the Missions service tree. Refresh when a marketing-named mission moves from 📋 to ✅ — that's the next clear milestone.*
