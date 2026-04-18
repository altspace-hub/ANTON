import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Cpu, AlertTriangle, Loader2, ChevronRight, CheckCircle2,
  Plus, ShieldAlert, ShieldCheck, GitMerge, Activity, BookOpen, RotateCcw,
  Server, Layers, X, Send, ExternalLink, Pencil,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChangeKind = 'firmware-update' | 'config-change' | 'calibration' | 'partition-table' | 'secure-boot-burn' | 'recall';
type StageKind = 'canary' | 'wave' | 'full-rollout' | 'verification' | 'soak';
type StageStatus = 'pending' | 'in_progress' | 'soaking' | 'passed' | 'failed' | 'rolled_back' | 'skipped';
type PlanStatus = 'draft' | 'ready' | 'in_progress' | 'paused' | 'rolled_back' | 'complete' | 'cancelled';
type Verdict = 'applicable' | 'not-applicable-version' | 'not-applicable-feature' | 'not-applicable-exposure';

interface ProjectMini {
  id: string; title: string; family_id: string; path: string; tier: number;
  region: string | null; working_language: string; hkp_id: string | null;
  current_phase_id: string | null;
  phases: Array<{ id: string; phase_key: string; phase_index: number; display_label: string; status: string }>;
}

interface PatchPlan {
  id: string; project_id: string; title: string; description: string | null;
  change_kind: ChangeKind; source_event_id: string | null;
  rollback_artefact_ref: string | null; rollback_artefact_hash: string | null;
  signed_image: boolean; verified_boot: boolean; rollback_protected: boolean;
  status: PlanStatus; audit_trail: Array<{ ts: string; actor: string; action: string; note?: string }>;
  created_at: string; updated_at: string;
}

interface PatchStage {
  id: string; plan_id: string; stage_index: number; stage_kind: StageKind;
  title: string; description: string | null;
  cohort: { device_ids?: string[]; percentage?: number; all?: boolean };
  acceptance_rules: Array<{ metric: string; operator: string; threshold: unknown; observed_via: string }>;
  status: StageStatus; rollback_on_failure: boolean;
  acceptance_results: Array<{ metric: string; observed: number | string; pass: boolean }>;
  notes: string | null;
}

interface FleetDevice {
  id: string; device_label: string; hardware_serial: string | null;
  region: string | null; current_firmware: string | null; status: string;
}

interface ApplicabilityVerdict {
  event_id: string; title: string; severity: string | null; cvss_score: number | null;
  source: string; source_url: string | null; published_at: string;
  verdict: Verdict; rationale: string; recommended_action: string;
}

interface CveAssessment {
  total_events_in_scope: number;
  applicable_count: number;
  not_applicable_count: number;
  highest_applicable_cvss: number | null;
  ship_recommendation: 'green' | 'amber' | 'block';
  verdicts: ApplicabilityVerdict[];
}

const PHASE_KEYS = [
  'change_scope', 'pre_patch_verify', 'patch_sequence', 'acceptance_test', 'rollback_plan', 'post_patch_verify',
] as const;

const VERDICT_STYLES: Record<'green' | 'amber' | 'block', string> = {
  green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  block: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const STAGE_STATUS_STYLES: Record<StageStatus, string> = {
  pending: 'bg-adv-card text-adv-gray border-adv-gray/30',
  in_progress: 'bg-adv-teal/10 text-adv-teal border-adv-teal/30',
  soaking: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30',
  passed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/10 text-red-400 border-red-500/30',
  rolled_back: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  skipped: 'bg-adv-card text-adv-gray border-adv-gray/30',
};

const PLAN_STATUS_STYLES: Record<PlanStatus, string> = {
  draft: 'bg-adv-card text-adv-gray border-adv-gray/30',
  ready: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30',
  in_progress: 'bg-adv-teal/10 text-adv-teal border-adv-teal/30',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  rolled_back: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  complete: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-adv-card text-adv-gray border-adv-gray/30',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwareMaintainPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [project, setProject] = useState<ProjectMini | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PatchPlan[]>([]);
  const [activePlan, setActivePlan] = useState<PatchPlan | null>(null);
  const [stages, setStages] = useState<PatchStage[]>([]);
  const [fleet, setFleet] = useState<FleetDevice[]>([]);
  const [assessment, setAssessment] = useState<CveAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showAddStage, setShowAddStage] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);

  // Loaders ───────────────────────────────────────────────────────────────────

  const loadProject = async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load project');
      setProject(json.project);
      if (json.project.path !== 'maintain') {
        nav(`/hardware/projects/${json.project.id}`, { replace: true });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  const loadPlans = async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/patch-plans`);
      const json = await res.json();
      if (json.success) {
        setPlans(json.plans);
        if (json.plans.length > 0 && !activePlan) {
          await loadPlan(json.plans[0].id);
        }
      }
    } catch { /* non-fatal */ }
  };

  const loadPlan = async (planId: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/patch-plans/${planId}`);
      const json = await res.json();
      if (json.success) {
        setActivePlan(json.plan);
        setStages(json.stages);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  const loadFleet = async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/fleet-devices`);
      const json = await res.json();
      if (json.success) setFleet(json.devices);
    } catch { /* non-fatal */ }
  };

  const runAssessment = async () => {
    if (!id) return;
    setAssessing(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/cve-applicability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Assessment failed');
      setAssessment(json.assessment);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setAssessing(false); }
  };

  useEffect(() => { loadProject(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);
  useEffect(() => {
    if (project) {
      loadPlans();
      loadFleet();
      runAssessment();
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [project]);

  const advancePlanStatus = async (status: PlanStatus) => {
    if (!activePlan) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/patch-plans/${activePlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Update failed');
      await loadPlan(activePlan.id);
      await loadPlans();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  const advanceStage = async (stageId: string, newStatus: StageStatus) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/patch-stages/${stageId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Advance failed');
      if (activePlan) await loadPlan(activePlan.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-adv-dark text-adv-off-white flex items-center justify-center">
        {error
          ? <div className="text-red-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>
          : <Loader2 className="w-6 h-6 animate-spin text-adv-teal" />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
      <div className="max-w-7xl mx-auto">
        <button onClick={() => nav('/hardware')} className="text-adv-teal flex items-center gap-1 mb-3 text-sm hover:underline">
          <ArrowLeft className="w-4 h-4" />Hardware Build
        </button>

        <header className="mb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Cpu className="w-6 h-6 text-adv-teal" />
            {project.title}
          </h1>
          <div className="text-xs text-adv-gray flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30">maintain</span>
            <span>family: {project.family_id}</span>
            <span>tier {project.tier}</span>
            <span>region: {project.region ?? '—'}</span>
            <span>HKP: {project.hkp_id ?? 'none'}</span>
          </div>
        </header>

        {error && (
          <div className="mb-3 p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-start justify-between gap-2">
            <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</span>
            <button onClick={() => setError(null)} className="hover:underline">dismiss</button>
          </div>
        )}

        {/* CVE applicability banner */}
        <CveBanner assessment={assessment} assessing={assessing} onRefresh={runAssessment} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <main className="lg:col-span-2 space-y-4">
            {/* Patch plans */}
            <section className="p-4 rounded border border-adv-gray/20 bg-adv-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-adv-gray flex items-center gap-2">
                  <GitMerge className="w-4 h-4" />Patch plans
                </h2>
                <button
                  onClick={() => setShowCreatePlan(true)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10"
                >
                  <Plus className="w-3 h-3" />new plan
                </button>
              </div>

              {plans.length === 0 ? (
                <p className="text-sm text-adv-gray text-center py-6">
                  No patch plans yet. Create one to start the Maintain workflow.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1 mb-3">
                  {plans.map(p => (
                    <button
                      key={p.id}
                      onClick={() => loadPlan(p.id)}
                      className={`text-xs px-2 py-1 rounded border ${
                        activePlan?.id === p.id ? 'border-adv-teal bg-adv-teal/10 text-adv-teal' : 'border-adv-gray/30 hover:border-adv-teal/40'
                      }`}
                    >
                      {p.title}
                      <span className={`ml-2 text-[10px] px-1 rounded border ${PLAN_STATUS_STYLES[p.status]}`}>{p.status}</span>
                    </button>
                  ))}
                </div>
              )}

              {activePlan && (
                <PlanDetail
                  plan={activePlan}
                  stages={stages}
                  projectTier={project.tier}
                  fleetCount={fleet.length}
                  onUpdatePlan={async (patch) => {
                    const res = await fetchWithAuth(`${API_BASE}/hardware/patch-plans/${activePlan.id}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(patch),
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) {
                      setError(json.error ?? 'Update failed');
                    } else {
                      await loadPlan(activePlan.id);
                    }
                  }}
                  onAdvancePlanStatus={advancePlanStatus}
                  onAddStage={() => setShowAddStage(true)}
                  onAdvanceStage={advanceStage}
                  onRecordAcceptance={async (stageId, observations) => {
                    const res = await fetchWithAuth(`${API_BASE}/hardware/patch-stages/${stageId}/acceptance`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ observations }),
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) setError(json.error ?? 'Acceptance failed');
                    else if (activePlan) await loadPlan(activePlan.id);
                  }}
                  onPlanRollout={async (stageId, channel) => {
                    const res = await fetchWithAuth(`${API_BASE}/hardware/patch-stages/${stageId}/rollouts`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ delivery_channel: channel }),
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) setError(json.error ?? 'Rollout failed');
                  }}
                />
              )}
            </section>
          </main>

          <aside className="lg:col-span-1 space-y-4">
            {/* Phase progress */}
            <section className="p-3 rounded border border-adv-gray/20 bg-adv-card">
              <h3 className="text-xs uppercase tracking-wide text-adv-gray flex items-center gap-1 mb-2">
                <Layers className="w-3 h-3" />6-phase progress
              </h3>
              <ol className="space-y-1 text-xs">
                {PHASE_KEYS.map((k, i) => {
                  const phase = project.phases.find(p => p.phase_key === k);
                  if (!phase) return null;
                  const isActive = phase.id === project.current_phase_id;
                  return (
                    <li key={k} className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${isActive ? 'bg-adv-teal/5 border border-adv-teal/30' : ''}`}>
                      <span className={phase.status === 'complete' ? 'text-emerald-400' : isActive ? 'text-adv-teal' : 'text-adv-gray'}>
                        {i + 1}. {phase.display_label}
                      </span>
                      {phase.status === 'complete' ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <span className="text-[10px] text-adv-gray">{phase.status}</span>}
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-adv-gray mt-2">
                Phase progression mirrors patch plan status. The pre-patch / post-patch / acceptance / rollback phases align with the Maintain plan stages.
              </p>
            </section>

            {/* Fleet panel */}
            <section className="p-3 rounded border border-adv-gray/20 bg-adv-card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase tracking-wide text-adv-gray flex items-center gap-1">
                  <Server className="w-3 h-3" />Fleet ({fleet.length})
                </h3>
                <button
                  onClick={() => setShowAddDevice(true)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />add
                </button>
              </div>
              <ul className="space-y-1 text-xs max-h-48 overflow-y-auto">
                {fleet.length === 0 ? (
                  <li className="text-adv-gray text-center py-2">No devices yet</li>
                ) : fleet.map(d => (
                  <li key={d.id} className="flex items-center justify-between border border-adv-gray/20 rounded p-1.5">
                    <div>
                      <div className="font-mono">{d.device_label}</div>
                      <div className="text-[10px] text-adv-gray">{d.region ?? '—'} · {d.current_firmware ?? 'unknown fw'}</div>
                    </div>
                    <span className="text-[10px] text-adv-gray">{d.status}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-adv-gray mt-2">
                Wave stages on fleets &gt; 5 devices require a passing canary stage first (locked invariant).
              </p>
            </section>
          </aside>
        </div>

        {showCreatePlan && id && (
          <CreatePlanModal
            projectId={id}
            cveCandidates={(assessment?.verdicts ?? []).filter(v => v.verdict === 'applicable').slice(0, 10)}
            onClose={() => setShowCreatePlan(false)}
            onCreated={async () => { setShowCreatePlan(false); await loadPlans(); }}
            onError={setError}
          />
        )}

        {showAddStage && activePlan && (
          <AddStageModal
            planId={activePlan.id}
            fleet={fleet}
            onClose={() => setShowAddStage(false)}
            onAdded={async () => { setShowAddStage(false); await loadPlan(activePlan.id); }}
            onError={setError}
          />
        )}

        {showAddDevice && id && (
          <AddDeviceModal
            projectId={id}
            onClose={() => setShowAddDevice(false)}
            onAdded={async () => { setShowAddDevice(false); await loadFleet(); }}
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CveBanner({ assessment, assessing, onRefresh }: {
  assessment: CveAssessment | null; assessing: boolean; onRefresh: () => void;
}) {
  if (!assessment) {
    return (
      <div className="p-3 rounded border border-adv-gray/20 bg-adv-card flex items-center gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin text-adv-teal" />
        Running CVE applicability assessment…
      </div>
    );
  }
  const cls = VERDICT_STYLES[assessment.ship_recommendation];
  const Icon = assessment.ship_recommendation === 'green' ? ShieldCheck : ShieldAlert;
  return (
    <div className={`p-3 rounded border ${cls} flex items-start justify-between gap-3`}>
      <div className="flex items-start gap-2 flex-1">
        <Icon className="w-5 h-5 mt-0.5" />
        <div>
          <div className="text-xs uppercase tracking-wide font-semibold">CVE applicability</div>
          <div className="text-sm">
            {assessment.applicable_count}/{assessment.total_events_in_scope} events apply to this project's posture.
            Recommendation: <strong>{assessment.ship_recommendation.toUpperCase()}</strong>
            {assessment.highest_applicable_cvss !== null && ` · highest CVSS ${assessment.highest_applicable_cvss}`}
          </div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">Top applicable advisories</summary>
            <ul className="mt-2 space-y-1">
              {assessment.verdicts.filter(v => v.verdict === 'applicable').slice(0, 8).map(v => (
                <li key={v.event_id} className="border-l-2 border-current/30 pl-2">
                  <div>
                    <span className="font-mono text-[10px]">{v.event_id}</span>
                    {v.cvss_score !== null && <span className="ml-1">· CVSS {v.cvss_score}</span>}
                  </div>
                  <div className="text-adv-off-white">{v.title}</div>
                  <div className="opacity-80">{v.recommended_action}</div>
                  {v.source_url && (
                    <a href={v.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline opacity-70 hover:opacity-100">
                      source <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
      <button onClick={onRefresh} disabled={assessing} className="text-xs px-2 py-1 rounded border hover:bg-adv-card disabled:opacity-50">
        {assessing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'refresh'}
      </button>
    </div>
  );
}

function PlanDetail({
  plan, stages, projectTier, fleetCount, onUpdatePlan, onAdvancePlanStatus, onAddStage, onAdvanceStage, onRecordAcceptance, onPlanRollout,
}: {
  plan: PatchPlan; stages: PatchStage[]; projectTier: number; fleetCount: number;
  onUpdatePlan: (p: Partial<PatchPlan>) => Promise<void>;
  onAdvancePlanStatus: (s: PlanStatus) => Promise<void>;
  onAddStage: () => void;
  onAdvanceStage: (stageId: string, status: StageStatus) => Promise<void>;
  onRecordAcceptance: (stageId: string, obs: Array<{ metric: string; observed: number | string }>) => Promise<void>;
  onPlanRollout: (stageId: string, channel: 'ota' | 'usb' | 'aap-store-and-forward' | 'manual') => Promise<void>;
}) {
  const [editingArtefact, setEditingArtefact] = useState(false);
  const [draftRef, setDraftRef] = useState(plan.rollback_artefact_ref ?? '');
  const [draftHash, setDraftHash] = useState(plan.rollback_artefact_hash ?? '');

  const tier3Required = projectTier === 3;
  const secureUpdateChainOk = plan.signed_image && plan.verified_boot && plan.rollback_protected;
  const canActivate = Boolean(plan.rollback_artefact_ref) && (!tier3Required || secureUpdateChainOk);

  return (
    <div className="space-y-3 pt-3 border-t border-adv-gray/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-adv-gray">{plan.change_kind} · {plan.id.slice(0, 8)}</div>
          <div className="text-base font-medium">{plan.title}</div>
          {plan.description && <div className="text-xs text-adv-gray">{plan.description}</div>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded border ${PLAN_STATUS_STYLES[plan.status]}`}>{plan.status}</span>
      </div>

      {/* Rollback artefact + secure-update chain */}
      <div className="border border-adv-gray/20 rounded p-3 bg-adv-dark/50 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wide text-adv-gray flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />Rollback artefact (mandatory)
          </h3>
          <button onClick={() => setEditingArtefact(e => !e)} className="text-xs text-adv-teal hover:underline flex items-center gap-1">
            <Pencil className="w-3 h-3" />{editingArtefact ? 'cancel' : 'edit'}
          </button>
        </div>
        {editingArtefact ? (
          <div className="space-y-2">
            <input
              value={draftRef}
              onChange={e => setDraftRef(e.target.value)}
              placeholder="rollback_artefact_ref (e.g., s3://anton/firmware/v1.2.2.bin or sha256:…)"
              className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-xs"
            />
            <input
              value={draftHash}
              onChange={e => setDraftHash(e.target.value)}
              placeholder="rollback_artefact_hash (sha256)"
              className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-xs"
            />
            <button
              onClick={async () => {
                await onUpdatePlan({ rollback_artefact_ref: draftRef.trim() || null, rollback_artefact_hash: draftHash.trim() || null });
                setEditingArtefact(false);
              }}
              className="text-xs px-2 py-1 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="text-xs">
            <div>ref: <code className="text-adv-off-white">{plan.rollback_artefact_ref ?? <span className="text-red-400">not set</span>}</code></div>
            <div>hash: <code className="text-adv-off-white">{plan.rollback_artefact_hash ?? '—'}</code></div>
          </div>
        )}

        {tier3Required && (
          <div className="space-y-1">
            <div className="text-xs text-adv-gray uppercase tracking-wide">Tier 3 secure-update chain</div>
            <Toggle
              label="signed image"
              checked={plan.signed_image}
              onChange={(v) => onUpdatePlan({ signed_image: v })}
            />
            <Toggle
              label="verified boot"
              checked={plan.verified_boot}
              onChange={(v) => onUpdatePlan({ verified_boot: v })}
            />
            <Toggle
              label="rollback-protected"
              checked={plan.rollback_protected}
              onChange={(v) => onUpdatePlan({ rollback_protected: v })}
            />
          </div>
        )}

        {plan.status === 'draft' && (
          <button
            onClick={() => onAdvancePlanStatus('ready')}
            disabled={!plan.rollback_artefact_ref}
            className="w-full text-xs px-2 py-1.5 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
          >
            Mark plan ready
          </button>
        )}
        {plan.status === 'ready' && (
          <button
            onClick={() => onAdvancePlanStatus('in_progress')}
            disabled={!canActivate}
            className="w-full text-xs px-2 py-1.5 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
          >
            Start patch (in_progress)
          </button>
        )}
      </div>

      {/* Stages */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wide text-adv-gray">Stages ({stages.length})</h3>
          <button onClick={onAddStage} className="text-xs text-adv-teal hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" />add stage
          </button>
        </div>
        {stages.length === 0 ? (
          <p className="text-xs text-adv-gray text-center py-3 border border-dashed border-adv-gray/30 rounded">
            No stages yet. Add canary first (1-5 devices), then wave (e.g., 25%), then full-rollout.
          </p>
        ) : (
          <ol className="space-y-2">
            {stages.map(s => (
              <StageCard
                key={s.id}
                stage={s}
                fleetCount={fleetCount}
                planActive={plan.status === 'in_progress'}
                onAdvance={(status) => onAdvanceStage(s.id, status)}
                onRecordAcceptance={(obs) => onRecordAcceptance(s.id, obs)}
                onPlanRollout={(channel) => onPlanRollout(s.id, channel)}
              />
            ))}
          </ol>
        )}
      </div>

      {/* Audit trail */}
      {plan.audit_trail.length > 0 && (
        <details className="text-xs">
          <summary className="text-adv-gray cursor-pointer flex items-center gap-1">
            <BookOpen className="w-3 h-3" />Audit trail ({plan.audit_trail.length} entries)
          </summary>
          <ol className="mt-1 space-y-1">
            {plan.audit_trail.map((a, i) => (
              <li key={i} className="border-l-2 border-adv-teal/40 pl-2">
                <div className="text-adv-gray">{new Date(a.ts).toLocaleString()} · {a.actor}</div>
                <div className="text-adv-off-white">{a.action}{a.note ? ` — ${a.note}` : ''}</div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function StageCard({ stage, fleetCount, planActive, onAdvance, onRecordAcceptance, onPlanRollout }: {
  stage: PatchStage; fleetCount: number; planActive: boolean;
  onAdvance: (status: StageStatus) => Promise<void>;
  onRecordAcceptance: (obs: Array<{ metric: string; observed: number | string }>) => Promise<void>;
  onPlanRollout: (channel: 'ota' | 'usb' | 'aap-store-and-forward' | 'manual') => Promise<void>;
}) {
  const [observations, setObservations] = useState<Record<string, string>>({});

  const cohortDescription = useMemo(() => {
    if (stage.cohort.all) return 'all active devices';
    if (stage.cohort.percentage) return `${stage.cohort.percentage}% of fleet`;
    if (stage.cohort.device_ids?.length) return `${stage.cohort.device_ids.length} specific device(s)`;
    return '—';
  }, [stage.cohort]);

  return (
    <li className="border border-adv-gray/20 rounded p-3 bg-adv-dark/50 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="text-xs text-adv-gray">stage {stage.stage_index + 1} · {stage.stage_kind} · cohort: {cohortDescription}</div>
          <div className="text-sm font-medium">{stage.title}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded border ${STAGE_STATUS_STYLES[stage.status]}`}>{stage.status}</span>
      </div>

      {stage.acceptance_rules.length > 0 && (
        <div className="text-xs">
          <div className="text-adv-gray uppercase tracking-wide mb-1">Acceptance rules</div>
          <ul className="space-y-1">
            {stage.acceptance_rules.map((rule, i) => {
              const result = stage.acceptance_results.find(r => r.metric === rule.metric);
              return (
                <li key={i} className="flex items-center justify-between border-l-2 border-adv-gray/30 pl-2">
                  <span className="font-mono text-[11px]">
                    {rule.metric} {rule.operator} {typeof rule.threshold === 'object' ? JSON.stringify(rule.threshold) : String(rule.threshold)}
                  </span>
                  {result ? (
                    <span className={result.pass ? 'text-emerald-400' : 'text-red-400'}>
                      observed {String(result.observed)} · {result.pass ? 'pass' : 'fail'}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={observations[rule.metric] ?? ''}
                      onChange={e => setObservations({ ...observations, [rule.metric]: e.target.value })}
                      placeholder="record observation"
                      className="bg-adv-card border border-adv-gray/30 rounded px-1.5 py-0.5 text-[11px] w-32"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {stage.status === 'pending' && planActive && (
          <button
            onClick={() => onAdvance('in_progress')}
            className="text-xs px-2 py-1 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark"
          >
            Start stage
          </button>
        )}
        {stage.status === 'in_progress' && (
          <>
            <button
              onClick={() => onPlanRollout('ota')}
              className="text-xs px-2 py-1 rounded border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 flex items-center gap-1"
            >
              <Send className="w-3 h-3" />Plan OTA rollout
            </button>
            {Object.keys(observations).length > 0 && (
              <button
                onClick={() => {
                  const obs = Object.entries(observations).map(([metric, v]) => ({
                    metric, observed: isNaN(Number(v)) ? v : Number(v),
                  }));
                  onRecordAcceptance(obs);
                  setObservations({});
                }}
                className="text-xs px-2 py-1 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark"
              >
                Record acceptance ({Object.keys(observations).length})
              </button>
            )}
          </>
        )}
      </div>

      {stage.stage_kind === 'wave' && fleetCount > 5 && stage.status === 'pending' && (
        <p className="text-xs text-amber-400">Wave on fleet &gt; 5 devices requires an earlier passing canary stage.</p>
      )}
    </li>
  );
}

function CreatePlanModal({ projectId, cveCandidates, onClose, onCreated, onError }: {
  projectId: string;
  cveCandidates: ApplicabilityVerdict[];
  onClose: () => void; onCreated: () => Promise<void>;
  onError: (s: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [changeKind, setChangeKind] = useState<ChangeKind>('firmware-update');
  const [sourceEventId, setSourceEventId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${projectId}/patch-plans`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          change_kind: changeKind,
          source_event_id: sourceEventId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Create failed');
      await onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal title="New patch plan" onClose={onClose}>
      <div className="space-y-2">
        <Field label="Title">
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
        </Field>
        <Field label="Description (optional)">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
        </Field>
        <Field label="Change kind">
          <select value={changeKind} onChange={e => setChangeKind(e.target.value as ChangeKind)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
            <option value="firmware-update">firmware-update</option>
            <option value="config-change">config-change</option>
            <option value="calibration">calibration</option>
            <option value="partition-table">partition-table</option>
            <option value="secure-boot-burn">secure-boot-burn</option>
            <option value="recall">recall</option>
          </select>
        </Field>
        {cveCandidates.length > 0 && (
          <Field label="Linked CVE event (optional)">
            <select value={sourceEventId} onChange={e => setSourceEventId(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
              <option value="">— none —</option>
              {cveCandidates.map(v => (
                <option key={v.event_id} value={v.event_id}>{v.event_id} — CVSS {v.cvss_score ?? '?'} · {v.title.slice(0, 60)}</option>
              ))}
            </select>
          </Field>
        )}
        <button onClick={submit} disabled={!title.trim() || submitting} className="w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 text-sm font-medium">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Create plan'}
        </button>
      </div>
    </Modal>
  );
}

function AddStageModal({ planId, fleet, onClose, onAdded, onError }: {
  planId: string; fleet: FleetDevice[];
  onClose: () => void; onAdded: () => Promise<void>; onError: (s: string) => void;
}) {
  const [stageKind, setStageKind] = useState<StageKind>('canary');
  const [title, setTitle] = useState('');
  const [cohortMode, setCohortMode] = useState<'devices' | 'percentage' | 'all'>('devices');
  const [percentage, setPercentage] = useState(25);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [acceptanceRulesText, setAcceptanceRulesText] = useState('boot_count_after_1h >= 5\ncrash_rate_per_hour < 0.1');
  const [submitting, setSubmitting] = useState(false);

  const parseRules = (text: string): Array<{ metric: string; operator: string; threshold: number | string; observed_via: string }> => {
    return text.split('\n').map(line => {
      const m = line.trim().match(/^(\S+)\s*(>=|<=|==|!=|>|<)\s*(\S+)$/);
      if (!m) return null;
      const threshold = isNaN(Number(m[3])) ? m[3] : Number(m[3]);
      return { metric: m[1], operator: m[2], threshold, observed_via: 'telemetry' };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const cohort: PatchStage['cohort'] =
        cohortMode === 'all' ? { all: true } :
        cohortMode === 'percentage' ? { percentage } :
        { device_ids: selectedDeviceIds };
      const rules = parseRules(acceptanceRulesText);
      const res = await fetchWithAuth(`${API_BASE}/hardware/patch-plans/${planId}/stages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_kind: stageKind,
          title: title.trim() || `${stageKind} stage`,
          cohort,
          acceptance_rules: rules,
          rollback_on_failure: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Add stage failed');
      await onAdded();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal title="New patch stage" onClose={onClose}>
      <div className="space-y-2">
        <Field label="Stage kind">
          <select value={stageKind} onChange={e => setStageKind(e.target.value as StageKind)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
            <option value="canary">canary</option>
            <option value="wave">wave</option>
            <option value="full-rollout">full-rollout</option>
            <option value="verification">verification</option>
            <option value="soak">soak</option>
          </select>
        </Field>
        <Field label="Title">
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
        </Field>
        <Field label="Cohort">
          <select value={cohortMode} onChange={e => setCohortMode(e.target.value as 'devices' | 'percentage' | 'all')} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
            <option value="devices">specific devices</option>
            <option value="percentage">% of fleet</option>
            <option value="all">all active</option>
          </select>
        </Field>
        {cohortMode === 'percentage' && (
          <Field label="Percentage">
            <input type="number" min={1} max={100} value={percentage} onChange={e => setPercentage(Number(e.target.value))} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
          </Field>
        )}
        {cohortMode === 'devices' && (
          <Field label="Devices">
            <div className="max-h-32 overflow-y-auto border border-adv-gray/30 rounded p-2 text-xs space-y-0.5">
              {fleet.length === 0 ? <div className="text-adv-gray">No devices in fleet</div> : fleet.map(d => (
                <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDeviceIds.includes(d.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedDeviceIds([...selectedDeviceIds, d.id]);
                      else setSelectedDeviceIds(selectedDeviceIds.filter(id => id !== d.id));
                    }}
                  />
                  <span className="font-mono">{d.device_label}</span>
                  <span className="text-adv-gray">{d.region ?? ''}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <Field label="Acceptance rules (one per line: metric operator threshold)">
          <textarea
            value={acceptanceRulesText}
            onChange={e => setAcceptanceRulesText(e.target.value)}
            rows={4}
            className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-xs font-mono"
          />
          <p className="text-xs text-adv-gray mt-1">Operators: &lt;, &lt;=, ==, &gt;=, &gt;, !=. Quantitative — no descriptions.</p>
        </Field>
        <button onClick={submit} disabled={submitting} className="w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 text-sm font-medium">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Add stage'}
        </button>
      </div>
    </Modal>
  );
}

function AddDeviceModal({ projectId, onClose, onAdded, onError }: {
  projectId: string; onClose: () => void; onAdded: () => Promise<void>; onError: (s: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [serial, setSerial] = useState('');
  const [region, setRegion] = useState('');
  const [firmware, setFirmware] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${projectId}/fleet-devices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_label: label.trim(),
          hardware_serial: serial.trim() || null,
          region: region.trim() || null,
          current_firmware: firmware.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Add device failed');
      await onAdded();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal title="Add fleet device" onClose={onClose}>
      <div className="space-y-2">
        <Field label="Device label"><input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g., gw-lagos-01" className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" /></Field>
        <Field label="Hardware serial / chip ID (optional)"><input value={serial} onChange={e => setSerial(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" /></Field>
        <Field label="Region (optional)"><input value={region} onChange={e => setRegion(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" /></Field>
        <Field label="Current firmware version (optional)"><input value={firmware} onChange={e => setFirmware(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" /></Field>
        <button onClick={submit} disabled={!label.trim() || submitting} className="w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 text-sm font-medium">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Add device'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-adv-dark-2 border border-adv-gray/20 rounded max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 bg-adv-dark-2 border-b border-adv-gray/20 p-3 flex items-center justify-between">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-adv-card"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-adv-gray mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className={checked ? 'text-emerald-400' : 'text-adv-gray'}>{label}</span>
    </label>
  );
}

// keep the unused-icon imports happy for future expansion
void Activity;
