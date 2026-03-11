/**
 * GapAssessmentWizard.tsx
 * 8-step wizard for compliance gap assessments.
 * Steps: Framework → Scope → Context → Run → Scoring → Capability → Board → Roadmap
 */

import { useState, useEffect, useRef, useCallback, Component, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ClipboardCheck, ChevronRight, ChevronLeft, CheckSquare,
  Play, BarChart3, Layers, FileText, Map, Download,
  RefreshCw, AlertTriangle, CheckCircle2, Circle,
  ChevronDown, Loader2, Trash2, ExternalLink,
  Paperclip, Upload, X, FolderOpen, MessageSquare,
  RotateCcw, GitCompare, TrendingUp, TrendingDown, Clock,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth, uploadFile } from '@/lib/api';
import type { KnowledgeSourceConfig } from '@/lib/types';
import KnowledgeSourcePanel from '@/components/shared/KnowledgeSourcePanel';
import { useExport } from '@/hooks/useExport';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArticleFinding {
  articleId: string;
  articleTitle: string;
  requirement: string;
  currentState: string;
  score: 'red' | 'amber' | 'yellow' | 'green';
  numericScore: number; // 0-100, 100 = fully compliant
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
  // Extended fields for detailed text view
  regulatoryRequirement?: string;
  gapAnalysis?: string;
  importanceToClose?: string;
  strengths?: string;
  areasToImprove?: string;
  goodOutcome?: string;
  designActions?: string;
  implementationActions?: string;
  testingVerification?: string;
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

interface EvidenceDocument {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error';
  text?: string;
}

interface InterviewNote {
  id: string;
  role: string;
  notes: string;
}

const INTERVIEW_ROLE_SUGGESTIONS = [
  'MLRO / Compliance Officer',
  'Head of AML Operations',
  'KYC Team Lead',
  'Transaction Monitoring Analyst',
  'Head of Risk',
  'Internal Audit',
  'Board Member / NECD',
  'Front-line Relationship Manager',
  'IT / Data Team',
  'Legal Counsel',
];

interface IterationSummary {
  id: string;
  iterationNumber: number;
  scoreSummary: { red: number; amber: number; yellow: number; green: number; avg: number; total: number };
  notes: string | null;
  evidenceSummary: string | null;
  createdAt: string;
}

interface IterationComparison {
  overallDelta: { before: number; after: number; change: number };
  improved: Array<{ articleId: string; articleTitle?: string; framework: string; beforeScore: number; afterScore: number; delta: number }>;
  worsened: Array<{ articleId: string; articleTitle?: string; framework: string; beforeScore: number; afterScore: number; delta: number }>;
  capabilityDeltas: Array<{ id: string; name: string; beforeMaturity: number; afterMaturity: number; delta: number }>;
  totalImproved: number;
  totalWorsened: number;
  totalUnchanged: number;
}

// ── Multi-format export dropdown ─────────────────────────────────────────────
function ExportDropdown({ label, buildContent, filename, isExporting, doExport }: {
  label: string;
  buildContent: () => string;
  filename: string;
  isExporting: boolean;
  doExport: (format: string, content: string, metadata?: Record<string, unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const handleExport = async (format: string) => {
    setOpen(false);
    const content = buildContent();
    if (format === 'md') {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      await doExport(format, content, { filename, title: label, moduleId: 'gap-analysis' });
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isExporting}
        className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors disabled:opacity-50"
      >
        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-48 rounded-lg border border-border bg-adv-card shadow-lg py-1">
          {[
            { fmt: 'md', label: 'Markdown (.md)', icon: '📝' },
            { fmt: 'docx', label: 'Word (.docx)', icon: '📄' },
            { fmt: 'xlsx', label: 'Excel (.xlsx)', icon: '📊' },
            { fmt: 'pdf', label: 'PDF (.pdf)', icon: '📕' },
          ].map(o => (
            <button key={o.fmt} onClick={() => handleExport(o.fmt)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-adv-off-white hover:bg-white/5 text-left">
              <span>{o.icon}</span> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

function StepIndicator({ step, current, maxReached }: { step: typeof STEPS[0]; current: number; maxReached: number }) {
  const Icon = step.icon;
  const done = maxReached > step.id && current !== step.id;
  const active = current === step.id;
  return (
    <div className={`flex flex-col items-center gap-1 ${active ? 'text-adv-teal' : done ? 'text-adv-green' : 'text-adv-gray'}`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${active ? 'border-adv-teal bg-adv-teal-dim' : done ? 'border-adv-green bg-adv-green/10' : 'border-adv-gray-med/30'}`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      <span className="text-xs font-medium hidden sm:block">{step.label}</span>
    </div>
  );
}

// ── Error Boundary ───────────────────────────────────────────────────────────

class WizardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-adv-dark text-adv-off-white">
          <ClipboardCheck className="h-12 w-12 text-adv-red" />
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="max-w-md text-center text-sm text-adv-gray">{this.state.error.message}</p>
          <button onClick={() => window.location.href = '/gap-assessment'} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-white hover:bg-adv-teal-dark transition-colors">
            Back to Gap Assessment
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GapAssessmentWizard() {
  return (
    <WizardErrorBoundary>
      <GapAssessmentWizardInner />
    </WizardErrorBoundary>
  );
}

function GapAssessmentWizardInner() {
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
    modelTier: 'sonnet' as 'sonnet' | 'opus',
  });
  const [scopeConfig, setScopeConfig] = useState<{ selectedThemes: string[] }>({ selectedThemes: [] });
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityTheme[]>([]);
  const [boardSummary, setBoardSummary] = useState('');
  const [roadmap, setRoadmap] = useState<{ phases?: Array<{ id: string; name: string; timeframe: string; objective: string; items: Array<{ id: string; title: string; owner: string; effort: string; priority: string; description: string; rationale?: string; regulatoryDeadline?: string; riskIfDelayed?: string; resourceRequirements?: string; successMetrics?: string }> }>; estimatedFTE?: string; estimatedBudget?: string; keyRisks?: string[]; governanceModel?: string; reportingCadence?: string; criticalPath?: string[]; totalItems?: number } | null>(null);
  const [synthesisReasoning, setSynthesisReasoning] = useState('');
  const [boardReasoning, setBoardReasoning] = useState('');
  const [roadmapReasoning, setRoadmapReasoning] = useState('');
  const [filterScore, setFilterScore] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'score' | 'framework'>('priority');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [evidenceDocs, setEvidenceDocs] = useState<EvidenceDocument[]>([]);
  const [interviews, setInterviews] = useState<InterviewNote[]>([]);
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSourceConfig>({
    modes: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      onlineReference: { enabled: false, urls: [], fetchDepth: 'full' },
      localFolder: { enabled: false, folderPaths: [], recursive: true },
      combinedMode: { enabled: false, priority: 'merged' },
    },
    ragMode: { enabled: false, folderPaths: [], topK: 10, minScore: 0.1 },
    ragSearch: { enabled: false, collections: [], topK: 10, rerank: true, showRelevance: true },
  });
  const [isDragging, setIsDragging] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedCap, setExpandedCap] = useState<string | null>(null);
  const [capViewMode, setCapViewMode] = useState<'cards' | 'text'>('text');
  const [maxStepReached, setMaxStepReached] = useState(1);

  // Advance maxStepReached whenever currentStep increases
  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
    setMaxStepReached(prev => Math.max(prev, step));
  }, []);
  const [iterations, setIterations] = useState<IterationSummary[]>([]);
  const [comparison, setComparison] = useState<IterationComparison | null>(null);
  const [showIterationPanel, setShowIterationPanel] = useState(false);
  const [iterationNotes, setIterationNotes] = useState('');
  const [iterationDocs, setIterationDocs] = useState<EvidenceDocument[]>([]);
  const [iterDragging, setIterDragging] = useState(false);
  const [comparingIters, setComparingIters] = useState<{ a: string; b: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iterFileInputRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const { doExport, isExporting } = useExport();

  // ── Load assessment ────────────────────────────────────────────────────────
  const loadAssessment = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/gap-assessments/${id}`, { headers: getAuthHeader() });
      if (!r.ok) { navigate('/gap-assessment'); return; }
      const { assessment: a, findings: f } = await r.json();
      setAssessment(a);
      const loadedStep = a.current_step || 1;
      setCurrentStep(loadedStep);
      setMaxStepReached(loadedStep);
      if (a.context_config) {
        try {
          const parsed = JSON.parse(a.context_config);
          setContextConfig(prev => ({ ...prev, ...parsed }));
          // Restore evidence doc metadata (text not re-loaded — already saved in context_config.documents)
          if (Array.isArray(parsed.documentFileIds)) {
            setEvidenceDocs(parsed.documentFileIds.map((fid: string) => ({ id: fid, name: fid, size: 0, status: 'done' as const })));
          }
          // Restore knowledge sources config
          if (parsed.knowledgeSources) {
            setKnowledgeSources(parsed.knowledgeSources);
          }
        } catch { /* ignore */ }
      }
      if (a.scope_config) {
        try { const parsed = JSON.parse(a.scope_config); setScopeConfig({ selectedThemes: Array.isArray(parsed.selectedThemes) ? parsed.selectedThemes : [] }); } catch { /* ignore */ }
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

  // ── Evidence document upload ─────────────────────────────────────────────────
  const handleEvidenceUpload = useCallback(async (fileList: FileList | File[]) => {
    for (const file of Array.from(fileList)) {
      const tempId = crypto.randomUUID();
      setEvidenceDocs(prev => [...prev, { id: tempId, name: file.name, size: file.size, status: 'uploading' }]);
      try {
        const result = await uploadFile(file);
        setEvidenceDocs(prev => prev.map(d => d.id === tempId ? { ...d, id: result.id, status: 'done' as const, text: result.text || '' } : d));
      } catch {
        setEvidenceDocs(prev => prev.map(d => d.id === tempId ? { ...d, status: 'error' as const } : d));
      }
    }
  }, []);

  const removeEvidenceDoc = useCallback((docId: string) => {
    setEvidenceDocs(prev => prev.filter(d => d.id !== docId));
  }, []);

  // ── Iteration document upload ──────────────────────────────────────────────
  const handleIterationDocUpload = useCallback(async (fileList: FileList | File[]) => {
    for (const file of Array.from(fileList)) {
      const tempId = crypto.randomUUID();
      setIterationDocs(prev => [...prev, { id: tempId, name: file.name, size: file.size, status: 'uploading' }]);
      try {
        const result = await uploadFile(file);
        setIterationDocs(prev => prev.map(d => d.id === tempId ? { ...d, id: result.id, status: 'done' as const, text: result.text || '' } : d));
      } catch {
        setIterationDocs(prev => prev.map(d => d.id === tempId ? { ...d, status: 'error' as const } : d));
      }
    }
  }, []);

  const addInterview = useCallback(() => {
    setInterviews(prev => [...prev, { id: crypto.randomUUID(), role: '', notes: '' }]);
  }, []);

  const updateInterview = useCallback((intId: string, field: 'role' | 'notes', value: string) => {
    setInterviews(prev => prev.map(i => i.id === intId ? { ...i, [field]: value } : i));
  }, []);

  const removeInterview = useCallback((intId: string) => {
    setInterviews(prev => prev.filter(i => i.id !== intId));
  }, []);

  // ── Save context ───────────────────────────────────────────────────────────
  const saveContext = async () => {
    if (!id) return;
    // Build enriched context with document text + interview notes
    const docTexts = evidenceDocs
      .filter(d => d.status === 'done' && d.text)
      .map(d => `### DOCUMENT: ${d.name}\n${d.text}`);
    const interviewTexts = interviews
      .filter(i => i.notes.trim())
      .map(i => `### INTERVIEW: ${i.role || 'Unknown role'}\n${i.notes}`);
    const enrichedContext = {
      ...contextConfig,
      documents: [...docTexts, ...interviewTexts].join('\n\n---\n\n'),
      documentFileIds: evidenceDocs.filter(d => d.status === 'done').map(d => d.id),
      interviewCount: interviews.filter(i => i.notes.trim()).length,
      knowledgeSources,
    };
    // Only advance to step 4 if we haven't already passed it
    const nextStep = Math.max(currentStep, 4);
    await fetchWithAuth(`/api/gap-assessments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_config: enrichedContext, scope_config: scopeConfig, current_step: nextStep }),
    });
    goToStep(nextStep);
  };

  // ── Run assessment (SSE) ───────────────────────────────────────────────────
  const runAssessment = async () => {
    if (!id || isRunning) return;
    setIsRunning(true);
    setProgressEvents([]);

    try {
      const response = await fetchWithAuth(`/api/gap-assessments/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
              goToStep(5);
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
    await fetchWithAuth(`/api/gap-assessments/${id}`, { method: 'DELETE' });
    navigate('/gap-assessment');
  };

  // ── Synthesise capability ──────────────────────────────────────────────────
  const runSynthesis = async () => {
    if (!id) return;
    setActionLoading('synthesise');
    setActionError('');
    try {
      const r = await fetchWithAuth(`/api/gap-assessments/${id}/synthesise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) { setActionError('Synthesis failed — please retry.'); return; }
      const { capabilities: caps, reasoning } = await r.json();
      setCapabilities(caps);
      if (reasoning) setSynthesisReasoning(reasoning);
      goToStep(6);
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
      const r = await fetchWithAuth(`/api/gap-assessments/${id}/board-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) { setActionError('Board summary failed — please retry.'); return; }
      const { boardSummary: bs, reasoning } = await r.json();
      setBoardSummary(bs);
      if (reasoning) setBoardReasoning(reasoning);
      goToStep(7);
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
      const r = await fetchWithAuth(`/api/gap-assessments/${id}/roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) { setActionError('Roadmap generation failed — please retry.'); return; }
      const { roadmap: rm, reasoning } = await r.json();
      setRoadmap(rm);
      if (reasoning) setRoadmapReasoning(reasoning);
      goToStep(8);
    } catch (err) {
      setActionError(`Roadmap error: ${String(err)}`);
    } finally {
      setActionLoading('');
    }
  };

  // ── Markdown builders (reused for multi-format export) ─────────────────────
  const buildFindingsMarkdown = useCallback(() => {
    const title = assessment?.title || 'Gap Assessment';
    const date = new Date().toISOString().slice(0, 10);
    let md = `# Gap Assessment Findings — ${title}\n\n**Date:** ${date}\n\n`;
    md += `## Score Summary\n\n`;
    md += `| Score | Count |\n|---|---|\n`;
    md += `| Red | ${findings.filter(f => f.score === 'red').length} |\n`;
    md += `| Amber | ${findings.filter(f => f.score === 'amber').length} |\n`;
    md += `| Yellow | ${findings.filter(f => f.score === 'yellow').length} |\n`;
    md += `| Green | ${findings.filter(f => f.score === 'green').length} |\n\n`;
    const avg = findings.length > 0 ? Math.round(findings.reduce((s, f) => s + (f.numericScore || 0), 0) / findings.length) : 0;
    md += `**Overall Compliance Score:** ${avg}%\n\n`;
    md += `## Findings Overview\n\n`;
    md += `| Framework | Article | Title | Score | % | Priority |\n`;
    md += `|---|---|---|---|---|---|\n`;
    for (const f of findings) {
      md += `| ${f.framework} | ${f.articleId} | ${f.articleTitle || ''} | ${f.score} | ${f.numericScore || 0}% | ${f.priority} |\n`;
    }

    md += `\n\n## Detailed Findings\n\n`;
    for (const f of findings) {
      md += `### ${f.articleId} — ${f.articleTitle || 'Untitled'}\n\n`;
      md += `**Framework:** ${f.framework} | **Score:** ${f.score} (${f.numericScore || 0}%) | **Priority:** ${f.priority}\n\n`;
      if (f.requirement) {
        md += `#### Requirement\n\n${f.requirement}\n\n`;
      }
      if (f.currentState) {
        md += `#### Current State\n\n${f.currentState}\n\n`;
      }
      if (f.notes) {
        md += `#### Gaps & Recommendations\n\n${f.notes}\n\n`;
      }
      md += `---\n\n`;
    }
    return md;
  }, [findings, assessment]);

  const buildCapabilityMarkdown = useCallback(() => {
    let md = `# Capability Assessment Report — ${assessment?.title || 'Gap Assessment'}\n\n`;
    md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n\n---\n\n`;
    for (const cap of capabilities) {
      const sevLabel = cap.gapSeverity.charAt(0).toUpperCase() + cap.gapSeverity.slice(1);
      md += `## ${cap.name}\n\n`;
      md += `**Maturity Score:** ${cap.maturityScore}/5 | **Gap Severity:** ${sevLabel} | **Affected Articles:** ${cap.affectedArticles.join(', ')}\n\n`;
      md += `${cap.description}\n\n`;
      if (cap.regulatoryRequirement) md += `### What the Regulation Requires\n\n${cap.regulatoryRequirement}\n\n`;
      if (cap.gapAnalysis) md += `### Gap Analysis\n\n${cap.gapAnalysis}\n\n`;
      if (cap.importanceToClose) md += `### Why Closing This Gap Matters\n\n${cap.importanceToClose}\n\n`;
      if (cap.strengths) md += `### What We Do Well\n\n${cap.strengths}\n\n`;
      if (cap.areasToImprove) md += `### Areas to Improve\n\n${cap.areasToImprove}\n\n`;
      if (cap.goodOutcome) md += `### What Good Looks Like\n\n${cap.goodOutcome}\n\n`;
      if (cap.designActions) md += `### Design Phase Actions\n\n${cap.designActions}\n\n`;
      if (cap.implementationActions) md += `### Implementation Phase Actions\n\n${cap.implementationActions}\n\n`;
      if (cap.testingVerification) md += `### Testing & Verification\n\n${cap.testingVerification}\n\n`;
      if (cap.keyGaps.length > 0) md += `### Key Gaps\n\n${cap.keyGaps.map(g => `- ${g}`).join('\n')}\n\n`;
      if (cap.quickWins.length > 0) md += `### Quick Wins\n\n${cap.quickWins.map(w => `- ${w}`).join('\n')}\n\n`;
      if (cap.crossRegImpact) md += `### Cross-Regulatory Impact\n\n${cap.crossRegImpact}\n\n`;
      md += `---\n\n`;
    }
    return md;
  }, [capabilities, assessment]);

  const buildBoardMarkdown = useCallback(() => {
    return `# Board / ExCo Summary — ${assessment?.title || 'Gap Assessment'}\n\n**Date:** ${new Date().toISOString().slice(0, 10)}\n\n---\n\n${boardSummary}`;
  }, [boardSummary, assessment]);

  const buildRoadmapMarkdown = useCallback(() => {
    let md = `# Remediation Roadmap — ${assessment?.title || 'Gap Assessment'}\n\n`;
    if (roadmap?.phases) {
      for (const phase of roadmap.phases) {
        md += `## ${phase.name} (${phase.timeframe})\n${phase.objective}\n\n`;
        for (const item of phase.items) {
          md += `### ${item.title}\n- **Owner:** ${item.owner}\n- **Effort:** ${item.effort}\n- **Priority:** ${item.priority}\n- ${item.description}\n`;
          if (item.rationale) md += `- **Rationale:** ${item.rationale}\n`;
          if (item.regulatoryDeadline) md += `- **Regulatory Deadline:** ${item.regulatoryDeadline}\n`;
          if (item.riskIfDelayed) md += `- **Risk If Delayed:** ${item.riskIfDelayed}\n`;
          if (item.resourceRequirements) md += `- **Resources:** ${item.resourceRequirements}\n`;
          if (item.successMetrics) md += `- **Success Metrics:** ${item.successMetrics}\n`;
          md += '\n';
        }
      }
    }
    if (roadmap?.estimatedFTE) md += `## Estimated FTE\n${roadmap.estimatedFTE}\n\n`;
    if (roadmap?.estimatedBudget) md += `## Estimated Budget\n${roadmap.estimatedBudget}\n\n`;
    if (roadmap?.keyRisks?.length) md += `## Key Risks\n${roadmap.keyRisks.map(r => `- ${r}`).join('\n')}\n\n`;
    if (roadmap?.governanceModel) md += `## Governance Model\n${roadmap.governanceModel}\n\n`;
    return md;
  }, [roadmap, assessment]);

  const buildFullAssessmentMarkdown = useCallback(() => {
    let md = `# Complete Gap Assessment Report — ${assessment?.title || 'Gap Assessment'}\n\n`;
    md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n\n`;
    if (iterations.length > 0) md += `**Iteration:** ${iterations.length + 1}\n\n`;
    md += `---\n\n`;
    if (findings.length > 0) { md += buildFindingsMarkdown() + '\n\n---\n\n'; }
    if (capabilities.length > 0) { md += buildCapabilityMarkdown() + '\n\n---\n\n'; }
    if (boardSummary) { md += buildBoardMarkdown() + '\n\n---\n\n'; }
    if (roadmap) { md += buildRoadmapMarkdown(); }
    return md;
  }, [findings, capabilities, boardSummary, roadmap, iterations, assessment, buildFindingsMarkdown, buildCapabilityMarkdown, buildBoardMarkdown, buildRoadmapMarkdown]);

  // ── Iteration management ──────────────────────────────────────────────────
  const loadIterations = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetchWithAuth(`/api/gap-assessments/${id}/iterations`);
      if (r.ok) {
        const data = await r.json();
        setIterations(data.iterations || []);
      }
    } catch { /* ignore */ }
  }, [id]);

  const createSnapshot = async () => {
    if (!id) return;
    try {
      // Merge any new iteration docs into the main evidence pool
      const newDocs = iterationDocs.filter(d => d.status === 'done');
      if (newDocs.length > 0) {
        setEvidenceDocs(prev => [...prev, ...newDocs]);
      }
      const allDocNames = [...evidenceDocs, ...newDocs].filter(d => d.status === 'done').map(d => d.name).join(', ');
      const iterDocNames = newDocs.map(d => d.name).join(', ');
      const r = await fetchWithAuth(`/api/gap-assessments/${id}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: iterationNotes,
          evidenceSummary: allDocNames || undefined,
          newDocuments: iterDocNames || undefined,
        }),
      });
      if (r.ok) {
        await loadIterations();
        setIterationNotes('');
        setIterationDocs([]);
        setShowIterationPanel(false);
      }
    } catch (err) {
      setActionError(`Snapshot error: ${String(err)}`);
    }
  };

  const compareIterationPair = async (a: string, b: string) => {
    if (!id) return;
    setComparingIters({ a, b });
    try {
      const r = await fetchWithAuth(`/api/gap-assessments/${id}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iterationA: a, iterationB: b }),
      });
      if (r.ok) {
        const data = await r.json();
        setComparison(data);
      }
    } catch { /* ignore */ }
    setComparingIters(null);
  };

  // Load iterations when assessment loads
  useEffect(() => { loadIterations(); }, [loadIterations]);

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

  if (!assessment) return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-adv-dark text-adv-off-white">
      <ClipboardCheck className="h-12 w-12 text-adv-gray" />
      <p className="text-lg font-medium">Assessment not found</p>
      <p className="text-sm text-adv-gray">It may have been deleted or could not be loaded.</p>
      <button onClick={() => navigate('/gap-assessment')} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-white hover:bg-adv-teal-dark transition-colors">
        Back to Gap Assessment
      </button>
    </div>
  );

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
                onClick={() => maxStepReached >= step.id && setCurrentStep(step.id)}
                disabled={maxStepReached < step.id}
                className="disabled:cursor-not-allowed"
              >
                <StepIndicator step={step} current={currentStep} maxReached={maxStepReached} />
              </button>
              {i < STEPS.length - 1 && (
                <div className={`mx-1 h-0.5 w-6 rounded-full ${maxStepReached > step.id ? 'bg-adv-green' : 'bg-border'}`} />
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
                      <span key={t} className="rounded-full bg-adv-dark px-2 py-0.5 text-xs text-adv-gray">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => goToStep(2)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
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
                  {(fw.themes || []).map(theme => (
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
                        {theme} — {(fw.articles || []).filter(a => a.theme === theme).length} articles
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
              <button onClick={() => goToStep(3)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
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
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
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
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  placeholder="e.g. Sweden, Finland, EU"
                  value={contextConfig.jurisdiction}
                  onChange={e => setContextConfig(c => ({ ...c, jurisdiction: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-adv-gray">Customer segments</label>
                <input
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
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
                <div className="flex justify-between text-[11px] text-adv-gray">
                  <span>1 — Initial</span><span>3 — Defined</span><span>5 — Optimising</span>
                </div>
                <p className="mt-1 text-xs text-adv-teal font-medium">{MATURITY_LABELS[contextConfig.maturity]} ({contextConfig.maturity}/5)</p>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-adv-gray">Known concerns or focus areas (optional)</label>
              <textarea
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                placeholder="e.g. Recent FIU feedback on TM alert quality, new CASP business line, upcoming supervisory review..."
                value={contextConfig.concerns}
                onChange={e => setContextConfig(c => ({ ...c, concerns: e.target.value }))}
              />
            </div>

            {/* ── AI Model Tier ─────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <label className="mb-2 block text-xs font-medium text-adv-gray">AI Analysis Depth</label>
              <p className="text-[11px] text-adv-gray mb-3">Choose the AI model for all assessment stages. Opus provides deeper reasoning but costs more and takes longer.</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setContextConfig(c => ({ ...c, modelTier: 'sonnet' }))}
                  className={`rounded-lg border p-3 text-left transition-all ${contextConfig.modelTier === 'sonnet' ? 'border-adv-teal bg-adv-teal/10' : 'border-border hover:border-adv-gray'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`h-2.5 w-2.5 rounded-full ${contextConfig.modelTier === 'sonnet' ? 'bg-adv-teal' : 'bg-adv-gray/40'}`} />
                    <span className="text-sm font-medium text-adv-off-white">Sonnet 4.6</span>
                  </div>
                  <p className="text-[11px] text-adv-gray leading-snug">Fast &amp; thorough. Deep thinking (32K budget) on every stage. Good for standard assessments.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setContextConfig(c => ({ ...c, modelTier: 'opus' }))}
                  className={`rounded-lg border p-3 text-left transition-all ${contextConfig.modelTier === 'opus' ? 'border-adv-teal bg-adv-teal/10' : 'border-border hover:border-adv-gray'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`h-2.5 w-2.5 rounded-full ${contextConfig.modelTier === 'opus' ? 'bg-adv-teal' : 'bg-adv-gray/40'}`} />
                    <span className="text-sm font-medium text-adv-off-white">Opus 4.6</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-adv-gold/20 text-adv-gold font-medium">Deep</span>
                  </div>
                  <p className="text-[11px] text-adv-gray leading-snug">Maximum reasoning depth. Adaptive thinking at full effort. Best for critical, company-shaping assessments.</p>
                </button>
              </div>
            </div>

            {/* ── Evidence Documents ─────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="h-4 w-4 text-adv-teal" />
                <h3 className="text-sm font-semibold text-adv-off-white">Evidence Documents</h3>
                <span className="text-xs text-adv-gray">(optional)</span>
              </div>
              <p className="mb-3 text-xs text-adv-gray">
                Upload policies, procedures, audit reports, screening configs, or any documents Claude should assess against the regulation.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleEvidenceUpload(e.dataTransfer.files); }}
                className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors cursor-pointer ${isDragging ? 'border-adv-teal bg-adv-teal/5' : 'border-border hover:border-adv-teal/40'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto mb-2 h-6 w-6 text-adv-gray" />
                <p className="text-xs text-adv-gray">
                  Drag & drop files here, or <span className="text-adv-teal font-medium">click to browse</span>
                </p>
                <p className="mt-1 text-[11px] text-adv-gray">PDF, DOCX, XLSX, TXT, CSV, HTML — up to 50 MB each</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.xlsx,.csv,.txt,.md,.html"
                className="hidden"
                onChange={e => { if (e.target.files?.length) { handleEvidenceUpload(e.target.files); e.target.value = ''; } }}
              />

              {/* Uploaded files */}
              {evidenceDocs.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {evidenceDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-lg bg-adv-dark px-3 py-2">
                      {doc.status === 'uploading' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-adv-teal shrink-0" />
                      ) : doc.status === 'error' ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-adv-red shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-adv-teal shrink-0" />
                      )}
                      <span className="flex-1 truncate text-xs text-adv-off-white">{doc.name}</span>
                      {doc.status === 'done' && doc.text && (
                        <span className="shrink-0 text-[11px] text-adv-gray">{Math.round(doc.text.length / 4).toLocaleString()} tok</span>
                      )}
                      {doc.status === 'error' && <span className="shrink-0 text-[11px] text-adv-red">Failed</span>}
                      <button type="button" onClick={() => removeEvidenceDoc(doc.id)} className="shrink-0 text-adv-gray hover:text-adv-red transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-adv-gray">
                    {evidenceDocs.filter(d => d.status === 'done').length} document{evidenceDocs.filter(d => d.status === 'done').length !== 1 ? 's' : ''} ready
                    {evidenceDocs.some(d => d.text) && (
                      <> — ~{Math.round(evidenceDocs.reduce((sum, d) => sum + (d.text?.length || 0), 0) / 4).toLocaleString()} tokens</>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* ── Interview Notes ────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-adv-teal" />
                  <h3 className="text-sm font-semibold text-adv-off-white">Interview Notes</h3>
                  <span className="text-xs text-adv-gray">(optional)</span>
                </div>
                <button type="button" onClick={addInterview} className="flex items-center gap-1 rounded-lg bg-adv-teal/10 px-2.5 py-1 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors">
                  <Paperclip className="h-3 w-3" /> Add Interview
                </button>
              </div>
              <p className="mb-3 text-xs text-adv-gray">
                Add notes from stakeholder interviews — Claude will use these as evidence when scoring each article.
              </p>

              {interviews.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-4 text-center">
                  <p className="text-xs text-adv-gray">No interview notes yet. Click &ldquo;Add Interview&rdquo; to record stakeholder observations.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {interviews.map((interview, idx) => (
                    <div key={interview.id} className="rounded-lg border border-border bg-adv-dark p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-medium text-adv-gray">Interview {idx + 1}</span>
                        <div className="flex-1">
                          <input
                            list={`role-list-${interview.id}`}
                            className="w-full rounded border border-border bg-adv-card px-2 py-1 text-xs text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                            placeholder="Role / title (e.g. MLRO, Head of AML Operations)"
                            value={interview.role}
                            onChange={e => updateInterview(interview.id, 'role', e.target.value)}
                          />
                          <datalist id={`role-list-${interview.id}`}>
                            {INTERVIEW_ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}
                          </datalist>
                        </div>
                        <button type="button" onClick={() => removeInterview(interview.id)} className="text-adv-gray hover:text-adv-red transition-colors" title="Remove interview">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        className="w-full resize-y rounded border border-border bg-adv-card px-2 py-1.5 text-xs text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                        placeholder={"Key observations, quotes, or findings from this interview...\n\ne.g. \"CDD refresh cycle is 3 years for all customers — no risk-based differentiation. TM rules last reviewed 2022. No dedicated sanctions screening for crypto counterparties.\""}
                        value={interview.notes}
                        onChange={e => updateInterview(interview.id, 'notes', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Knowledge Sources (RAG, Folders, Web Search) ───────── */}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <KnowledgeSourcePanel config={knowledgeSources} onChange={setKnowledgeSources} />
            </div>

            {/* Evidence summary */}
            {(evidenceDocs.some(d => d.status === 'done') || interviews.some(i => i.notes.trim()) || knowledgeSources.modes.localFolder.enabled || knowledgeSources.ragMode?.enabled || knowledgeSources.ragSearch?.enabled) && (
              <div className="rounded-lg bg-adv-teal/5 border border-adv-teal/20 px-4 py-2.5 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-adv-teal mt-0.5 shrink-0" />
                <div className="text-xs text-adv-off-white">
                  <span className="font-medium text-adv-teal">Evidence loaded: </span>
                  {evidenceDocs.filter(d => d.status === 'done').length > 0 && (
                    <>{evidenceDocs.filter(d => d.status === 'done').length} document{evidenceDocs.filter(d => d.status === 'done').length !== 1 ? 's' : ''}</>
                  )}
                  {evidenceDocs.filter(d => d.status === 'done').length > 0 && interviews.some(i => i.notes.trim()) && ' + '}
                  {interviews.filter(i => i.notes.trim()).length > 0 && (
                    <>{interviews.filter(i => i.notes.trim()).length} interview{interviews.filter(i => i.notes.trim()).length !== 1 ? 's' : ''}</>
                  )}
                  {(evidenceDocs.some(d => d.status === 'done') || interviews.some(i => i.notes.trim())) && (knowledgeSources.modes.localFolder.enabled || knowledgeSources.ragMode?.enabled || knowledgeSources.ragSearch?.enabled) && ' + '}
                  {knowledgeSources.modes.localFolder.enabled && <>{knowledgeSources.modes.localFolder.folderPaths.length} folder{knowledgeSources.modes.localFolder.folderPaths.length !== 1 ? 's' : ''}</>}
                  {knowledgeSources.ragMode?.enabled && <> + RAG search</>}
                  {knowledgeSources.ragSearch?.enabled && <> + Collections</>}
                  {knowledgeSources.modes.claudeKnowledge.webSearchEnabled && <> + Web search</>}
                  <span className="text-adv-gray"> — Claude will use all sources to produce specific, evidence-based gap findings.</span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setCurrentStep(2)} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button type="button" onClick={saveContext} disabled={evidenceDocs.some(d => d.status === 'uploading')} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors">
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
                  Maturity: {MATURITY_LABELS[contextConfig.maturity]} ({contextConfig.maturity}/5)<br />
                  Model: {contextConfig.modelTier === 'opus' ? 'Opus 4.6 (deep reasoning)' : 'Sonnet 4.6 (standard)'}
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
                        <span className="ml-auto text-adv-gray">{e.batchIndex + 1}/{e.totalBatches}</span>
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
                    <button onClick={() => goToStep(5)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
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
                <select className="rounded-lg border border-border bg-adv-card px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  value={filterScore} onChange={e => setFilterScore(e.target.value)}>
                  <option value="all">All scores</option>
                  <option value="red">🔴 Red</option>
                  <option value="amber">🟠 Amber</option>
                  <option value="yellow">🟡 Yellow</option>
                  <option value="green">🟢 Green</option>
                </select>
                <select className="rounded-lg border border-border bg-adv-card px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
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
                  <div className="text-xs text-adv-gray capitalize">{score}</div>
                </div>
              ))}
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-center">
                <div className="text-sm text-red-400">⚡</div>
                <div className="text-base font-bold text-red-400">{scoreSummary.critical}</div>
                <div className="text-xs text-adv-gray">Critical</div>
              </div>
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-2 text-center">
                <div className="text-sm text-orange-400">⬆</div>
                <div className="text-base font-bold text-orange-400">{scoreSummary.high}</div>
                <div className="text-xs text-adv-gray">High</div>
              </div>
            </div>

            {/* Average compliance score */}
            {findings.length > 0 && (
              <div className="rounded-xl border border-border bg-adv-card p-4 flex items-center gap-4">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${(() => { const avg = Math.round(findings.reduce((s, f) => s + (f.numericScore ?? 0), 0) / findings.length); return avg >= 75 ? 'text-adv-green' : avg >= 50 ? 'text-yellow-400' : avg >= 25 ? 'text-orange-400' : 'text-red-400'; })()}`}>
                    {Math.round(findings.reduce((s, f) => s + (f.numericScore ?? 0), 0) / findings.length)}
                  </div>
                  <div className="text-[11px] text-adv-gray">Avg. Score</div>
                </div>
                <div className="flex-1">
                  <div className="h-3 w-full rounded-full bg-adv-dark overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${(() => { const avg = Math.round(findings.reduce((s, f) => s + (f.numericScore ?? 0), 0) / findings.length); return avg >= 75 ? 'bg-adv-green' : avg >= 50 ? 'bg-yellow-400' : avg >= 25 ? 'bg-orange-400' : 'bg-red-400'; })()}`}
                      style={{ width: `${Math.round(findings.reduce((s, f) => s + (f.numericScore ?? 0), 0) / findings.length)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-adv-gray">
                    <span>0 — Non-compliant</span><span>50 — Partial</span><span>100 — Fully compliant</span>
                  </div>
                </div>
              </div>
            )}

            {/* Findings table */}
            <div className="overflow-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-adv-dark-2 text-adv-gray">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Article</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Current State</th>
                    <th className="px-3 py-2 text-left font-medium">Score</th>
                    <th className="px-3 py-2 text-left font-medium w-14">%</th>
                    <th className="px-3 py-2 text-left font-medium">Priority</th>
                    <th className="px-3 py-2 text-left font-medium">Notes</th>
                    <th className="px-3 py-2 text-left font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayFindings.map((f, i) => {
                    const rowKey = `${f.framework}-${f.articleId}-${i}`;
                    const isExpanded = expandedRow === rowKey;
                    const numScore = f.numericScore ?? 0;
                    const scoreColor = numScore >= 75 ? 'text-adv-green' : numScore >= 50 ? 'text-yellow-400' : numScore >= 25 ? 'text-orange-400' : 'text-red-400';
                    return (
                      <>
                        <tr
                          key={rowKey}
                          onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                          className={`border-t border-border cursor-pointer transition-colors ${isExpanded ? 'bg-adv-card' : 'hover:bg-adv-card/50'}`}
                        >
                          <td className="px-3 py-2 font-mono font-medium text-adv-teal whitespace-nowrap">{f.articleId}</td>
                          <td className="px-3 py-2 text-adv-off-white max-w-[120px] truncate" title={f.articleTitle}>{f.articleTitle}</td>
                          <td className="px-3 py-2 text-adv-gray max-w-[200px]">
                            <span className={isExpanded ? '' : 'line-clamp-2'}>{f.currentState}</span>
                          </td>
                          <td className="px-3 py-2"><ScoreBadge score={f.score} /></td>
                          <td className="px-3 py-2">
                            <span className={`font-bold ${scoreColor}`}>{numScore}</span>
                          </td>
                          <td className="px-3 py-2"><PriorityBadge priority={f.priority} /></td>
                          <td className="px-3 py-2 text-adv-gray max-w-[200px]">
                            <span className={isExpanded ? '' : 'line-clamp-2'}>{f.notes}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              to={`/counsels-desk?prefill=${encodeURIComponent(`Research ${f.framework} ${f.articleId}: ${f.articleTitle}`)}`}
                              title="Research in Counsel's Desk"
                              onClick={e => e.stopPropagation()}
                              className="flex h-6 w-6 items-center justify-center rounded text-adv-gray hover:text-adv-teal hover:bg-adv-teal-dim transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${rowKey}-detail`} className="bg-adv-card border-t border-adv-teal/20">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                  <h4 className="text-xs font-semibold text-adv-teal mb-1.5">Requirement</h4>
                                  <p className="text-xs text-adv-off-white leading-relaxed">{f.requirement}</p>
                                </div>
                                <div>
                                  <h4 className="text-xs font-semibold text-adv-teal mb-1.5">Compliance Score</h4>
                                  <div className="flex items-center gap-3">
                                    <div className={`text-2xl font-bold ${scoreColor}`}>{numScore}<span className="text-sm text-adv-gray">/100</span></div>
                                    <div className="flex-1">
                                      <div className="h-2.5 w-full rounded-full bg-adv-dark overflow-hidden">
                                        <div className={`h-full rounded-full ${numScore >= 75 ? 'bg-adv-green' : numScore >= 50 ? 'bg-yellow-400' : numScore >= 25 ? 'bg-orange-400' : 'bg-red-400'}`} style={{ width: `${numScore}%` }} />
                                      </div>
                                    </div>
                                    <ScoreBadge score={f.score} />
                                  </div>
                                </div>
                                <div className="sm:col-span-2">
                                  <h4 className="text-xs font-semibold text-adv-teal mb-1.5">Current State</h4>
                                  <p className="text-xs text-adv-off-white leading-relaxed">{f.currentState}</p>
                                </div>
                                <div className="sm:col-span-2">
                                  <h4 className="text-xs font-semibold text-adv-teal mb-1.5">Gaps & Recommendations</h4>
                                  <p className="text-xs text-adv-off-white leading-relaxed">{f.notes}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
              {displayFindings.length === 0 && (
                <div className="py-8 text-center text-sm text-adv-gray">No findings match the filter.</div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <ExportDropdown label="Export Findings" buildContent={buildFindingsMarkdown} filename={`findings-${assessment?.title || 'gap'}-${new Date().toISOString().slice(0, 10)}`} isExporting={isExporting} doExport={doExport} />
              {capabilities.length > 0 ? (
                <>
                  <button
                    onClick={() => setCurrentStep(6)}
                    className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                  >
                    <Layers className="h-4 w-4" /> View Capability Report <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={runSynthesis}
                    disabled={actionLoading === 'synthesise'}
                    className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-60"
                  >
                    {actionLoading === 'synthesise' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Re-synthesising…</> : <><RefreshCw className="h-3.5 w-3.5" /> Re-synthesise</>}
                  </button>
                </>
              ) : (
                <button
                  onClick={runSynthesis}
                  disabled={actionLoading === 'synthesise'}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-60 transition-colors"
                >
                  {actionLoading === 'synthesise' ? <><Loader2 className="h-4 w-4 animate-spin" /> Synthesising…</> : <><Layers className="h-4 w-4" /> Synthesise Capability View</>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 6: Capability view ────────────────────────────────────── */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-adv-off-white">Capability Assessment Report</h2>
                <p className="text-xs text-adv-gray">Article scores synthesised into cross-cutting organisational capabilities with detailed analysis</p>
              </div>
              <div className="flex items-center gap-2">
                {capabilities.length > 0 && (
                  <>
                    <div className="flex rounded-lg border border-border overflow-hidden">
                      <button onClick={() => setCapViewMode('text')} className={`px-3 py-1.5 text-xs ${capViewMode === 'text' ? 'bg-adv-teal text-adv-dark font-medium' : 'text-adv-gray hover:text-adv-off-white'}`}>
                        Detailed
                      </button>
                      <button onClick={() => setCapViewMode('cards')} className={`px-3 py-1.5 text-xs ${capViewMode === 'cards' ? 'bg-adv-teal text-adv-dark font-medium' : 'text-adv-gray hover:text-adv-off-white'}`}>
                        Cards
                      </button>
                    </div>
                    <ExportDropdown label="Export" buildContent={buildCapabilityMarkdown} filename={`capability-${assessment?.title || 'gap'}-${new Date().toISOString().slice(0, 10)}`} isExporting={isExporting} doExport={doExport} />
                  </>
                )}
                <button onClick={runSynthesis} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors">
                  <RefreshCw className="h-3.5 w-3.5" /> Re-run
                </button>
              </div>
            </div>

            {capabilities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-border bg-adv-card text-center">
                <Layers className="mb-3 h-10 w-10 text-adv-teal" />
                <p className="mb-4 text-sm text-adv-gray">Generate capability synthesis from article findings</p>
                <button onClick={runSynthesis} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                  <Layers className="h-4 w-4" /> Synthesise Capabilities
                </button>
              </div>
            ) : capViewMode === 'cards' ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {capabilities.map(cap => (
                    <div key={cap.id} onClick={() => { setExpandedCap(cap.id); setCapViewMode('text'); }} className={`rounded-xl border p-4 cursor-pointer hover:border-adv-teal/50 transition-colors ${cap.gapSeverity === 'critical' ? 'border-red-500/30 bg-red-500/5' : cap.gapSeverity === 'high' ? 'border-orange-500/30 bg-orange-500/5' : 'border-border bg-adv-card'}`}>
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
                          <p className="text-xs font-semibold text-adv-gray mb-1">Key Gaps</p>
                          <ul className="space-y-0.5">
                            {cap.keyGaps.slice(0, 2).map((g, i) => (
                              <li key={i} className="text-[11px] text-adv-off-white flex gap-1"><span className="text-red-400">&bull;</span>{g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {cap.quickWins.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-adv-gray mb-1">Quick Wins</p>
                          <ul className="space-y-0.5">
                            {cap.quickWins.slice(0, 1).map((w, i) => (
                              <li key={i} className="text-[11px] text-adv-teal flex gap-1">*{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Detailed text view — each capability as expandable section */}
                <div className="space-y-3">
                  {capabilities.map(cap => {
                    const isExpanded = expandedCap === cap.id;
                    const sevBorder = cap.gapSeverity === 'critical' ? 'border-l-red-500' : cap.gapSeverity === 'high' ? 'border-l-orange-500' : cap.gapSeverity === 'medium' ? 'border-l-yellow-500' : 'border-l-green-500';
                    const hasDetail = cap.regulatoryRequirement || cap.gapAnalysis || cap.goodOutcome;
                    return (
                      <div key={cap.id} className={`rounded-xl border border-border bg-adv-card border-l-4 ${sevBorder} overflow-hidden`}>
                        {/* Header — always visible */}
                        <button
                          onClick={() => setExpandedCap(isExpanded ? null : cap.id)}
                          className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-semibold text-adv-off-white">{cap.name}</h3>
                              <span className={`text-xs font-bold ${MATURITY_COLORS[Math.min(5, Math.max(1, cap.maturityScore))]}`}>{cap.maturityScore}/5</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cap.gapSeverity === 'critical' ? 'bg-red-500/20 text-red-400' : cap.gapSeverity === 'high' ? 'bg-orange-500/20 text-orange-400' : cap.gapSeverity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{cap.gapSeverity}</span>
                            </div>
                            <p className="text-xs text-adv-gray leading-relaxed">{cap.description}</p>
                            {!isExpanded && cap.keyGaps.length > 0 && (
                              <p className="mt-1 text-[11px] text-red-400 truncate">Gap: {cap.keyGaps[0]}</p>
                            )}
                          </div>
                          <ChevronDown className={`h-4 w-4 text-adv-gray shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="border-t border-border px-5 py-4 space-y-5">
                            {/* Regulatory Requirement */}
                            {cap.regulatoryRequirement && (
                              <div>
                                <h4 className="text-xs font-bold text-adv-teal uppercase tracking-wider mb-2">What the Regulation Requires</h4>
                                <p className="text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.regulatoryRequirement}</p>
                              </div>
                            )}

                            {/* Gap Analysis */}
                            {cap.gapAnalysis && (
                              <div>
                                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Gap Analysis</h4>
                                <p className="text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.gapAnalysis}</p>
                              </div>
                            )}

                            {/* Importance */}
                            {cap.importanceToClose && (
                              <div>
                                <h4 className="text-xs font-bold text-adv-gold uppercase tracking-wider mb-2">Why Closing This Gap Matters</h4>
                                <p className="text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.importanceToClose}</p>
                              </div>
                            )}

                            {/* Strengths + Areas to Improve — side by side on wider screens */}
                            {(cap.strengths || cap.areasToImprove) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {cap.strengths && (
                                  <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3">
                                    <h4 className="text-xs font-bold text-green-400 uppercase tracking-wider mb-2">What We Do Well</h4>
                                    <p className="text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.strengths}</p>
                                  </div>
                                )}
                                {cap.areasToImprove && (
                                  <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
                                    <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Areas to Improve</h4>
                                    <p className="text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.areasToImprove}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Good Outcome */}
                            {cap.goodOutcome && (
                              <div className="rounded-lg bg-adv-teal-soft border border-adv-teal/20 p-3">
                                <h4 className="text-xs font-bold text-adv-teal uppercase tracking-wider mb-2">What Good Looks Like</h4>
                                <p className="text-sm text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.goodOutcome}</p>
                              </div>
                            )}

                            {/* Design / Implementation / Testing — three-phase view */}
                            {(cap.designActions || cap.implementationActions || cap.testingVerification) && (
                              <div>
                                <h4 className="text-xs font-bold text-adv-off-white uppercase tracking-wider mb-3">Remediation Phases</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {cap.designActions && (
                                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                                      <div className="flex items-center gap-1.5 mb-2">
                                        <div className="h-2 w-2 rounded-full bg-blue-400" />
                                        <h5 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Design</h5>
                                      </div>
                                      <p className="text-[13px] text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.designActions}</p>
                                    </div>
                                  )}
                                  {cap.implementationActions && (
                                    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                                      <div className="flex items-center gap-1.5 mb-2">
                                        <div className="h-2 w-2 rounded-full bg-purple-400" />
                                        <h5 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Implementation</h5>
                                      </div>
                                      <p className="text-[13px] text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.implementationActions}</p>
                                    </div>
                                  )}
                                  {cap.testingVerification && (
                                    <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3">
                                      <div className="flex items-center gap-1.5 mb-2">
                                        <div className="h-2 w-2 rounded-full bg-teal-400" />
                                        <h5 className="text-xs font-bold text-teal-400 uppercase tracking-wider">Testing & Verification</h5>
                                      </div>
                                      <p className="text-[13px] text-adv-off-white leading-relaxed whitespace-pre-wrap">{cap.testingVerification}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Key Gaps + Quick Wins */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {cap.keyGaps.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-bold text-adv-gray uppercase tracking-wider mb-2">Key Gaps</h4>
                                  <ul className="space-y-1">
                                    {cap.keyGaps.map((g, i) => (
                                      <li key={i} className="text-sm text-adv-off-white flex gap-2"><span className="text-red-400 shrink-0">&bull;</span><span>{g}</span></li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {cap.quickWins.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-bold text-adv-teal uppercase tracking-wider mb-2">Quick Wins (&lt;3 months)</h4>
                                  <ul className="space-y-1">
                                    {cap.quickWins.map((w, i) => (
                                      <li key={i} className="text-sm text-adv-teal flex gap-2"><span className="shrink-0">*</span><span>{w}</span></li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Cross-regulatory impact */}
                            {cap.crossRegImpact && (
                              <div className="rounded-lg bg-adv-gold/5 border border-adv-gold/20 p-3">
                                <h4 className="text-xs font-bold text-adv-gold uppercase tracking-wider mb-2">Cross-Regulatory Impact</h4>
                                <p className="text-sm text-adv-off-white leading-relaxed">{cap.crossRegImpact}</p>
                              </div>
                            )}

                            {/* Affected articles */}
                            {cap.affectedArticles.length > 0 && (
                              <p className="text-[11px] text-adv-gray">Affected articles: {cap.affectedArticles.join(', ')}</p>
                            )}
                          </div>
                        )}

                        {/* Collapsed fallback for capabilities without extended data */}
                        {!isExpanded && !hasDetail && (
                          <div className="px-5 pb-3 space-y-1">
                            {cap.keyGaps.slice(0, 2).map((g, i) => (
                              <p key={i} className="text-[11px] text-adv-off-white flex gap-1"><span className="text-red-400">&bull;</span>{g}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {capabilities.length > 0 && (
              <>
                {synthesisReasoning && (
                  <details className="rounded-xl border border-adv-teal/20 bg-adv-teal-soft">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-adv-teal select-none">AI Reasoning &mdash; How Claude synthesised capabilities</summary>
                    <div className="border-t border-adv-teal/20 px-4 py-3 text-xs text-adv-gray leading-relaxed whitespace-pre-wrap">{synthesisReasoning}</div>
                  </details>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setCurrentStep(5)} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                    <ChevronLeft className="h-4 w-4" /> Scoring
                  </button>
                  <ExportDropdown label="Export Capability Report" buildContent={buildCapabilityMarkdown} filename={`capability-${assessment?.title || 'gap'}-${new Date().toISOString().slice(0, 10)}`} isExporting={isExporting} doExport={doExport} />
                  {boardSummary ? (
                    <>
                      <button onClick={() => setCurrentStep(7)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                        <FileText className="h-4 w-4" /> View Board Summary <ChevronRight className="h-4 w-4" />
                      </button>
                      <button onClick={runBoardSummary} disabled={actionLoading === 'board'} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-60">
                        {actionLoading === 'board' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating…</> : <><RefreshCw className="h-3.5 w-3.5" /> Re-generate</>}
                      </button>
                    </>
                  ) : (
                    <button onClick={runBoardSummary} disabled={actionLoading === 'board'} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-60">
                      {actionLoading === 'board' ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating Board Summary…</> : <><FileText className="h-4 w-4" /> Generate Board Summary</>}
                    </button>
                  )}
                </div>
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
                <button onClick={runBoardSummary} disabled={actionLoading === 'board'} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-60">
                  {actionLoading === 'board' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating…</> : <><RefreshCw className="h-3.5 w-3.5" /> Re-generate</>}
                </button>
              </div>
            </div>

            {!boardSummary ? (
              <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-border bg-adv-card text-center">
                <FileText className="mb-3 h-10 w-10 text-adv-teal" />
                <p className="mb-4 text-sm text-adv-gray">Generate board-ready one-page summary</p>
                <button onClick={runBoardSummary} disabled={actionLoading === 'board'} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-60">
                  {actionLoading === 'board' ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating Board Summary…</> : <><FileText className="h-4 w-4" /> Generate Board Summary</>}
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-adv-card p-5">
                  <div className="prose prose-sm prose-invert max-w-none text-adv-off-white">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{boardSummary}</ReactMarkdown>
                  </div>
                </div>
                {boardReasoning && (
                  <details className="rounded-xl border border-adv-teal/20 bg-adv-teal-soft">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-adv-teal select-none">AI Reasoning &mdash; How Claude arrived at this summary</summary>
                    <div className="border-t border-adv-teal/20 px-4 py-3 text-xs text-adv-gray leading-relaxed whitespace-pre-wrap">{boardReasoning}</div>
                  </details>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setCurrentStep(6)} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                    <ChevronLeft className="h-4 w-4" /> Capabilities
                  </button>
                  <ExportDropdown label="Export Board Summary" buildContent={buildBoardMarkdown} filename={`board-summary-${assessment?.title || 'gap'}-${new Date().toISOString().slice(0, 10)}`} isExporting={isExporting} doExport={doExport} />
                  {roadmap ? (
                    <>
                      <button onClick={() => setCurrentStep(8)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                        <Map className="h-4 w-4" /> View Roadmap <ChevronRight className="h-4 w-4" />
                      </button>
                      <button onClick={runRoadmap} disabled={actionLoading === 'roadmap'} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-60">
                        {actionLoading === 'roadmap' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating…</> : <><RefreshCw className="h-3.5 w-3.5" /> Re-generate</>}
                      </button>
                    </>
                  ) : (
                    <button onClick={runRoadmap} disabled={actionLoading === 'roadmap'} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-60">
                      {actionLoading === 'roadmap' ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating Roadmap…</> : <><Map className="h-4 w-4" /> Generate Roadmap</>}
                    </button>
                  )}
                </div>
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
              <button onClick={runRoadmap} disabled={actionLoading === 'roadmap'} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-60">
                {actionLoading === 'roadmap' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating…</> : <><RefreshCw className="h-3.5 w-3.5" /> Re-generate</>}
              </button>
            </div>

            {!roadmap ? (
              <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-border bg-adv-card text-center">
                <Map className="mb-3 h-10 w-10 text-adv-teal" />
                <p className="mb-4 text-sm text-adv-gray">Generate phased remediation roadmap</p>
                <button onClick={runRoadmap} disabled={actionLoading === 'roadmap'} className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-60">
                  {actionLoading === 'roadmap' ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating Roadmap…</> : <><Map className="h-4 w-4" /> Generate Roadmap</>}
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
                          <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${item.priority === 'critical' ? 'bg-red-500/20 text-red-400' : item.priority === 'high' ? 'bg-orange-500/20 text-orange-400' : 'bg-adv-dark text-adv-gray'}`}>
                            {item.effort}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-adv-off-white">{item.title}</p>
                            <p className="mt-0.5 text-[11px] text-adv-gray line-clamp-2">{item.description}</p>
                          </div>
                          <span className="shrink-0 text-xs text-adv-gray">{item.owner}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {roadmap && (roadmap.estimatedFTE || roadmap.keyRisks?.length) && (
                  <div className="rounded-xl border border-border bg-adv-card p-4">
                    <h3 className="mb-2 text-sm font-semibold text-adv-off-white">Programme Overview</h3>
                    {roadmap.estimatedFTE && (
                      <p className="text-xs text-adv-gray">Estimated FTE: <span className="text-adv-off-white">{roadmap.estimatedFTE}</span></p>
                    )}
                    {roadmap.estimatedBudget && (
                      <p className="mt-1 text-xs text-adv-gray">Estimated Budget: <span className="text-adv-off-white">{roadmap.estimatedBudget}</span></p>
                    )}
                    {roadmap.governanceModel && (
                      <p className="mt-1 text-xs text-adv-gray">Governance: <span className="text-adv-off-white">{roadmap.governanceModel}</span></p>
                    )}
                    {roadmap.reportingCadence && (
                      <p className="mt-1 text-xs text-adv-gray">Reporting: <span className="text-adv-off-white">{roadmap.reportingCadence}</span></p>
                    )}
                    {roadmap.keyRisks && roadmap.keyRisks.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-adv-gray mb-1">Key risks if delayed:</p>
                        <ul className="space-y-1">
                          {roadmap.keyRisks.map((r, i) => (
                            <li key={i} className="text-xs text-adv-off-white flex gap-1.5"><AlertTriangle className="h-3 w-3 text-adv-gold shrink-0 mt-0.5" />{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {roadmapReasoning && (
                  <details className="rounded-xl border border-adv-teal/20 bg-adv-teal-soft">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-adv-teal select-none">AI Reasoning &mdash; How Claude built this roadmap</summary>
                    <div className="border-t border-adv-teal/20 px-4 py-3 text-xs text-adv-gray leading-relaxed whitespace-pre-wrap">{roadmapReasoning}</div>
                  </details>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentStep(7)} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                    <ChevronLeft className="h-4 w-4" /> Board Summary
                  </button>
                  <ExportDropdown label="Export Roadmap" buildContent={buildRoadmapMarkdown} filename={`roadmap-${assessment?.title || 'gap'}-${new Date().toISOString().slice(0, 10)}`} isExporting={isExporting} doExport={doExport} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Full Export + Iteration Panel (visible from step 5+) ─────────── */}
        {currentStep >= 5 && findings.length > 0 && (
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            {/* Full assessment export */}
            <div className="flex items-center gap-3 flex-wrap">
              <ExportDropdown
                label="Export Complete Assessment"
                buildContent={buildFullAssessmentMarkdown}
                filename={`full-assessment-${assessment?.title || 'gap'}-${new Date().toISOString().slice(0, 10)}`}
                isExporting={isExporting}
                doExport={doExport}
              />
              <button
                onClick={() => setShowIterationPanel(!showIterationPanel)}
                className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal-soft px-4 py-2.5 text-sm text-adv-teal hover:bg-adv-teal/10 transition-colors"
              >
                <RotateCcw className="h-4 w-4" /> {showIterationPanel ? 'Hide Iteration Panel' : `New Iteration${iterations.length > 0 ? ` (${iterations.length} previous)` : ''}`}
              </button>
            </div>

            {/* Iteration history */}
            {iterations.length > 0 && (
              <div className="rounded-xl border border-border bg-adv-card p-4">
                <h3 className="text-sm font-semibold text-adv-off-white mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-adv-teal" /> Assessment History
                </h3>
                <div className="space-y-2">
                  {iterations.map((iter, idx) => (
                    <div key={iter.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-adv-dark-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-adv-teal">Iteration {iter.iterationNumber}</span>
                          <span className="text-[10px] text-adv-gray">{new Date(iter.createdAt).toLocaleDateString()}</span>
                          <span className={`text-xs font-bold ${iter.scoreSummary.avg >= 75 ? 'text-adv-green' : iter.scoreSummary.avg >= 50 ? 'text-yellow-400' : iter.scoreSummary.avg >= 25 ? 'text-orange-400' : 'text-red-400'}`}>
                            {iter.scoreSummary.avg}%
                          </span>
                        </div>
                        {iter.notes && <p className="text-[11px] text-adv-gray truncate mt-0.5">{iter.notes}</p>}
                        <div className="flex gap-2 mt-0.5">
                          <span className="text-[10px] text-red-400">{iter.scoreSummary.red} red</span>
                          <span className="text-[10px] text-orange-400">{iter.scoreSummary.amber} amber</span>
                          <span className="text-[10px] text-yellow-400">{iter.scoreSummary.yellow} yellow</span>
                          <span className="text-[10px] text-adv-green">{iter.scoreSummary.green} green</span>
                        </div>
                      </div>
                      {idx > 0 && (
                        <button
                          onClick={() => compareIterationPair(iterations[idx - 1].id, iter.id)}
                          disabled={!!comparingIters}
                          className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors shrink-0"
                        >
                          <GitCompare className="h-3.5 w-3.5" /> Compare
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Comparison result */}
                {comparison && (
                  <div className="mt-4 rounded-xl border border-adv-teal/20 bg-adv-teal-soft p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-adv-teal">Iteration Comparison</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-adv-card border border-border p-3 text-center">
                        <p className="text-2xl font-bold text-adv-off-white">{comparison.overallDelta.before}% → {comparison.overallDelta.after}%</p>
                        <p className={`text-sm font-medium ${comparison.overallDelta.change >= 0 ? 'text-adv-green' : 'text-red-400'}`}>
                          {comparison.overallDelta.change >= 0 ? '+' : ''}{comparison.overallDelta.change}% overall
                        </p>
                      </div>
                      <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3 text-center">
                        <p className="text-2xl font-bold text-adv-green flex items-center justify-center gap-1"><TrendingUp className="h-5 w-5" /> {comparison.totalImproved}</p>
                        <p className="text-xs text-adv-gray">Articles improved</p>
                      </div>
                      <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3 text-center">
                        <p className="text-2xl font-bold text-red-400 flex items-center justify-center gap-1"><TrendingDown className="h-5 w-5" /> {comparison.totalWorsened}</p>
                        <p className="text-xs text-adv-gray">Articles worsened</p>
                      </div>
                    </div>
                    {comparison.improved.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-adv-green mb-1">Top Improvements</p>
                        {comparison.improved.slice(0, 5).map(a => (
                          <p key={a.articleId} className="text-xs text-adv-off-white">
                            {a.articleId} {a.articleTitle ? `— ${a.articleTitle}` : ''}: {a.beforeScore}% → {a.afterScore}% <span className="text-adv-green">(+{a.delta})</span>
                          </p>
                        ))}
                      </div>
                    )}
                    {comparison.worsened.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-red-400 mb-1">Regressions</p>
                        {comparison.worsened.slice(0, 5).map(a => (
                          <p key={a.articleId} className="text-xs text-adv-off-white">
                            {a.articleId} {a.articleTitle ? `— ${a.articleTitle}` : ''}: {a.beforeScore}% → {a.afterScore}% <span className="text-red-400">({a.delta})</span>
                          </p>
                        ))}
                      </div>
                    )}
                    {comparison.capabilityDeltas.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-adv-teal mb-1">Capability Maturity Changes</p>
                        {comparison.capabilityDeltas.filter(c => c.delta !== 0).map(c => (
                          <p key={c.id} className="text-xs text-adv-off-white">
                            {c.name}: {c.beforeMaturity}/5 → {c.afterMaturity}/5 <span className={c.delta > 0 ? 'text-adv-green' : 'text-red-400'}>({c.delta > 0 ? '+' : ''}{c.delta})</span>
                          </p>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setComparison(null)} className="text-xs text-adv-gray hover:text-adv-off-white">Close comparison</button>
                  </div>
                )}
              </div>
            )}

            {/* New iteration panel */}
            {showIterationPanel && (
              <div className="rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-5 space-y-4">
                <h3 className="text-sm font-semibold text-adv-teal">Start New Iteration</h3>
                <p className="text-xs text-adv-gray">
                  Save the current results as a snapshot, then add new evidence and re-run the assessment to measure progress.
                </p>
                <div>
                  <label className="text-xs font-medium text-adv-off-white block mb-1">What has changed since the last assessment?</label>
                  <textarea
                    value={iterationNotes}
                    onChange={e => setIterationNotes(e.target.value)}
                    placeholder="e.g., Implemented new TM rules, updated CDD policy, added PEP screening..."
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-none"
                    rows={3}
                  />
                </div>

                {/* ── Iteration Document Upload ─────────────────────── */}
                <div>
                  <label className="text-xs font-medium text-adv-off-white flex items-center gap-1.5 mb-1">
                    <Paperclip className="h-3.5 w-3.5 text-adv-teal" />
                    Attach updated documents <span className="text-adv-gray font-normal">(optional)</span>
                  </label>
                  <p className="text-[11px] text-adv-gray mb-2">
                    Upload revised policies, new procedures, or remediation evidence. These will be included in the re-assessment.
                  </p>
                  <div
                    onDragOver={e => { e.preventDefault(); setIterDragging(true); }}
                    onDragLeave={() => setIterDragging(false)}
                    onDrop={e => { e.preventDefault(); setIterDragging(false); if (e.dataTransfer.files.length) handleIterationDocUpload(e.dataTransfer.files); }}
                    className={`rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors cursor-pointer ${iterDragging ? 'border-adv-teal bg-adv-teal/5' : 'border-border hover:border-adv-teal/40'}`}
                    onClick={() => iterFileInputRef.current?.click()}
                  >
                    <Upload className="mx-auto mb-1 h-5 w-5 text-adv-gray" />
                    <p className="text-xs text-adv-gray">
                      Drop files here or <span className="text-adv-teal font-medium">browse</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-adv-gray">PDF, DOCX, XLSX, TXT, CSV, HTML</p>
                  </div>
                  <input
                    ref={iterFileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.doc,.xlsx,.csv,.txt,.md,.html"
                    className="hidden"
                    onChange={e => { if (e.target.files?.length) { handleIterationDocUpload(e.target.files); e.target.value = ''; } }}
                  />
                  {iterationDocs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {iterationDocs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-2 rounded-lg bg-adv-dark px-3 py-1.5">
                          {doc.status === 'uploading' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-adv-teal shrink-0" />
                          ) : doc.status === 'error' ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-adv-red shrink-0" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-adv-teal shrink-0" />
                          )}
                          <span className="flex-1 truncate text-xs text-adv-off-white">{doc.name}</span>
                          {doc.status === 'done' && doc.text && (
                            <span className="shrink-0 text-[10px] text-adv-gray">{Math.round(doc.text.length / 4).toLocaleString()} tok</span>
                          )}
                          {doc.status === 'error' && <span className="shrink-0 text-[10px] text-adv-red">Failed</span>}
                          <button type="button" onClick={() => setIterationDocs(prev => prev.filter(d => d.id !== doc.id))} className="shrink-0 text-adv-gray hover:text-adv-red transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <p className="text-[10px] text-adv-gray">
                        {iterationDocs.filter(d => d.status === 'done').length} new document{iterationDocs.filter(d => d.status === 'done').length !== 1 ? 's' : ''} for this iteration
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      await createSnapshot();
                      // Reset to Context step so user can review docs
                      setCurrentStep(3);
                    }}
                    disabled={iterationDocs.some(d => d.status === 'uploading')}
                    className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" /> Save Snapshot & Start Iteration {iterations.length + 2}
                  </button>
                  <button
                    onClick={() => { setShowIterationPanel(false); setIterationDocs([]); }}
                    className="text-sm text-adv-gray hover:text-adv-off-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
