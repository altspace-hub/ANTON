// ── Atlas Integrity Rules — Compliance-as-Code surface ──────────────────
//
// Phase 1h. Codifies the Atlas's invariants as a deterministic rule set
// that any caller (UI dashboard, CI hook, scheduled review job, regulator
// snapshot) can run against an Atlas to surface violations.
//
// These rules sit alongside (not inside) the deterministic residual
// calculator — the calculator owns the maths; this surface owns
// "is this Atlas defensible right now?" judgements.
//
// Rules are pure functions over a fully hydrated Atlas snapshot — no DB
// access during evaluation. The runner builds the snapshot once via
// atlas-export's buildSnapshot(). This keeps the rule set easy to audit
// and trivial to test.

import type { DatabaseAdapter } from '../../db/database.js';
import { createAtlasExport } from './atlas-export.js';
import { appetitePositionFor } from './atlas-residual-calculator.js';
import type { AtlasExportSnapshot } from './atlas-export.js';
import type { Score1to5 } from './types.js';

export type IntegritySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IntegrityFinding {
  rule_code: string;
  severity: IntegritySeverity;
  message: string;
  // Cross-link back to the offending entity so the UI can deep-link
  subject_kind: 'atlas' | 'threat_path' | 'control' | 'appetite';
  subject_id: string;
  // Suggested next step the user can act on
  remediation: string;
}

export interface IntegrityReport {
  atlas_id: string;
  evaluated_at: string;
  findings: IntegrityFinding[];
  counts: Record<IntegritySeverity, number>;
}

// ── Rule definitions ────────────────────────────────────────────────────

const RULES = [
  {
    code: 'ATLAS-INT-001',
    severity: 'critical' as IntegritySeverity,
    title: 'Path with residual ≥ 4 must have a declared appetite',
    evaluate(snap: AtlasExportSnapshot): IntegrityFinding[] {
      return snap.paths
        .filter(p => (p.residual?.residual_score ?? 0) >= 4 && !p.appetite)
        .map(p => ({
          rule_code: 'ATLAS-INT-001',
          severity: 'critical' as const,
          message: `Path ${p.path.path_code} carries residual ${p.residual?.residual_score} but no appetite is declared.`,
          subject_kind: 'threat_path' as const,
          subject_id: p.path.id,
          remediation: 'Open Stage 7 — Appetite and either accept the residual within appetite or set required action + target date.',
        }));
    },
  },
  {
    code: 'ATLAS-INT-002',
    severity: 'high' as IntegritySeverity,
    title: 'Outside-appetite path must have a required action and a target date',
    evaluate(snap: AtlasExportSnapshot): IntegrityFinding[] {
      return snap.paths
        .filter(p => {
          const r = p.residual?.residual_score; if (!r) return false;
          const ap = appetitePositionFor(r as Score1to5);
          if (ap !== 'outside' && ap !== 'unacceptable') return false;
          // Outside / unacceptable paths must have an action plan
          if (!p.appetite) return true;
          return !p.appetite.required_action?.trim() || !p.appetite.target_date;
        })
        .map(p => ({
          rule_code: 'ATLAS-INT-002',
          severity: 'high' as const,
          message: `Path ${p.path.path_code} sits outside appetite but lacks a required action and / or target date.`,
          subject_kind: 'threat_path' as const,
          subject_id: p.path.id,
          remediation: 'Add a remediation programme: required action, named owner, target date, and budget if applicable.',
        }));
    },
  },
  {
    code: 'ATLAS-INT-003',
    severity: 'high' as IntegritySeverity,
    title: 'Strong control must carry concrete evidence',
    evaluate(snap: AtlasExportSnapshot): IntegrityFinding[] {
      const out: IntegrityFinding[] = [];
      for (const p of snap.paths) {
        for (const c of p.controls) {
          if (c.strength === 'strong' && (!c.evidence || c.evidence.trim().length < 5)) {
            out.push({
              rule_code: 'ATLAS-INT-003',
              severity: 'high' as const,
              message: `Control ${c.control_code} on path ${p.path.path_code} is rated Strong without evidence.`,
              subject_kind: 'control' as const,
              subject_id: String(c.id),
              remediation: 'Either downgrade to Adequate / Weak or attach concrete evidence (policy ref, audit ref, log sample).',
            });
          }
        }
      }
      return out;
    },
  },
  {
    code: 'ATLAS-INT-004',
    severity: 'medium' as IntegritySeverity,
    title: 'Path missing inherent score',
    evaluate(snap: AtlasExportSnapshot): IntegrityFinding[] {
      return snap.paths
        .filter(p => !p.inherent)
        .map(p => ({
          rule_code: 'ATLAS-INT-004',
          severity: 'medium' as const,
          message: `Path ${p.path.path_code} has no inherent score yet.`,
          subject_kind: 'threat_path' as const,
          subject_id: p.path.id,
          remediation: 'Run Stage 4 — Score Inherent. Without it the calculator cannot produce a residual.',
        }));
    },
  },
  {
    code: 'ATLAS-INT-005',
    severity: 'medium' as IntegritySeverity,
    title: 'Path with at least one vulnerability should have at least one control',
    evaluate(snap: AtlasExportSnapshot): IntegrityFinding[] {
      return snap.paths
        .filter(p => p.vulnerabilities.length > 0 && p.controls.length === 0)
        .map(p => ({
          rule_code: 'ATLAS-INT-005',
          severity: 'medium' as const,
          message: `Path ${p.path.path_code} carries ${p.vulnerabilities.length} vulnerabilities and no controls.`,
          subject_kind: 'threat_path' as const,
          subject_id: p.path.id,
          remediation: 'Map at least one prevent / detect / respond control to the vulnerabilities, or accept the inherent risk explicitly.',
        }));
    },
  },
  {
    code: 'ATLAS-INT-006',
    severity: 'low' as IntegritySeverity,
    title: 'Active Atlas should have at least one review cycle scheduled',
    evaluate(snap: AtlasExportSnapshot): IntegrityFinding[] {
      if (snap.atlas.status !== 'active') return [];
      if (snap.dashboard.next_review_at) return [];
      return [{
        rule_code: 'ATLAS-INT-006',
        severity: 'low' as const,
        message: 'Atlas is active but no review cycle is scheduled.',
        subject_kind: 'atlas' as const,
        subject_id: snap.atlas.id,
        remediation: 'Add a review cycle on the Maintenance tab (recommended: full review annual, control test quarterly).',
      }];
    },
  },
];

export function listIntegrityRules(): Array<{ code: string; severity: IntegritySeverity; title: string }> {
  return RULES.map(r => ({ code: r.code, severity: r.severity, title: r.title }));
}

// ── Public runner ───────────────────────────────────────────────────────

export function createAtlasIntegrityRunner(db: DatabaseAdapter) {
  const exporter = createAtlasExport(db);

  async function evaluate(atlasId: string): Promise<IntegrityReport | null> {
    const snap = await exporter.buildSnapshot(atlasId, null);
    if (!snap) return null;
    const findings: IntegrityFinding[] = [];
    for (const rule of RULES) findings.push(...rule.evaluate(snap));
    const counts: Record<IntegritySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[f.severity]++;
    return { atlas_id: atlasId, evaluated_at: new Date().toISOString(), findings, counts };
  }

  return { evaluate, listRules: listIntegrityRules };
}

export type AtlasIntegrityRunner = ReturnType<typeof createAtlasIntegrityRunner>;
