/**
 * RegisterScreen — onboarding step 2 (business details).
 *
 * v2.0 phone-first: no HTTP, no wallet. Saves the merchant config to
 * secure-store and continues. The receive address is left blank
 * here — it gets set later when the merchant connects a wallet in
 * Settings. Until then, sale flows persist kvittos without a QR.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Field from '../../components/Field';
import PrimaryButton from '../../components/PrimaryButton';
import { saveConfig } from '../../services/merchant';
import type { MerchantConfig, SaleMode } from '../../services/types';

interface FormState {
  legalName: string;
  orgNr: string;
  city: string;
  street: string;
  postcode: string;
  country: string;
  vatRegistered: boolean;
  defaultVatRate: 0 | 6 | 12 | 25;
  kvittoEmail: string;
}

export default function RegisterScreen({
  onContinue,
  pendingMode,
}: {
  onContinue: () => void;
  pendingMode: SaleMode;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>({
    legalName: '',
    orgNr: '',
    city: '',
    street: '',
    postcode: '',
    country: 'SE',
    vatRegistered: true,
    defaultVatRate: 25,
    kvittoEmail: '',
  });
  const [error, setError] = useState<string | null>(null);

  function bind<K extends keyof FormState>(key: K) {
    return (value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    const required: Array<keyof FormState> = ['legalName', 'orgNr', 'city', 'street', 'postcode'];
    for (const k of required) {
      if (typeof form[k] === 'string' && !(form[k] as string).trim()) {
        setError(t('register.fillError', { field: t(`register.${k}`) }));
        return;
      }
    }
    setError(null);
    const config: MerchantConfig = {
      legalName: form.legalName.trim(),
      orgNr: form.orgNr.trim(),
      city: form.city.trim(),
      street: form.street.trim(),
      postcode: form.postcode.trim(),
      country: form.country.trim().toUpperCase() || 'SE',
      vatRegistered: form.vatRegistered,
      defaultVatRate: form.defaultVatRate,
      // Empty until "Connect wallet" runs in Settings — sale screens
      // gate their QR step on this being non-empty.
      safelloReceiveAddress: '',
      kvittoEmail: form.kvittoEmail.trim() || undefined,
      defaultMode: pendingMode,
      nextKvittoNumber: 1,
      nextKreditNumber: 1,
      nextZNumber: 1,
      configuredAt: Date.now(),
      ftcPerSek: 0.1,
      lastBackupAt: 0,
    };
    await saveConfig(config);
    onContinue();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="p-6 pb-12">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
          {t('register.title')}
        </h2>
        <p className="text-sm leading-snug mb-5"
           style={{ color: 'var(--color-text-muted)' }}>
          {t('register.subtitle')}
        </p>

        <Field label={t('register.legalName')} value={form.legalName} onChange={bind('legalName')} placeholder="Karl's Café AB" />
        <Field label={t('register.orgNr')} value={form.orgNr} onChange={bind('orgNr')} placeholder="SE556000-0000" autoCapitalize="characters" />
        <Field label={t('register.street')} value={form.street} onChange={bind('street')} placeholder="Drottninggatan 1" />
        <Field label={t('register.postcode')} value={form.postcode} onChange={bind('postcode')} placeholder="11151" inputMode="numeric" />
        <Field label={t('register.city')} value={form.city} onChange={bind('city')} placeholder="Stockholm" />
        <Field label={t('register.country')} value={form.country} onChange={bind('country')} placeholder="SE" autoCapitalize="characters" />

        <div className="flex justify-between items-center my-4 px-1">
          <span className="uppercase tracking-wider text-xs"
                style={{ color: 'var(--color-text-faint)' }}>
            {t('register.vatRegistered')}
          </span>
          <Toggle on={form.vatRegistered} onChange={bind('vatRegistered')} />
        </div>

        {form.vatRegistered && (
          <div className="mb-3">
            <div className="uppercase tracking-wider text-xs mb-1.5"
                 style={{ color: 'var(--color-text-faint)' }}>
              {t('register.defaultVatRate')}
            </div>
            <div className="flex gap-2">
              {([0, 6, 12, 25] as const).map((r) => {
                const active = form.defaultVatRate === r;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => bind('defaultVatRate')(r)}
                    className="flex-1 py-3 rounded-lg font-semibold transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: active ? 'var(--color-accent-fg)' : 'var(--color-text-muted)',
                      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    }}
                  >{r}%</button>
                );
              })}
            </div>
          </div>
        )}

        <h3 className="uppercase tracking-wider text-xs font-bold mt-6 mb-3"
            style={{ color: 'var(--color-accent)' }}>{t('register.receipts')}</h3>
        <Field
          label={t('register.kvittoEmail')}
          value={form.kvittoEmail}
          onChange={bind('kvittoEmail')}
          placeholder="receipts@karls-cafe.se"
          inputMode="email"
          autoCapitalize="none"
        />

        {error && (
          <p className="text-sm mt-3" style={{ color: 'var(--color-error)' }}>{error}</p>
        )}

        <div className="mt-6">
          <PrimaryButton onClick={submit} marginTopAuto={false}>
            {t('register.saveAndContinue')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="relative w-12 h-7 rounded-full transition-colors"
      style={{
        backgroundColor: on ? 'var(--color-accent)' : 'var(--color-border)',
      }}
      aria-pressed={on}
    >
      <span
        className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full transition-transform"
        style={{
          backgroundColor: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transform: on ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}
