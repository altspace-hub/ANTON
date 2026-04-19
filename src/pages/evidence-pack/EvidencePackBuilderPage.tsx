/**
 * EvidencePackBuilderPage — /evidence-packs/new
 *
 * Three-step wizard per spec §8.2:
 *   1. Define scope (session or project — Phase 1 supports those two)
 *   2. Review and configure (title, purpose, frameworks, retention, notes)
 *   3. Run collector + finalise
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, ChevronLeft, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface SessionRow { id: string; title: string; module_id: string; created_at: string }
interface ProjectRow { id: string; name: string; description: string | null }

type ScopeChoice =
  | { type: 'session'; sessionId: string }
  | { type: 'project'; projectId: string };

const FRAMEWORKS = ['eu_ai_act', 'amlr', 'gdpr', 'dora', 'mifid_ii', 'mica'] as const;

export default function EvidencePackBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Scope
  const [scopeType, setScopeType] = useState<'session' | 'project'>(
    (searchParams.get('scopeType') as 'session' | 'project') ?? 'session',
  );
  const [scope, setScope] = useState<ScopeChoice | null>(() => {
    const sid = searchParams.get('sessionId');
    const pid = searchParams.get('projectId');
    if (sid) return { type: 'session', sessionId: sid };
    if (pid) return { type: 'project', projectId: pid };
    return null;
  });

  // Configure
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [frameworks, setFrameworks] = useState<string[]>(['eu_ai_act', 'amlr']);
  const [retentionDays, setRetentionDays] = useState<number>(183); // ~6 months
  const [notes, setNotes] = useState('');

  // Run state
  const [packId, setPackId] = useState<string | null>(null);
  const [collectInfo, setCollectInfo] = useState<{ itemCount: number; itemsByType: Record<string, number>; manifestHash: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Lookups for the scope picker
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  useEffect(() => {
    void fetchWithAuth('/api/sessions?limit=100').then(async (r) => {
      if (r.ok) {
        const j = await r.json();
        setSessions(j.sessions ?? j ?? []);
      }
    });
    void fetchWithAuth('/api/projects').then(async (r) => {
      if (r.ok) {
        const j = await r.json();
        setProjects(j.projects ?? j ?? []);
      }
    });
  }, []);

  function toggleFramework(f: string) {
    setFrameworks(frameworks.includes(f) ? frameworks.filter(x => x !== f) : [...frameworks, f]);
  }

  function canAdvance(): boolean {
    if (step === 1) return scope !== null;
    if (step === 2) return title.trim().length > 0 && frameworks.length > 0;
    return true;
  }

  async function createPackAndCollect() {
    if (!scope) return;
    setBusy(true); setError(null);
    try {
      const createRes = await fetchWithAuth('/api/evidence-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          purpose: purpose.trim() || undefined,
          scope,
          complianceFrameworks: frameworks,
          retentionDays,
          notes: notes.trim() || undefined,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error ?? `Create failed (${createRes.status})`);
      const newId = createJson.pack.id as string;
      setPackId(newId);

      const collectRes = await fetchWithAuth(`/api/evidence-pack/${newId}/collect`, { method: 'POST' });
      const collectJson = await collectRes.json();
      if (!collectRes.ok) throw new Error(collectJson.error ?? `Collect failed (${collectRes.status})`);
      setCollectInfo({
        itemCount: collectJson.itemCount,
        itemsByType: collectJson.itemsByType,
        manifestHash: collectJson.manifestHash,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function finalise() {
    if (!packId) return;
    setBusy(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/evidence-pack/${packId}/finalise`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Finalise failed (${res.status})`);
      setDone(true);
      setTimeout(() => navigate(`/evidence-packs/${packId}`), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => navigate('/evidence-packs')}
          className="inline-flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal"
        >
          <ChevronLeft className="h-4 w-4" /> All packs
        </button>

        <header className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-adv-teal/10">
            <ShieldCheck className="h-7 w-7 text-adv-teal" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Build an Evidence Pack</h1>
            <p className="text-sm text-adv-gray mt-1">Three steps. Pick the scope, fill in metadata, finalise.</p>
          </div>
        </header>

        {/* Stepper */}
        <ol className="flex items-center gap-2 text-xs">
          {([1, 2, 3] as const).map((n) => (
            <li key={n} className={`flex items-center gap-2 ${step === n ? 'text-adv-teal' : 'text-adv-gray'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center font-medium ${
                step === n ? 'bg-adv-teal text-adv-dark' : step > n ? 'bg-adv-green/20 text-adv-green' : 'bg-adv-card'
              }`}>{step > n ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}</span>
              <span>{['Scope', 'Configure', 'Finalise'][n - 1]}</span>
              {n < 3 && <span className="mx-2 text-adv-gray">·</span>}
            </li>
          ))}
        </ol>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* Step 1 — Scope */}
        {step === 1 && (
          <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            <div>
              <h2 className="text-base font-medium mb-2">What's in scope?</h2>
              <div className="flex gap-2">
                {(['session', 'project'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setScopeType(t); setScope(null); }}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                      scopeType === t
                        ? 'border-adv-teal text-adv-teal bg-adv-teal/10'
                        : 'border-border text-adv-gray hover:text-adv-off-white'
                    }`}
                  >{t === 'session' ? 'A single session' : 'A whole project'}</button>
                ))}
              </div>
              <p className="text-xs text-adv-gray mt-2">
                Phase 1 supports session + project. Mission, workflow_run, canvas, and date-range scopes ship in Phase 2/3.
              </p>
            </div>

            {scopeType === 'session' ? (
              <SessionPicker
                sessions={sessions}
                selectedId={scope?.type === 'session' ? scope.sessionId : null}
                onSelect={(sessionId) => setScope({ type: 'session', sessionId })}
              />
            ) : (
              <ProjectPicker
                projects={projects}
                selectedId={scope?.type === 'project' ? scope.projectId : null}
                onSelect={(projectId) => setScope({ type: 'project', projectId })}
              />
            )}
          </div>
        )}

        {/* Step 2 — Configure */}
        {step === 2 && (
          <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            <Field label="Title" value={title} onChange={setTitle} placeholder="AMLR gap analysis — Nordea Q2 2026" />
            <Field label="Purpose (free text)" value={purpose} onChange={setPurpose} multiline placeholder="Why does this pack exist? Who's the audience?" />
            <div>
              <span className="block text-xs font-medium mb-1">Compliance frameworks</span>
              <div className="flex flex-wrap gap-2">
                {FRAMEWORKS.map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleFramework(f)}
                    className={`px-3 py-1 rounded-lg text-xs border transition ${
                      frameworks.includes(f)
                        ? 'border-adv-teal text-adv-teal bg-adv-teal/10'
                        : 'border-border text-adv-gray hover:text-adv-off-white'
                    }`}
                  >{f}</button>
                ))}
              </div>
            </div>
            <Field
              label="Retention (days)"
              value={String(retentionDays)}
              onChange={(v) => setRetentionDays(Math.max(1, Number(v) || 0))}
              type="number"
            />
            <p className="text-xs text-adv-gray -mt-2">EU AI Act Art 26 minimum: 183 days (~6 months). Banking AML often needs 7–10 years.</p>
            <Field label="Notes (optional)" value={notes} onChange={setNotes} multiline placeholder="Anything reviewers should know on opening this pack." />
          </div>
        )}

        {/* Step 3 — Finalise */}
        {step === 3 && (
          <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            {!collectInfo && (
              <div>
                <h2 className="text-base font-medium mb-2">Run the collector</h2>
                <p className="text-sm text-adv-gray mb-3">
                  Walks the scope, collects every related artefact (sessions, messages with thinking,
                  audit entries, output versions), and writes the manifest with deterministic hashes.
                </p>
                <button
                  onClick={createPackAndCollect}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition disabled:opacity-50 flex items-center gap-2"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {busy ? 'Collecting…' : 'Run collector'}
                </button>
              </div>
            )}
            {collectInfo && !done && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-adv-green text-sm">
                  <CheckCircle2 className="h-4 w-4" /> Collected {collectInfo.itemCount} items
                </div>
                <div className="rounded-lg bg-adv-dark p-3 text-xs space-y-1">
                  {Object.entries(collectInfo.itemsByType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                    <div key={t} className="flex items-center justify-between">
                      <span className="text-adv-gray">{t}</span>
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-adv-gray">
                  Manifest hash: <code className="text-adv-off-white break-all">{collectInfo.manifestHash}</code>
                </div>
                <button
                  onClick={finalise}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition disabled:opacity-50 flex items-center gap-2"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Finalise (lock contents)
                </button>
                <p className="text-xs text-adv-gray">
                  Once finalised, contents are immutable. Phase 2 will add Ed25519 signing here.
                </p>
              </div>
            )}
            {done && (
              <div className="flex items-center gap-2 text-adv-green text-sm">
                <CheckCircle2 className="h-4 w-4" /> Pack finalised — opening viewer…
              </div>
            )}
          </div>
        )}

        {/* Step controls */}
        {step < 3 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
              disabled={step === 1}
              className="px-3 py-2 rounded-lg border border-border text-sm hover:border-adv-gray disabled:opacity-30"
            >Back</button>
            <button
              onClick={() => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}
              disabled={!canAdvance()}
              className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 flex items-center gap-2"
            >Next <ArrowRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionPicker({ sessions, selectedId, onSelect }: { sessions: SessionRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('');
  const filtered = sessions.filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase()) || s.module_id.includes(q));
  return (
    <div className="space-y-2">
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Filter sessions…"
        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
      />
      <ul className="max-h-60 overflow-y-auto rounded-lg border border-border bg-adv-dark divide-y divide-border/40">
        {filtered.length === 0 && <li className="p-3 text-xs text-adv-gray">No sessions match.</li>}
        {filtered.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onSelect(s.id)}
              className={`w-full text-left p-3 text-sm hover:bg-adv-card transition ${
                selectedId === s.id ? 'bg-adv-teal/10 text-adv-teal' : ''
              }`}
            >
              <div className="font-medium truncate">{s.title}</div>
              <div className="text-xs text-adv-gray">{s.module_id} · {new Date(s.created_at).toLocaleDateString()}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectPicker({ projects, selectedId, onSelect }: { projects: ProjectRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (projects.length === 0) {
    return <p className="text-sm text-adv-gray">No projects yet. Create one in the Projects area first.</p>;
  }
  return (
    <ul className="max-h-60 overflow-y-auto rounded-lg border border-border bg-adv-dark divide-y divide-border/40">
      {projects.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => onSelect(p.id)}
            className={`w-full text-left p-3 text-sm hover:bg-adv-card transition ${
              selectedId === p.id ? 'bg-adv-teal/10 text-adv-teal' : ''
            }`}
          >
            <div className="font-medium">{p.name}</div>
            {p.description && <div className="text-xs text-adv-gray">{p.description}</div>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, value, onChange, multiline, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1">{label}</span>
      {multiline
        ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full h-20 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none" />
        : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none" />}
    </label>
  );
}
