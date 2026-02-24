import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Search, Sparkles, Brain, ClipboardList, Puzzle, ThumbsUp, Copy, Check, RefreshCw, Loader2 } from 'lucide-react';
import CitationVerifier from '@/components/shared/CitationVerifier';
import ReviewLauncher from '@/components/platform/ReviewLauncher';
import FeedbackWidget from '@/components/shared/FeedbackWidget';
import { fetchPromptPreview, createCustomModule } from '@/lib/api';
import { buildOutputInstruction } from '@/lib/output-format-definitions';

// ── Types ────────────────────────────────────────────────────

type PanelId = 'citations' | 'review' | 'thinking' | 'prompt' | 'feedback' | 'save' | null;

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
}

// ── Chip config ──────────────────────────────────────────────

const CHIPS: Array<{ id: PanelId & string; label: string; icon: React.ComponentType<{ className?: string }>; streamingOnly?: boolean }> = [
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
    onSaveSuccess, onApplyReview,
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

  // Feedback state — chip fills teal once feedback is submitted
  const [feedbackDone, setFeedbackDone] = useState(false);

  const togglePanel = (id: PanelId & string) => {
    setActivePanel((prev) => (prev === id ? null : id));
  };

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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
