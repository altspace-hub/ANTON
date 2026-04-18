import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Globe, AlertTriangle, Loader2, Sparkles, ShieldCheck, ShieldAlert,
  RefreshCcw, Pencil, Save, X, Download, History, CheckCircle2, RotateCcw, Languages,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type CapacityArtefactKind = 'installation-guide' | 'operator-checklist' | 'troubleshooting-flowchart' | 'spares-procedure' | 'escalation' | 'decommissioning';
type CapacityArtefactStatus = 'draft' | 'generated' | 'user-reviewed' | 'signed-off' | 'withdrawn';
type GeneratorKind = 'claude-localized' | 'english-skeleton-fallback' | 'manual';
type DeploymentStatus = 'planning' | 'training' | 'pilot' | 'rollout' | 'operating' | 'transferred' | 'decommissioned';
type InternetPosture = 'none' | 'intermittent' | 'scheduled' | 'always-on';
type PowerPosture = 'grid' | 'grid+battery' | 'solar' | 'generator' | 'battery';

interface ProjectMini {
  id: string; title: string; family_id: string; tier: number; region: string | null;
  working_language: string; safety_critical: boolean; medical_adjacent: boolean;
}

interface Deployment {
  id: string; local_partner_name: string; local_partner_contact: string;
  ocha_cluster: string | null; cluster_contact: string | null;
  donor_exit_date: string | null; post_donor_plan: string | null;
  units_planned: number; internet_posture: InternetPosture;
  power_posture: PowerPosture; status: DeploymentStatus;
}

interface CapacityArtefact {
  id: string; project_id: string; kind: CapacityArtefactKind;
  title: string; language: string; status: CapacityArtefactStatus;
  content_markdown: string | null;
  generator_version: string | null;
  generator_kind: GeneratorKind;
  signed_off_by: string | null; signed_off_at: string | null;
  signoff_attestation: string | null;
}

interface ListEntry { kind: CapacityArtefactKind; title: string; artefact: CapacityArtefact | null }

interface SignoffEntry {
  id: string; action: string; actor_id: string;
  attestation: string | null; reason: string | null;
  content_hash: string | null; occurred_at: string;
}

interface PackSummary {
  total: number; signed_off: number; user_reviewed: number;
  generated: number; missing: number; ready_to_handover: boolean;
  language: string; blockers: string[];
}

const STATUS_STYLES: Record<CapacityArtefactStatus, string> = {
  draft: 'bg-adv-card text-adv-gray border-adv-gray/30',
  generated: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30',
  'user-reviewed': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'signed-off': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  withdrawn: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwareHumanitarianPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [project, setProject] = useState<ProjectMini | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [list, setList] = useState<ListEntry[]>([]);
  const [summary, setSummary] = useState<PackSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<CapacityArtefact | null>(null);
  const [history, setHistory] = useState<SignoffEntry[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<null | string>(null);
  const [signoffOpen, setSignoffOpen] = useState(false);
  const [attestation, setAttestation] = useState('');
  const [showDeploymentEdit, setShowDeploymentEdit] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadProject = async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load project');
      setProject(json.project);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  const loadDeployment = async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/humanitarian-deployment`);
      const json = await res.json();
      if (json.success) setDeployment(json.deployment);
    } catch { /* non-fatal */ }
  };

  const loadList = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/capacity-transfer-artefacts`);
      const json = await res.json();
      if (json.success) {
        setList(json.artefacts);
        setSummary(json.summary);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setLoading(false); }
  };

  const loadActive = async (artefactId: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/capacity-transfer-artefacts/${artefactId}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load artefact');
      setActive(json.artefact);
      setHistory(json.history);
      setDraft(json.artefact.content_markdown ?? '');
      setEditing(false);
      setSignoffOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  useEffect(() => { loadProject(); loadDeployment(); loadList(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const generate = async (k: CapacityArtefactKind) => {
    if (!id) return;
    setBusy(`gen-${k}`);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/capacity-transfer-artefacts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: k }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Generate failed');
      await loadList();
      await loadActive(json.artefact.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const saveContent = async () => {
    if (!active) return;
    setBusy('save');
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/capacity-transfer-artefacts/${active.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_markdown: draft }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Save failed');
      await loadActive(active.id);
      await loadList();
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const signOff = async () => {
    if (!active) return;
    setBusy('signoff');
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/capacity-transfer-artefacts/${active.id}/signoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Sign-off failed');
      await loadActive(active.id);
      await loadList();
      setSignoffOpen(false);
      setAttestation('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const withdraw = async () => {
    if (!active) return;
    if (!confirm('Withdraw sign-off? Audit trail is retained.')) return;
    setBusy('withdraw');
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/capacity-transfer-artefacts/${active.id}/withdraw`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Operator-initiated withdrawal' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Withdraw failed');
      await loadActive(active.id);
      await loadList();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const downloadBundle = async (allowUnsigned: boolean) => {
    if (!id) return;
    try {
      const url = `${API_BASE}/hardware/projects/${id}/humanitarian-bundle${allowUnsigned ? '?allow_unsigned=true' : ''}`;
      const res = await fetchWithAuth(url);
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Bundle download failed');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `humanitarian-deployment-kit-${id.slice(0, 8)}${allowUnsigned ? '-DRAFT' : ''}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
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
        <button onClick={() => nav(`/hardware/projects/${project.id}`)} className="text-adv-teal flex items-center gap-1 mb-3 text-sm hover:underline">
          <ArrowLeft className="w-4 h-4" />Back to project
        </button>

        <header className="mb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Globe className="w-6 h-6 text-adv-teal" />
            Humanitarian deployment — {project.title}
          </h1>
          <div className="text-xs text-adv-gray flex items-center gap-2 flex-wrap">
            <span>Tier {project.tier}</span>
            <span>family: {project.family_id}</span>
            <span>region: {project.region ?? '—'}</span>
            <span className="flex items-center gap-1"><Languages className="w-3 h-3" />working language: <strong>{project.working_language}</strong></span>
          </div>
        </header>

        {error && (
          <div className="mb-3 p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-start justify-between gap-2">
            <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</span>
            <button onClick={() => setError(null)} className="hover:underline">dismiss</button>
          </div>
        )}

        {/* Pack summary */}
        {summary && (
          <div className={`p-3 rounded border mb-4 ${summary.ready_to_handover ? 'border-emerald-500/30 bg-emerald-500/5' : summary.missing > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {summary.ready_to_handover ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <ShieldAlert className="w-5 h-5 text-amber-400" />}
                <div>
                  <div className="text-sm font-medium">
                    {summary.ready_to_handover
                      ? `Pack ready for handover — all ${summary.total} capacity-transfer artefacts signed off in ${summary.language}`
                      : `${summary.signed_off}/${summary.total} capacity-transfer artefacts signed off in ${summary.language}`}
                  </div>
                  <div className="text-xs text-adv-gray">
                    {summary.missing > 0 && `${summary.missing} missing · `}
                    {summary.generated > 0 && `${summary.generated} generated · `}
                    {summary.user_reviewed > 0 && `${summary.user_reviewed} reviewed`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadBundle(false)}
                  disabled={!summary.ready_to_handover}
                  className="text-xs px-3 py-1.5 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />Download deployment kit
                </button>
                <button
                  onClick={() => downloadBundle(true)}
                  className="text-xs px-2 py-1.5 rounded border border-adv-gray/30 hover:border-amber-500/40 text-amber-400 flex items-center gap-1"
                >
                  Draft kit (unsigned ok)
                </button>
              </div>
            </div>
            {summary.blockers.length > 0 && (
              <ul className="mt-2 text-xs text-adv-gray space-y-0.5 max-h-24 overflow-y-auto">
                {summary.blockers.slice(0, 6).map((b, i) => (
                  <li key={i} className="border-l-2 border-amber-500/40 pl-2">{b}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Deployment record + artefact list */}
          <aside className="lg:col-span-1 space-y-3">
            {/* Deployment record */}
            <DeploymentCard
              deployment={deployment}
              onEdit={() => setShowDeploymentEdit(true)}
            />

            {/* Capacity-transfer artefact list */}
            {loading ? (
              <div className="text-center text-adv-gray py-4"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
            ) : list.map(item => (
              <ArtefactCard
                key={item.kind}
                item={item}
                isActive={active?.kind === item.kind}
                busy={busy}
                onGenerate={() => generate(item.kind)}
                onOpen={() => item.artefact && loadActive(item.artefact.id)}
              />
            ))}
          </aside>

          {/* Active artefact editor */}
          <main className="lg:col-span-2">
            {!active ? (
              <div className="p-6 rounded border border-dashed border-adv-gray/30 text-center text-sm text-adv-gray">
                Select an artefact from the list, or click Generate to create the skeleton in {project.working_language}.
              </div>
            ) : (
              <ArtefactEditor
                artefact={active}
                history={history}
                editing={editing}
                draft={draft}
                busy={busy}
                signoffOpen={signoffOpen}
                attestation={attestation}
                onEditToggle={() => setEditing(e => !e)}
                onDraftChange={setDraft}
                onSave={saveContent}
                onSignoffOpen={() => setSignoffOpen(true)}
                onSignoffClose={() => { setSignoffOpen(false); setAttestation(''); }}
                onAttestationChange={setAttestation}
                onSignoff={signOff}
                onWithdraw={withdraw}
                onRegenerate={() => generate(active.kind)}
              />
            )}
          </main>
        </div>

        {showDeploymentEdit && id && (
          <DeploymentEditModal
            projectId={id}
            existing={deployment}
            onClose={() => setShowDeploymentEdit(false)}
            onSaved={async () => { setShowDeploymentEdit(false); await loadDeployment(); }}
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DeploymentCard({ deployment, onEdit }: { deployment: Deployment | null; onEdit: () => void }) {
  return (
    <section className="p-3 rounded border border-adv-gray/20 bg-adv-card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide text-adv-gray flex items-center gap-1">
          <Globe className="w-3 h-3" />Deployment record
        </h3>
        <button onClick={onEdit} className="text-xs text-adv-teal hover:underline flex items-center gap-1">
          <Pencil className="w-3 h-3" />{deployment ? 'edit' : 'create'}
        </button>
      </div>
      {!deployment ? (
        <p className="text-xs text-adv-gray">Create a deployment record before generating capacity-transfer artefacts. The local partner + region drive the generator output.</p>
      ) : (
        <dl className="text-xs space-y-1">
          <div><dt className="text-adv-gray inline">Local partner: </dt><dd className="inline text-adv-off-white">{deployment.local_partner_name}</dd></div>
          <div><dt className="text-adv-gray inline">Contact: </dt><dd className="inline">{deployment.local_partner_contact}</dd></div>
          {deployment.ocha_cluster && <div><dt className="text-adv-gray inline">Cluster: </dt><dd className="inline">{deployment.ocha_cluster}</dd></div>}
          <div><dt className="text-adv-gray inline">Units planned: </dt><dd className="inline">{deployment.units_planned}</dd></div>
          <div><dt className="text-adv-gray inline">Internet: </dt><dd className="inline">{deployment.internet_posture}</dd></div>
          <div><dt className="text-adv-gray inline">Power: </dt><dd className="inline">{deployment.power_posture}</dd></div>
          {deployment.donor_exit_date && <div><dt className="text-adv-gray inline">Donor exit: </dt><dd className="inline">{deployment.donor_exit_date}</dd></div>}
          <div className="pt-1"><dt className="text-adv-gray inline">Status: </dt><dd className="inline text-adv-off-white">{deployment.status}</dd></div>
        </dl>
      )}
    </section>
  );
}

function ArtefactCard({ item, isActive, busy, onGenerate, onOpen }: {
  item: ListEntry; isActive: boolean; busy: string | null;
  onGenerate: () => void; onOpen: () => void;
}) {
  const has = !!item.artefact;
  const status = item.artefact?.status;
  const isFallback = item.artefact?.generator_kind === 'english-skeleton-fallback';
  return (
    <div
      onClick={has ? onOpen : undefined}
      className={`p-3 rounded border ${isActive ? 'border-adv-teal bg-adv-teal/5' : 'border-adv-gray/20 bg-adv-card'} ${has ? 'cursor-pointer hover:border-adv-teal/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1">
          <div className="text-xs text-adv-gray uppercase tracking-wide">{item.kind}</div>
          <div className="font-medium text-sm">{item.title}</div>
        </div>
        {status === 'signed-off' ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> :
         has ? <ShieldAlert className="w-4 h-4 text-amber-400" /> :
         <X className="w-4 h-4 text-red-400" />}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 flex-wrap">
          {status ? (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[status]}`}>{status}</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30">missing</span>
          )}
          {item.artefact && (
            <span className="text-[10px] text-adv-gray">{item.artefact.language}</span>
          )}
          {isFallback && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30">fallback skeleton</span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onGenerate(); }}
          disabled={busy === `gen-${item.kind}`}
          className="text-[10px] px-1.5 py-0.5 rounded border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 flex items-center gap-1 disabled:opacity-50"
        >
          {busy === `gen-${item.kind}` ? <Loader2 className="w-3 h-3 animate-spin" /> : has ? <RefreshCcw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          {has ? 'regenerate' : 'generate'}
        </button>
      </div>
    </div>
  );
}

function ArtefactEditor({
  artefact, history, editing, draft, busy, signoffOpen, attestation,
  onEditToggle, onDraftChange, onSave, onSignoffOpen, onSignoffClose,
  onAttestationChange, onSignoff, onWithdraw, onRegenerate,
}: {
  artefact: CapacityArtefact;
  history: SignoffEntry[];
  editing: boolean;
  draft: string;
  busy: string | null;
  signoffOpen: boolean;
  attestation: string;
  onEditToggle: () => void;
  onDraftChange: (s: string) => void;
  onSave: () => void;
  onSignoffOpen: () => void;
  onSignoffClose: () => void;
  onAttestationChange: (s: string) => void;
  onSignoff: () => void;
  onWithdraw: () => void;
  onRegenerate: () => void;
}) {
  const isFallback = artefact.generator_kind === 'english-skeleton-fallback';
  return (
    <section className="border border-adv-gray/20 rounded">
      <header className="border-b border-adv-gray/20 p-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-adv-gray uppercase tracking-wide">{artefact.kind} · language {artefact.language}</div>
          <h2 className="text-base font-semibold">{artefact.title}</h2>
          <div className="text-xs text-adv-gray flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded border ${STATUS_STYLES[artefact.status]}`}>{artefact.status}</span>
            <span>generator: {artefact.generator_kind} v{artefact.generator_version}</span>
            {artefact.signed_off_at && (
              <span>signed {new Date(artefact.signed_off_at).toLocaleDateString()} by {artefact.signed_off_by}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!editing && artefact.status !== 'signed-off' && (
            <button onClick={onEditToggle} className="text-xs px-2 py-1 rounded border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 flex items-center gap-1">
              <Pencil className="w-3 h-3" />Edit
            </button>
          )}
          {!editing && (
            <button onClick={onRegenerate} disabled={!!busy} className="text-xs px-2 py-1 rounded border border-adv-gray/30 hover:border-adv-teal/40 flex items-center gap-1 disabled:opacity-50">
              <RefreshCcw className="w-3 h-3" />Regenerate
            </button>
          )}
          {!editing && artefact.status !== 'signed-off' && artefact.content_markdown && (
            <button onClick={onSignoffOpen} className="text-xs px-2 py-1 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark flex items-center gap-1">
              <Sparkles className="w-3 h-3" />Sign off
            </button>
          )}
          {!editing && artefact.status === 'signed-off' && (
            <button onClick={onWithdraw} disabled={busy === 'withdraw'} className="text-xs px-2 py-1 rounded border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 flex items-center gap-1 disabled:opacity-50">
              <RotateCcw className="w-3 h-3" />Withdraw
            </button>
          )}
        </div>
      </header>

      {isFallback && (
        <div className="p-2 border-b border-adv-gray/20 bg-amber-500/5 text-xs text-amber-200">
          ⚠ This artefact is the English fallback skeleton (Claude API was unavailable at generation time). Regenerate when an API key is available, OR translate manually before sign-off. Sign-off will be refused while [TRANSLATE TO …] markers remain.
        </div>
      )}

      <div className="p-3 space-y-2">
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={e => onDraftChange(e.target.value)}
              rows={28}
              className="w-full bg-adv-dark border border-adv-gray/30 rounded p-2 font-mono text-xs leading-snug"
            />
            <div className="flex items-center gap-2">
              <button onClick={onSave} disabled={busy === 'save' || draft.length < 100} className="text-xs px-3 py-1.5 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark flex items-center gap-1 disabled:opacity-50">
                {busy === 'save' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
              </button>
              <button onClick={onEditToggle} className="text-xs px-3 py-1.5 rounded border border-adv-gray/30 hover:border-adv-teal/40">Cancel</button>
            </div>
          </>
        ) : artefact.content_markdown ? (
          <pre className="text-xs leading-snug whitespace-pre-wrap font-mono bg-adv-dark/50 p-3 rounded border border-adv-gray/20 max-h-[600px] overflow-y-auto">{artefact.content_markdown}</pre>
        ) : (
          <div className="text-sm text-adv-gray text-center py-6">No content yet — click Regenerate to produce the skeleton.</div>
        )}

        {signoffOpen && (
          <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 space-y-2">
            <div className="text-xs text-amber-200">
              Sign-off is your explicit attestation that you, as the responsible operator, accept that this {artefact.kind} is correct, complete, and translated to {artefact.language} (if applicable).
            </div>
            <textarea
              value={attestation}
              onChange={e => onAttestationChange(e.target.value)}
              rows={3}
              placeholder={`e.g., I, [name], on behalf of [implementing partner], confirm that this ${artefact.title} is correctly translated to ${artefact.language} and accurately reflects the deployment context.`}
              className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-xs"
            />
            <div className="flex items-center gap-2">
              <button onClick={onSignoff} disabled={busy === 'signoff' || attestation.trim().length < 30} className="text-xs px-3 py-1.5 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark flex items-center gap-1 disabled:opacity-50">
                {busy === 'signoff' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}Sign off
              </button>
              <button onClick={onSignoffClose} className="text-xs px-3 py-1.5 rounded border border-adv-gray/30 hover:border-adv-teal/40">Cancel</button>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-adv-gray flex items-center gap-1">
              <History className="w-3 h-3" />Audit trail ({history.length})
            </summary>
            <ol className="mt-2 space-y-1">
              {history.map(h => (
                <li key={h.id} className="border-l-2 border-adv-teal/40 pl-2">
                  <div className="text-adv-gray">{new Date(h.occurred_at).toLocaleString()} · <span className="text-adv-off-white">{h.action}</span> by {h.actor_id}</div>
                  {h.attestation && <div className="text-adv-gray italic">"{h.attestation}"</div>}
                  {h.reason && <div className="text-adv-gray">reason: {h.reason}</div>}
                  {h.content_hash && <div className="font-mono text-[10px] text-adv-gray">hash: {h.content_hash.slice(0, 16)}…</div>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </section>
  );
}

function DeploymentEditModal({ projectId, existing, onClose, onSaved, onError }: {
  projectId: string; existing: Deployment | null;
  onClose: () => void; onSaved: () => Promise<void>; onError: (s: string) => void;
}) {
  const [partnerName, setPartnerName] = useState(existing?.local_partner_name ?? '');
  const [partnerContact, setPartnerContact] = useState(existing?.local_partner_contact ?? '');
  const [ochaCluster, setOchaCluster] = useState(existing?.ocha_cluster ?? '');
  const [donorExit, setDonorExit] = useState(existing?.donor_exit_date ?? '');
  const [postPlan, setPostPlan] = useState(existing?.post_donor_plan ?? '');
  const [units, setUnits] = useState(existing?.units_planned ?? 1);
  const [internet, setInternet] = useState<InternetPosture>(existing?.internet_posture ?? 'intermittent');
  const [power, setPower] = useState<PowerPosture>(existing?.power_posture ?? 'grid+battery');
  const [status, setStatus] = useState<DeploymentStatus>(existing?.status ?? 'planning');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${projectId}/humanitarian-deployment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local_partner_name: partnerName.trim(),
          local_partner_contact: partnerContact.trim(),
          ocha_cluster: ochaCluster.trim() || null,
          donor_exit_date: donorExit || null,
          post_donor_plan: postPlan.trim() || null,
          units_planned: units,
          internet_posture: internet,
          power_posture: power,
          status,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Save failed');
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-adv-dark-2 border border-adv-gray/20 rounded max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 bg-adv-dark-2 border-b border-adv-gray/20 p-3 flex items-center justify-between">
          <div className="text-sm font-semibold">{existing ? 'Edit' : 'Create'} humanitarian deployment record</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-adv-card"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-3 space-y-2">
          <Field label="Local partner name (named entity, not 'the community')">
            <input value={partnerName} onChange={e => setPartnerName(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
          </Field>
          <Field label="Local partner contact (name + email/phone)">
            <input value={partnerContact} onChange={e => setPartnerContact(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
          </Field>
          <Field label="OCHA cluster (optional)">
            <select value={ochaCluster} onChange={e => setOchaCluster(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
              <option value="">— none —</option>
              <option value="health">health</option>
              <option value="wash">water, sanitation, hygiene</option>
              <option value="shelter">shelter</option>
              <option value="logistics">logistics</option>
              <option value="education">education</option>
              <option value="food-security">food security</option>
              <option value="protection">protection</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Units planned">
              <input type="number" min={1} value={units} onChange={e => setUnits(Number(e.target.value))} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
            </Field>
            <Field label="Status">
              <select value={status} onChange={e => setStatus(e.target.value as DeploymentStatus)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
                {(['planning','training','pilot','rollout','operating','transferred','decommissioned'] as DeploymentStatus[]).map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Internet posture">
              <select value={internet} onChange={e => setInternet(e.target.value as InternetPosture)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
                {(['none','intermittent','scheduled','always-on'] as InternetPosture[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Power posture">
              <select value={power} onChange={e => setPower(e.target.value as PowerPosture)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
                {(['grid','grid+battery','solar','generator','battery'] as PowerPosture[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Donor exit date (when external support ends)">
            <input type="date" value={donorExit} onChange={e => setDonorExit(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
          </Field>
          <Field label="Post-donor plan (what happens after exit)">
            <textarea value={postPlan} onChange={e => setPostPlan(e.target.value)} rows={3} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
          </Field>
          <button onClick={submit} disabled={submitting || !partnerName.trim() || !partnerContact.trim()} className="w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save deployment record
          </button>
        </div>
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

void useMemo;
