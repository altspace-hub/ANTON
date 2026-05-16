/**
 * MoneyProfileScreen — the Comm user's self-declared money profile.
 *
 * Two sections: identity (date of birth, nationality, occupation) and
 * money pattern (source of funds, expected monthly + typical payment).
 * Everything is optional and stays on the phone — it is the baseline
 * the light fraud engine (a later phase) compares new payments against.
 *
 * Reached from Settings → Money profile. Data stays on-device in the
 * tier-aware secure-store (see services/money-profile.ts). It is NOT a
 * regulated identity check — it is a personal pattern baseline.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  emptyMoneyProfile, loadMoneyProfile, saveMoneyProfile,
  SOURCE_OF_FUNDS, type MoneyProfile, type SourceOfFunds,
} from '../services/money-profile';

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
    <section className="flex flex-col h-full safe-bottom">
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label={t('common.back')}
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-[var(--color-text)]">{t('moneyProfile.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-5">
          {t('moneyProfile.subtitle')}
        </p>

        {/* Identity */}
        <SectionLabel>{t('moneyProfile.identitySection')}</SectionLabel>
        <label className="block mb-4">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
            {t('moneyProfile.dateOfBirth')}
          </span>
          <input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => bind('dateOfBirth')(e.target.value)}
            className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)]"
          />
        </label>
        <Field label={t('moneyProfile.nationality')} value={form.nationality}
               onChange={bind('nationality')} placeholder="SE" autoCapitalize="characters" />
        <Field label={t('moneyProfile.occupation')} value={form.occupation}
               onChange={bind('occupation')} placeholder={t('moneyProfile.occupationPlaceholder')} />

        {/* Money & spending */}
        <SectionLabel>{t('moneyProfile.moneySection')}</SectionLabel>
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
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

        <div className="rounded-xl p-3 mt-1 bg-[var(--color-accent-soft)] border border-[var(--color-accent-dim)]">
          <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            {t('moneyProfile.privacyNote')}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="w-full py-4 rounded-xl font-bold text-base text-[var(--color-accent-fg)] bg-[var(--color-accent)] transition-opacity"
          style={{ opacity: busy ? 0.5 : 1 }}
        >
          {t('moneyProfile.save')}
        </button>
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="uppercase tracking-wider text-xs font-bold mt-3 mb-3 text-[var(--color-accent)]">
      {children}
    </h3>
  );
}

/** A labelled text input — Comm has no shared Field component, so this
 *  mirrors the inline-input style used across the Comm screens. */
function Field({ label, value, onChange, placeholder, inputMode, autoCapitalize }: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  autoCapitalize?: 'none' | 'characters';
}) {
  return (
    <label className="block mb-4">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)]"
      />
    </label>
  );
}
