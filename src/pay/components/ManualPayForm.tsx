/**
 * ManualPayForm — type a complete payment when you only have a wallet
 * address (no QR to scan). The recipient's NAME + COUNTRY are mandatory:
 * a PACS.008 with an empty creditor name is accepted by the hub but the
 * chain never mines it (this is the bug that left bare-address sends stuck
 * "awaiting"). For amounts that fall under the EU Travel Rule (>= €1000, or
 * whenever the FX rate is dark → conservative tier) the recipient's street,
 * city and postcode are also required — they're collapsible below.
 *
 * The form builds a complete `futurechain:pay?to=…&cn=…&cc=…` URI and hands
 * it to the SAME decode → review → sign pipeline a scanned QR uses, so the
 * creditor party is fully populated and the tx is mineable.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Field from './Field';
import PrimaryButton from './PrimaryButton';

interface Props {
  /** Receives the assembled `futurechain:pay` URI. */
  onSubmit: (uri: string) => void;
}

/** Parse an FTC decimal string to µFTC (1 FTC = 1,000,000 µFTC). */
function ftcToMicro(str: string): bigint | null {
  const t = str.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  const padded = (frac + '000000').slice(0, 6);
  const v = BigInt(whole) * 1_000_000n + BigInt(padded || '0');
  return v > 0n ? v : null;
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
    if (!addr.startsWith('fc_') || addr.length < 12) {
      setError(t('manualPay.errAddress', 'Enter a valid fc_… wallet address.'));
      return;
    }
    const micro = ftcToMicro(amount);
    if (!micro) {
      setError(t('manualPay.errAmount', 'Enter a valid amount in FTC.'));
      return;
    }
    if (!name.trim()) {
      setError(t('manualPay.errName', "Enter the recipient's name — it's required for the payment to settle."));
      return;
    }
    if (!country.trim()) {
      setError(t('manualPay.errCountry', "Enter the recipient's country."));
      return;
    }
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
      <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>
        {t('manualPay.hint', "Name + country are required so the payment can settle. For amounts ≥ €1000, also add the recipient's street, city and postcode.")}
      </p>

      <Field label={t('manualPay.address', 'Recipient wallet address')} value={address}
             onChange={(v) => { setAddress(v); setError(null); }} placeholder="fc_…" autoCapitalize="none" />
      <Field label={t('manualPay.amount', 'Amount (FTC)')} value={amount}
             onChange={(v) => { setAmount(v); setError(null); }} placeholder="0.20" inputMode="decimal" />
      <Field label={t('manualPay.name', 'Recipient name')} value={name}
             onChange={(v) => { setName(v); setError(null); }} placeholder="Anna Andersson" />
      <Field label={t('manualPay.country', 'Recipient country (ISO code)')} value={country}
             onChange={(v) => { setCountry(v); setError(null); }} placeholder="SE" autoCapitalize="characters" />

      <button type="button" onClick={() => setShowAddress((v) => !v)}
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--color-accent)' }}>
        {showAddress
          ? t('manualPay.hideAddress', '− Hide address fields')
          : t('manualPay.showAddress', '+ Add recipient address (for ≥ €1000)')}
      </button>
      {showAddress && (
        <div className="mb-1">
          <Field label={t('manualPay.street', 'Street')} value={street}
                 onChange={setStreet} placeholder="Storgatan 1" />
          <Field label={t('manualPay.postcode', 'Postcode')} value={postcode}
                 onChange={setPostcode} placeholder="11151" inputMode="numeric" />
          <Field label={t('manualPay.city', 'City')} value={city}
                 onChange={setCity} placeholder="Stockholm" />
        </div>
      )}

      {error && (
        <div className="mt-2 mb-1 rounded-lg p-3 text-sm"
             style={{ backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
          {error}
        </div>
      )}

      <PrimaryButton onClick={submit}>
        {t('manualPay.continue', 'Continue to review')}
      </PrimaryButton>
    </div>
  );
}
