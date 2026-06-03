/**
 * ManualPayForm (Comm) — type a complete payment when you only have a wallet
 * address. Mirrors Pay's ManualPayForm: the recipient NAME + COUNTRY are
 * mandatory (a PACS.008 with an empty creditor name is accepted by the hub
 * but never mines), with street/city/postcode collapsible for >= €1000.
 *
 * Builds a complete `futurechain:pay?to=…&cn=…&cc=…` URI and hands it back so
 * the existing parsePayUri → review → sign pipeline populates the creditor
 * party and the tx is mineable.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';

interface Props {
  onSubmit: (uri: string) => void;
}

function ftcToMicro(str: string): bigint | null {
  const t = str.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  const padded = (frac + '000000').slice(0, 6);
  const v = BigInt(whole) * 1_000_000n + BigInt(padded || '0');
  return v > 0n ? v : null;
}

const inputCls =
  'w-full px-3 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-base text-[var(--color-text)]';

function LabeledInput({ label, value, onChange, placeholder, mono, upper, numeric }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  mono?: boolean; upper?: boolean; numeric?: boolean;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-xs uppercase tracking-wider mb-1.5 text-[var(--color-text-faint)]">{label}</span>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoCorrect="off"
        autoCapitalize={upper ? 'characters' : 'none'}
        inputMode={numeric ? 'decimal' : 'text'}
        className={`${inputCls} ${mono ? 'font-mono text-[13px]' : ''}`}
      />
    </label>
  );
}

export default function ManualPayForm({ onSubmit }: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('SE');
  const [showAddress, setShowAddress] = useState(false);
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [postcode, setPostcode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const addr = address.trim();
    if (!addr.startsWith('fc_') || addr.length < 12) { setError(t('manualPay.errAddress', 'Enter a valid fc_… wallet address.')); return; }
    const micro = ftcToMicro(amount);
    if (!micro) { setError(t('manualPay.errAmount', 'Enter a valid amount in FTC.')); return; }
    if (!name.trim()) { setError(t('manualPay.errName', "Enter the recipient's name — it's required for the payment to settle.")); return; }
    if (!country.trim()) { setError(t('manualPay.errCountry', "Enter the recipient's country.")); return; }
    const p = new URLSearchParams();
    p.set('to', addr);
    p.set('amount', micro.toString());
    p.set('cn', name.trim());
    p.set('cc', country.trim().toUpperCase());
    if (city.trim()) p.set('cct', city.trim());
    if (street.trim()) p.set('cst', street.trim());
    if (postcode.trim()) p.set('cpc', postcode.trim());
    onSubmit(`futurechain:pay?${p.toString()}`);
  }

  return (
    <div>
      <p className="text-sm mb-3 text-[var(--color-text-muted)]">
        {t('manualPay.hint', "Name + country are required so the payment can settle. For amounts ≥ €1000, also add the recipient's street, city and postcode.")}
      </p>
      <LabeledInput label={t('manualPay.address', 'Recipient wallet address')} value={address} onChange={(v) => { setAddress(v); setError(null); }} placeholder="fc_…" mono />
      <LabeledInput label={t('manualPay.amount', 'Amount (FTC)')} value={amount} onChange={(v) => { setAmount(v); setError(null); }} placeholder="0.20" numeric />
      <LabeledInput label={t('manualPay.name', 'Recipient name')} value={name} onChange={(v) => { setName(v); setError(null); }} placeholder="Anna Andersson" />
      <LabeledInput label={t('manualPay.country', 'Recipient country (ISO code)')} value={country} onChange={(v) => { setCountry(v); setError(null); }} placeholder="SE" upper />

      <button type="button" onClick={() => setShowAddress((v) => !v)} className="text-sm font-medium mb-2 text-[var(--color-accent)]">
        {showAddress ? t('manualPay.hideAddress', '− Hide address fields') : t('manualPay.showAddress', '+ Add recipient address (for ≥ €1000)')}
      </button>
      {showAddress && (
        <div className="mb-1">
          <LabeledInput label={t('manualPay.street', 'Street')} value={street} onChange={setStreet} placeholder="Storgatan 1" />
          <LabeledInput label={t('manualPay.postcode', 'Postcode')} value={postcode} onChange={setPostcode} placeholder="11151" numeric />
          <LabeledInput label={t('manualPay.city', 'City')} value={city} onChange={setCity} placeholder="Stockholm" />
        </div>
      )}

      {error && <div className="mt-2 mb-2 rounded-lg p-3 text-sm bg-[var(--color-red-dim,rgba(231,76,60,0.12))] text-[var(--color-red)]">{error}</div>}

      <PrimaryButton onClick={submit}>{t('manualPay.continue', 'Continue to review')}</PrimaryButton>
    </div>
  );
}
