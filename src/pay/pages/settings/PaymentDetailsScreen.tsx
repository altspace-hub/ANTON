/**
 * PaymentDetailsScreen — the customer's ISO 20022 debtor identity.
 *
 * Saved once, then folded into the PACS.008 draft of every payment.
 * All fields are optional; until a name is set, payments name the
 * debtor by the bare wallet address.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Field from '../../components/Field';
import PrimaryButton from '../../components/PrimaryButton';
import {
  emptyPayerIdentity, loadPayerIdentity, savePayerIdentity,
  type PayerIdentity,
} from '../../services/payment-identity';

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
            {t('paymentDetails.title')}
          </h2>
        </div>

        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--color-text-muted)' }}>
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

        <div className="rounded-lg p-3 mt-2 mb-2"
             style={{ backgroundColor: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent-dim)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-body)' }}>
            {t('paymentDetails.privacyNote')}
          </p>
        </div>

        <PrimaryButton onClick={save} disabled={busy}>
          {t('paymentDetails.save')}
        </PrimaryButton>
      </div>
    </div>
  );
}
