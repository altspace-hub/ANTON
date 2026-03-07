import { useState, useRef } from 'react';
import { ShieldAlert, Send, Square, Copy, Check, Download, Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage } from '@/lib/api';
import { useFileUpload } from '@/hooks/useFileUpload';
import type { StreamEvent, ModelId } from '@/lib/types';

const CHALLENGE_SYSTEM_PROMPT = `You are ANTON in "Challenge This" mode. You are a rigorous, critical analyst. Your role is to challenge the document, plan, or argument provided — not to be destructive, but to make it stronger by identifying weaknesses before they become real problems.

Your analysis should cover:

## 🔍 Strongest Counter-Arguments
What are the 3-5 most powerful objections or opposing viewpoints?

## ⚠️ Weakest Assumptions
What assumptions does this rely on that may not hold? What if they're wrong?

## 🚨 Regulatory / Legal / Compliance Risks
Are there regulatory, legal, or compliance risks that haven't been addressed?

## 🕳️ Missing Considerations
What important factors, stakeholders, or scenarios were not considered?

## 🎯 The Strongest Criticism
If a hostile regulator, competitor, or critic reviewed this, what would be their sharpest critique?

## 💡 Suggested Strengthening Actions
What specific changes would address the above weaknesses?

Be rigorous but constructive. Your goal is to help the user produce a stronger, more defensible outcome.`;

const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

export default function ChallengeThisPage() {
  const [transparencyLevel, setTransparencyLevel] = useState<0 | 1 | 2>(0);
  const [docContent, setDocContent] = useState('');
  const [context, setContext] = useState('');
  const [daModel, setDaModel] = useState<ModelId>('claude-opus-4-6');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { files, upload, remove } = useFileUpload();

  const handleRun = async () => {
    const uploadedFileIds = files.filter(f => f.status === 'done').map(f => f.id);
    const hasFiles = uploadedFileIds.length > 0;
    if (!docContent.trim() && !hasFiles) return;
    if (isStreaming) return;

    setIsStreaming(true);
    setStreamingText('');
    setFinalText('');

    let userMessage = context.trim()
      ? `[CONTEXT]\n${context.trim()}\n\n[DOCUMENT TO CHALLENGE]\n${docContent.trim()}`
      : `[DOCUMENT TO CHALLENGE]\n${docContent.trim()}`;
    if (hasFiles) userMessage += '\n\n[UPLOADED DOCUMENTS]\nPlease also challenge the uploaded documents.';

    const controller = new AbortController();
    abortRef.current = controller;

    let fullText = '';

    try {
      const stream = streamMessage(
        {
          model: daModel,
          thinking: 'think_hard',
          creativity: 'strict',
          systemPrompt: CHALLENGE_SYSTEM_PROMPT,
          userMessage,
          history: [],
          outputFormats: [],
          knowledgeSources: EMPTY_KS,
          transparencyLevel,
          ...(hasFiles ? { uploadedFileIds } : {}),
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
      a.download = 'challenge-analysis.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-gold/10">
            <ShieldAlert className="h-5 w-5 text-adv-gold" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">Challenge This</h1>
            <p className="text-xs text-adv-gray">
              Paste any document, plan, or argument — ANTON stress-tests it with the strongest possible critique.
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6 gap-5">
        {/* Input section */}
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
              Document, plan, or argument to challenge
            </label>
            <textarea
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="Paste the document, plan, or argument to challenge..."
              rows={10}
              style={{ minHeight: '200px' }}
              className="w-full resize-y rounded-xl border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              disabled={isStreaming}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
              Context <span className="text-adv-gray font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. This is an AML policy for a Danish payment institution"
              className="w-full rounded-xl border border-border bg-adv-card px-4 py-2.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              disabled={isStreaming}
            />
          </div>

          {/* Devil's Advocate Model selector */}
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Devil's Advocate Model
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowModelPicker(false)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  !showModelPicker
                    ? 'border-adv-gold bg-adv-gold/10 text-adv-gold'
                    : 'border-border text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                Same model (Opus)
              </button>
              <button
                onClick={() => setShowModelPicker(true)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  showModelPicker
                    ? 'border-adv-gold bg-adv-gold/10 text-adv-gold'
                    : 'border-border text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                Different model ▼
              </button>
            </div>
            {showModelPicker && (
              <div className="mt-2 flex items-center gap-2">
                {([
                  { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
                  { id: 'claude-sonnet-4-6', label: 'Sonnet' },
                  { id: 'claude-opus-4-6', label: 'Opus' },
                ] as { id: ModelId; label: string }[]).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setDaModel(m.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      daModel === m.id
                        ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                        : 'border-border text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transparency toggle */}
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="space-y-1">
              <div className="text-[11px] text-adv-gray">Transparency</div>
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
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
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
          </div>

          {/* Document upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
              Upload documents <span className="text-adv-gray font-normal">(optional — upload instead of pasting)</span>
            </label>
            <div className="relative rounded-lg border-2 border-dashed border-border p-3 text-center hover:border-adv-gray-med transition-colors">
              <Upload className="mx-auto h-5 w-5 text-adv-gray" />
              <p className="mt-1 text-xs text-adv-gray">
                Drag & drop or{' '}
                <label className="cursor-pointer text-adv-gold hover:underline">
                  browse
                  <input type="file" multiple accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv,.html" onChange={(e) => { Array.from(e.target.files || []).forEach(upload); e.target.value = ''; }} className="hidden" />
                </label>
              </p>
              <p className="text-xs text-adv-gray">PDF, DOCX, TXT, XLSX, CSV (max 50MB)</p>
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded bg-adv-dark px-2.5 py-1.5 text-xs">
                    <File className="h-3 w-3 text-adv-gray shrink-0" />
                    <span className="flex-1 truncate text-adv-gray">{f.name}</span>
                    <span className="text-adv-gray">{(f.size / 1024).toFixed(0)}KB</span>
                    {f.status === 'done' && <CheckCircle className="h-3 w-3 text-adv-green" />}
                    {f.status === 'error' && <AlertCircle className="h-3 w-3 text-adv-red" />}
                    {f.status === 'uploading' && <div className="h-3 w-3 animate-spin rounded-full border-2 border-adv-gold border-t-transparent" />}
                    <button onClick={() => remove(f.id)} className="text-adv-gray hover:text-adv-red"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isStreaming ? (
            <button
              onClick={handleStop}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-adv-red px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={!docContent.trim() && files.filter(f => f.status === 'done').length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-adv-gold px-4 py-3 text-sm font-medium text-black transition-colors hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Challenge It
            </button>
          )}
        </div>

        {/* Output section */}
        {(isStreaming || finalText) && (
          <div className="rounded-xl border border-adv-gold/20 bg-adv-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-adv-gold" />
                <span className="text-xs font-medium text-adv-gold">Anton — Challenge Mode</span>
                {isStreaming && (
                  <span className="text-xs text-adv-gray">analysing...</span>
                )}
              </div>
              {!isStreaming && displayText && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:bg-adv-dark hover:text-adv-off-white"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:bg-adv-dark hover:text-adv-off-white"
                  >
                    <Download className="h-3 w-3" />
                    .md
                  </button>
                </div>
              )}
            </div>
            <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
              {isStreaming && <span className="animate-pulse text-adv-gold">▊</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
