/**
 * ApprovalsScreen — pending-checkpoint inbox per spec §8.6, Evolution redesign.
 *
 * Way Forward §05 ("the enterprise wedge needs more weight"):
 *   • Card border: 1.5 px in the severity colour (red for critical/high,
 *     gold for normal, teal/accent for info)
 *   • Severity label: mono uppercase tag at the TOP of the card
 *     ("CRITICAL · BIOMETRIC REQUIRED"), not a corner pill
 *   • ANTON's rationale: first-class, expanded by default
 *     (previously hidden in a ReasoningDrawer)
 *   • In-app pre-biometric context sheet (deferred to a follow-up)
 *
 * High and critical severities trigger biometric re-confirm before the
 * response is signed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Pill, SectionLabel, Ico, Spinner } from '../components/ui';
import {
  listPendingCheckpoints, getCheckpoint, respondToCheckpoint,
  type Checkpoint, type CheckpointSeverity,
} from '../services/checkpoints';
import { verifyBiometric } from '../services/biometric';
import { light, success as hapticSuccess, warning, error as hapticError } from '../services/haptics';
import { onActiveInstanceChange } from '../services/instances';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { registerBackHandler } from '../services/back-stack';

interface Props {
  /** When set, auto-open this checkpoint on mount (deep link from a push). */
  initialCheckpointId?: string | null;
}

// Severity → colour mapping (status colours are LOCKED — never tinted by accent)
function severityColour(s: CheckpointSeverity): string {
  switch (s) {
    case 'critical':
    case 'high':    return 'var(--color-red)';
    case 'normal':  return 'var(--color-gold)';
    case 'low':     return 'var(--color-accent)';
  }
}

function severityLabel(s: CheckpointSeverity): string {
  return s.toUpperCase();
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
  useEffect(() => onActiveInstanceChange(() => void refresh()), [refresh]);

  // Deep-link handler — also accept ?approval=<id> query string.
  // AN5: validate the id against the cp_<32-hex> shape we issue server-side
  // before opening; raw window.location.search lets a malicious notification
  // (or a user-pasted URL) inject arbitrary strings into setOpenId.
  useEffect(() => {
    if (!openId) {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('approval');
      if (id && /^cp_[a-zA-Z0-9_-]{8,64}$/.test(id)) setOpenId(id);
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
      const r = await verifyBiometric({
        reason: decision === 'approved' ? `Approve: ${c.title}` : decision === 'rejected' ? `Reject: ${c.title}` : `Modify: ${c.title}`,
        title: 'Confirm response',
      });
      if (r === 'cancelled') return;
      if (r !== 'confirmed') { await warning(); setErr('Biometric verification failed'); return; }
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
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      {/* No safe-top — the App.tsx outer wrapper already pads the status-bar inset.
          Doubling it pushed the TabBar off-screen. */}
      <header className="px-4 py-3" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-end justify-between">
          <div>
            <h1
              className="text-[var(--color-text)]"
              style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.1 }}
            >
              Approvals
            </h1>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {items.length === 0 ? 'No pending approvals.'
                : items.length === 1 ? '1 thing waiting for you.'
                : `${items.length} things waiting for you.`}
            </p>
          </div>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </Btn>
        </div>
      </header>

      {err && (
        <div
          className="mx-4 mt-2 rounded-[var(--radius-r1)] px-3 py-2 text-[12px]"
          style={{
            background: 'var(--color-red-dim)',
            color: 'var(--color-red)',
            border: '1px solid var(--color-red-dim)',
          }}
        >
          {err}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2 space-y-3">
        {loading && items.length === 0 && (
          <div className="mt-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <div
            className="mt-6 rounded-[var(--radius-r3)] px-5 py-12 text-center"
            style={{
              background: 'var(--color-surface)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <div
              className="mx-auto mb-3 inline-flex rounded-full p-3"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
              }}
            >
              <Ico name="shieldCheck" size={26} />
            </div>
            <div className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
              All clear.
            </div>
            <div className="mt-1 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              No pending approvals on this instance.
            </div>
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

// ── Card — Way Forward §05: 1.5px severity border + mono severity tag at top ───
function CheckpointCard({ c, onOpen }: { c: Checkpoint; onOpen: () => void }) {
  const sevColour = severityColour(c.severity);
  const tag = c.requires_biometric
    ? `${severityLabel(c.severity)} · BIOMETRIC REQUIRED`
    : severityLabel(c.severity);
  return (
    <button
      onClick={onOpen}
      className="block w-full rounded-[var(--radius-r3)] p-4 text-left transition hover:shadow-sm active:scale-[0.99]"
      style={{
        background: 'var(--color-surface)',
        border: `1.5px solid ${sevColour}`,
      }}
    >
      {/* Mono uppercase severity tag */}
      <div
        className="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase"
        style={{ color: sevColour, letterSpacing: '0.7px' }}
      >
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: sevColour }}
        />
        {tag}
      </div>
      {/* Title + summary */}
      <div className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--color-text)' }}>
        {c.title}
      </div>
      {c.summary && (
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-body)' }}>
          {c.summary}
        </p>
      )}
      {/* Meta row */}
      <div
        className="mt-2.5 flex items-center gap-2 font-mono text-[10px]"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span>{relativeTime(c.created_at)}</span>
        {c.expires_at && <span>· expires {relativeTime(c.expires_at)}</span>}
        {c.source_kind && <span>· {c.source_kind}</span>}
      </div>
    </button>
  );
}

// ── Detail sheet — rationale first-class, expanded by default ─────────────────
function DetailSheet({ c, onClose, onApprove, onReject, onModify }: {
  c: Checkpoint;
  onClose: () => void;
  onApprove: (note?: string) => void;
  onReject: (note?: string) => void;
  onModify: (note?: string, modification?: Record<string, unknown>) => void;
}) {
  const [note, setNote] = useState('');
  const sevColour = severityColour(c.severity);
  const sevTag = c.requires_biometric
    ? `${severityLabel(c.severity)} · BIOMETRIC REQUIRED`
    : severityLabel(c.severity);
  const showPayload = Object.keys(c.payload).length > 0;
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Esc + Android hardware back close the sheet (matches BottomSheet primitive).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const unregister = registerBackHandler(onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      unregister();
    };
  }, [onClose]);

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={c.title}>
      {/* Backdrop — Way Forward §04: 8% ink scrim + 4px blur */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0"
        style={{
          background: 'var(--color-scrim-soft)',
          backdropFilter: 'blur(4px) saturate(0.95)',
        }}
      />
      <div
        className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col animate-slideUp shadow-2xl"
        style={{
          background: 'var(--color-surface)',
          borderTop: `1.5px solid ${sevColour}`,
          borderTopLeftRadius: 'var(--radius-r4)',
          borderTopRightRadius: 'var(--radius-r4)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle — 3 × 36 px */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="rounded-full" style={{ width: 36, height: 3, background: 'var(--color-border)' }} />
        </div>

        {/* Severity tag */}
        <div className="px-5 pt-2">
          <div
            className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase"
            style={{ color: sevColour, letterSpacing: '0.7px' }}
          >
            <span
              aria-hidden
              className="inline-block rounded-full"
              style={{ width: 6, height: 6, background: sevColour }}
            />
            {sevTag}
          </div>
          <h2 className="mt-1.5 text-[18px] font-bold leading-tight" style={{ color: 'var(--color-text)' }}>
            {c.title}
          </h2>
          {c.summary && (
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-body)' }}>
              {c.summary}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-3 space-y-4">
          {/* Rationale — first-class, expanded by default (Way Forward §05) */}
          {c.rationale && (
            <section>
              <SectionLabel>ANTON's reasoning</SectionLabel>
              <p
                className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed"
                style={{ color: 'var(--color-text)' }}
              >
                {c.rationale}
              </p>
            </section>
          )}

          {showPayload && (
            <section>
              <SectionLabel>Detail</SectionLabel>
              <pre
                className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-r1)] p-2.5 font-mono text-[10.5px] leading-snug"
                style={{
                  background: 'var(--color-surface-alt)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-body)',
                }}
              >
                {JSON.stringify(c.payload, null, 2)}
              </pre>
            </section>
          )}

          {c.expires_at && (
            <div className="font-mono text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Expires {new Date(c.expires_at).toLocaleString()}
            </div>
          )}

          {c.requires_biometric && (
            <div
              className="flex items-start gap-2 rounded-[var(--radius-r2)] px-3 py-2.5 text-[12px]"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent-dim)',
              }}
            >
              <Ico name="fingerprint" size={14} />
              <span>Biometric confirmation required to respond.</span>
            </div>
          )}

          <label className="block">
            <SectionLabel>Note (optional)</SectionLabel>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Add context for the audit log…"
              className="mt-1.5 w-full resize-none rounded-[var(--radius-r2)] px-3 py-2 text-[13px] focus:outline-none"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            />
          </label>

          {c.deep_link && (
            <a
              href={c.deep_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-semibold"
              style={{ color: 'var(--color-accent)' }}
            >
              Open on desktop →
            </a>
          )}
        </div>

        {/* Action row — distinct visual hierarchy: Approve = primary, Modify = ghost, Reject = danger */}
        <div
          className="grid grid-cols-3 gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--color-border-soft)' }}
        >
          <Btn variant="danger" size="md" onClick={() => onReject(note || undefined)}>Reject</Btn>
          <Btn variant="ghost" size="md" onClick={() => onModify(note || undefined)}>Modify</Btn>
          <Btn variant="primary" size="md" onClick={() => onApprove(note || undefined)}>Approve</Btn>
        </div>
      </div>
    </div>
  );
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

// Pill not currently used in this file but exported in ui/index.ts; keep import via narrow re-export
void Pill;
