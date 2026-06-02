/**
 * AddScheduleScreen — create a new scheduled-payment reminder
 * (#79 Phase 6, ported from Pay).
 *
 * Minimal v1 form: payee address (paste / type), label, amount in FTC
 * (fiat-first when the oracle ships), recurrence picker. The picker
 * exposes the four simple recurrence kinds covered in
 * services/schedules.ts (daily / weekly / monthly / yearly).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FiatAmountInput from '../../components/FiatAmountInput';
import { createSchedule, type Recurrence } from '../../services/schedules';

interface Props {
  onBack: () => void;
  onCreated: () => void;
}

type RecKind = 'daily' | 'weekly' | 'monthly' | 'yearly';

export default function AddScheduleScreen({ onBack, onCreated }: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [microFtc, setMicroFtc] = useState<bigint>(0n);
  const [kind, setKind] = useState<RecKind>('monthly');
  const [dayOfWeek, setDayOfWeek] = useState(1); // Mon
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [month, setMonth] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildRecurrence(): Recurrence {
    switch (kind) {
      case 'daily':   return { kind: 'daily', interval: 1 };
      case 'weekly':  return { kind: 'weekly', interval: 1, dayOfWeek: dayOfWeek as 0|1|2|3|4|5|6 };
      case 'monthly': return { kind: 'monthly', dayOfMonth };
      case 'yearly':  return { kind: 'yearly', month: month as 1|2|3|4|5|6|7|8|9|10|11|12, dayOfMonth };
    }
  }

  async function create() {
    setError(null);
    if (!address.trim().startsWith('fc_')) {
      setError(t('schedules.invalidAddress', 'Payee address must be an fc_… address.'));
      return;
    }
    if (microFtc === 0n) {
      setError(t('schedules.zeroAmount', 'Enter a non-zero amount.'));
      return;
    }
    setBusy(true);
    try {
      await createSchedule({
        payeeAddress: address.trim(),
        payeeLabel: label.trim() || undefined,
        amountMicroFtc: microFtc,
        recurrence: buildRecurrence(),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
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
            {t('schedules.addTitle', 'New scheduled payment')}
          </h2>
        </div>

        {/* Label */}
        <div className="rounded-xl p-4 mb-3"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          <label htmlFor="sched-label"
                 className="text-xs uppercase tracking-wider mb-1.5 block"
                 style={{ color: 'var(--color-text-faint)' }}>
            {t('schedules.labelField', 'Label (optional)')}
          </label>
          <input id="sched-label" type="text" value={label}
                 onChange={(e) => setLabel(e.target.value)}
                 placeholder="Rent, Gym, Spotify…"
                 className="w-full bg-transparent text-base font-semibold outline-none"
                 style={{ color: 'var(--color-text)' }} />
        </div>

        {/* Payee address */}
        <div className="rounded-xl p-4 mb-3"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          <label htmlFor="sched-addr"
                 className="text-xs uppercase tracking-wider mb-1.5 block"
                 style={{ color: 'var(--color-text-faint)' }}>
            {t('schedules.addressField', 'Payee address')}
          </label>
          <input id="sched-addr" type="text" value={address}
                 onChange={(e) => setAddress(e.target.value)}
                 placeholder="fc_…"
                 autoCapitalize="none" autoCorrect="off" spellCheck={false}
                 className="w-full bg-transparent text-sm mono outline-none"
                 style={{ color: 'var(--color-text)' }} />
        </div>

        {/* Amount */}
        <div className="mb-3">
          <FiatAmountInput
            onChangeMicroFtc={setMicroFtc}
            label={t('schedules.amount', 'Amount per cycle')}
          />
        </div>

        {/* Recurrence */}
        <div className="rounded-xl p-4 mb-3"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          <label className="text-xs uppercase tracking-wider mb-2 block"
                 style={{ color: 'var(--color-text-faint)' }}>
            {t('schedules.recurrence', 'How often')}
          </label>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {(['daily','weekly','monthly','yearly'] as RecKind[]).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)}
                      className="py-2 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: kind === k ? 'var(--color-accent)' : 'var(--color-bg)',
                               color: kind === k ? 'var(--color-accent-fg)' : 'var(--color-text)',
                               border: '1px solid var(--color-border)' }}>
                {t(`schedules.kind.${k}`, k.charAt(0).toUpperCase() + k.slice(1))}
              </button>
            ))}
          </div>

          {kind === 'weekly' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t('schedules.dayOfWeek', 'Day of week')}
              </label>
              <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))}
                      className="bg-transparent text-sm py-1 outline-none"
                      style={{ color: 'var(--color-text)',
                               border: '1px solid var(--color-border)' }}>
                {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {(kind === 'monthly' || kind === 'yearly') && (
            <div className="flex flex-col gap-1 mt-2">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t('schedules.dayOfMonth', 'Day of month')}
              </label>
              <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))}
                      className="bg-transparent text-sm py-1 outline-none"
                      style={{ color: 'var(--color-text)',
                               border: '1px solid var(--color-border)' }}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
                {kind === 'monthly' && <option value={-1}>Last day</option>}
              </select>
            </div>
          )}

          {kind === 'yearly' && (
            <div className="flex flex-col gap-1 mt-2">
              <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t('schedules.month', 'Month')}
              </label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                      className="bg-transparent text-sm py-1 outline-none"
                      style={{ color: 'var(--color-text)',
                               border: '1px solid var(--color-border)' }}>
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs mb-3" style={{ color: 'var(--color-red)' }}>{error}</p>
        )}

        <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          {t('schedules.disclaimer',
            'When the reminder fires, you tap to sign each occurrence. ANTON does not auto-pay. This is not a SEPA standing order or PSP service — it\'s a reminder with explicit consent each cycle.')}
        </p>

        <button type="button" onClick={create} disabled={busy}
                className="w-full py-3.5 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-accent)',
                         color: 'var(--color-accent-fg)',
                         opacity: busy ? 0.7 : 1 }}>
          {busy ? t('common.working', 'Working…') : t('schedules.create', 'Create reminder')}
        </button>
      </div>
    </div>
  );
}
