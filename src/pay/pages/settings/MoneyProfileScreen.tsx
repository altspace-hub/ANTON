/**
 * MoneyProfileScreen — the customer's self-declared money profile.
 *
 * Two sections: identity (date of birth, nationality, occupation) and
 * money pattern (source of funds, expected monthly + typical payment).
 * Everything is optional and stays on the phone — it is the baseline
 * the light fraud engine compares new payments against.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Field from '../../components/Field';
import PrimaryButton from '../../components/PrimaryButton';
import {
  emptyMoneyProfile, loadMoneyProfile, saveMoneyProfile,
  SOURCE_OF_FUNDS, type MoneyProfile, type SourceOfFunds,
} from '../../services/money-profile';

interface Props {
  onBack: () => void;
}

interface FormState {
  dateOfBirth: string;
  nationality: string;
  occupation: string;
  sourceOfFunds: SourceOfFunds | '';
  expectedMonthlyFtc: string;
  typicalPaymentFtc: string;
}

function toForm(p: MoneyProfile): FormState {
  return {
    dateOfBirth: p.dateOfBirth,
    nationality: p.nationality,
    occupation: p.occupation,
    sourceOfFunds: p.sourceOfFunds,
    expectedMonthlyFtc: p.expectedMonthlyFtc > 0 ? String(p.expectedMonthlyFtc) : '',
    typicalPaymentFtc: p.typicalPaymentFtc > 0 ? String(p.typicalPaymentFtc) : '',
  };
}

export default function MoneyProfileScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(toForm(emptyMoneyProfile()));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await loadMoneyProfile();
      if (saved) setForm(toForm(saved));
    })();
  }, []);

  function bind<K extends keyof FormState>(key: K) {
    return (value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    const num = (s: string) => {
      const n = Number(s.replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    await saveMoneyProfile({
      dateOfBirth: form.dateOfBirth.trim(),
      nationality: form.nationality.trim().toUpperCase(),
      occupation: form.occupation.trim(),
      sourceOfFunds: form.sourceOfFunds,
      expectedMonthlyFtc: num(form.expectedMonthlyFtc),
      typicalPaymentFtc: num(form.typicalPaymentFtc),
      updatedAt: 0,
    });
    onBack();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-4">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('moneyProfile.title')}
          </h2>
        </div>

        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--color-text-muted)' }}>
          {t('moneyProfile.subtitle')}
        </p>

        {/* Identity */}
        <SectionLabel>{t('moneyProfile.identitySection')}</SectionLabel>
        <label className="block mb-3">
          <span className="block uppercase tracking-wider text-xs mb-1.5"
                style={{ color: 'var(--color-text-faint)' }}>
            {t('moneyProfile.dateOfBirth')}
          </span>
          <input type="date" value={form.dateOfBirth}
                 onChange={(e) => bind('dateOfBirth')(e.target.value)} />
        </label>
        <Field label={t('moneyProfile.nationality')} value={form.nationality}
               onChange={bind('nationality')} placeholder="SE" autoCapitalize="characters" />
        <Field label={t('moneyProfile.occupation')} value={form.occupation}
               onChange={bind('occupation')} placeholder={t('moneyProfile.occupationPlaceholder')}
               autoCapitalize="sentences" />

        {/* Money & spending */}
        <SectionLabel>{t('moneyProfile.moneySection')}</SectionLabel>
        <div className="uppercase tracking-wider text-xs mb-1.5"
             style={{ color: 'var(--color-text-faint)' }}>
          {t('moneyProfile.sourceOfFunds')}
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {SOURCE_OF_FUNDS.map((s) => {
            const active = form.sourceOfFunds === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => bind('sourceOfFunds')(active ? '' : s)}
                className="px-3.5 py-2 rounded-lg text-sm font-semibold"
                style={{
                  backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: active ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                }}
              >
                {t(`moneyProfile.source.${s}`)}
              </button>
            );
          })}
        </div>
        <Field label={t('moneyProfile.expectedMonthly')} value={form.expectedMonthlyFtc}
               onChange={bind('expectedMonthlyFtc')} placeholder="2000" inputMode="decimal" />
        <Field label={t('moneyProfile.typicalPayment')} value={form.typicalPaymentFtc}
               onChange={bind('typicalPaymentFtc')} placeholder="50" inputMode="decimal" />

        <div className="rounded-lg p-3 mt-1 mb-2"
             style={{ backgroundColor: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent-dim)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-body)' }}>
            {t('moneyProfile.privacyNote')}
          </p>
        </div>

        <PrimaryButton onClick={save} disabled={busy}>
          {t('moneyProfile.save')}
        </PrimaryButton>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="uppercase tracking-wider text-xs font-bold mt-3 mb-3"
        style={{ color: 'var(--color-accent)' }}>
      {children}
    </h3>
  );
}
