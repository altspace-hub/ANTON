/**
 * GapInterviewChat — ANTON conducts the control interview.
 *
 * Step 3 of the Gap Assessor asked for "interview notes" in a blank textarea,
 * which meant the consultant had to know which questions establish the five
 * facts each article is scored on (documented, implemented, tested,
 * evidenced, owner assigned). ANTON now asks those questions theme by theme
 * and turns the answers into attributed, article-referenced interview notes —
 * the same notes the textarea holds, so they remain editable evidence.
 *
 * The conversation is the wizard's to keep (it lives in context_config with
 * the rest of Step 3); this panel only runs one turn at a time.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, Send, Loader2, Sparkles } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export interface InterviewTurn { role: 'user' | 'assistant'; content: string }
export interface InterviewNoteDraft { role: string; articles: string[]; text: string }

interface Props {
  assessmentId: string;
  conversation: InterviewTurn[];
  /** Fired once per completed turn with the full conversation and the notes ANTON recorded. */
  onTurn: (turns: InterviewTurn[], notes: InterviewNoteDraft[], done: boolean) => void | Promise<void>;
}

/** The reply as shown: the machine-readable block at the end is not for the reader. */
function visibleText(text: string): string {
  return text.replace(/<interview_update>[\s\S]*$/i, '').trimEnd();
}

export default function GapInterviewChat({ assessmentId, conversation, onTurn }: Props) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRecorded, setLastRecorded] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conversation, streaming, pendingUser]);

  async function sendTurn(message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setLastRecorded(null);
    const turns: InterviewTurn[] = message ? [...conversation, { role: 'user', content: message }] : [...conversation];
    if (message) setPendingUser(message);
    setStreaming('');
    let accumulated = '';
    let notes: InterviewNoteDraft[] = [];
    let done = false;
    try {
      const res = await fetchWithAuth(`/api/gap-assessments/${assessmentId}/interview/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: turns }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(detail.error ?? `Interview failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          let event: { type: string; content?: string; error?: string; message?: string; notes?: InterviewNoteDraft[]; done?: boolean };
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === 'text_delta') {
            accumulated += String(event.content ?? '');
            setStreaming(visibleText(accumulated));
          } else if (event.type === 'interview_update') {
            notes = Array.isArray(event.notes) ? event.notes : [];
            done = event.done === true;
          } else if (event.type === 'error') {
            throw new Error(String(event.error ?? event.message ?? 'ANTON could not answer.'));
          }
        }
      }
      const shown = visibleText(accumulated);
      if (shown) turns.push({ role: 'assistant', content: shown });
      if (notes.length > 0) {
        const roles = [...new Set(notes.map((n) => n.role))];
        setLastRecorded(`Recorded ${notes.length} note${notes.length === 1 ? '' : 's'} (${roles.join(', ')}) into Interview Notes below.`);
      } else if (done) {
        setLastRecorded('Interview complete — every theme in scope has been covered.');
      }
      await onTurn(turns, notes, done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming('');
      setPendingUser(null);
      setBusy(false);
    }
  }

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    void sendTurn(text);
  };

  const started = conversation.length > 0 || streaming !== '' || pendingUser !== null;

  return (
    <div className="rounded-xl border border-adv-teal/30 bg-adv-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-off-white">Let ANTON run the control interview</h3>
        </div>
        <span className="text-xs text-adv-gray">Answers become interview notes</span>
      </div>

      <div ref={scrollRef} className="max-h-96 space-y-3 overflow-y-auto px-4 py-3">
        {!started && (
          <div className="flex flex-col items-start gap-3 py-1">
            <p className="text-xs text-adv-gray">
              ANTON asks the questions that establish whether each article in scope is documented, implemented, tested, evidenced and owned — theme by theme — and writes up what you say as attributed interview notes. Answer as the interviewee would, or relay what they told you.
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
        {conversation.map((t, i) => (
          <div key={i} className={`text-sm ${t.role === 'user' ? 'text-adv-off-white' : 'text-adv-gray'}`}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-adv-gray">{t.role === 'user' ? 'You' : 'ANTON'}</div>
            <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{t.content}</ReactMarkdown></div>
          </div>
        ))}
        {pendingUser && (
          <div className="text-sm text-adv-off-white">
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-adv-gray">You</div>
            <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{pendingUser}</ReactMarkdown></div>
          </div>
        )}
        {streaming && (
          <div className="text-sm text-adv-gray">
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-adv-gray">ANTON</div>
            <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{streaming}</ReactMarkdown></div>
          </div>
        )}
        {lastRecorded && <div className="text-xs text-adv-teal">{lastRecorded}</div>}
        {error && <div className="text-xs text-adv-red">{error}</div>}
      </div>

      {started && (
        <div className="flex items-end gap-2 border-t border-border px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
            placeholder="Answer, or say who you are speaking with — Ctrl+Enter to send"
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
