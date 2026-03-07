/**
 * GapAssessmentWizard.tsx
 * 8-step wizard for compliance gap assessments.
 * Steps: Framework → Scope → Context → Run → Scoring → Capability → Board → Roadmap
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ClipboardCheck, ChevronRight, ChevronLeft, CheckSquare,
  Play, BarChart3, Layers, FileText, Map, Download,
  RefreshCw, AlertTriangle, CheckCircle2, Circle,
  ChevronDown, Loader2, Trash2, ExternalLink,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArticleFinding {
  articleId: string;
  articleTitle: string;
  requirement: string;
  currentState: string;
  score: 'red' | 'amber' | 'yellow' | 'green';
  priority: 'critical' | 'high' | 'medium' | 'low';
  notes: string;
}

interface Assessment {
  id: string;
  title: string;
  frameworks: string;
  scope_config: string;
  context_config: string;
  status: string;
  current_step: number;
  article_scores: string;
  capability_view: string | null;
  board_summary: string | null;
  roadmap: string | null;
}

interface Framework {
  id: string;
  name: string;
  shortName: string;
  articleCount: number;
  themes: string[];
  articles: Array<{ id: string; title: string; theme: string; requirement: string }>;
}

interface ProgressEvent {
  type: string;
  message?: string;
  framework?: string;
  frameworkName?: string;
  batchIndex?: number;
  totalBatches?: number;
  articles?: string[];
  findings?: ArticleFinding[];
  articleCount?: number;
  error?: string;
}

interface CapabilityTheme {
  id: string;
  name: string;
  description: string;
  maturityScore: number;
  gapSeverity: 'critical' | 'high' | 'medium' | 'low';
  affectedArticles: string[];
  frameworks: string[];
  keyGaps: string[];
  quickWins: string[];
  crossRegImpact?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Framework', icon: ClipboardCheck },
  { id: 2, label: 'Scope', icon: CheckSquare },
  { id: 3, label: 'Context', icon: FileText },
  { id: 4, label: 'Assess', icon: Play },
  { id: 5, label: 'Scoring', icon: BarChart3 },
  { id: 6, label: 'Capability', icon: Layers },
  { id: 7, label: 'Board', icon: FileText },
  { id: 8, label: 'Roadmap', icon: Map },
];

const SCORE_COLORS = {
  red:    { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', dot: '🔴' },
  amber:  { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', dot: '🟠' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', dot: '🟡' },
  green:  { bg: 'bg-adv-green/10', text: 'text-adv-green', border: 'border-adv-green/30', dot: '🟢' },
};

const PRIORITY_COLORS = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-adv-green',
};

const MATURITY_LABELS = ['', 'Initial', 'Developing', 'Defined', 'Managed', 'Optimising'];
const MATURITY_COLORS = ['', 'text-red-400', 'text-orange-400', 'text-yellow-400', 'text-adv-teal', 'text-adv-green'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: 'red' | 'amber' | 'yellow' | 'green' }) {
  const c = SCORE_COLORS[score];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text} ${c.border}`}>
      {c.dot} {score.charAt(0).toUpperCase() + score.slice(1)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: 'critical' | 'high' | 'medium' | 'low' }) {
  return (
    <span className={`text-xs font-medium ${PRIORITY_COLORS[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

function StepIndicator({ step, current }: { step: typeof STEPS[0]; current: number }) {
  const Icon = step.icon;
  const done = current > step.id;
  const active = current === step.id;
  return (
    <div className={`flex flex-col items-center gap-1 ${active ? 'text-adv-teal' : done ? 'text-adv-green' : 'text-adv-gray-med'}`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${active ? 'border-adv-teal bg-adv-teal-dim' : done ? 'border-adv-green bg-adv-green/10' : 'border-adv-gray-med/30'}`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      <span className="text-[10px] font-medium hidden sm:block">{step.label}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GapAssessmentWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [findings, setFindings] = useState<Array<ArticleFinding & { framework: string }>>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [contextConfig, setContextConfig] = useState({
    entityType: 'Credit institution',
    jurisdiction: 'Sweden / EU',
    segments: 'Retail, SME',
    maturity: 3,
    concerns: '',
    documents: '',
  });
  const [scopeConfig, setScopeConfig] = useState<{ selectedThemes: string[] }>({ selectedThemes: [] });
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityTheme[]>([]);
  const [boardSummary, setBoardSummary] = useState('');
  const [roadmap, setRoadmap] = useState<{ phases?: Array<{ id: string; name: string; timeframe: string; objective: string; items: Array<{ id: string; title: string; owner: string; effort: string; priority: string; description: string }> }> } | null>(null);
  const [filterScore, setFilterScore] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'score' | 'framework'>('priority');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const progressRef = useRef<HTMLDivElement>(null);

  // ── Load assessment ────────────────────────────────────────────────────────
  const loadAssessment = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/gap-assessments/${id}`, { headers: getAuthHeader() });
      if (!r.ok) { navigate('/gap-assessment'); return; }
      const { assessment: a, findings: f } = await r.json();
      setAssessment(a);
      setCurrentStep(a.current_step || 1);
      if (a.context_config) {
        try { setContextConfig(prev => ({ ...prev, ...JSON.parse(a.context_config) })); } catch { /* ignore */ }
      }
      if (a.scope_config) {
        try { setScopeConfig(JSON.parse(a.scope_config)); } catch { /* ignore */ }
      }
      if (f) setFindings(f);
      if (a.capability_view) {
        try { setCapabilities(JSON.parse(a.capability_view)); } catch { /* ignore */ }
      }
      if (a.board_summary) setBoardSummary(a.board_summary);
      if (a.roadmap) {
        try { setRoadmap(JSON.parse(a.roadmap)); } catch { /* ignore */ }
      }

      // Load framework details
      let fwIds: string[] = [];
      try { fwIds = JSON.parse(a.frameworks || '[]'); } catch { /* ignore */ }
      const fwDetails = await Promise.all(fwIds.map(async (fwId: string) => {
        const fr = await fetch(`/api/gap-assessments/frameworks/${fwId}`, { headers: getAuthHeader() });
        return fr.ok ? fr.json().then((d: { framework: Framework }) => d.framework) : null;
      }));
      setFrameworks(fwDetails.filter(Boolean) as Framework[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadAssessment(); }, [loadAssessment]);

  // ── Pre-fill context from Org Context (only for fresh assessments on step 1-3) ──
  useEffect(() => {
    if (!assessment) return;
    // Only pre-fill if no context has been saved yet (context_config is empty or default)
    let savedContext: Record<string, unknown> = {};
    try { savedContext = JSON.parse(assessment.context_config || '{}'); } catch { /* ignore */ }
    const hasSavedContext = savedContext.entityType || savedContext.jurisdiction;
    if (hasSavedContext) return;

    fetch('/api/org-context', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then((d: { context?: Record<string, unknown> } | null) => {
        if (!d?.context) return;
        const ctx = d.context;
        setContextConfig(prev => ({
          ...prev,
          ...(ctx.org_type ? { entityType: String(ctx.org_type) } : {}),
          ...(ctx.jurisdiction ? { jurisdiction: String(ctx.jurisdiction) } : {}),
          ...(ctx.custom_context ? { concerns: String(ctx.custom_context) } : {}),
        }));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  // ── Auto-scroll progress ───────────────────────────────────────────────────
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [progressEvents]);

  // ── Save context ───────────────────────────────────────────────────────────
  const saveContext = async () => {
    if (!id) return;
    // Only advance to step 4 if we haven't already passed it
    const nextStep = Math.max(currentStep, 4);
    await fetch(`/api/gap-assessments/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_config: contextConfig, scope_config: scopeConfig, current_step: nextStep }),
    });
    setCurrentStep(nextStep);
  };

  // ── Run assessment (SSE) ───────────────────────────────────────────────────
  const runAssessment = async () => {
    if (!id || isRunning) return;
    setIsRunning(true);
    setProgressEvents([]);

    try {
      const response = await fetch(`/api/gap-assessments/${id}/run`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      });

      if (!response.ok || !response.body) throw new Error('Stream failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as ProgressEvent;
            setProgressEvents(prev => {
              const next = [...prev, event];
              return next.length > 200 ? next.slice(next.length - 200) : next;
            });
            if (event.type === 'batch_complete' && event.findings) {
              const framework = event.framework || '';
              setFindings(prev => {
                const newFindings = event.findings!.map((f: ArticleFinding) => ({ ...f, framework }));
                const existingIds = new Set(prev.filter(p => p.framework === framework).map(p => p.articleId));
                const toAdd = newFindings.filter(f => !existingIds.has(f.articleId));
                const updated = prev.filter(p => p.framework !== framework || !newFindings.find((nf: ArticleFinding) => nf.articleId === p.articleId));
                return [...updated, ...newFindings];
              });
            }
            if (event.type === 'complete') {
              setCurrentStep(5);
              await loadAssessment();
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      console.error('[GapWizard] run error:', err);
      setProgressEvents(prev => [...prev, { type: 'error', error: String(err), message: 'Assessment failed' }]);
    } finally {
      setIsRunning(false);
    }
  };

  // ── Delete assessment ──────────────────────────────────────────────────────
  const deleteAssessment = async () => {
    if (!id) return;
    await fetch(`/api/gap-assessments/${id}`, { method: 'DELETE', headers: getAuthHeader() });
    navigate('/gap-assessment');
  };

  // ── Synthesise capability ──────────────────────────────────────────────────
  const runSynthesis = async () => {
    if (!id) return;
    setActionLoading('synthesise');
    setActionError('');
    try {
      const r = await fetch(`/api/gap-assessments/${id}/synthesise`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      });
      if (!r.ok) { setActionError('Synthesis failed — please retry.'); return; }
      const { capabilities: caps } = await r.json();
      setCapabilities(caps);
      setCurrentStep(6);
    } catch (err) {
      setActionError(`Synthesis error: ${String(err)}`);
    } finally {
      setActionLoading('');
    }
  };

  // ── Board summary ──────────────────────────────────────────────────────────
  const runBoardSummary = async () => {
    if (!id) return;
    setActionLoading('board');
    setActionError('');
    try {
      const r = await fetch(`/api/gap-assessments/${id}/board-summary`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      });
      if (!r.ok) { setActionError('Board summary failed — please retry.'); return; }
      const { boardSummary: bs } = await r.json();
      setBoardSummary(bs);
      setCurrentStep(7);
    } catch (err) {
      setActionError(`Board summary error: ${String(err)}`);
    } finally {
      setActionLoading('');
    }
  };

  // ── Roadmap ────────────────────────────────────────────────────────────────
  const runRoadmap = async () => {
    if (!id) return;
    setActionLoading('roadmap');
    setActionError('');
    try {
      const r = await fetch(`/api/gap-assessments/${id}/roadmap`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      });
      if (!r.ok) { setActionError('Roadmap generation failed — please retry.'); return; }
      const { roadmap: rm } = await r.json();
      setRoadmap(rm);
      setCurrentStep(8);
    } catch (err) {
      setActionError(`Roadmap error: ${String(err)}`);
    } finally {
      setActionLoading('');
    }
  };

  // ── Score summary ──────────────────────────────────────────────────────────
  const scoreSummary = {
    red: findings.filter(f => f.score === 'red').length,
    amber: findings.filter(f => f.score === 'amber').length,
    yellow: findings.filter(f => f.score === 'yellow').length,
    green: findings.filter(f => f.score === 'green').length,
    critical: findings.filter(f => f.priority === 'critical').length,
    high: findings.filter(f => f.priority === 'high').length,
  };

  // ── Filtered/sorted findings ───────────────────────────────────────────────
  const displayFindings = findings
    .filter(f => filterScore === 'all' || f.score === filterScore)
    .sort((a, b) => {
      if (sortBy === 'priority') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] || 4) - (order[b.priority] || 4);
      }
      if (sortBy === 'score') {
        const order = { red: 0, amber: 1, yellow: 2, green: 3 };
        return (order[a.score] || 4) - (order[b.score] || 4);
      }
      return a.framework.localeCompare(b.framework);
    });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-adv-dark">
        <Loader2 className="h-8 w-8 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (!assessment) return null;

  let fwIds: string[] = [];
  try { fwIds = JSON.parse(assessment.frameworks || '[]'); } catch { /* ignore */ }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-adv-dark overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/gap-assessment')} className="flex h-8 w-8 items-center justify-center rounded-lg bg-adv-card text-adv-gray hover:text-adv-off-white transition-colors">
            <ClipboardCheck className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-adv-off-white truncate">{assessment.title}</h1>
            <p className="text-xs text-adv-gray">{fwIds.join(' + ')}</p>
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-red-400">Delete this assessment?</span>
              <button onClick={deleteAssessment} className="rounded-lg bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30 transition-colors">Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white transition-colors">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-adv-gray hover:text-adv-red hover:bg-red-500/10 transition-colors" title="Delete assessment">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center shrink-0">
              <button
                onClick={() => currentStep >= step.id && setCurrentStep(step.id)}
                disabled={currentStep < step.id}
                className="disabled:cursor-not-allowed"
              >
                <StepIndicator step={step} current={currentStep} />
              </button>
              {i < STEPS.length - 1 && (
                <div className={`mx-1 h-0.5 w-6 rounded-full ${currentStep > step.id ? 'bg-adv-green' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-5 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {actionError}
          </div>
          <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-300 transition-colors text-xs">Dismiss</button>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-auto p-5">

        {/* ── Step 1: Framework overview ────────────────────────────────── */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-adv-off-white">Selected Frameworks</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {frameworks.map(fw => (
                <div key={fw.id} className="rounded-xl border border-border bg-adv-card p-4">
                  <h3 className="text-sm font-semibold text-adv-teal mb-1">{fw.shortName} — {fw.name}</h3>
                  <p className="text-xs text-adv-gray mb-3">{fw.articleCount} articles/controls across {fw.themes.length} themes</p>
                  <div className="flex flex-wrap gap-1">
                    {fw.themes.map(t => (
                      <span key={t} className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setCurrentStep(2)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
              Next: Select Scope <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Step 2: Scope selection ────────────────────────────────────── */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-adv-off-white mb-1">Select Scope</h2>
              <p className="text-sm text-adv-gray">Assess all articles, or restrict to specific themes.</p>
            </div>
            {frameworks.map(fw => (
              <div key={fw.id} className="rounded-xl border border-border bg-adv-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-adv-off-white">{fw.shortName}</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-border bg-adv-dark accent-adv-teal"
                      checked={scopeConfig.selectedThemes.length === 0}
                      onChange={() => setScopeConfig({ selectedThemes: [] })}
                    />
                    <span className="text-xs text-adv-off-white font-medium">All {fw.articleCount} articles</span>
                  </label>
                  {fw.themes.map(theme => (
                    <label key={theme} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-border bg-adv-dark accent-adv-teal"
                        checked={scopeConfig.selectedThemes.includes(theme)}
                        onChange={() => setScopeConfig(prev => ({
                          selectedThemes: prev.selectedThemes.includes(theme)
                            ? prev.selectedThemes.filter(t => t !== theme)
                            : [...prev.selectedThemes, theme],
                        }))}
                      />
                      <span className="text-xs text-adv-gray">
                        {theme} — {fw.articles.filter(a => a.theme === theme).length} articles
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={() => setCurrentStep(1)} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button onClick={() => setCurrentStep(3)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                Next: Context <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Context gathering ──────────────────────────────────── */}
        {currentStep === 3 && (
          <div className="space-y-4 max-w-2xl">
            <div>
              <h2 className="text-base font-semibold text-adv-off-white mb-1">Context Gathering</h2>
              <p className="text-sm text-adv-gray">Tell Claude about the entity being assessed. More detail = more accurate gap findings.</p>
              {(contextConfig.entityType !== 'Credit institution' || contextConfig.jurisdiction !== 'Sweden / EU') && (
                <p className="mt-1.5 text-[11px] text-adv-teal">Pre-filled from Org Context — edit as needed for this assessment.</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-adv-gray">Entity type</label>
                <select
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                  value={contextConfig.entityType}
                  onChange={e => setContextConfig(c => ({ ...c, entityType: e.target.value }))}
                >
                  <option>Credit institution</option>
                  <option>Payment institution</option>
                  <option>E-money institution</option>
                  <option>Crypto-asset service provider (CASP)</option>
                  <option>Investment firm</option>
                  <option>Insurance undertaking</option>
                  <option>Asset manager</option>
                  <option>Fund administrator</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-adv-gray">Jurisdiction(s)</label>
                <input
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="e.g. Sweden, Finland, EU"
                  value={contextConfig.jurisdiction}
                  onChange={e => setContextConfig(c => ({ ...c, jurisdiction: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-adv-gray">Customer segments</label>
                <input
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="e.g. Retail, SME, Corporate, HNW"
                  value={contextConfig.segments}
                  onChange={e => setContextConfig(c => ({ ...c, segments: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-adv-gray">Current AML maturity (1-5)</label>
                <input
                  type="range"
                  min={1} max={5} step={1}
                  value={contextConfig.maturity}
                  onChange={e => setContextConfig(c => ({ ...c, maturity: parseInt(e.target.value) }))}
                  className="w-full accent-adv-teal"
                />
                <div className="flex justify-between text-[11px] text-adv-gray-med">
                  <span>1 — Initial</span><span>3 — Defined</span><span>5 — Optimising</span>
                </div>
                <p className="mt-1 text-xs text-adv-teal font-medium">{MATURITY_LABELS[contextConfig.maturity]} ({contextConfig.maturity}/5)</p>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-adv-gray">Known concerns or focus areas (optional)</label>
              <textarea
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                placeholder="e.g. Recent FIU feedback on TM alert quality, new CASP business line, upcoming supervisory review..."
                value={contextConfig.concerns}
                onChange={e => setContextConfig(c => ({ ...c, concerns: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCurrentStep(2)} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button onClick={saveContext} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                Run Assessment <Play className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Assessment execution ──────────────────────────────── */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-adv-off-white mb-1">Assessment Execution</h2>
              <p className="text-sm text-adv-gray">Claude will assess articles in batches of 12. This may take several minutes for large frameworks.</p>
            </div>

            {!isRunning && progressEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-border bg-adv-card text-center">
                <Play className="mb-3 h-10 w-10 text-adv-teal" />
                <h3 className="mb-2 text-sm font-semibold text-adv-off-white">Ready to assess</h3>
                <p className="mb-5 max-w-sm text-xs text-adv-gray">
                  Entity: {contextConfig.entityType} — {contextConfig.jurisdiction}<br />
                  Frameworks: {fwIds.join(', ')}<br />
                  Maturity: {MATURITY_LABELS[contextConfig.maturity]} ({contextConfig.maturity}/5)
                </p>
                <button onClick={runAssessment} className="flex items-center gap-2 rounded-lg bg-adv-teal px-6 py-3 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                  <Play className="h-4 w-4" /> Start Assessment
                </button>
              </div>
            )}

            {(isRunning || progressEvents.length > 0) && (
              <div className="rounded-xl border border-border bg-adv-card">
                <div ref={progressRef} className="max-h-80 overflow-y-auto p-4 space-y-2 font-mono text-xs">
                  {progressEvents.map((e, i) => (
                    <div key={i} className={`flex items-start gap-2 ${e.type === 'error' ? 'text-red-400' : e.type === 'complete' ? 'text-adv-green' : e.type === 'batch_complete' ? 'text-adv-teal' : 'text-adv-gray'}`}>
                      {e.type === 'error' ? <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> : e.type === 'complete' ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <Circle className="h-3 w-3 mt-0.5 shrink-0" />}
                      <span>{e.message || e.type}</span>
                      {e.type === 'batch_complete' && e.batchIndex !== undefined && e.totalBatches !== undefined && (
                        <span className="ml-auto text-adv-gray-med">{e.batchIndex + 1}/{e.totalBatches}</span>
                      )}
                    </div>
                  ))}
                  {isRunning && (
                    <div className="flex items-center gap-2 text-adv-teal">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Assessing...</span>
                    </div>
                  )}
                </div>
                {!isRunning && findings.length > 0 && (
                  <div className="border-t border-border p-4">
                    <button onClick={() => setCurrentStep(5)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                      View Scoring ({findings.length} findings) <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 5: Article scoring table ─────────────────────────────── */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-adv-off-white">Article Scoring</h2>
                <p className="text-xs text-adv-gray">{findings.length} findings across {fwIds.length} framework(s)</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select className="rounded-lg border border-border bg-adv-card px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                  value={filterScore} onChange={e => setFilterScore(e.target.value)}>
                  <option value="all">All scores</option>
                  <option value="red">🔴 Red</option>
                  <option value="amber">🟠 Amber</option>
                  <option value="yellow">🟡 Yellow</option>
                  <option value="green">🟢 Green</option>
                </select>
                <select className="rounded-lg border border-border bg-adv-card px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                  value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                  <option value="priority">Sort by priority</option>
                  <option value="score">Sort by score</option>
                  <option value="framework">Sort by framework</option>
                </select>
              </div>
            </div>

            {/* Score summary */}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {([['red','🔴',scoreSummary.red], ['amber','🟠',scoreSummary.amber], ['yellow','🟡',scoreSummary.yellow], ['green','🟢',scoreSummary.green]] as const).map(([score, emoji, count]) => (
                <div key={score} className={`rounded-lg border p-2 text-center cursor-pointer ${filterScore === score ? SCORE_COLORS[score].border + ' ' + SCORE_COLORS[score].bg : 'border-border bg-adv-card'}`}
                  onClick={() => setFilterScore(filterScore === score ? 'all' : score)}>
                  <div className="text-sm">{emoji}</div>
                  <div className={`text-base font-bold ${SCORE_COLORS[score].text}`}>{count as number}</div>
                  <div className="text-[10px] text-adv-gray capitalize">{score}</div>
                </div>
              ))}
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-center">
                <div className="text-sm text-red-400">⚡</div>
                <div className="text-base font-bold text-red-400">{scoreSummary.critical}</div>
                <div className="text-[10px] text-adv-gray">Critical</div>
              </div>
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-2 text-center">
                <div className="text-sm text-orange-400">⬆</div>
                <div className="text-base font-bold text-orange-400">{scoreSummary.high}</div>
                <div className="text-[10px] text-adv-gray">High</div>
              </div>
            </div>

            {/* Findings table */}
            <div className="overflow-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-adv-dark-2 text-adv-gray">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Article</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Current State</th>
                    <th className="px-3 py-2 text-left font-medium">Score</th>
                    <th className="px-3 py-2 text-left font-medium">Priority</th>
                    <th className="px-3 py-2 text-left font-medium">Notes</th>
                    <th className="px-3 py-2 text-left font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayFindings.map((f, i) => (
                    <tr key={`${f.framework}-${f.articleId}-${i}`} className="border-t border-border hover:bg-adv-card transition-colors">
                      <td className="px-3 py-2 font-mono font-medium text-adv-teal whitespace-nowrap">{f.articleId}</td>
                      <td className="px-3 py-2 text-adv-off-white max-w-[120px] truncate" title={f.articleTitle}>{f.articleTitle}</td>
                      <td className="px-3 py-2 text-adv-gray max-w-[200px]">
                        <span className="line-clamp-2">{f.currentState}</span>
                      </td>
                      <td className="px-3 py-2"><ScoreBadge score={f.score} /></td>
                      <td className="px-3 py-2"><PriorityBadge priority={f.priority} /></td>
                      <td className="px-3 py-2 text-adv-gray max-w-[200px]">
                        <span className="line-clamp-2">{f.notes}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/counsels-desk?prefill=${encodeURIComponent(`Research ${f.framework} ${f.articleId}: ${f.articleTitle}`)}`}
                          title="Research in Counsel's Desk"
                          className="flex h-6 w-6 items-center justify-center rounded text-adv-gray hover:text-adv-teal hover:bg-adv-teal-dim transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayFindings.length === 0 && (
                <div className="py-8 text-center text-sm text-adv-gray">No findings match the filter.</div>
              )}
            </div>

            <button
              onClick={runSynthesis}
              disabled={actionLoading === 'synthesise'}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-60 transition-colors"
            >
              {actionLoading === 'synthesise' ? <><Loader2 className="h-4 w-4 animate-spin" /> Synthesising…</> : <><Layers className="h-4 w-4" /> Synthesise Capability View</>}
            </button>
          </div>
        )}

        {/* ── Step 6: Capability view ────────────────────────────────────── */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-adv-off-white">Capability View</h2>
                <p className="text-xs text-adv-gray">Article scores synthesised into cross-cutting organisational capabilities</p>
              </div>
              <button onClick={runSynthesis} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors">
                <RefreshCw className="h-3.5 w-3.5" /> Re-run
              </button>
            </div>

            {capabilities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-border bg-adv-card text-center">
                <Layers className="mb-3 h-10 w-10 text-adv-teal" />
                <p className="mb-4 text-sm text-adv-gray">Generate capability synthesis from article findings</p>
                <button onClick={runSynthesis} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                  <Layers className="h-4 w-4" /> Synthesise Capabilities
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {capabilities.map(cap => (
                    <div key={cap.id} className={`rounded-xl border p-4 ${cap.gapSeverity === 'critical' ? 'border-red-500/30 bg-red-500/5' : cap.gapSeverity === 'high' ? 'border-orange-500/30 bg-orange-500/5' : 'border-border bg-adv-card'}`}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-adv-off-white">{cap.name}</h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs font-bold ${MATURITY_COLORS[Math.min(5, Math.max(1, cap.maturityScore))]}`}>{Math.min(5, Math.max(1, cap.maturityScore))}/5</span>
                          <span className={`text-xs ${PRIORITY_COLORS[cap.gapSeverity]}`}>{cap.gapSeverity}</span>
                        </div>
                      </div>
                      <p className="mb-2 text-xs text-adv-gray leading-relaxed">{cap.description}</p>
                      {cap.keyGaps.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] font-semibold text-adv-gray-med mb-1">Key Gaps</p>
                          <ul className="space-y-0.5">
                            {cap.keyGaps.slice(0, 2).map((g, i) => (
                              <li key={i} className="text-[11px] text-adv-off-white flex gap-1"><span className="text-red-400">•</span>{g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {cap.quickWins.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-adv-gray-med mb-1">Quick Wins</p>
                          <ul className="space-y-0.5">
                            {cap.quickWins.slice(0, 1).map((w, i) => (
                              <li key={i} className="text-[11px] text-adv-teal flex gap-1"><span>⚡</span>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={runBoardSummary} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                  <FileText className="h-4 w-4" /> Generate Board Summary
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Step 7: Board summary ──────────────────────────────────────── */}
        {currentStep === 7 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-adv-off-white">Board / ExCo Summary</h2>
                <p className="text-xs text-adv-gray">One-page board-ready summary in plain language</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={runBoardSummary} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" /> Re-generate
                </button>
              </div>
            </div>

            {!boardSummary ? (
              <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-border bg-adv-card text-center">
                <FileText className="mb-3 h-10 w-10 text-adv-teal" />
                <p className="mb-4 text-sm text-adv-gray">Generate board-ready one-page summary</p>
                <button onClick={runBoardSummary} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                  <FileText className="h-4 w-4" /> Generate Board Summary
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-adv-card p-5">
                  <div className="prose prose-sm prose-invert max-w-none text-adv-off-white">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{boardSummary}</ReactMarkdown>
                  </div>
                </div>
                <button onClick={runRoadmap} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                  <Map className="h-4 w-4" /> Generate Roadmap
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Step 8: Roadmap ────────────────────────────────────────────── */}
        {currentStep === 8 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-adv-off-white">Remediation Roadmap</h2>
                <p className="text-xs text-adv-gray">Phased implementation plan with owners, effort, and dependencies</p>
              </div>
              <button onClick={runRoadmap} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors">
                <RefreshCw className="h-3.5 w-3.5" /> Re-generate
              </button>
            </div>

            {!roadmap ? (
              <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-border bg-adv-card text-center">
                <Map className="mb-3 h-10 w-10 text-adv-teal" />
                <p className="mb-4 text-sm text-adv-gray">Generate phased remediation roadmap</p>
                <button onClick={runRoadmap} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                  <Map className="h-4 w-4" /> Generate Roadmap
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {roadmap.phases?.map(phase => (
                  <div key={phase.id} className="rounded-xl border border-border bg-adv-card overflow-hidden">
                    <div className="flex items-center gap-3 bg-adv-dark-2 px-4 py-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-adv-teal-dim text-xs font-bold text-adv-teal">
                        {phase.id.replace('phase-', 'P')}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-adv-off-white">{phase.name}</h3>
                        <p className="text-xs text-adv-teal">{phase.timeframe}</p>
                      </div>
                      <span className="ml-auto text-xs text-adv-gray">{phase.items.length} items</span>
                    </div>
                    <div className="divide-y divide-border">
                      {phase.items.map(item => (
                        <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                          <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.priority === 'critical' ? 'bg-red-500/20 text-red-400' : item.priority === 'high' ? 'bg-orange-500/20 text-orange-400' : 'bg-adv-dark text-adv-gray'}`}>
                            {item.effort}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-adv-off-white">{item.title}</p>
                            <p className="mt-0.5 text-[11px] text-adv-gray line-clamp-2">{item.description}</p>
                          </div>
                          <span className="shrink-0 text-[10px] text-adv-gray-med">{item.owner}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {roadmap && (roadmap as { estimatedFTE?: string; keyRisks?: string[] }).estimatedFTE && (
                  <div className="rounded-xl border border-border bg-adv-card p-4">
                    <h3 className="mb-2 text-sm font-semibold text-adv-off-white">Programme Overview</h3>
                    <p className="text-xs text-adv-gray">Estimated FTE: <span className="text-adv-off-white">{(roadmap as { estimatedFTE?: string }).estimatedFTE}</span></p>
                    {(roadmap as { keyRisks?: string[] }).keyRisks && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-adv-gray mb-1">Key risks if delayed:</p>
                        <ul className="space-y-1">
                          {(roadmap as { keyRisks?: string[] }).keyRisks!.map((r, i) => (
                            <li key={i} className="text-xs text-adv-off-white flex gap-1.5"><AlertTriangle className="h-3 w-3 text-adv-gold shrink-0 mt-0.5" />{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
