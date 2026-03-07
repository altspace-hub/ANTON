import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronRight, Loader2, CheckCircle2, Send, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAuthHeader } from '@/lib/api';

type Phase = 'describe' | 'active' | 'resolved';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface LaxhjalpModeProps {
  classId: string;
  subjectId: string;
  onClose: () => void;
  onResolved: (topic: string) => void;
}

export default function LaxhjalpMode({ classId, subjectId, onClose, onResolved }: LaxhjalpModeProps) {
  const { t } = useTranslation('school');
  const [phase, setPhase] = useState<Phase>('describe');
  const [stuckPoint, setStuckPoint] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stuckInputRef = useRef<HTMLTextAreaElement>(null);

  // Message count to show "continue" button after enough exchanges
  const assistantMsgCount = messages.filter((m) => m.role === 'assistant').length;
  const canResolve = assistantMsgCount >= 2;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (phase === 'active') inputRef.current?.focus();
    if (phase === 'describe') stuckInputRef.current?.focus();
  }, [phase]);

  const callLaxhjalp = useCallback(async (stuckPt: string, priorMsgs: Message[], newUserMsg?: string) => {
    const assistantId = crypto.randomUUID();

    // Optimistically add user message + empty assistant placeholder
    const updatedMsgs: Message[] = newUserMsg
      ? [...priorMsgs, { id: crypto.randomUUID(), role: 'user', content: newUserMsg }]
      : priorMsgs;

    setMessages([...updatedMsgs, { id: assistantId, role: 'assistant', content: '' }]);
    setIsStreaming(true);
    setError(null);

    try {
      const res = await fetch('/api/school/laxhjalp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          classId: classId || undefined,
          stuckPoint: stuckPt,
          priorMessages: updatedMsgs.map((m) => ({ role: m.role, content: m.content })),
          subjectId,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'text_delta' && parsed.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + parsed.content } : m
                )
              );
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error connecting to server');
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
    }
  }, [classId, subjectId]);

  async function handleStart() {
    const pt = stuckPoint.trim();
    if (!pt) return;
    setPhase('active');
    await callLaxhjalp(pt, []);
  }

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    const priorMsgs = messages.filter((m) => m.content !== '');
    await callLaxhjalp(stuckPoint, priorMsgs, text);
  }, [input, isStreaming, messages, stuckPoint, callLaxhjalp]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (phase === 'describe') handleStart();
      else handleSend();
    }
  }

  // ── Describe phase — student explains stuck point ────────────────────
  if (phase === 'describe') {
    return (
      <div className="flex h-[calc(100vh-3.5rem-2rem)] flex-col rounded-xl border border-adv-teal/20 bg-adv-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-adv-white">
              {t('laxhjalp.title', { defaultValue: 'Läxhjälp' })}
            </h2>
            <p className="text-xs text-adv-gray">
              {t('laxhjalp.subtitle', { defaultValue: 'Deep focus homework help' })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center p-8 gap-6">
          <div className="w-full max-w-md text-center">
            <div className="mb-4 text-4xl">🤔</div>
            <h3 className="text-base font-semibold text-adv-white mb-2">
              {t('laxhjalp.stuckQuestion', { defaultValue: 'Where are you stuck?' })}
            </h3>
            <p className="text-sm text-adv-gray mb-6">
              {t('laxhjalp.stuckDescription', {
                defaultValue: 'Describe the exact point where you got confused. The more specific, the better I can help.',
              })}
            </p>
            <textarea
              ref={stuckInputRef}
              value={stuckPoint}
              onChange={(e) => setStuckPoint(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('laxhjalp.stuckPlaceholder', {
                defaultValue: 'e.g. "I understand how to multiply, but when I add negative numbers I get confused..."',
              })}
              rows={4}
              className="w-full resize-none rounded-xl border border-border bg-adv-dark px-4 py-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <button
              type="button"
              onClick={handleStart}
              disabled={!stuckPoint.trim()}
              className="mt-4 flex items-center gap-2 mx-auto rounded-xl bg-adv-teal px-6 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('laxhjalp.startSession', { defaultValue: "Let's work through it" })}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active / Resolved phase — conversation ────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem-2rem)] flex-col rounded-xl border border-adv-teal/20 bg-adv-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-adv-white">
            {t('laxhjalp.title', { defaultValue: 'Läxhjälp' })}
          </h2>
          <p className="truncate text-xs text-adv-gray">{stuckPoint}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'rounded-br-sm bg-adv-teal text-adv-dark'
                  : 'rounded-bl-sm border border-border bg-adv-dark text-adv-off-white'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content || (isStreaming ? '▋' : '')}
                  </ReactMarkdown>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {canResolve && !isStreaming && phase !== 'resolved' && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => setPhase('resolved')}
              className="flex items-center gap-1.5 rounded-xl border border-adv-teal/30 bg-adv-teal/10 px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/20"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('laxhjalp.iUnderstandNow', { defaultValue: "I understand now — back to my work!" })}
            </button>
          </div>
        )}

        {phase === 'resolved' && (
          <div className="rounded-xl border border-adv-teal/20 bg-adv-teal/5 p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-adv-teal" />
            <p className="text-sm font-medium text-adv-white">
              {t('laxhjalp.resolved', { defaultValue: 'Great work! Ready to continue?' })}
            </p>
            <button
              type="button"
              onClick={() => onResolved(subjectId)}
              className="mt-3 flex items-center gap-1.5 mx-auto rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
            >
              {t('laxhjalp.continue', { defaultValue: 'Continue with my assignment' })}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-adv-red/20 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {phase === 'active' && (
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder', { defaultValue: 'Reply to Alma...' })}
              rows={2}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="self-end rounded-lg bg-adv-teal p-2.5 text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
