import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Shield, Scale, Briefcase, FileSearch, Zap, Send, Square, Copy, Check, Download, Upload, FileText, X as XIcon, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage, exportReviewPanelAnton, fetchWithAuth } from '@/lib/api';
import type { StreamEvent, ModelId } from '@/lib/types';
import { DOMAIN_REVIEWERS } from '@/lib/domain-reviewers';

interface ReviewMode {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Optional emoji icon — when set, rendered instead of the Lucide icon */
  emojiIcon?: string;
  description: string;
  instruction: string;
  accentColor: string;
  accentBg: string;
}

const REVIEW_MODES: ReviewMode[] = [
  {
    id: 'peer-review',
    label: 'Peer Review',
    icon: Users,
    description: 'Review this as a senior peer expert would: check reasoning, flag unsupported claims, suggest improvements.',
    instruction: 'You are a senior peer expert reviewing this document. Check the reasoning for soundness, flag any unsupported or weakly supported claims, identify logical gaps, and suggest concrete improvements. Be thorough but constructive — your role is to raise the quality, not to be destructive.',
    accentColor: 'text-adv-teal',
    accentBg: 'bg-adv-teal-dim',
  },
  {
    id: 'red-team',
    label: 'Red Team Challenge',
    icon: Shield,
    description: 'Try to find every flaw, weakness, and counterargument. Stress-test the logic aggressively.',
    instruction: 'You are a red team analyst. Your goal is to find every flaw, weakness, and counterargument in this document. Stress-test the logic aggressively. Assume a hostile audience. Leave no weak point unexamined. Be thorough and relentless — not personal, but analytically aggressive.',
    accentColor: 'text-adv-red',
    accentBg: 'bg-adv-red/10',
  },
  {
    id: 'legal-stress',
    label: 'Legal Stress Test',
    icon: Scale,
    description: 'Review through a legal lens: identify liability, ambiguity, missing definitions, regulatory exposure.',
    instruction: 'You are a senior legal counsel reviewing this document. Identify every instance of legal liability, ambiguity, missing definitions, undefined terms, and regulatory exposure. Flag anything that could create legal risk, be used against the organisation, or fail a legal challenge.',
    accentColor: 'text-adv-blue',
    accentBg: 'bg-adv-blue/10',
  },
  {
    id: 'executive-sanity',
    label: 'Executive Sanity Check',
    icon: Briefcase,
    description: 'Would a C-suite executive sign off on this? Flag anything unclear, risky, or that needs more evidence.',
    instruction: 'You are a C-suite executive reviewing this document before sign-off. Flag anything that is unclear to a non-specialist, risks embarrassing the organisation, lacks sufficient evidence, makes unsupported promises, or would raise questions from the board. Be direct and practical.',
    accentColor: 'text-adv-gold',
    accentBg: 'bg-adv-gold/10',
  },
  {
    id: 'regulatory-scrutiny',
    label: 'Regulatory Scrutiny',
    icon: FileSearch,
    description: 'Check against regulatory requirements. What would a regulator or auditor flag?',
    instruction: 'You are a financial regulator or senior auditor reviewing this document. Identify every gap, omission, ambiguity, or non-compliance that you would flag in a supervisory review. What requirements are not met? What evidence is missing? What would you require to be corrected before approval?',
    accentColor: 'text-adv-green',
    accentBg: 'bg-adv-green/10',
  },
  {
    id: 'devils-advocate',
    label: "Devil's Advocate",
    icon: Zap,
    description: "Argue the opposite of every conclusion. What's the strongest case against this?",
    instruction: "You are playing devil's advocate. Argue the opposite of every conclusion in this document. Build the strongest possible case against each key claim, recommendation, or finding. What evidence contradicts the conclusions? What alternative interpretations exist? What would a credible critic say?",
    accentColor: 'text-adv-gold',
    accentBg: 'bg-adv-gold/10',
  },
];

// Domain reviewers adapted to the local ReviewMode shape.
// The `icon` field uses a neutral Lucide icon as a fallback; the emoji is rendered via `emojiIcon`.
const DOMAIN_REVIEW_MODES: ReviewMode[] = DOMAIN_REVIEWERS.map((r) => ({
  id: r.id,
  label: r.name,
  icon: FileSearch, // fallback Lucide icon — emojiIcon takes precedence in render
  emojiIcon: r.icon,
  description: r.description,
  instruction: r.prompt,
  accentColor: 'text-adv-teal',
  accentBg: 'bg-adv-teal-dim',
}));

const BASE_SYSTEM_PROMPT = `You are Anton in Review Engine mode. You are an expert analytical reviewer.

After your review, always conclude with a structured section:

## Review Summary

**Executive Verdict:** [One sentence: pass / pass with conditions / fail and why]

**Key Strengths:**
- [Strength 1]
- [Strength 2]

**Critical Issues:**
| Issue | Severity | Recommendation |
|-------|----------|----------------|
| ... | High/Medium/Low | ... |

**Overall Score: [X]/10**

[Brief justification for the score]`;

const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

export default function ReviewEnginePage() {
  const { t } = useTranslation();
  const [transparencyLevel, setTransparencyLevel] = useState<0 | 1 | 2>(0);
  const [selectedModeId, setSelectedModeId] = useState<string>('peer-review');
  const [selectedModel, setSelectedModel] = useState<ModelId>('claude-opus-4-7');
  const [inputTab, setInputTab] = useState<'paste' | 'upload'>('paste');
  const [docContent, setDocContent] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; text: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const allReviewModes = [...REVIEW_MODES, ...DOMAIN_REVIEW_MODES];
  const selectedMode = allReviewModes.find((m) => m.id === selectedModeId) ?? REVIEW_MODES[0];
  const [exportingAnton, setExportingAnton] = useState(false);

  const handleExportReviewPanel = async () => {
    if (exportingAnton) return;
    setExportingAnton(true);
    try {
      const blob = await exportReviewPanelAnton({
        name: 'Review Engine Panel',
        description: 'Expert review perspectives from the Review Engine',
        reviewers: allReviewModes.map((m) => ({
          id: m.id,
          name: m.label,
          icon: m.emojiIcon,
          prompt: m.instruction,
          focusAreas: [],
        })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review-panel-${Date.now()}.anton`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* non-fatal */ }
    finally { setExportingAnton(false); }
  };

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setIsUploading(true);
    setUploadError('');
    const results: Array<{ name: string; text: string }> = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetchWithAuth('/api/files/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json() as { text?: string; content?: string; extractedText?: string };
        const text = data.text ?? data.content ?? data.extractedText ?? '';
        results.push({ name: file.name, text });
      } catch (err) {
        setUploadError(`Failed to read "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setUploadedFiles((prev) => [...prev, ...results]);
    setIsUploading(false);
    // Reset input so same file can be re-added
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeUploadedFile(index: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Combine pasted text and uploaded file texts for review
  const effectiveContent = [
    docContent.trim(),
    ...uploadedFiles.map((f) => `[Document: ${f.name}]\n\n${f.text.trim()}`),
  ].filter(Boolean).join('\n\n---\n\n');

  const handleRun = async () => {
    if (!effectiveContent || isStreaming) return;

    setIsStreaming(true);
    setStreamingText('');
    setFinalText('');

    const systemPrompt = `${selectedMode.instruction}\n\n${BASE_SYSTEM_PROMPT}`;
    const userMessage = `[DOCUMENT TO REVIEW]\n\n${effectiveContent}`;

    const controller = new AbortController();
    abortRef.current = controller;

    let fullText = '';

    try {
      const stream = streamMessage(
        {
          model: selectedModel,
          thinking: 'think_hard',
          creativity: 'strict',
          systemPrompt,
          userMessage,
          history: [],
          outputFormats: [],
          knowledgeSources: EMPTY_KS,
          transparencyLevel,
        },
        controller.signal
      );

      for await (const event of stream as AsyncGenerator<StreamEvent>) {
        if (event.type === 'text_delta') {
          fullText += event.content;
          setStreamingText(fullText);
        }
        if (event.type === 'error' || event.type === 'stream_end') break;
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error(err);
      }
    }

    setFinalText(fullText);
    setStreamingText('');
    setIsStreaming(false);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setFinalText(streamingText);
    setStreamingText('');
    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && inputTab === 'paste') {
      e.preventDefault();
      handleRun();
    }
  };

  const displayText = isStreaming ? streamingText : finalText;

  const handleCopy = () => {
    if (displayText) {
      navigator.clipboard.writeText(displayText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (displayText) {
      const blob = new Blob([displayText], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review-${selectedModeId}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
              <FileSearch className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">{t('review.title')}</h1>
              <p className="text-xs text-adv-gray">
                {t('review.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={handleExportReviewPanel}
            disabled={exportingAnton}
            className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors disabled:opacity-50"
            title="Export all review perspectives as a shareable .anton file"
          >
            {exportingAnton ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export Panel as .anton
          </button>
        </div>
      </div>

      {/* Split panel layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: Config panel */}
        <div className="flex w-[42%] shrink-0 flex-col overflow-y-auto border-r border-border bg-adv-dark-2 px-5 py-5 gap-5">
          {/* Mode selector */}
          <div>
            <label className="mb-3 block text-sm font-semibold text-adv-off-white">
              {t('review.reviewMode')}
            </label>

            {/* Standard review modes */}
            <div className="space-y-2">
              {REVIEW_MODES.map((mode) => {
                const Icon = mode.icon;
                const isSelected = selectedModeId === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedModeId(mode.id)}
                    disabled={isStreaming}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                      isSelected
                        ? 'border-adv-teal bg-adv-teal-dim'
                        : 'border-border bg-adv-card hover:border-adv-teal/40 hover:bg-adv-card'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isSelected ? mode.accentBg : 'bg-adv-dark'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${isSelected ? mode.accentColor : 'text-adv-gray'}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-medium ${
                            isSelected ? 'text-adv-teal' : 'text-adv-off-white'
                          }`}
                        >
                          {mode.label}
                        </div>
                        <div className="mt-0.5 text-xs text-adv-gray leading-relaxed">
                          {mode.description}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Domain Reviewers group */}
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
                Domain Reviewers
              </p>
              <div className="space-y-2">
                {DOMAIN_REVIEW_MODES.map((mode) => {
                  const isSelected = selectedModeId === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setSelectedModeId(mode.id)}
                      disabled={isStreaming}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                        isSelected
                          ? 'border-adv-teal bg-adv-teal-dim'
                          : 'border-border bg-adv-card hover:border-adv-teal/40 hover:bg-adv-card'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isSelected ? mode.accentBg : 'bg-adv-dark'
                          }`}
                        >
                          {mode.emojiIcon ? (
                            <span className="text-base leading-none">{mode.emojiIcon}</span>
                          ) : (
                            <mode.icon
                              className={`h-4 w-4 ${isSelected ? mode.accentColor : 'text-adv-gray'}`}
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-sm font-medium ${
                              isSelected ? 'text-adv-teal' : 'text-adv-off-white'
                            }`}
                          >
                            {mode.label}
                          </div>
                          <div className="mt-0.5 text-xs text-adv-gray leading-relaxed">
                            {mode.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Model selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Model for this review
            </label>
            <div className="flex items-center gap-2">
              {([
                { id: 'claude-opus-4-7', label: 'Opus (default)' },
                { id: 'claude-sonnet-4-6', label: 'Sonnet' },
                { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
              ] as { id: ModelId; label: string }[]).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  disabled={isStreaming}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectedModel === m.id
                      ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                      : 'border-border text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transparency toggle */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Transparency
            </label>
            <div className="flex gap-1.5">
              {([
                { level: 0 as const, label: 'Off' },
                { level: 1 as const, label: 'Summary' },
                { level: 2 as const, label: 'Detailed' },
              ]).map(({ level, label }) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setTransparencyLevel(level)}
                  disabled={isStreaming}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    transparencyLevel === level
                      ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                      : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Document input */}
          <div className="flex flex-col flex-1">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-adv-off-white">
                {t('review.documentToReview')}
              </label>
              {/* Tab toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                <button
                  onClick={() => setInputTab('paste')}
                  className={`px-3 py-1.5 font-medium transition-colors ${inputTab === 'paste' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
                >
                  {t('review.pasteText')}
                </button>
                <button
                  onClick={() => setInputTab('upload')}
                  className={`px-3 py-1.5 font-medium transition-colors ${inputTab === 'upload' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
                >
                  {t('review.uploadFiles')}
                </button>
              </div>
            </div>

            {inputTab === 'paste' ? (
              <>
                <textarea
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('review.pasteTextPlaceholder')}
                  className="flex-1 w-full resize-none rounded-xl border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  style={{ minHeight: '200px' }}
                  disabled={isStreaming}
                />
                <div className="mt-1 text-right text-xs text-adv-gray">
                  {docContent.length > 0
                    ? `~${Math.ceil(docContent.length / 4).toLocaleString()} tokens`
                    : t('review.ctrlEnterToRun')}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Drop zone / upload button */}
                <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${isUploading ? 'border-adv-teal/40 bg-adv-teal-soft' : 'border-border bg-adv-card hover:border-adv-teal/50 hover:bg-adv-card'}`}
                  style={{ minHeight: '120px' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isStreaming || isUploading}
                  />
                  {isUploading ? (
                    <span className="text-sm text-adv-teal animate-pulse">{t('review.readingFiles')}</span>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-adv-gray" />
                      <span className="text-sm text-adv-gray">{t('review.uploadPrompt')}</span>
                      <span className="text-xs text-adv-gray">{t('review.uploadFormats')}</span>
                    </>
                  )}
                </label>

                {/* Uploaded file list */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    {uploadedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-adv-teal" />
                        <span className="flex-1 truncate text-xs text-adv-off-white">{f.name}</span>
                        <span className="text-xs text-adv-gray shrink-0">
                          ~{Math.ceil(f.text.length / 4).toLocaleString()} tokens
                        </span>
                        <button
                          onClick={() => removeUploadedFile(i)}
                          className="text-adv-gray hover:text-adv-red transition-colors"
                          disabled={isStreaming}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="text-right text-xs text-adv-gray">
                      {uploadedFiles.length} {uploadedFiles.length > 1 ? t('review.files') : t('review.file')} · ~{Math.ceil(uploadedFiles.reduce((s, f) => s + f.text.length, 0) / 4).toLocaleString()} {t('review.tokensTotal')}
                    </div>
                  </div>
                )}

                {uploadError && (
                  <p className="text-xs text-adv-red">{uploadError}</p>
                )}
              </div>
            )}
          </div>

          {/* Run / Stop button */}
          {!isStreaming && !effectiveContent && (
            <p className="text-center text-xs text-adv-gray">
              {inputTab === 'paste' ? t('review.pasteTextToReview') : t('review.uploadFileToReview')}
            </p>
          )}
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-adv-red px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Square className="h-4 w-4" />
              {t('review.stopReview')}
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={!effectiveContent}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-adv-teal px-4 py-3 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {t('review.startReview')}
            </button>
          )}
        </div>

        {/* Right: Output panel */}
        <div className="flex flex-1 flex-col overflow-y-auto bg-adv-dark px-6 py-5">
          {!displayText && !isStreaming ? (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal-dim">
                <FileSearch className="h-8 w-8 text-adv-teal" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-adv-off-white">
                {t('review.readyToReview')}
              </h2>
              <p className="max-w-sm text-sm text-adv-gray">
                {t('review.readyToReviewDesc')}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2 text-left max-w-sm w-full">
                {[
                  'AML policy documents',
                  'Compliance reports',
                  'Risk assessments',
                  'Regulatory submissions',
                  'Project plans',
                  'Board memos',
                ].map((ex) => (
                  <div
                    key={ex}
                    className="rounded-lg border border-border bg-adv-card px-3 py-2 text-xs text-adv-gray"
                  >
                    {ex}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Output */
            <div className="flex flex-col gap-4">
              {/* Output header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-adv-teal" />
                  <span className="text-xs font-medium text-adv-teal">
                    Anton — {selectedMode.label}
                  </span>
                  {isStreaming && (
                    <span className="text-xs text-adv-gray">{t('review.reviewing')}</span>
                  )}
                </div>
                {!isStreaming && displayText && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? t('review.copied') : t('review.copy')}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      {t('review.downloadMd')}
                    </button>
                  </div>
                )}
              </div>

              {/* Review output */}
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <div className="prose-output max-w-none text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
                  {isStreaming && (
                    <span className="animate-pulse text-adv-teal">&#x258A;</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
