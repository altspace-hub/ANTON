/**
 * DisappearingTimerSheet — bottom sheet for picking the per-chat
 * disappearing-messages timer.
 *
 * Five options: Off / 5 sec / 1 hour / 1 day / 1 week. Selecting one
 * commits the change locally and dispatches a system_timer_change wire
 * to the peer.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';

interface Option {
  /** i18n key suffix under `timer.*`. */
  key: string;
  /** English fallback. */
  fallback: string;
  /** Seconds. 0 = Off. */
  value: number;
}

export const TIMER_OPTIONS: Option[] = [
  { key: 'off',   fallback: 'Off',    value: 0 },
  { key: 'sec5',  fallback: '5 sec',  value: 5 },
  { key: 'hour1', fallback: '1 hour', value: 60 * 60 },
  { key: 'day1',  fallback: '1 day',  value: 60 * 60 * 24 },
  { key: 'week1', fallback: '1 week', value: 60 * 60 * 24 * 7 },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Current timer in seconds; matched against the option list to mark the active row. */
  currentSec: number;
  /** Called with the chosen `timerSec`. The sheet closes itself first. */
  onSelect: (timerSec: number) => void;
}

export default function DisappearingTimerSheet({ open, onClose, currentSec, onSelect }: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    return registerBackHandler(onClose);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('timer.title', 'Disappearing messages')}
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
          <h2 className="text-base font-semibold text-[var(--color-text)]">{t('timer.title', 'Disappearing messages')}</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {t('timer.subtitle', 'New messages will disappear from this chat for both of you after the selected timer.')}
          </p>
        </div>

        <ul role="radiogroup" className="px-3 pt-1">
          {TIMER_OPTIONS.map((opt) => {
            const active = opt.value === currentSec;
            return (
              <li key={opt.value}>
                <button
                  role="radio"
                  aria-checked={active}
                  onClick={() => { onClose(); onSelect(opt.value); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[15px] text-[var(--color-text)] active:bg-[var(--color-surface-muted)]"
                >
                  <span
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: active ? 'var(--color-accent)' : 'var(--color-border)' }}
                  >
                    {active && (
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                      />
                    )}
                  </span>
                  <span className="flex-1">{t('timer.' + opt.key, opt.fallback)}</span>
                  {opt.value === 0 ? null : <Ico name="clock" size={16} color="var(--color-text-muted)" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Human-readable timer label. Used by the system-chip rendering. Takes `t`
 *  so it can be called from a component (ChatThreadScreen) without a hook. */
export function formatTimerLabel(sec: number, t: TFunction): string {
  if (!sec) return t('timer.off', 'Off');
  const match = TIMER_OPTIONS.find((o) => o.value === sec);
  if (match) return t('timer.' + match.key, match.fallback);
  // Fallback for non-preset values
  if (sec < 60) return t('timer.fmtSec', { n: sec, defaultValue: '{{n}} sec' });
  if (sec < 3600) return t('timer.fmtMin', { n: Math.round(sec / 60), defaultValue: '{{n}} min' });
  if (sec < 86400) return t('timer.fmtHr', { n: Math.round(sec / 3600), defaultValue: '{{n}} hr' });
  return t('timer.fmtDay', { n: Math.round(sec / 86400), defaultValue: '{{n}} day' });
}
