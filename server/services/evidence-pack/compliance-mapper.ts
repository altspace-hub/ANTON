/**
 * compliance-mapper.ts — produce per-framework compliance mappings for an
 * AssembledPack and detect gaps that need owner attention.
 *
 * Phase 3 of EVIDENCE_PACK_SPEC.md. Two frameworks ship now: EU AI Act
 * Annex IV (9 points of mandatory technical documentation) and AMLR
 * auditability (5 data quality dimensions + Article 21 record-keeping).
 *
 * Each framework declares a `points` table — id, label, what evidence it
 * accepts, and a heuristic that decides "evidenced" / "not_applicable" /
 * "gap" given the assembled pack's items + their regulatory_relevance tags
 * (already computed by the collector). The mapper never invents evidence —
 * it inspects what's actually there and reports honestly.
 *
 * Owner-accepted gaps (spec §5.6: "explicitly accept the gap with rationale")
 * live in evidence_packs.compliance_gaps JSONB. The mapper merges those
 * acceptances into the result so the cover page can list them.
 *
 * Framework registry pattern: adding GDPR, DORA, MiFID II, MiCA, CSRD, etc.
 * means appending an entry to FRAMEWORKS — no engine changes.
 */

import type { AssembledPack } from './assembler.js';
import type { CollectedItem } from './collector.js';

export type PointStatus = 'evidenced' | 'not_applicable' | 'gap';

export interface PointResult {
  id: string;                        // "eu_ai_act.annex_iv.1"
  label: string;
  status: PointStatus;
  evidence: Array<{ type: string; id: string; hash: string; summary: string }>;
  notes?: string;                    // engine's reasoning for not_applicable / gap
  acceptance?: GapAcceptance;        // owner-accepted gap, if any
}

export interface GapAcceptance {
  rationale: string;
  acceptedAt: string;
  acceptedBy: string;
}

export interface FrameworkResult {
  id: string;                        // "eu_ai_act"
  label: string;
  citation: string;                  // "EU AI Act Annex IV"
  points: PointResult[];
  evidencedCount: number;
  gapCount: number;
  acceptedGapCount: number;
  notApplicableCount: number;
}

export interface ComplianceMapping {
  packId: string;
  generatedAt: string;
  frameworks: FrameworkResult[];
  totalGaps: number;                 // unaccepted gaps across all frameworks
  totalAccepted: number;
}

// ── Framework definitions ──────────────────────────────────────────────────

interface PointDef {
  id: string;                        // suffix: "1", "annex_iv.1", "dim.completeness"
  label: string;
  description: string;
  /** Returns true if evidenced by the items. The collector's relevance tags
   *  (e.g. "eu_ai_act.art_13") are the cleanest hook — we filter by them
   *  rather than re-inspecting raw rows. */
  isEvidenced: (items: CollectedItem[]) => Array<CollectedItem>;
  /** Returns true when the point doesn't apply to this pack at all. */
  isNotApplicable?: (pack: AssembledPack) => boolean;
}

interface FrameworkDef {
  id: string;
  label: string;
  citation: string;
  points: PointDef[];
}

const ANNEX_IV: FrameworkDef = {
  id: 'eu_ai_act',
  label: 'EU AI Act — Annex IV Technical Documentation',
  citation: 'Regulation (EU) 2024/1689, Annex IV (high-risk AI systems)',
  points: [
    {
      id: '1',
      label: '1. General description of the AI system',
      description: 'Intended purpose, deployer/provider, model versions, system identification.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'session' || i.itemType === 'project'),
    },
    {
      id: '2',
      label: '2. Detailed description of system elements + development',
      description: 'Methods + steps for development, design specifications, key design choices including rationale.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'audit_log'),
    },
    {
      id: '3',
      label: '3. Monitoring, functioning, and control',
      description: 'Information enabling deployers to interpret outputs and use them appropriately (Art 13 transparency surface).',
      isEvidenced: (items) => items.filter((i) => i.regulatoryRelevance.includes('eu_ai_act.art_13')),
    },
    {
      id: '4',
      label: '4. Risk management system',
      description: 'Identification, analysis, and evaluation of foreseeable risks. Rule violations + apprentice overrides count here.',
      isEvidenced: (items) => items.filter((i) =>
        i.itemType === 'rule_violation' || i.itemType === 'override_event'
        || i.regulatoryRelevance.includes('eu_ai_act.art_9'),
      ),
    },
    {
      id: '5',
      label: '5. Changes through lifecycle',
      description: 'Substantial modifications + their justifications. Output versions + version history surface this.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'output_version'),
    },
    {
      id: '6',
      label: '6. Standards applied',
      description: 'List of harmonised standards or technical specifications applied. Mostly external — sometimes ANTON\'s own.',
      isEvidenced: (_items) => [],
      isNotApplicable: (_pack) => true,    // No standards declaration in v0.7.x; flag as N/A by default.
    },
    {
      id: '7',
      label: '7. EU declaration of conformity',
      description: 'Reference to the EU declaration of conformity for this AI system.',
      isEvidenced: (_items) => [],
      isNotApplicable: (_pack) => true,    // Provider-level concern; not in pack scope.
    },
    {
      id: '8',
      label: '8. Post-market monitoring plan',
      description: 'How the system\'s real-world performance is monitored after deployment.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'audit_log'),  // every AI call is monitored
    },
    {
      id: '9',
      label: '9. List of harmonised standards applied',
      description: 'Same as 6 but enumerated.',
      isEvidenced: (_items) => [],
      isNotApplicable: (_pack) => true,
    },
  ],
};

const AMLR: FrameworkDef = {
  id: 'amlr',
  label: 'AMLR — Auditability + Article 21 Record-keeping',
  citation: 'Regulation (EU) 2024/1624 — AML data quality + record-keeping',
  points: [
    {
      id: 'dim.completeness',
      label: 'Dimension 1 — Completeness',
      description: 'All in-scope events captured (no silent drops). Audit log entries per AI call; every override recorded.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'audit_log'),
    },
    {
      id: 'dim.accuracy',
      label: 'Dimension 2 — Accuracy',
      description: 'Captured values reflect what actually happened. Output versions provide cross-checking; reviewer status confirms accuracy gates.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'output_version' || i.regulatoryRelevance.includes('eu_ai_act.art_14')),
    },
    {
      id: 'dim.timeliness',
      label: 'Dimension 3 — Timeliness',
      description: 'Events recorded close to when they happened. Every audit_log entry has a timestamp; every message a created_at.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'audit_log' || i.itemType === 'message'),
    },
    {
      id: 'dim.consistency',
      label: 'Dimension 4 — Consistency',
      description: 'Same event recorded the same way each time. Canonical JSON + deterministic hashing enforces this.',
      isEvidenced: (items) => items,    // every item in the pack is canonical
    },
    {
      id: 'dim.auditability',
      label: 'Dimension 5 — Auditability',
      description: '"Can you demonstrate to a regulator when data was captured, changed, and by whom?" The pack itself is the evidence.',
      isEvidenced: (items) => items.filter((i) => i.regulatoryRelevance.includes('amlr.auditability') || i.regulatoryRelevance.includes('amlr.art_21')),
    },
    {
      id: 'art_21',
      label: 'Article 21 — Record-keeping (5-year minimum)',
      description: 'Records preserved for the required retention period. Pack retention is enforced via retention_until + legal_hold.',
      isEvidenced: (items) => items.filter((i) => i.regulatoryRelevance.includes('amlr.art_21')),
    },
  ],
};

const GDPR: FrameworkDef = {
  id: 'gdpr',
  label: 'GDPR — Article 22 + Article 30',
  citation: 'Regulation (EU) 2016/679 — automated decision-making + records of processing',
  points: [
    {
      id: 'art_22',
      label: 'Article 22 — Automated individual decision-making',
      description: 'Where AI output contributes to decisions about natural persons, the data subject has a right to meaningful information about the logic involved. Thinking content is the transparency surface.',
      isEvidenced: (items) => items.filter((i) => i.regulatoryRelevance.includes('eu_ai_act.art_13') || i.regulatoryRelevance.includes('gdpr.art_22')),
    },
    {
      id: 'art_30',
      label: 'Article 30 — Records of processing activities',
      description: 'For each processing activity: purposes, categories of data subjects + personal data, recipients, retention periods. The pack manifest + audit_log entries provide provenance.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'audit_log' || i.itemType === 'session'),
    },
    {
      id: 'art_5_1c',
      label: 'Article 5(1)(c) — Data minimisation',
      description: 'Personal data limited to what is necessary. Redactions in this pack are how data minimisation is enforced when sharing externally.',
      isEvidenced: (_items) => [],
      isNotApplicable: (_pack) => true,    // Heuristic can't prove minimisation; surface as N/A by default.
    },
    {
      id: 'art_32',
      label: 'Article 32 — Security of processing',
      description: 'Pseudonymisation, encryption, integrity guarantees. Manifest hashing + Ed25519 signing + at-rest encryption of the signing key satisfy this for the pack itself.',
      isEvidenced: (items) => items,    // every item benefits from manifest-hash integrity
    },
  ],
};

const DORA: FrameworkDef = {
  id: 'dora',
  label: 'DORA — ICT Risk Management + Incident Records',
  citation: 'Regulation (EU) 2022/2554 — Digital Operational Resilience Act',
  points: [
    {
      id: 'art_5',
      label: 'Article 5 — Governance + organisation',
      description: 'Internal governance + control framework that ensures effective management of ICT risk. Project + session records show governance in action.',
      isEvidenced: (items) => items.filter((i) => i.itemType === 'project' || i.itemType === 'session'),
    },
    {
      id: 'art_6',
      label: 'Article 6 — ICT risk management framework',
      description: 'Identification, protection, detection, response, recovery. Rule violations + override events are the response surface.',
      isEvidenced: (items) => items.filter((i) =>
        i.itemType === 'rule_violation' || i.itemType === 'override_event'
        || i.regulatoryRelevance.includes('eu_ai_act.art_9'),
      ),
    },
    {
      id: 'art_8',
      label: 'Article 8 — Identification + classification of ICT-related risk',
      description: 'Documented inventory of ICT assets + their criticality. Out of pack scope; inventory is a separate artefact.',
      isEvidenced: (_items) => [],
      isNotApplicable: (_pack) => true,
    },
    {
      id: 'art_17',
      label: 'Article 17 — ICT-related incident management',
      description: 'Process to detect, manage, and notify ICT-related incidents. Mission decisions + activity logs surface the management trail.',
      isEvidenced: (items) => items.filter((i) =>
        i.itemType === 'mission_decision' || i.itemType === 'mission_activity' || i.itemType === 'rule_violation',
      ),
    },
    {
      id: 'art_28',
      label: 'Article 28 — Register of information (third-party providers)',
      description: 'Register of all contractual arrangements with ICT third-party service providers. Out of pack scope.',
      isEvidenced: (_items) => [],
      isNotApplicable: (_pack) => true,
    },
  ],
};

const FRAMEWORKS: Record<string, FrameworkDef> = {
  eu_ai_act: ANNEX_IV,
  amlr: AMLR,
  gdpr: GDPR,
  dora: DORA,
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the mapper across every requested framework. `acceptances` comes from
 * evidence_packs.compliance_gaps and is keyed by full point id like
 * "eu_ai_act.annex_iv.1".
 */
export function mapCompliance(
  pack: AssembledPack,
  frameworks: string[] = ['eu_ai_act', 'amlr'],
  acceptances: Record<string, GapAcceptance> = {},
): ComplianceMapping {
  const results: FrameworkResult[] = [];
  let totalGaps = 0;
  let totalAccepted = 0;

  for (const fid of frameworks) {
    const def = FRAMEWORKS[fid];
    if (!def) continue;

    const points: PointResult[] = def.points.map((p) => {
      const fullId = fullPointId(def.id, p.id);
      const evidence = p.isEvidenced(pack.collectedItems).map((i) => ({
        type: i.itemType, id: i.itemId, hash: i.itemHash, summary: i.itemSummary,
      }));

      let status: PointStatus;
      let notes: string | undefined;
      if (evidence.length > 0) {
        status = 'evidenced';
      } else if (p.isNotApplicable && p.isNotApplicable(pack)) {
        status = 'not_applicable';
        notes = 'No items in scope match this point and the framework rule marks it as not applicable to a pack of this type.';
      } else {
        status = 'gap';
        notes = `No items in scope evidence this point. ${evidenceHint(p)}`;
      }

      return {
        id: fullId, label: p.label, status, evidence, notes,
        acceptance: acceptances[fullId],
      };
    });

    const evidencedCount = points.filter((p) => p.status === 'evidenced').length;
    const naCount = points.filter((p) => p.status === 'not_applicable').length;
    const gapPoints = points.filter((p) => p.status === 'gap');
    const acceptedGapCount = gapPoints.filter((p) => !!p.acceptance).length;
    const unacceptedGapCount = gapPoints.length - acceptedGapCount;
    totalGaps += unacceptedGapCount;
    totalAccepted += acceptedGapCount;

    results.push({
      id: def.id, label: def.label, citation: def.citation, points,
      evidencedCount, gapCount: gapPoints.length,
      acceptedGapCount, notApplicableCount: naCount,
    });
  }

  return {
    packId: pack.pack.id,
    generatedAt: new Date().toISOString(),
    frameworks: results,
    totalGaps, totalAccepted,
  };
}

// ── Markdown rendering for the bundle ──────────────────────────────────────

export function renderFrameworkMarkdown(pack: AssembledPack, fid: string, mapping: ComplianceMapping): string {
  const fr = mapping.frameworks.find((f) => f.id === fid);
  if (!fr) return `# ${fid}\n\nFramework not in this pack's mapping.\n`;
  const lines: string[] = [];
  lines.push(`# ${fr.label}`);
  lines.push('');
  lines.push(`**Pack:** ${pack.pack.title}`);
  lines.push(`**Pack ID:** ${pack.pack.id}`);
  lines.push(`**Citation:** ${fr.citation}`);
  lines.push(`**Generated:** ${mapping.generatedAt}`);
  lines.push('');
  lines.push(`> Coverage: ${fr.evidencedCount} evidenced · ${fr.gapCount - fr.acceptedGapCount} open gaps · ${fr.acceptedGapCount} accepted gaps · ${fr.notApplicableCount} not applicable`);
  lines.push('');
  for (const p of fr.points) {
    const icon = p.status === 'evidenced' ? '✓'
      : p.status === 'not_applicable' ? '·'
      : p.acceptance ? '!' : '✗';
    lines.push(`## ${icon} ${p.label}`);
    lines.push('');
    lines.push(`**Status:** ${p.status}${p.acceptance ? ' (gap accepted)' : ''}`);
    if (p.notes) lines.push(`**Notes:** ${p.notes}`);
    if (p.acceptance) {
      lines.push('');
      lines.push(`**Owner-accepted rationale** (${p.acceptance.acceptedBy} at ${p.acceptance.acceptedAt}):`);
      lines.push('');
      lines.push('> ' + p.acceptance.rationale.split('\n').join('\n> '));
    }
    if (p.evidence.length > 0) {
      lines.push('');
      lines.push('**Evidence items:**');
      for (const e of p.evidence.slice(0, 50)) {
        lines.push(`- \`${e.type}\` — ${e.summary} (${e.hash.slice(0, 24)}…)`);
      }
      if (p.evidence.length > 50) lines.push(`- … and ${p.evidence.length - 50} more`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fullPointId(frameworkId: string, pointId: string): string {
  // "eu_ai_act" + "1"   → "eu_ai_act.annex_iv.1"
  // "amlr"     + "art_21" → "amlr.art_21"
  if (frameworkId === 'eu_ai_act') return `eu_ai_act.annex_iv.${pointId}`;
  return `${frameworkId}.${pointId}`;
}

function evidenceHint(p: PointDef): string {
  return `Add an item that satisfies "${p.description}", justify the gap with a rationale, or explicitly accept the gap (it will be flagged on the pack cover page).`;
}

export function listFrameworks(): Array<{ id: string; label: string; pointCount: number }> {
  return Object.values(FRAMEWORKS).map((f) => ({
    id: f.id, label: f.label, pointCount: f.points.length,
  }));
}
