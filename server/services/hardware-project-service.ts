/**
 * hardware-project-service.ts — CRUD + Phase 0 classification + phases.
 *
 * Backs migration 136. Owner-bound mutations (callers pass owner_id and the
 * service refuses cross-owner writes). Phase progression honours the locked
 * invariants from spec §13:
 *   - Phase 0 classification non-skippable (it lives on the project row itself)
 *   - Develop path advances pre-built phases; user cannot skip the firmware
 *     phase without producing a quality-score artefact
 *   - Connected-device firmware shipping requires either a passing quality run
 *     OR explicit Tier 1 acknowledgement (enforced at quality-pipeline service)
 */

import type { DatabaseAdapter } from '../db/database.js';
import { parseJson, ServiceError } from '../lib/hardware-helpers.js';

// Lazy: regulatory-pack-service is only consulted from a single advancePhase
// branch (Tier 2/3 deploy_operate completion). Loaded once on first hit.
let _regulatoryPackServiceModule: Promise<typeof import('./regulatory-pack-service.js')> | null = null;
function loadRegulatoryPackService() {
  _regulatoryPackServiceModule ??= import('./regulatory-pack-service.js');
  return _regulatoryPackServiceModule;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type HardwarePath = 'diagnose' | 'maintain' | 'develop';
export type HardwareTier = 1 | 2 | 3;
export type ProjectStatus = 'active' | 'paused' | 'archived' | 'shipped';
export type PhaseStatus = 'pending' | 'in_progress' | 'blocked' | 'complete' | 'skipped';

export interface HardwareProject {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  family_id: string;
  path: HardwarePath;
  tier: HardwareTier;
  region: string | null;
  working_language: string;
  offline_first: boolean;
  safety_critical: boolean;
  medical_adjacent: boolean;
  tier1_secure_update_ack: boolean;
  hkp_id: string | null;
  status: ProjectStatus;
  current_phase_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HardwareProjectPhase {
  id: string;
  project_id: string;
  phase_key: string;
  phase_index: number;
  display_label: string;
  status: PhaseStatus;
  artefact_ref: string | null;
  blocking_reason: string | null;
  data: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface HardwareProjectDetail extends HardwareProject {
  phases: HardwareProjectPhase[];
}

// ── Path → phase scaffolds ────────────────────────────────────────────────────

const PHASE_SCAFFOLDS: Record<HardwarePath, Array<{ key: string; label: string }>> = {
  develop: [
    { key: 'requirements',      label: 'Requirements & Constraints' },
    { key: 'architecture',      label: 'Architecture' },
    { key: 'schematic',         label: 'Schematic & BoM' },
    { key: 'firmware',          label: 'Firmware (with quality pipeline)' },
    { key: 'assembly_tests',    label: 'Assembly & Tests' },
    { key: 'deploy_operate',    label: 'Deploy & Operate' },
  ],
  diagnose: [
    { key: 'symptom_capture',   label: 'Symptom Capture' },
    { key: 'hypothesis',        label: 'Hypothesis Generation' },
    { key: 'measurement',       label: 'Measurement' },
    { key: 'resolution',        label: 'Resolution' },
    { key: 'contribution',      label: 'Community Contribution (optional)' },
  ],
  maintain: [
    { key: 'change_scope',      label: 'Change Scope' },
    { key: 'pre_patch_verify',  label: 'Pre-patch Verification' },
    { key: 'patch_sequence',    label: 'Patch Sequencing' },
    { key: 'acceptance_test',   label: 'Per-stage Acceptance Test' },
    { key: 'rollback_plan',     label: 'Rollback Plan' },
    { key: 'post_patch_verify', label: 'Post-patch Verification' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToProject(r: Record<string, unknown>): HardwareProject {
  return {
    id: r.id as string,
    owner_id: r.owner_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    family_id: r.family_id as string,
    path: r.path as HardwarePath,
    tier: Number(r.tier) as HardwareTier,
    region: (r.region as string | null) ?? null,
    working_language: r.working_language as string,
    offline_first: Boolean(r.offline_first),
    safety_critical: Boolean(r.safety_critical),
    medical_adjacent: Boolean(r.medical_adjacent),
    tier1_secure_update_ack: Boolean(r.tier1_secure_update_ack),
    hkp_id: (r.hkp_id as string | null) ?? null,
    status: r.status as ProjectStatus,
    current_phase_id: (r.current_phase_id as string | null) ?? null,
    metadata: parseJson(r.metadata, {}),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function rowToPhase(r: Record<string, unknown>): HardwareProjectPhase {
  return {
    id: r.id as string,
    project_id: r.project_id as string,
    phase_key: r.phase_key as string,
    phase_index: Number(r.phase_index),
    display_label: r.display_label as string,
    status: r.status as PhaseStatus,
    artefact_ref: (r.artefact_ref as string | null) ?? null,
    blocking_reason: (r.blocking_reason as string | null) ?? null,
    data: parseJson(r.data, {}),
    started_at: (r.started_at as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    updated_at: r.updated_at as string,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface CreateProjectInput {
  owner_id: string;
  title: string;
  description?: string | null;
  family_id: string;
  path: HardwarePath;
  tier: HardwareTier;
  region?: string | null;
  working_language?: string;
  offline_first?: boolean;
  safety_critical?: boolean;
  medical_adjacent?: boolean;
  tier1_secure_update_ack?: boolean;
  hkp_id?: string | null;
  metadata?: Record<string, unknown>;
}

export function createHardwareProjectService(db: DatabaseAdapter) {

  async function listProjects(filters: {
    owner_id?: string;
    family_id?: string;
    status?: ProjectStatus;
    path?: HardwarePath;
  } = {}): Promise<HardwareProject[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.owner_id) { where.push('owner_id = ?'); params.push(filters.owner_id); }
    if (filters.family_id) { where.push('family_id = ?'); params.push(filters.family_id); }
    if (filters.status) { where.push('status = ?'); params.push(filters.status); }
    if (filters.path) { where.push('path = ?'); params.push(filters.path); }
    const sql = `SELECT * FROM hardware_projects ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY updated_at DESC`;
    const rows = await db.all(sql, ...params);
    return rows.map(rowToProject);
  }

  async function getProject(id: string): Promise<HardwareProject | null> {
    const r = await db.get('SELECT * FROM hardware_projects WHERE id = ?', id);
    return r ? rowToProject(r) : null;
  }

  async function getProjectDetail(id: string): Promise<HardwareProjectDetail | null> {
    const project = await getProject(id);
    if (!project) return null;
    const phases = await listPhases(id);
    return { ...project, phases };
  }

  async function createProject(input: CreateProjectInput): Promise<HardwareProjectDetail> {
    return await db.transaction(async (tx) => {
      const created = await tx.get(
        `INSERT INTO hardware_projects
          (owner_id, title, description, family_id, path, tier,
           region, working_language, offline_first, safety_critical,
           medical_adjacent, tier1_secure_update_ack, hkp_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        input.owner_id,
        input.title,
        input.description ?? null,
        input.family_id,
        input.path,
        input.tier,
        input.region ?? null,
        input.working_language ?? 'en',
        input.offline_first ?? true,
        input.safety_critical ?? false,
        input.medical_adjacent ?? false,
        input.tier1_secure_update_ack ?? false,
        input.hkp_id ?? null,
        JSON.stringify(input.metadata ?? {}),
      );
      if (!created) throw new Error('Failed to create project');
      const project = rowToProject(created);

      const scaffold = PHASE_SCAFFOLDS[project.path];
      const phases: HardwareProjectPhase[] = [];
      for (let i = 0; i < scaffold.length; i++) {
        const p = scaffold[i];
        const phaseRow = await tx.get(
          `INSERT INTO hardware_project_phases
            (project_id, phase_key, phase_index, display_label, status)
           VALUES (?, ?, ?, ?, ?) RETURNING *`,
          project.id, p.key, i, p.label, i === 0 ? 'in_progress' : 'pending',
        );
        if (phaseRow) phases.push(rowToPhase(phaseRow));
      }

      // Set current_phase_id to the first phase
      if (phases.length > 0) {
        await tx.run(
          'UPDATE hardware_projects SET current_phase_id = ? WHERE id = ?',
          phases[0].id, project.id,
        );
        project.current_phase_id = phases[0].id;
        if (phases[0].status === 'in_progress' && !phases[0].started_at) {
          await tx.run('UPDATE hardware_project_phases SET started_at = NOW() WHERE id = ?', phases[0].id);
        }
      }

      return { ...project, phases };
    });
  }

  async function updateProject(id: string, ownerId: string, patch: Partial<{
    title: string;
    description: string | null;
    region: string | null;
    working_language: string;
    offline_first: boolean;
    safety_critical: boolean;
    medical_adjacent: boolean;
    tier1_secure_update_ack: boolean;
    hkp_id: string | null;
    status: ProjectStatus;
    metadata: Record<string, unknown>;
  }>): Promise<HardwareProject | null> {
    await assertOwner(id, ownerId);
    const sets: string[] = [];
    const params: unknown[] = [];
    if ('title' in patch && patch.title) { sets.push('title = ?'); params.push(patch.title); }
    if ('description' in patch) { sets.push('description = ?'); params.push(patch.description ?? null); }
    if ('region' in patch) { sets.push('region = ?'); params.push(patch.region ?? null); }
    if ('working_language' in patch && patch.working_language) { sets.push('working_language = ?'); params.push(patch.working_language); }
    if ('offline_first' in patch) { sets.push('offline_first = ?'); params.push(patch.offline_first ?? true); }
    if ('safety_critical' in patch) { sets.push('safety_critical = ?'); params.push(patch.safety_critical ?? false); }
    if ('medical_adjacent' in patch) { sets.push('medical_adjacent = ?'); params.push(patch.medical_adjacent ?? false); }
    if ('tier1_secure_update_ack' in patch) { sets.push('tier1_secure_update_ack = ?'); params.push(patch.tier1_secure_update_ack ?? false); }
    if ('hkp_id' in patch) { sets.push('hkp_id = ?'); params.push(patch.hkp_id ?? null); }
    if ('status' in patch && patch.status) { sets.push('status = ?'); params.push(patch.status); }
    if ('metadata' in patch && patch.metadata) { sets.push('metadata = ?'); params.push(JSON.stringify(patch.metadata)); }
    if (sets.length === 0) return getProject(id);
    sets.push('updated_at = NOW()');
    params.push(id);
    const r = await db.get(
      `UPDATE hardware_projects SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
      ...params,
    );
    return r ? rowToProject(r) : null;
  }

  async function deleteProject(id: string, ownerId: string): Promise<boolean> {
    await assertOwner(id, ownerId);
    const r = await db.run('DELETE FROM hardware_projects WHERE id = ?', id);
    return r.changes > 0;
  }

  // ── Phases ──────────────────────────────────────────────────────────────────

  async function listPhases(projectId: string): Promise<HardwareProjectPhase[]> {
    const rows = await db.all(
      'SELECT * FROM hardware_project_phases WHERE project_id = ? ORDER BY phase_index ASC',
      projectId,
    );
    return rows.map(rowToPhase);
  }

  async function getPhase(phaseId: string): Promise<HardwareProjectPhase | null> {
    const r = await db.get('SELECT * FROM hardware_project_phases WHERE id = ?', phaseId);
    return r ? rowToPhase(r) : null;
  }

  async function updatePhaseData(projectId: string, ownerId: string, phaseId: string, data: Record<string, unknown>): Promise<HardwareProjectPhase | null> {
    await assertOwner(projectId, ownerId);
    const r = await db.get(
      `UPDATE hardware_project_phases
       SET data = ?, updated_at = NOW()
       WHERE id = ? AND project_id = ? RETURNING *`,
      JSON.stringify(data), phaseId, projectId,
    );
    return r ? rowToPhase(r) : null;
  }

  /**
   * Advance a phase. Enforces the locked invariants:
   * - The firmware phase (develop path) cannot be marked complete without a
   *   passing quality run. Caller must pass `quality_score_id` proving it.
   * - Tier 3 connected devices cannot complete deploy_operate without an
   *   acknowledged secure-update chain.
   */
  async function advancePhase(projectId: string, ownerId: string, phaseId: string, opts: {
    new_status: PhaseStatus;
    blocking_reason?: string | null;
    artefact_ref?: string | null;
    quality_score_id?: string | null;
  }): Promise<{ phase: HardwareProjectPhase; project: HardwareProject; warnings: string[] }> {
    await assertOwner(projectId, ownerId);
    const project = await getProject(projectId);
    if (!project) throw ServiceError.notFound('Project');
    const phase = await getPhase(phaseId);
    if (!phase || phase.project_id !== projectId) throw ServiceError.notFound('Phase');

    const warnings: string[] = [];

    // Invariant: develop.firmware → complete requires a passing quality_score_id
    if (project.path === 'develop' && phase.phase_key === 'firmware' && opts.new_status === 'complete') {
      if (!opts.quality_score_id) {
        throw new Error('Cannot complete firmware phase without a quality_score_id (the quality pipeline must have produced a non-block verdict)');
      }
      const score = await db.get(
        `SELECT ship_verdict FROM hw_quality_scores WHERE id = ? AND project_id = ?`,
        opts.quality_score_id, projectId,
      ) as { ship_verdict: 'green' | 'amber' | 'block' } | undefined;
      if (!score) throw new Error('quality_score_id not found for this project');
      if (score.ship_verdict === 'block') {
        throw new Error('Quality pipeline returned a `block` verdict — firmware cannot be marked complete');
      }
      if (score.ship_verdict === 'amber') {
        warnings.push('Quality pipeline returned `amber` — firmware completes with caveats');
      }
    }

    // Invariant: develop.deploy_operate → complete on Tier 3 requires Tier1 ack OR
    // confirmation that secure-update chain is in place (recorded in phase.data)
    if (project.path === 'develop' && phase.phase_key === 'deploy_operate' && opts.new_status === 'complete' && project.tier === 3) {
      const data = phase.data as { secure_update_chain?: { signed_image: boolean; verified_boot: boolean; rollback_protected: boolean } };
      const chain = data?.secure_update_chain;
      if (!chain || !chain.signed_image || !chain.verified_boot || !chain.rollback_protected) {
        throw new Error('Tier 3 deploy_operate completion requires secure-update chain: signed image + verified boot + rollback protection (record these in phase.data.secure_update_chain)');
      }
    }

    // Invariant: develop.deploy_operate → complete on Tier 2 / Tier 3 requires
    // every required regulatory artefact to be signed off (per spec §13).
    if (project.path === 'develop' && phase.phase_key === 'deploy_operate' && opts.new_status === 'complete' && project.tier >= 2) {
      const { createRegulatoryPackService } = await loadRegulatoryPackService();
      const reg = createRegulatoryPackService(db);
      const summary = await reg.assessCompleteness({ project_id: projectId });
      if (!summary.ready_to_ship) {
        const reasons = summary.blockers.slice(0, 5).join(' | ');
        throw new Error(`Tier ${project.tier} deploy_operate completion requires the regulatory pack signed off (${summary.signed_off}/${summary.required_total} signed). Blockers: ${reasons}`);
      }
    }

    // Apply the status change
    const transitions: Record<string, string> = {
      complete: 'completed_at = NOW()',
      in_progress: 'started_at = COALESCE(started_at, NOW())',
    };
    const extra = transitions[opts.new_status] ?? '';
    const setSql = [
      'status = ?',
      'blocking_reason = ?',
      'artefact_ref = ?',
      'updated_at = NOW()',
      extra,
    ].filter(Boolean).join(', ');

    const updated = await db.get(
      `UPDATE hardware_project_phases
       SET ${setSql}
       WHERE id = ? RETURNING *`,
      opts.new_status,
      opts.blocking_reason ?? null,
      opts.artefact_ref ?? phase.artefact_ref,
      phaseId,
    );
    if (!updated) throw new Error('Failed to update phase');
    const newPhase = rowToPhase(updated);

    // Auto-advance current_phase_id if this completion unblocks the next phase
    if (opts.new_status === 'complete') {
      const next = await db.get(
        `SELECT * FROM hardware_project_phases
         WHERE project_id = ? AND phase_index > ? AND status = 'pending'
         ORDER BY phase_index ASC LIMIT 1`,
        projectId, newPhase.phase_index,
      );
      if (next) {
        const nextPhase = rowToPhase(next);
        await db.run(
          `UPDATE hardware_project_phases SET status = 'in_progress', started_at = NOW() WHERE id = ?`,
          nextPhase.id,
        );
        await db.run(
          'UPDATE hardware_projects SET current_phase_id = ?, updated_at = NOW() WHERE id = ?',
          nextPhase.id, projectId,
        );
      } else {
        // No more phases — mark project shipped if develop, else just update
        if (project.path === 'develop') {
          await db.run(
            `UPDATE hardware_projects SET status = 'shipped', updated_at = NOW() WHERE id = ?`,
            projectId,
          );
        }
      }
    }

    const refreshed = await getProject(projectId);
    return { phase: newPhase, project: refreshed!, warnings };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async function assertOwner(projectId: string, ownerId: string): Promise<void> {
    const r = await db.get(
      'SELECT owner_id FROM hardware_projects WHERE id = ?',
      projectId,
    ) as { owner_id: string } | undefined;
    if (!r) throw ServiceError.notFound('Project');
    if (r.owner_id !== ownerId) throw ServiceError.forbidden('Permission denied: not project owner');
  }

  return {
    listProjects,
    getProject,
    getProjectDetail,
    createProject,
    updateProject,
    deleteProject,
    listPhases,
    getPhase,
    updatePhaseData,
    advancePhase,
  };
}

export type HardwareProjectService = ReturnType<typeof createHardwareProjectService>;
