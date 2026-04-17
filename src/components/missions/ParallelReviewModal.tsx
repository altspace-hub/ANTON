// Parallel-review checkpoint composer.
// Opens from a paused checkpoint task; creates a BEEHIVE 'review' session
// with multiple peer reviewers via POST /missions/:id/tasks/:taskId/parallel-review.

import { useEffect, useState } from 'react';
import { Users, X, Plus, AlertCircle } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type Role = 'queen' | 'worker' | 'scout' | 'observer';

interface Reviewer {
  contactHash: string;
  displayName: string;
  role: Role;
}

interface ConnectionOption {
  contact_hash: string;
  display_name: string;
}

interface Props {
  open: boolean;
  missionId: string;
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ParallelReviewModal({ open, missionId, taskId, taskTitle, onClose, onSuccess }: Props) {
  const [question, setQuestion] = useState('');
  const [contextDoc, setContextDoc] = useState('');
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [consensusMode, setConsensusMode] = useState<'unanimous' | 'supermajority' | 'majority'>('majority');
  const [slaHours, setSlaHours] = useState(48);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Connection picker
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetchWithAuth('/api/community/connections', { headers: getAuthHeader() });
        const data = await res.json();
        if (res.ok) {
          const conns = (data.connections ?? data ?? [])
            .filter((c: { status: string }) => c.status === 'accepted' || c.status === 'active')
            .map((c: { contact_hash: string; display_name: string }) => ({ contact_hash: c.contact_hash, display_name: c.display_name }));
          setConnections(conns);
        }
      } catch {
        // Non-fatal — user can still type contact hashes manually if needed
      }
    })();
  }, [open]);

  if (!open) return null;

  function addReviewer(c: ConnectionOption): void {
    if (reviewers.some(r => r.contactHash === c.contact_hash)) return;
    setReviewers([...reviewers, { contactHash: c.contact_hash, displayName: c.display_name, role: 'worker' }]);
    setPickerOpen(false);
  }

  function removeReviewer(hash: string): void {
    setReviewers(reviewers.filter(r => r.contactHash !== hash));
  }

  function setRole(hash: string, role: Role): void {
    setReviewers(reviewers.map(r => r.contactHash === hash ? { ...r, role } : r));
  }

  async function submit(): Promise<void> {
    setError(null);
    if (reviewers.length < 2) { setError('At least 2 reviewers required'); return; }
    if (!question.trim()) { setError('Question is required'); return; }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/missions/${missionId}/tasks/${taskId}/parallel-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          question: question.trim(),
          context_document: contextDoc.trim() || undefined,
          reviewers: reviewers.map(r => ({
            contact_hash: r.contactHash,
            display_name: r.displayName,
            role: r.role,
          })),
          consensus_mode: consensusMode,
          sla_hours: slaHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const availableConnections = connections.filter(c => !reviewers.some(r => r.contactHash === c.contact_hash));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-adv-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-adv-off-white inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-adv-teal" />
              Parallel review (BEEHIVE)
            </h2>
            <p className="text-[11px] text-adv-gray mt-0.5">
              Checkpoint: {taskTitle}
            </p>
          </div>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-off-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <label className="block text-[11px] text-adv-gray">
            Question for reviewers
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="What do you want them to converge on?"
              rows={2}
              maxLength={4000}
              className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
            />
          </label>

          <label className="block text-[11px] text-adv-gray">
            Context document (optional, shown to reviewers)
            <textarea
              value={contextDoc}
              onChange={e => setContextDoc(e.target.value)}
              rows={4}
              maxLength={50000}
              className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white font-mono"
            />
          </label>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-adv-gray">Reviewers ({reviewers.length})</span>
              <button
                onClick={() => setPickerOpen(s => !s)}
                disabled={availableConnections.length === 0}
                className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1 disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
                Add reviewer
              </button>
            </div>

            {pickerOpen && availableConnections.length > 0 && (
              <div className="mb-2 rounded border border-border bg-adv-dark max-h-40 overflow-y-auto divide-y divide-border">
                {availableConnections.map(c => (
                  <button
                    key={c.contact_hash}
                    onClick={() => addReviewer(c)}
                    className="block w-full text-left px-3 py-2 text-xs text-adv-off-white hover:bg-adv-card"
                  >
                    {c.display_name}
                    <span className="ml-2 text-[10px] text-adv-gray font-mono">{c.contact_hash.slice(0, 16)}…</span>
                  </button>
                ))}
              </div>
            )}

            {reviewers.length === 0 ? (
              <div className="rounded border border-dashed border-border p-4 text-center text-[11px] text-adv-gray">
                Add at least 2 reviewers from your accepted community connections.
              </div>
            ) : (
              <div className="rounded border border-border bg-adv-dark divide-y divide-border">
                {reviewers.map(r => (
                  <div key={r.contactHash} className="px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-adv-off-white truncate">{r.displayName}</div>
                      <div className="text-[10px] text-adv-gray font-mono">{r.contactHash.slice(0, 16)}…</div>
                    </div>
                    <select
                      value={r.role}
                      onChange={e => setRole(r.contactHash, e.target.value as Role)}
                      className="rounded border border-border bg-adv-card px-1.5 py-0.5 text-[11px] text-adv-off-white"
                    >
                      <option value="queen">Queen</option>
                      <option value="worker">Worker</option>
                      <option value="scout">Scout</option>
                      <option value="observer">Observer</option>
                    </select>
                    <button
                      onClick={() => removeReviewer(r.contactHash)}
                      className="text-adv-red/70 hover:text-adv-red"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[11px] text-adv-gray">
              Consensus mode
              <select
                value={consensusMode}
                onChange={e => setConsensusMode(e.target.value as 'unanimous' | 'supermajority' | 'majority')}
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
              >
                <option value="majority">Majority (&gt;50%)</option>
                <option value="supermajority">Supermajority (≥66%)</option>
                <option value="unanimous">Unanimous (100%)</option>
              </select>
            </label>
            <label className="text-[11px] text-adv-gray">
              SLA (hours, 1-720)
              <input
                type="number"
                min="1"
                max="720"
                value={slaHours}
                onChange={e => setSlaHours(parseInt(e.target.value, 10) || 48)}
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={submitting || reviewers.length < 2 || !question.trim()}
            className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Users className="h-3.5 w-3.5" />
            {submitting ? 'Creating…' : 'Create BEEHIVE review'}
          </button>
        </div>
      </div>
    </div>
  );
}
