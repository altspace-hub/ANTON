import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Cpu, ChevronRight, CheckCircle2, Circle, AlertTriangle,
  PlayCircle, Loader2, ShieldAlert, ShieldCheck, FlaskConical,
  Beaker, Hammer, Activity, BookOpen, Globe, Languages, Wifi,
  Stethoscope, Palette, Zap, ScrollText,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type HardwarePath = 'diagnose' | 'maintain' | 'develop';
type PhaseStatus = 'pending' | 'in_progress' | 'blocked' | 'complete' | 'skipped';
type ShipVerdict = 'green' | 'amber' | 'block';
type GateOutcome = 'pass' | 'warn' | 'fail' | 'skip' | 'error';

interface HardwareProject {
  id: string;
  title: string;
  description: string | null;
  family_id: string;
  path: HardwarePath;
  tier: 1 | 2 | 3;
  region: string | null;
  working_language: string;
  offline_first: boolean;
  safety_critical: boolean;
  medical_adjacent: boolean;
  tier1_secure_update_ack: boolean;
  hkp_id: string | null;
  status: string;
  current_phase_id: string | null;
}

interface Phase {
  id: string;
  phase_key: string;
  phase_index: number;
  display_label: string;
  status: PhaseStatus;
  artefact_ref: string | null;
  blocking_reason: string | null;
  data: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
}

interface ProjectDetail extends HardwareProject {
  phases: Phase[];
}

interface QualityRun {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  ship_verdict: ShipVerdict | null;
  overall_score: number | null;
  mandatory_pass: number | null;
  mandatory_total: number | null;
}

interface QualityRunDetail {
  runId: string;
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
    adapter_kind: 'mock' | 'real';
    adapter_version: string;
    outcome: GateOutcome;
    score: number | null;
    is_mandatory: boolean;
    summary: string;
    details: Record<string, unknown>;
    duration_ms: number;
  }>;
}

const PHASE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  requirements: BookOpen,
  architecture: Palette,
  schematic: Zap,
  firmware: Cpu,
  assembly_tests: Beaker,
  deploy_operate: Activity,
  symptom_capture: Stethoscope,
  hypothesis: FlaskConical,
  measurement: Activity,
  resolution: CheckCircle2,
  contribution: BookOpen,
  change_scope: BookOpen,
  pre_patch_verify: ShieldCheck,
  patch_sequence: Hammer,
  acceptance_test: Beaker,
  rollback_plan: ShieldAlert,
  post_patch_verify: ShieldCheck,
};

const STATUS_STYLES: Record<PhaseStatus, string> = {
  pending: 'text-adv-gray',
  in_progress: 'text-adv-teal',
  blocked: 'text-amber-400',
  complete: 'text-emerald-400',
  skipped: 'text-adv-gray',
};

const VERDICT_STYLES: Record<ShipVerdict, string> = {
  green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  block: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const OUTCOME_STYLES: Record<GateOutcome, string> = {
  pass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  fail: 'bg-red-500/10 text-red-400 border-red-500/30',
  skip: 'bg-adv-card text-adv-gray border-adv-gray/30',
  error: 'bg-red-500/10 text-red-400 border-red-500/30',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwareProjectPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [runs, setRuns] = useState<QualityRun[]>([]);
  const [runDetail, setRunDetail] = useState<QualityRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const loadProject = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load project');
      setProject(json.project);
      const runsRes = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/quality/runs`);
      const runsJson = await runsRes.json();
      if (runsJson.success) setRuns(runsJson.runs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadProject(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  useEffect(() => {
    // Path-specific workspaces — develop stays here, diagnose / maintain redirect.
    if (!project) return;
    if (project.path === 'diagnose') {
      nav(`/hardware/projects/${project.id}/diagnose`, { replace: true });
    } else if (project.path === 'maintain') {
      nav(`/hardware/projects/${project.id}/maintain`, { replace: true });
    }
  }, [project, nav]);

  const runQuality = async () => {
    if (!id) return;
    setRunning(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/quality/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_reason: 'manual-ui' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Quality run failed');
      setRunDetail(json.run);
      // Refresh runs list
      const runsRes = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/quality/runs`);
      const runsJson = await runsRes.json();
      if (runsJson.success) setRuns(runsJson.runs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setRunning(false); }
  };

  const loadRunDetail = async (runId: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/quality/runs/${runId}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load run');
      setRunDetail(json.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const advancePhase = async (phaseId: string, newStatus: PhaseStatus, qualityScoreId?: string) => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/phases/${phaseId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus, quality_score_id: qualityScoreId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Phase advance failed');
      if (json.warnings?.length) setError(`Phase advanced with warnings: ${json.warnings.join('; ')}`);
      await loadProject();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const phaseInProgress = useMemo(() => project?.phases.find(p => p.status === 'in_progress'), [project]);
  const firmwarePhase = useMemo(() => project?.phases.find(p => p.phase_key === 'firmware'), [project]);

  if (loading) {
    return (
      <div className="min-h-screen bg-adv-dark text-adv-off-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
        <button onClick={() => nav('/hardware')} className="text-adv-teal flex items-center gap-1 mb-4"><ArrowLeft className="w-4 h-4" />Back</button>
        <div className="text-center text-adv-gray py-12">Project not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
      <div className="max-w-7xl mx-auto">
        <button onClick={() => nav('/hardware')} className="text-adv-teal flex items-center gap-1 mb-3 text-sm hover:underline"><ArrowLeft className="w-4 h-4" />Hardware Build</button>

        {/* Header / Phase 0 record */}
        <header className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[300px]">
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Cpu className="w-6 h-6 text-adv-teal" />{project.title}
              </h1>
              {project.description && <p className="text-sm text-adv-gray mt-1">{project.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill kind="path">{project.path}</Pill>
              <Pill kind="tier">Tier {project.tier}</Pill>
              {project.safety_critical && <Pill kind="warn">safety-critical</Pill>}
              {project.medical_adjacent && <Pill kind="warn-pink">medical-adjacent</Pill>}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-adv-gray">
            <div className="flex items-center gap-1"><Cpu className="w-3 h-3" />Family: <span className="text-adv-off-white">{project.family_id}</span></div>
            <div className="flex items-center gap-1"><Globe className="w-3 h-3" />Region: <span className="text-adv-off-white">{project.region ?? 'unspecified'}</span></div>
            <div className="flex items-center gap-1"><Languages className="w-3 h-3" />Language: <span className="text-adv-off-white">{project.working_language}</span></div>
            <div className="flex items-center gap-1"><Wifi className="w-3 h-3" />{project.offline_first ? 'Offline-first' : 'Online-allowed'}</div>
            <div className="flex items-center gap-1"><BookOpen className="w-3 h-3" />HKP: <span className="text-adv-off-white">{project.hkp_id ?? 'none'}</span></div>
          </div>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-sm flex items-start justify-between gap-2">
            <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</span>
            <button onClick={() => setError(null)} className="text-xs text-adv-gray hover:text-adv-off-white">dismiss</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Phase stepper */}
          <section className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-2">Phases</h2>
            <ol className="space-y-2">
              {project.phases.map(phase => {
                const Icon = PHASE_ICONS[phase.phase_key] ?? Circle;
                return (
                  <li key={phase.id} className={`p-3 rounded border ${phase.status === 'in_progress' ? 'border-adv-teal/50 bg-adv-teal/5' : 'border-adv-gray/20 bg-adv-card'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`mt-0.5 ${STATUS_STYLES[phase.status]}`}>
                          {phase.status === 'complete' ? <CheckCircle2 className="w-5 h-5" /> :
                           phase.status === 'in_progress' ? <Icon className="w-5 h-5" /> :
                           phase.status === 'blocked' ? <AlertTriangle className="w-5 h-5" /> :
                           <Circle className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-adv-gray uppercase tracking-wide">Phase {phase.phase_index + 1}</div>
                          <div className="font-medium">{phase.display_label}</div>
                          {phase.blocking_reason && <div className="text-xs text-amber-400 mt-1">Blocked: {phase.blocking_reason}</div>}
                          {phase.artefact_ref && <div className="text-xs text-adv-gray mt-1">Artefact: <code>{phase.artefact_ref}</code></div>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded border ${
                          phase.status === 'complete' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          phase.status === 'in_progress' ? 'bg-adv-teal/10 text-adv-teal border-adv-teal/30' :
                          phase.status === 'blocked' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                          'bg-adv-card text-adv-gray border-adv-gray/30'
                        }`}>{phase.status}</span>
                        {phase.status === 'in_progress' && phase.phase_key !== 'firmware' && (
                          <button
                            onClick={() => advancePhase(phase.id, 'complete')}
                            className="text-xs text-adv-teal hover:underline"
                          >
                            Mark complete →
                          </button>
                        )}
                        {phase.status === 'in_progress' && phase.phase_key === 'firmware' && (
                          <span className="text-xs text-adv-gray italic">requires quality run</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {phaseInProgress && (
              <p className="text-xs text-adv-gray mt-3">
                Active phase: <span className="text-adv-off-white">{phaseInProgress.display_label}</span> — open the matching module from <code>/hardware/knowledge-packs</code> or the Modules picker to do the work; mark complete here when the artefact is ready.
              </p>
            )}
          </section>

          {/* Quality pipeline panel */}
          <section className="lg:col-span-1">
            <h2 className="text-lg font-semibold mb-2">Quality pipeline</h2>
            <div className="p-3 rounded border border-adv-gray/20 bg-adv-card mb-3">
              <div className="text-xs text-adv-gray mb-2">
                6 gates run on the active firmware artefact. Mandatory gates that fail force <code>ship_verdict=block</code> regardless of overall score.
              </div>
              <button
                onClick={runQuality}
                disabled={running}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark transition disabled:opacity-50 font-medium"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                Run pipeline
              </button>
              <p className="text-xs text-adv-gray mt-2 leading-snug">
                Phase 4 ships <strong>mock</strong> adapters for PlatformIO / Clang-tidy / CycloneDX / Wokwi / Security scorecard, and a <strong>real</strong> CVE-scan adapter that queries the lifecycle layer. Real adapters drop in via the same QualityAdapter contract in subsequent sprints.
              </p>
            </div>

            {/* Latest verdict + reasoning */}
            {runDetail && (
              <div className={`p-3 rounded border mb-3 ${VERDICT_STYLES[runDetail.shipVerdict]}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wide font-semibold">Latest verdict</span>
                  <span className="font-bold text-lg">{runDetail.shipVerdict}</span>
                </div>
                <div className="text-xs">
                  Score {runDetail.overallScore}/100 · Mandatory {runDetail.mandatoryGatesPass}/{runDetail.mandatoryGatesTotal} pass · {runDetail.warningsCount} warning(s) · {runDetail.failuresCount} fail
                </div>
                {firmwarePhase && firmwarePhase.status === 'in_progress' && runDetail.shipVerdict !== 'block' && (
                  <button
                    onClick={() => advancePhase(firmwarePhase.id, 'complete', runDetail.runId)}
                    className="mt-2 w-full px-2 py-1 text-xs rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark font-medium"
                  >
                    Complete firmware phase with this run
                  </button>
                )}
              </div>
            )}

            {runDetail && (
              <ul className="space-y-1 mb-3">
                {runDetail.results.map(r => (
                  <li key={r.gate_key} className="p-2 rounded border border-adv-gray/20 bg-adv-card text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-medium text-adv-off-white">{r.display_label}</div>
                        <div className="text-adv-gray">{r.summary}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${OUTCOME_STYLES[r.outcome]}`}>{r.outcome}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${r.adapter_kind === 'real' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-adv-card text-adv-gray border-adv-gray/30'}`}>{r.adapter_kind}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Run history */}
            <h3 className="text-sm font-semibold mb-1 text-adv-gray uppercase tracking-wide">Run history</h3>
            <ul className="space-y-1">
              {runs.length === 0 ? (
                <li className="text-xs text-adv-gray text-center py-4">No runs yet.</li>
              ) : runs.map(r => (
                <li key={r.run_id}>
                  <button
                    onClick={() => loadRunDetail(r.run_id)}
                    className="w-full text-left p-2 rounded border border-adv-gray/20 bg-adv-card hover:border-adv-teal/40 transition flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-adv-gray">{new Date(r.started_at).toLocaleString()}</span>
                    <span className="flex items-center gap-2">
                      {r.ship_verdict && (
                        <span className={`px-1.5 py-0.5 rounded border ${VERDICT_STYLES[r.ship_verdict]}`}>{r.ship_verdict}</span>
                      )}
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Regulatory pack summary (Tier 2/3 develop projects only) */}
          {project.tier >= 2 && project.path === 'develop' && (
            <RegulatoryPackPanel projectId={project.id} />
          )}

          {/* Humanitarian deployment shortcut (always available) */}
          <HumanitarianShortcut projectId={project.id} />
        </div>
      </div>
    </div>
  );
}

function HumanitarianShortcut({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  return (
    <section className="lg:col-span-1">
      <h2 className="text-lg font-semibold mb-2">Humanitarian deployment</h2>
      <button
        onClick={() => nav(`/hardware/projects/${projectId}/humanitarian`)}
        className="w-full p-3 rounded border border-adv-gray/20 bg-adv-card hover:border-adv-teal/40 transition text-left"
      >
        <div className="text-sm font-medium">Open humanitarian workspace →</div>
        <p className="text-xs text-adv-gray mt-1">
          Manage the deployment record (local partner, OCHA cluster, donor exit), generate capacity-transfer artefacts in the project's working language, and download the offline deployment kit.
        </p>
      </button>
    </section>
  );
}

function RegulatoryPackPanel({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  const [summary, setSummary] = useState<{
    required_total: number; signed_off: number; user_reviewed: number;
    generated: number; missing: number; ready_to_ship: boolean;
    blockers: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${projectId}/regulatory-pack-status`);
        const json = await res.json();
        if (!cancelled && res.ok && json.success) setSummary(json.summary);
      } catch { /* non-fatal */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <section className="lg:col-span-1">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <ScrollText className="w-5 h-5 text-adv-teal" />Regulatory pack
      </h2>
      <div className="p-3 rounded border border-adv-gray/20 bg-adv-card">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-adv-teal" />
        ) : !summary ? (
          <div className="text-xs text-adv-gray">Pack status unavailable.</div>
        ) : (
          <>
            <div className={`text-sm font-medium flex items-center gap-2 ${summary.ready_to_ship ? 'text-emerald-400' : summary.missing > 0 ? 'text-red-400' : 'text-amber-400'}`}>
              {summary.ready_to_ship ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              {summary.ready_to_ship
                ? 'Pack complete — ready to ship'
                : `${summary.signed_off}/${summary.required_total} signed off`}
            </div>
            <div className="text-xs text-adv-gray mt-1">
              {summary.missing > 0 && `${summary.missing} missing · `}
              {summary.generated > 0 && `${summary.generated} generated · `}
              {summary.user_reviewed > 0 && `${summary.user_reviewed} reviewed`}
            </div>
            {summary.blockers.length > 0 && (
              <ul className="mt-2 text-xs text-adv-gray space-y-0.5 max-h-32 overflow-y-auto">
                {summary.blockers.slice(0, 5).map((b, i) => (
                  <li key={i} className="border-l-2 border-amber-500/40 pl-2">{b}</li>
                ))}
              </ul>
            )}
            <button
              onClick={() => nav(`/hardware/projects/${projectId}/regulatory`)}
              className="mt-3 w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark text-sm font-medium"
            >
              Open regulatory workspace
            </button>
            <p className="text-xs text-adv-gray mt-2">
              ANTON does not certify. The user is the responsible economic operator. Independent legal review required before sign-off.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Pill({ kind, children }: { kind: 'path' | 'tier' | 'warn' | 'warn-pink'; children: React.ReactNode }) {
  const cls = {
    path: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    tier: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30',
    warn: 'bg-red-500/10 text-red-400 border-red-500/30',
    'warn-pink': 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  }[kind];
  return <span className={`text-xs px-2 py-0.5 rounded border ${cls}`}>{children}</span>;
}
