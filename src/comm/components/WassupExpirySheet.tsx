/**
 * WassupExpirySheet — pick how long a Wassup post stays visible.
 *
 * Five presets cover ~all real cases. "Forever" stores `null` for
 * expiresAt, which the sweepExpired loop skips. The chosen value is in
 * hours; the composer multiplies into a future ISO at publish time so
 * the clock starts the moment the post leaves the device.
 */
import { useTranslation } from 'react-i18next';
import { Ico } from './Ico';
import BottomSheet from './BottomSheet';

/** null = never expires; number = hours from publish time. */
export type WassupExpiryHours = number | null;

interface Preset {
  /** i18n key suffix under `wassup.*`. */
  key: string;
  fallback: string;
  hours: WassupExpiryHours;
}

const PRESETS: Preset[] = [
  { key: 'exp1h',      fallback: '1 hour',   hours: 1 },
  { key: 'exp6h',      fallback: '6 hours',  hours: 6 },
  { key: 'exp24h',     fallback: '24 hours', hours: 24 },
  { key: 'exp7d',      fallback: '7 days',   hours: 24 * 7 },
  { key: 'expForever', fallback: 'Forever',  hours: null },
];

interface Props {
  open: boolean;
  onClose: () => void;
  current: WassupExpiryHours;
  onChoose: (hours: WassupExpiryHours) => void;
}

export default function WassupExpirySheet({ open, onClose, current, onChoose }: Props) {
  const { t } = useTranslation();
  return (
    <BottomSheet open={open} onClose={onClose} title={t('wassup.expiryTitle', 'Disappears after')} icon="clock">
      <ul className="px-3 pt-2 pb-2">
        {PRESETS.map((p) => {
          const on = p.hours === current;
          return (
            <li key={p.key}>
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
                  {t('wassup.' + p.key, p.fallback)}
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
