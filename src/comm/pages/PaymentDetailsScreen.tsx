/**
 * PaymentDetailsScreen — the Comm user's ISO 20022 debtor identity.
 *
 * Saved once, then folded into the PACS.008 draft of every payment
 * made from the wallet. All fields are optional; until a name is
 * set, payments name the debtor by the bare wallet address.
 *
 * Reached from Settings → Payment details. Data stays on-device in
 * the tier-aware secure-store (see services/payment-identity.ts).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  emptyPayerIdentity, loadPayerIdentity, savePayerIdentity,
  type PayerIdentity,
} from '../services/payment-identity';

interface Props {
  onBack: () => void;
}

export default function PaymentDetailsScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<PayerIdentity>(emptyPayerIdentity());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await loadPayerIdentity();
      if (saved) setForm(saved);
    })();
  }, []);

  function bind<K extends keyof PayerIdentity>(key: K) {
    return (value: PayerIdentity[K]) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    await savePayerIdentity({
      name: form.name.trim(),
      country: form.country.trim().toUpperCase() || 'SE',
      city: form.city.trim(),
      street: form.street.trim(),
      postcode: form.postcode.trim(),
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
        <h2 className="text-lg font-bold text-[var(--color-text)]">{t('paymentDetails.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-5">
          {t('paymentDetails.subtitle')}
        </p>

        <Field label={t('paymentDetails.name')} value={form.name}
               onChange={bind('name')} placeholder="Anna Andersson" />
        <Field label={t('paymentDetails.street')} value={form.street}
               onChange={bind('street')} placeholder="Storgatan 1" />
        <Field label={t('paymentDetails.postcode')} value={form.postcode}
               onChange={bind('postcode')} placeholder="11151" inputMode="numeric" />
        <Field label={t('paymentDetails.city')} value={form.city}
               onChange={bind('city')} placeholder="Stockholm" />
        <Field label={t('paymentDetails.country')} value={form.country}
               onChange={bind('country')} placeholder="SE" autoCapitalize="characters" />

        <div className="rounded-xl p-3 mt-1 bg-[var(--color-accent-soft)] border border-[var(--color-accent-dim)]">
          <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            {t('paymentDetails.privacyNote')}
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
          {t('paymentDetails.save')}
        </button>
      </div>
    </section>
  );
}

/** A labelled text input — Comm has no shared Field component, so this
 *  mirrors the inline-input style used across the Comm screens. */
function Field({ label, value, onChange, placeholder, inputMode, autoCapitalize }: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: 'text' | 'numeric';
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
