/**
 * ResumePanel.tsx — the session conclusion has a reader (Wave 4b).
 *
 * After every substantial answer the server writes the session's running
 * conclusion (session-conclusion.ts) into session_snapshots. Until now the
 * only panel that showed it was mounted when the session had NO messages, so
 * nobody ever saw one. This panel mounts wherever a sessionId exists, shows
 * the latest conclusion, and can ask the server to conclude again now
 * (POST …/snapshots/auto). Collapsed by default with the summary's first line
 * in the header. Renders nothing for a session with neither a conclusion nor
 * messages; a session with messages but no conclusion yet gets one quiet line.
 *
 * The component name and named export are kept so existing imports work.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Bookmark, ChevronDown, ChevronUp, RefreshCw, CheckSquare, HelpCircle, ArrowRight, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { useSessionMetaStore } from '@/stores/useSessionStore';
import { useStreamStore } from '@/stores/useStreamStore';

interface Snapshot {
  id: string;
  session_id: string;
  snapshot_type: string;
  title: string | null;
  summary: string;
  key_decisions: string[];
  open_questions: string[];
  next_steps: string[];
  /** The assistant message this conclusion was written after (null for manual snapshots). */
  message_id: string | null;
  created_at: string;
}

interface ResumePanelProps {
  sessionId: string | null;
}

/** How long the panel keeps checking for the conclusion of a new answer (the writer runs after the stream ends). */
const FOLLOW_UP_DELAYS_MS = [6_000, 14_000, 30_000];

function firstLine(text: string, max = 110): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

function formatTime(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ResumePanel({ sessionId }: ResumePanelProps) {
  const messages = useSessionMetaStore((s) => s.messages);
  const isStreaming = useStreamStore((s) => s.isStreaming);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant') ?? null,
    [messages],
  );
  const lastAssistantId = lastAssistant?.id ?? null;

  const load = useCallback(async (): Promise<Snapshot | null> => {
    if (!sessionId) return null;
    try {
      const res = await fetchWithAuth(`/api/sessions/${sessionId}/snapshots/latest`);
      if (!res.ok) { setSnapshot(null); return null; }
      const data = await res.json() as { snapshot: Snapshot };
      setSnapshot(data.snapshot);
      return data.snapshot;
    } catch {
      return null;
    }
  }, [sessionId]);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  // Load on mount / session change.
  useEffect(() => {
    setSnapshot(null);
    setExpanded(false);
    setRefreshNote(null);
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, load]);

  // A new answer: the writer runs after the stream ends, so look again a few
  // times until the conclusion names this answer, then stop.
  useEffect(() => {
    clearTimers();
    if (!sessionId || !lastAssistantId || isStreaming) return;
    let cancelled = false;
    void load();
    for (const delay of FOLLOW_UP_DELAYS_MS) {
      timers.current.push(window.setTimeout(async () => {
        if (cancelled) return;
        const s = await load();
        if (s && s.message_id === lastAssistantId) clearTimers();
      }, delay));
    }
    return () => { cancelled = true; clearTimers(); };
  }, [sessionId, lastAssistantId, isStreaming, load]);

  const refreshConclusion = async () => {
    if (!sessionId || refreshing) return;
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const res = await fetchWithAuth(`/api/sessions/${sessionId}/snapshots/auto`, { method: 'POST' });
      if (res.status === 404) {
        setRefreshNote('There is no answer to conclude from yet.');
        return;
      }
      if (!res.ok) {
        setRefreshNote('The conclusion could not be refreshed.');
        return;
      }
      const data = await res.json() as { written: boolean; reason: string | null; snapshot: Snapshot | null };
      if (data.snapshot) setSnapshot(data.snapshot);
      if (!data.written) {
        setRefreshNote(
          data.reason === 'already written' ? 'This answer is already concluded.'
          : data.reason === 'too short' ? 'The last answer is too short to conclude.'
          : data.reason === 'in flight' ? 'A conclusion is being written right now.'
          : 'The conclusion was not rewritten.',
        );
      }
      if (data.snapshot) setExpanded(true);
    } catch {
      setRefreshNote('The conclusion could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  };

  if (!sessionId) return null;
  if (!snapshot && messages.length === 0) return null;

  const refreshButton = (
    <button
      type="button"
      onClick={refreshConclusion}
      disabled={refreshing || isStreaming}
      aria-busy={refreshing}
      aria-label="Refresh conclusion"
      className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-adv-teal bg-adv-teal/15 hover:bg-adv-teal/25 transition-colors disabled:opacity-50"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
      Refresh conclusion
    </button>
  );

  // Messages but no conclusion yet: one quiet line, and the way to ask for one.
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-adv-off-white">
            <Bookmark className="h-4 w-4 text-adv-teal" aria-hidden="true" />
            <span className="font-medium">Session conclusion</span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-adv-gray" aria-hidden="true" />}
          </div>
          {refreshButton}
        </div>
        <p className="mt-1 text-sm text-adv-gray" role="status">
          {refreshNote ?? 'No conclusion written yet — it appears after the first substantial answer.'}
        </p>
      </div>
    );
  }

  const writtenAfter = formatTime(
    (snapshot.message_id && messages.find((m) => m.id === snapshot.message_id)?.createdAt) || snapshot.created_at,
  );
  const headline = snapshot.title?.trim() || firstLine(snapshot.summary);

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm text-adv-off-white hover:bg-white/5 transition-colors"
        aria-expanded={expanded}
        aria-controls="session-conclusion-body"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Bookmark className="h-4 w-4 shrink-0 text-adv-teal" aria-hidden="true" />
          <span className="shrink-0 font-medium">Session conclusion</span>
          <span className="truncate text-adv-gray" title={headline}>{firstLine(snapshot.summary)}</span>
          {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-adv-gray" aria-hidden="true" />}
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 shrink-0 text-adv-gray" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4 shrink-0 text-adv-gray" aria-hidden="true" />}
      </button>

      {expanded && (
        <div id="session-conclusion-body" className="space-y-3 border-t border-border px-4 py-3">
          {snapshot.title && (
            <p className="text-sm font-semibold text-adv-off-white">{snapshot.title}</p>
          )}

          <div>
            <p className="mb-1 text-sm text-adv-gray">Summary</p>
            <p className="text-sm leading-relaxed text-adv-off-white">{snapshot.summary}</p>
          </div>

          {snapshot.key_decisions.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5 text-adv-teal" aria-hidden="true" />
                <p className="text-sm font-medium text-adv-gray">Key decisions</p>
              </div>
              <ul className="space-y-1" aria-label="Key decisions">
                {snapshot.key_decisions.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-adv-off-white">
                    <span className="text-adv-teal" aria-hidden="true">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {snapshot.open_questions.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-adv-gold" aria-hidden="true" />
                <p className="text-sm font-medium text-adv-gray">Open questions</p>
              </div>
              <ul className="space-y-1" aria-label="Open questions">
                {snapshot.open_questions.map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm text-adv-off-white">
                    <span className="text-adv-gold" aria-hidden="true">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {snapshot.next_steps.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5 text-adv-blue" aria-hidden="true" />
                <p className="text-sm font-medium text-adv-gray">Next steps</p>
              </div>
              <ol className="space-y-1" aria-label="Next steps">
                {snapshot.next_steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-adv-off-white">
                    <span className="text-adv-blue" aria-hidden="true">{i + 1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-sm text-adv-gray">
              {writtenAfter ? `Written after the answer of ${writtenAfter}` : 'Written after an earlier answer'}
              {snapshot.snapshot_type === 'manual' ? ' (saved by hand)' : ''}
            </p>
            {refreshButton}
          </div>
          {refreshNote && (
            <p className="text-sm text-adv-gray" role="status">{refreshNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
