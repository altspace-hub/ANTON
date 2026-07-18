import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GitBranch, Upload, FolderOpen, Globe, Eye, Search, Shield, Layers, Users, Package,
  Play, Square, Send, ArrowLeft, RotateCcw, ChevronDown, ChevronRight,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import ExportAntonButton from '@/components/coding/ExportAntonButton';
import QualityScore from '@/components/coding/QualityScore';
import ConversationThread from '@/components/shared/ConversationThread';
import ExportBar from '@/components/shared/ExportBar';
import ThinkingControls from '@/components/shared/ThinkingControls';
import ModelSelector from '@/components/shared/ModelSelector';
import StatusIndicator from '@/components/shared/StatusIndicator';
import { useSessionStore } from '@/stores/useSessionStore';
import { useClaude } from '@/hooks/useClaude';
import { useExport } from '@/hooks/useExport';
import { fetchSession } from '@/lib/api';
import type { ReviewLens, ExplanationLevel, SecurityMode } from '@/lib/coding-types';
import type { ThinkingLevel, ModelId, Message } from '@/lib/types';

type View = 'setup' | 'conversation' | 'output';

const LENSES: Array<{ id: ReviewLens; label: string; icon: typeof Eye; description: string }> = [
  { id: 'developer', label: 'Developer Quality', icon: Eye, description: 'Code clarity, patterns, error handling, tests' },
  { id: 'security', label: 'Security', icon: Shield, description: 'Vulnerabilities, OWASP, injection, auth' },
  { id: 'compliance', label: 'Compliance', icon: Search, description: 'GDPR, audit trails, access control' },
  { id: 'product', label: 'Product', icon: Users, description: 'Feature completeness, UX, edge cases' },
  { id: 'architecture', label: 'Architecture', icon: Layers, description: 'Coupling, scalability, API design' },
  { id: 'dependency_audit', label: 'Dependency Audit', icon: Package, description: 'CVEs, licenses, maintenance' },
];

const SECURITY_MODES: Array<{ id: SecurityMode; label: string }> = [
  { id: 'vulnerability', label: 'Vulnerability Scan' },
  { id: 'pentest_planning', label: 'Pentest Planning' },
  { id: 'red_blue_team', label: 'Red/Blue Team' },
  { id: 'nist_csf', label: 'NIST CSF' },
  { id: 'iso_27001', label: 'ISO 27001' },
  { id: 'dora', label: 'DORA' },
];

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function CodeReviewPage() {
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  // ── Local UI state ──────────────────────────────────────────
  const [view, setView] = useState<View>('setup');
  const [sourceType, setSourceType] = useState<'paste' | 'directory' | 'repository'>('paste');
  const [code, setCode] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [selectedLenses, setSelectedLenses] = useState<Set<ReviewLens>>(new Set(['developer']));
  const [explanationLevel, setExplanationLevel] = useState<ExplanationLevel>('medium');
  const [securityMode, setSecurityMode] = useState<SecurityMode | ''>('');
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [followUpInput, setFollowUpInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [qualityScore, setQualityScore] = useState<{ score: number; dimensions?: Record<string, number> } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Store integration ───────────────────────────────────────
  const {
    sessionId,
    model,
    thinking,
    setModule, setAreaId, setThinking, setCreativity,
    setPlainTextMode, setSelectedOutputFormats, setModel, setSystemPrompt,
    clearSession, truncateMessagesAt, restoreSession,
    lastCachedTokens, lastCacheCreationTokens,
  } = useSessionStore();

  const {
    runMessage, stopStreaming, isStreaming,
    streamingText, streamingThinking,
    messages, lastInputTokens, lastOutputTokens,
  } = useClaude();

  const { doExport, isExporting } = useExport();

  // ── Initialize module config on mount ───────────────────────
  useEffect(() => {
    clearSession();
    setModule('code-review-explain');
    setAreaId('coding');
    setThinking('think_hard');
    setCreativity('strict');
    setPlainTextMode(true);
    setSelectedOutputFormats([]);

    // ── Resume from saved session if ?session= is present ──────────────
    if (sessionParam) {
      fetchSession(sessionParam).then((data) => {
        if (!data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const restored: Message[] = ((data.messages as any[]) || []).map((m: any) => ({
          id: m.id as string,
          sessionId: (m.session_id as string) ?? data.id,
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
          thinkingContent: (m.thinking_content as string | null) ?? undefined,
          tokenCount: (m.token_count as number | null) ?? undefined,
          createdAt: m.created_at as string,
        }));
        restoreSession(data.id as string, restored);

        // Restore config
        const cfg = typeof data.config === 'string'
          ? JSON.parse(data.config) : (data.config ?? {});
        if (cfg.model) setModel(cfg.model);
        if (cfg.thinking) setThinking(cfg.thinking);

        // Jump to conversation view if there are messages
        const hasAssistant = restored.some((m) => m.role === 'assistant');
        if (hasAssistant) {
          setView('conversation');
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-resize follow-up textarea ─────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [followUpInput]);

  // ── Detect when streaming ends (for switching to output view) ──
  const prevIsStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    // When the first response completes, save findings to the review session
    if (wasStreaming && !isStreaming && reviewSessionId) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant?.content) {
        fetch(`/api/coding/review/${reviewSessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({
            findings_summary: {
              lenses: Array.from(selectedLenses),
              responseLength: lastAssistant.content.length,
              completedAt: new Date().toISOString(),
            },
          }),
        }).catch(() => {});

        // Fire-and-forget quality score fetch
        fetch('/api/coding/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ content: lastAssistant.content, type: 'review' }),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data && typeof data.score === 'number') {
              setQualityScore({ score: data.score, dimensions: data.dimensions });
            }
          })
          .catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // ── Toggle lens selection ───────────────────────────────────
  const toggleLens = (lens: ReviewLens) => {
    setSelectedLenses((prev) => {
      const next = new Set(prev);
      if (next.has(lens)) next.delete(lens);
      else next.add(lens);
      return next;
    });
  };

  // ── Start the review ────────────────────────────────────────
  const handleStartReview = async () => {
    if (sourceType === 'paste' && !code.trim()) return;
    setStartError(null);

    try {
      const res = await fetch('/api/coding/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          source_type: sourceType,
          code: sourceType === 'paste' ? code : undefined,
          source_url: sourceType === 'repository' ? repositoryUrl : undefined,
          explanation_level: explanationLevel,
          review_lenses: Array.from(selectedLenses),
          security_mode: securityMode || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start review' }));
        setStartError((err as { error?: string }).error || 'Failed to start review');
        return;
      }

      const data = await res.json() as {
        id: string;
        reviewPrompt: string;
        systemPromptOverride?: string;
      };

      setReviewSessionId(data.id);

      // Apply system prompt override if provided by the backend
      if (data.systemPromptOverride) {
        setSystemPrompt(data.systemPromptOverride);
      }

      // Switch to conversation view and run the review
      setView('conversation');
      runMessage(data.reviewPrompt);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Network error');
    }
  };

  // ── Send follow-up message ──────────────────────────────────
  const handleFollowUp = () => {
    if (!followUpInput.trim() || isStreaming) return;
    runMessage(followUpInput.trim());
    setFollowUpInput('');
  };

  // ── Follow-up keyboard shortcut ─────────────────────────────
  const handleFollowUpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleFollowUp();
    }
  };

  // ── Edit a previous user message ────────────────────────────
  const handleEditMessage = (msg: Message) => {
    truncateMessagesAt(msg.id);
    setFollowUpInput(msg.content);
  };

  // ── Start a brand-new review ────────────────────────────────
  const handleNewReview = () => {
    clearSession();
    setModule('code-review-explain');
    setAreaId('coding');
    setThinking('think_hard');
    setCreativity('strict');
    setPlainTextMode(true);
    setSelectedOutputFormats([]);
    setReviewSessionId(null);
    setFollowUpInput('');
    setStartError(null);
    setQualityScore(null);
    setView('setup');
  };

  // ── Derived values ──────────────────────────────────────────
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
  const outputContent = isStreaming ? streamingText : (lastAssistantMessage?.content || '');
  const hasOutput = !!lastAssistantMessage?.content && !isStreaming;

  // Security lens auto-show
  const showSecurityOptions = selectedLenses.has('security');

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <CodingBreadcrumb items={[{ label: 'Code Review' }]} />

      <div>
        <h1 className="flex items-center gap-3 text-xl font-bold text-adv-white">
          <GitBranch className="h-6 w-6 text-adv-teal" />
          Code Review & Explain
        </h1>
        <p className="mt-1 text-sm text-adv-gray">
          Review code through multiple expert lenses with structured findings
        </p>
      </div>

      {/* ================================================================ */}
      {/* SETUP VIEW                                                       */}
      {/* ================================================================ */}
      {view === 'setup' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Input */}
          <div className="lg:col-span-2 space-y-4">
            {/* Source Type Tabs */}
            <div className="flex gap-2">
              {([
                { id: 'paste' as const, label: 'Paste Code', icon: Upload },
                { id: 'directory' as const, label: 'Local Folder', icon: FolderOpen },
                { id: 'repository' as const, label: 'Repository', icon: Globe },
              ]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSourceType(id)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors ${
                    sourceType === id
                      ? 'bg-adv-teal text-adv-dark font-medium'
                      : 'bg-adv-card text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Code Input */}
            {sourceType === 'paste' && (
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste your code here..."
                className="h-80 w-full rounded-lg border border-border bg-adv-dark p-4 font-mono text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
              />
            )}
            {sourceType === 'directory' && (
              <div className="rounded-lg border border-dashed border-border bg-adv-dark p-8 text-center">
                <FolderOpen className="mx-auto h-8 w-8 text-adv-gray" />
                <p className="mt-2 text-sm text-adv-gray">Use the Knowledge Source panel to select a local folder</p>
              </div>
            )}
            {sourceType === 'repository' && (
              <input
                type="url"
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="w-full rounded-lg border border-border bg-adv-dark px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            )}

            {/* Code preview for paste mode */}
            {sourceType === 'paste' && code.trim() && (
              <div className="mt-2">
                <p className="mb-1 text-xs text-adv-gray">
                  {code.split('\n').length} lines / {code.length.toLocaleString()} characters
                </p>
              </div>
            )}
          </div>

          {/* Right: Configuration */}
          <div className="space-y-4">
            {/* Review Lenses */}
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">Review Lenses</h3>
              <div className="space-y-2">
                {LENSES.map(({ id, label, icon: Icon, description }) => (
                  <button
                    key={id}
                    onClick={() => toggleLens(id)}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      selectedLenses.has(id)
                        ? 'bg-adv-teal-dim border border-adv-teal/30'
                        : 'bg-adv-dark border border-transparent hover:border-border'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${selectedLenses.has(id) ? 'text-adv-teal' : 'text-adv-gray'}`} />
                    <div>
                      <span className={`text-sm font-medium ${selectedLenses.has(id) ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                        {label}
                      </span>
                      <p className="text-[11px] text-adv-gray">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Security mode selector (shown only when security lens is active) */}
            {showSecurityOptions && (
              <div className="rounded-lg border border-border bg-adv-card p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">Security Framework</h3>
                <div className="flex flex-wrap gap-1.5">
                  {SECURITY_MODES.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setSecurityMode(securityMode === id ? '' : id)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        securityMode === id
                          ? 'bg-adv-teal text-adv-dark'
                          : 'bg-adv-dark text-adv-gray hover:text-adv-off-white border border-border'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Explanation Level */}
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">Depth</h3>
              <div className="flex gap-2">
                {(['high', 'medium', 'deep'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setExplanationLevel(level)}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium capitalize transition-colors ${
                      explanationLevel === level
                        ? 'bg-adv-teal text-adv-dark'
                        : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'
                    }`}
                  >
                    {level === 'high' ? 'Overview' : level === 'medium' ? 'Standard' : 'Deep Dive'}
                  </button>
                ))}
              </div>
            </div>

            {/* Thinking Controls */}
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <ThinkingControls
                value={thinking}
                onChange={(v: ThinkingLevel) => setThinking(v)}
                model={model}
              />
            </div>

            {/* Advanced Settings */}
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center gap-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
              >
                {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Advanced Settings
              </button>
              {showAdvanced && (
                <div className="mt-3">
                  <ModelSelector
                    value={model}
                    onChange={(v: ModelId) => setModel(v)}
                  />
                </div>
              )}
            </div>

            {/* Error Display */}
            {startError && (
              <div className="rounded-lg border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
                {startError}
              </div>
            )}

            {/* Start Button */}
            <button
              onClick={handleStartReview}
              disabled={(sourceType === 'paste' && !code.trim()) || selectedLenses.size === 0}
              className="w-full rounded-lg bg-adv-teal px-4 py-3 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
                <Play className="h-4 w-4" />
                Start Review ({selectedLenses.size} lens{selectedLenses.size !== 1 ? 'es' : ''})
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* CONVERSATION VIEW                                                */}
      {/* ================================================================ */}
      {view === 'conversation' && (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Left sidebar: review config summary */}
          <div className="w-full shrink-0 lg:w-64">
            <div className="space-y-4">
              {/* Navigation buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setView('setup')}
                  disabled={isStreaming}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-card px-3 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors disabled:opacity-50"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to Setup
                </button>
                <button
                  onClick={handleNewReview}
                  disabled={isStreaming}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-card px-3 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  New Review
                </button>
              </div>

              {/* Active Lenses */}
              <div className="rounded-lg border border-border bg-adv-card p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">Active Lenses</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(selectedLenses).map((lensId) => {
                    const lens = LENSES.find((l) => l.id === lensId);
                    if (!lens) return null;
                    const Icon = lens.icon;
                    return (
                      <span
                        key={lensId}
                        className="inline-flex items-center gap-1.5 rounded-md bg-adv-teal-dim border border-adv-teal/30 px-2.5 py-1.5 text-xs font-medium text-adv-teal"
                      >
                        <Icon className="h-3 w-3" />
                        {lens.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Review Config Summary */}
              <div className="rounded-lg border border-border bg-adv-card p-4 space-y-2">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">Configuration</h3>
                <div className="text-xs text-adv-gray">
                  <span className="text-adv-off-white font-medium">Depth: </span>
                  {explanationLevel === 'high' ? 'Overview' : explanationLevel === 'medium' ? 'Standard' : 'Deep Dive'}
                </div>
                {securityMode && (
                  <div className="text-xs text-adv-gray">
                    <span className="text-adv-off-white font-medium">Security: </span>
                    {SECURITY_MODES.find((m) => m.id === securityMode)?.label || securityMode}
                  </div>
                )}
                <div className="text-xs text-adv-gray">
                  <span className="text-adv-off-white font-medium">Thinking: </span>
                  {thinking.replace('_', ' ')}
                </div>
              </div>

              {/* Token / Cost display */}
              {(lastInputTokens > 0 || lastOutputTokens > 0) && (
                <div className="rounded-lg border border-border bg-adv-card p-4">
                  <StatusIndicator
                    inputTokens={lastInputTokens}
                    outputTokens={lastOutputTokens}
                    cachedTokens={lastCachedTokens}
                    cacheCreationTokens={lastCacheCreationTokens}
                    model={model}
                    isStreaming={isStreaming}
                  />
                </div>
              )}

              {/* Quality Score (shown when available) */}
              {qualityScore && (
                <div className="rounded-lg border border-border bg-adv-card p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">Quality Score</h3>
                  <QualityScore
                    score={qualityScore.score}
                    dimensions={qualityScore.dimensions}
                  />
                </div>
              )}

              {/* Export when output is available */}
              {hasOutput && (
                <div className="rounded-lg border border-border bg-adv-card p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">Export</h3>
                  <ExportBar
                    content={lastAssistantMessage?.content || ''}
                    availableFormats={['md', 'docx', 'pdf']}
                    onExport={(fmt) => doExport(fmt, lastAssistantMessage?.content || '', 'code-review')}
                    isExporting={isExporting}
                    sessionId={sessionId ?? undefined}
                    moduleContext="Code Review"
                  />
                  {reviewSessionId && (
                    <div className="mt-2">
                      <ExportAntonButton
                        type="review-profile"
                        id={reviewSessionId}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Conversation thread + follow-up input */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Status bar at top */}
            {isStreaming && (
              <div className="shrink-0 pb-3">
                <StatusIndicator
                  inputTokens={lastInputTokens}
                  outputTokens={lastOutputTokens}
                  cachedTokens={lastCachedTokens}
                  cacheCreationTokens={lastCacheCreationTokens}
                  model={model}
                  isStreaming={isStreaming}
                />
              </div>
            )}

            {/* Conversation */}
            <div className="flex-1 overflow-auto">
              <div className="rounded-xl border border-border bg-adv-card p-5">
                {messages.length === 0 && !isStreaming ? (
                  <div className="flex min-h-[200px] items-center justify-center">
                    <div className="text-center">
                      <GitBranch className="mx-auto h-8 w-8 text-adv-gray" />
                      <p className="mt-2 text-sm text-adv-gray">Preparing code review...</p>
                    </div>
                  </div>
                ) : (
                  <ConversationThread
                    messages={messages}
                    streamingText={streamingText}
                    streamingThinking={streamingThinking}
                    isStreaming={isStreaming}
                    onEditMessage={handleEditMessage}
                    moduleId="code-review-explain"
                  />
                )}
              </div>
            </div>

            {/* Follow-up input area */}
            <div className="mt-4 shrink-0 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
                  {messages.length <= 1 && isStreaming ? 'Review in progress...' : 'Follow up'}
                </label>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={followUpInput}
                    onChange={(e) => setFollowUpInput(e.target.value)}
                    onKeyDown={handleFollowUpKeyDown}
                    disabled={isStreaming}
                    placeholder={
                      isStreaming
                        ? 'Waiting for review to complete...'
                        : 'Ask a follow-up question, request more detail on a finding, or ask to focus on a specific area...'
                    }
                    className="w-full rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal disabled:opacity-50 resize-none"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    className="flex items-center gap-2 rounded-lg bg-adv-red px-4 py-2.5 text-sm font-medium text-white hover:bg-adv-red/80 transition-colors"
                  >
                    <Square className="h-4 w-4" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={handleFollowUp}
                    disabled={!followUpInput.trim()}
                    className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </button>
                )}

                {/* Quick follow-up buttons */}
                {hasOutput && !isStreaming && (
                  <div className="flex flex-wrap gap-1.5 ml-2">
                    {[
                      { label: 'Expand findings', prompt: 'Please expand on all findings with more detail, including code examples for fixes.' },
                      { label: 'Prioritize', prompt: 'Please prioritize all findings by severity (critical, high, medium, low) and provide a recommended fix order.' },
                      { label: 'Fix suggestions', prompt: 'For each finding, provide concrete code snippets showing the recommended fix.' },
                      { label: 'Summary', prompt: 'Provide a concise executive summary of the review: total findings, critical issues, and top 3 recommended actions.' },
                    ].map(({ label, prompt }) => (
                      <button
                        key={label}
                        onClick={() => runMessage(prompt)}
                        className="rounded-md border border-border bg-adv-dark px-2.5 py-1.5 text-[11px] text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-adv-gray">
                Press Ctrl+Enter to send
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* OUTPUT VIEW                                                      */}
      {/* ================================================================ */}
      {view === 'output' && (
        <div className="space-y-4">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('conversation')}
              className="flex items-center gap-1.5 rounded-lg bg-adv-card px-3 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Conversation
            </button>
            <button
              onClick={handleNewReview}
              className="flex items-center gap-1.5 rounded-lg bg-adv-card px-3 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              New Review
            </button>
          </div>

          {/* Output card */}
          <div className="rounded-xl border border-border bg-adv-card p-6">
            {lastAssistantMessage?.content ? (
              <ConversationThread
                messages={messages.filter((m) => m.role === 'assistant').slice(-1)}
                streamingText=""
                streamingThinking=""
                isStreaming={false}
                moduleId="code-review-explain"
              />
            ) : (
              <p className="text-sm text-adv-gray">No output yet.</p>
            )}
          </div>

          {/* Token summary */}
          {(lastInputTokens > 0 || lastOutputTokens > 0) && (
            <StatusIndicator
              inputTokens={lastInputTokens}
              outputTokens={lastOutputTokens}
              cachedTokens={lastCachedTokens}
              cacheCreationTokens={lastCacheCreationTokens}
              model={model}
              isStreaming={false}
            />
          )}

          {/* Quality Score */}
          {qualityScore && (
            <QualityScore
              score={qualityScore.score}
              dimensions={qualityScore.dimensions}
            />
          )}

          {/* Export bar */}
          {lastAssistantMessage?.content && (
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1">
                <ExportBar
                  content={lastAssistantMessage.content}
                  availableFormats={['md', 'docx', 'pdf']}
                  onExport={(fmt) => doExport(fmt, lastAssistantMessage.content, 'code-review')}
                  isExporting={isExporting}
                  sessionId={sessionId ?? undefined}
                  moduleContext="Code Review"
                />
              </div>
              {reviewSessionId && (
                <ExportAntonButton
                  type="review-profile"
                  id={reviewSessionId}
                />
              )}
            </div>
          )}

          {/* Continue conversation */}
          <button
            onClick={() => setView('conversation')}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Send className="h-4 w-4" />
            Continue Conversation
          </button>
        </div>
      )}
    </div>
  );
}
