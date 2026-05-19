// Create-delegation modal — pick tasks (single or a sub-graph), pick a
// peer ANTON (capability/trust-ranked), write the brief, create + send.
// Wires together B1 (sub-graph delegation) and B2 (peer suggestions).

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface MissionTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  sort_order: number;
}

interface PeerSuggestion {
  contactHash: string;
  displayName: string | null;
  trustLevel: string;
  score: number;
  matchedAgents: string[];
}

const TRUST_LABEL: Record<string, string> = {
  pre_approved: 'pre-approved', suggested: 'suggested', manual: 'manual', self: 'self',
};

export default function CreateDelegationModal({ missionId, onClose, onCreated }: {
  missionId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tasks, setTasks] = useState<MissionTask[]>([]);
  const [peers, setPeers] = useState<PeerSuggestion[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<string>('');
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [paymentFtc, setPaymentFtc] = useState('');
  const [runInSequence, setRunInSequence] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mres = await fetchWithAuth(`/api/missions/${missionId}`, { headers: getAuthHeader() });
        const mdata = await mres.json();
        if (!mres.ok) throw new Error(mdata?.error || `HTTP ${mres.status}`);
        const pres = await fetchWithAuth('/api/missions/delegations/peer-suggestions', { headers: getAuthHeader() });
        const pdata = await pres.json();
        if (cancelled) return;
        setTasks(mdata.tasks ?? []);
        setPeers(pres.ok ? (pdata.peers ?? []) : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [missionId]);

  function toggleTask(id: string): void {
    setSelectedTaskIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  const selected = selectedTaskIds
    .map(id => tasks.find(t => t.id === id))
    .filter((t): t is MissionTask => !!t);
  const canSubmit = selected.length > 0 && !!selectedPeer && objective.trim().length > 0 && !submitting;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      const briefBase: Record<string, unknown> = {
        title: (title.trim() || selected[0]?.title || 'Delegated work').slice(0, 200),
        objective: objective.trim(),
      };
      if (expectedOutput.trim()) briefBase.expectedOutput = expectedOutput.trim();
      if (Number(paymentFtc) > 0) briefBase.paymentAmountFtc = Number(paymentFtc);

      let delegationId: string;
      if (selected.length === 1) {
        // Single task — use the task-scoped route so the delegation keeps a
        // task_id, which lets the approved result be folded back (B3).
        const res = await fetchWithAuth(`/api/missions/${missionId}/tasks/${selected[0].id}/delegate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ peer_contact_hash: selectedPeer, brief: briefBase }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        delegationId = data.delegation.id;
      } else {
        // Multiple tasks — a sub-graph (B1).
        const subTasks = selected.map((t, i) => ({
          title: t.title.slice(0, 200),
          description: t.description ?? undefined,
          taskType: t.task_type,
          ...(runInSequence && i > 0 ? { dependsOn: [i - 1] } : {}),
        }));
        const res = await fetchWithAuth(`/api/missions/${missionId}/delegate-graph`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ peer_contact_hash: selectedPeer, brief: { ...briefBase, tasks: subTasks } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        delegationId = data.delegation.id;
      }

      // Sign + queue it for the peer.
      const sres = await fetchWithAuth(`/api/missions/delegations/${delegationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      const sdata = await sres.json();
      if (!sres.ok) throw new Error(`Delegation created but could not be sent: ${sdata?.error || sres.status}`);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const inputCls = 'w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[12px] text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal/50 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-xl border border-border bg-adv-card shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-adv-off-white">Delegate to a peer ANTON</h3>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-off-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-adv-gray">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading mission tasks and peers…
          </div>
        ) : (
          <div className="space-y-5 px-4 py-4">

            {/* ── Tasks ── */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-adv-gray">
                Tasks to delegate {selected.length > 0 && <span className="text-adv-teal">· {selected.length} selected</span>}
              </div>
              {tasks.length === 0 ? (
                <p className="text-[11px] text-adv-gray">This mission has no tasks yet — decompose it first.</p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-border p-1.5">
                  {tasks.map(t => {
                    const idx = selectedTaskIds.indexOf(t.id);
                    return (
                      <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-adv-dark">
                        <input type="checkbox" checked={idx >= 0} onChange={() => toggleTask(t.id)} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="text-[12px] text-adv-off-white">{t.title}</span>
                          <span className="ml-1 text-[10px] text-adv-gray">· {t.task_type}</span>
                          {idx >= 0 && <span className="ml-1 text-[10px] text-adv-teal">#{idx + 1}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {selected.length > 1 && (
                <label className="mt-1.5 flex items-center gap-2 text-[11px] text-adv-gray">
                  <input type="checkbox" checked={runInSequence} onChange={e => setRunInSequence(e.target.checked)} />
                  Run in sequence (each task waits for the previous one)
                </label>
              )}
            </div>

            {/* ── Peer ── */}
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-adv-gray">
                Peer ANTON <span className="normal-case text-adv-gray/70">· ranked by trust + capability</span>
              </div>
              {peers.length === 0 ? (
                <p className="text-[11px] text-adv-gray">No connected ANTON peers — connect one in the Community pillar first.</p>
              ) : (
                <div className="space-y-1">
                  {peers.map(p => (
                    <label key={p.contactHash} className="flex cursor-pointer items-center gap-2 rounded border border-border px-2 py-1.5 hover:bg-adv-dark">
                      <input type="radio" name="peer" checked={selectedPeer === p.contactHash}
                        onChange={() => setSelectedPeer(p.contactHash)} />
                      <span className="min-w-0 flex-1">
                        <span className="text-[12px] text-adv-off-white">
                          {p.displayName ?? p.contactHash.slice(0, 16) + '…'}
                        </span>
                        <span className="ml-1.5 rounded border border-border px-1 py-0.5 text-[9px] text-adv-gray">
                          {TRUST_LABEL[p.trustLevel] ?? p.trustLevel}
                        </span>
                        {p.matchedAgents.length > 0 && (
                          <span className="ml-1 text-[10px] text-adv-teal">matches: {p.matchedAgents.slice(0, 3).join(', ')}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* ── Brief ── */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray">Brief</div>
              <input className={inputCls} placeholder="Title (optional — defaults to the first task)"
                value={title} onChange={e => setTitle(e.target.value)} maxLength={200} />
              <textarea className={inputCls} rows={3} placeholder="Objective — what should the peer achieve?"
                value={objective} onChange={e => setObjective(e.target.value)} maxLength={8000} />
              <textarea className={inputCls} rows={2} placeholder="Expected output (optional)"
                value={expectedOutput} onChange={e => setExpectedOutput(e.target.value)} maxLength={8000} />
              <input className={inputCls} type="number" min="0" step="0.01"
                placeholder="Payment in FTC (optional — settles on approval, stub)"
                value={paymentFtc} onChange={e => setPaymentFtc(e.target.value)} />
            </div>

            {error && (
              <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} disabled={submitting}
            className="rounded border border-border px-3 py-1.5 text-[12px] text-adv-gray hover:text-adv-off-white disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded border border-adv-teal/40 bg-adv-teal/10 px-3 py-1.5 text-[12px] text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40">
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {submitting ? 'Creating…' : 'Create & send'}
          </button>
        </div>
      </div>
    </div>
  );
}
