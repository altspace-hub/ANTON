/**
 * InjectedAtomsPanel — the memory atoms that went into this answer, with the
 * thumbs that rate them (Wave 4: a rating binds to the answer through
 * retrieval_feedback.message_id).
 *
 * Loads on mount and again whenever the answer changes; opens by itself when
 * atoms exist. When nothing was injected it says why in the gate's own words:
 * the "context used" frame carries the verdict for this run, and without a
 * frame the gate is asked directly. The ratings given here are what unlock
 * the layer, so the panel says so.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Atom, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { fetchInjectedAtoms, rateInjectedAtom, fetchAtomInjectionStatus } from '@/lib/api';
import { useStreamStore } from '@/stores/useStreamStore';
import { useSessionMetaStore } from '@/stores/useSessionStore';
import type { ContextUsed, InjectedAtomRow, AtomInjectionStatus, AtomInjectionMode } from '@/lib/types';

export interface InjectedAtomsPanelProps {
  sessionId: string | null;
  /** The answer whose atoms to show. Defaults to the answer being written (live frame) or the session's last answer. */
  messageId?: string | null;
  /** The live "context used" frame; defaults to the stream store's last frame. Carries the gate's verdict. */
  contextUsed?: ContextUsed | null;
}

/** What the panel needs to say why nothing was injected, from either source. */
interface GateView {
  applies: boolean;
  mode: AtomInjectionMode;
  moduleAtoms: number;
  ratings: number;
  thresholds: { moduleAtoms: number; ratings: number };
  reason: string;
}

function gateFromContext(ctx: ContextUsed | null | undefined): GateView | null {
  const a = ctx?.atoms;
  if (!a) return null;
  const ready = a.moduleAtoms >= a.thresholds.moduleAtoms && a.ratings >= a.thresholds.ratings;
  return {
    applies: a.applied || a.mode === 'on' || (a.mode === 'auto' && ready),
    mode: a.mode, moduleAtoms: a.moduleAtoms, ratings: a.ratings, thresholds: a.thresholds, reason: a.reason,
  };
}

function gateFromStatus(s: AtomInjectionStatus | null): GateView | null {
  if (!s) return null;
  return { applies: s.applies, mode: s.mode, moduleAtoms: s.moduleAtoms, ratings: s.ratings, thresholds: s.thresholds, reason: s.reason };
}

/** One plain sentence for the empty state. `extraRatings` = ratings given in this panel since the numbers were read. */
export function gateSentence(g: GateView | null, fromRun: boolean, extraRatings = 0): string {
  if (!g) return fromRun ? 'No prior knowledge atoms were injected into this answer.' : 'No prior knowledge atoms were injected into this session yet.';
  if (g.reason === 'gate unavailable') return 'Memory injection status could not be read, so nothing was injected.';
  if (g.mode === 'off') return 'Memory injection is switched off in Settings. Coding Studio project lessons still apply.';
  if (!g.applies) {
    return `Memory injection is collecting: ${g.moduleAtoms} of ${g.thresholds.moduleAtoms} module atoms, ${g.ratings + extraRatings} of ${g.thresholds.ratings} ratings. Ratings you give here count.`;
  }
  const how = g.mode === 'on' ? 'forced on in Settings' : 'ready';
  return fromRun
    ? `Memory injection is ${how}, but no prior atoms passed the relevance rules for this answer.`
    : `Memory injection is ${how}. No prior atoms are recorded for this answer.`;
}

function methodBadge(method: string): { label: string; color: string } {
  switch (method) {
    case 'vector': return { label: 'Vector', color: 'bg-adv-blue/20 text-adv-blue' };
    case 'keyword': return { label: 'Keyword', color: 'bg-adv-gold/20 text-adv-gold' };
    case 'sql_fallback': return { label: 'Recent', color: 'bg-adv-gray/20 text-adv-gray' };
    default: return { label: 'Hybrid', color: 'bg-adv-teal/20 text-adv-teal' };
  }
}

function categoryColor(c: string): string {
  switch (c) {
    case 'observation': return 'text-adv-blue';
    case 'decision': return 'text-adv-teal';
    case 'action': return 'text-adv-green';
    case 'risk': return 'text-adv-red';
    case 'status': return 'text-adv-gold';
    case 'recommendation': return 'text-adv-blue';
    default: return 'text-adv-gray';
  }
}

export default function InjectedAtomsPanel({ sessionId, messageId, contextUsed }: InjectedAtomsPanelProps) {
  const storeCtx = useStreamStore((s) => s.lastContextUsed);
  const isStreaming = useStreamStore((s) => s.isStreaming);
  const messages = useSessionMetaStore((s) => s.messages);
  const ctx = contextUsed ?? storeCtx;

  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant')?.id ?? null,
    [messages],
  );
  const frameId = ctx?.assistantMessageId ?? null;
  // Which answer: an explicit id wins; during a run the frame names the answer
  // being written; otherwise the session's last answer. The frame id is tried
  // second when the two disagree (the local message is minted with it, usually).
  const answerId = messageId ?? (isStreaming && frameId ? frameId : lastAssistantId);
  const answerKey = `${sessionId ?? ''}:${answerId ?? ''}`;

  const [expanded, setExpanded] = useState(false);
  const [atoms, setAtoms] = useState<InjectedAtomRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ratingInFlight, setRatingInFlight] = useState<string | null>(null);
  const [gateStatus, setGateStatus] = useState<AtomInjectionStatus | null>(null);
  const [extraRatings, setExtraRatings] = useState(0);
  const gateRequested = useRef(false);

  // Load on mount and whenever the answer changes.
  useEffect(() => {
    if (!sessionId) { setAtoms([]); return; }
    let cancelled = false;
    const candidates = [...new Set([answerId, frameId].filter((id): id is string => !!id))];
    const load = async () => {
      setLoading(true);
      try {
        let rows: InjectedAtomRow[] = [];
        if (candidates.length === 0) {
          rows = await fetchInjectedAtoms(sessionId);
        } else {
          for (const id of candidates) {
            rows = await fetchInjectedAtoms(sessionId, id);
            if (rows.length > 0 || cancelled) break;
          }
        }
        if (!cancelled) setAtoms(rows);
      } catch {
        if (!cancelled) setAtoms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [sessionId, answerId, frameId]);

  // Open by itself when there is something to rate (a collapse survives a same-count refetch).
  useEffect(() => {
    if (atoms.length > 0) setExpanded(true);
  }, [atoms.length, answerKey]);

  // Without a frame verdict, ask the gate once for the empty-state sentence.
  useEffect(() => {
    if (!sessionId || ctx?.atoms || gateRequested.current) return;
    gateRequested.current = true;
    let cancelled = false;
    fetchAtomInjectionStatus()
      .then((s) => { if (!cancelled) setGateStatus(s); })
      .catch(() => { /* the empty state then says only that nothing was injected */ });
    return () => { cancelled = true; };
  }, [sessionId, ctx?.atoms]);

  const rateAtom = async (atomId: string, wasRelevant: boolean) => {
    if (!sessionId) return;
    setRatingInFlight(atomId);
    try {
      const ok = await rateInjectedAtom(sessionId, atomId, wasRelevant);
      if (!ok) return;
      const wasUnrated = atoms.find((a) => a.atom_id === atomId)?.was_relevant == null;
      if (wasUnrated) setExtraRatings((n) => n + 1);
      setAtoms((prev) => prev.map((a) => (a.atom_id === atomId ? { ...a, was_relevant: wasRelevant ? 1 : 0 } : a)));
    } catch { /* non-fatal */ }
    finally { setRatingInFlight(null); }
  };

  if (!sessionId) return null;

  const gate = gateFromContext(ctx) ?? gateFromStatus(gateStatus);
  const emptyText = gateSentence(gate, !!ctx?.atoms, extraRatings);

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-adv-off-white hover:bg-white/5 transition-colors rounded-xl"
        aria-expanded={expanded}
        aria-controls="injected-atoms-body"
      >
        <div className="flex items-center gap-2">
          <Atom className="h-4 w-4 text-adv-teal" />
          <span className="font-medium">Knowledge Atoms Used</span>
          {atoms.length > 0 && (
            <span className="rounded-full bg-adv-teal/20 px-2 py-0.5 text-xs text-adv-teal" aria-label={`${atoms.length} atoms injected`}>{atoms.length}</span>
          )}
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-adv-gray" aria-hidden="true" />}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-adv-gray" /> : <ChevronDown className="h-4 w-4 text-adv-gray" />}
      </button>

      {expanded && (
        <div id="injected-atoms-body" className="border-t border-border px-4 py-3 space-y-2">
          {loading && atoms.length === 0 && (
            <div className="flex items-center gap-2 py-4 text-sm text-adv-gray">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading injected atoms...
            </div>
          )}

          {!loading && atoms.length === 0 && (
            <p className="py-3 text-sm leading-relaxed text-adv-gray" role="status">
              {emptyText}
            </p>
          )}

          {atoms.length > 0 && (
            <p className="text-sm text-adv-gray">
              Memory from earlier runs, not verified sources. Was each one useful for this answer?
            </p>
          )}

          {atoms.map((atom) => {
            const badge = methodBadge(atom.retrieval_method);
            return (
              <div
                key={atom.atom_id}
                className="rounded-lg border border-border bg-adv-dark-2 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-adv-off-white leading-relaxed line-clamp-3" title={atom.content}>
                    {atom.content}
                  </p>
                  <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Rate this atom">
                    <button
                      onClick={() => rateAtom(atom.atom_id, true)}
                      disabled={ratingInFlight === atom.atom_id}
                      className={`rounded p-1 transition-colors ${
                        atom.was_relevant === 1
                          ? 'bg-adv-green/20 text-adv-green'
                          : 'text-adv-gray hover:text-adv-green hover:bg-adv-green/10'
                      }`}
                      title="Mark as relevant"
                      aria-label="Mark atom as relevant"
                      aria-pressed={atom.was_relevant === 1}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => rateAtom(atom.atom_id, false)}
                      disabled={ratingInFlight === atom.atom_id}
                      className={`rounded p-1 transition-colors ${
                        atom.was_relevant === 0
                          ? 'bg-adv-red/20 text-adv-red'
                          : 'text-adv-gray hover:text-adv-red hover:bg-adv-red/10'
                      }`}
                      title="Mark as irrelevant"
                      aria-label="Mark atom as irrelevant"
                      aria-pressed={atom.was_relevant === 0}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className={`text-xs font-medium ${categoryColor(atom.category)}`}>
                    {atom.category}
                  </span>
                  <span className="text-xs text-adv-gray">{atom.atom_type}</span>
                  {atom.retrieval_score > 0 && (
                    <span className="text-xs text-adv-gray">
                      score: {atom.retrieval_score.toFixed(2)}
                    </span>
                  )}
                  {Number.isFinite(atom.confidence) && (
                    <span className="text-xs text-adv-gray">
                      {Math.round(atom.confidence * 100)}% conf
                    </span>
                  )}
                  {atom.was_relevant !== null && atom.was_relevant !== undefined && (
                    <span className={`text-xs ${atom.was_relevant === 1 ? 'text-adv-green' : 'text-adv-red'}`}>
                      {atom.was_relevant === 1 ? 'rated relevant' : 'rated not relevant'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
