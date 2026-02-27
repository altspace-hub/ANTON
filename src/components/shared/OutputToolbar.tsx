import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Search, Sparkles, Brain, ClipboardList, Puzzle, ThumbsUp, Copy, Check, RefreshCw, Loader2, ShieldCheck, ChevronDown, ChevronUp, Layers, ChevronRight, CheckCircle2, XCircle, Info, TrendingUp, ArrowRight, Award } from 'lucide-react';
import CitationVerifier from '@/components/shared/CitationVerifier';
import ReviewLauncher from '@/components/platform/ReviewLauncher';
import FeedbackWidget from '@/components/shared/FeedbackWidget';
import { fetchPromptPreview, createCustomModule, getSessionQualityScore, type SessionQualityScore, getAuthHeader, exportTrustCertificate } from '@/lib/api';
import { buildOutputInstruction } from '@/lib/output-format-definitions';

// ── Types ────────────────────────────────────────────────────

type PanelId = 'citations' | 'review' | 'thinking' | 'prompt' | 'feedback' | 'save' | 'trust' | 'trail' | null;

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
}

// ── Chip config ──────────────────────────────────────────────

const CHIPS: Array<{ id: PanelId & string; label: string; icon: React.ComponentType<{ className?: string }>; streamingOnly?: boolean }> = [
  { id: 'trust', label: 'Trust Score', icon: ShieldCheck },
  { id: 'trail', label: 'How ANTON Thought', icon: Layers },
  { id: 'citations', label: 'Citations', icon: Search },
  { id: 'review', label: 'Review', icon: Sparkles },
  { id: 'thinking', label: 'Thinking', icon: Brain, streamingOnly: false },
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
  } = props;

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
          const disabled = isStreaming && !isThinkingChip;

          return (
            <button
              key={chip.id}
              onClick={() => !disabled && togglePanel(chip.id)}
              disabled={disabled}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                isActive || isFeedbackDone
                  ? 'border-adv-teal bg-adv-teal/10 text-adv-teal'
                  : disabled
                  ? 'border-border bg-adv-dark text-adv-gray-med opacity-50 cursor-not-allowed'
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
      </div>

      {/* Active panel content */}
      {activePanel && (
        <div className="rounded-xl border border-border bg-adv-card p-4">
          {/* ── Citations Panel ────────────────────────────── */}
          {activePanel === 'citations' && (
            <CitationVerifier text={outputContent} embedded />
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
                  <div className="prose-output max-w-none text-adv-gray-med [&_strong]:text-adv-gray [&_h1]:text-adv-gray [&_h2]:text-adv-gray [&_h3]:text-adv-gray">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayThinking}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-adv-dark p-4 text-center">
                  <Brain className="mx-auto mb-2 h-6 w-6 text-adv-gray-med" />
                  <p className="text-sm text-adv-gray-med">No thinking content available.</p>
                  <p className="mt-1 text-xs text-adv-gray-med">
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
                    <span className="text-[11px] text-adv-gray-med">
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
                <pre className="rounded-lg bg-adv-dark p-3 text-xs text-adv-gray-med font-mono whitespace-pre-wrap leading-relaxed">
                  {promptText}
                </pre>
              ) : (
                <div className="rounded-lg bg-adv-dark p-4 text-center">
                  <ClipboardList className="mx-auto mb-2 h-6 w-6 text-adv-gray-med" />
                  <p className="text-sm text-adv-gray-med">
                    Click &quot;Load Prompt&quot; to see the full system prompt being sent to Claude.
                  </p>
                  <p className="mt-1 text-xs text-adv-gray-med">
                    This includes all layers: foundation, module prompt, personas, skills, output format instructions, and knowledge sources.
                  </p>
                </div>
              )}
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
              <p className="mb-3 text-xs text-adv-gray-med">
                Save the current configuration (system prompt, output formats, personas, skills, and settings) as a reusable custom module.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveModuleName}
                  onChange={(e) => setSaveModuleName(e.target.value)}
                  placeholder="Module name"
                  className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
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
                  <p className="mb-2 text-xs text-adv-gray-med">
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
                  <Info className="h-3.5 w-3.5 cursor-help text-adv-gray-med hover:text-adv-teal transition-colors" />
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
                    <p className="mt-1.5 text-adv-gray-med">Scores are compared to your module's historical baseline to flag regressions.</p>
                  </div>
                </div>
                <span className="ml-auto text-[10px] text-adv-gray-med">Scored by Claude Haiku</span>
              </div>
              {trustLoading ? (
                <div className="flex items-center gap-2 text-xs text-adv-gray-med">
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
                      <p className="text-[11px] text-adv-gray-med">Out of 10</p>
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
                            <span className="text-[10px] text-adv-gray-med">{label}</span>
                            <div className="flex items-center gap-1">
                              <span className={`text-[10px] font-medium ${
                                val >= 8 ? 'text-adv-green' : val >= 6 ? 'text-adv-teal' : val >= 4 ? 'text-adv-gold' : 'text-adv-red'
                              }`}>{val.toFixed(1)}</span>
                              {isCompleteness && (
                                <ChevronRight className={`h-2.5 w-2.5 text-adv-gray-med transition-transform ${showBenchmarkBreakdown ? 'rotate-90' : ''}`} />
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
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-adv-teal">What's expected vs. missing</p>
                      {benchmarkLoading ? (
                        <div className="flex items-center gap-2 text-[11px] text-adv-gray-med">
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
                                  <span className="text-[11px] text-adv-gray-med">{c}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {benchmarkData.suggestions.length > 0 && (
                            <div className="mt-2 border-t border-border pt-2">
                              {benchmarkData.suggestions.slice(0, 2).map((s) => (
                                <p key={s} className="text-[10px] leading-relaxed text-adv-gray-med">· {s}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-adv-gray-med">No breakdown available.</p>
                      )}
                    </div>
                  )}

                  {/* Haiku reasoning — strengths / weaknesses / suggestion */}
                  {trustScore.reasoning && (
                    (trustScore.reasoning.strengths?.length || trustScore.reasoning.weaknesses?.length || trustScore.reasoning.improvementSuggestion) ? (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        {trustScore.reasoning.strengths && trustScore.reasoning.strengths.length > 0 && (
                          <div>
                            <p className="mb-1 text-[10px] font-medium text-adv-green">✓ Strengths</p>
                            {trustScore.reasoning.strengths.map((s, i) => (
                              <p key={i} className="text-[11px] text-adv-gray leading-relaxed">· {s}</p>
                            ))}
                          </div>
                        )}
                        {trustScore.reasoning.weaknesses && trustScore.reasoning.weaknesses.length > 0 && (
                          <div>
                            <p className="mb-1 text-[10px] font-medium text-adv-gold">⚠ Weaknesses</p>
                            {trustScore.reasoning.weaknesses.map((w, i) => (
                              <p key={i} className="text-[11px] text-adv-gray leading-relaxed">· {w}</p>
                            ))}
                          </div>
                        )}
                        {trustScore.reasoning.improvementSuggestion && (
                          <div className="rounded bg-adv-teal-soft px-2 py-1.5">
                            <span className="text-[10px] font-medium text-adv-teal">💡 </span>
                            <span className="text-[11px] italic text-adv-gray">{trustScore.reasoning.improvementSuggestion}</span>
                          </div>
                        )}
                      </div>
                    ) : null
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-adv-dark p-4 text-center">
                  <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-adv-gray-med" />
                  <p className="text-sm text-adv-gray-med">Scoring in progress…</p>
                  <p className="mt-1 text-xs text-adv-gray-med">
                    Claude Haiku is reviewing the output. Reopen this panel in a moment.
                  </p>
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
                  { label: 'Model', value: model, color: 'text-adv-blue' },
                  { label: 'Thinking', value: thinking || 'quick', color: 'text-adv-teal' },
                  { label: 'Creativity', value: creativity || 'balanced', color: 'text-adv-teal' },
                  { label: 'Transparency', value: `Level ${transparencyLevel ?? 0}`, color: 'text-adv-gray' },
                  ...(writingTone ? [{ label: 'Tone', value: writingTone, color: 'text-adv-gray' }] : []),
                  ...(audience ? [{ label: 'Audience', value: audience, color: 'text-adv-gray' }] : []),
                  ...(channel ? [{ label: 'Channel', value: channel, color: 'text-adv-gray' }] : []),
                  ...(outputLanguage && outputLanguage !== 'en' ? [{ label: 'Language', value: outputLanguage, color: 'text-adv-gray' }] : []),
                  ...(selectedPersonas && selectedPersonas.length > 0 ? [{ label: 'Personas', value: selectedPersonas.join(', '), color: 'text-adv-gold' }] : []),
                  ...(selectedSkills && selectedSkills.length > 0 ? [{ label: 'Skills', value: selectedSkills.join(', '), color: 'text-adv-gold' }] : []),
                  ...(multiPerspective ? [{ label: 'Multi-Perspective', value: 'Enabled', color: 'text-adv-teal' }] : []),
                  ...(metaCognitiveEnabled ? [{ label: 'Meta-Cognitive', value: 'Enabled', color: 'text-adv-teal' }] : []),
                  ...(structureReference ? [{ label: 'Structure Ref', value: structureReference.mode + (structureReference.fileName ? ` · ${structureReference.fileName}` : ''), color: 'text-adv-gray' }] : []),
                ] as { label: string; value: string; color: string }[]).map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-md bg-adv-dark px-3 py-2">
                    <span className="shrink-0 text-[11px] text-adv-gray-med">{label}</span>
                    <span className={`max-w-[60%] truncate text-right text-[11px] font-medium ${color}`} title={value}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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
    { label: 'Create Remediation Policy',   description: 'Draft a policy that addresses the identified gaps', url: '/modules/document-creation' },
    { label: 'Build Action Plan',           description: 'Turn gap findings into a prioritised action plan',   url: '/modules/document-creation' },
    { label: 'Generate Board Summary',      description: 'Produce an executive summary of findings',          url: '/modules/document-creation' },
  ],
  'document-creation': [
    { label: 'Assess Risk Profile',         description: 'Run a risk assessment against the new policy',      url: '/modules/risk-assessment' },
    { label: 'Run Gap Analysis',            description: 'Check for compliance gaps against regulations',     url: '/modules/gap-analysis' },
    { label: 'Create Training Content',     description: 'Build staff training from the policy',              url: '/modules/training-content' },
  ],
  'sanctions-advisory': [
    { label: 'Run Sanctions Gap Analysis',  description: 'Analyse your sanctions framework for gaps',         url: '/modules/gap-analysis' },
    { label: 'Update Sanctions Policy',     description: 'Revise your sanctions policy to reflect findings',  url: '/modules/document-creation' },
  ],
  'regulatory-monitor': [
    { label: 'Analyse Regulatory Impact',   description: 'Deep-dive impact analysis of the regulatory change', url: '/modules/gap-analysis' },
    { label: 'Update Compliance Policy',    description: 'Revise affected policies to comply',                url: '/modules/document-creation' },
  ],
  'risk-assessment': [
    { label: 'Document Risk Findings',      description: 'Create a formal risk report from the assessment',   url: '/modules/document-creation' },
    { label: 'Build Remediation Plan',      description: 'Plan how to address the identified risks',          url: '/modules/document-creation' },
  ],
  'training-content': [
    { label: 'Create Supporting Policy',    description: 'Draft a policy to underpin the training',           url: '/modules/document-creation' },
    { label: 'Run Risk Assessment',         description: 'Validate training addresses key risk areas',        url: '/modules/risk-assessment' },
  ],
  'data-management': [
    { label: 'Run Data Gap Analysis',       description: 'Identify data quality and completeness gaps',       url: '/modules/gap-analysis' },
    { label: 'Document Data Standards',     description: 'Create a data management policy',                   url: '/modules/document-creation' },
  ],
  'investigation-support': [
    { label: 'Document Investigation',      description: 'Create a formal case summary',                      url: '/modules/document-creation' },
    { label: 'Assess Risk Indicators',      description: 'Run risk assessment on the patterns identified',    url: '/modules/risk-assessment' },
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
            <span className="text-[10px] text-adv-gray-med leading-snug">{step.description}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
