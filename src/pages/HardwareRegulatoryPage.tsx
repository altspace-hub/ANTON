import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Cpu, AlertTriangle, Loader2, ShieldCheck, ShieldAlert,
  FileText, RotateCcw, Sparkles, Pencil, Save, X, ScrollText, History,
  CheckCircle2, RefreshCcw,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ArtefactKind = 'cra-tech-file' | 'doc' | 'vdp' | 'hazard-analysis' | 'red-declaration' | 'mdr-classification' | 'dpa' | 'workplace-safety';
type ArtefactStatus = 'draft' | 'generated' | 'user-reviewed' | 'signed-off' | 'withdrawn';

interface ArtefactRequirement {
  kind: ArtefactKind;
  title: string;
  required_for_tier: 1 | 2 | 3;
  required_when: string;
  why: string;
}

interface RegulatoryArtefact {
  id: string;
  project_id: string;
  kind: ArtefactKind;
  title: string;
  required_for_tier: 1 | 2 | 3;
  required_when: string;
  status: ArtefactStatus;
  content_markdown: string | null;
  generator_version: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
  signoff_attestation: string | null;
  withdrawn_at: string | null;
  updated_at: string;
}

interface RequiredStatus {
  requirement: ArtefactRequirement;
  artefact: RegulatoryArtefact | null;
}

interface SignoffEntry {
  id: string;
  action: 'signed-off' | 'withdrawn' | 'edited' | 'regenerated';
  actor_id: string;
  attestation: string | null;
  reason: string | null;
  content_hash: string | null;
  occurred_at: string;
}

interface ProjectMini {
  id: string; title: string; family_id: string; path: string; tier: number;
  region: string | null; safety_critical: boolean; medical_adjacent: boolean;
}

const STATUS_STYLES: Record<ArtefactStatus, string> = {
  draft: 'bg-adv-card text-adv-gray border-adv-gray/30',
  generated: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30',
  'user-reviewed': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'signed-off': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  withdrawn: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwareRegulatoryPage() {
  const { id, kind } = useParams<{ id: string; kind?: string }>();
  const nav = useNavigate();
  const [project, setProject] = useState<ProjectMini | null>(null);
  const [list, setList] = useState<RequiredStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeArtefact, setActiveArtefact] = useState<RegulatoryArtefact | null>(null);
  const [history, setHistory] = useState<SignoffEntry[]>([]);
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [busy, setBusy] = useState<null | string>(null);
  const [signoffOpen, setSignoffOpen] = useState(false);
  const [attestation, setAttestation] = useState('');

  const loadProject = async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load project');
      setProject(json.project);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  const loadList = async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/regulatory-artefacts`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load');
      setList(json.artefacts);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setLoading(false); }
  };

  const loadActive = async (artefactId: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/regulatory-artefacts/${artefactId}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load artefact');
      setActiveArtefact(json.artefact);
      setHistory(json.history);
      setDraftContent(json.artefact.content_markdown ?? '');
      setEditing(false);
      setSignoffOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  useEffect(() => { loadProject(); loadList(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  // Auto-open the kind from URL if provided
  useEffect(() => {
    if (kind && list.length > 0) {
      const item = list.find(l => l.requirement.kind === kind);
      if (item?.artefact) loadActive(item.artefact.id);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [kind, list]);

  const generate = async (k: ArtefactKind) => {
    if (!id) return;
    setBusy(`generate-${k}`);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}/regulatory-artefacts`, {
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
    if (!activeArtefact) return;
    setBusy('save');
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/regulatory-artefacts/${activeArtefact.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_markdown: draftContent }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Save failed');
      await loadActive(activeArtefact.id);
      await loadList();
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const signOff = async () => {
    if (!activeArtefact) return;
    setBusy('signoff');
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/regulatory-artefacts/${activeArtefact.id}/signoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Sign-off failed');
      await loadActive(activeArtefact.id);
      await loadList();
      setSignoffOpen(false);
      setAttestation('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const withdraw = async () => {
    if (!activeArtefact) return;
    if (!confirm('Withdraw sign-off? The historical sign-off is retained in the audit trail.')) return;
    setBusy('withdraw');
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/regulatory-artefacts/${activeArtefact.id}/withdraw`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Operator-initiated withdrawal' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Withdraw failed');
      await loadActive(activeArtefact.id);
      await loadList();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const summary = useMemo(() => {
    const total = list.length;
    let signed = 0, reviewed = 0, generated = 0, missing = 0;
    for (const item of list) {
      if (!item.artefact) { missing++; continue; }
      switch (item.artefact.status) {
        case 'signed-off': signed++; break;
        case 'user-reviewed': reviewed++; break;
        case 'generated': case 'draft': generated++; break;
        case 'withdrawn': missing++; break;
      }
    }
    const ready = total > 0 && signed === total;
    return { total, signed, reviewed, generated, missing, ready };
  }, [list]);

  if (!project) {
    return (
      <div className="min-h-screen bg-adv-dark text-adv-off-white flex items-center justify-center">
        {error
          ? <div className="text-red-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>
          : <Loader2 className="w-6 h-6 animate-spin text-adv-teal" />}
      </div>
    );
  }

  if (project.tier < 2) {
    return (
      <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
        <button onClick={() => nav(`/hardware/projects/${project.id}`)} className="text-adv-teal flex items-center gap-1 mb-3 text-sm hover:underline">
          <ArrowLeft className="w-4 h-4" />Back to project
        </button>
        <div className="max-w-2xl text-sm text-adv-gray">
          Tier 1 personal-tinkering projects do not produce regulatory artefacts. To generate any artefact, raise the project tier to 2 (professional internal use) or 3 (placed on market) — but only if anyone outside your bench will actually receive the device.
        </div>
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
            <ScrollText className="w-6 h-6 text-adv-teal" />
            Regulatory pack — {project.title}
          </h1>
          <div className="text-xs text-adv-gray flex items-center gap-2 flex-wrap">
            <span>Tier {project.tier}</span>
            <span>family: {project.family_id}</span>
            <span>region: {project.region ?? '—'}</span>
            {project.safety_critical && <span className="text-red-400">safety-critical</span>}
            {project.medical_adjacent && <span className="text-pink-400">medical-adjacent</span>}
          </div>
        </header>

        {/* Pack-wide summary */}
        <div className={`p-3 rounded border mb-4 ${summary.ready ? 'border-emerald-500/30 bg-emerald-500/5' : summary.missing > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {summary.ready ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <ShieldAlert className="w-5 h-5 text-amber-400" />}
              <div>
                <div className="text-sm font-medium">
                  {summary.ready
                    ? 'Pack complete — all required artefacts signed off.'
                    : `${summary.signed}/${summary.total} required artefacts signed off`}
                </div>
                <div className="text-xs text-adv-gray">
                  {summary.missing > 0 && `${summary.missing} missing · `}
                  {summary.generated > 0 && `${summary.generated} generated awaiting review · `}
                  {summary.reviewed > 0 && `${summary.reviewed} reviewed but not signed`}
                </div>
              </div>
            </div>
            <div className="text-xs text-adv-gray text-right max-w-md">
              ANTON does <strong>not</strong> certify any artefact. The user is the responsible economic operator under the applicable law and must obtain independent legal review before sign-off.
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-start justify-between gap-2">
            <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</span>
            <button onClick={() => setError(null)} className="hover:underline">dismiss</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Required-artefact list */}
          <aside className="lg:col-span-1 space-y-2">
            {loading ? (
              <div className="text-center text-adv-gray py-6"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
            ) : list.map(item => (
              <ArtefactCard
                key={item.requirement.kind}
                item={item}
                isActive={activeArtefact?.kind === item.requirement.kind}
                busy={busy}
                onGenerate={() => generate(item.requirement.kind)}
                onOpen={() => item.artefact && loadActive(item.artefact.id)}
              />
            ))}
          </aside>

          {/* Active artefact editor */}
          <main className="lg:col-span-2">
            {!activeArtefact ? (
              <div className="p-6 rounded border border-dashed border-adv-gray/30 text-center text-sm text-adv-gray">
                <FileText className="w-10 h-10 mx-auto mb-2 text-adv-gray" />
                Select an artefact from the list, or click Generate to create the skeleton from your project context.
              </div>
            ) : (
              <section className="border border-adv-gray/20 rounded">
                <header className="border-b border-adv-gray/20 p-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-adv-gray uppercase tracking-wide">{activeArtefact.kind}</div>
                    <h2 className="text-base font-semibold">{activeArtefact.title}</h2>
                    <div className="text-xs text-adv-gray flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded border ${STATUS_STYLES[activeArtefact.status]}`}>{activeArtefact.status}</span>
                      <span>generator v{activeArtefact.generator_version}</span>
                      {activeArtefact.signed_off_at && (
                        <span>signed {new Date(activeArtefact.signed_off_at).toLocaleDateString()} by {activeArtefact.signed_off_by}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!editing && activeArtefact.status !== 'signed-off' && (
                      <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 flex items-center gap-1">
                        <Pencil className="w-3 h-3" />Edit
                      </button>
                    )}
                    {!editing && (
                      <button
                        onClick={() => generate(activeArtefact.kind)}
                        disabled={busy === `generate-${activeArtefact.kind}`}
                        className="text-xs px-2 py-1 rounded border border-adv-gray/30 hover:border-adv-teal/40 flex items-center gap-1 disabled:opacity-50"
                      >
                        {busy === `generate-${activeArtefact.kind}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                        Regenerate
                      </button>
                    )}
                    {!editing && activeArtefact.status !== 'signed-off' && activeArtefact.content_markdown && (
                      <button onClick={() => setSignoffOpen(true)} className="text-xs px-2 py-1 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />Sign off
                      </button>
                    )}
                    {!editing && activeArtefact.status === 'signed-off' && (
                      <button onClick={withdraw} disabled={busy === 'withdraw'} className="text-xs px-2 py-1 rounded border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 flex items-center gap-1 disabled:opacity-50">
                        <RotateCcw className="w-3 h-3" />Withdraw
                      </button>
                    )}
                  </div>
                </header>

                <div className="p-3 space-y-2">
                  {editing ? (
                    <>
                      <textarea
                        value={draftContent}
                        onChange={e => setDraftContent(e.target.value)}
                        rows={28}
                        className="w-full bg-adv-dark border border-adv-gray/30 rounded p-2 font-mono text-xs leading-snug"
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={saveContent} disabled={busy === 'save' || draftContent.length < 50} className="text-xs px-3 py-1.5 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark flex items-center gap-1 disabled:opacity-50">
                          {busy === 'save' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
                        </button>
                        <button onClick={() => { setEditing(false); setDraftContent(activeArtefact.content_markdown ?? ''); }} className="text-xs px-3 py-1.5 rounded border border-adv-gray/30 hover:border-adv-teal/40">Cancel</button>
                      </div>
                    </>
                  ) : activeArtefact.content_markdown ? (
                    <pre className="text-xs leading-snug whitespace-pre-wrap font-mono bg-adv-dark/50 p-3 rounded border border-adv-gray/20 max-h-[600px] overflow-y-auto">{activeArtefact.content_markdown}</pre>
                  ) : (
                    <div className="text-sm text-adv-gray text-center py-6">No content yet — click Generate to create the skeleton.</div>
                  )}

                  {signoffOpen && (
                    <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 space-y-2">
                      <div className="text-xs text-amber-200">
                        Sign-off is your explicit attestation that you, as the responsible economic operator, accept responsibility for this content. Independent legal review is strongly advised before signing.
                      </div>
                      <textarea
                        value={attestation}
                        onChange={e => setAttestation(e.target.value)}
                        rows={3}
                        placeholder="e.g., I, [your name], on behalf of [legal entity], accept responsibility for this Declaration of Conformity dated [date] for project [project title]."
                        className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={signOff} disabled={busy === 'signoff' || attestation.trim().length < 30} className="text-xs px-3 py-1.5 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark flex items-center gap-1 disabled:opacity-50">
                          {busy === 'signoff' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}Sign off
                        </button>
                        <button onClick={() => { setSignoffOpen(false); setAttestation(''); }} className="text-xs px-3 py-1.5 rounded border border-adv-gray/30 hover:border-adv-teal/40">Cancel</button>
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
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ArtefactCard({ item, isActive, busy, onGenerate, onOpen }: {
  item: RequiredStatus; isActive: boolean; busy: string | null;
  onGenerate: () => void; onOpen: () => void;
}) {
  const has = !!item.artefact;
  const status = item.artefact?.status;
  const isSigned = status === 'signed-off';
  return (
    <div
      onClick={has ? onOpen : undefined}
      className={`p-3 rounded border ${isActive ? 'border-adv-teal bg-adv-teal/5' : 'border-adv-gray/20 bg-adv-card'} ${has ? 'cursor-pointer hover:border-adv-teal/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <div className="text-xs text-adv-gray uppercase tracking-wide">{item.requirement.kind}</div>
          <div className="font-medium text-sm">{item.requirement.title}</div>
        </div>
        {isSigned ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : has ? <ShieldAlert className="w-4 h-4 text-amber-400" /> : <X className="w-4 h-4 text-red-400" />}
      </div>
      <p className="text-xs text-adv-gray">{item.requirement.why}</p>
      <div className="mt-2 flex items-center justify-between">
        {status ? (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[status]}`}>{status}</span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30">missing</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onGenerate(); }}
          disabled={busy === `generate-${item.requirement.kind}`}
          className="text-[10px] px-1.5 py-0.5 rounded border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 flex items-center gap-1 disabled:opacity-50"
        >
          {busy === `generate-${item.requirement.kind}` ? <Loader2 className="w-3 h-3 animate-spin" /> : has ? <RefreshCcw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          {has ? 'regenerate' : 'generate'}
        </button>
      </div>
    </div>
  );
}

// keep these icons imported even if not all branches are visible at first render
void Cpu;
