import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cpu, Plus, ChevronRight, Activity, ShieldAlert, Loader2, AlertTriangle,
  X, ArrowRight, CheckCircle2, Globe, Languages, Wifi, ShieldCheck, Stethoscope,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';

// ── Types (mirror server/services/hardware-project-service.ts) ───────────────

type HardwarePath = 'diagnose' | 'maintain' | 'develop';
type HardwareTier = 1 | 2 | 3;
type ProjectStatus = 'active' | 'paused' | 'archived' | 'shipped';

interface HardwareFamily {
  id: string;
  display_name: string;
  status: 'launch' | 'beta' | 'reserved' | 'deprecated';
}

interface HardwareProject {
  id: string;
  title: string;
  description: string | null;
  family_id: string;
  path: HardwarePath;
  tier: HardwareTier;
  region: string | null;
  working_language: string;
  offline_first: boolean;
  safety_critical: boolean;
  medical_adjacent: boolean;
  hkp_id: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

const PATH_COLORS: Record<HardwarePath, string> = {
  diagnose: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  maintain: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  develop:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

const TIER_COLORS: Record<number, string> = {
  1: 'bg-adv-card text-adv-gray border-adv-gray/30',
  2: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30',
  3: 'bg-red-500/10 text-red-400 border-red-500/30',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwareBuildPage() {
  const nav = useNavigate();
  const [projects, setProjects] = useState<HardwareProject[]>([]);
  const [families, setFamilies] = useState<HardwareFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load projects');
      setProjects(json.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setLoading(false); }
  };

  const loadFamilies = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/families`);
      const json = await res.json();
      if (json.success) setFamilies(json.families);
    } catch { /* non-fatal */ }
  };

  useEffect(() => { loadProjects(); loadFamilies(); }, []);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
      <header className="max-w-7xl mx-auto mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Cpu className="w-6 h-6 text-adv-teal" />
            Hardware Build
          </h1>
          <p className="text-sm text-adv-gray mt-1 max-w-2xl">
            Tier 5 of the Coding area. Diagnose, maintain, or develop embedded hardware with the three-layer knowledge pack and quality-gated firmware pipeline.
            Phase 0 classification (family + path + tier) is non-skippable for every project.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark transition font-medium"
        >
          <Plus className="w-4 h-4" />
          New project
        </button>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto mb-4 p-3 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      <section className="max-w-7xl mx-auto">
        {loading ? (
          <div className="py-12 text-center text-adv-gray">
            <Loader2 className="w-6 h-6 animate-spin inline mb-2" />
            <div>Loading your hardware projects…</div>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onNew={() => setWizardOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map(p => (
              <ProjectCard key={p.id} project={p} onOpen={() => nav(`/hardware/projects/${p.id}`)} />
            ))}
          </div>
        )}
      </section>

      <section className="max-w-7xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
        <QuickLink
          icon={<Activity className="w-5 h-5 text-adv-teal" />}
          title="Hardware Knowledge Packs"
          description="Browse the three-layer reference packs for every supported family"
          onClick={() => nav('/hardware/knowledge-packs')}
        />
        <QuickLink
          icon={<ShieldAlert className="w-5 h-5 text-adv-red" />}
          title="Lifecycle advisories"
          description="NVD + GHSA + Espressif security feeds, automatically scoped to your projects"
          onClick={() => nav('/hardware/knowledge-packs')}
        />
        <QuickLink
          icon={<Stethoscope className="w-5 h-5 text-adv-blue" />}
          title="Quality pipeline gates"
          description="See the 6 gates (PlatformIO, Clang-tidy, CycloneDX, CVE scan, Wokwi, Security scorecard) and adapter status"
          onClick={() => nav('/hardware/knowledge-packs')}
        />
        <QuickLink
          icon={<Activity className="w-5 h-5 text-emerald-400" />}
          title="Hardware templates"
          description="Pre-populated project blueprints — start from a curated ESP32 template instead of from scratch"
          onClick={() => nav('/hardware/templates')}
        />
        <QuickLink
          icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
          title="Community review queue"
          description="Pending HKP, diagnostic case, and template submissions awaiting review"
          onClick={() => nav('/hardware/review-queue')}
        />
      </section>

      {wizardOpen && (
        <Phase0Wizard
          families={families.filter(f => f.status === 'launch' || f.status === 'beta')}
          onClose={() => setWizardOpen(false)}
          onCreated={(project) => {
            setWizardOpen(false);
            nav(`/hardware/projects/${project.id}`);
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="text-center py-16 border border-dashed border-adv-gray/30 rounded">
      <Cpu className="w-12 h-12 text-adv-gray mx-auto mb-3" />
      <h2 className="text-lg font-semibold">No hardware projects yet</h2>
      <p className="text-sm text-adv-gray mt-1 max-w-md mx-auto">
        Start with the Phase 0 classification — pick the hardware family, choose between Diagnose / Maintain / Develop, and confirm the tier so every downstream module knows which gates to enforce.
      </p>
      <button onClick={onNew} className="mt-4 px-4 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark font-medium">
        Start a new project
      </button>
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: HardwareProject; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="text-left p-4 rounded border border-adv-gray/20 bg-adv-card hover:border-adv-teal/40 transition group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-xs text-adv-gray uppercase tracking-wide">{project.family_id} · {project.region ?? 'no region'}</div>
          <div className="text-lg font-semibold leading-tight">{project.title}</div>
        </div>
        <ChevronRight className="w-5 h-5 text-adv-gray group-hover:text-adv-teal transition" />
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`text-xs px-2 py-0.5 rounded border ${PATH_COLORS[project.path]}`}>{project.path}</span>
        <span className={`text-xs px-2 py-0.5 rounded border ${TIER_COLORS[project.tier]}`}>Tier {project.tier}</span>
        {project.safety_critical && (
          <span className="text-xs px-2 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30">safety-critical</span>
        )}
        {project.medical_adjacent && (
          <span className="text-xs px-2 py-0.5 rounded border bg-pink-500/10 text-pink-400 border-pink-500/30">medical-adjacent</span>
        )}
      </div>
      <div className="text-xs text-adv-gray flex items-center gap-2">
        <Languages className="w-3 h-3" />{project.working_language}
        {project.offline_first && <span className="inline-flex items-center gap-1"><Wifi className="w-3 h-3" />offline-first</span>}
        <span>· status {project.status}</span>
      </div>
    </button>
  );
}

function QuickLink({ icon, title, description, onClick }: { icon: React.ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left p-4 rounded border border-adv-gray/20 bg-adv-card hover:border-adv-teal/40 transition">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="font-medium">{title}</span></div>
      <p className="text-xs text-adv-gray">{description}</p>
    </button>
  );
}

// ── Phase 0 wizard ────────────────────────────────────────────────────────────

interface WizardData {
  title: string;
  description: string;
  family_id: string;
  path: HardwarePath;
  tier: HardwareTier;
  region: string;
  working_language: string;
  offline_first: boolean;
  safety_critical: boolean;
  medical_adjacent: boolean;
  tier1_secure_update_ack: boolean;
}

const DEFAULT_WIZARD: WizardData = {
  title: '',
  description: '',
  family_id: 'esp32',
  path: 'develop',
  tier: 1,
  region: '',
  working_language: 'en',
  offline_first: true,
  safety_critical: false,
  medical_adjacent: false,
  tier1_secure_update_ack: false,
};

function Phase0Wizard({ families, onClose, onCreated }: {
  families: HardwareFamily[]; onClose: () => void; onCreated: (p: { id: string }) => void;
}) {
  const [data, setData] = useState<WizardData>(DEFAULT_WIZARD);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof WizardData>(k: K, v: WizardData[K]) => setData(d => ({ ...d, [k]: v }));

  const canProceed = useMemo(() => {
    if (step === 0) return data.title.trim().length > 0 && data.family_id;
    if (step === 1) return Boolean(data.path);
    if (step === 2) return [1, 2, 3].includes(data.tier);
    return true;
  }, [step, data]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Tier 1 + connected device: require explicit secure-update ack
      const body = {
        title: data.title.trim(),
        description: data.description.trim() || null,
        family_id: data.family_id,
        path: data.path,
        tier: data.tier,
        region: data.region.trim() || null,
        working_language: data.working_language,
        offline_first: data.offline_first,
        safety_critical: data.safety_critical,
        medical_adjacent: data.medical_adjacent,
        tier1_secure_update_ack: data.tier1_secure_update_ack,
      };
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to create project');
      onCreated({ id: json.project.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-adv-dark-2 border border-adv-gray/20 rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 bg-adv-dark-2 border-b border-adv-gray/20 p-4 flex items-start justify-between">
          <div>
            <div className="text-xs text-adv-gray uppercase tracking-wide">Phase 0 — Classification (non-skippable)</div>
            <h2 className="text-xl font-semibold">Start a new hardware project</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-adv-card"><X className="w-5 h-5" /></button>
        </header>

        <nav className="flex border-b border-adv-gray/20">
          {['Family', 'Path', 'Tier', 'Context'].map((label, i) => (
            <div key={label} className={`px-4 py-2 text-sm border-b-2 ${step === i ? 'border-adv-teal text-adv-teal' : i < step ? 'border-emerald-500/50 text-emerald-400' : 'border-transparent text-adv-gray'}`}>
              {i < step && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
              {i + 1}. {label}
            </div>
          ))}
        </nav>

        <div className="p-4 space-y-4">
          {step === 0 && (
            <>
              <Field label="Project title">
                <input
                  type="text"
                  value={data.title}
                  onChange={e => update('title', e.target.value)}
                  placeholder="e.g., ESP32 weather station for school greenhouse"
                  className="w-full bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Description (optional)">
                <textarea
                  value={data.description}
                  onChange={e => update('description', e.target.value)}
                  rows={2}
                  className="w-full bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Hardware family">
                <select
                  value={data.family_id}
                  onChange={e => update('family_id', e.target.value)}
                  className="w-full bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm"
                >
                  {families.map(f => (
                    <option key={f.id} value={f.id}>{f.display_name}</option>
                  ))}
                </select>
                <p className="text-xs text-adv-gray mt-1">Reserved families (Arduino, Raspberry Pi, STM32, nRF52, RP2040) come online in later phases.</p>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-sm text-adv-gray">Choose the path that matches the most pressing thing you want to do. You can change this later.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {(['diagnose', 'maintain', 'develop'] as HardwarePath[]).map(p => (
                  <button
                    key={p}
                    onClick={() => update('path', p)}
                    className={`text-left p-3 rounded border ${data.path === p ? 'border-adv-teal bg-adv-teal/5' : 'border-adv-gray/20 hover:border-adv-teal/40'}`}
                  >
                    <div className="font-medium capitalize mb-1">{p}</div>
                    <p className="text-xs text-adv-gray">
                      {p === 'diagnose' && 'Something is broken — find the root cause.'}
                      {p === 'maintain' && 'Apply an update or patch with rollback.'}
                      {p === 'develop' && 'Design and build something new.'}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-adv-gray">Tier determines which regulatory and quality gates downstream modules will enforce.</p>
              <div className="space-y-2">
                {[1, 2, 3].map(t => (
                  <button
                    key={t}
                    onClick={() => update('tier', t as HardwareTier)}
                    className={`w-full text-left p-3 rounded border ${data.tier === t ? 'border-adv-teal bg-adv-teal/5' : 'border-adv-gray/20 hover:border-adv-teal/40'}`}
                  >
                    <div className="font-medium">Tier {t} — {t === 1 ? 'Personal tinkering' : t === 2 ? 'Professional internal use' : 'Placed on market / distributed'}</div>
                    <p className="text-xs text-adv-gray mt-1">
                      {t === 1 && 'For your own bench. Permits skipping the secure-update chain (with acknowledgement).'}
                      {t === 2 && 'Deployed inside an organisation. Triggers data-protection assessment + workplace safety checklist.'}
                      {t === 3 && 'External deployment. Full regulatory artefact pack (CRA, RED, MDR if medical, DoC, VDP, hazard analysis).'}
                    </p>
                  </button>
                ))}
              </div>
              {data.tier === 1 && (
                <label className="flex items-start gap-2 p-3 rounded border border-amber-500/30 bg-amber-500/5">
                  <input type="checkbox" checked={data.tier1_secure_update_ack} onChange={e => update('tier1_secure_update_ack', e.target.checked)} className="mt-0.5" />
                  <span className="text-xs text-amber-200">
                    I understand that as a Tier 1 personal-tinkering project, the secure-update chain (signed firmware + verified boot + rollback protection) may be skipped — but if I later distribute this device or expose it to anyone outside my own bench, I am responsible for upgrading to Tier 2/3 first.
                  </span>
                </label>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Field label="Deployment region">
                <input
                  type="text"
                  value={data.region}
                  onChange={e => update('region', e.target.value)}
                  placeholder="e.g., eu, west-africa, global"
                  className="w-full bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-adv-gray mt-1">Drives regional sourcing alternatives + counterfeit-risk assessment from the HKP.</p>
              </Field>
              <Field label="Working language (ISO 639-1)">
                <input
                  type="text"
                  value={data.working_language}
                  onChange={e => update('working_language', e.target.value)}
                  className="w-full bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm"
                  maxLength={5}
                />
              </Field>
              <div className="flex flex-col gap-2">
                <Toggle label="Offline-first deployment" checked={data.offline_first} onChange={v => update('offline_first', v)} />
                <Toggle label="Safety-critical (failure can cause physical harm)" checked={data.safety_critical} onChange={v => update('safety_critical', v)} />
                <Toggle label="Medical-adjacent (touches a patient or generates clinical data)" checked={data.medical_adjacent} onChange={v => update('medical_adjacent', v)} />
              </div>
              {data.medical_adjacent && (
                <div className="p-3 rounded border border-pink-500/30 bg-pink-500/5 text-xs text-pink-200">
                  Medical-adjacent projects auto-engage the Clinical Safety Officer perspective. ANTON does not certify the device — you remain the responsible economic operator under MDR / FDA / equivalent.
                </div>
              )}
              {data.tier === 3 && (
                <div className="p-3 rounded border border-red-500/30 bg-red-500/5 text-xs text-red-200">
                  Tier 3 builds will require a full regulatory artefact pack (CRA, RED, MDR if medical, DoC, VDP, hazard analysis) before deployment can be marked complete. ANTON generates templates only.
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-sm text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>
          )}
        </div>

        <footer className="sticky bottom-0 bg-adv-dark-2 border-t border-adv-gray/20 p-3 flex items-center justify-between">
          <button onClick={() => setStep(s => (s > 0 ? (s - 1) as 0 | 1 | 2 | 3 : s))} disabled={step === 0} className="px-3 py-1.5 text-sm rounded border border-adv-gray/30 hover:border-adv-teal/40 disabled:opacity-50 disabled:cursor-not-allowed">
            Back
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as 0 | 1 | 2 | 3)}
              disabled={!canProceed}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || !canProceed}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Create project
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-adv-gray mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// (Globe import retained because the QuickLink list could grow to use it.)
void Globe;
