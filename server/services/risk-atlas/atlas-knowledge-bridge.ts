// ── Atlas Knowledge Bridge ───────────────────────────────────────────────
//
// Spec §4.1 + §4.6: every Atlas entry generates atoms of type 'risk',
// 'control', 'finding', 'recommendation' so the whole Atlas flows into the
// Cross-Workflow Intelligence funnel automatically. This service is the
// outbound bridge — Atlas state → knowledge_atoms.
//
// Best-effort: failures here never block Atlas operations. The atoms
// pipeline is enrichment, not a transactional dependency.
//
// Uses the existing knowledge_atoms shape (verified in the investigation
// memo): id, source_workflow_id, source_execution_id, source_area_id,
// source_module_id, content, atom_type, confidence, category, subcategory,
// tags, created_at.

import type { DatabaseAdapter } from '../../db/database.js';
import { randomUUID } from 'crypto';
import type {
  RiskAtlasRow, AtlasThreatPathRow, AtlasControlRow, AtlasVulnerabilityRow,
  AtlasResidualScoreRow, AtlasAppetiteStatementRow, FcpDomain,
} from './types.js';

export type AtlasAtomType = 'risk' | 'control' | 'finding' | 'recommendation';

interface PushAtomInput {
  atlas: RiskAtlasRow;
  type: AtlasAtomType;
  content: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  confidence?: number;
  sourceModuleId?: string;
}

export function createAtlasKnowledgeBridge(db: DatabaseAdapter) {
  async function pushAtom(input: PushAtomInput): Promise<string | null> {
    const id = `kna_${randomUUID().slice(0, 12)}`;
    const tags = JSON.stringify([
      'risk-atlas',
      `atlas:${input.atlas.id}`,
      ...(input.atlas.industry_pack_id ? [`pack:${input.atlas.industry_pack_id}`] : []),
      ...(input.tags ?? []),
    ]);
    try {
      await db.run(
        `INSERT INTO knowledge_atoms
          (id, source_module_id, source_area_id, content, atom_type, confidence,
           category, subcategory, tags, created_at)
         VALUES (?, ?, 'risk', ?, ?, ?, ?, ?, ?, NOW())`,
        id, input.sourceModuleId ?? 'risk-atlas', input.content, input.type,
        input.confidence ?? 0.85, input.category ?? null, input.subcategory ?? null, tags,
      );
      return id;
    } catch (err) {
      console.warn('[atlas-knowledge-bridge] pushAtom failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /** Push a risk atom for a threat path (with residual context). */
  async function pushThreatPathAtom(atlas: RiskAtlasRow, path: AtlasThreatPathRow, residual: AtlasResidualScoreRow | null): Promise<string | null> {
    const residualText = residual ? `Residual: ${residual.residual_score}/5 (rollup: ${residual.control_quality_rollup})` : 'Residual: not yet calculated';
    const fcpTag: string[] = path.fcp_domain ? [`fcp:${path.fcp_domain as FcpDomain}`] : [];
    return pushAtom({
      atlas, type: 'risk',
      content: `${path.path_code} — ${path.name}. ${path.description ?? ''} ${residualText}`,
      category: 'threat-path',
      subcategory: path.fcp_domain ?? 'general',
      tags: [...fcpTag, `path-code:${path.path_code}`],
    });
  }

  /** Push a control atom (Stage 5). */
  async function pushControlAtom(atlas: RiskAtlasRow, control: AtlasControlRow): Promise<string | null> {
    return pushAtom({
      atlas, type: 'control',
      content: `${control.control_code} — ${control.name} [${control.type} / ${control.strength}]. ${control.description ?? ''}${control.evidence ? ` Evidence: ${control.evidence}` : ''}`,
      category: 'control',
      subcategory: control.type,
      tags: [`control-type:${control.type}`, `strength:${control.strength}`, `code:${control.control_code}`],
    });
  }

  /** Push a finding atom (Stage 3 — vulnerability becomes a finding). */
  async function pushVulnerabilityFinding(atlas: RiskAtlasRow, vuln: AtlasVulnerabilityRow): Promise<string | null> {
    return pushAtom({
      atlas, type: 'finding',
      content: `${vuln.vuln_code} — ${vuln.name} (severity ${vuln.severity}/5). ${vuln.description ?? ''}`,
      category: 'vulnerability',
      tags: [`severity:${vuln.severity}`, `code:${vuln.vuln_code}`],
    });
  }

  /** Push a recommendation atom (Stage 7 — appetite-driven action). */
  async function pushAppetiteRecommendation(atlas: RiskAtlasRow, appetite: AtlasAppetiteStatementRow): Promise<string | null> {
    if (!appetite.required_action) return null;
    const where = appetite.threat_path_id ? `for ${appetite.threat_path_id}` : '(company-wide)';
    return pushAtom({
      atlas, type: 'recommendation',
      content: `Appetite ${appetite.appetite_position} ${where}: ${appetite.required_action}${appetite.target_date ? ` by ${appetite.target_date}` : ''}.`,
      category: 'appetite',
      subcategory: appetite.appetite_position,
      tags: [`appetite:${appetite.appetite_position}`],
    });
  }

  return {
    pushAtom,
    pushThreatPathAtom,
    pushControlAtom,
    pushVulnerabilityFinding,
    pushAppetiteRecommendation,
  };
}

export type AtlasKnowledgeBridge = ReturnType<typeof createAtlasKnowledgeBridge>;
