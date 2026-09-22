/**
 * IntakeChat — a model-led intake conversation over a server-kept transcript.
 *
 * The forms this replaces (engagement client intelligence, the Counsel's Desk
 * matter) were where work stalled. The pattern is the same everywhere: POST
 * one message to an intake endpoint, stream the reply, and let the server
 * apply what the user confirmed — the reply's trailing machine block is the
 * server's business and never shown. The caller decides what the update
 * frame means (a status line) and reloads its own data.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, Send, Loader2, Sparkles } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export interface IntakeTurn { role: 'user' | 'assistant'; content: string }

interface Props {
  /** POST target; the body is `{ message }` (empty message = open the intake). */
  endpoint: string;
  /** The stored transcript (JSON string or parsed). */
  conversation: string | IntakeTurn[] | null | undefined;
  /** The SSE frame type the endpoint emits once it has applied the update. */
  updateType: string;
  /** The tag of the trailing machine block to hide while streaming. */
  blockTag: string;
  /** Called with the update frame; return the status line to show (null for none). */
  onUpdate: (frame: Record<string, unknown>) => string | null;
  title: string;
  intro: string;
  subtitle?: string;
  placeholder?: string;
  startLabel?: string;
}

function parseTurns(raw: Props['conversation']): IntakeTurn[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

export default function IntakeChat({ endpoint, conversation, updateType, blockTag, onUpdate, title, intro, subtitle, placeholder, startLabel }: Props) {
  const [turns, setTurns] = useState<IntakeTurn[]>(() => parseTurns(conversation));
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blockPattern = new RegExp(`<${blockTag}>[\\s\\S]*$`, 'i');
  const visibleText = (text: string) => text.replace(blockPattern, '').trimEnd();

  useEffect(() => { setTurns(parseTurns(conversation)); }, [conversation]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, streaming]);

  async function sendTurn(message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    if (message) setTurns((prev) => [...prev, { role: 'user', content: message }]);
    setStreaming('');
    let accumulated = '';
    try {
      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          let event: Record<string, unknown> & { type?: string };
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === 'text_delta') {
            accumulated += String(event.content ?? '');
            setStreaming(visibleText(accumulated));
          } else if (event.type === updateType) {
            setStatus(onUpdate(event));
          } else if (event.type === 'error') {
            throw new Error(String(event.error ?? event.message ?? 'ANTON could not answer.'));
          }
        }
      }
      const shown = visibleText(accumulated);
      if (shown) setTurns((prev) => [...prev, { role: 'assistant', content: shown }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming('');
      setBusy(false);
    }
  }

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    void sendTurn(text);
  };

  return (
    <div className="rounded-xl border border-adv-teal/30 bg-adv-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-adv-teal" />
          <span className="text-sm font-semibold text-adv-off-white">{title}</span>
        </div>
        {subtitle && <span className="text-xs text-adv-gray">{subtitle}</span>}
      </div>

      <div ref={scrollRef} className="max-h-96 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && !streaming && (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-xs text-adv-gray">{intro}</p>
            <button
              type="button"
              onClick={() => void sendTurn('')}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              {startLabel ?? 'Start'}
            </button>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`text-sm ${t.role === 'user' ? 'text-adv-off-white' : 'text-adv-gray'}`}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-adv-gray">{t.role === 'user' ? 'You' : 'ANTON'}</div>
            <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{t.content}</ReactMarkdown></div>
          </div>
        ))}
        {streaming && (
          <div className="text-sm text-adv-gray">
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-adv-gray">ANTON</div>
            <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{streaming}</ReactMarkdown></div>
          </div>
        )}
        {status && <div className="text-xs text-adv-teal">{status}</div>}
        {error && <div className="text-xs text-adv-red">{error}</div>}
      </div>

      {(turns.length > 0 || streaming) && (
        <div className="flex items-end gap-2 border-t border-border px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
            placeholder={placeholder ?? 'Answer, correct, or add — Ctrl+Enter to send'}
            rows={2}
            disabled={busy}
            className="min-h-[48px] flex-1 resize-y rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !input.trim()}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-adv-teal px-3 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
