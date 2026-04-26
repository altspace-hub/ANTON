/**
 * orchestrator-gate.ts — phase-gating wrappers for the four-phase trust progression.
 *
 * Wraps the gating logic already present in orchestrator-engine.ts (lines
 * 815–913) into named functions per ANTON_Improvement_and_Investigation_Brief.md
 * §C.1. Adds an action-filter (`applyOrchestratorAction`) that consults the
 * current phase + action-risk-registry to decide: execute / require-confirm / block.
 *
 * Phase semantics:
 *   1. Observer    — never acts. Only proposes briefings.
 *   2. Guided      — proposes specific actions; user confirms each.
 *   3. Supervised  — auto-executes risk-tier-low; gates medium / high.
 *   4. Autonomous  — auto-executes within scope; flags only mission-style high-risk approvals.
 *
 * Demotion: triggered on incident (rejected action, compliance gap, user override).
 *
 * ── SCOPE NOTE (post-second-take review) ──────────────────────────────
 * The C.1 brief asks for `(userId, scope)` per-tenant gates. The underlying
 * engine table `orchestrator_stage` is single-row (id='default') today —
 * one stage state per ANTON instance, not per user/scope. The named gate
 * wrappers below accept an optional `(userId?, scope?)` to match the brief's
 * signature, but the values are recorded in the rationale + future-proofed;
 * actual evaluation is single-scope until a per-tenant table lands. Migrating
 * `orchestrator_stage` to a `(user_id, scope_id, …)` shape is the explicit
 * follow-up. See `/docs/architecture/21-orchestrator-trust-phases.md` open
 * questions.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { getActionTier, isRegisteredAction } from './action-risk-registry.js';

// ── Stage types ────────────────────────────────────────────────────────

export type Phase = 1 | 2 | 3 | 4;
export const PHASE_NAMES: Record<Phase, 'Observer' | 'Guided' | 'Supervised' | 'Autonomous'> = {
  1: 'Observer',
  2: 'Guided',
  3: 'Supervised',
  4: 'Autonomous',
};

export interface PhaseEligibility {
  /** Whether the user is currently eligible to be promoted to the next phase. */
  eligible: boolean;
  /** Reasons (positive: criteria met; negative: criteria failing). One line each. */
  reasons: string[];
  /** Current phase. */
  currentPhase: Phase;
  /** Next-phase target (1→2, 2→3, 3→4). Undefined when at Autonomous. */
  targetPhase?: Phase;
}

export interface ApplyActionResult {
  /** decision the gate reached. */
  decision: 'auto_execute' | 'require_confirm' | 'block';
  /** Why this decision was made — surfaced to the user. */
  reason: string;
  /** Risk tier of the action (computed from registry). */
  tier: 'low' | 'medium' | 'high';
  /** Phase at evaluation time. */
  phase: Phase;
  /** Phase name for display. */
  phaseName: string;
}

// ── Internal: read current single-scope orchestrator stage ────────────

interface OrchestratorStageRow {
  current_stage: number;
  stage_entered_at: string;
  total_briefings: number;
  total_proposals: number;
  proposals_rated: number;
  proposals_good_or_relevant: number;
  proposals_irrelevant_or_wrong: number;
  plans_approved: number;
  plans_rejected: number;
  executions_completed: number;
  executions_failed: number;
  avg_quality_score: number | null;
  auto_executions: number;
  auto_overrides: number;
}

async function readStage(db: DatabaseAdapter): Promise<OrchestratorStageRow | undefined> {
  return await db.get(
    'SELECT * FROM orchestrator_stage WHERE id = ?',
    'default'
  ) as OrchestratorStageRow | undefined;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// ── Public gates ──────────────────────────────────────────────────────

/**
 * Optional per-tenant scope identifier. Today these are recorded in the
 * rationale only; gating still consults the single-scope orchestrator_stage
 * row. A future migration (orchestrator_stage_v2) will key state on these.
 */
export interface GateScope {
  userId?: string;
  scope?: string;
}

/** Stage 1 → 2 (Observer → Guided) eligibility evaluation. */
export async function canPromoteToGuided(db: DatabaseAdapter, _scope: GateScope = {}): Promise<PhaseEligibility> {
  const stage = await readStage(db);
  const reasons: string[] = [];
  if (!stage) return { eligible: false, currentPhase: 1, reasons: ['no orchestrator state row'] };
  if (stage.current_stage !== 1) {
    return { eligible: false, currentPhase: stage.current_stage as Phase, reasons: [`already at stage ${stage.current_stage}`] };
  }

  const days = daysSince(stage.stage_entered_at);
  const goodRate = stage.proposals_rated > 0 ? stage.proposals_good_or_relevant / stage.proposals_rated : 0;
  const badRate  = stage.proposals_rated > 0 ? stage.proposals_irrelevant_or_wrong / stage.proposals_rated : 0;

  // Thresholds duplicated from orchestrator-engine.ts:847–853.
  const ok =
    days >= 14 &&
    stage.total_briefings >= 20 &&
    stage.total_proposals >= 50 &&
    stage.proposals_rated >= 10 &&
    goodRate >= 0.6 &&
    badRate <= 0.15;

  if (days < 14) reasons.push(`needs ${14 - days} more days at Observer (currently ${days})`);
  if (stage.total_briefings < 20) reasons.push(`needs ${20 - stage.total_briefings} more briefings (currently ${stage.total_briefings})`);
  if (stage.total_proposals < 50) reasons.push(`needs ${50 - stage.total_proposals} more proposals (currently ${stage.total_proposals})`);
  if (stage.proposals_rated < 10) reasons.push(`needs ${10 - stage.proposals_rated} more rated proposals (currently ${stage.proposals_rated})`);
  if (stage.proposals_rated >= 10 && goodRate < 0.6) reasons.push(`good/relevant rate ${(goodRate*100).toFixed(0)}% < 60% threshold`);
  if (stage.proposals_rated >= 10 && badRate > 0.15) reasons.push(`bad/wrong rate ${(badRate*100).toFixed(0)}% > 15% ceiling`);
  if (ok) reasons.push(`all criteria met after ${days} days · ${(goodRate*100).toFixed(0)}% good · ${(badRate*100).toFixed(0)}% bad`);

  return { eligible: ok, currentPhase: 1, targetPhase: 2, reasons };
}

/** Stage 2 → 3 (Guided → Supervised) eligibility evaluation. */
export async function canPromoteToSupervised(db: DatabaseAdapter, _scope: GateScope = {}): Promise<PhaseEligibility> {
  const stage = await readStage(db);
  const reasons: string[] = [];
  if (!stage) return { eligible: false, currentPhase: 1, reasons: ['no orchestrator state row'] };
  if (stage.current_stage !== 2) {
    return { eligible: false, currentPhase: stage.current_stage as Phase, reasons: [`current stage is ${stage.current_stage}, not 2`] };
  }

  const days = daysSince(stage.stage_entered_at);
  const totalExecs = stage.executions_completed + stage.executions_failed;
  const failureRate = totalExecs > 0 ? stage.executions_failed / totalExecs : 1;
  const quality = stage.avg_quality_score ?? 0;

  // Thresholds duplicated from orchestrator-engine.ts:870–876.
  const ok =
    days >= 7 &&
    stage.plans_approved >= 10 &&
    stage.executions_completed >= 5 &&
    totalExecs >= 5 &&
    failureRate <= 0.2 &&
    quality >= 0.8;

  if (days < 7) reasons.push(`needs ${7 - days} more days at Guided (currently ${days})`);
  if (stage.plans_approved < 10) reasons.push(`needs ${10 - stage.plans_approved} more approved plans (currently ${stage.plans_approved})`);
  if (stage.executions_completed < 5) reasons.push(`needs ${5 - stage.executions_completed} more completed executions`);
  if (totalExecs >= 5 && failureRate > 0.2) reasons.push(`failure rate ${(failureRate*100).toFixed(0)}% > 20% ceiling`);
  if (quality < 0.8) reasons.push(`avg quality ${(quality*100).toFixed(0)}% < 80% floor`);
  if (ok) reasons.push(`all criteria met after ${days} days · ${stage.plans_approved} approved · ${(quality*100).toFixed(0)}% quality`);

  return { eligible: ok, currentPhase: 2, targetPhase: 3, reasons };
}

/** Stage 3 → 4 (Supervised → Autonomous) eligibility evaluation. */
export async function canPromoteToAutonomous(db: DatabaseAdapter, _scope: GateScope = {}): Promise<PhaseEligibility> {
  const stage = await readStage(db);
  const reasons: string[] = [];
  if (!stage) return { eligible: false, currentPhase: 1, reasons: ['no orchestrator state row'] };
  if (stage.current_stage !== 3) {
    return { eligible: false, currentPhase: stage.current_stage as Phase, reasons: [`current stage is ${stage.current_stage}, not 3`] };
  }

  const days = daysSince(stage.stage_entered_at);
  const overrideRate = stage.auto_executions > 0 ? stage.auto_overrides / stage.auto_executions : 1;
  const quality = stage.avg_quality_score ?? 0;

  // Thresholds duplicated from orchestrator-engine.ts:894–900.
  const ok =
    days >= 14 &&
    stage.auto_executions >= 20 &&
    overrideRate <= 0.1 &&
    quality >= 0.85;

  if (days < 14) reasons.push(`needs ${14 - days} more days at Supervised (currently ${days})`);
  if (stage.auto_executions < 20) reasons.push(`needs ${20 - stage.auto_executions} more auto-executions`);
  if (stage.auto_executions >= 20 && overrideRate > 0.1) reasons.push(`override rate ${(overrideRate*100).toFixed(0)}% > 10% ceiling`);
  if (quality < 0.85) reasons.push(`avg quality ${(quality*100).toFixed(0)}% < 85% floor (Autonomous bar is higher)`);
  if (ok) reasons.push(`all criteria met after ${days} days · ${stage.auto_executions} auto-executions · ${(quality*100).toFixed(0)}% quality`);

  return { eligible: ok, currentPhase: 3, targetPhase: 4, reasons };
}

/** All eligibility checks at once — useful for the OrchestratorPhasePanel UI. */
export async function getAllEligibility(db: DatabaseAdapter, scope: GateScope = {}): Promise<{
  current: { phase: Phase; phaseName: string };
  guided: PhaseEligibility;
  supervised: PhaseEligibility;
  autonomous: PhaseEligibility;
}> {
  const stage = await readStage(db);
  const phase = (stage?.current_stage ?? 1) as Phase;
  return {
    current: { phase, phaseName: PHASE_NAMES[phase] },
    guided: await canPromoteToGuided(db, scope),
    supervised: await canPromoteToSupervised(db, scope),
    autonomous: await canPromoteToAutonomous(db, scope),
  };
}

// ── Action filter ─────────────────────────────────────────────────────

/**
 * Decide whether an action may auto-execute, requires user confirm, or is blocked.
 * Consults action-risk-registry for tier + the current orchestrator phase.
 *
 * Phase × tier matrix (from §C.1):
 *
 *                 │  low      │  medium                │  high
 *   ──────────────┼───────────┼────────────────────────┼─────────────────
 *   Observer      │ block     │ block                  │ block
 *   Guided        │ confirm   │ confirm                │ confirm
 *   Supervised    │ auto      │ confirm                │ confirm
 *   Autonomous    │ auto      │ auto (with mission gate│ confirm (always)
 *                 │           │  for sensitive ones)   │
 */
export async function applyOrchestratorAction(
  db: DatabaseAdapter,
  actionId: string,
  scope: GateScope = {}
): Promise<ApplyActionResult> {
  const stage = await readStage(db);
  const phase = (stage?.current_stage ?? 1) as Phase;
  const phaseName = PHASE_NAMES[phase];

  const tier = isRegisteredAction(actionId) ? (getActionTier(actionId) as 'low' | 'medium' | 'high') : 'high';
  const scopeSuffix = scope.userId || scope.scope ? ` · scope=${scope.scope ?? '*'}/${scope.userId ?? '*'}` : '';
  const safeReason = (msg: string) => `${phaseName} · tier=${tier} · ${msg}${scopeSuffix}`;

  // High-risk actions ALWAYS require confirm regardless of phase.
  if (tier === 'high') {
    return { decision: 'require_confirm', reason: safeReason('high-risk → mission-style approval required'), tier, phase, phaseName };
  }

  // Phase 1 (Observer): never act.
  if (phase === 1) {
    return { decision: 'block', reason: safeReason('Observer phase only proposes — does not act'), tier, phase, phaseName };
  }

  // Phase 2 (Guided): every action requires user confirm.
  if (phase === 2) {
    return { decision: 'require_confirm', reason: safeReason('Guided phase requires confirm on every action'), tier, phase, phaseName };
  }

  // Phase 3 (Supervised): auto-execute low; gate medium.
  if (phase === 3) {
    if (tier === 'low') {
      return { decision: 'auto_execute', reason: safeReason('low-risk auto-execute permitted at Supervised'), tier, phase, phaseName };
    }
    return { decision: 'require_confirm', reason: safeReason('medium-risk requires confirm at Supervised'), tier, phase, phaseName };
  }

  // Phase 4 (Autonomous): auto-execute low + medium. (High already returned above.)
  return { decision: 'auto_execute', reason: safeReason('Autonomous phase auto-executes low/medium tiers'), tier, phase, phaseName };
}

// ── Demotion event hook ───────────────────────────────────────────────

export interface DemotionResult {
  demoted: boolean;
  fromStage?: Phase;
  toStage?: Phase;
  reason?: string;
}

/**
 * Demote one phase in response to an incident (rejected action, compliance gap,
 * user override). The reason is persisted into the stage_history JSON column.
 *
 * Demotion below Observer (1) is impossible.
 */
export async function demoteOnIncident(
  db: DatabaseAdapter,
  reason: string
): Promise<DemotionResult> {
  const stage = await readStage(db);
  if (!stage || stage.current_stage <= 1) return { demoted: false };

  const newStage = stage.current_stage - 1;
  const now = new Date().toISOString();

  // Read the current stage_history (text column) to append.
  const row = await db.get(
    'SELECT stage_history FROM orchestrator_stage WHERE id = ?',
    'default'
  ) as { stage_history: string | null } | undefined;
  const history = row?.stage_history ? (JSON.parse(row.stage_history) as unknown[]) : [];
  history.push({
    stage: stage.current_stage,
    entered_at: stage.stage_entered_at,
    exited_at: now,
    reason: `DEMOTION: ${reason}`,
  });

  await db.run(
    `UPDATE orchestrator_stage SET
       current_stage = ?,
       stage_entered_at = ?,
       stage_history = ?,
       proposals_rated = 0,
       proposals_good_or_relevant = 0,
       proposals_irrelevant_or_wrong = 0,
       updated_at = ?
     WHERE id = 'default'`,
    newStage, now, JSON.stringify(history), now
  );

  // eslint-disable-next-line no-console
  console.log(`[orchestrator-gate] DEMOTION: stage ${stage.current_stage} → ${newStage}. Reason: ${reason}`);

  return {
    demoted: true,
    fromStage: stage.current_stage as Phase,
    toStage: newStage as Phase,
    reason,
  };
}
