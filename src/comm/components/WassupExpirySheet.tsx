/**
 * WassupExpirySheet — pick how long a Wassup post stays visible.
 *
 * Five presets cover ~all real cases. "Forever" stores `null` for
 * expiresAt, which the sweepExpired loop skips. The chosen value is in
 * hours; the composer multiplies into a future ISO at publish time so
 * the clock starts the moment the post leaves the device.
 */
import { Ico } from './Ico';
import BottomSheet from './BottomSheet';

/** null = never expires; number = hours from publish time. */
export type WassupExpiryHours = number | null;

interface Preset {
  label: string;
  hours: WassupExpiryHours;
}

const PRESETS: Preset[] = [
  { label: '1 hour',   hours: 1 },
  { label: '6 hours',  hours: 6 },
  { label: '24 hours', hours: 24 },
  { label: '7 days',   hours: 24 * 7 },
  { label: 'Forever',  hours: null },
];

interface Props {
  open: boolean;
  onClose: () => void;
  current: WassupExpiryHours;
  onChoose: (hours: WassupExpiryHours) => void;
}

export default function WassupExpirySheet({ open, onClose, current, onChoose }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Disappears after" icon="clock">
      <ul className="px-3 pt-2 pb-2">
        {PRESETS.map((p) => {
          const on = p.hours === current;
          return (
            <li key={p.label}>
              <button
                onClick={() => { onChoose(p.hours); onClose(); }}
                className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-left active:bg-[var(--color-surface-muted)]"
                style={{
                  backgroundColor: on ? 'var(--color-accent-dim)' : 'transparent',
                }}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: on ? 'var(--color-accent-dark)' : 'var(--color-text)' }}
                >
                  {p.label}
                </span>
                {on && <Ico name="check" size={18} color="var(--color-accent-dark)" />}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
