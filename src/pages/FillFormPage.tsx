import { useState, useRef } from 'react';
import { FileEdit, Send, Square, Copy, Check, Download, Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage } from '@/lib/api';
import { useFileUpload } from '@/hooks/useFileUpload';
import type { StreamEvent } from '@/lib/types';

const FILL_FORM_SYSTEM_PROMPT = `You are ANTON, an expert assistant. The user has pasted a form, questionnaire, or structured template that needs to be filled in.

Your task:
1. Identify each field/question in the form
2. For each field, provide:
   - Your recommended answer (clearly marked)
   - Brief reasoning/justification (1-2 sentences)
   - Any uncertainty flags (🚩) where you need more context or where the answer depends on specific facts the user hasn't provided
   - Regulatory citations where applicable (cite specific articles/sections)

Format your response as a structured fill-in, going through each field sequentially. Be precise and professional.`;

const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

export default function FillFormPage() {
  const [formContent, setFormContent] = useState('');
  const [context, setContext] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { files, upload, remove } = useFileUpload();

  const handleRun = async () => {
    const hasText = formContent.trim().length > 0;
    const hasUploadedFiles = files.filter(f => f.status === 'done').length > 0;
    if ((!hasText && !hasUploadedFiles) || isStreaming) return;

    setIsStreaming(true);
    setStreamingText('');
    setFinalText('');

    const uploadedFileIds = files.filter(f => f.status === 'done').map(f => f.id);
    const hasFiles = uploadedFileIds.length > 0;
    const formText = formContent.trim();
    const userMessage = formText
      ? `[FORM TO FILL]\n${formText}\n\n[ADDITIONAL CONTEXT]\n${context.trim() || 'None provided.'}${hasFiles ? '\n\n[UPLOADED DOCUMENTS]\nPlease also use the uploaded documents as reference context for filling the form.' : ''}`
      : `[UPLOADED FORM DOCUMENT]\nPlease identify and fill in the form from the uploaded document(s).\n\n[ADDITIONAL CONTEXT]\n${context.trim() || 'None provided.'}`;

    const controller = new AbortController();
    abortRef.current = controller;

    let fullText = '';

    try {
      const stream = streamMessage(
        {
          model: 'claude-opus-4-6',
          thinking: 'think_hard',
          creativity: 'strict',
          systemPrompt: FILL_FORM_SYSTEM_PROMPT,
          userMessage,
          history: [],
          outputFormats: [],
          knowledgeSources: EMPTY_KS,
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
      a.download = 'filled-form.md';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
            <FileEdit className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">Fill This Form</h1>
            <p className="text-xs text-adv-gray">
              Paste any form, questionnaire, or template — ANTON fills it field by field with expert guidance and citations.
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
              Form or questionnaire
            </label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Paste your form or questionnaire here..."
              rows={10}
              style={{ minHeight: '200px' }}
              className="w-full resize-y rounded-xl border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none"
              disabled={isStreaming}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
              Additional context <span className="text-adv-gray-med font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. This is for a Nordic bank subject to AMLR"
              className="w-full rounded-xl border border-border bg-adv-card px-4 py-2.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none"
              disabled={isStreaming}
            />
          </div>

          {/* Document upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
              Upload documents <span className="text-adv-gray-med font-normal">(optional — used as reference context)</span>
            </label>
            <div
              className="relative rounded-lg border-2 border-dashed border-border p-3 text-center hover:border-adv-gray-med transition-colors"
            >
              <Upload className="mx-auto h-5 w-5 text-adv-gray-med" />
              <p className="mt-1 text-xs text-adv-gray">
                Drag & drop or{' '}
                <label className="cursor-pointer text-adv-teal hover:underline">
                  browse
                  <input type="file" multiple accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv,.html" onChange={(e) => { Array.from(e.target.files || []).forEach(upload); e.target.value = ''; }} className="hidden" />
                </label>
              </p>
              <p className="text-[10px] text-adv-gray-med">PDF, DOCX, TXT, XLSX, CSV (max 50MB)</p>
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded bg-adv-dark px-2.5 py-1.5 text-xs">
                    <File className="h-3 w-3 text-adv-gray shrink-0" />
                    <span className="flex-1 truncate text-adv-gray">{f.name}</span>
                    <span className="text-adv-gray-med">{(f.size / 1024).toFixed(0)}KB</span>
                    {f.status === 'done' && <CheckCircle className="h-3 w-3 text-adv-green" />}
                    {f.status === 'error' && <AlertCircle className="h-3 w-3 text-adv-red" />}
                    {f.status === 'uploading' && <div className="h-3 w-3 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />}
                    <button onClick={() => remove(f.id)} className="text-adv-gray-med hover:text-adv-red"><X className="h-3 w-3" /></button>
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
              disabled={!formContent.trim() && files.filter(f => f.status === 'done').length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-adv-teal px-4 py-3 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Fill Form
            </button>
          )}
        </div>

        {/* Output section */}
        {(isStreaming || finalText) && (
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-adv-teal" />
                <span className="text-xs font-medium text-adv-teal">Anton</span>
                {isStreaming && (
                  <span className="text-xs text-adv-gray-med">filling form...</span>
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
              {isStreaming && <span className="animate-pulse text-adv-teal">▊</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
