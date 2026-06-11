import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Search, Sparkles, Brain, ClipboardList, Puzzle, ThumbsUp, Copy, Check, RefreshCw, Loader2, ShieldCheck, ChevronDown, ChevronUp, Layers, ChevronRight, CheckCircle2, XCircle, Info, TrendingUp, ArrowRight, Award, History, GitCompare, FileDown } from 'lucide-react';
import CitationVerifier from '@/components/shared/CitationVerifier';
import ReviewLauncher from '@/components/platform/ReviewLauncher';
import FeedbackWidget from '@/components/shared/FeedbackWidget';
import ModelSelector from '@/components/shared/ModelSelector';
import RerunComparison, { type RerunComparisonData } from '@/components/shared/RerunComparison';
import { fetchPromptPreview, createCustomModule, getSessionQualityScore, type SessionQualityScore, getAuthHeader, fetchWithAuth, exportTrustCertificate } from '@/lib/api';
import { buildOutputInstruction } from '@/lib/output-format-definitions';
import type { ModelId } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────

type PanelId = 'citations' | 'review' | 'thinking' | 'prompt' | 'feedback' | 'save' | 'trust' | 'trail' | 'history' | 'rerun' | 'exportRun' | null;

interface OutputToolbarProps {
  /** The last assistant output text (for citations & review) */
  outputContent: string;
  /** Current model id */
  model: string;
  /** Current session id */
  sessionId?: string;
  /** Whether Claude is currently streaming */
  isStreaming: boolean;
  /** Live streaming thinking text */
  streamingThinking: string;
  /** Completed thinking content from last assistant message */
  thinkingContent?: string;

  // For prompt preview
  moduleId?: string;
  areaId?: string;
  systemPrompt: string;
  creativity: string;
  thinking: string;
  plainTextMode?: boolean;
  selectedPersonas?: string[];
  selectedSkills?: string[];
  multiPerspective?: boolean;
  metaCognitiveEnabled?: boolean;
  structureReference?: { mode: string; description: string; fileName?: string };
  transparencyLevel?: 0 | 1 | 2;
  writingTone?: string;
  emojiEnabled?: boolean;
  audience?: string;
  channel?: string;
  outputLanguage?: string;
  knowledgeSources?: Record<string, unknown>;
  uploadedFileIds?: string[];

  // For save-as-module
  moduleLabel?: string;
  moduleIcon?: string;
  selectedOutputFormats: string[];
  knowledgeSourcesRaw?: Record<string, unknown>;
  onSaveSuccess?: () => void;

  /** Called when user wants to rewrite output incorporating review feedback */
  onApplyReview?: (reviewText: string) => void;
  /** Called when user clicks "Go Deeper" — parent should upgrade thinking level and re-run */
  onUpgradeThinking?: (level: 'think_hard' | 'investigate') => void;
  /** Per-message config snapshot — used for accurate "How ANTON Thought" display on old sessions */
  configSnapshot?: Record<string, unknown> | null;
  /** ATTR-04: Source manifest from last request — passed to CitationVerifier for cross-checking */
  sourceManifest?: string[];
  /** Wave 2.3: when the displayed output is itself a rerun, the original message id */
  rerunOf?: string | null;
}

// ── Chip config ──────────────────────────────────────────────

const CHIPS: Array<{ id: PanelId & string; label: string; icon: React.ComponentType<{ className?: string }>; streamingOnly?: boolean }> = [
  { id: 'trust', label: 'Trust Score', icon: ShieldCheck },
  { id: 'trail', label: 'How ANTON Thought', icon: Layers },
  { id: 'citations', label: 'Citations', icon: Search },
  { id: 'review', label: 'Review', icon: Sparkles },
  { id: 'thinking', label: 'Thinking', icon: Brain, streamingOnly: false },
  { id: 'history', label: 'History', icon: History },
  { id: 'rerun', label: 'Rerun with…', icon: GitCompare },
  { id: 'exportRun', label: 'Export run', icon: FileDown },
  { id: 'prompt', label: 'Full Prompt', icon: ClipboardList },
  { id: 'feedback', label: 'Feedback', icon: ThumbsUp },
  { id: 'save', label: 'Save', icon: Puzzle },
];

// ── Component ────────────────────────────────────────────────

export default function OutputToolbar(props: OutputToolbarProps) {
  const {
    outputContent, model, sessionId, isStreaming,
    streamingThinking, thinkingContent,
    moduleId, areaId, systemPrompt, creativity, thinking,
    plainTextMode, selectedPersonas, selectedSkills,
    multiPerspective, metaCognitiveEnabled, structureReference,
    transparencyLevel, writingTone, emojiEnabled,
    audience, channel, outputLanguage, knowledgeSources, uploadedFileIds,
    moduleLabel, moduleIcon, selectedOutputFormats, knowledgeSourcesRaw,
    onSaveSuccess, onApplyReview, onUpgradeThinking,
    configSnapshot, sourceManifest, rerunOf,
  } = props;

  // Derive trail display values — prefer per-message configSnapshot over live store state
  const snap = configSnapshot ?? {};
  const trailModel      = (snap.model as string)                ?? model;
  const trailThinking   = (snap.thinking as string)             ?? thinking ?? 'quick';
  const trailCreativity = (snap.creativity as string)           ?? creativity ?? 'balanced';
  const trailTransp     = (snap.transparencyLevel as 0 | 1 | 2) ?? transparencyLevel ?? 0;
  const trailTone       = (snap.writingTone as string)          ?? writingTone;
  const trailAudience   = (snap.audience as string)             ?? audience;
  const trailChannel    = (snap.channel as string)              ?? channel;
  const trailLang       = (snap.outputLanguage as string)       ?? outputLanguage;
  const trailPersonas   = (snap.selectedPersonas as string[])   ?? selectedPersonas;
  const trailSkills     = (snap.selectedSkills as string[])     ?? selectedSkills;
  const trailMeta       = (snap.metaCognitiveEnabled as boolean) ?? metaCognitiveEnabled;
  const trailMultiPersp = (snap.multiPerspective as boolean)    ?? multiPerspective;
  const trailStructRef  = (snap.structureReference as typeof structureReference) ?? structureReference;

  const [activePanel, setActivePanel] = useState<PanelId>(null);

  // Full Prompt state
  const [promptText, setPromptText] = useState('');
  const [promptTokens, setPromptTokens] = useState(0);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // Save module state
  const [saveModuleName, setSaveModuleName] = useState('');
  const [savingModule, setSavingModule] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Trust certificate download state
  const [certLoading, setCertLoading] = useState(false);

  // Feedback state — chip fills teal once feedback is submitted
  const [feedbackDone, setFeedbackDone] = useState(false);

  // Trust score state
  const [trustScore, setTrustScore] = useState<SessionQualityScore | null>(null);
  const [trustLoading, setTrustLoading] = useState(false);

  // VER-02/03: Version history state
  interface VersionSummary { id: number; version_number: number; label: string | null; created_at: string; content_length: number }
  const [versionList, setVersionList] = useState<VersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [latestDiff, setLatestDiff] = useState<string | null>(null);

  // Wave 2.2 "Export run (.anton)" state
  const [exportSign, setExportSign] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);

  // Wave 2.3 "Rerun with…" state
  const lastRunModel = ((configSnapshot?.model as string) ?? model) as ModelId;
  const [rerunModel, setRerunModel] = useState<ModelId>(lastRunModel);
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [rerunData, setRerunData] = useState<RerunComparisonData | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  // Completeness breakdown state — fetched from /api/benchmark on demand
  interface BenchmarkResult { score: number; found: string[]; missing: string[]; suggestions: string[] }
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkResult | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [showBenchmarkBreakdown, setShowBenchmarkBreakdown] = useState(false);

  const togglePanel = (id: PanelId & string) => {
    setActivePanel((prev) => (prev === id ? null : id));
  };

  // Fetch benchmark breakdown when user clicks completeness
  useEffect(() => {
    if (showBenchmarkBreakdown && !benchmarkData && !benchmarkLoading && outputContent) {
      setBenchmarkLoading(true);
      fetch('/api/benchmark', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: outputContent, moduleId }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setBenchmarkData(data); })
        .catch(() => {})
        .finally(() => setBenchmarkLoading(false));
    }
  }, [showBenchmarkBreakdown]);

  // Reset trust score when session changes so we don't show a stale score from a previous session
  useEffect(() => {
    setTrustScore(null);
    setTrustLoading(false);
  }, [sessionId]);

  // Fetch quality score when trust panel opens — with retry (scoring is async, may not be ready yet)
  useEffect(() => {
    if (activePanel !== 'trust' || !sessionId || trustScore || trustLoading) return;
    let cancelled = false;
    setTrustLoading(true);
    const tryFetch = async (attempt: number): Promise<void> => {
      if (cancelled) return;
      const score = await getSessionQualityScore(sessionId).catch(() => null);
      if (cancelled) return;
      if (score) {
        setTrustScore(score);
        setTrustLoading(false);
        return;
      }
      if (attempt < 5) {
        // Retry with short delays: 800ms, 1.6s, 2.4s, 3.2s
        await new Promise<void>((r) => setTimeout(r, 800 * attempt));
        return tryFetch(attempt + 1);
      }
      setTrustLoading(false);
    };
    tryFetch(1);
    return () => { cancelled = true; };
  }, [activePanel, sessionId]);

  // VER-02/03: Fetch version list + latest diff when history panel opens
  useEffect(() => {
    if (activePanel !== 'history') return;
    const entityId = sessionId || moduleId;
    if (!entityId) return;
    setVersionsLoading(true);
    setLatestDiff(null);
    fetch(`/api/versions/output/${encodeURIComponent(entityId)}`, { headers: getAuthHeader() })
      .then((r) => r.ok ? r.json() as Promise<VersionSummary[]> : [])
      .then((data) => {
        setVersionList(data);
        if (data.length >= 2) {
          const [newest, older] = data; // newest first
          fetch(`/api/versions/diff?oldId=${older.id}&newId=${newest.id}`, { headers: getAuthHeader() })
            .then((r) => r.ok ? r.json() as Promise<{ semanticSummary: string }> : null)
            .then((d) => { if (d) setLatestDiff(d.semanticSummary); })
            .catch(() => {});
        }
      })
      .catch(() => setVersionList([]))
      .finally(() => setVersionsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel]);

  // Determine if thinking content is available
  const hasThinkingContent = !!(streamingThinking || thinkingContent);
  const isStreamingThinking = isStreaming && !!streamingThinking;
  const displayThinking = isStreaming ? streamingThinking : thinkingContent;

  // ── Full Prompt fetch ──────────────────────────────────────

  const handleLoadPrompt = async () => {
    setPromptLoading(true);
    try {
      const result = await fetchPromptPreview({
        model,
        thinking,
        creativity,
        moduleId,
        areaId,
        systemPrompt,
        outputInstruction: buildOutputInstruction(selectedOutputFormats) || undefined,
        plainTextMode,
        selectedPersonas,
        selectedSkills,
        multiPerspective,
        metaCognitiveEnabled,
        structureReference,
        transparencyLevel,
        writingTone,
        emojiEnabled,
        audience,
        channel,
        outputLanguage,
        knowledgeSources,
        uploadedFileIds,
      });
      setPromptText(result.prompt);
      setPromptTokens(result.estimatedTokens);
    } catch {
      setPromptText('Failed to load prompt. Please try again.');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(promptText);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  // ── Rerun with… (Wave 2.3) ─────────────────────────────────

  const handleRerun = async () => {
    if (!sessionId || rerunLoading) return;
    if (rerunModel === lastRunModel) {
      setRerunError('Pick a different model — this output was already produced by that model.');
      return;
    }
    setRerunLoading(true);
    setRerunError(null);
    try {
      const res = await fetchWithAuth('/api/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, newModelId: rerunModel, areaId }),
      });
      const data = (await res.json()) as RerunComparisonData & { error?: string };
      if (!res.ok) {
        setRerunError(String(data.error ?? 'Rerun failed'));
        return;
      }
      setRerunData(data);
      setShowComparison(true);
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : 'Rerun failed');
    } finally {
      setRerunLoading(false);
    }
  };

  // ── Export run as .anton (Wave 2.2) ────────────────────────

  const handleExportRun = async () => {
    if (!sessionId || exportLoading) return;
    setExportLoading(true);
    setExportError(null);
    try {
      const res = await fetchWithAuth('/api/exchange/export-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, sign: exportSign }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `module-run-${sessionId.slice(0, 8)}.anton`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 2500);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  // ── Save as module ─────────────────────────────────────────

  const handleSaveAsModule = async () => {
    if (!saveModuleName.trim()) return;
    setSavingModule(true);
    try {
      await createCustomModule({
        name: saveModuleName.trim(),
        short_name: saveModuleName.trim().slice(0, 20),
        description: `Saved from ${moduleLabel || moduleId} module`,
        icon: moduleIcon || 'Puzzle',
        area: 'custom',
        system_prompt: systemPrompt,
        config: {
          outputFormats: selectedOutputFormats,
          personas: selectedPersonas,
          skills: selectedSkills,
          thinking,
          creativity,
          model,
          knowledgeSources: knowledgeSourcesRaw,
        },
      });
      setSavedFlash(true);
      setSaveModuleName('');
      setTimeout(() => setSavedFlash(false), 2500);
      onSaveSuccess?.();
    } catch {
      // ignore
    } finally {
      setSavingModule(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Chip bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-adv-card px-3 py-2">
        {CHIPS.map((chip) => {
          const Icon = chip.icon;
          const isActive = activePanel === chip.id;
          const isThinkingChip = chip.id === 'thinking';
          const isFeedbackChip = chip.id === 'feedback';
          const isFeedbackDone = isFeedbackChip && feedbackDone;
          const disabled = (isStreaming && !isThinkingChip) || ((chip.id === 'rerun' || chip.id === 'exportRun') && !sessionId);

          return (
            <button
              key={chip.id}
              onClick={() => !disabled && togglePanel(chip.id)}
              disabled={disabled}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                isActive || isFeedbackDone
                  ? 'border-adv-teal bg-adv-teal/10 text-adv-teal'
                  : disabled
                  ? 'border-border bg-adv-dark text-adv-gray opacity-50 cursor-not-allowed'
                  : 'border-border bg-adv-dark text-adv-gray hover:border-adv-teal/50 hover:text-adv-off-white'
              }`}
            >
              <Icon
                className={`h-3.5 w-3.5 ${
                  isThinkingChip && isStreamingThinking ? 'animate-pulse text-adv-teal' : ''
                }`}
              />
              {chip.label}
            </button>
          );
        })}
        {rerunOf && (
          <span
            title={`This output is a rerun of message ${rerunOf} with a different model`}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-adv-teal/40 bg-adv-teal/10 px-2 py-0.5 text-[10px] font-medium text-adv-teal"
          >
            <GitCompare className="h-2.5 w-2.5" />
            Rerun of earlier output
          </span>
        )}
      </div>

      {/* Active panel content */}
      {activePanel && (
        <div className="rounded-xl border border-border bg-adv-card p-4">
          {/* ── Citations Panel ────────────────────────────── */}
          {activePanel === 'citations' && (
            <CitationVerifier text={outputContent} embedded sourceManifest={sourceManifest} />
          )}

          {/* ── Review Panel ──────────────────────────────── */}
          {activePanel === 'review' && (
            <ReviewLauncher
              content={outputContent}
              model={model}
              sessionId={sessionId}
              embedded
              onApplyReview={onApplyReview}
            />
          )}

          {/* ── Thinking Panel ────────────────────────────── */}
          {activePanel === 'thinking' && (
            <div>
              {isStreamingThinking && (
                <div className="mb-2 flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 animate-pulse text-adv-teal" />
                  <span className="text-xs font-medium text-adv-teal">Live Reasoning...</span>
                </div>
              )}
              {!isStreaming && thinkingContent && (
                <div className="mb-2 flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-adv-gray" />
                  <span className="text-xs font-medium text-adv-gray">Reasoning from last response</span>
                </div>
              )}
              {displayThinking ? (
                <div className="rounded-lg bg-adv-dark p-3">
                  <div className="prose-output max-w-none text-adv-gray [&_strong]:text-adv-gray [&_h1]:text-adv-gray [&_h2]:text-adv-gray [&_h3]:text-adv-gray">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayThinking}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-adv-dark p-4 text-center">
                  <Brain className="mx-auto mb-2 h-6 w-6 text-adv-gray" />
                  <p className="text-sm text-adv-gray">No thinking content available.</p>
                  <p className="mt-1 text-xs text-adv-gray">
                    Try using &quot;Think Hard&quot; or &quot;Investigate&quot; thinking level to enable extended reasoning.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Full Prompt Panel ─────────────────────────── */}
          {activePanel === 'prompt' && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-adv-off-white">Composed System Prompt</span>
                <div className="flex items-center gap-2">
                  {promptTokens > 0 && (
                    <span className="text-[11px] text-adv-gray">
                      ~{promptTokens.toLocaleString()} tokens
                    </span>
                  )}
                  {promptText && (
                    <button
                      onClick={handleCopyPrompt}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                    >
                      {promptCopied ? <Check className="h-3 w-3 text-adv-green" /> : <Copy className="h-3 w-3" />}
                      {promptCopied ? 'Copied' : 'Copy'}
                    </button>
                  )}
                  <button
                    onClick={handleLoadPrompt}
                    disabled={promptLoading}
                    className="flex items-center gap-1 rounded-md bg-adv-teal/10 border border-adv-teal/30 px-2.5 py-1 text-[11px] font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors disabled:opacity-50"
                  >
                    {promptLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    {promptText ? 'Refresh' : 'Load Prompt'}
                  </button>
                </div>
              </div>
              {promptText ? (
                <pre className="rounded-lg bg-adv-dark p-3 text-xs text-adv-gray font-mono whitespace-pre-wrap leading-relaxed">
                  {promptText}
                </pre>
              ) : (
                <div className="rounded-lg bg-adv-dark p-4 text-center">
                  <ClipboardList className="mx-auto mb-2 h-6 w-6 text-adv-gray" />
                  <p className="text-sm text-adv-gray">
                    Click &quot;Load Prompt&quot; to see the full system prompt being sent to Claude.
                  </p>
                  <p className="mt-1 text-xs text-adv-gray">
                    This includes all layers: foundation, module prompt, personas, skills, output format instructions, and knowledge sources.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Rerun with… Panel (Wave 2.3) ──────────────── */}
          {activePanel === 'rerun' && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-adv-teal" />
                <span className="text-xs font-medium text-adv-off-white">Rerun with another model</span>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-adv-gray">
                Re-executes this output with the exact same configuration (thinking, formats, personas, skills, knowledge sources)
                but a different model, then shows both outputs side by side with a paragraph-level diff.
                The original was produced by <span className="font-medium text-adv-off-white">{lastRunModel}</span>.
                Both runs stay in this session&apos;s history.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <ModelSelector value={rerunModel} onChange={setRerunModel} variant="dropdown" />
                <button
                  onClick={handleRerun}
                  disabled={rerunLoading || !sessionId || rerunModel === lastRunModel}
                  className="flex h-[42px] items-center justify-center gap-2 rounded-lg bg-adv-teal px-4 text-xs font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
                >
                  {rerunLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompare className="h-3.5 w-3.5" />}
                  {rerunLoading ? 'Running…' : 'Run comparison'}
                </button>
              </div>
              {rerunModel === lastRunModel && !rerunLoading && (
                <p className="mt-2 text-[11px] text-adv-gray">Pick a different model than the one that produced this output.</p>
              )}
              {rerunLoading && (
                <p className="mt-2 text-[11px] text-adv-gray">
                  The rerun goes through the full pipeline (knowledge resolution, prompt assembly, model call) — this can take a few minutes for deep-thinking runs.
                </p>
              )}
              {rerunError && (
                <p className="mt-2 text-xs text-adv-red">{rerunError}</p>
              )}
              {rerunData && !showComparison && (
                <button
                  onClick={() => setShowComparison(true)}
                  className="mt-3 flex items-center gap-1.5 rounded-lg border border-adv-teal/30 bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal transition-colors hover:bg-adv-teal/20"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  Reopen last comparison ({rerunData.rerun.modelId})
                </button>
              )}
            </div>
          )}

          {/* ── Export run Panel (Wave 2.2) ────────────────── */}
          {activePanel === 'exportRun' && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <FileDown className="h-4 w-4 text-adv-teal" />
                <span className="text-xs font-medium text-adv-off-white">Export run (.anton)</span>
              </div>
              <p className="mb-2 text-xs leading-relaxed text-adv-gray">
                Packages this run for a coworker: the composed system prompt, the exact configuration,
                the input and output, and a hash manifest of every knowledge source. They can import it
                on any ANTON as a read-only session and reproduce it with &quot;Rerun with…&quot;.
              </p>
              <p className="mb-3 text-[11px] leading-relaxed text-adv-gray">
                Honest limits: source <span className="font-medium text-adv-off-white">contents</span> (files, folders, URLs)
                do not travel — only their names and hashes. No seed either; reproduction means same prompt + config,
                not a bit-identical output.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-adv-gray">
                  <input
                    type="checkbox"
                    checked={exportSign}
                    onChange={(e) => setExportSign(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#2DD4A8]"
                  />
                  Sign with this instance&apos;s key (Ed25519 provenance)
                </label>
                <button
                  onClick={handleExportRun}
                  disabled={exportLoading || !sessionId}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
                >
                  {exportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                  {exportLoading ? 'Packaging…' : 'Download .anton'}
                </button>
                {exportDone && <span className="text-xs text-adv-green">Exported.</span>}
              </div>
              {exportError && <p className="mt-2 text-xs text-adv-red">{exportError}</p>}
            </div>
          )}

          {/* ── Feedback Panel ────────────────────────────── */}
          {activePanel === 'feedback' && (
            <FeedbackWidget
              sessionId={sessionId}
              moduleId={moduleId}
              areaId={areaId}
              onSubmitted={() => setFeedbackDone(true)}
            />
          )}

          {/* ── Save as Module Panel ──────────────────────── */}
          {activePanel === 'save' && (
            <div>
              <p className="mb-3 text-xs text-adv-gray">
                Save the current configuration (system prompt, output formats, personas, skills, and settings) as a reusable custom module.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveModuleName}
                  onChange={(e) => setSaveModuleName(e.target.value)}
                  placeholder="Module name"
                  className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveAsModule()}
                />
                <button
                  onClick={handleSaveAsModule}
                  disabled={savingModule || !saveModuleName.trim()}
                  className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                >
                  {savingModule ? 'Saving...' : 'Save'}
                </button>
              </div>
              {savedFlash && (
                <p className="mt-2 text-xs text-adv-green">Module saved successfully.</p>
              )}

              {/* Trust Certificate download */}
              {sessionId && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-xs text-adv-gray">
                    Download a PDF trust certificate documenting the quality score, model, and session metadata for this output.
                  </p>
                  <button
                    onClick={async () => {
                      if (!sessionId || certLoading) return;
                      setCertLoading(true);
                      try {
                        const blob = await exportTrustCertificate(sessionId);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `trust-certificate-${sessionId.slice(0, 8)}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch { /* non-fatal */ }
                      finally { setCertLoading(false); }
                    }}
                    disabled={certLoading}
                    className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors disabled:opacity-50"
                  >
                    {certLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Award className="h-3.5 w-3.5" />
                    )}
                    {certLoading ? 'Generating...' : 'Download Trust Certificate'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Trust Score Panel ────────────────────────── */}
          {activePanel === 'trust' && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-adv-teal" />
                <span className="text-xs font-medium text-adv-off-white">Trust Score</span>
                <div className="relative ml-0.5 group">
                  <Info className="h-3.5 w-3.5 cursor-help text-adv-gray hover:text-adv-teal transition-colors" />
                  <div className="pointer-events-none absolute bottom-5 left-0 z-50 w-64 rounded-lg border border-border bg-adv-dark p-3 text-[11px] leading-relaxed text-adv-gray opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                    <p className="mb-1.5 font-semibold text-adv-off-white">What is the Trust Score?</p>
                    <p>After every output, Claude Haiku reads the response and rates it across five quality dimensions on a 0–10 scale:</p>
                    <ul className="mt-1.5 space-y-0.5 pl-2">
                      <li>· <span className="text-adv-off-white">Completeness</span> — checks for key sections: Executive Summary, Introduction, Findings / Analysis, Recommendations / Actions, Conclusion, Implementation / Roadmap</li>
                      <li>· <span className="text-adv-off-white">Accuracy</span> — factual reliability and qualified claims</li>
                      <li>· <span className="text-adv-off-white">Structure</span> — clear headings, bullet lists, easy to navigate</li>
                      <li>· <span className="text-adv-off-white">Actionability</span> — specific guidance with owners / timelines</li>
                      <li>· <span className="text-adv-off-white">Citations</span> — references to regulations, articles, frameworks</li>
                    </ul>
                    <p className="mt-1.5 text-adv-gray">Scores are compared to your module's historical baseline to flag regressions.</p>
                  </div>
                </div>
                <span className="ml-auto text-xs text-adv-gray">Scored by Claude Haiku</span>
              </div>
              {trustLoading ? (
                <div className="flex items-center gap-2 text-xs text-adv-gray">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Scoring output...
                </div>
              ) : trustScore ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 text-xl font-bold ${
                      trustScore.overall >= 8 ? 'border-adv-green text-adv-green' :
                      trustScore.overall >= 6 ? 'border-adv-teal text-adv-teal' :
                      trustScore.overall >= 4 ? 'border-adv-gold text-adv-gold' :
                      'border-adv-red text-adv-red'
                    }`}>
                      {trustScore.overall.toFixed(1)}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-adv-off-white">Overall Quality</p>
                      <p className="text-[11px] text-adv-gray">Out of 10</p>
                      {trustScore.isRegression && (
                        <p className="mt-0.5 text-[11px] text-adv-gold">⚠ Below module baseline</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { label: 'Completeness', val: trustScore.completeness },
                      { label: 'Accuracy', val: trustScore.accuracy },
                      { label: 'Structure', val: trustScore.structure },
                      { label: 'Actionability', val: trustScore.actionability },
                      { label: 'Citations', val: trustScore.citations },
                    ] as { label: string; val: number }[]).map(({ label, val }) => {
                      const isCompleteness = label === 'Completeness';
                      return (
                        <div
                          key={label}
                          className={`rounded-md bg-adv-dark p-2 ${isCompleteness ? 'cursor-pointer hover:bg-adv-dark-2 transition-colors' : ''}`}
                          onClick={isCompleteness ? () => setShowBenchmarkBreakdown((v) => !v) : undefined}
                          title={isCompleteness ? 'Click to see what\'s expected vs. missing' : undefined}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs text-adv-gray">{label}</span>
                            <div className="flex items-center gap-1">
                              <span className={`text-xs font-medium ${
                                val >= 8 ? 'text-adv-green' : val >= 6 ? 'text-adv-teal' : val >= 4 ? 'text-adv-gold' : 'text-adv-red'
                              }`}>{val.toFixed(1)}</span>
                              {isCompleteness && (
                                <ChevronRight className={`h-2.5 w-2.5 text-adv-gray transition-transform ${showBenchmarkBreakdown ? 'rotate-90' : ''}`} />
                              )}
                            </div>
                          </div>
                          <div className="h-1 rounded-full bg-adv-dark-2">
                            <div
                              className={`h-1 rounded-full transition-all ${
                                val >= 8 ? 'bg-adv-green' : val >= 6 ? 'bg-adv-teal' : val >= 4 ? 'bg-adv-gold' : 'bg-adv-red'
                              }`}
                              style={{ width: `${val * 10}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Completeness breakdown — shown when user clicks the Completeness cell */}
                  {showBenchmarkBreakdown && (
                    <div className="mt-2 rounded-md border border-adv-teal/20 bg-adv-dark p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-teal">What's expected vs. missing</p>
                      {benchmarkLoading ? (
                        <div className="flex items-center gap-2 text-[11px] text-adv-gray">
                          <Loader2 className="h-3 w-3 animate-spin" /> Checking components...
                        </div>
                      ) : benchmarkData ? (
                        <div className="space-y-2">
                          {benchmarkData.found.length > 0 && (
                            <div className="space-y-1">
                              {benchmarkData.found.map((c) => (
                                <div key={c} className="flex items-center gap-1.5">
                                  <CheckCircle2 className="h-3 w-3 shrink-0 text-adv-green" />
                                  <span className="text-[11px] text-adv-gray">{c}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {benchmarkData.missing.length > 0 && (
                            <div className="space-y-1">
                              {benchmarkData.missing.map((c) => (
                                <div key={c} className="flex items-center gap-1.5">
                                  <XCircle className="h-3 w-3 shrink-0 text-adv-red" />
                                  <span className="text-[11px] text-adv-gray">{c}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {benchmarkData.suggestions.length > 0 && (
                            <div className="mt-2 border-t border-border pt-2">
                              {benchmarkData.suggestions.slice(0, 2).map((s) => (
                                <p key={s} className="text-xs leading-relaxed text-adv-gray">· {s}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-adv-gray">No breakdown available.</p>
                      )}
                    </div>
                  )}

                  {/* Haiku reasoning — strengths / weaknesses / suggestion */}
                  {trustScore.reasoning && (
                    (trustScore.reasoning.strengths?.length || trustScore.reasoning.weaknesses?.length || trustScore.reasoning.improvementSuggestion) ? (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        {trustScore.reasoning.strengths && trustScore.reasoning.strengths.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-adv-green">✓ Strengths</p>
                            {trustScore.reasoning.strengths.map((s, i) => (
                              <p key={i} className="text-[11px] text-adv-gray leading-relaxed">· {s}</p>
                            ))}
                          </div>
                        )}
                        {trustScore.reasoning.weaknesses && trustScore.reasoning.weaknesses.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-adv-gold">⚠ Weaknesses</p>
                            {trustScore.reasoning.weaknesses.map((w, i) => (
                              <p key={i} className="text-[11px] text-adv-gray leading-relaxed">· {w}</p>
                            ))}
                          </div>
                        )}
                        {trustScore.reasoning.improvementSuggestion && (
                          <div className="rounded bg-adv-teal-soft px-2 py-1.5">
                            <span className="text-xs font-medium text-adv-teal">💡 </span>
                            <span className="text-[11px] italic text-adv-gray">{trustScore.reasoning.improvementSuggestion}</span>
                          </div>
                        )}
                      </div>
                    ) : null
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-adv-dark p-4 text-center">
                  <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-adv-gray" />
                  <p className="text-sm text-adv-gray">Scoring in progress…</p>
                  <p className="mt-1 text-xs text-adv-gray">
                    Claude Haiku is reviewing the output. Reopen this panel in a moment.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Version History Panel ────────────────────── */}
          {activePanel === 'history' && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-adv-teal" />
                  <span className="text-xs font-medium text-adv-off-white">Output History</span>
                  {versionList.length > 0 && (
                    <span className="rounded-full bg-adv-teal/20 px-1.5 py-0.5 text-[10px] font-medium text-adv-teal">
                      {versionList.length} run{versionList.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {(sessionId || moduleId) && versionList.length > 0 && (
                  <a
                    href={`/versions?entityType=output&entityId=${encodeURIComponent(sessionId || moduleId || '')}`}
                    className="text-[11px] text-adv-teal hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Compare all
                  </a>
                )}
              </div>
              {versionsLoading ? (
                <p className="py-2 text-xs text-adv-gray">Loading versions…</p>
              ) : versionList.length === 0 ? (
                <div className="rounded-lg bg-adv-dark p-4 text-center">
                  <History className="mx-auto mb-2 h-5 w-5 text-adv-gray" />
                  <p className="text-xs text-adv-gray">No saved versions yet.</p>
                  <p className="mt-1 text-[11px] text-adv-gray">Re-run this module to generate a v2 and unlock comparison.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {latestDiff && (
                    <div className="mb-2 rounded-md border border-adv-teal/20 bg-adv-teal-soft px-3 py-2">
                      <p className="text-[11px] text-adv-teal">Latest change: {latestDiff}</p>
                    </div>
                  )}
                  {versionList.slice(0, 6).map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-md bg-adv-dark px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-adv-off-white">v{v.version_number}</span>
                        {v.label && <span className="text-[11px] text-adv-gray">{v.label}</span>}
                      </div>
                      <span className="text-[11px] text-adv-gray">
                        {new Date(v.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── How ANTON Thought Panel ───────────────────── */}
          {activePanel === 'trail' && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-adv-teal" />
                <span className="text-xs font-medium text-adv-off-white">How ANTON Thought</span>
              </div>
              <div className="space-y-1.5">
                {([
                  { label: 'Model', value: trailModel, color: 'text-adv-blue' },
                  { label: 'Thinking', value: trailThinking, color: 'text-adv-teal' },
                  { label: 'Creativity', value: trailCreativity, color: 'text-adv-teal' },
                  { label: 'Transparency', value: `Level ${trailTransp}`, color: 'text-adv-gray' },
                  ...(trailTone ? [{ label: 'Tone', value: trailTone, color: 'text-adv-gray' }] : []),
                  ...(trailAudience ? [{ label: 'Audience', value: trailAudience, color: 'text-adv-gray' }] : []),
                  ...(trailChannel ? [{ label: 'Channel', value: trailChannel, color: 'text-adv-gray' }] : []),
                  ...(trailLang && trailLang !== 'en' ? [{ label: 'Language', value: trailLang, color: 'text-adv-gray' }] : []),
                  ...(trailPersonas && trailPersonas.length > 0 ? [{ label: 'Personas', value: trailPersonas.join(', '), color: 'text-adv-gold' }] : []),
                  ...(trailSkills && trailSkills.length > 0 ? [{ label: 'Skills', value: trailSkills.join(', '), color: 'text-adv-gold' }] : []),
                  ...(trailMultiPersp ? [{ label: 'Multi-Perspective', value: 'Enabled', color: 'text-adv-teal' }] : []),
                  ...(trailMeta ? [{ label: 'Meta-Cognitive', value: 'Enabled', color: 'text-adv-teal' }] : []),
                  ...(trailStructRef ? [{ label: 'Structure Ref', value: trailStructRef.mode + (trailStructRef.fileName ? ` · ${trailStructRef.fileName}` : ''), color: 'text-adv-gray' }] : []),
                ] as { label: string; value: string; color: string }[]).map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-md bg-adv-dark px-3 py-2">
                    <span className="shrink-0 text-[11px] text-adv-gray">{label}</span>
                    <span className={`max-w-[60%] truncate text-right text-[11px] font-medium ${color}`} title={value}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Rerun comparison modal (Wave 2.3) ── */}
      {showComparison && rerunData && (
        <RerunComparison data={rerunData} onClose={() => setShowComparison(false)} />
      )}

      {/* ── Go Deeper prompt ── show when output exists and not at max thinking */}
      {!isStreaming && outputContent && onUpgradeThinking && thinking !== 'investigate' && (
        <GoDeeperPrompt thinking={thinking} onUpgrade={onUpgradeThinking} />
      )}

      {/* ── Suggested Next Steps ── show after output, based on moduleId */}
      {!isStreaming && outputContent && moduleId && moduleId !== 'open-chat' && (
        <SuggestedNextSteps moduleId={moduleId} />
      )}
    </div>
  );
}

// ── Go Deeper Prompt ─────────────────────────────────────────────────────────

const THINKING_LABELS: Record<string, string> = {
  quick:      'Quick',
  think:      'Think',
  think_hard: 'Think Hard',
  investigate: 'Investigate',
};

function GoDeeperPrompt({
  thinking,
  onUpgrade,
}: {
  thinking: string;
  onUpgrade: (level: 'think_hard' | 'investigate') => void;
}) {
  const nextLevel = thinking === 'think' ? 'think_hard' : 'investigate';
  const nextLabel = THINKING_LABELS[nextLevel];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-adv-teal/20 bg-adv-teal-soft px-4 py-2.5">
      <TrendingUp className="h-3.5 w-3.5 text-adv-teal shrink-0" />
      <p className="text-xs text-adv-gray flex-1">
        Generated at <span className="text-adv-off-white font-medium">{THINKING_LABELS[thinking] ?? thinking}</span>.
        Re-run at <span className="text-adv-teal font-medium">{nextLabel}</span> for deeper analysis.
      </p>
      <button
        onClick={() => onUpgrade(nextLevel as 'think_hard' | 'investigate')}
        className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-3 py-1 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors shrink-0"
      >
        Switch to {nextLabel}
        <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Suggested Next Steps ─────────────────────────────────────────────────────

const NEXT_STEPS: Record<string, Array<{ label: string; description: string; url: string }>> = {
  'gap-analysis': [
    { label: 'Create Remediation Policy',   description: 'Draft a policy that addresses the identified gaps', url: '/module/document-creation' },
    { label: 'Build Action Plan',           description: 'Turn gap findings into a prioritised action plan',   url: '/module/document-creation' },
    { label: 'Generate Board Summary',      description: 'Produce an executive summary of findings',          url: '/module/document-creation' },
  ],
  'document-creation': [
    { label: 'Assess Risk Profile',         description: 'Run a risk assessment against the new policy',      url: '/module/risk-assessment' },
    { label: 'Run Gap Analysis',            description: 'Check for compliance gaps against regulations',     url: '/module/gap-analysis' },
    { label: 'Create Training Content',     description: 'Build staff training from the policy',              url: '/module/training-content' },
  ],
  'sanctions-advisory': [
    { label: 'Run Sanctions Gap Analysis',  description: 'Analyse your sanctions framework for gaps',         url: '/module/gap-analysis' },
    { label: 'Update Sanctions Policy',     description: 'Revise your sanctions policy to reflect findings',  url: '/module/document-creation' },
  ],
  'regulatory-monitor': [
    { label: 'Analyse Regulatory Impact',   description: 'Deep-dive impact analysis of the regulatory change', url: '/module/gap-analysis' },
    { label: 'Update Compliance Policy',    description: 'Revise affected policies to comply',                url: '/module/document-creation' },
  ],
  'risk-assessment': [
    { label: 'Document Risk Findings',      description: 'Create a formal risk report from the assessment',   url: '/module/document-creation' },
    { label: 'Build Remediation Plan',      description: 'Plan how to address the identified risks',          url: '/module/document-creation' },
  ],
  'training-content': [
    { label: 'Create Supporting Policy',    description: 'Draft a policy to underpin the training',           url: '/module/document-creation' },
    { label: 'Run Risk Assessment',         description: 'Validate training addresses key risk areas',        url: '/module/risk-assessment' },
  ],
  'data-management': [
    { label: 'Run Data Gap Analysis',       description: 'Identify data quality and completeness gaps',       url: '/module/gap-analysis' },
    { label: 'Document Data Standards',     description: 'Create a data management policy',                   url: '/module/document-creation' },
  ],
  'investigation-support': [
    { label: 'Document Investigation',      description: 'Create a formal case summary',                      url: '/module/document-creation' },
    { label: 'Assess Risk Indicators',      description: 'Run risk assessment on the patterns identified',    url: '/module/risk-assessment' },
  ],
};

function SuggestedNextSteps({ moduleId }: { moduleId: string }) {
  const steps = NEXT_STEPS[moduleId];
  if (!steps || steps.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
      <p className="text-xs font-medium text-adv-off-white flex items-center gap-2">
        <ArrowRight className="h-3.5 w-3.5 text-adv-teal" />
        Suggested next steps
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map((step) => (
          <a
            key={step.url + step.label}
            href={step.url}
            className="flex flex-col gap-1 rounded-lg border border-border bg-adv-dark px-3 py-2.5 hover:border-adv-teal/40 hover:bg-adv-dark-2 transition-colors group"
          >
            <span className="text-xs font-medium text-adv-off-white group-hover:text-adv-teal transition-colors">{step.label}</span>
            <span className="text-xs text-adv-gray leading-snug">{step.description}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
