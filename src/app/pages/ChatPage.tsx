/**
 * ChatPage — Conversational interface (May 3 IRE pass — Claude-style).
 *
 * Changes from the previous version:
 *   • Single header (no ConnectionStatus + InstanceTopBar stacked above)
 *   • Morphing right-side button: mic when input empty, send when not
 *   • Voice input is INSIDE the composer pill, not outside
 *   • Streaming dots are unbordered (not a fake bubble)
 *   • Larger horizontal padding (16px, locked to 4px grid)
 *   • Vertical message rhythm: 24px between turns, not space-y-3
 */

import { useState, useRef, useEffect } from 'react';
import { sendQueryREST } from '../services/query';
import { getIdentity } from '../services/identity';
import { getOrgProfile, getSessionDetail } from '../services/api';
import { getModule, type ModuleDetail } from '../services/modules';
import { getSelectedModel, setSelectedModel, listModels } from '../services/models';
import { cacheSession, isOnline, queueMessage } from '../services/offline';
import ChatBubble from '../components/ChatBubble';
import SuggestionChips from '../components/SuggestionChips';
import ModelPickerSheet from '../components/ModelPickerSheet';
import ReportSheet, { type ReportSubmission } from '../components/ReportSheet';
import { saveReport, formatReportForSharing } from '../services/reports';
import { reportStrings } from '../services/report-strings';
import { Ico, Spinner, ErrorPill } from '../components/ui';

interface Props {
  orgId: string;
  sessionId: string | null;
  /** When set, every query is routed through this module's system prompt
   *  + area context (mirrors what desktop ModulePage does for that module). */
  moduleId?: string | null;
  onSessionCreated: (id: string) => void;
  /** Called when the user taps "Switch to free chat" in the module header. */
  onClearModule?: () => void;
  onBack: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isError?: boolean;
}

interface SessionDetail {
  id: string;
  title?: string;
  messages?: Array<{
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    created_at?: string;
    timestamp?: number;
  }>;
}

export default function ChatPage({ orgId, sessionId, moduleId, onSessionCreated, onClearModule, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [sessionReloadTick, setSessionReloadTick] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [orgName, setOrgName] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [moduleDetail, setModuleDetail] = useState<ModuleDetail | null>(null);
  const [modelId, setModelIdState] = useState<string | null>(getSelectedModel());
  const [modelLabel, setModelLabel] = useState<string>('Default');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  // Which assistant turn the user is reporting (null = the sheet is closed).
  // Holding the message rather than just its id keeps the reported text and
  // the id from drifting apart if the list re-renders under the open sheet.
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [reportSaved, setReportSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reportToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identity = getIdentity();
  const rs = reportStrings(identity?.preferredLanguage);

  // Clear the "report saved" timer on unmount — leaving the chat mid-toast
  // would otherwise setState on an unmounted page.
  useEffect(() => () => { if (reportToastRef.current) clearTimeout(reportToastRef.current); }, []);

  // Load org name + branding
  useEffect(() => {
    let cancelled = false;
    getOrgProfile(orgId)
      .then((org: Record<string, unknown>) => {
        if (cancelled) return;
        setOrgName((org.name as string) || '');
        const color = org.primary_color as string;
        if (color && color !== '#2A6459') {
          document.documentElement.style.setProperty('--org-brand-color', color);
        }
      })
      .catch(() => { /* non-fatal: header just shows blank org name */ });
    return () => {
      cancelled = true;
      document.documentElement.style.removeProperty('--org-brand-color');
    };
  }, [orgId]);

  // Load module detail for the header label + empty-state pitch.
  // Failing silently is fine — we just fall back to the org-name header.
  useEffect(() => {
    if (!moduleId) { setModuleDetail(null); return; }
    let cancelled = false;
    getModule(orgId, moduleId)
      .then(d => { if (!cancelled) setModuleDetail(d); })
      .catch(() => { if (!cancelled) setModuleDetail(null); });
    return () => { cancelled = true; };
  }, [orgId, moduleId]);

  // Resolve the human label for the selected model id (or fall back to
  // "Default" when the user hasn't picked one). Falls back silently if
  // the models endpoint fails — the chip just shows "Default".
  useEffect(() => {
    let cancelled = false;
    listModels(orgId).then(r => {
      if (cancelled) return;
      if (!modelId) {
        const def = r.models.find(m => m.id === r.defaultModel);
        setModelLabel(def?.label ?? 'Default');
      } else {
        const m = r.models.find(x => x.id === modelId);
        setModelLabel(m?.label ?? 'Custom');
      }
    }).catch(() => { /* keep current label */ });
    return () => { cancelled = true; };
  }, [orgId, modelId]);

  function applyModel(newId: string | null, label: string) {
    setSelectedModel(newId);
    setModelIdState(newId);
    setModelLabel(label);
    setModelPickerOpen(false);
  }

  // Load existing session messages
  const loadedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setSessionTitle('');
      setSessionLoadError(null);
      loadedSessionRef.current = null;
      return;
    }
    // Allow retries: when sessionReloadTick changes, force a re-fetch
    // even if loadedSessionRef matches.
    if (loadedSessionRef.current === sessionId && sessionReloadTick === 0) return;
    if (messages.length > 0 && sessionReloadTick === 0) {
      loadedSessionRef.current = sessionId;
      return;
    }
    loadedSessionRef.current = sessionId;
    let cancelled = false;
    setLoadingSession(true);
    setSessionLoadError(null);
    setMessages([]);
    void (async () => {
      try {
        const detail = await getSessionDetail(orgId, sessionId) as SessionDetail | null;
        if (cancelled || !detail) return;
        setSessionTitle(detail.title ?? '');
        const msgs = (detail.messages ?? []).map((m, i): Message => ({
          id: m.id ?? `${sessionId}-${i}`,
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
          timestamp: typeof m.timestamp === 'number'
            ? m.timestamp
            : m.created_at ? Date.parse(m.created_at) : Date.now() - (msgsLength(detail) - i) * 1000,
        }));
        setMessages(msgs);
      } catch {
        if (!cancelled) setSessionLoadError('Couldn\'t load this conversation.');
      }
      finally {
        if (!cancelled) setLoadingSession(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sessionId, sessionReloadTick]);

  // Auto-scroll. APM20: smooth scroll on every stream chunk caused
  // visible motion sickness — scroll instantly while streaming, then
  // do one polished smooth-scroll on the final chunk.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: streaming ? 'auto' : 'smooth',
    });
  }, [messages, streaming]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    if (!orgId) {
      addMessage('assistant', 'No organisation selected. Go back and select one.', true);
      return;
    }

    addMessage('user', text);
    setInput('');
    setSuggestions([]);

    if (!isOnline()) {
      queueMessage({ id: crypto.randomUUID(), orgId, sessionId, message: text, timestamp: Date.now() });
      addMessage('assistant', "You're offline. Your message has been queued and will be sent when you reconnect.", false);
      return;
    }

    setStreaming(true);
    // Track whether the in-flight assistant turn has started, so streamed
    // chunks append to one bubble instead of spawning a new bubble per chunk
    // (C4 — future-safe for when real streaming lands; today onChunk fires once).
    let assistantStarted = false;

    sendQueryREST(orgId, text, {
      onStart: () => {},
      onChunk: (chunk) => {
        if (!assistantStarted) { assistantStarted = true; addMessage('assistant', chunk); }
        else appendToLastAssistant(chunk);
      },
      onComplete: (data) => {
        setStreaming(false);
        if (data.sessionId) onSessionCreated(data.sessionId);
        if (data.suggestions?.length) setSuggestions(data.suggestions);
        if (data.sessionId) {
          cacheSession({
            id: data.sessionId,
            orgId,
            title: text.slice(0, 50),
            messages: messages.map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
            updatedAt: Date.now(),
          });
        }
      },
      onError: (err) => {
        addMessage('assistant', err || 'Something went wrong', true);
        setStreaming(false);
      },
    }, {
      sessionId: sessionId || undefined,
      outputLanguage: identity?.preferredLanguage,
      moduleId: moduleId || undefined,
      model: modelId || undefined,
    });
  }

  function addMessage(role: 'user' | 'assistant', content: string, isError?: boolean) {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
      isError,
    }]);
  }

  // Append streamed text to the last assistant message rather than creating a
  // new bubble per chunk. If the last message isn't an assistant turn (edge
  // case), fall back to adding a fresh one.
  function appendToLastAssistant(chunk: string) {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && !last.isError) {
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
      }
      return [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: chunk,
        timestamp: Date.now(),
      }];
    });
  }

  /**
   * Report the AI's response.
   *
   * Play's generated-content policy needs an in-app reporting route; this is
   * it. The privacy contract is the one stated in services/reports.ts — the
   * report is written to this device and nothing is transmitted. The share
   * sheet at the end is the USER escalating, carrying exactly what they ticked
   * to include; dismissing it is not an error, the report is already saved.
   */
  function submitReport(sub: ReportSubmission) {
    const target = reportTarget;
    setReportTarget(null);
    if (!target) return;
    const report = saveReport({
      modelId,
      modelLabel,
      moduleId: moduleId || undefined,
      sessionId,
      messageId: target.id,
      category: sub.category,
      note: sub.note || undefined,
      // The ONLY route by which conversation text enters a report.
      includedResponseText: sub.includeResponse ? target.content : undefined,
    });
    setReportSaved(true);
    if (reportToastRef.current) clearTimeout(reportToastRef.current);
    reportToastRef.current = setTimeout(() => setReportSaved(false), 3500);
    const text = formatReportForSharing(report);
    void (async () => {
      try {
        const nav = navigator as Navigator & { share?: (d: { title?: string; text: string }) => Promise<void> };
        if (nav.share) await nav.share({ title: rs.shareTitle, text });
        else await navigator.clipboard?.writeText(text);
      } catch { /* dismissed or unsupported — the report is saved either way */ }
    })();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // On mobile (coarse pointer / native), Enter inserts a newline like the
    // big chat apps — let the textarea handle it natively, never submit.
    // On desktop, Enter (without Shift) sends; Shift+Enter still = newline.
    if (e.key === 'Enter' && !e.shiftKey && !isMobileComposer()) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasInput = input.trim().length > 0;
  // Header priority: session title (you're inside an existing thread) → module
  // label (you came from the Work tab) → org name → generic "Chat".
  const headerTitle = sessionTitle || moduleDetail?.label || orgName || 'Chat';
  const headerSub = moduleDetail
    ? (moduleDetail.areaLabel ? `${moduleDetail.areaLabel} · module` : 'Module')
    : null;

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* ── Single header ─────────────────────────────────────── */}
      <div
        className="flex flex-shrink-0 items-center gap-2 px-2 py-2"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border-soft)',
        }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex items-center justify-center transition active:opacity-50"
          style={{ width: 44, height: 44, color: 'var(--color-text)' }}
        >
          <Ico name="chevronLeft" size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate"
            style={{
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--color-text)',
              letterSpacing: '-0.2px',
            }}
          >
            {headerTitle}
          </h1>
          {streaming ? (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className="block animate-pulse rounded-full"
                style={{ width: 6, height: 6, background: 'var(--color-accent)' }}
              />
              <span className="text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
                Thinking…
              </span>
            </div>
          ) : headerSub ? (
            <div className="mt-0.5 truncate text-[0.6875rem] font-medium" style={{ color: 'var(--color-accent)' }}>
              {headerSub}
            </div>
          ) : null}
        </div>
        {/* Model chip — compact, in the header so the user knows which brain
            is answering without it crowding the composer. Opens the picker. */}
        <button
          onClick={() => setModelPickerOpen(true)}
          aria-label={`Model: ${modelLabel}. Tap to change.`}
          title={`Model: ${modelLabel}`}
          className="flex max-w-[40%] flex-shrink items-center gap-1 rounded-full px-2 py-1 transition active:opacity-60"
          style={{
            background: 'var(--color-surface-alt)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-body)',
          }}
        >
          <Ico name="sparkles" color={modelId ? 'var(--color-accent)' : 'var(--color-text-muted)'} size={11} />
          <span className="truncate text-xs font-semibold">{modelLabel}</span>
          <Ico name="chevronDown" color="var(--color-text-muted)" size={11} />
        </button>
        {/* Right-side action: only meaningful inside a module — exit back to free chat. */}
        {moduleId && onClearModule ? (
          <button
            onClick={() => { onClearModule(); setMessages([]); setSuggestions([]); }}
            aria-label="Switch to free chat"
            title="Switch to free chat"
            className="flex items-center justify-center transition active:opacity-50"
            style={{ width: 44, height: 44, color: 'var(--color-text-muted)' }}
          >
            <Ico name="x" size={20} />
          </button>
        ) : (
          <div style={{ width: 44, height: 44 }} />
        )}
      </div>

      {/* ── Messages ─────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
          {loadingSession && (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          )}
          {sessionLoadError && !loadingSession && (
            <ErrorPill
              message={sessionLoadError}
              onRetry={() => setSessionReloadTick(t => t + 1)}
            />
          )}

          {!loadingSession && messages.length === 0 && !streaming && !moduleDetail && (
            <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
              <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="message" size={28} />
              </span>
              <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                Ask anything
              </p>
              <p className="mt-1 max-w-[300px] text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {orgName ? `${orgName}'s ANTON is ready.` : 'Your ANTON is ready.'}
              </p>
            </div>
          )}

          {/* Rich module intro — surfaces persona + role + output formats so
              the user knows what they walked into and what kind of answer
              this module produces. Only shown when a module is loaded and
              the conversation hasn't started yet. */}
          {!loadingSession && messages.length === 0 && !streaming && moduleDetail && (
            <div className="flex flex-col gap-3 py-2">
              {/* Header card — accent-bordered, mirrors the module's color */}
              <div
                className="rounded-[var(--radius-r3)] p-4"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderLeft: '4px solid var(--color-accent)',
                }}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <Ico name="sparkles" color="var(--color-accent)" size={14} />
                  <span
                    className="font-mono uppercase"
                    style={{ fontSize: '0.6875rem', letterSpacing: '0.5px', color: 'var(--color-accent)' }}
                  >
                    {moduleDetail.areaLabel ? `${moduleDetail.areaLabel} module` : 'Module loaded'}
                  </span>
                </div>
                <h2
                  className="text-[var(--color-text)]"
                  style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.2 }}
                >
                  {moduleDetail.label}
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: 'var(--color-text-body)' }}
                >
                  {moduleDetail.description}
                </p>
              </div>

              {/* What ANTON is configured to do — persona + role from the
                  underlying system prompt. Shown only when authored. */}
              {(moduleDetail.persona || moduleDetail.roleObjective) && (
                <div
                  className="rounded-[var(--radius-r3)] p-4"
                  style={{
                    background: 'var(--color-surface-alt)',
                    border: '1px solid var(--color-border-soft)',
                  }}
                >
                  <div
                    className="mb-2 font-mono uppercase"
                    style={{ fontSize: '0.6875rem', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}
                  >
                    What ANTON does here
                  </div>
                  {moduleDetail.persona && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-body)' }}>
                      {moduleDetail.persona}
                    </p>
                  )}
                  {moduleDetail.roleObjective && (
                    <p
                      className="mt-2 text-xs leading-relaxed"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {moduleDetail.roleObjective}
                    </p>
                  )}
                </div>
              )}

              {/* Output formats — chips show what shape of answer the module
                  produces by default. Helps the user know what to expect. */}
              {moduleDetail.defaults.outputFormatLabels.length > 0 && (
                <div className="px-1">
                  <div
                    className="mb-1.5 font-mono uppercase"
                    style={{ fontSize: '0.6875rem', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}
                  >
                    Produces
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {moduleDetail.defaults.outputFormatLabels.map(label => (
                      <span
                        key={label}
                        className="rounded-full px-2.5 py-1 text-[0.6875rem] font-medium"
                        style={{
                          background: 'var(--color-accent-soft)',
                          color: 'var(--color-accent)',
                          border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick-start chips — let the user step into the module
                  without having to figure out what to type first. */}
              <div className="px-1 pt-1">
                <div
                  className="mb-1.5 font-mono uppercase"
                  style={{ fontSize: '0.6875rem', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}
                >
                  Try asking
                </div>
                <SuggestionChips
                  suggestions={[
                    `What can you help me with in ${moduleDetail.shortLabel || moduleDetail.label}?`,
                    'Walk me through your typical workflow',
                    'Show me an example of what you produce',
                  ]}
                  onSelect={(s) => setInput(s)}
                />
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            // Cluster divider: when a message starts >5 min after the
            // previous one, drop a small centered time label so long-running
            // threads read as distinct sessions rather than one wall of text.
            const prev = messages[i - 1];
            const showDivider = prev != null
              && msg.timestamp - prev.timestamp > CLUSTER_GAP_MS;
            return (
              <div key={msg.id} className="flex flex-col gap-6">
                {showDivider && (
                  <div className="flex justify-center" aria-hidden="true">
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--color-text-faint)' }}
                    >
                      {formatClusterTime(msg.timestamp)}
                    </span>
                  </div>
                )}
                <ChatBubble
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                  isError={msg.isError}
                />
                {/* Report affordance — Play requires an in-app way to report
                    what the model generated. Errors are ours, not the model's,
                    and the user's own turns are not AI content, so it sits on
                    assistant turns only. Deliberately low-contrast: present on
                    every response, shouting on none. */}
                {msg.role === 'assistant' && !msg.isError && (
                  <div className="-mt-4 flex justify-end">
                    <button
                      onClick={() => setReportTarget(msg)}
                      aria-label={rs.title}
                      title={rs.title}
                      className="flex items-center gap-1 rounded-full px-2 transition active:opacity-60"
                      style={{ minHeight: 32, color: 'var(--color-text-faint)' }}
                    >
                      <Ico name="flag" size={13} />
                      <span className="text-[0.6875rem] font-medium">{rs.action}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing indicator — bare dots, no fake bubble */}
          {streaming && (
            <div className="flex items-center gap-1.5 pl-1">
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full"
                style={{ background: 'var(--color-text-muted)', animationDelay: '0ms' }}
              />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full"
                style={{ background: 'var(--color-text-muted)', animationDelay: '150ms' }}
              />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full"
                style={{ background: 'var(--color-text-muted)', animationDelay: '300ms' }}
              />
            </div>
          )}

          {!streaming && suggestions.length > 0 && (
            <SuggestionChips
              suggestions={suggestions}
              onSelect={(s) => { setSuggestions([]); setInput(s); }}
            />
          )}
        </div>
      </div>

      {/* ── Composer — single capsule, mic morphs to send ─────── */}
      <div
        className="flex-shrink-0"
        style={{
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border-soft)',
        }}
      >
        <div className="mx-auto max-w-2xl px-3 pt-2"
             style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 10px)' }}>
          <div
            className="flex items-end gap-1.5 rounded-[22px] pl-3.5 pr-1.5 py-1.5"
            style={{
              background: 'var(--color-surface-alt)',
              border: '1px solid var(--color-border)',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message ANTON…"
              rows={1}
              className="flex-1 resize-none bg-transparent text-base focus:outline-none"
              style={{
                color: 'var(--color-text)',
                lineHeight: 1.4,
                minHeight: 32,
                maxHeight: 120,
                paddingTop: 6,
                paddingBottom: 6,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!hasInput && !streaming}
              aria-label={hasInput ? 'Send' : 'Voice input not yet wired in this composer; type a message instead'}
              className="flex flex-shrink-0 items-center justify-center rounded-full transition-all active:scale-90"
              style={{
                width: 36, height: 36,
                background: hasInput ? 'var(--color-accent)' : 'transparent',
                color: hasInput ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
                opacity: hasInput || streaming ? 1 : 0.55,
              }}
            >
              <Ico name={hasInput ? 'arrowUp' : 'mic'} size={hasInput ? 18 : 20} />
            </button>
          </div>
        </div>
      </div>

      <ModelPickerSheet
        open={modelPickerOpen}
        orgId={orgId}
        selectedModelId={modelId}
        onClose={() => setModelPickerOpen(false)}
        onSelect={(id, label) => applyModel(id, label)}
      />

      <ReportSheet
        open={reportTarget !== null}
        modelLabel={modelLabel}
        responsePreview={reportTarget ? reportTarget.content.slice(0, 400) : undefined}
        lang={identity?.preferredLanguage}
        onCancel={() => setReportTarget(null)}
        onSubmit={submitReport}
      />

      {reportSaved && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-6"
        >
          <span
            className="rounded-full px-4 py-2 text-xs font-medium shadow-lg"
            style={{ background: 'var(--color-text)', color: 'var(--color-bg)' }}
          >
            {rs.saved}
          </span>
        </div>
      )}
    </div>
  );
}

function msgsLength(d: SessionDetail): number {
  return (d.messages ?? []).length;
}

/** Gap (ms) between two consecutive messages above which we draw a small
 *  centered time divider, so a paused-then-resumed thread reads as clusters. */
const CLUSTER_GAP_MS = 5 * 60 * 1000;

/** Short, locale-aware label for a cluster divider: same-day shows the time,
 *  otherwise a compact date + time. Pure formatting — no i18n string needed. */
function formatClusterTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date} · ${time}`;
}

/** True on touch-first surfaces (native Capacitor shell or a coarse pointer),
 *  where Enter should insert a newline rather than send — matching the
 *  convention of every major mobile chat app. */
function isMobileComposer(): boolean {
  if (typeof window === 'undefined') return false;
  const isNative = Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.(),
  );
  if (isNative) return true;
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
}
