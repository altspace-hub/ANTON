/**
 * maintain-service.ts — patch plans, stages, fleet rollout (Phase 6).
 *
 * Locked invariants per spec §13:
 *   - No patch ships without rollback_artefact_ref (set on the plan, not the stage).
 *   - Tier 3 connected-device patches require signed_image + verified_boot
 *     + rollback_protected to be true on the plan before any stage advances.
 *   - Fleets larger than 5 devices require a canary stage before any wave
 *     stage can start; this is enforced when transitioning the wave stage
 *     from pending → in_progress.
 *
 * Owner-bound mutations: every public method that writes asserts the caller
 * owns the project (mirrors hardware-project-service.ts).
 */

import type { DatabaseAdapter } from '../db/database.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeKind =
  | 'firmware-update' | 'config-change' | 'calibration'
  | 'partition-table' | 'secure-boot-burn' | 'recall';

export type PlanStatus =
  | 'draft' | 'ready' | 'in_progress' | 'paused' | 'rolled_back' | 'complete' | 'cancelled';

export type StageKind = 'canary' | 'wave' | 'full-rollout' | 'verification' | 'soak';

export type StageStatus =
  | 'pending' | 'in_progress' | 'soaking' | 'passed' | 'failed' | 'rolled_back' | 'skipped';

export type RolloutStatus =
  | 'pending' | 'queued' | 'sent' | 'applying' | 'verified' | 'failed' | 'rolled_back' | 'skipped';

export type DeliveryChannel = 'ota' | 'usb' | 'aap-store-and-forward' | 'manual';

export type FleetDeviceStatus = 'active' | 'paused' | 'decommissioned' | 'lost';

export interface PatchPlan {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  change_kind: ChangeKind;
  source_event_id: string | null;
  rollback_artefact_ref: string | null;
  rollback_artefact_hash: string | null;
  signed_image: boolean;
  verified_boot: boolean;
  rollback_protected: boolean;
  status: PlanStatus;
  audit_trail: Array<{ ts: string; actor: string; action: string; note?: string }>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AcceptanceRule {
  metric: string;
  operator: '<' | '<=' | '==' | '>=' | '>' | '!=' | 'within';
  threshold: number | string | { min: number; max: number };
  observed_via: string;
}

export interface AcceptanceResult {
  metric: string;
  observed: number | string;
  pass: boolean;
}

export interface PatchStage {
  id: string;
  plan_id: string;
  stage_index: number;
  stage_kind: StageKind;
  title: string;
  description: string | null;
  cohort: { device_ids?: string[]; percentage?: number; all?: boolean };
  acceptance_rules: AcceptanceRule[];
  status: StageStatus;
  rollback_on_failure: boolean;
  started_at: string | null;
  completed_at: string | null;
  acceptance_results: AcceptanceResult[];
  notes: string | null;
}

export interface FleetDevice {
  id: string;
  project_id: string;
  device_label: string;
  hardware_serial: string | null;
  region: string | null;
  current_firmware: string | null;
  last_seen_at: string | null;
  status: FleetDeviceStatus;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PatchRollout {
  id: string;
  plan_id: string;
  stage_id: string;
  device_id: string;
  status: RolloutStatus;
  rollout_started: string | null;
  rollout_completed: string | null;
  pre_patch_state: Record<string, unknown> | null;
  post_patch_state: Record<string, unknown> | null;
  failure_reason: string | null;
  delivery_channel: DeliveryChannel | null;
  notes: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function rowToPlan(r: Record<string, unknown>): PatchPlan {
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    change_kind: r.change_kind as ChangeKind,
    source_event_id: (r.source_event_id as string | null) ?? null,
    rollback_artefact_ref: (r.rollback_artefact_ref as string | null) ?? null,
    rollback_artefact_hash: (r.rollback_artefact_hash as string | null) ?? null,
    signed_image: Boolean(r.signed_image),
    verified_boot: Boolean(r.verified_boot),
    rollback_protected: Boolean(r.rollback_protected),
    status: r.status as PlanStatus,
    audit_trail: parseJson(r.audit_trail, [] as PatchPlan['audit_trail']),
    created_by: r.created_by as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function rowToStage(r: Record<string, unknown>): PatchStage {
  return {
    id: r.id as string,
    plan_id: r.plan_id as string,
    stage_index: Number(r.stage_index),
    stage_kind: r.stage_kind as StageKind,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    cohort: parseJson(r.cohort, {}),
    acceptance_rules: parseJson(r.acceptance_rules, []),
    status: r.status as StageStatus,
    rollback_on_failure: Boolean(r.rollback_on_failure),
    started_at: (r.started_at as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    acceptance_results: parseJson(r.acceptance_results, []),
    notes: (r.notes as string | null) ?? null,
  };
}

function rowToDevice(r: Record<string, unknown>): FleetDevice {
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    device_label: r.device_label as string,
    hardware_serial: (r.hardware_serial as string | null) ?? null,
    region: (r.region as string | null) ?? null,
    current_firmware: (r.current_firmware as string | null) ?? null,
    last_seen_at: (r.last_seen_at as string | null) ?? null,
    status: r.status as FleetDeviceStatus,
    metadata: parseJson(r.metadata, {}),
    created_at: r.created_at as string,
  };
}

function rowToRollout(r: Record<string, unknown>): PatchRollout {
  return {
    id: r.id as string,
    plan_id: r.plan_id as string,
    stage_id: r.stage_id as string,
    device_id: r.device_id as string,
    status: r.status as RolloutStatus,
    rollout_started: (r.rollout_started as string | null) ?? null,
    rollout_completed: (r.rollout_completed as string | null) ?? null,
    pre_patch_state: parseJson(r.pre_patch_state, null),
    post_patch_state: parseJson(r.post_patch_state, null),
    failure_reason: (r.failure_reason as string | null) ?? null,
    delivery_channel: (r.delivery_channel as DeliveryChannel | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

function evaluateRule(rule: AcceptanceRule, observed: number | string): boolean {
  switch (rule.operator) {
    case '<':  return Number(observed) < Number(rule.threshold);
    case '<=': return Number(observed) <= Number(rule.threshold);
    case '==': return observed === rule.threshold;
    case '!=': return observed !== rule.threshold;
    case '>=': return Number(observed) >= Number(rule.threshold);
    case '>':  return Number(observed) > Number(rule.threshold);
    case 'within':
      if (typeof rule.threshold === 'object' && rule.threshold && 'min' in rule.threshold) {
        const n = Number(observed);
        return n >= rule.threshold.min && n <= rule.threshold.max;
      }
      return false;
    default: return false;
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface CreatePatchPlanInput {
  project_id: string;
  owner_id: string;
  title: string;
  description?: string | null;
  change_kind: ChangeKind;
  source_event_id?: string | null;
}

export function createMaintainService(db: DatabaseAdapter) {

  // ── Plans ───────────────────────────────────────────────────────────────────

  async function listPlans(projectId: string): Promise<PatchPlan[]> {
    const rows = await db.all(
      `SELECT * FROM hw_patch_plans WHERE project_id = ? ORDER BY created_at DESC`,
      projectId,
    );
    return rows.map(rowToPlan);
  }

  async function getPlan(planId: string): Promise<PatchPlan | null> {
    const r = await db.get('SELECT * FROM hw_patch_plans WHERE id = ?', planId);
    return r ? rowToPlan(r) : null;
  }

  async function createPlan(input: CreatePatchPlanInput): Promise<PatchPlan> {
    await assertProjectOwner(input.project_id, input.owner_id);
    const audit = [{
      ts: new Date().toISOString(),
      actor: input.owner_id,
      action: 'plan-created',
      note: `change_kind=${input.change_kind}`,
    }];
    const r = await db.get(
      `INSERT INTO hw_patch_plans
        (project_id, title, description, change_kind, source_event_id,
         status, audit_trail, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?) RETURNING *`,
      input.project_id, input.title, input.description ?? null,
      input.change_kind, input.source_event_id ?? null,
      JSON.stringify(audit), input.owner_id,
    );
    if (!r) throw new Error('Failed to create patch plan');
    return rowToPlan(r);
  }

  async function updatePlan(planId: string, ownerId: string, patch: Partial<{
    title: string;
    description: string | null;
    rollback_artefact_ref: string | null;
    rollback_artefact_hash: string | null;
    signed_image: boolean;
    verified_boot: boolean;
    rollback_protected: boolean;
    status: PlanStatus;
  }>): Promise<PatchPlan | null> {
    const plan = await getPlan(planId);
    if (!plan) return null;
    await assertProjectOwner(plan.project_id, ownerId);

    // Locked invariant: cannot move from draft → ready without rollback_artefact_ref
    if (patch.status === 'ready' && !(patch.rollback_artefact_ref ?? plan.rollback_artefact_ref)) {
      throw new Error('Cannot mark plan ready without rollback_artefact_ref');
    }

    // Locked invariant: cannot move plan to in_progress on Tier 3 connected
    // device without secure-update chain in place.
    if (patch.status === 'in_progress') {
      const project = await db.get(
        `SELECT tier, offline_first FROM hardware_projects WHERE id = ?`,
        plan.project_id,
      ) as { tier: number; offline_first: boolean } | undefined;
      if (project && project.tier === 3) {
        const merged = {
          signed_image: patch.signed_image ?? plan.signed_image,
          verified_boot: patch.verified_boot ?? plan.verified_boot,
          rollback_protected: patch.rollback_protected ?? plan.rollback_protected,
        };
        if (!merged.signed_image || !merged.verified_boot || !merged.rollback_protected) {
          throw new Error('Tier 3 patch plans require signed_image + verified_boot + rollback_protected before activation');
        }
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if ('title' in patch && patch.title) { sets.push('title = ?'); params.push(patch.title); }
    if ('description' in patch) { sets.push('description = ?'); params.push(patch.description ?? null); }
    if ('rollback_artefact_ref' in patch) { sets.push('rollback_artefact_ref = ?'); params.push(patch.rollback_artefact_ref ?? null); }
    if ('rollback_artefact_hash' in patch) { sets.push('rollback_artefact_hash = ?'); params.push(patch.rollback_artefact_hash ?? null); }
    if ('signed_image' in patch) { sets.push('signed_image = ?'); params.push(patch.signed_image ?? false); }
    if ('verified_boot' in patch) { sets.push('verified_boot = ?'); params.push(patch.verified_boot ?? false); }
    if ('rollback_protected' in patch) { sets.push('rollback_protected = ?'); params.push(patch.rollback_protected ?? false); }
    if ('status' in patch && patch.status) { sets.push('status = ?'); params.push(patch.status); }

    if (sets.length === 0) return plan;

    const newAudit = [...plan.audit_trail, {
      ts: new Date().toISOString(),
      actor: ownerId,
      action: 'plan-updated',
      note: Object.keys(patch).join(','),
    }];
    sets.push('audit_trail = ?'); params.push(JSON.stringify(newAudit));
    sets.push('updated_at = NOW()');
    params.push(planId);

    const r = await db.get(
      `UPDATE hw_patch_plans SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
      ...params,
    );
    return r ? rowToPlan(r) : null;
  }

  // ── Stages ─────────────────────────────────────────────────────────────────

  async function listStages(planId: string): Promise<PatchStage[]> {
    const rows = await db.all(
      `SELECT * FROM hw_patch_stages WHERE plan_id = ? ORDER BY stage_index ASC`,
      planId,
    );
    return rows.map(rowToStage);
  }

  async function addStage(planId: string, ownerId: string, input: {
    stage_kind: StageKind;
    title: string;
    description?: string | null;
    cohort: PatchStage['cohort'];
    acceptance_rules: AcceptanceRule[];
    rollback_on_failure?: boolean;
  }): Promise<PatchStage> {
    const plan = await getPlan(planId);
    if (!plan) throw new Error('Plan not found');
    await assertProjectOwner(plan.project_id, ownerId);

    const last = await db.get(
      `SELECT MAX(stage_index) AS max_idx FROM hw_patch_stages WHERE plan_id = ?`,
      planId,
    ) as { max_idx: number | string | null } | undefined;
    const nextIndex = last?.max_idx === null || last?.max_idx === undefined ? 0 : Number(last.max_idx) + 1;

    const r = await db.get(
      `INSERT INTO hw_patch_stages
        (plan_id, stage_index, stage_kind, title, description,
         cohort, acceptance_rules, rollback_on_failure)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      planId, nextIndex, input.stage_kind, input.title, input.description ?? null,
      JSON.stringify(input.cohort), JSON.stringify(input.acceptance_rules),
      input.rollback_on_failure ?? true,
    );
    if (!r) throw new Error('Failed to add stage');
    return rowToStage(r);
  }

  /**
   * Advance a stage. Enforces:
   *  - parent plan rollback_artefact_ref must be set
   *  - if stage is `wave` and project fleet > 5 devices, an earlier `canary`
   *    stage must have status='passed' before this stage can move to in_progress
   */
  async function advanceStage(stageId: string, ownerId: string, newStatus: StageStatus): Promise<PatchStage | null> {
    const stage = await db.get('SELECT * FROM hw_patch_stages WHERE id = ?', stageId) as Record<string, unknown> | undefined;
    if (!stage) return null;
    const parsed = rowToStage(stage);
    const plan = await getPlan(parsed.plan_id);
    if (!plan) throw new Error('Parent plan not found');
    await assertProjectOwner(plan.project_id, ownerId);

    if (newStatus === 'in_progress') {
      if (!plan.rollback_artefact_ref) {
        throw new Error('Cannot start a stage without plan.rollback_artefact_ref');
      }
      if (parsed.stage_kind === 'wave') {
        const fleetCount = await db.get(
          `SELECT COUNT(*) AS n FROM hw_fleet_devices WHERE project_id = ? AND status = 'active'`,
          plan.project_id,
        ) as { n: string | number } | undefined;
        if (fleetCount && Number(fleetCount.n) > 5) {
          const earlierCanaryPassed = await db.get(
            `SELECT 1 FROM hw_patch_stages
             WHERE plan_id = ? AND stage_kind = 'canary' AND status = 'passed' AND stage_index < ?`,
            parsed.plan_id, parsed.stage_index,
          );
          if (!earlierCanaryPassed) {
            throw new Error(`Wave stage cannot start: fleet has > 5 active devices and no earlier canary stage has passed`);
          }
        }
      }
    }

    const transitions: Record<string, string> = {
      in_progress: 'started_at = COALESCE(started_at, NOW())',
      passed: 'completed_at = NOW()',
      failed: 'completed_at = NOW()',
      rolled_back: 'completed_at = NOW()',
      skipped: 'completed_at = NOW()',
    };
    const extra = transitions[newStatus] ?? '';
    const setSql = ['status = ?', 'notes = COALESCE(notes, \'\')', extra].filter(Boolean).join(', ');

    const r = await db.get(
      `UPDATE hw_patch_stages SET ${setSql} WHERE id = ? RETURNING *`,
      newStatus, stageId,
    );
    return r ? rowToStage(r) : null;
  }

  /**
   * Record an acceptance test result. Compares observed values against the
   * stage's acceptance_rules; if any required rule fails AND
   * rollback_on_failure is true, automatically marks the stage `failed`.
   */
  async function recordAcceptance(stageId: string, ownerId: string, observations: Array<{ metric: string; observed: number | string }>): Promise<{ stage: PatchStage; allPassed: boolean }> {
    const r = await db.get('SELECT * FROM hw_patch_stages WHERE id = ?', stageId) as Record<string, unknown> | undefined;
    if (!r) throw new Error('Stage not found');
    const stage = rowToStage(r);
    const plan = await getPlan(stage.plan_id);
    if (!plan) throw new Error('Plan not found');
    await assertProjectOwner(plan.project_id, ownerId);

    const results: AcceptanceResult[] = stage.acceptance_rules.map(rule => {
      const obs = observations.find(o => o.metric === rule.metric);
      if (!obs) return { metric: rule.metric, observed: 'not-recorded', pass: false };
      return { metric: rule.metric, observed: obs.observed, pass: evaluateRule(rule, obs.observed) };
    });

    const allPassed = results.length > 0 && results.every(r => r.pass);

    let nextStatus: StageStatus = stage.status;
    if (results.length > 0) {
      if (allPassed) nextStatus = 'passed';
      else if (stage.rollback_on_failure) nextStatus = 'failed';
    }

    const completed = nextStatus === 'passed' || nextStatus === 'failed' || nextStatus === 'rolled_back';
    const setSql = completed
      ? 'acceptance_results = ?, status = ?, completed_at = NOW()'
      : 'acceptance_results = ?, status = ?';

    const updated = await db.get(
      `UPDATE hw_patch_stages SET ${setSql} WHERE id = ? RETURNING *`,
      JSON.stringify(results), nextStatus, stageId,
    );
    return { stage: updated ? rowToStage(updated) : stage, allPassed };
  }

  // ── Fleet devices ──────────────────────────────────────────────────────────

  async function listFleet(projectId: string): Promise<FleetDevice[]> {
    const rows = await db.all(
      `SELECT * FROM hw_fleet_devices WHERE project_id = ? ORDER BY device_label ASC`,
      projectId,
    );
    return rows.map(rowToDevice);
  }

  async function addDevice(input: {
    project_id: string;
    owner_id: string;
    device_label: string;
    hardware_serial?: string | null;
    region?: string | null;
    current_firmware?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<FleetDevice> {
    await assertProjectOwner(input.project_id, input.owner_id);
    const r = await db.get(
      `INSERT INTO hw_fleet_devices
        (project_id, device_label, hardware_serial, region, current_firmware, metadata)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      input.project_id, input.device_label, input.hardware_serial ?? null,
      input.region ?? null, input.current_firmware ?? null,
      JSON.stringify(input.metadata ?? {}),
    );
    if (!r) throw new Error('Failed to add device');
    return rowToDevice(r);
  }

  // ── Rollouts (per device per stage) ────────────────────────────────────────

  async function planRollout(stageId: string, ownerId: string, opts: {
    delivery_channel: DeliveryChannel;
  }): Promise<PatchRollout[]> {
    const rStage = await db.get('SELECT * FROM hw_patch_stages WHERE id = ?', stageId) as Record<string, unknown> | undefined;
    if (!rStage) throw new Error('Stage not found');
    const stage = rowToStage(rStage);
    const plan = await getPlan(stage.plan_id);
    if (!plan) throw new Error('Plan not found');
    await assertProjectOwner(plan.project_id, ownerId);

    // Resolve cohort to device_ids
    let deviceIds: string[];
    if (stage.cohort.device_ids && stage.cohort.device_ids.length > 0) {
      deviceIds = stage.cohort.device_ids;
    } else if (stage.cohort.all) {
      const rows = await db.all(
        `SELECT id FROM hw_fleet_devices WHERE project_id = ? AND status = 'active'`,
        plan.project_id,
      ) as Array<{ id: string }>;
      deviceIds = rows.map(r => r.id);
    } else if (stage.cohort.percentage) {
      const rows = await db.all(
        `SELECT id FROM hw_fleet_devices WHERE project_id = ? AND status = 'active' ORDER BY id`,
        plan.project_id,
      ) as Array<{ id: string }>;
      const k = Math.max(1, Math.ceil(rows.length * (stage.cohort.percentage / 100)));
      deviceIds = rows.slice(0, k).map(r => r.id);
    } else {
      deviceIds = [];
    }

    const rollouts: PatchRollout[] = [];
    for (const did of deviceIds) {
      const r = await db.get(
        `INSERT INTO hw_patch_rollouts
          (plan_id, stage_id, device_id, status, delivery_channel, rollout_started)
         VALUES (?, ?, ?, 'queued', ?, NOW())
         ON CONFLICT (stage_id, device_id) DO UPDATE SET status = 'queued', rollout_started = NOW()
         RETURNING *`,
        plan.id, stageId, did, opts.delivery_channel,
      );
      if (r) rollouts.push(rowToRollout(r));
    }
    return rollouts;
  }

  async function listRolloutsForStage(stageId: string): Promise<Array<PatchRollout & { device_label: string }>> {
    const rows = await db.all(
      `SELECT r.*, d.device_label
       FROM hw_patch_rollouts r
       JOIN hw_fleet_devices d ON d.id = r.device_id
       WHERE r.stage_id = ? ORDER BY d.device_label`,
      stageId,
    );
    return (rows as Array<Record<string, unknown>>).map(r => ({
      ...rowToRollout(r),
      device_label: r.device_label as string,
    }));
  }

  async function updateRolloutStatus(rolloutId: string, ownerId: string, opts: {
    status: RolloutStatus;
    failure_reason?: string | null;
    pre_patch_state?: Record<string, unknown> | null;
    post_patch_state?: Record<string, unknown> | null;
  }): Promise<PatchRollout | null> {
    const r0 = await db.get('SELECT plan_id FROM hw_patch_rollouts WHERE id = ?', rolloutId) as { plan_id: string } | undefined;
    if (!r0) return null;
    const plan = await getPlan(r0.plan_id);
    if (!plan) throw new Error('Plan not found');
    await assertProjectOwner(plan.project_id, ownerId);

    const sets: string[] = ['status = ?'];
    const params: unknown[] = [opts.status];
    if (opts.failure_reason !== undefined) { sets.push('failure_reason = ?'); params.push(opts.failure_reason); }
    if (opts.pre_patch_state !== undefined) { sets.push('pre_patch_state = ?'); params.push(opts.pre_patch_state ? JSON.stringify(opts.pre_patch_state) : null); }
    if (opts.post_patch_state !== undefined) { sets.push('post_patch_state = ?'); params.push(opts.post_patch_state ? JSON.stringify(opts.post_patch_state) : null); }
    if (opts.status === 'verified' || opts.status === 'failed' || opts.status === 'rolled_back') {
      sets.push('rollout_completed = NOW()');
    }
    params.push(rolloutId);

    const r = await db.get(
      `UPDATE hw_patch_rollouts SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
      ...params,
    );
    return r ? rowToRollout(r) : null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async function assertProjectOwner(projectId: string, ownerId: string): Promise<void> {
    const r = await db.get(
      'SELECT owner_id FROM hardware_projects WHERE id = ?',
      projectId,
    ) as { owner_id: string } | undefined;
    if (!r) throw new Error('Project not found');
    if (r.owner_id !== ownerId) throw new Error('Permission denied: not project owner');
  }

  return {
    listPlans,
    getPlan,
    createPlan,
    updatePlan,
    listStages,
    addStage,
    advanceStage,
    recordAcceptance,
    listFleet,
    addDevice,
    planRollout,
    listRolloutsForStage,
    updateRolloutStatus,
  };
}

export type MaintainService = ReturnType<typeof createMaintainService>;
