import { useState, useEffect, useCallback } from 'react';
import { Atom, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';

interface InjectedAtom {
  atom_id: string;
  retrieval_method: string;
  retrieval_score: number;
  injected_at: string;
  was_relevant: number | null;
  content: string;
  atom_type: string;
  category: string;
  confidence: number;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function methodBadge(method: string): { label: string; color: string } {
  switch (method) {
    case 'vector': return { label: 'Vector', color: 'bg-adv-blue/20 text-adv-blue' };
    case 'keyword': return { label: 'Keyword', color: 'bg-adv-gold/20 text-adv-gold' };
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

export default function InjectedAtomsPanel({ sessionId }: { sessionId: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [atoms, setAtoms] = useState<InjectedAtom[]>([]);
  const [loading, setLoading] = useState(false);
  const [ratingInFlight, setRatingInFlight] = useState<string | null>(null);

  const fetchAtoms = useCallback(async () => {
    if (!sessionId) { setAtoms([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/embeddings/feedback/${sessionId}`, { headers: authHeaders() });
      if (!res.ok) { setAtoms([]); return; }
      const data = await res.json() as { injectedAtoms: InjectedAtom[] };
      setAtoms(data.injectedAtoms ?? []);
    } catch {
      setAtoms([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (expanded && sessionId) fetchAtoms();
  }, [expanded, sessionId, fetchAtoms]);

  const rateAtom = async (atomId: string, wasRelevant: boolean) => {
    if (!sessionId) return;
    setRatingInFlight(atomId);
    try {
      await fetch('/api/embeddings/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ atomId, sessionId, wasRelevant }),
      });
      setAtoms(prev => prev.map(a =>
        a.atom_id === atomId ? { ...a, was_relevant: wasRelevant ? 1 : 0 } : a
      ));
    } catch { /* non-fatal */ }
    finally { setRatingInFlight(null); }
  };

  if (!sessionId) return null;

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-adv-off-white hover:bg-white/5 transition-colors rounded-xl"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Atom className="h-4 w-4 text-adv-teal" />
          <span className="font-medium">Knowledge Atoms Used</span>
          {atoms.length > 0 && (
            <span className="rounded-full bg-adv-teal/20 px-2 py-0.5 text-xs text-adv-teal">{atoms.length}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-adv-gray" /> : <ChevronDown className="h-4 w-4 text-adv-gray" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-adv-gray">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading injected atoms...
            </div>
          )}

          {!loading && atoms.length === 0 && (
            <p className="py-4 text-center text-xs text-adv-gray">
              No knowledge atoms were injected into this session yet.
            </p>
          )}

          {!loading && atoms.map(atom => {
            const badge = methodBadge(atom.retrieval_method);
            return (
              <div
                key={atom.atom_id}
                className="rounded-lg border border-border bg-adv-dark-2 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-adv-off-white leading-relaxed line-clamp-3">
                    {atom.content}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
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
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className={`text-[11px] font-medium ${categoryColor(atom.category)}`}>
                    {atom.category}
                  </span>
                  <span className="text-[11px] text-adv-gray">{atom.atom_type}</span>
                  {atom.retrieval_score > 0 && (
                    <span className="text-[11px] text-adv-gray">
                      score: {atom.retrieval_score.toFixed(2)}
                    </span>
                  )}
                  <span className="text-[11px] text-adv-gray">
                    {Math.round(atom.confidence * 100)}% conf
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
