import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Layers, Shield, Users, CheckCircle2, AlertTriangle, XCircle,
  Settings, ChevronDown, ChevronRight, Play, Square, Send, Save,
  ArrowLeft, ArrowRight, Loader2,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import ConversationThread from '@/components/shared/ConversationThread';
import ThinkingControls from '@/components/shared/ThinkingControls';
import ModelSelector from '@/components/shared/ModelSelector';
import StatusIndicator from '@/components/shared/StatusIndicator';
import ExportBar from '@/components/shared/ExportBar';
import { useSessionStore } from '@/stores/useSessionStore';
import { useClaude } from '@/hooks/useClaude';
import { useExport } from '@/hooks/useExport';
import type { CodingProject, CodingReview } from '@/lib/coding-types';
import type { ThinkingLevel, ModelId } from '@/lib/types';

// ── Auth helper ────────────────────────────────────────────────
function getAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('openexpert-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Expert panel persona definitions ───────────────────────────
const EXPERT_PERSONAS = [
  { id: 'security', label: 'Security Review', Icon: Shield, color: 'text-adv-red' },
  { id: 'compliance', label: 'Compliance Review', Icon: CheckCircle2, color: 'text-adv-green' },
  { id: 'product', label: 'Product Review', Icon: Users, color: 'text-adv-blue' },
  { id: 'architecture', label: 'Technical Review', Icon: Layers, color: 'text-adv-gold' },
  { id: 'operational', label: 'Ops Review', Icon: Settings, color: 'text-adv-gray' },
] as const;

// ── Review prompt record from the backend ──────────────────────
interface ReviewPromptRecord {
  reviewId: string;
  persona: string;
  reviewPrompt: string;
  systemPromptOverride: string;
}

// ── Local review state per persona ─────────────────────────────
interface ReviewRunState {
  reviewId: string;
  persona: string;
  status: 'pending' | 'in_progress' | 'completed';
  verdict?: 'endorse' | 'flag' | 'dissent';
  findings?: string;
  streamingText?: string;
}

// ── Phase type for the page ────────────────────────────────────
type PagePhase = 'architecture' | 'reviews' | 'estimation';

export default function CodingLargeArchitecturePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // ── Session store integration ──────────────────────────────
  const {
    model, thinking, systemPrompt,
    setModule, setAreaId, setThinking, setModel, setSystemPrompt, clearSession,
  } = useSessionStore();

  const {
    runMessage, stopStreaming, isStreaming, streamingText, streamingThinking,
    messages, lastInputTokens, lastOutputTokens,
  } = useClaude();

  const { doExport, isExporting } = useExport();

  // ── Project data ───────────────────────────────────────────
  const [project, setProject] = useState<CodingProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<CodingReview[]>([]);

  // ── Config state ───────────────────────────────────────────
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(
    new Set(['security', 'compliance', 'product', 'architecture', 'operational'])
  );
  const [techStackPrefs, setTechStackPrefs] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Architecture state ─────────────────────────────────────
  const [architectureSaved, setArchitectureSaved] = useState(false);
  const [savedArchitecture, setSavedArchitecture] = useState('');
  const [savingArchitecture, setSavingArchitecture] = useState(false);
  const [followUpInput, setFollowUpInput] = useState('');

  // ── Review state ───────────────────────────────────────────
  const [reviewPrompts, setReviewPrompts] = useState<ReviewPromptRecord[]>([]);
  const [reviewRunStates, setReviewRunStates] = useState<ReviewRunState[]>([]);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [reviewsRequested, setReviewsRequested] = useState(false);
  const [requestingReviews, setRequestingReviews] = useState(false);
  const [runningReviewId, setRunningReviewId] = useState<string | null>(null);

  // ── Estimation state ───────────────────────────────────────
  const [estimationGenerated, setEstimationGenerated] = useState(false);
  const [estimationContent, setEstimationContent] = useState('');
  const [generatingEstimation, setGeneratingEstimation] = useState(false);

  // ── Generating architecture flag ───────────────────────────
  const [generatingArchitecture, setGeneratingArchitecture] = useState(false);

  // ── Ref to track streaming completion for reviews ──────────
  const prevIsStreamingRef = useRef(false);
  const activeReviewRef = useRef<string | null>(null);

  // ── Initialize session on mount ────────────────────────────
  useEffect(() => {
    clearSession();
    setModule('coding-large-architecture');
    setAreaId('coding');
    setThinking('investigate' as ThinkingLevel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load project data ──────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/coding/projects/${projectId}`, { headers: getAuthHeader() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setProject(data);
          setReviews(data.reviews || []);
          if (data.architecture_summary) {
            setSavedArchitecture(data.architecture_summary);
            setArchitectureSaved(true);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  // ── Track streaming end for review extraction ──────────────
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    if (wasStreaming && !isStreaming) {
      // Streaming just finished
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (!lastAssistant) return;

      // If we were running a review, extract verdict and findings
      if (activeReviewRef.current) {
        const reviewId = activeReviewRef.current;
        activeReviewRef.current = null;
        setRunningReviewId(null);

        // Parse verdict from the response
        const content = lastAssistant.content;
        let verdict: 'endorse' | 'flag' | 'dissent' = 'flag';
        const verdictLower = content.toLowerCase();
        if (verdictLower.includes('verdict: endorse') || verdictLower.includes('**endorse**') || verdictLower.includes('## verdict\n\nendorse')) {
          verdict = 'endorse';
        } else if (verdictLower.includes('verdict: dissent') || verdictLower.includes('**dissent**') || verdictLower.includes('## verdict\n\ndissent')) {
          verdict = 'dissent';
        }

        // Update local review state
        setReviewRunStates((prev) =>
          prev.map((r) =>
            r.reviewId === reviewId
              ? { ...r, status: 'completed' as const, verdict, findings: content }
              : r
          )
        );

        // Save review verdict to backend
        if (projectId) {
          fetch(`/api/coding/projects/${projectId}/reviews/${reviewId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ verdict, findings: content, status: 'completed' }),
          }).catch(() => {});
        }
      }

      // If generating architecture, stop tracking
      if (generatingArchitecture) {
        setGeneratingArchitecture(false);
      }

      // If generating estimation
      if (generatingEstimation) {
        setEstimationContent(lastAssistant.content);
        setEstimationGenerated(true);
        setGeneratingEstimation(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, messages]);

  // ── Toggle expert persona ──────────────────────────────────
  const togglePersona = useCallback((id: string) => {
    setSelectedPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Generate Architecture ──────────────────────────────────
  const handleGenerateArchitecture = useCallback(async () => {
    if (!projectId || isStreaming) return;

    try {
      setGeneratingArchitecture(true);
      const res = await fetch(`/api/coding/projects/${projectId}/architecture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ tech_stack_preferences: techStackPrefs || undefined }),
      });

      if (!res.ok) throw new Error('Failed to generate architecture prompt');
      const data = await res.json();

      // Set system prompt from backend
      if (data.systemPromptOverride) {
        setSystemPrompt(data.systemPromptOverride);
      }

      // Run the architecture prompt through Claude
      runMessage(data.architecturePrompt);
    } catch (err) {
      console.error('Architecture generation failed:', err);
      setGeneratingArchitecture(false);
    }
  }, [projectId, isStreaming, techStackPrefs, setSystemPrompt, runMessage]);

  // ── Send follow-up message ─────────────────────────────────
  const handleFollowUp = useCallback(() => {
    if (!followUpInput.trim() || isStreaming) return;
    runMessage(followUpInput.trim());
    setFollowUpInput('');
  }, [followUpInput, isStreaming, runMessage]);

  // ── Save architecture ──────────────────────────────────────
  const handleSaveArchitecture = useCallback(async () => {
    if (!projectId) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return;

    setSavingArchitecture(true);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/architecture`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ architecture_summary: lastAssistant.content }),
      });
      if (res.ok) {
        setSavedArchitecture(lastAssistant.content);
        setArchitectureSaved(true);
      }
    } catch (err) {
      console.error('Failed to save architecture:', err);
    } finally {
      setSavingArchitecture(false);
    }
  }, [projectId, messages]);

  // ── Request expert reviews ─────────────────────────────────
  const handleRequestReviews = useCallback(async () => {
    if (!projectId || requestingReviews) return;

    setRequestingReviews(true);
    try {
      const personas = Array.from(selectedPersonas);
      const res = await fetch(`/api/coding/projects/${projectId}/architecture/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ personas }),
      });

      if (!res.ok) throw new Error('Failed to request reviews');
      const data = await res.json();

      // Store review prompts
      setReviewPrompts(data.reviewPrompts || []);

      // Initialize review run states
      const states: ReviewRunState[] = (data.reviewPrompts || []).map((rp: ReviewPromptRecord) => ({
        reviewId: rp.reviewId,
        persona: rp.persona,
        status: 'pending' as const,
      }));
      setReviewRunStates(states);
      setReviewsRequested(true);

      // Expand all reviews by default
      setExpandedReviews(new Set(states.map((s) => s.reviewId)));

      // Update reviews from backend response
      if (data.reviews) {
        setReviews(data.reviews);
      }
    } catch (err) {
      console.error('Failed to request reviews:', err);
    } finally {
      setRequestingReviews(false);
    }
  }, [projectId, selectedPersonas, requestingReviews]);

  // ── Run a single review ────────────────────────────────────
  const handleRunReview = useCallback(
    async (reviewId: string) => {
      if (isStreaming || runningReviewId) return;

      const prompt = reviewPrompts.find((rp) => rp.reviewId === reviewId);
      if (!prompt) return;

      // Mark this review as in_progress
      setRunningReviewId(reviewId);
      activeReviewRef.current = reviewId;
      setReviewRunStates((prev) =>
        prev.map((r) => (r.reviewId === reviewId ? { ...r, status: 'in_progress' as const } : r))
      );

      // Set the persona's system prompt
      if (prompt.systemPromptOverride) {
        setSystemPrompt(prompt.systemPromptOverride);
      }

      // Run the review prompt
      runMessage(prompt.reviewPrompt);
    },
    [isStreaming, runningReviewId, reviewPrompts, setSystemPrompt, runMessage]
  );

  // ── Run all pending reviews sequentially ───────────────────
  // This is managed via the effect that watches isStreaming changes.
  // Users click "Run Review" on each one individually for control.

  // ── Generate estimation ────────────────────────────────────
  const handleGenerateEstimation = useCallback(async () => {
    if (!projectId || isStreaming) return;

    setGeneratingEstimation(true);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });

      if (!res.ok) throw new Error('Failed to generate estimation prompt');
      const data = await res.json();

      if (data.systemPromptOverride) {
        setSystemPrompt(data.systemPromptOverride);
      }

      runMessage(data.estimationPrompt);
    } catch (err) {
      console.error('Estimation generation failed:', err);
      setGeneratingEstimation(false);
    }
  }, [projectId, isStreaming, setSystemPrompt, runMessage]);

  // ── Toggle review expansion ────────────────────────────────
  const toggleReviewExpanded = useCallback((reviewId: string) => {
    setExpandedReviews((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  }, []);

  // ── Verdict badge component ────────────────────────────────
  const VerdictBadge = ({ verdict }: { verdict?: string }) => {
    if (verdict === 'endorse') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-adv-green/10 px-2.5 py-0.5 text-[10px] font-semibold text-adv-green">
          <CheckCircle2 className="h-3 w-3" /> Endorse
        </span>
      );
    }
    if (verdict === 'flag') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-adv-gold/10 px-2.5 py-0.5 text-[10px] font-semibold text-adv-gold">
          <AlertTriangle className="h-3 w-3" /> Flag
        </span>
      );
    }
    if (verdict === 'dissent') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-adv-red/10 px-2.5 py-0.5 text-[10px] font-semibold text-adv-red">
          <XCircle className="h-3 w-3" /> Dissent
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-adv-gray/10 px-2.5 py-0.5 text-[10px] font-medium text-adv-gray">
        Pending
      </span>
    );
  };

  // ── Derived values ─────────────────────────────────────────
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const outputContent = isStreaming ? streamingText : (lastAssistantMessage?.content || '');
  const hasMessages = messages.length > 0 || isStreaming;
  const canSaveArchitecture = hasMessages && !isStreaming && !architectureSaved && lastAssistantMessage;
  const canRequestReviews = architectureSaved && !reviewsRequested;
  const canGenerateEstimation = architectureSaved && !estimationGenerated && !generatingEstimation;

  // Review summary
  const completedReviews = reviewRunStates.filter((r) => r.status === 'completed');
  const endorseCount = completedReviews.filter((r) => r.verdict === 'endorse').length;
  const flagCount = completedReviews.filter((r) => r.verdict === 'flag').length;
  const dissentCount = completedReviews.filter((r) => r.verdict === 'dissent').length;
  const allReviewsComplete = reviewRunStates.length > 0 && completedReviews.length === reviewRunStates.length;

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-adv-gold" />
        <span className="ml-2 text-sm text-adv-gray">Loading project...</span>
      </div>
    );
  }

  if (!project) {
    return <div className="p-6 text-adv-gray">Project not found</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      {/* Breadcrumb */}
      <CodingBreadcrumb
        items={[
          { label: 'Coding Large', href: '/coding/large' },
          { label: project.name || 'Project', href: `/coding/large/project/${projectId}` },
          { label: 'Architecture' },
        ]}
      />

      {/* Header */}
      <div>
        <h1 className="flex items-center gap-3 text-xl font-bold text-adv-white">
          <Layers className="h-6 w-6 text-adv-gold" />
          Architecture Design
        </h1>
        <p className="mt-1 text-sm text-adv-gray">
          Design the technical architecture for <span className="text-adv-off-white">{project.name}</span> and get expert panel reviews
        </p>
      </div>

      {/* Main layout: Left config (1/3) + Right output (2/3) */}
      <div className="flex gap-6">
        {/* ═══════════════════════════════════════════════════════════
            LEFT PANEL — Configuration (1/3 width)
            ═══════════════════════════════════════════════════════════ */}
        <div className="w-[380px] shrink-0 space-y-4">

          {/* Expert Panel Checkboxes */}
          <div className="rounded-xl border border-adv-gold/20 bg-adv-card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gold">
              Expert Panel
            </h3>
            <p className="mb-3 text-[11px] text-adv-gray">
              Select which expert reviewers should evaluate the architecture.
            </p>
            <div className="space-y-2">
              {EXPERT_PERSONAS.map(({ id, label, Icon, color }) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-sm text-adv-off-white transition-colors hover:bg-adv-dark/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedPersonas.has(id)}
                    onChange={() => togglePersona(id)}
                    className="h-3.5 w-3.5 rounded border-adv-gray-med accent-adv-gold"
                  />
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Tech Stack Preferences */}
          <div className="rounded-xl border border-border bg-adv-card p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Tech Stack Preferences
            </h3>
            <p className="mb-2 text-[11px] text-adv-gray">
              Optional constraints or preferences for technology choices.
            </p>
            <textarea
              value={techStackPrefs}
              onChange={(e) => setTechStackPrefs(e.target.value)}
              placeholder="e.g., React + TypeScript, PostgreSQL, Docker, prefer serverless where possible..."
              className="h-20 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-gold focus:outline-none focus:ring-1 focus:ring-adv-gold/50 resize-none"
            />
          </div>

          {/* Thinking Controls */}
          <div className="rounded-xl border border-border bg-adv-card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Analysis Depth
            </h3>
            <ThinkingControls value={thinking} onChange={setThinking} />
          </div>

          {/* Advanced Settings (collapsible) */}
          <div className="rounded-xl border border-border bg-adv-card p-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center gap-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced Settings
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-4">
                <ModelSelector value={model} onChange={setModel} />
              </div>
            )}
          </div>

          {/* Generate Architecture Button */}
          <button
            onClick={handleGenerateArchitecture}
            disabled={isStreaming || architectureSaved}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-gold px-4 py-3 text-sm font-semibold text-adv-dark transition-colors hover:bg-adv-gold/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStreaming && generatingArchitecture ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Architecture...
              </>
            ) : architectureSaved ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Architecture Saved
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Generate Architecture
              </>
            )}
          </button>

          {/* Stop button when streaming */}
          {isStreaming && (
            <button
              onClick={stopStreaming}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-adv-red/30 bg-adv-red/10 px-4 py-2.5 text-sm font-medium text-adv-red transition-colors hover:bg-adv-red/20"
            >
              <Square className="h-4 w-4" />
              Stop Generation
            </button>
          )}

          {/* Status Indicator */}
          <StatusIndicator
            inputTokens={lastInputTokens}
            outputTokens={lastOutputTokens}
            model={model}
            isStreaming={isStreaming}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════
            RIGHT PANEL — Architecture + Reviews + Estimation (2/3)
            ═══════════════════════════════════════════════════════════ */}
        <div className="min-w-0 flex-1 space-y-5">

          {/* ── Architecture Document Section ─────────────────── */}
          <div className="rounded-xl border border-adv-gold/20 bg-adv-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
                <Layers className="h-4 w-4 text-adv-gold" />
                Architecture Document
              </h3>
              {architectureSaved && (
                <span className="inline-flex items-center gap-1 rounded-full bg-adv-green/10 px-2 py-0.5 text-[10px] font-medium text-adv-green">
                  <CheckCircle2 className="h-3 w-3" /> Saved
                </span>
              )}
            </div>

            {/* Saved architecture display */}
            {architectureSaved && savedArchitecture && !hasMessages ? (
              <div className="prose-output max-w-none rounded-lg border border-border bg-adv-dark p-4 text-adv-off-white">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{savedArchitecture}</ReactMarkdown>
              </div>
            ) : hasMessages ? (
              /* Conversation thread for streaming / multi-turn */
              <div className="rounded-lg border border-border bg-adv-dark p-4">
                <ConversationThread
                  messages={messages}
                  streamingText={streamingText}
                  streamingThinking={streamingThinking}
                  isStreaming={isStreaming}
                  moduleId="coding-large-architecture"
                />
              </div>
            ) : (
              /* Empty state */
              <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-adv-dark/50">
                <div className="text-center">
                  <Layers className="mx-auto h-8 w-8 text-adv-gray-med" />
                  <p className="mt-2 text-sm text-adv-gray-med">Architecture document will appear here</p>
                  <p className="mt-1 text-xs text-adv-gray-med">
                    Configure the expert panel and click "Generate Architecture" to begin
                  </p>
                </div>
              </div>
            )}

            {/* Follow-up input for refinements */}
            {hasMessages && !isStreaming && !architectureSaved && (
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <textarea
                    value={followUpInput}
                    onChange={(e) => setFollowUpInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleFollowUp();
                    }}
                    placeholder="Refine the architecture... (Ctrl+Enter to send)"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-gold focus:outline-none focus:ring-1 focus:ring-adv-gold/50 resize-none"
                    rows={2}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFollowUp}
                    disabled={!followUpInput.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-adv-gold/20 px-3 py-1.5 text-xs font-medium text-adv-gold transition-colors hover:bg-adv-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-3 w-3" />
                    Refine
                  </button>
                  <button
                    onClick={handleSaveArchitecture}
                    disabled={savingArchitecture}
                    className="flex items-center gap-1.5 rounded-lg bg-adv-green/20 px-3 py-1.5 text-xs font-medium text-adv-green transition-colors hover:bg-adv-green/30 disabled:opacity-50"
                  >
                    {savingArchitecture ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Save Architecture
                  </button>
                </div>
              </div>
            )}

            {/* Post-save follow-up */}
            {architectureSaved && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {canRequestReviews && (
                  <button
                    onClick={handleRequestReviews}
                    disabled={requestingReviews}
                    className="flex items-center gap-1.5 rounded-lg bg-adv-gold px-4 py-2 text-xs font-semibold text-adv-dark transition-colors hover:bg-adv-gold/80 disabled:opacity-50"
                  >
                    {requestingReviews ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Users className="h-3.5 w-3.5" />
                    )}
                    Request Expert Reviews
                  </button>
                )}
                {canGenerateEstimation && (
                  <button
                    onClick={handleGenerateEstimation}
                    disabled={isStreaming}
                    className="flex items-center gap-1.5 rounded-lg border border-adv-gold/30 bg-adv-gold/10 px-4 py-2 text-xs font-medium text-adv-gold transition-colors hover:bg-adv-gold/20 disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Generate Estimation
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Expert Panel Reviews Section ───────────────────── */}
          {reviewsRequested && reviewRunStates.length > 0 && (
            <div className="rounded-xl border border-adv-gold/20 bg-adv-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
                  <Shield className="h-4 w-4 text-adv-gold" />
                  Expert Panel Reviews
                </h3>
                {allReviewsComplete && (
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-adv-green">
                      <CheckCircle2 className="h-3 w-3" /> {endorseCount} endorse
                    </span>
                    <span className="flex items-center gap-1 text-adv-gold">
                      <AlertTriangle className="h-3 w-3" /> {flagCount} flag
                    </span>
                    <span className="flex items-center gap-1 text-adv-red">
                      <XCircle className="h-3 w-3" /> {dissentCount} dissent
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {reviewRunStates.map((review) => {
                  const persona = EXPERT_PERSONAS.find((p) => p.id === review.persona);
                  const PersonaIcon = persona?.Icon || Shield;
                  const isExpanded = expandedReviews.has(review.reviewId);
                  const isRunning = runningReviewId === review.reviewId && isStreaming;

                  return (
                    <div
                      key={review.reviewId}
                      className="rounded-lg border border-border bg-adv-dark overflow-hidden"
                    >
                      {/* Review header */}
                      <button
                        onClick={() => toggleReviewExpanded(review.reviewId)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-adv-dark-2 transition-colors"
                      >
                        <PersonaIcon className={`h-4 w-4 ${persona?.color || 'text-adv-gray'}`} />
                        <span className="flex-1 text-sm font-medium capitalize text-adv-off-white">
                          {persona?.label || review.persona}
                        </span>

                        {/* Status / Verdict badge */}
                        {review.status === 'completed' ? (
                          <VerdictBadge verdict={review.verdict} />
                        ) : review.status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-adv-blue/10 px-2.5 py-0.5 text-[10px] font-medium text-adv-blue">
                            <Loader2 className="h-3 w-3 animate-spin" /> Running
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-adv-gray/10 px-2.5 py-0.5 text-[10px] font-medium text-adv-gray">
                            Pending
                          </span>
                        )}

                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-adv-gray-med" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-adv-gray-med" />
                        )}
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t border-border px-4 py-3">
                          {review.status === 'pending' && (
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleRunReview(review.reviewId)}
                                disabled={isStreaming || !!runningReviewId}
                                className="flex items-center gap-1.5 rounded-lg bg-adv-gold/20 px-3 py-1.5 text-xs font-medium text-adv-gold transition-colors hover:bg-adv-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Play className="h-3 w-3" />
                                Run Review
                              </button>
                              <span className="text-[11px] text-adv-gray">
                                Click to run {persona?.label || review.persona}
                              </span>
                            </div>
                          )}

                          {review.status === 'in_progress' && isRunning && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs text-adv-blue">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Reviewing architecture...</span>
                              </div>
                              {streamingText && (
                                <div className="prose-output max-w-none max-h-[300px] overflow-auto rounded-lg border border-border bg-adv-card p-3 text-sm text-adv-off-white">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          )}

                          {review.status === 'completed' && review.findings && (
                            <div className="space-y-2">
                              <div className="prose-output max-w-none max-h-[400px] overflow-auto rounded-lg border border-border bg-adv-card p-3 text-sm text-adv-off-white">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{review.findings}</ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Summary after all reviews complete */}
              {allReviewsComplete && (
                <div className="mt-4 rounded-lg border border-adv-gold/20 bg-adv-gold/5 p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gold">
                    Review Summary
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-adv-green/10 p-3">
                      <div className="text-2xl font-bold text-adv-green">{endorseCount}</div>
                      <div className="text-[11px] text-adv-green">Endorse</div>
                    </div>
                    <div className="rounded-lg bg-adv-gold/10 p-3">
                      <div className="text-2xl font-bold text-adv-gold">{flagCount}</div>
                      <div className="text-[11px] text-adv-gold">Flag</div>
                    </div>
                    <div className="rounded-lg bg-adv-red/10 p-3">
                      <div className="text-2xl font-bold text-adv-red">{dissentCount}</div>
                      <div className="text-[11px] text-adv-red">Dissent</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Estimation Section ──────────────────────────────── */}
          {(estimationGenerated || generatingEstimation) && (
            <div className="rounded-xl border border-adv-gold/20 bg-adv-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
                  <Settings className="h-4 w-4 text-adv-gold" />
                  Estimation
                </h3>
                {estimationGenerated && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-adv-green/10 px-2 py-0.5 text-[10px] font-medium text-adv-green">
                    <CheckCircle2 className="h-3 w-3" /> Complete
                  </span>
                )}
              </div>

              {generatingEstimation && isStreaming && streamingText ? (
                <div className="prose-output max-w-none rounded-lg border border-border bg-adv-dark p-4 text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                </div>
              ) : generatingEstimation && isStreaming ? (
                <div className="flex items-center gap-2 py-4 text-sm text-adv-gray">
                  <Loader2 className="h-4 w-4 animate-spin text-adv-gold" />
                  Generating estimation...
                </div>
              ) : estimationContent ? (
                <div className="prose-output max-w-none rounded-lg border border-border bg-adv-dark p-4 text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{estimationContent}</ReactMarkdown>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Export Bar ──────────────────────────────────────── */}
          {outputContent && !isStreaming && (
            <ExportBar
              content={savedArchitecture || outputContent}
              availableFormats={['md', 'docx', 'pdf']}
              onExport={(fmt) => doExport(fmt, savedArchitecture || outputContent, `${project.name}-architecture`)}
              isExporting={isExporting}
            />
          )}

          {/* ── Bottom Actions ──────────────────────────────────── */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-adv-card p-4">
            <Link
              to={`/coding/large/project/${projectId}`}
              className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Project
            </Link>

            <button
              onClick={() => navigate(`/coding/large/project/${projectId}`)}
              disabled={!architectureSaved}
              className="flex items-center gap-1.5 rounded-lg bg-adv-gold px-4 py-2 text-xs font-semibold text-adv-dark transition-colors hover:bg-adv-gold/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Proceed to Release Planning
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
