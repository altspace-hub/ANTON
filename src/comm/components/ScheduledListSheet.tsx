/**
 * ScheduledListSheet — lists pending scheduled messages for a chat.
 *
 * Tapped from the "Scheduled (N)" pill above the composer. Each row
 * shows the message preview + target time + Send-now / Reschedule /
 * Cancel actions.
 */
import { useEffect, useState } from 'react';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';
import { listScheduled, cancelScheduled, rescheduleMessage, type ChatMessage } from '../services/messages';

interface Props {
  open: boolean;
  onClose: () => void;
  peerContactHash: string;
  /** Called after any mutation so the parent can re-fetch counts. */
  onChange: () => void;
  /** Open the ScheduleSheet to pick a new time for `target`. */
  onReschedule: (target: ChatMessage) => void;
}

export default function ScheduledListSheet({ open, onClose, peerContactHash, onChange, onReschedule }: Props) {
  const [rows, setRows] = useState<ChatMessage[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    void listScheduled(peerContactHash).then(setRows).catch(() => setRows([]));
    return registerBackHandler(onClose);
  }, [open, peerContactHash, tick, onClose]);

  // Re-poll every 5s so a row that fires while the sheet is open disappears.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;

  async function handleCancel(id: string) {
    await cancelScheduled(id);
    setTick((v) => v + 1);
    onChange();
  }

  async function handleSendNow(target: ChatMessage) {
    // Move the scheduledFor into the past so the next flush picks it up.
    await rescheduleMessage(target.id, new Date(0).toISOString());
    setTick((v) => v + 1);
    onChange();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scheduled messages"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-6 safe-bottom max-h-[70vh] flex flex-col"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3" />
        <div className="px-5 pb-2">
          <h2 className="text-base font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Ico name="clock" size={18} color="var(--color-accent)" />
            Scheduled messages
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Pending sends in this chat. Cancel or reschedule any of them.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--color-text-faint)]">No scheduled messages.</p>
        ) : (
          <ul className="overflow-y-auto px-3 divide-y divide-[var(--color-border-soft)]">
            {rows.map((m) => (
              <li key={m.id} className="py-3 px-2">
                <div className="text-[13px] font-medium text-[var(--color-text)]">
                  {preview(m)}
                </div>
                <div className="mt-1 text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
                  <Ico name="clock" size={12} color="var(--color-text-muted)" />
                  {formatScheduled(m.scheduledFor!)}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => void handleSendNow(m)}
                    className="px-3 py-1 rounded-full text-[12px] font-medium"
                    style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
                  >
                    Send now
                  </button>
                  <button
                    onClick={() => { onClose(); onReschedule(m); }}
                    className="px-3 py-1 rounded-full text-[12px] font-medium border"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => void handleCancel(m.id)}
                    className="px-3 py-1 rounded-full text-[12px] font-medium"
                    style={{ color: 'var(--color-red)' }}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function preview(m: ChatMessage): string {
  if (m.kind === 'image') return '📷 Photo';
  if (m.kind === 'video') return '🎬 Video';
  if (m.kind === 'voice') return '🎙 Voice note';
  if (m.kind === 'poll') return '🗳 Poll';
  const text = m.plaintext.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? text.slice(0, 77) + '…' : (text || '—');
}

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
