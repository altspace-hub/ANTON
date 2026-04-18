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
import { createRegulatoryPackService } from './regulatory-pack-service.js';

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

// ── Mock adapter helpers ──────────────────────────────────────────────────────

function deterministicNoise(seed: string, max: number): number {
  // Tiny deterministic hash so the same project + gate always returns the
  // same mock score. Lets the UI show stable data across reloads.
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % max;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

const platformioMockAdapter: QualityAdapter = {
  gateKey: 'platformio-build',
  displayLabel: 'PlatformIO Build',
  isMandatory: true,
  kind: 'mock',
  version: '0.1.0-mock',
  appliesTo: () => true,
  run: async ({ project }) => {
    const start = Date.now();
    // Mock: succeeds with a "binary size used" stat that varies per project
    const flashUsed = 65 + deterministicNoise(project.id, 25); // 65-89%
    const ramUsed = 35 + deterministicNoise(project.id + ':ram', 20);   // 35-54%
    const outcome: GateOutcome = flashUsed < 90 ? 'pass' : 'warn';
    return {
      outcome,
      score: 100 - flashUsed,
      summary: outcome === 'pass'
        ? `Build succeeded. Flash ${flashUsed}% used, RAM ${ramUsed}% used.`
        : `Build succeeded but flash usage is tight (${flashUsed}%) — review before shipping.`,
      details: {
        toolchain: 'platformio (mock)',
        framework: 'arduino-esp32',
        flash_used_percent: flashUsed,
        ram_used_percent: ramUsed,
        warnings_count: deterministicNoise(project.id + ':warn', 5),
        note: 'Mock adapter — real PlatformIO subprocess invocation lands in a future sprint.',
      },
      durationMs: Date.now() - start,
    };
  },
};

const clangTidyMockAdapter: QualityAdapter = {
  gateKey: 'clang-tidy',
  displayLabel: 'Static Analysis (Clang-tidy)',
  isMandatory: true,
  kind: 'mock',
  version: '0.1.0-mock',
  appliesTo: () => true,
  run: async ({ project }) => {
    const start = Date.now();
    const findings = deterministicNoise(project.id + ':clang', 8);
    const critical = deterministicNoise(project.id + ':crit', 2);
    const outcome: GateOutcome = critical > 0 ? 'fail' : findings > 4 ? 'warn' : 'pass';
    return {
      outcome,
      score: Math.max(0, 100 - findings * 8 - critical * 30),
      summary: outcome === 'pass'
        ? `Clean: ${findings} non-critical findings.`
        : outcome === 'warn'
        ? `${findings} findings to address before shipping (none critical).`
        : `${critical} critical finding(s); firmware cannot ship until resolved.`,
      details: {
        analyzer: 'clang-tidy (mock)',
        checks_enabled: ['cert-*', 'bugprone-*', 'cppcoreguidelines-*', 'misc-*'],
        findings_count: findings,
        critical_count: critical,
        sample_findings: critical > 0
          ? ['cert-err34-c: \'atoi\' called instead of \'strtol\' (line 142, main.cpp)']
          : [],
        note: 'Mock adapter — real Clang-tidy subprocess invocation lands in a future sprint.',
      },
      durationMs: Date.now() - start,
    };
  },
};

const cyclonedxMockAdapter: QualityAdapter = {
  gateKey: 'cyclonedx-sbom',
  displayLabel: 'Software Bill of Materials (CycloneDX)',
  isMandatory: true,
  kind: 'mock',
  version: '0.1.0-mock',
  appliesTo: () => true,
  run: async ({ project }) => {
    const start = Date.now();
    const components = 18 + deterministicNoise(project.id + ':sbom', 15);
    return {
      outcome: 'pass',
      score: 100,
      summary: `SBOM generated. ${components} components catalogued.`,
      details: {
        format: 'CycloneDX 1.5 (mock)',
        component_count: components,
        bom_ref: `pkg:hw/${project.family_id}/${project.id.slice(0, 8)}`,
        sample_components: [
          { type: 'firmware', name: 'esp-idf', version: 'v5.1.2' },
          { type: 'library', name: 'mbedtls', version: '3.4.0' },
          { type: 'library', name: 'lwip', version: '2.1.3' },
        ],
        note: 'Mock SBOM — real generator from PlatformIO build output lands in a future sprint.',
      },
      durationMs: Date.now() - start,
    };
  },
};

const cveScanRealAdapter: QualityAdapter = {
  gateKey: 'cve-scan',
  displayLabel: 'CVE Scan (against lifecycle layer)',
  isMandatory: true,
  kind: 'real',
  version: '0.1.0',
  appliesTo: () => true,
  run: async ({ db, project }) => {
    const start = Date.now();
    // Pull lifecycle events affecting this project's family. In a future
    // sprint we'll narrow further by SBOM component versions; for now we
    // surface every advisory in the family with CVSS ≥ 7.0 as load-bearing.
    const events = await db.all(
      `SELECT event_id, title, severity, cvss_score, source, source_url
       FROM lifecycle_events
       WHERE family_id = ?
         AND (cvss_score >= 7.0 OR severity IN ('high', 'critical'))
         AND ingested_at > NOW() - INTERVAL '365 days'
       ORDER BY published_at DESC
       LIMIT 25`,
      project.family_id,
    ) as Array<{ event_id: string; title: string; severity: string | null; cvss_score: number | null; source: string; source_url: string | null }>;

    const critical = events.filter(e => (e.cvss_score ?? 0) >= 9.0).length;
    const high = events.filter(e => (e.cvss_score ?? 0) >= 7.0 && (e.cvss_score ?? 0) < 9.0).length;

    let outcome: GateOutcome = 'pass';
    let score = 100;
    if (critical > 0) { outcome = 'fail'; score = 0; }
    else if (high > 0) { outcome = 'warn'; score = Math.max(0, 100 - high * 12); }

    return {
      outcome,
      score,
      summary:
        outcome === 'pass' ? `No critical/high CVEs in the last 365 days for ${project.family_id}.` :
        outcome === 'warn' ? `${high} high-severity CVE(s) in scope. Review applicability before shipping.` :
        `${critical} critical-severity CVE(s) in scope. Firmware must not ship without remediation.`,
      details: {
        family: project.family_id,
        critical_count: critical,
        high_count: high,
        total_in_scope: events.length,
        events: events.slice(0, 10),
        note: 'Adapter checks lifecycle_events table populated by the NVD/GHSA/Espressif ingestor. Refine via the Maintain CVE Applicability module before treating any high-severity event as project-applicable.',
      },
      durationMs: Date.now() - start,
    };
  },
};

const wokwiMockAdapter: QualityAdapter = {
  gateKey: 'wokwi-sim',
  displayLabel: 'Simulation (Wokwi)',
  isMandatory: false, // not all projects are simulatable; e.g. unique sensor hw
  kind: 'mock',
  version: '0.1.0-mock',
  appliesTo: (project) => project.family_id === 'esp32',
  run: async ({ project }) => {
    const start = Date.now();
    const scenarios = ['boot', 'wifi-connect', 'sensor-read', 'deep-sleep-wake'];
    const failed = deterministicNoise(project.id + ':wokwi', 5) > 3;
    return {
      outcome: failed ? 'warn' : 'pass',
      score: failed ? 70 : 100,
      summary: failed
        ? `4 scenarios run; 3 passed, 1 produced a non-fatal warning in deep-sleep-wake.`
        : `All 4 simulation scenarios passed.`,
      details: {
        simulator: 'wokwi (mock)',
        scenarios_run: scenarios,
        scenarios_passed: failed ? scenarios.slice(0, 3) : scenarios,
        scenarios_warned: failed ? ['deep-sleep-wake'] : [],
        note: 'Mock simulation results. Real Wokwi API integration requires a Wokwi API key; deferred to the Phase 4+ external-tool sprint.',
      },
      durationMs: Date.now() - start,
    };
  },
};

const securityScorecardMockAdapter: QualityAdapter = {
  gateKey: 'security-scorecard',
  displayLabel: 'Security Scorecard',
  isMandatory: true, // mandatory unless explicit Tier 1 acknowledgement
  kind: 'mock',
  version: '0.1.0-mock',
  appliesTo: (project) => {
    // Tier 1 builds with the secure-update ack can skip this gate per spec §13.
    if (project.tier === 1 && project.tier1_secure_update_ack) return false;
    return true;
  },
  run: async ({ project }) => {
    const start = Date.now();
    const secureBoot = project.tier !== 1 ? true : Boolean(deterministicNoise(project.id + ':sb', 2));
    const flashEnc = project.tier !== 1 ? true : Boolean(deterministicNoise(project.id + ':fe', 2));
    const signedOta = project.tier === 3 ? true : Boolean(deterministicNoise(project.id + ':ota', 2));

    const score =
      (secureBoot ? 35 : 0) +
      (flashEnc ? 35 : 0) +
      (signedOta ? 30 : 0);

    let outcome: GateOutcome = 'pass';
    if (project.tier === 3 && score < 100) outcome = 'fail';
    else if (project.tier === 2 && score < 70) outcome = 'fail';
    else if (score < 70) outcome = 'warn';

    return {
      outcome,
      score,
      summary:
        outcome === 'pass' ? `Secure boot, flash encryption, signed OTA all green.` :
        outcome === 'warn' ? `Secure-update posture incomplete (${score}/100). Acceptable for Tier 1 with acknowledgement.` :
        `Secure-update chain insufficient for Tier ${project.tier} — must enable secure boot v2, flash encryption, and signed OTA before shipping.`,
      details: {
        secure_boot_v2: secureBoot,
        flash_encryption: flashEnc,
        signed_ota: signedOta,
        anti_rollback: signedOta,
        tier: project.tier,
        note: 'Mock scorecard. Real adapter inspects ESP-IDF sdkconfig + eFuse status from a connected device or build artefact.',
      },
      durationMs: Date.now() - start,
    };
  },
};

const rollbackArtefactRealAdapter: QualityAdapter = {
  gateKey: 'rollback-artefact',
  displayLabel: 'Rollback artefact present',
  isMandatory: true,
  kind: 'real',
  version: '0.1.0',
  appliesTo: (project) => project.path === 'maintain',
  run: async ({ db, project }) => {
    const start = Date.now();
    // Inspect every active patch plan on the project. The latest non-cancelled
    // plan must have rollback_artefact_ref set; for Tier 3 the secure-update
    // chain (signed_image + verified_boot + rollback_protected) must also be
    // true. This mirrors the locked invariants enforced by maintain-service.ts.
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
        outcome: 'skip',
        score: null,
        summary: 'No active patch plans to evaluate. Create a Maintain patch plan first.',
        details: { plan_count: 0, note: 'Maintain pipeline runs with no plan to evaluate against.' },
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
        outcome: 'fail',
        score: 0,
        summary: `${failingPlans.length} of ${plans.length} active patch plan(s) missing required rollback / secure-update fields`,
        details: { failing_plans: failingPlans, total_plans: plans.length, project_tier: project.tier },
        durationMs: Date.now() - start,
      };
    }

    return {
      outcome: 'pass',
      score: 100,
      summary: `All ${plans.length} active patch plan(s) have required rollback artefact${project.tier === 3 ? ' + secure-update chain' : ''}.`,
      details: { plan_count: plans.length, project_tier: project.tier },
      durationMs: Date.now() - start,
    };
  },
};

const regulatoryPackRealAdapter: QualityAdapter = {
  gateKey: 'regulatory-pack-complete',
  displayLabel: 'Regulatory pack complete',
  isMandatory: true,
  kind: 'real',
  version: '0.1.0',
  appliesTo: (project) => project.path === 'develop' && project.tier >= 2,
  run: async ({ db, project }) => {
    const start = Date.now();
    const reg = createRegulatoryPackService(db);
    const summary = await reg.assessCompleteness({ project_id: project.id });

    if (summary.ready_to_ship) {
      return {
        outcome: 'pass',
        score: 100,
        summary: `${summary.signed_off}/${summary.required_total} required regulatory artefacts signed off.`,
        details: { ...summary, project_tier: project.tier },
        durationMs: Date.now() - start,
      };
    }

    // Tier 2 with only DPA + workplace-safety: warn (not block) if reviewed
    // but not signed; fail if any are missing.
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

const ADAPTERS: QualityAdapter[] = [
  platformioMockAdapter,
  clangTidyMockAdapter,
  cyclonedxMockAdapter,
  cveScanRealAdapter,
  wokwiMockAdapter,
  securityScorecardMockAdapter,
  rollbackArtefactRealAdapter,
  regulatoryPackRealAdapter,
];

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

  return { listAdapters, runPipeline, listRuns, getRunDetail };
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
