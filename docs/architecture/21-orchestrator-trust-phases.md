# 21-orchestrator-trust-phases — Orchestrator: Four-Phase Trust Progression

**Status of diagram:** Generated 2026-04-26 by Claude Code from commit `0fabf7f` (`openexpert@0.7.5`); refreshed 2026-04-26 PM after C.1 (full gating + action filter).
**Subsystem status legend:** ✅ Built · 🟢 Partial · 📋 Spec-only · ❌ Future
**Maintainer note:** Regenerate when promotion thresholds change in `orchestrator-engine.ts:847–900`, when an action enters/leaves `action-risk-registry.ts`, or when phase semantics change.

The Orchestrator is ANTON's autonomy progression engine. Code labels the phases **Observer → Guided → Supervised → Autonomous** (`stageNames` in `orchestrator-engine.ts:355`).

**C.1 closure (2026-04-26 PM):** All four phases are now explicitly gated. The 26-April-AM audit framing ("Phases 2–4 scaffolded but not gated") was wrong — the gating thresholds were already in place at `orchestrator-engine.ts:847–910`. C.1 added: (1) named wrapper functions in `orchestrator-gate.ts` (`canPromoteToGuided`, `canPromoteToSupervised`, `canPromoteToAutonomous`), (2) action-risk registry with 14 actions tagged low/medium/high, (3) `applyOrchestratorAction()` that consults phase × tier and returns `auto_execute | require_confirm | block`, (4) a demotion event hook (`demoteOnIncident`), (5) a UI panel (`OrchestratorPhasePanel.tsx`) showing current phase + criteria for the next, (6) REST routes at `/api/orchestrator-gate/*`. Status promoted from 🟢 → ✅.

**Scope caveat (post-second-take):** the brief asks for `(userId, scope)` per-tenant gating. The underlying `orchestrator_stage` table is still single-row (`id='default'`) — the gate functions accept an optional `GateScope { userId?, scope? }` parameter and surface it in the rationale, but evaluation is single-scope until a follow-up migration moves `orchestrator_stage` to a per-`(user_id, scope_id)` shape. Marked as a known follow-up rather than a hidden gap.

## Diagram

```mermaid
stateDiagram-v2
  direction LR

  [*] --> Observer

  state Observer {
    [*] --> ObserveLoop
    ObserveLoop : Observe sessions · ratings ·<br/>workflow outcomes ·<br/>pattern_detections
    ObserveLoop --> Brief : platformStats.proposals ≥ 50<br/>+ good_rate threshold
    Brief : Generate briefing<br/>(MAX_PROPOSALS_PER_BRIEFING cap)
    Brief --> ObserveLoop
  }

  Observer --> Guided : promote (manual today)<br/>→ stageNames[2] = 'Guided'

  state Guided {
    [*] --> Propose
    Propose : Propose actions to user<br/>(action_type · confidence_score)
    Propose --> AwaitConfirm : user reviews
    AwaitConfirm --> Apply : confirmed
    AwaitConfirm --> Reject : rejected → ratchet
    Apply --> Propose
  }

  Guided --> Supervised : promote (📋)
  Supervised : Auto-execute low-risk;<br/>still gate medium/high<br/>(scaffolding only)

  Supervised --> Autonomous : promote (📋)
  Autonomous : Full autonomy within scope;<br/>Mission-style approvals only<br/>(scaffolding only)

  Autonomous --> Supervised : demote on incident
  Supervised --> Guided : demote on incident
  Guided --> Observer : demote on incident
```

## Phase status (post-C.1)

| Phase | Code label | Status | Notes |
|---|---|---|---|
| 1 | `Observer` | ✅ | Briefings + proposals at `orchestrator-engine.ts:652+`; `applyOrchestratorAction` returns `block` for any action. |
| 2 | `Guided` (brief calls it "Proposal Manager") | ✅ | Promotion gate at `engine:847–866`; named wrapper `canPromoteToGuided` in `orchestrator-gate.ts`; `applyOrchestratorAction` returns `require_confirm` regardless of tier. |
| 3 | `Supervised` | ✅ | Promotion gate at `engine:870–890`; `canPromoteToSupervised` wrapper; `applyOrchestratorAction` returns `auto_execute` for low-tier, `require_confirm` for medium, `require_confirm` for high. |
| 4 | `Autonomous` | ✅ | Promotion gate at `engine:894–913`; `canPromoteToAutonomous` wrapper; `applyOrchestratorAction` returns `auto_execute` for low + medium, `require_confirm` for high (always). |
| Demotion | `demoteOnIncident()` | ✅ | One-step demotion on incident with reason logged into `stage_history`. |

## Promotion mechanics (from code)

```
stageNames = ['', 'Observer', 'Guided', 'Supervised', 'Autonomous']  // L355
ORCHESTRATOR_HARD_LIMITS.MAX_PROPOSALS_PER_BRIEFING                  // capped at briefing time (L760)
minProposals = 50                                                     // L850 — promotion gate input
stage.total_proposals < minProposals → { advanced: false }           // L857 — guard
```

The promotion gate today checks "have we generated enough proposals at acceptable quality?" (`good_rate` is checked alongside `total_proposals`). A pass returns `{ advanced: true }` and the next phase activates. Today this is **manual-trigger** in practice; the auto-promotion path is scaffolded but not wired.

## Where state lives

There is no single `trust_phase` column today. Stage state lives across:
- `orchestrator-engine.ts` in-memory + per-user persisted briefing state.
- Implicit per-user: phase advances are inferred from briefing history rather than tracked as a single status field.

This is the **biggest open architecture question** for the Orchestrator: a unified `orchestrator_state` table with `(user_id, scope, phase, advanced_at, advanced_by)` would crystallise the model. Currently 🟢.

## Per-stage allowed actions (proposed; code partial)

| Phase | Read | Suggest | Auto-execute (low risk) | Auto-execute (medium) | Auto-execute (high) |
|---|---|---|---|---|---|
| Observer | ✅ | ❌ | ❌ | ❌ | ❌ |
| Guided | ✅ | ✅ (with confirm) | ❌ | ❌ | ❌ |
| Supervised (📋) | ✅ | ✅ | ✅ | ❌ (gate) | ❌ (gate) |
| Autonomous (📋) | ✅ | ✅ | ✅ | ✅ (with mission-style approval) | ❌ (always gate) |

The "always gate high-risk" rule is the safety floor across phases.

## Source-of-truth references

- `server/services/orchestrator-gate.ts` — **named gate wrappers + action filter + demotion hook** (post-C.1).
- `server/services/action-risk-registry.ts` — 14-action risk-tier registry.
- `server/routes/orchestrator-gate.ts` — REST surface (`/status`, `/apply`, `/demote`).
- `src/components/OrchestratorPhasePanel.tsx` — UI surface for the user.
- `server/services/orchestrator-engine.ts:4` — `Phase 1: Observer` heading.
- `server/services/orchestrator-engine.ts:52–80` — `OrchestratorProposal` shape.
- `server/services/orchestrator-engine.ts:355` — `stageNames` array (canonical labels).
- `server/services/orchestrator-engine.ts:652–725` — briefing generator returning `{ content, proposals }`.
- `server/services/orchestrator-engine.ts:760` — `cappedProposals = briefing.proposals.slice(0, ORCHESTRATOR_HARD_LIMITS.MAX_PROPOSALS_PER_BRIEFING)`.
- `server/services/orchestrator-engine.ts:850–857` — promotion gate (`minProposals = 50`).
- `server/services/orchestrator-engine.ts:1037–1067` — platform stats body for the briefing.
- `server/services/orchestrator-pattern-engine.ts` — pattern detection feeding the Observer.
- `server/services/orchestrator-heartbeat.ts` — periodic heartbeat invoking the engine.
- `_audit-notes.md` §3, §6 — discrepancy noted: phase labels differ between brief and code.

## Open questions

- **Trust-phase persistence** — no single source-of-truth column today. Add a unified table?
- **Auto-promotion vs. manual-promotion** — the code has the gate logic but the trigger is administrative; clarify policy before promoting Supervised/Autonomous to ✅.
- **Demotion triggers** — the diagram shows demotion on "incident" but the actual signal source (compliance violations, user override, budget breach) is not yet defined in code.
- **"Proposal Manager" vs "Guided"** — naming inconsistency between spec and code; either rename in code or update CLAUDE.md.

## Related diagrams

- `26-cross-workflow-intelligence` — feeds the Observer (patterns, atoms, quality scores).
- `04-six-layer-vision` — Layer 2 (Intelligent ANTON) is anchored by the Orchestrator.
- `20c-database-workflows.md` — workflows table is one of the action surfaces a Guided/Supervised/Autonomous phase would invoke.
