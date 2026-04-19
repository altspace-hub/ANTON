import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Loader2, AlertTriangle, Search, Cpu, Download,
  ShieldCheck, ChevronRight, X, Tag,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';
import SkeletonCard from '@/components/hardware/SkeletonCard';

type HardwarePath = 'diagnose' | 'maintain' | 'develop';

interface TemplateListItem {
  id: string;
  family_id: string;
  path: HardwarePath;
  recommended_tier: 1 | 2 | 3;
  title: string;
  short_description: string;
  authoritative: boolean;
  installs_count: number;
  tags: string[];
}

interface FullTemplate extends TemplateListItem {
  hkp_id: string | null;
  long_description: string | null;
  starter_system_prompt: string | null;
  recommended_gates: string[];
  signed_by: string;
  source_project_id: string | null;
}

const PATH_BADGES: Record<HardwarePath, string> = {
  develop: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  maintain: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  diagnose: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

export default function HardwareTemplatesPage() {
  const nav = useNavigate();
  const [list, setList] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [pathFilter, setPathFilter] = useState<HardwarePath | 'all'>('all');
  const [search, setSearch] = useState('');
  const [authoritativeOnly, setAuthoritativeOnly] = useState(false);

  const [selected, setSelected] = useState<FullTemplate | null>(null);
  const [instantiateOpen, setInstantiateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (familyFilter !== 'all') params.set('family_id', familyFilter);
      if (pathFilter !== 'all') params.set('path', pathFilter);
      if (authoritativeOnly) params.set('authoritative_only', 'true');
      if (search.trim()) params.set('search', search.trim());
      const res = await fetchWithAuth(`${API_BASE}/hardware/templates?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load templates');
      setList(json.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [familyFilter, pathFilter, authoritativeOnly]);

  const openTemplate = async (id: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/templates/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load template');
      setSelected(json.template);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  const downloadBundle = async (id: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/templates/${id}/bundle`);
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Bundle download failed');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `hardware-template-${id}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
  };

  const families = useMemo(() => Array.from(new Set(list.map(t => t.family_id))).sort(), [list]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
      <div className="max-w-7xl mx-auto">
        <button onClick={() => nav('/hardware')} className="text-adv-teal flex items-center gap-1 mb-3 text-sm hover:underline">
          <ArrowLeft className="w-4 h-4" />Hardware Build
        </button>

        <header className="mb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-adv-teal" />
            Hardware Templates
          </h1>
          <p className="text-sm text-adv-gray mt-1 max-w-2xl">
            Pre-populated project blueprints. Pick one as a starting point — Phase 0 classification, posture, HKP attachment, and recommended quality gates come pre-filled. Authoritative templates are ANTON-curated; community templates require review before they're marked authoritative.
          </p>
        </header>

        {error && (
          <div className="mb-3 p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-start justify-between gap-2">
            <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</span>
            <button onClick={() => setError(null)} className="hover:underline">dismiss</button>
          </div>
        )}

        {/* Filters */}
        <section className="flex flex-wrap items-center gap-2 mb-4">
          <select value={familyFilter} onChange={e => setFamilyFilter(e.target.value)} className="bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm">
            <option value="all">All families</option>
            {families.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={pathFilter} onChange={e => setPathFilter(e.target.value as typeof pathFilter)} className="bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm">
            <option value="all">All paths</option>
            <option value="develop">develop</option>
            <option value="diagnose">diagnose</option>
            <option value="maintain">maintain</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-adv-gray cursor-pointer">
            <input type="checkbox" checked={authoritativeOnly} onChange={e => setAuthoritativeOnly(e.target.checked)} />
            Authoritative only
          </label>
          <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex items-center gap-1 flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm flex-1"
            />
            <button type="submit" className="px-3 py-2 rounded bg-adv-card border border-adv-gray/30 hover:border-adv-teal/40 text-sm flex items-center gap-1">
              <Search className="w-3 h-3" />
            </button>
          </form>
        </section>

        {/* Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading ? (
            <SkeletonCard variant="grid" count={6} />
          ) : list.length === 0 ? (
            <div className="col-span-full py-12 text-center text-adv-gray">No templates match these filters.</div>
          ) : list.map(t => (
            <button
              key={t.id}
              onClick={() => openTemplate(t.id)}
              className="text-left p-4 rounded border border-adv-gray/20 bg-adv-card hover:border-adv-teal/40 transition group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-xs text-adv-gray flex items-center gap-1 mb-1">
                    <Cpu className="w-3 h-3" />{t.family_id} · tier {t.recommended_tier}
                  </div>
                  <div className="font-semibold leading-tight">{t.title}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-adv-gray group-hover:text-adv-teal transition" />
              </div>
              <p className="text-xs text-adv-gray line-clamp-3">{t.short_description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1">
                <span className={`text-xs px-2 py-0.5 rounded border ${PATH_BADGES[t.path]}`}>{t.path}</span>
                {t.authoritative ? (
                  <span className="text-xs px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />authoritative
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30">community</span>
                )}
                <span className="text-xs text-adv-gray ml-auto">{t.installs_count} install{t.installs_count === 1 ? '' : 's'}</span>
              </div>
              {t.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded border border-adv-gray/30 text-adv-gray flex items-center gap-1">
                      <Tag className="w-3 h-3" />{tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </section>

        {/* Detail drawer */}
        {selected && (
          <DetailDrawer
            template={selected}
            onClose={() => setSelected(null)}
            onInstantiate={() => setInstantiateOpen(true)}
            onDownload={() => downloadBundle(selected.id)}
          />
        )}

        {instantiateOpen && selected && (
          <InstantiateModal
            template={selected}
            onClose={() => setInstantiateOpen(false)}
            onCreated={(projectId) => {
              setInstantiateOpen(false);
              setSelected(null);
              nav(`/hardware/projects/${projectId}`);
            }}
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}

function DetailDrawer({ template, onClose, onInstantiate, onDownload }: {
  template: FullTemplate;
  onClose: () => void; onInstantiate: () => void; onDownload: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-2xl h-full bg-adv-dark-2 border-l border-adv-gray/20 overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 bg-adv-dark-2 border-b border-adv-gray/20 p-4 flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-adv-gray">{template.family_id} · {template.path} · tier {template.recommended_tier}</div>
            <h2 className="text-xl font-semibold">{template.title}</h2>
            <div className="text-xs text-adv-gray mt-1">{template.id} · signed by {template.signed_by}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-adv-card"><X className="w-5 h-5" /></button>
        </header>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={onInstantiate} className="flex-1 px-4 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark text-sm font-medium flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />New project from template
            </button>
            <button onClick={onDownload} className="px-3 py-2 rounded border border-adv-gray/30 hover:border-adv-teal/40 text-sm flex items-center gap-1">
              <Download className="w-4 h-4" />.anton bundle
            </button>
          </div>

          <section>
            <h3 className="text-xs uppercase tracking-wide text-adv-gray mb-1">Description</h3>
            <p className="text-sm">{template.short_description}</p>
            {template.long_description && (
              <p className="text-sm text-adv-gray mt-2 whitespace-pre-wrap">{template.long_description}</p>
            )}
          </section>

          {template.tags.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-adv-gray mb-1">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {template.tags.map(t => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded border border-adv-gray/30 text-adv-gray">{t}</span>
                ))}
              </div>
            </section>
          )}

          {template.recommended_gates.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-adv-gray mb-1">Recommended quality gates</h3>
              <ul className="text-xs space-y-0.5">
                {template.recommended_gates.map(g => (
                  <li key={g} className="font-mono">{g}</li>
                ))}
              </ul>
            </section>
          )}

          {template.starter_system_prompt && (
            <section>
              <h3 className="text-xs uppercase tracking-wide text-adv-gray mb-1">Starter system prompt</h3>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-adv-dark/50 p-3 rounded border border-adv-gray/20">{template.starter_system_prompt}</pre>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function InstantiateModal({ template, onClose, onCreated, onError }: {
  template: FullTemplate;
  onClose: () => void; onCreated: (projectId: string) => void;
  onError: (s: string) => void;
}) {
  const [title, setTitle] = useState(template.title);
  const [region, setRegion] = useState('');
  const [language, setLanguage] = useState('en');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/templates/${template.id}/instantiate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          region: region.trim() || null,
          working_language: language,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Instantiate failed');
      onCreated(json.project_id);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-adv-dark-2 border border-adv-gray/20 rounded max-w-md w-full" onClick={e => e.stopPropagation()}>
        <header className="border-b border-adv-gray/20 p-3 flex items-center justify-between">
          <div className="text-sm font-semibold">New project from template</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-adv-card"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-3 space-y-3">
          <div className="text-xs text-adv-gray">
            Template: <code>{template.id}</code> · family {template.family_id} · tier {template.recommended_tier}
          </div>
          <div>
            <label className="block text-xs text-adv-gray mb-1">Project title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-adv-gray mb-1">Region</label>
              <input value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g., eu, west-africa" className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Working language</label>
              <input value={language} onChange={e => setLanguage(e.target.value)} maxLength={5} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
            </div>
          </div>
          <button onClick={submit} disabled={submitting || !title.trim()} className="w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Create project
          </button>
        </div>
      </div>
    </div>
  );
}
