/**
 * quality-pipeline-service.ts — adapter contract + 6 gates + deterministic scoring.
 *
 * Per spec §13: firmware never ships without the quality pipeline passing.
 * The 6 launch gates are:
 *
 *   1. platformio-build       — does it compile?
 *   2. clang-tidy             — static analysis findings
 *   3. cyclonedx-sbom         — software bill of materials produced
 *   4. cve-scan               — SBOM / family checked against lifecycle_events
 *   5. wokwi-sim              — does it run in simulation?
 *   6. security-scorecard     — secure boot / flash encryption / signed OTA posture
 *
 * Phase 4 ships **mock** adapters for 5 gates and a **real** adapter for
 * cve-scan (it queries the lifecycle_events table populated by the Phase 2
 * lifecycle ingestor). Real PlatformIO / Clang-tidy / Wokwi adapters replace
 * the mocks in subsequent sprints by implementing the same QualityAdapter
 * interface and registering themselves in `ADAPTERS` below.
 *
 * Scoring is deterministic and follows the locked rule: any mandatory gate
 * with outcome 'fail' or 'error' produces ship_verdict='block', regardless
 * of the overall numeric score.
 */

import type { DatabaseAdapter } from '../db/database.js';
import type { HardwareProject } from './hardware-project-service.js';

import platformioBuildAdapter, { detect as detectPlatformio } from './quality-adapters/platformio-build-adapter.js';
import clangTidyAdapter, { detect as detectClangTidy } from './quality-adapters/clang-tidy-adapter.js';
import cyclonedxSbomAdapter, { detect as detectCyclonedx } from './quality-adapters/cyclonedx-sbom-adapter.js';
import cveScanAdapter, { detect as detectCveScan } from './quality-adapters/cve-scan-adapter.js';
import wokwiSimAdapter, { detect as detectWokwi } from './quality-adapters/wokwi-sim-adapter.js';
import securityScorecardAdapter, { detect as detectSecurityScorecard } from './quality-adapters/security-scorecard-adapter.js';
import rollbackArtefactAdapter, { detect as detectRollback } from './quality-adapters/rollback-artefact-adapter.js';
import regulatoryPackAdapter, { detect as detectRegulatory } from './quality-adapters/regulatory-pack-adapter.js';
import type { AdapterAvailability } from './quality-adapters/_shared.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type GateOutcome = 'pass' | 'warn' | 'fail' | 'skip' | 'error';
export type AdapterKind = 'mock' | 'real';
export type ShipVerdict = 'green' | 'amber' | 'block';

export interface QualityAdapterContext {
  db: DatabaseAdapter;
  project: HardwareProject;
  artefactRef?: string | null;
  artefactHash?: string | null;
}

export interface QualityAdapterResult {
  outcome: GateOutcome;
  /** 0-100 numeric score; null for binary pass/fail gates */
  score: number | null;
  summary: string;
  details: Record<string, unknown>;
  durationMs: number;
  evidenceRef?: string | null;
}

export interface QualityAdapter {
  gateKey: string;
  displayLabel: string;
  isMandatory: boolean;
  kind: AdapterKind;
  version: string;
  /**
   * Returns true when this adapter applies to the given project. Allows
   * gates to opt out (e.g., wokwi-sim might skip on STM32 once that family
   * comes online; security-scorecard might be skipped for explicitly
   * acknowledged Tier 1 tinkering builds).
   */
  appliesTo(project: HardwareProject): boolean;
  run(ctx: QualityAdapterContext): Promise<QualityAdapterResult>;
}

export interface QualityRunSummary {
  runId: string;
  projectId: string;
  shipVerdict: ShipVerdict;
  overallScore: number;
  mandatoryGatesTotal: number;
  mandatoryGatesPass: number;
  warningsCount: number;
  failuresCount: number;
  reasoning: Array<{ gate_key: string; rule: string; impact: string }>;
  results: Array<{
    gate_key: string;
    display_label: string;
    adapter_kind: AdapterKind;
    adapter_version: string;
    outcome: GateOutcome;
    score: number | null;
    is_mandatory: boolean;
    summary: string;
    details: Record<string, unknown>;
    duration_ms: number;
    evidence_ref: string | null;
  }>;
}

// ── Adapter registry ──────────────────────────────────────────────────────────
// All adapters live under server/services/quality-adapters/. Each is real
// (subprocess detect + invoke OR DB query); when the underlying tool is not
// installed, the adapter returns outcome='skip' with a clear install_hint.

const ADAPTERS: QualityAdapter[] = [
  platformioBuildAdapter,
  clangTidyAdapter,
  cyclonedxSbomAdapter,
  cveScanAdapter,
  wokwiSimAdapter,
  securityScorecardAdapter,
  rollbackArtefactAdapter,
  regulatoryPackAdapter,
];

// One detect() per adapter, parallel to the ADAPTERS array.
const ADAPTER_DETECT: Record<string, () => Promise<{ installed: boolean; version: string | null; install_hint: string }>> = {
  'platformio-build':       detectPlatformio,
  'clang-tidy':             detectClangTidy,
  'cyclonedx-sbom':         detectCyclonedx,
  'cve-scan':               detectCveScan,
  'wokwi-sim':              detectWokwi,
  'security-scorecard':     detectSecurityScorecard,
  'rollback-artefact':      detectRollback,
  'regulatory-pack-complete': detectRegulatory,
};


// ── Service ───────────────────────────────────────────────────────────────────

export interface RunQualityPipelineInput {
  project: HardwareProject;
  phaseId?: string | null;
  triggeredBy: string;
  triggerReason?: string;
  artefactRef?: string | null;
  artefactHash?: string | null;
  /** Override the active adapter set, e.g. ['platformio-build', 'clang-tidy'] for fast loops */
  onlyGates?: string[];
}

export function createQualityPipelineService(db: DatabaseAdapter) {

  function listAdapters(): Array<{ gateKey: string; displayLabel: string; isMandatory: boolean; kind: AdapterKind; version: string }> {
    return ADAPTERS.map(a => ({
      gateKey: a.gateKey,
      displayLabel: a.displayLabel,
      isMandatory: a.isMandatory,
      kind: a.kind,
      version: a.version,
    }));
  }

  /**
   * Run each adapter's detect() in parallel — returns the install status
   * + version + install hint for each gate. Used by the project workspace
   * UI to show which gates will skip and why before the user clicks Run.
   */
  async function getAvailability(): Promise<AdapterAvailability[]> {
    const results = await Promise.all(
      ADAPTERS.map(async (adapter) => {
        const detector = ADAPTER_DETECT[adapter.gateKey];
        if (!detector) {
          return {
            gateKey: adapter.gateKey,
            installed: false,
            version: null,
            install_hint: '(no detect() function registered for this adapter)',
          };
        }
        try {
          const det = await detector();
          return {
            gateKey: adapter.gateKey,
            installed: det.installed,
            version: det.version,
            install_hint: det.install_hint,
          };
        } catch (err) {
          return {
            gateKey: adapter.gateKey,
            installed: false,
            version: null,
            install_hint: `Detect failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }),
    );
    return results;
  }

  async function runPipeline(input: RunQualityPipelineInput): Promise<QualityRunSummary> {
    return await db.transaction(async (tx) => {
      // 1. Create the run row
      const runRow = await tx.get(
        `INSERT INTO hw_quality_runs
          (project_id, phase_id, triggered_by, trigger_reason,
           artefact_ref, artefact_hash, status)
         VALUES (?, ?, ?, ?, ?, ?, 'running') RETURNING *`,
        input.project.id, input.phaseId ?? null, input.triggeredBy,
        input.triggerReason ?? 'manual',
        input.artefactRef ?? null, input.artefactHash ?? null,
      ) as { id: string };
      if (!runRow) throw new Error('Failed to create quality run');

      // 2. Run each applicable adapter (or skip with a 'skip' result)
      const results: QualityRunSummary['results'] = [];
      for (const adapter of ADAPTERS) {
        if (input.onlyGates && !input.onlyGates.includes(adapter.gateKey)) continue;

        if (!adapter.appliesTo(input.project)) {
          await tx.run(
            `INSERT INTO hw_quality_results
              (run_id, gate_key, adapter_kind, adapter_version, outcome,
               score, is_mandatory, duration_ms, summary, details)
             VALUES (?, ?, ?, ?, 'skip', NULL, ?, 0, ?, ?)`,
            runRow.id, adapter.gateKey, adapter.kind, adapter.version,
            adapter.isMandatory,
            `Gate skipped: not applicable to this project context.`,
            JSON.stringify({ reason: 'appliesTo() returned false' }),
          );
          results.push({
            gate_key: adapter.gateKey,
            display_label: adapter.displayLabel,
            adapter_kind: adapter.kind,
            adapter_version: adapter.version,
            outcome: 'skip',
            score: null,
            is_mandatory: adapter.isMandatory,
            summary: 'Gate skipped: not applicable to this project context.',
            details: { reason: 'appliesTo() returned false' },
            duration_ms: 0,
            evidence_ref: null,
          });
          continue;
        }

        let r: QualityAdapterResult;
        try {
          r = await adapter.run({
            db: tx,
            project: input.project,
            artefactRef: input.artefactRef ?? null,
            artefactHash: input.artefactHash ?? null,
          });
        } catch (err) {
          r = {
            outcome: 'error',
            score: 0,
            summary: `Adapter threw: ${err instanceof Error ? err.message : String(err)}`,
            details: { stack: err instanceof Error ? err.stack : undefined },
            durationMs: 0,
          };
        }

        await tx.run(
          `INSERT INTO hw_quality_results
            (run_id, gate_key, adapter_kind, adapter_version, outcome,
             score, is_mandatory, duration_ms, summary, details, evidence_ref)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          runRow.id, adapter.gateKey, adapter.kind, adapter.version, r.outcome,
          r.score, adapter.isMandatory, r.durationMs, r.summary,
          JSON.stringify(r.details), r.evidenceRef ?? null,
        );

        results.push({
          gate_key: adapter.gateKey,
          display_label: adapter.displayLabel,
          adapter_kind: adapter.kind,
          adapter_version: adapter.version,
          outcome: r.outcome,
          score: r.score,
          is_mandatory: adapter.isMandatory,
          summary: r.summary,
          details: r.details,
          duration_ms: r.durationMs,
          evidence_ref: r.evidenceRef ?? null,
        });
      }

      // 3. Score deterministically
      const summary = scoreRun(results);

      // 4. Persist score + close run
      await tx.run(
        `INSERT INTO hw_quality_scores
          (run_id, project_id, overall_score, ship_verdict,
           mandatory_gates_total, mandatory_gates_pass,
           warnings_count, failures_count, reasoning)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        runRow.id, input.project.id, summary.overallScore, summary.shipVerdict,
        summary.mandatoryGatesTotal, summary.mandatoryGatesPass,
        summary.warningsCount, summary.failuresCount,
        JSON.stringify(summary.reasoning),
      );

      await tx.run(
        `UPDATE hw_quality_runs
         SET status = 'complete', completed_at = NOW()
         WHERE id = ?`,
        runRow.id,
      );

      return {
        runId: runRow.id,
        projectId: input.project.id,
        ...summary,
        results,
      };
    });
  }

  async function listRuns(projectId: string, limit = 25): Promise<Array<{
    run_id: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    ship_verdict: ShipVerdict | null;
    overall_score: number | null;
    mandatory_pass: number | null;
    mandatory_total: number | null;
  }>> {
    const rows = await db.all(
      `SELECT r.id AS run_id, r.started_at, r.completed_at, r.status,
              s.ship_verdict, s.overall_score,
              s.mandatory_gates_pass AS mandatory_pass,
              s.mandatory_gates_total AS mandatory_total
       FROM hw_quality_runs r
       LEFT JOIN hw_quality_scores s ON s.run_id = r.id
       WHERE r.project_id = ?
       ORDER BY r.started_at DESC
       LIMIT ?`,
      projectId, limit,
    );
    return rows as Array<{
      run_id: string; started_at: string; completed_at: string | null; status: string;
      ship_verdict: ShipVerdict | null; overall_score: number | null;
      mandatory_pass: number | null; mandatory_total: number | null;
    }>;
  }

  async function getRunDetail(runId: string): Promise<QualityRunSummary | null> {
    const run = await db.get(
      `SELECT r.id, r.project_id, s.overall_score, s.ship_verdict,
              s.mandatory_gates_total, s.mandatory_gates_pass,
              s.warnings_count, s.failures_count, s.reasoning
       FROM hw_quality_runs r
       LEFT JOIN hw_quality_scores s ON s.run_id = r.id
       WHERE r.id = ?`,
      runId,
    ) as {
      id: string; project_id: string;
      overall_score: number | string | null; ship_verdict: ShipVerdict | null;
      mandatory_gates_total: number | string | null; mandatory_gates_pass: number | string | null;
      warnings_count: number | string | null; failures_count: number | string | null;
      reasoning: string | unknown[] | null;
    } | undefined;
    if (!run) return null;

    const resultRows = await db.all(
      `SELECT gate_key, adapter_kind, adapter_version, outcome, score,
              is_mandatory, summary, details, duration_ms, evidence_ref
       FROM hw_quality_results
       WHERE run_id = ? ORDER BY gate_key ASC`,
      runId,
    ) as Array<{
      gate_key: string; adapter_kind: AdapterKind; adapter_version: string;
      outcome: GateOutcome; score: number | string | null; is_mandatory: boolean;
      summary: string; details: string | object; duration_ms: number | string;
      evidence_ref: string | null;
    }>;

    return {
      runId: run.id,
      projectId: run.project_id,
      shipVerdict: (run.ship_verdict ?? 'block') as ShipVerdict,
      overallScore: Number(run.overall_score ?? 0),
      mandatoryGatesTotal: Number(run.mandatory_gates_total ?? 0),
      mandatoryGatesPass: Number(run.mandatory_gates_pass ?? 0),
      warningsCount: Number(run.warnings_count ?? 0),
      failuresCount: Number(run.failures_count ?? 0),
      reasoning: typeof run.reasoning === 'string' ? JSON.parse(run.reasoning) : ((run.reasoning as unknown[]) ?? []),
      results: resultRows.map(r => ({
        gate_key: r.gate_key,
        display_label: ADAPTERS.find(a => a.gateKey === r.gate_key)?.displayLabel ?? r.gate_key,
        adapter_kind: r.adapter_kind,
        adapter_version: r.adapter_version,
        outcome: r.outcome,
        score: r.score === null ? null : Number(r.score),
        is_mandatory: r.is_mandatory,
        summary: r.summary,
        details: typeof r.details === 'string' ? JSON.parse(r.details) : (r.details as Record<string, unknown>),
        duration_ms: Number(r.duration_ms ?? 0),
        evidence_ref: r.evidence_ref,
      })),
    };
  }

  return { listAdapters, getAvailability, runPipeline, listRuns, getRunDetail };
}

// ── Deterministic scoring ─────────────────────────────────────────────────────

export function scoreRun(results: QualityRunSummary['results']): Omit<QualityRunSummary, 'runId' | 'projectId' | 'results'> {
  const reasoning: QualityRunSummary['reasoning'] = [];
  const mandatory = results.filter(r => r.is_mandatory);
  const mandatoryPass = mandatory.filter(r => r.outcome === 'pass').length;
  const failures = results.filter(r => r.outcome === 'fail' || r.outcome === 'error').length;
  const warnings = results.filter(r => r.outcome === 'warn').length;

  // Hard rule: any mandatory gate with fail/error blocks the ship.
  let verdict: ShipVerdict = 'green';
  for (const r of mandatory) {
    if (r.outcome === 'fail' || r.outcome === 'error') {
      verdict = 'block';
      reasoning.push({
        gate_key: r.gate_key,
        rule: 'mandatory-gate-must-pass',
        impact: `Mandatory gate ${r.gate_key} returned ${r.outcome}; ship_verdict forced to block.`,
      });
    }
  }

  if (verdict !== 'block' && warnings > 0) {
    verdict = 'amber';
    reasoning.push({
      gate_key: 'aggregate',
      rule: 'warnings-downgrade-to-amber',
      impact: `${warnings} non-fatal warning(s) across the gate set; ship_verdict downgraded to amber.`,
    });
  }

  // Numeric overall: weighted average of non-skipped, non-error gates.
  const scoredResults = results.filter(r => r.outcome !== 'skip' && r.outcome !== 'error' && r.score !== null);
  let overall = 0;
  if (scoredResults.length > 0) {
    const totalWeight = scoredResults.length;
    overall = scoredResults.reduce((acc, r) => acc + (r.score ?? 0), 0) / totalWeight;
    overall = Math.round(overall * 100) / 100;
  } else if (failures > 0) {
    overall = 0;
  }

  if (verdict === 'green' && reasoning.length === 0) {
    reasoning.push({
      gate_key: 'aggregate',
      rule: 'all-gates-pass',
      impact: `All ${mandatoryPass} mandatory gates passed; ${results.length - mandatory.length} optional gates also evaluated.`,
    });
  }

  return {
    shipVerdict: verdict,
    overallScore: overall,
    mandatoryGatesTotal: mandatory.length,
    mandatoryGatesPass: mandatoryPass,
    warningsCount: warnings,
    failuresCount: failures,
    reasoning,
  };
}

export type QualityPipelineService = ReturnType<typeof createQualityPipelineService>;
