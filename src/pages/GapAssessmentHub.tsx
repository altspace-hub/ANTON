/**
 * GapAssessmentHub.tsx
 * Landing page for the Compliance Gap Assessor.
 * Shows available frameworks and recent assessments.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardCheck, Plus, ChevronRight, FileSearch, Shield,
  Lock, Globe, CheckSquare, RefreshCw, BarChart3,
  Wand2, Loader2, Sparkles, ExternalLink, FileUp, Trash2,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

interface Framework {
  id: string;
  name: string;
  shortName: string;
  reference: string;
  applicationDate: string;
  articleCount: number;
  themes: string[];
}

interface Assessment {
  id: string;
  title: string;
  frameworks: string;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:        { label: 'Draft',        color: 'text-adv-gray' },
  assessing:    { label: 'Assessing',    color: 'text-adv-gold' },
  scoring:      { label: 'Scoring',      color: 'text-adv-blue' },
  synthesising: { label: 'Synthesising', color: 'text-adv-teal' },
  complete:     { label: 'Complete',     color: 'text-adv-green' },
  paused:       { label: 'Paused',       color: 'text-adv-gray' },
};

const STEP_LABELS = [
  '', 'Framework Selection', 'Scope', 'Context', 'Assessment',
  'Article Scoring', 'Capability View', 'Board Summary', 'Roadmap',
];

const FRAMEWORK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'amlr-2024': Shield,
  'dora-2022': Lock,
  'iso27001-2022': CheckSquare,
  'wolfsberg-cbddq': Globe,
  'gdpr-2016': Lock,
  'eu-ai-act-2024': Sparkles,
  'fatf-40': Globe,
  'mica-2023': Globe,
  'amld6-2024': Shield,
  'mifid2-2014': BarChart3,
  'solvency2-2009': Shield,
  'pci-dss-4': Lock,
  'soc2-tsc': CheckSquare,
  'csrd-esrs': Globe,
  'iso42001-2023': Sparkles,
  'iso22301-2019': RefreshCw,
};

// Knowledge packs that complement each framework — shown as a suggestion when framework is selected
const FRAMEWORK_PACK_SUGGESTIONS: Record<string, Array<{ id: string; label: string }>> = {
  'amlr-2024':       [{ id: 'amlr-2024', label: 'AMLR 2024' }, { id: 'amla-amld6', label: 'AMLA / AMLD6' }, { id: 'eba-aml-guidelines', label: 'EBA AML Guidelines' }],
  'dora-2022':       [{ id: 'dora-nis2', label: 'DORA / NIS2' }],
  'iso27001-2022':   [],
  'iso37001-2016':   [{ id: 'abc-anti-bribery', label: 'ABC Pack' }],
  'wolfsberg-cbddq': [{ id: 'wolfsberg-principles', label: 'Wolfsberg Principles' }],
  'nist-csf-2':      [],
  'gdpr-2016':       [],
  'eu-ai-act-2024':  [],
  'fatf-40':         [{ id: 'amlr-2024', label: 'AMLR 2024' }],
  'amld6-2024':      [{ id: 'amla-amld6', label: 'AMLA / AMLD6' }],
  'mica-2023':       [],
  'mifid2-2014':     [],
  'solvency2-2009':  [],
  'pci-dss-4':       [],
  'soc2-tsc':        [],
  'csrd-esrs':       [],
  'iso42001-2023':   [],
  'iso22301-2019':   [],
};

export default function GapAssessmentHub() {
  const navigate = useNavigate();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState('');
  // Custom framework wizard state
  const [buildingCustom, setBuildingCustom] = useState(false);
  const [customForm, setCustomForm] = useState({ name: '', description: '', regulationUrl: '', articleHints: '' });
  const [customDocText, setCustomDocText] = useState('');
  const [customGenerating, setCustomGenerating] = useState(false);
  const [customStreamText, setCustomStreamText] = useState('');
  const [customResult, setCustomResult] = useState<{ id: string; name: string; shortName: string; articleCount: number } | null>(null);
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fwRes, assRes] = await Promise.all([
        fetch('/api/gap-assessments/frameworks', { headers: getAuthHeader() }),
        fetch('/api/gap-assessments', { headers: getAuthHeader() }),
      ]);
      if (fwRes.ok) setFrameworks(await fwRes.json().then(d => d.frameworks));
      if (assRes.ok) setAssessments(await assRes.json().then(d => d.assessments));
    } catch { /* ignore */ }
    setLoading(false);
  };

  const toggleFramework = (id: string) => {
    setSelectedFrameworks(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const createAssessment = async () => {
    if (selectedFrameworks.length === 0 || !newTitle.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/gap-assessments', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, frameworks: selectedFrameworks }),
      });
      if (!r.ok) { setSubmitting(false); return; }
      const { assessment } = await r.json();
      navigate(`/gap-assessment/${assessment.id}`);
    } catch { setSubmitting(false); }
  };

  async function generateCustomFramework() {
    if (!customForm.description.trim() || customGenerating) return;
    setCustomGenerating(true);
    setCustomStreamText('');
    setCustomError('');
    setCustomResult(null);

    try {
      const res = await fetchWithAuth('/api/gap-assessments/frameworks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customForm.name.trim() || undefined,
          description: customForm.description.trim(),
          regulationUrl: customForm.regulationUrl.trim() || undefined,
          documentText: customDocText.trim() || undefined,
          articleHints: customForm.articleHints.trim() || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Failed to generate' }));
        setCustomError((err as { error?: string }).error ?? 'Generation failed');
        setCustomGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw) as { type: string; text?: string; framework?: { id: string; name: string; shortName: string; articleCount: number }; error?: string; message?: string };
            if (parsed.type === 'text' && parsed.text) {
              accumulated += parsed.text;
              setCustomStreamText(accumulated);
            } else if (parsed.type === 'done' && parsed.framework) {
              setCustomResult(parsed.framework);
              // Refresh framework list
              await loadData();
            } else if (parsed.type === 'error') {
              setCustomError(parsed.error ?? 'Generation failed');
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setCustomError('Failed to connect. Please try again.');
      console.error('[custom-framework]', err);
    } finally {
      setCustomGenerating(false);
    }
  }

  function handleDocumentPaste(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    if (text.length > 50000) {
      setCustomDocText(text.slice(0, 50000));
    } else {
      setCustomDocText(text);
    }
  }

  return (
    <div className="flex flex-col h-full bg-adv-dark overflow-auto">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
              <ClipboardCheck className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">Compliance Gap Assessor</h1>
              <p className="text-xs text-adv-gray">Wizard-driven, framework-by-framework structured assessment</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setBuildingCustom(!buildingCustom); setCreating(false); }}
              className="flex items-center gap-2 rounded-lg border border-adv-teal/40 bg-transparent px-4 py-2 text-sm font-medium text-adv-teal hover:bg-adv-teal-dim transition-colors"
            >
              <Wand2 className="h-4 w-4" />
              Build Custom
            </button>
            <button
              onClick={() => { setCreating(!creating); setBuildingCustom(false); }}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Assessment
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-8">
        {/* New assessment panel */}
        {creating && (
          <div className="rounded-xl border border-adv-teal/40 bg-adv-card p-5">
            <h2 className="mb-1 text-sm font-semibold text-adv-off-white">New Gap Assessment</h2>
            <p className="mb-5 text-xs text-adv-gray">Select one or more frameworks to assess. You'll define scope and context in the next steps.</p>

            <div className="mb-5">
              <label className="mb-2 block text-xs font-medium text-adv-gray">Assessment title</label>
              <input
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                placeholder="e.g. Nordea — AMLR Gap Assessment 2027"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value.slice(0, 200))}
                maxLength={200}
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="mb-3 block text-xs font-medium text-adv-gray">Select frameworks</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {frameworks.map(fw => {
                  const Icon = FRAMEWORK_ICONS[fw.id] || FileSearch;
                  const selected = selectedFrameworks.includes(fw.id);
                  return (
                    <button
                      key={fw.id}
                      onClick={() => toggleFramework(fw.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${selected ? 'border-adv-teal bg-adv-teal-dim' : 'border-border bg-adv-dark-2 hover:border-adv-teal/30'}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-4 w-4 ${selected ? 'text-adv-teal' : 'text-adv-gray'}`} />
                        <span className={`text-sm font-semibold ${selected ? 'text-adv-teal' : 'text-adv-off-white'}`}>{fw.shortName}</span>
                        {selected && <CheckSquare className="ml-auto h-4 w-4 text-adv-teal" />}
                      </div>
                      <p className="text-xs text-adv-gray mb-1 line-clamp-1">{fw.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-adv-gray">
                        <span>{fw.articleCount} articles/controls</span>
                        <span>·</span>
                        <span>{fw.themes.length} themes</span>
                      </div>
                    </button>
                  );
                })}
                {frameworks.length === 0 && !loading && (
                  <div className="col-span-3 py-8 text-center text-sm text-adv-gray">
                    No frameworks found. Framework data files may be missing from <code className="text-adv-teal">data/frameworks/</code>
                  </div>
                )}
              </div>
            </div>

            {/* Knowledge pack suggestions */}
            {selectedFrameworks.length > 0 && (() => {
              const suggestions = selectedFrameworks
                .flatMap(fwId => FRAMEWORK_PACK_SUGGESTIONS[fwId] ?? [])
                .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
              if (suggestions.length === 0) return null;
              return (
                <div className="rounded-lg border border-adv-teal/20 bg-adv-teal-soft px-4 py-3">
                  <p className="text-xs font-medium text-adv-teal mb-1.5">Recommended knowledge packs for this assessment:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map(p => (
                      <span key={p.id} className="rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2.5 py-0.5 text-[11px] text-adv-teal">{p.label}</span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-adv-gray">Activate these in <a href="/knowledge-base" className="text-adv-teal hover:underline">Knowledge Base → Regulatory Packs</a> to enrich Claude's assessment with structured regulatory entity data.</p>
                </div>
              );
            })()}

            <div className="flex gap-2">
              <button
                onClick={createAssessment}
                disabled={selectedFrameworks.length === 0 || !newTitle.trim() || submitting}
                className="rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Creating…' : <>Start Assessment <ChevronRight className="inline h-4 w-4 ml-1" /></>}
              </button>
              <button onClick={() => setCreating(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Build Custom Framework wizard */}
        {buildingCustom && (
          <div className="rounded-xl border border-adv-teal/40 bg-adv-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-adv-teal" />
              <div>
                <h2 className="text-sm font-semibold text-adv-off-white">Build Custom Framework</h2>
                <p className="text-xs text-adv-gray">Describe what you want to assess against, and AI will generate the article structure for scoring.</p>
              </div>
            </div>

            {customResult ? (
              /* Success state */
              <div className="rounded-lg border border-adv-green/30 bg-adv-green/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckSquare className="h-5 w-5 text-adv-green" />
                  <span className="text-sm font-semibold text-adv-green">Framework created successfully!</span>
                </div>
                <p className="text-sm text-adv-off-white mb-1">
                  <strong>{customResult.name}</strong> ({customResult.shortName})
                </p>
                <p className="text-xs text-adv-gray mb-4">{customResult.articleCount} articles/controls generated. Ready to use in assessments.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setBuildingCustom(false); setCreating(true); setSelectedFrameworks([customResult.id]); setCustomResult(null); setCustomForm({ name: '', description: '', regulationUrl: '', articleHints: '' }); setCustomDocText(''); setCustomStreamText(''); }}
                    className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
                  >
                    Start Assessment with this Framework
                  </button>
                  <button
                    onClick={() => { setCustomResult(null); setCustomForm({ name: '', description: '', regulationUrl: '', articleHints: '' }); setCustomDocText(''); setCustomStreamText(''); }}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white"
                  >
                    Build Another
                  </button>
                </div>
              </div>
            ) : (
              /* Form / generating state */
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-adv-gray">Framework name (optional)</label>
                    <input
                      type="text"
                      value={customForm.name}
                      onChange={e => setCustomForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. MiCA Compliance, Internal AML Policy v3"
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none"
                      disabled={customGenerating}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-adv-gray">Regulation URL (optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={customForm.regulationUrl}
                        onChange={e => setCustomForm(f => ({ ...f, regulationUrl: e.target.value }))}
                        placeholder="https://eur-lex.europa.eu/eli/reg/..."
                        className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none"
                        disabled={customGenerating}
                      />
                      {customForm.regulationUrl && (
                        <a href={customForm.regulationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center px-2 text-adv-gray hover:text-adv-teal">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-adv-gray">
                    What do you want to assess against? <span className="text-adv-red">*</span>
                  </label>
                  <textarea
                    value={customForm.description}
                    onChange={e => setCustomForm(f => ({ ...f, description: e.target.value.slice(0, 5000) }))}
                    placeholder={"Describe the regulation, standard, or internal policy you want to create a gap assessment for.\n\nExamples:\n• \"GDPR — I need to assess our data processing activities against all key GDPR requirements\"\n• \"Our internal AML policy — assess whether it covers all FATF recommendations\"\n• \"Swedish Gambling Authority's AML requirements for licensed operators\""}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none resize-none"
                    disabled={customGenerating}
                  />
                  <p className="mt-1 text-right text-[10px] text-adv-gray">{customForm.description.length}/5000</p>
                </div>

                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-adv-gray hover:text-adv-teal transition-colors">
                    Advanced: paste regulation text or add hints ▸
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-adv-gray">
                        <FileUp className="inline h-3 w-3 mr-1" />
                        Paste regulation/document text (AI extracts articles from this)
                      </label>
                      <textarea
                        value={customDocText}
                        onChange={handleDocumentPaste}
                        placeholder="Paste the full text of the regulation, standard, or policy document here. AI will extract the actual articles/requirements from it."
                        rows={5}
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none resize-none font-mono"
                        disabled={customGenerating}
                      />
                      <p className="mt-1 text-right text-[10px] text-adv-gray">{customDocText.length}/50000</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-adv-gray">Specific articles or topics to include</label>
                      <input
                        type="text"
                        value={customForm.articleHints}
                        onChange={e => setCustomForm(f => ({ ...f, articleHints: e.target.value }))}
                        placeholder="e.g. Focus on Chapter III (Customer Due Diligence) and Chapter V (Reporting)"
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none"
                        disabled={customGenerating}
                      />
                    </div>
                  </div>
                </details>

                {customError && (
                  <div className="rounded-lg border border-adv-red/30 bg-adv-red/5 px-4 py-2 text-xs text-adv-red">
                    {customError}
                  </div>
                )}

                {customGenerating && (
                  <div className="rounded-lg border border-adv-teal/20 bg-adv-dark-2 p-3">
                    <div className="flex items-center gap-2 mb-2 text-xs text-adv-teal">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Generating framework structure...</span>
                    </div>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-adv-gray/60 font-mono">
                      {customStreamText.slice(-1000) || 'Starting...'}
                    </pre>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={generateCustomFramework}
                    disabled={!customForm.description.trim() || customGenerating}
                    className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
                  >
                    {customGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    {customGenerating ? 'Generating...' : 'Generate Framework'}
                  </button>
                  <button
                    onClick={() => setBuildingCustom(false)}
                    disabled={customGenerating}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Available frameworks */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-adv-off-white">Supported Frameworks</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 rounded-xl border border-border bg-adv-card animate-pulse" />
              ))
            ) : frameworks.map(fw => {
              const Icon = FRAMEWORK_ICONS[fw.id] || FileSearch;
              return (
                <div key={fw.id} className="rounded-xl border border-border bg-adv-card p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-adv-teal" />
                    <span className="text-sm font-semibold text-adv-off-white">{fw.shortName}</span>
                  </div>
                  <p className="mb-1 text-xs text-adv-gray line-clamp-2">{fw.name}</p>
                  <p className="text-[11px] text-adv-gray">{fw.reference}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {fw.themes.slice(0, 3).map(t => (
                      <span key={t} className="rounded-full bg-adv-dark px-2 py-0.5 text-xs text-adv-gray">{t}</span>
                    ))}
                    {fw.themes.length > 3 && (
                      <span className="rounded-full bg-adv-dark px-2 py-0.5 text-xs text-adv-gray">+{fw.themes.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent assessments */}
        {assessments.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-adv-off-white">Recent Assessments</h2>
              <button onClick={loadData} className="text-adv-gray hover:text-adv-teal transition-colors" title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {assessments.map(a => {
                const statusInfo = STATUS_LABELS[a.status] || { label: a.status, color: 'text-adv-gray' };
                const fwIds = JSON.parse(a.frameworks || '[]') as string[];
                const step = a.current_step || 1;
                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/gap-assessment/${a.id}`)}
                    className="group flex w-full items-center gap-4 rounded-xl border border-border bg-adv-card px-4 py-3 text-left hover:border-adv-teal/40 transition-all"
                  >
                    <BarChart3 className="h-5 w-5 text-adv-teal shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-adv-off-white group-hover:text-adv-teal transition-colors truncate">{a.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-adv-gray">{fwIds.join(', ')}</span>
                        <span className="text-adv-gray">·</span>
                        <span className="text-xs text-adv-gray">Step {step}: {STEP_LABELS[step] || 'Unknown'}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      <span className="text-[11px] text-adv-gray">{new Date(a.updated_at).toLocaleDateString()}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-adv-gray shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!loading && assessments.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardCheck className="mb-4 h-12 w-12 text-adv-gray" />
            <h3 className="mb-2 text-base font-semibold text-adv-off-white">No assessments yet</h3>
            <p className="mb-6 max-w-sm text-sm text-adv-gray">
              Run a structured gap assessment across 18+ frameworks — AML, GDPR, AI Act, DORA, ISO standards, and more.
              Produces article-level scoring, capability view, board summary, and project roadmap.
            </p>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <Plus className="h-4 w-4" /> Start First Assessment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
