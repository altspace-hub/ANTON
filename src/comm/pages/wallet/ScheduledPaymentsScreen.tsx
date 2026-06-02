/**
 * ScheduledPaymentsScreen — list + add scheduled / recurring payments
 * (#79 Phase 6, ported from Pay).
 *
 * Self-custody-safe model: "reminder + same-tap signing." A local
 * notification fires at the chosen time; tap brings the user to the
 * send flow with the payee + amount pre-filled and biometric required.
 * We never auto-sign and never pre-sign. EU-regulator-safe — not a SEPA
 * standing order (no PSP custodian) and not a PSD3 VRP; it's a payment
 * reminder with explicit per-cycle consent.
 *
 * Comm adds an in-app "Pay now" affordance per active schedule so a
 * scheduled payment can be signed immediately (and the flow verified)
 * without waiting for the OS notification to fire.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listSchedules, deleteSchedule, setScheduleActive,
  describeRecurrence, type Schedule,
} from '../../services/schedules';
import { scheduleToPayUri } from '../../services/schedule-to-payment';
import { formatFtc } from '../../services/payment';

interface Props {
  onBack: () => void;
  onAdd: () => void;
  /** Launch the prefilled send flow for an occurrence of this schedule. */
  onPayNow: (uri: string) => void;
}

function shortAddr(a: string): string {
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function ScheduledPaymentsScreen({ onBack, onAdd, onPayNow }: Props) {
  const { t } = useTranslation();
  const [list, setList] = useState<Schedule[]>([]);

  async function refresh() { setList(await listSchedules()); }
  useEffect(() => { void refresh(); }, []);

  async function toggle(s: Schedule) {
    await setScheduleActive(s.id, !s.active);
    await refresh();
  }
  async function remove(s: Schedule) {
    if (!window.confirm(t('schedules.confirmDelete',
      'Delete this scheduled payment? No more reminders will fire.'))) return;
    await deleteSchedule(s.id);
    await refresh();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('schedules.title', 'Scheduled payments')}
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('schedules.help',
            'Set up reminders for recurring payments — rent, subscriptions, monthly bills. When a reminder fires you tap the notification, biometric-confirm, and the payment signs at that moment. ANTON never auto-pays without you.')}
        </p>

        <button type="button" onClick={onAdd}
                className="w-full py-3.5 rounded-xl text-sm font-semibold mb-4"
                style={{ backgroundColor: 'var(--color-accent)',
                         color: 'var(--color-accent-fg)' }}>
          + {t('schedules.add', 'Add scheduled payment')}
        </button>

        {list.length === 0 ? (
          <div className="rounded-xl p-5 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('schedules.empty', 'No scheduled payments yet')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('schedules.emptyBody',
                'Add your first one — rent, gym, streaming subscription.')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((s) => {
              const ftc = formatFtc(s.amountMicroFtc);
              const nextLabel = s.active
                ? fmtDate(s.nextFireAt)
                : t('schedules.paused', 'Paused');
              return (
                <div key={s.id} className="rounded-xl p-3.5 flex items-center gap-3"
                     style={{ backgroundColor: 'var(--color-surface)',
                              border: `1px solid ${s.active ? 'var(--color-border)' : 'var(--color-border-soft, rgba(0,0,0,0.06))'}`,
                              opacity: s.active ? 1 : 0.6 }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm"
                         style={{ color: 'var(--color-text)' }}>
                      {s.payeeLabel ?? shortAddr(s.payeeAddress)}
                    </div>
                    <div className="text-xs mt-0.5"
                         style={{ color: 'var(--color-text-muted)' }}>
                      {describeRecurrence(s.recurrence)} · {nextLabel}
                    </div>
                    {s.active && (
                      <button type="button" onClick={() => onPayNow(scheduleToPayUri(s))}
                              className="mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--color-accent-soft)',
                                       border: '1px solid var(--color-accent-dim)',
                                       color: 'var(--color-accent)' }}>
                        {t('schedules.payNow', 'Pay now')}
                      </button>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="mono text-sm font-semibold"
                         style={{ color: 'var(--color-text)' }}>
                      {ftc} FTC
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      <button type="button" onClick={() => toggle(s)}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--color-bg)',
                                       border: '1px solid var(--color-border)',
                                       color: 'var(--color-text-muted)' }}>
                        {s.active
                          ? t('schedules.pause', 'Pause')
                          : t('schedules.resume', 'Resume')}
                      </button>
                      <button type="button" onClick={() => remove(s)}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--color-bg)',
                                       border: '1px solid var(--color-red)',
                                       color: 'var(--color-red)' }}>
                        {t('schedules.delete', 'Delete')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
