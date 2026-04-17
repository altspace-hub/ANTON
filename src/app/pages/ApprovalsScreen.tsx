/**
 * ApprovalsScreen — pending-checkpoint inbox per spec §8.6.
 *
 * Lists every pending checkpoint sorted by severity (critical first),
 * shows ANTON's recommendation + rationale, and routes the user
 * through approve / modify / reject. High and critical severities
 * trigger biometric re-confirm before the response is signed.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listPendingCheckpoints, getCheckpoint, respondToCheckpoint,
  type Checkpoint, type CheckpointSeverity,
} from '../services/checkpoints';
import { verifyBiometric } from '../services/biometric';
import { light, success as hapticSuccess, warning, error as hapticError } from '../services/haptics';
import { onActiveInstanceChange } from '../services/instances';

interface Props {
  /** When set, auto-open this checkpoint on mount (deep link from a push). */
  initialCheckpointId?: string | null;
}

export default function ApprovalsScreen({ initialCheckpointId }: Props) {
  const [items, setItems] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialCheckpointId ?? null);
  const [openDetail, setOpenDetail] = useState<Checkpoint | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const list = await listPendingCheckpoints({ limit: 100 });
      setItems(list);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // Re-fetch when the user switches instance
  useEffect(() => onActiveInstanceChange(() => void refresh()), [refresh]);

  // Deep-link handler — also accept `?approval=<id>` query string
  useEffect(() => {
    if (!openId) {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('approval');
      if (id) setOpenId(id);
    }
  }, [openId]);

  // Hydrate the open checkpoint
  useEffect(() => {
    if (!openId) { setOpenDetail(null); return; }
    setOpenDetail(null);
    void getCheckpoint(openId).then(setOpenDetail).catch(e => setErr(e instanceof Error ? e.message : String(e)));
  }, [openId]);

  async function handleResponse(c: Checkpoint, decision: 'approved' | 'rejected' | 'modified', note?: string, modification?: Record<string, unknown>) {
    const needsBio = c.requires_biometric || c.severity === 'critical' || c.severity === 'high';
    let biometricConfirmed = false;
    if (needsBio) {
      await warning();
      const r = await verifyBiometric({
        reason: decision === 'approved' ? `Approve: ${c.title}` : decision === 'rejected' ? `Reject: ${c.title}` : `Modify: ${c.title}`,
        title: 'Confirm response',
      });
      if (r === 'cancelled') { await hapticError(); return; }
      if (r !== 'confirmed') { await hapticError(); setErr('Biometric verification failed'); return; }
      biometricConfirmed = true;
    } else {
      await light();
    }
    try {
      await respondToCheckpoint(c.id, { decision, note, modification, biometric_confirmed: biometricConfirmed });
      await hapticSuccess();
      setItems(prev => prev.filter(i => i.id !== c.id));
      setOpenId(null);
    } catch (e) {
      await hapticError();
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-adv-dark">
      <header className="border-b border-border bg-adv-dark-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-adv-off-white">Approvals</h1>
            <p className="text-[11px] text-adv-gray">{items.length} pending</p>
          </div>
          <button onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-adv-gray hover:text-adv-off-white disabled:opacity-50">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {err && (
        <div className="mx-3 mt-3 rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[11px] text-adv-red">{err}</div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-adv-card/40 px-4 py-12 text-center">
            <div className="text-base text-adv-off-white">All clear</div>
            <div className="mt-1 text-[11px] text-adv-gray">No pending approvals on this instance.</div>
          </div>
        )}
        {items.map(c => (
          <CheckpointCard key={c.id} c={c} onOpen={() => setOpenId(c.id)} />
        ))}
      </div>

      {openId && openDetail && (
        <DetailSheet
          c={openDetail}
          onClose={() => setOpenId(null)}
          onApprove={(n) => handleResponse(openDetail, 'approved', n)}
          onReject={(n) => handleResponse(openDetail, 'rejected', n)}
          onModify={(n, m) => handleResponse(openDetail, 'modified', n, m)}
        />
      )}
    </div>
  );
}

function CheckpointCard({ c, onOpen }: { c: Checkpoint; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className={`block w-full rounded-xl border p-3 text-left transition active:scale-[0.99] ${severityCardClass(c.severity)}`}>
      <div className="flex items-start gap-3">
        <SeverityDot s={c.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-adv-off-white truncate">{c.title}</span>
            {c.requires_biometric && (
              <span className="text-[9px] uppercase tracking-wider text-adv-teal">Biometric</span>
            )}
          </div>
          {c.summary && <p className="mt-1 line-clamp-2 text-[12px] text-adv-gray">{c.summary}</p>}
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-adv-gray/70">
            <span>{relativeTime(c.created_at)}</span>
            {c.expires_at && <span>· expires {relativeTime(c.expires_at)}</span>}
            {c.source_kind && <span>· {c.source_kind}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function DetailSheet({ c, onClose, onApprove, onReject, onModify }: {
  c: Checkpoint;
  onClose: () => void;
  onApprove: (note?: string) => void;
  onReject: (note?: string) => void;
  onModify: (note?: string, modification?: Record<string, unknown>) => void;
}) {
  const [note, setNote] = useState('');

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={c.title}>
      <button onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" />
      <div className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-2xl border-t border-border bg-adv-dark-2 pb-[env(safe-area-inset-bottom)] shadow-2xl animate-slideUp">
        <div className="mx-auto h-1 w-10 rounded-full bg-adv-gray/40 mt-2 mb-2" />
        <div className="flex items-start gap-3 px-4 pb-2 pt-1">
          <SeverityDot s={c.severity} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-adv-off-white">{c.title}</div>
            {c.summary && <div className="mt-0.5 text-[12px] text-adv-gray">{c.summary}</div>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 text-[12px] text-adv-off-white">
          {c.rationale && (
            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-adv-teal">ANTON's reasoning</h3>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">{c.rationale}</p>
            </section>
          )}
          {Object.keys(c.payload).length > 0 && (
            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-adv-teal">Detail</h3>
              <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-adv-dark p-2 text-[10px] text-adv-gray">{JSON.stringify(c.payload, null, 2)}</pre>
            </section>
          )}
          {c.expires_at && (
            <div className="text-[11px] text-adv-gray">Expires {new Date(c.expires_at).toLocaleString()}</div>
          )}
          {c.requires_biometric && (
            <div className="rounded-lg border border-adv-teal/40 bg-adv-teal/10 px-3 py-2 text-[11px] text-adv-teal">
              Biometric confirmation required to respond.
            </div>
          )}
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-adv-gray">Note (optional)</span>
            <textarea
              value={note} onChange={e => setNote(e.target.value)} maxLength={4000} rows={3}
              placeholder="Add context for the audit log…"
              className="mt-1 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-[12px] text-adv-off-white placeholder-adv-gray/40 focus:border-adv-teal focus:outline-none"
            />
          </label>
          {c.deep_link && (
            <a href={c.deep_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-adv-teal hover:text-adv-teal-dark">
              Open on desktop →
            </a>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border px-3 py-3">
          <button onClick={() => onReject(note || undefined)} className="rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2.5 text-xs font-semibold text-adv-red hover:bg-adv-red/20">
            Reject
          </button>
          <button onClick={() => onModify(note || undefined)} className="rounded-lg border border-border bg-adv-card px-3 py-2.5 text-xs font-semibold text-adv-off-white hover:border-adv-gray">
            Modify
          </button>
          <button onClick={() => onApprove(note || undefined)} className="rounded-lg bg-adv-teal px-3 py-2.5 text-xs font-semibold text-adv-dark hover:bg-adv-teal-dark active:scale-[0.98]">
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function severityCardClass(s: CheckpointSeverity): string {
  switch (s) {
    case 'critical': return 'border-adv-red bg-adv-red/10';
    case 'high':     return 'border-adv-red/40 bg-adv-red/5';
    case 'normal':   return 'border-border bg-adv-card';
    case 'low':      return 'border-border/60 bg-adv-card/60';
  }
}

function SeverityDot({ s }: { s: CheckpointSeverity }) {
  const cls = s === 'critical' ? 'bg-adv-red' : s === 'high' ? 'bg-adv-red/70' : s === 'normal' ? 'bg-adv-teal' : 'bg-adv-gray';
  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} aria-label={`Severity: ${s}`} />;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const future = diff < 0;
  const abs = Math.abs(diff);
  if (abs < 60) return future ? 'in a moment' : 'just now';
  if (abs < 3600) { const m = Math.round(abs / 60); return future ? `in ${m}m` : `${m}m ago`; }
  if (abs < 86400) { const h = Math.round(abs / 3600); return future ? `in ${h}h` : `${h}h ago`; }
  const days = Math.round(abs / 86400);
  return future ? `in ${days}d` : `${days}d ago`;
}
