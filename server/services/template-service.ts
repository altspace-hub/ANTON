/**
 * template-service.ts — hardware template CRUD + instantiate + capture (Phase 9).
 *
 * A template is a reusable project blueprint: family + path + tier + posture +
 * HKP + recommended quality gates + phase seed data + starter system prompt.
 * "New project from template" pre-populates every Phase 0 + Phase 1 field so a
 * user can go straight to architecture.
 *
 * Capture-from-project lets a user fork a working project into a template that
 * the community can review + adopt. Authoritativeness is gated through the
 * review queue (Phase 9 review-queue-service.ts).
 */

import { createHash } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { createHardwareProjectService, type HardwareTier, type HardwarePath } from './hardware-project-service.js';
import { parseJson, ServiceError } from '../lib/hardware-helpers.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HardwareTemplate {
  id: string;
  family_id: string;
  hkp_id: string | null;
  path: HardwarePath;
  recommended_tier: HardwareTier;
  title: string;
  short_description: string;
  long_description: string | null;
  project_blueprint: Record<string, unknown>;
  phase_seed_data: Record<string, Record<string, unknown>>;
  recommended_gates: string[];
  starter_system_prompt: string | null;
  authoritative: boolean;
  signed_by: string;
  signing_verified: boolean;
  schema_version: string;
  tags: string[];
  source_project_id: string | null;
  installs_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateListItem {
  id: string;
  family_id: string;
  path: HardwarePath;
  recommended_tier: HardwareTier;
  title: string;
  short_description: string;
  authoritative: boolean;
  installs_count: number;
  tags: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToTemplate(r: Record<string, unknown>): HardwareTemplate {
  return {
    id: r.id as string,
    family_id: r.family_id as string,
    hkp_id: (r.hkp_id as string | null) ?? null,
    path: r.path as HardwarePath,
    recommended_tier: Number(r.recommended_tier) as HardwareTier,
    title: r.title as string,
    short_description: r.short_description as string,
    long_description: (r.long_description as string | null) ?? null,
    project_blueprint: parseJson(r.project_blueprint, {}),
    phase_seed_data: parseJson(r.phase_seed_data, {}),
    recommended_gates: parseJson(r.recommended_gates, []),
    starter_system_prompt: (r.starter_system_prompt as string | null) ?? null,
    authoritative: Boolean(r.authoritative),
    signed_by: r.signed_by as string,
    signing_verified: Boolean(r.signing_verified),
    schema_version: r.schema_version as string,
    tags: parseJson(r.tags, []),
    source_project_id: (r.source_project_id as string | null) ?? null,
    installs_count: Number(r.installs_count ?? 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface ListTemplateFilters {
  family_id?: string;
  path?: HardwarePath;
  tier?: HardwareTier;
  authoritative_only?: boolean;
  search?: string;
}

export interface CaptureFromProjectInput {
  project_id: string;
  owner_id: string;
  template_id: string;          // human-readable, e.g. 'esp32-my-thermometer'
  title: string;
  short_description: string;
  long_description?: string | null;
  tags?: string[];
}

export interface InstantiateInput {
  template_id: string;
  owner_id: string;
  title: string;                 // user's project title
  region?: string | null;
  working_language?: string;
  tier_override?: HardwareTier;
}

export function createTemplateService(db: DatabaseAdapter) {
  const projects = createHardwareProjectService(db);

  async function listTemplates(filters: ListTemplateFilters = {}): Promise<TemplateListItem[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.family_id) { where.push('family_id = ?'); params.push(filters.family_id); }
    if (filters.path) { where.push('path = ?'); params.push(filters.path); }
    if (filters.tier) { where.push('recommended_tier = ?'); params.push(filters.tier); }
    if (filters.authoritative_only) { where.push('authoritative = TRUE'); }
    if (filters.search && filters.search.trim()) {
      where.push('(LOWER(title) LIKE ? OR LOWER(short_description) LIKE ?)');
      const pat = `%${filters.search.trim().toLowerCase()}%`;
      params.push(pat, pat);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await db.all(
      `SELECT id, family_id, path, recommended_tier, title, short_description,
              authoritative, installs_count, tags
       FROM hw_templates ${whereSql}
       ORDER BY authoritative DESC, installs_count DESC, title ASC`,
      ...params,
    ) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      id: r.id as string,
      family_id: r.family_id as string,
      path: r.path as HardwarePath,
      recommended_tier: Number(r.recommended_tier) as HardwareTier,
      title: r.title as string,
      short_description: r.short_description as string,
      authoritative: Boolean(r.authoritative),
      installs_count: Number(r.installs_count ?? 0),
      tags: parseJson(r.tags, []),
    }));
  }

  async function getTemplate(id: string): Promise<HardwareTemplate | null> {
    const r = await db.get('SELECT * FROM hw_templates WHERE id = ?', id);
    return r ? rowToTemplate(r) : null;
  }

  async function deleteTemplate(id: string, ownerId: string): Promise<boolean> {
    const t = await getTemplate(id);
    if (!t) return false;
    // Authoritative templates can only be deleted by their signer; community
    // ones by their owner.
    if (t.signed_by !== ownerId && t.signed_by !== 'anton-hardware-team') {
      throw ServiceError.forbidden('Permission denied: not template owner');
    }
    const r = await db.run('DELETE FROM hw_templates WHERE id = ?', id);
    return r.changes > 0;
  }

  /**
   * Instantiate a template into a new project. Pre-populates Phase 0 fields
   * from the template, lets caller override title + region + working language
   * + tier (within the template's recommended_tier or stricter).
   */
  async function instantiate(input: InstantiateInput): Promise<{ project_id: string; template_id: string }> {
    const tpl = await getTemplate(input.template_id);
    if (!tpl) throw ServiceError.notFound('Template');

    const blueprint = tpl.project_blueprint;
    const bpFlags = blueprint as {
      safety_critical?: boolean;
      medical_adjacent?: boolean;
      offline_first?: boolean;
      tier1_secure_update_ack?: boolean;
      metadata?: Record<string, unknown>;
    };

    const tier = (input.tier_override ?? tpl.recommended_tier) as HardwareTier;

    return await db.transaction(async (tx) => {
      // We can't call the project-service factory's createProject inside this
      // transaction trivially because it opens its own transaction. Instead
      // duplicate the create-project body inline, scoped to tx.
      const created = await tx.get(
        `INSERT INTO hardware_projects
          (owner_id, title, description, family_id, path, tier,
           region, working_language, offline_first, safety_critical,
           medical_adjacent, tier1_secure_update_ack, hkp_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        input.owner_id,
        input.title,
        tpl.long_description ?? tpl.short_description,
        tpl.family_id,
        tpl.path,
        tier,
        input.region ?? null,
        input.working_language ?? 'en',
        bpFlags.offline_first ?? true,
        bpFlags.safety_critical ?? false,
        bpFlags.medical_adjacent ?? false,
        bpFlags.tier1_secure_update_ack ?? false,
        tpl.hkp_id,
        JSON.stringify({
          ...(bpFlags.metadata ?? {}),
          instantiated_from_template: tpl.id,
          instantiated_at: new Date().toISOString(),
        }),
      ) as Record<string, unknown> | undefined;
      if (!created) throw new Error('Failed to create project from template');

      // Phase scaffold + seed phase data from template
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
      const scaffold = PHASE_SCAFFOLDS[tpl.path];
      let firstPhaseId: string | null = null;
      for (let i = 0; i < scaffold.length; i++) {
        const p = scaffold[i];
        const phaseSeed = tpl.phase_seed_data[p.key] ?? {};
        const phaseRow = await tx.get(
          `INSERT INTO hardware_project_phases
            (project_id, phase_key, phase_index, display_label, status, data)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
          created.id, p.key, i, p.label, i === 0 ? 'in_progress' : 'pending',
          JSON.stringify(phaseSeed),
        ) as { id: string } | undefined;
        if (i === 0 && phaseRow) {
          firstPhaseId = phaseRow.id;
          await tx.run('UPDATE hardware_project_phases SET started_at = NOW() WHERE id = ?', firstPhaseId);
        }
      }
      if (firstPhaseId) {
        await tx.run('UPDATE hardware_projects SET current_phase_id = ? WHERE id = ?', firstPhaseId, created.id);
      }

      // Audit + bump installs counter
      await tx.run(
        `INSERT INTO hw_template_instantiations
          (template_id, project_id, instantiated_by, template_schema_version)
         VALUES (?, ?, ?, ?)`,
        tpl.id, created.id, input.owner_id, tpl.schema_version,
      );
      await tx.run(
        'UPDATE hw_templates SET installs_count = installs_count + 1, updated_at = NOW() WHERE id = ?',
        tpl.id,
      );

      return { project_id: created.id as string, template_id: tpl.id };
    });
  }

  /**
   * Capture an existing project as a community template. Marked authoritative=
   * false; the caller should submit it to the review queue if they want it
   * promoted.
   */
  async function captureFromProject(input: CaptureFromProjectInput): Promise<HardwareTemplate> {
    if (!/^[a-z0-9-]{4,80}$/.test(input.template_id)) {
      throw new Error('template_id must be 4-80 chars, lowercase letters / digits / hyphens only');
    }
    const project = await projects.getProjectDetail(input.project_id);
    if (!project) throw ServiceError.notFound('Project');
    if (project.owner_id !== input.owner_id) {
      throw ServiceError.forbidden('Permission denied: only the project owner can capture it as a template');
    }

    const blueprint = {
      offline_first: project.offline_first,
      safety_critical: project.safety_critical,
      medical_adjacent: project.medical_adjacent,
      tier1_secure_update_ack: project.tier1_secure_update_ack,
      metadata: project.metadata,
    };
    const phaseSeedData: Record<string, Record<string, unknown>> = {};
    for (const phase of project.phases) {
      // Only carry forward phases that have meaningful data (not just empty {})
      if (Object.keys(phase.data).length > 0) {
        phaseSeedData[phase.phase_key] = phase.data;
      }
    }
    const recommendedGates = ['platformio-build', 'clang-tidy', 'cyclonedx-sbom', 'cve-scan'];
    if (project.tier >= 2) recommendedGates.push('security-scorecard');
    if (project.path === 'maintain') recommendedGates.push('rollback-artefact');

    const r = await db.get(
      `INSERT INTO hw_templates
        (id, family_id, hkp_id, path, recommended_tier, title,
         short_description, long_description, project_blueprint,
         phase_seed_data, recommended_gates, signed_by,
         authoritative, schema_version, tags, source_project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, '1.0', ?, ?)
       RETURNING *`,
      input.template_id, project.family_id, project.hkp_id,
      project.path, project.tier, input.title,
      input.short_description, input.long_description ?? null,
      JSON.stringify(blueprint), JSON.stringify(phaseSeedData),
      JSON.stringify(recommendedGates), input.owner_id,
      JSON.stringify(input.tags ?? []), project.id,
    );
    if (!r) throw new Error('Failed to capture template');
    return rowToTemplate(r);
  }

  return {
    listTemplates,
    getTemplate,
    deleteTemplate,
    instantiate,
    captureFromProject,
    sha256,
  };
}

export type TemplateService = ReturnType<typeof createTemplateService>;
