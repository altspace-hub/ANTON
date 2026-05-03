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
import { cacheSession, isOnline, queueMessage } from '../services/offline';
import ChatBubble from '../components/ChatBubble';
import SuggestionChips from '../components/SuggestionChips';
import { Ico, Spinner, ErrorPill } from '../components/ui';

interface Props {
  orgId: string;
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
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

export default function ChatPage({ orgId, sessionId, onSessionCreated, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [sessionReloadTick, setSessionReloadTick] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [orgName, setOrgName] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const identity = getIdentity();

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

    sendQueryREST(orgId, text, {
      onStart: () => {},
      onChunk: (chunk) => { addMessage('assistant', chunk); },
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
    }, { sessionId: sessionId || undefined, outputLanguage: identity?.preferredLanguage });
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const hasInput = input.trim().length > 0;
  const headerTitle = sessionTitle || orgName || 'Chat';

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
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--color-text)',
              letterSpacing: '-0.2px',
            }}
          >
            {headerTitle}
          </h1>
          {streaming && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className="block animate-pulse rounded-full"
                style={{ width: 6, height: 6, background: 'var(--color-accent)' }}
              />
              <span
                className="text-[11px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Thinking…
              </span>
            </div>
          )}
        </div>
        {/* Optional right-side action — kept empty by intent (single primary action lives in composer) */}
        <div style={{ width: 44, height: 44 }} />
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

          {!loadingSession && messages.length === 0 && !streaming && (
            <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
              <span
                className="mb-3 inline-flex"
                style={{ color: 'var(--color-text-faint)' }}
              >
                <Ico name="message" size={28} />
              </span>
              <p
                className="text-[15px] font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                Ask anything
              </p>
              <p
                className="mt-1 max-w-[280px] text-[13px]"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {orgName ? `${orgName}'s ANTON is ready.` : 'Your ANTON is ready.'}
              </p>
            </div>
          )}

          {messages.map(msg => (
            <ChatBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              isError={msg.isError}
            />
          ))}

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
        <div className="mx-auto max-w-2xl px-3 pt-2.5"
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
              className="flex-1 resize-none bg-transparent text-[15px] focus:outline-none"
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
    </div>
  );
}

function msgsLength(d: SessionDetail): number {
  return (d.messages ?? []).length;
}
