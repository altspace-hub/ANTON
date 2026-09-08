/**
 * EngagementIntakeChat — ANTON interviews the consultant.
 *
 * The Scope and Client Intelligence phases were forms, and every March
 * engagement on this instance stalled on them. This panel runs the intake as a
 * conversation: ANTON asks the two or three most valuable questions, proposes
 * what it can infer from the engagement letter (and, when authorised, what it
 * can find about the client online), and writes confirmed answers into the
 * same rows the forms edit — the forms stay as the editable record.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, Send, Loader2, Sparkles } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Turn { role: 'user' | 'assistant'; content: string }

interface Props {
  engagementId: string;
  /** engagements.intake_conversation as stored (JSON string or parsed). */
  conversation: string | Turn[] | null | undefined;
  /** Called after ANTON has written confirmed values, so the form reloads. */
  onApplied: () => void;
  researchAllowed?: boolean;
}

function parseTurns(raw: Props['conversation']): Turn[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

/** The reply as shown: the machine-readable block at the end is not for the reader. */
function visibleText(text: string): string {
  return text.replace(/<intake_update>[\s\S]*$/i, '').trimEnd();
}

export default function EngagementIntakeChat({ engagementId, conversation, onApplied, researchAllowed }: Props) {
  const [turns, setTurns] = useState<Turn[]>(() => parseTurns(conversation));
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTurns(parseTurns(conversation)); }, [conversation]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, streaming]);

  async function sendTurn(message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setLastApplied(null);
    if (message) setTurns((prev) => [...prev, { role: 'user', content: message }]);
    setStreaming('');
    let accumulated = '';
    try {
      const res = await fetchWithAuth(`/api/engagements/${engagementId}/intake/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error ?? `Intake failed (${res.status})`);
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
          try {
            const event = JSON.parse(line.slice(6)) as { type: string; content?: string; error?: string; message?: string; applied?: Record<string, number | boolean> };
            if (event.type === 'text_delta') {
              accumulated += String(event.content ?? '');
              setStreaming(visibleText(accumulated));
            } else if (event.type === 'intake_update' && event.applied) {
              const a = event.applied;
              const parts: string[] = [];
              if (Number(a.client_intelligence)) parts.push(`${a.client_intelligence} client field${Number(a.client_intelligence) === 1 ? '' : 's'}`);
              if (Number(a.scope_items)) parts.push(`${a.scope_items} scope item${Number(a.scope_items) === 1 ? '' : 's'}`);
              if (Number(a.boundaries)) parts.push(`${a.boundaries} boundar${Number(a.boundaries) === 1 ? 'y' : 'ies'}`);
              if (parts.length) { setLastApplied(`Saved: ${parts.join(', ')}.`); onApplied(); }
              else if (a.done) setLastApplied('Intake complete — nothing more to add.');
            } else if (event.type === 'error') {
              throw new Error(String(event.error ?? event.message ?? 'ANTON could not answer.'));
            }
          } catch (e) {
            if (e instanceof Error && !/JSON/.test(e.message)) throw e;
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
          <span className="text-sm font-semibold text-adv-off-white">Let ANTON interview you</span>
        </div>
        <span className="text-xs text-adv-gray">
          {researchAllowed ? 'Online research authorised — ANTON may look the client up.' : 'Answers are written into the form below.'}
        </span>
      </div>

      <div ref={scrollRef} className="max-h-96 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && !streaming && (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-xs text-adv-gray">
              Instead of filling in every field, answer a few questions. ANTON reads the engagement letter first and only asks what it cannot infer.
            </p>
            <button
              type="button"
              onClick={() => void sendTurn('')}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              Start the interview
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
        {lastApplied && <div className="text-xs text-adv-teal">{lastApplied}</div>}
        {error && <div className="text-xs text-adv-red">{error}</div>}
      </div>

      {(turns.length > 0 || streaming) && (
        <div className="flex items-end gap-2 border-t border-border px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
            placeholder="Answer, correct, or add — Ctrl+Enter to send"
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
