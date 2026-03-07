import { useState, useRef } from 'react';
import { Scale, Send, Square, Copy, Check, Download, Info, Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage } from '@/lib/api';
import { useFileUpload } from '@/hooks/useFileUpload';
import type { StreamEvent } from '@/lib/types';

const DUAL_SYSTEM_PROMPT = `You are ANTON in "Dual Interpretation" mode. You will analyse the provided legal or regulatory text from two opposing perspectives simultaneously.

## 🏛️ PERSPECTIVE 1: The Regulator's View
How would a national competent authority, supervisor, or enforcement body interpret this text?
- What does this text require, prohibit, or permit?
- What evidence would a regulator look for during an inspection?
- What would constitute non-compliance?
- What are the enforcement implications?

## 🏦 PERSPECTIVE 2: The Regulated Entity's View
How would a compliance officer, legal counsel, or regulated entity interpret the same text?
- What is the minimum threshold for compliance?
- Where is there interpretive flexibility or grey areas?
- What compliance burden does this create?
- How might this text be narrowly interpreted to reduce implementation cost?

## ⚖️ SYNTHESIS: Where Interpretations Diverge
Where do the two interpretations most significantly differ?
What are the highest-risk areas of ambiguity?
What clarifications should be sought from the regulator?

Be precise. Cite specific words and phrases from the text that drive each interpretation.`;

const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

type InputTab = 'paste' | 'url' | 'upload';

export default function DualInterpretationPage() {
  const [transparencyLevel, setTransparencyLevel] = useState<0 | 1 | 2>(0);
  const [activeTab, setActiveTab] = useState<InputTab>('paste');
  const [textContent, setTextContent] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { files, upload, remove } = useFileUpload();

  const handleRun = async () => {
    const uploadedFileIds = files.filter(f => f.status === 'done').map(f => f.id);
    const hasFiles = uploadedFileIds.length > 0;
    const content = activeTab === 'paste' ? textContent.trim() : activeTab === 'url' ? urlInput.trim() : '';
    if (!content && !hasFiles) return;
    if (isStreaming) return;

    setIsStreaming(true);
    setStreamingText('');
    setFinalText('');

    let userMessage: string;
    if (activeTab === 'upload' || (activeTab !== 'url' && !content && hasFiles)) {
      userMessage = '[UPLOADED REGULATORY DOCUMENT]\nPlease interpret the uploaded document(s) using dual perspective analysis.';
    } else if (activeTab === 'paste') {
      userMessage = `[LEGAL/REGULATORY TEXT TO INTERPRET]\n${content}`;
      if (hasFiles) userMessage += '\n\n[UPLOADED DOCUMENTS]\nAlso consider the uploaded documents as additional reference.';
    } else {
      userMessage = `[REGULATORY TEXT SOURCE URL]\n${content}\n\nPlease interpret the regulatory text from the provided URL using dual perspective analysis.`;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let fullText = '';

    try {
      const stream = streamMessage(
        {
          model: 'claude-opus-4-6',
          thinking: 'think_hard',
          creativity: 'strict',
          systemPrompt: DUAL_SYSTEM_PROMPT,
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
      a.download = 'dual-interpretation.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const canRun = activeTab === 'paste'
    ? textContent.trim().length > 0
    : activeTab === 'url'
    ? urlInput.trim().length > 0
    : files.filter(f => f.status === 'done').length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-blue/10">
            <Scale className="h-5 w-5 text-adv-blue" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">Dual Interpretation</h1>
            <p className="text-xs text-adv-gray">
              Upload or paste a legal/regulatory text — ANTON interprets it as both regulator and regulated entity simultaneously.
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6 gap-5">
        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg border border-border bg-adv-card p-1 w-fit">
          <button
            onClick={() => setActiveTab('paste')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'paste'
                ? 'bg-adv-blue/20 text-adv-blue'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Paste Text
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'url'
                ? 'bg-adv-blue/20 text-adv-blue'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Enter URL
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'bg-adv-blue/20 text-adv-blue'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Upload Document
          </button>
        </div>

        {/* Transparency toggle */}
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

        {/* Input section */}
        <div className="space-y-3">
          {activeTab === 'paste' ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
                Legal or regulatory text
              </label>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste the legal or regulatory text to interpret..."
                rows={10}
                style={{ minHeight: '200px' }}
                className="w-full resize-y rounded-xl border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-blue/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                disabled={isStreaming}
              />
            </div>
          ) : activeTab === 'url' ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
                URL to regulatory text
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://eur-lex.europa.eu/eli/reg/2024/1624/oj"
                className="w-full rounded-xl border border-border bg-adv-card px-4 py-2.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-blue/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                disabled={isStreaming}
              />
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-adv-blue/20 bg-adv-blue/5 px-3 py-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-blue" />
                <p className="text-xs text-adv-gray">
                  URL fetching uses the Online Reference knowledge source. For full document extraction, use the Knowledge Sources panel in a module. Here, Anton will use its training knowledge of the URL content plus web search.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
                Upload regulatory document
              </label>
              <div className="relative rounded-lg border-2 border-dashed border-border p-4 text-center hover:border-adv-blue/40 transition-colors">
                <Upload className="mx-auto h-6 w-6 text-adv-gray" />
                <p className="mt-2 text-xs text-adv-gray">
                  Drag & drop or{' '}
                  <label className="cursor-pointer text-adv-blue hover:underline">
                    browse
                    <input type="file" multiple accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv,.html" onChange={(e) => { Array.from(e.target.files || []).forEach(upload); e.target.value = ''; }} className="hidden" />
                  </label>
                </p>
                <p className="mt-1 text-xs text-adv-gray">PDF, DOCX, TXT, XLSX, CSV, HTML (max 50MB)</p>
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
                      {f.status === 'uploading' && <div className="h-3 w-3 animate-spin rounded-full border-2 border-adv-blue border-t-transparent" />}
                      <button onClick={() => remove(f.id)} className="text-adv-gray hover:text-adv-red"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
              disabled={!canRun}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-adv-blue px-4 py-3 text-sm font-medium text-white transition-colors hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Interpret
            </button>
          )}
        </div>

        {/* Output section */}
        {(isStreaming || finalText) && (
          <div className="rounded-xl border border-adv-blue/20 bg-adv-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-adv-blue" />
                <span className="text-xs font-medium text-adv-blue">Anton — Dual Interpretation</span>
                {isStreaming && (
                  <span className="text-xs text-adv-gray">interpreting...</span>
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
              {isStreaming && <span className="animate-pulse text-adv-blue">▊</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
