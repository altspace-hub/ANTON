/**
 * ExplainFor.tsx
 * "Explain-It-Different" — rewrite any module output for a chosen audience.
 *
 * Renders a dropdown button that, when clicked, streams a rewritten version of
 * the provided content into a slide-out panel. Both the original and the
 * explained version are preserved via an Original / Explained tab switcher.
 * When complete the explained version is auto-saved as a version entry.
 */

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Users, ChevronDown, X, Copy, Check, Download, Square, FileText, FileSpreadsheet, FileIcon } from 'lucide-react';
import { useExport } from '@/hooks/useExport';

// ── Types ──────────────────────────────────────────────────

interface AudienceOption {
  id: string;
  label: string;
  emoji: string;
}

const AUDIENCES: AudienceOption[] = [
  { id: 'board',           label: 'Board / C-suite',        emoji: '🏛️' },
  { id: 'regulator',       label: 'Regulator / Examiner',   emoji: '🏛️' },
  { id: 'technical',       label: 'Technical Team',         emoji: '💻' },
  { id: 'business',        label: 'Business Stakeholders',  emoji: '📊' },
  { id: 'non-expert',      label: 'Non-expert / New Hire',  emoji: '👋' },
  { id: 'external-client', label: 'External Client',        emoji: '🤝' },
  { id: 'media',           label: 'Media / Public',         emoji: '📰' },
  { id: 'legal',           label: 'Legal Counsel',          emoji: '⚖️' },
];

// ── Props ──────────────────────────────────────────────────

export interface ExplainForProps {
  /** The markdown output text to reprocess */
  content: string;
  /** Optional: module name for additional context sent to Claude */
  moduleContext?: string;
  /** Optional: entity ID used to save explained version (session or module ID) */
  entityId?: string;
  /** Optional callback — fired when an explained version is ready */
  onExplained?: (audience: string, result: string) => void;
}

// ── Helper ─────────────────────────────────────────────────

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function* streamExplainFor(
  content: string,
  audience: string,
  moduleContext?: string,
  signal?: AbortSignal
): AsyncGenerator<{ type: string; content?: string; message?: string }> {
  const res = await fetch('/api/claude/explain-for', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, audience, moduleContext }),
    signal,
  });

  if (!res.ok) {
    yield { type: 'error', message: await res.text() };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', message: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            yield JSON.parse(data) as { type: string; content?: string; message?: string };
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Component ──────────────────────────────────────────────

export default function ExplainFor({ content, moduleContext, entityId, onExplained }: ExplainForProps) {
  const [dropdownOpen, setDropdownOpen]       = useState(false);
  const [selectedAudience, setSelectedAudience] = useState<AudienceOption | null>(null);
  const [explainedContent, setExplainedContent] = useState('');
  const [isStreaming, setIsStreaming]          = useState(false);
  const [showPanel, setShowPanel]              = useState(false);
  const [activeTab, setActiveTab]              = useState<'original' | 'explained'>('explained');
  const [copyState, setCopyState]              = useState<'idle' | 'copied'>('idle');
  const { doExport, isExporting } = useExport();

  const dropdownRef   = useRef<HTMLDivElement>(null);
  const abortCtrlRef  = useRef<AbortController | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Handlers ────────────────────────────────────────────

  const handleAudienceSelect = async (audience: AudienceOption) => {
    setDropdownOpen(false);
    setSelectedAudience(audience);
    setExplainedContent('');
    setShowPanel(true);
    setActiveTab('explained');
    setIsStreaming(true);

    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    let fullText = '';

    try {
      const stream = streamExplainFor(content, audience.id, moduleContext, ctrl.signal);
      for await (const event of stream) {
        if (event.type === 'text_delta' && event.content) {
          fullText += event.content;
          setExplainedContent(fullText);
        }
        if (event.type === 'error' || event.type === 'stream_end') break;
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setExplainedContent('Explanation failed. Please try again.');
      }
    } finally {
      setIsStreaming(false);
      abortCtrlRef.current = null;
    }

    // After streaming completes, fire the callback and save as version
    if (fullText) {
      onExplained?.(audience.id, fullText);

      // Save as version if we have an entity ID
      if (entityId) {
        fetch(`/api/versions/output/${entityId}`, {
          method: 'POST',
          headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: fullText,
            label: `Explained for ${audience.label} at ${new Date().toLocaleTimeString()}`,
          }),
        }).catch(() => {}); // fire-and-forget
      }
    }
  };

  const handleStop = () => {
    abortCtrlRef.current?.abort();
    setIsStreaming(false);
  };

  const handleCopy = async () => {
    const text = activeTab === 'original' ? content : explainedContent;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleDownload = () => {
    const text = activeTab === 'original' ? content : explainedContent;
    const audienceSlug = selectedAudience?.id ?? 'explained';
    const fileName = `output-for-${audienceSlug}.md`;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    handleStop();
    setShowPanel(false);
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <>
      {/* ── Trigger Button + Dropdown ───────────────────── */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md border border-adv-teal/40 bg-adv-teal-dim px-2.5 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-teal/10 transition-colors"
          title="Rewrite this output for a different audience"
        >
          <Users className="h-3 w-3" />
          Explain for...
          <ChevronDown className={`h-3 w-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute bottom-full left-0 mb-1 z-50 min-w-52 rounded-lg border border-border bg-adv-card shadow-xl">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-medium text-adv-gray">Choose audience</p>
              <p className="text-[10px] text-adv-gray-med mt-0.5">Claude will rewrite the output for them</p>
            </div>
            <div className="py-1">
              {AUDIENCES.map((audience) => (
                <button
                  key={audience.id}
                  onClick={() => handleAudienceSelect(audience)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-adv-dark-2 ${
                    selectedAudience?.id === audience.id && showPanel
                      ? 'text-adv-teal bg-adv-teal-dim'
                      : 'text-adv-off-white'
                  }`}
                >
                  <span className="flex-shrink-0 w-4 text-center">{audience.emoji}</span>
                  <span className="flex-1">{audience.label}</span>
                  {selectedAudience?.id === audience.id && showPanel && (
                    <span className="text-[10px] text-adv-teal flex-shrink-0">Active</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Slide-out Explanation Panel ─────────────────── */}
      {showPanel && selectedAudience && (
        <div className="mt-3 rounded-xl border border-adv-teal/30 bg-adv-card shadow-lg">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-adv-teal" />
              <span className="text-sm font-medium text-adv-white">
                For {selectedAudience.label}
              </span>
              {isStreaming && (
                <span className="inline-flex items-center gap-1 rounded-full bg-adv-teal/20 px-2 py-0.5 text-[10px] text-adv-teal">
                  <span className="h-1.5 w-1.5 rounded-full bg-adv-teal animate-pulse" />
                  Generating...
                </span>
              )}
              {!isStreaming && explainedContent && (
                <span className="rounded-full bg-adv-green/20 px-2 py-0.5 text-[10px] text-adv-green">
                  Ready
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1 rounded-md bg-adv-red/20 px-2 py-1 text-[11px] text-adv-red hover:bg-adv-red/30 transition-colors"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              ) : null}
              <button
                onClick={handleClose}
                className="rounded-md p-1 text-adv-gray-med hover:bg-adv-dark hover:text-adv-off-white transition-colors"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border px-4">
            <button
              onClick={() => setActiveTab('explained')}
              className={`mr-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'explained'
                  ? 'border-adv-teal text-adv-teal'
                  : 'border-transparent text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {selectedAudience.emoji} {selectedAudience.label}
            </button>
            <button
              onClick={() => setActiveTab('original')}
              className={`py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'original'
                  ? 'border-adv-teal text-adv-teal'
                  : 'border-transparent text-adv-gray hover:text-adv-off-white'
              }`}
            >
              Original
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            {activeTab === 'explained' ? (
              <div className="min-h-24">
                {!explainedContent && isStreaming && (
                  <div className="flex items-center gap-2 text-xs text-adv-gray-med">
                    <span className="h-1.5 w-1.5 rounded-full bg-adv-teal animate-pulse" />
                    Rewriting for {selectedAudience.label}...
                  </div>
                )}
                {explainedContent && (
                  <div className="prose-output max-w-none text-adv-off-white">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {explainedContent}
                    </ReactMarkdown>
                    {isStreaming && (
                      <span className="inline-block h-4 w-0.5 bg-adv-teal animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="prose-output max-w-none text-adv-off-white">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Footer Actions — only shown when generation is complete */}
          {!isStreaming && explainedContent && (
            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  copyState === 'copied'
                    ? 'border-adv-green/40 bg-adv-green/10 text-adv-green'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-teal hover:text-adv-teal'
                }`}
              >
                {copyState === 'copied' ? (
                  <><Check className="h-3 w-3" /> Copied</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy</>
                )}
              </button>
              <div className="h-4 w-px bg-border" />
              <span className="text-[10px] text-adv-gray-med">Export:</span>
              <button
                onClick={handleDownload}
                disabled={isExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors disabled:opacity-50"
              >
                <Download className="h-3 w-3" />
                .md
              </button>
              <button
                onClick={() => doExport('docx', activeTab === 'original' ? content : explainedContent, `explained-for-${selectedAudience?.id ?? 'audience'}`)}
                disabled={isExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors disabled:opacity-50"
              >
                <FileText className="h-3 w-3" />
                .docx
              </button>
              <button
                onClick={() => doExport('xlsx', activeTab === 'original' ? content : explainedContent, `explained-for-${selectedAudience?.id ?? 'audience'}`)}
                disabled={isExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet className="h-3 w-3" />
                .xlsx
              </button>
              <button
                onClick={() => doExport('pdf', activeTab === 'original' ? content : explainedContent, `explained-for-${selectedAudience?.id ?? 'audience'}`)}
                disabled={isExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors disabled:opacity-50"
              >
                <FileIcon className="h-3 w-3" />
                .pdf
              </button>
              <div className="ml-auto">
                <button
                  onClick={() => setDropdownOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-adv-teal/30 bg-adv-teal-dim px-2.5 py-1.5 text-xs text-adv-teal hover:border-adv-teal transition-colors"
                >
                  <Users className="h-3 w-3" />
                  Try another audience
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
