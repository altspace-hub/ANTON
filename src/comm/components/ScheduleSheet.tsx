/**
 * ScheduleSheet — pick a future time for a "send later" message.
 *
 * Quick presets cover the common cases (in 1 hour / tonight 8pm /
 * tomorrow 9am / next Monday 9am) and a native <input type="datetime-local">
 * handles the rest.
 */
import { useEffect, useMemo, useState } from 'react';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';

interface Props {
  open: boolean;
  onClose: () => void;
  /** ISO of currently-set time when editing a pending scheduled send; null for a fresh schedule. */
  initialIso?: string | null;
  onSchedule: (iso: string) => void;
}

interface Preset {
  label: string;
  /** Compute the ISO at preset apply time so it stays fresh while the sheet is open. */
  iso: () => string | null;
}

function nextHour(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

function tonightAt(hour: number): Date | null {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.getTime() > Date.now() ? d : null;
}

function tomorrowAt(hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextMonday(hour: number): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const daysUntilMonday = ((1 - day) + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export default function ScheduleSheet({ open, onClose, initialIso, onSchedule }: Props) {
  const [draft, setDraft] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setDraft(initialIso ? toLocalInputValue(initialIso) : toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000).toISOString()));
    return registerBackHandler(onClose);
  }, [open, initialIso, onClose]);

  const presets: Preset[] = useMemo(() => [
    { label: 'In 1 minute',  iso: () => new Date(Date.now() + 60 * 1000).toISOString() },
    { label: 'In 1 hour',    iso: () => nextHour().toISOString() },
    { label: 'Tonight 8pm',  iso: () => { const d = tonightAt(20); return d ? d.toISOString() : null; } },
    { label: 'Tomorrow 9am', iso: () => tomorrowAt(9).toISOString() },
    { label: 'Mon 9am',      iso: () => nextMonday(9).toISOString() },
  ], []);

  if (!open) return null;

  const draftIso = fromLocalInputValue(draft);
  const draftInFuture = !!draftIso && draftIso > new Date().toISOString();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Schedule message"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-6 safe-bottom"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3" />
        <div className="px-5 pb-2">
          <h2 className="text-base font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Ico name="clock" size={18} color="var(--color-accent)" />
            Schedule message
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            We'll send it from this device once the time arrives. Keep the app installed.
          </p>
        </div>

        <ul className="px-3 pt-2 flex flex-wrap gap-2">
          {presets.map((p) => {
            const iso = p.iso();
            if (!iso) return null;
            return (
              <li key={p.label}>
                <button
                  onClick={() => { onClose(); onSchedule(iso); }}
                  className="px-3 py-1.5 rounded-full text-[13px] font-medium border"
                  style={{
                    borderColor: 'var(--color-border-soft)',
                    backgroundColor: 'var(--color-surface-alt)',
                    color: 'var(--color-text)',
                  }}
                >
                  {p.label}
                </button>
              </li>
            );
          })}
        </ul>

        <section className="px-5 pt-4">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
            Pick a date &amp; time
          </label>
          <input
            type="datetime-local"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full px-3 py-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] text-[16px] text-[var(--color-text)] focus:outline-none focus:ring-2"
            style={{ outlineColor: 'var(--color-accent)' }}
            min={toLocalInputValue(new Date().toISOString())}
          />
        </section>

        <div className="px-5 pt-4 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl text-sm font-medium text-[var(--color-text-muted)]"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (draftIso) { onClose(); onSchedule(draftIso); } }}
            disabled={!draftInFuture}
            className="flex-1 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

/** ISO → datetime-local input value ("yyyy-MM-ddTHH:mm") in the user's tz. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value → ISO. */
function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
