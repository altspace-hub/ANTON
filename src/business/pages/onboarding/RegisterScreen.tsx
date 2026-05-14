/**
 * RegisterScreen — onboarding step 3 (merchant config form).
 *
 * v2.0 phone-first: no HTTP. Saves the config to secure-store and
 * continues. The Safello receive address defaults to the merchant's
 * own wallet address — if they have a Safello sweep arrangement,
 * they paste the address Safello gave them.
 */
import { useEffect, useState } from 'react';
import Field from '../../components/Field';
import PrimaryButton from '../../components/PrimaryButton';
import { saveConfig } from '../../services/merchant';
import type { MerchantConfig } from '../../services/types';
import { loadWallet } from '../../services/wallet';

interface FormState {
  legalName: string;
  orgNr: string;
  city: string;
  street: string;
  postcode: string;
  vatRegistered: boolean;
  defaultVatRate: 0 | 6 | 12 | 25;
  safelloReceiveAddress: string;
  kvittoEmail: string;
}

export default function RegisterScreen({ onContinue }: { onContinue: () => void }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    legalName: '',
    orgNr: '',
    city: '',
    street: '',
    postcode: '',
    vatRegistered: true,
    defaultVatRate: 25,
    safelloReceiveAddress: '',
    kvittoEmail: '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWallet().then((w) => {
      if (!w) {
        setError('No wallet on device — generate one first.');
      } else {
        setWalletAddress(w.address);
        setForm((f) => ({ ...f, safelloReceiveAddress: w.address }));
      }
    });
  }, []);

  function bind<K extends keyof FormState>(key: K) {
    return (value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    const required: Array<keyof FormState> = [
      'legalName', 'orgNr', 'city', 'street', 'postcode', 'safelloReceiveAddress',
    ];
    for (const k of required) {
      if (typeof form[k] === 'string' && !(form[k] as string).trim()) {
        setError(`Fill ${k} before continuing.`);
        return;
      }
    }
    if (!walletAddress) {
      setError('Wallet missing — generate one first.');
      return;
    }
    setError(null);
    const config: MerchantConfig = {
      legalName: form.legalName.trim(),
      orgNr: form.orgNr.trim(),
      city: form.city.trim(),
      street: form.street.trim(),
      postcode: form.postcode.trim(),
      vatRegistered: form.vatRegistered,
      defaultVatRate: form.defaultVatRate,
      safelloReceiveAddress: form.safelloReceiveAddress.trim(),
      kvittoEmail: form.kvittoEmail.trim() || undefined,
      nextKvittoNumber: 1,
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
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>Business details</h2>
        <p className="text-sm leading-snug mb-5" style={{ color: 'var(--color-text-muted)' }}>
          These appear on every kvitto. Everything is stored locally on
          this device — no servers involved.
        </p>

        <Field label="Legal name" value={form.legalName} onChange={bind('legalName')} placeholder="Karl's Café AB" />
        <Field label="Org. nr." value={form.orgNr} onChange={bind('orgNr')} placeholder="SE556000-0000" autoCapitalize="characters" />
        <Field label="Street" value={form.street} onChange={bind('street')} placeholder="Drottninggatan 1" />
        <Field label="Postcode" value={form.postcode} onChange={bind('postcode')} placeholder="11151" inputMode="numeric" />
        <Field label="City" value={form.city} onChange={bind('city')} placeholder="Stockholm" />

        <div className="flex justify-between items-center my-4">
          <span style={{ color: 'var(--color-text-faint)' }} className="uppercase tracking-wider text-xs">
            VAT registered
          </span>
          <Toggle on={form.vatRegistered} onChange={bind('vatRegistered')} />
        </div>

        {form.vatRegistered && (
          <div className="mb-3">
            <div className="uppercase tracking-wider text-xs mb-1.5"
                 style={{ color: 'var(--color-text-faint)' }}>
              Default VAT rate
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
                    }}
                  >{r}%</button>
                );
              })}
            </div>
          </div>
        )}

        <h3 className="uppercase tracking-wider text-xs font-bold mt-6 mb-3"
            style={{ color: 'var(--color-accent)' }}>Settlement</h3>
        <p className="text-[13px] leading-snug mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Customer FTC payments will land at this address. If you have a
          Safello sweep agreement, use the address Safello gave you.
          Otherwise leave this as your own wallet address and manage
          conversion yourself.
        </p>
        <Field label="Receive address" value={form.safelloReceiveAddress}
               onChange={bind('safelloReceiveAddress')} placeholder="fc_..." autoCapitalize="none" />

        <h3 className="uppercase tracking-wider text-xs font-bold mt-6 mb-3"
            style={{ color: 'var(--color-accent)' }}>Receipts</h3>
        <Field label="Email for kvitto (optional)" value={form.kvittoEmail}
               onChange={bind('kvittoEmail')} placeholder="receipts@karls-cafe.se"
               inputMode="email" autoCapitalize="none" />

        {walletAddress && (
          <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface)' }}>
            <div className="uppercase tracking-wider text-xs mb-1.5"
                 style={{ color: 'var(--color-text-faint)' }}>
              Your wallet (identity)
            </div>
            <div className="mono text-[13px] break-all" style={{ color: 'var(--color-accent)' }}>
              {walletAddress}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm mt-3" style={{ color: 'var(--color-error)' }}>{error}</p>
        )}

        <div className="mt-6">
          <PrimaryButton onClick={submit} disabled={!walletAddress} marginTopAuto={false}>
            Save and continue
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
      style={{ backgroundColor: on ? 'var(--color-accent-dim)' : 'var(--color-text-dim)' }}
      aria-pressed={on}
    >
      <span
        className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full transition-transform"
        style={{
          backgroundColor: 'var(--color-text)',
          transform: on ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}
