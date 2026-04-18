/**
 * regulatory-pack-adapter.ts — Develop-tier-2+ regulatory pack completeness.
 *
 * Already real since Phase 7: queries regulatory-pack-service.assessCompleteness().
 * Pass when every required artefact is signed off.
 */

import type { QualityAdapter } from '../quality-pipeline-service.js';
import { createRegulatoryPackService } from '../regulatory-pack-service.js';

const INSTALL_HINT = 'No external tool needed. Generate + sign each required regulatory artefact via /hardware/projects/:id/regulatory.';

export async function detect(): Promise<{ installed: boolean; version: string | null; install_hint: string }> {
  return { installed: true, version: 'regulatory-pack-1.0', install_hint: INSTALL_HINT };
}

const regulatoryPackAdapter: QualityAdapter = {
  gateKey: 'regulatory-pack-complete',
  displayLabel: 'Regulatory pack complete',
  isMandatory: true,
  kind: 'real',
  version: '0.2.0',
  appliesTo: (project) => project.path === 'develop' && project.tier >= 2,
  run: async ({ db, project }) => {
    const start = Date.now();
    const reg = createRegulatoryPackService(db);
    const summary = await reg.assessCompleteness({ project_id: project.id });

    if (summary.ready_to_ship) {
      return {
        outcome: 'pass', score: 100,
        summary: `${summary.signed_off}/${summary.required_total} required regulatory artefacts signed off.`,
        details: { ...summary, project_tier: project.tier },
        durationMs: Date.now() - start,
      };
    }

    const hasMissing = summary.missing > 0;
    return {
      outcome: hasMissing ? 'fail' : 'warn',
      score: Math.round((summary.signed_off / Math.max(summary.required_total, 1)) * 100),
      summary: hasMissing
        ? `${summary.missing}/${summary.required_total} required regulatory artefacts missing.`
        : `All required artefacts present but ${summary.required_total - summary.signed_off} not yet signed off.`,
      details: { ...summary, project_tier: project.tier },
      durationMs: Date.now() - start,
    };
  },
};

export default regulatoryPackAdapter;
