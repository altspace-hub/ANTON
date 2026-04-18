/**
 * rollback-artefact-adapter.ts — Maintain-path-only rollback artefact check.
 *
 * Already real since Phase 6: ensures every active patch plan on a maintain-
 * path project has a rollback_artefact_ref + (Tier 3) the secure-update chain.
 */

import type { QualityAdapter } from '../quality-pipeline-service.js';

const INSTALL_HINT = 'No external tool needed. Create + populate hw_patch_plans for the project (or skip if you have no active maintain plans).';

export async function detect(): Promise<{ installed: boolean; version: string | null; install_hint: string }> {
  return { installed: true, version: 'rollback-check-1.0', install_hint: INSTALL_HINT };
}

const rollbackArtefactAdapter: QualityAdapter = {
  gateKey: 'rollback-artefact',
  displayLabel: 'Rollback artefact present',
  isMandatory: true,
  kind: 'real',
  version: '0.2.0',
  appliesTo: (project) => project.path === 'maintain',
  run: async ({ db, project }) => {
    const start = Date.now();
    const plans = await db.all(
      `SELECT id, title, rollback_artefact_ref, signed_image, verified_boot, rollback_protected, status
       FROM hw_patch_plans
       WHERE project_id = ? AND status NOT IN ('cancelled', 'rolled_back')
       ORDER BY created_at DESC`,
      project.id,
    ) as Array<{
      id: string; title: string;
      rollback_artefact_ref: string | null;
      signed_image: boolean; verified_boot: boolean; rollback_protected: boolean;
      status: string;
    }>;

    if (plans.length === 0) {
      return {
        outcome: 'skip', score: null,
        summary: 'No active patch plans to evaluate. Create a Maintain patch plan first.',
        details: { plan_count: 0 },
        durationMs: Date.now() - start,
      };
    }

    const failingPlans: Array<{ id: string; title: string; reason: string }> = [];
    for (const p of plans) {
      const reasons: string[] = [];
      if (!p.rollback_artefact_ref) reasons.push('missing rollback_artefact_ref');
      if (project.tier === 3) {
        if (!p.signed_image) reasons.push('Tier 3 requires signed_image=true');
        if (!p.verified_boot) reasons.push('Tier 3 requires verified_boot=true');
        if (!p.rollback_protected) reasons.push('Tier 3 requires rollback_protected=true');
      }
      if (reasons.length > 0) failingPlans.push({ id: p.id, title: p.title, reason: reasons.join('; ') });
    }

    if (failingPlans.length > 0) {
      return {
        outcome: 'fail', score: 0,
        summary: `${failingPlans.length} of ${plans.length} active patch plan(s) missing required rollback / secure-update fields`,
        details: { failing_plans: failingPlans, total_plans: plans.length, project_tier: project.tier },
        durationMs: Date.now() - start,
      };
    }

    return {
      outcome: 'pass', score: 100,
      summary: `All ${plans.length} active patch plan(s) have required rollback artefact${project.tier === 3 ? ' + secure-update chain' : ''}.`,
      details: { plan_count: plans.length, project_tier: project.tier },
      durationMs: Date.now() - start,
    };
  },
};

export default rollbackArtefactAdapter;
