/**
 * OnboardingContextScreen — onboarding step after the wallet backup.
 *
 * "Make ANTON yours": pick a language, your name, and your tax country so
 * payment records (the ISO 20022 debtor party) and tax estimates are right
 * from the first payment. Everything here is optional + changeable in
 * Settings — [Skip for now] keeps the wallet usable for small P2P without
 * any KYC, matching the Travel-Rule "minimal" tier.
 *
 * The tax-country picker is the shared TaxResidencyScreen, rendered over
 * this screen via local state so one component serves both onboarding and
 * Settings. On declaration we seed the ISO debtor country from the chosen
 * jurisdiction once (see tax-residency.seedIdentityCountry).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '../../components/Logo';
import PrimaryButton from '../../components/PrimaryButton';
import { LANGUAGES } from '../../i18n/languages';
import { getLanguage, setLanguage } from '../../i18n';
import {
  emptyPayerIdentity, loadPayerIdentity, savePayerIdentity,
} from '../../services/payment-identity';
import { loadResidency, seedIdentityCountry } from '../../services/tax-residency';
import TaxResidencyScreen from '../settings/TaxResidencyScreen';

interface Props {
  onContinue: () => void;
  onSkip: () => void;
}

export default function OnboardingContextScreen({ onContinue, onSkip }: Props) {
  const { t } = useTranslation();
  const [lang, setLang] = useState(getLanguage());
  const [name, setName] = useState('');
  const [residency, setResidency] = useState<{ code: string; name: string } | null>(null);
  const [pickingCountry, setPickingCountry] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reflect any earlier declaration / saved name (user may revisit this step).
  useEffect(() => {
    void loadResidency().then((r) => {
      if (r) setResidency({ code: r.jurisdictionCode, name: r.jurisdictionName });
    });
    void loadPayerIdentity().then((id) => { if (id?.name) setName(id.name); });
  }, []);

  function changeLanguage(code: string) {
    setLang(code);
    setLanguage(code); // persists + flips RTL; re-renders this screen translated
  }

  // The shared picker has already persisted the residency (saveResidency);
  // here we seed the ISO debtor country once, then close the picker.
  async function onCountryDeclared(code: string, jurisdictionName: string) {
    const id = await loadPayerIdentity();
    await savePayerIdentity(seedIdentityCountry(id, code));
    setResidency({ code: code.toUpperCase(), name: jurisdictionName });
    setPickingCountry(false);
  }

  async function persistAndContinue() {
    if (busy) return;
    setBusy(true);
    try {
      const trimmed = name.trim();
      if (trimmed) {
        const id = (await loadPayerIdentity()) ?? emptyPayerIdentity();
        await savePayerIdentity({ ...id, name: trimmed });
      }
      onContinue();
    } finally {
      setBusy(false);
    }
  }

  if (pickingCountry) {
    return (
      <TaxResidencyScreen
        onDeclared={(code, jn) => void onCountryDeclared(code, jn)}
        onBack={() => setPickingCountry(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex flex-col items-center text-center mt-8 mb-6">
          <Logo size={64} rounded="lg" />
          <h1 className="text-2xl font-bold mt-4" style={{ color: 'var(--color-text)' }}>
            {t('onboarding.contextTitle', 'Make ANTON yours')}
          </h1>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--color-text-body)' }}>
            {t('onboarding.contextBody',
              'Set your language and where you’re tax resident so payment records and tax estimates are right from the start. You can change these any time in Settings.')}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Language */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
              {t('onboarding.contextLanguage', 'Language')}
            </span>
            <select
              value={lang}
              onChange={(e) => changeLanguage(e.target.value)}
              className="w-full p-3 rounded-xl text-sm"
              style={{ backgroundColor: 'var(--color-surface)',
                       border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native} — {l.english}</option>
              ))}
            </select>
          </label>

          {/* Name */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
              {t('paymentDetails.name', 'Full name')}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('onboarding.contextNamePlaceholder', 'Your name')}
              className="w-full p-3 rounded-xl text-sm"
              style={{ backgroundColor: 'var(--color-surface)',
                       border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              autoCapitalize="words"
            />
          </label>

          {/* Tax residency — opens the shared picker */}
          <button type="button" onClick={() => setPickingCountry(true)}
                  className="rounded-xl p-4 flex items-center justify-between text-left"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border)' }}>
            <div className="flex-1 min-w-0 pr-3">
              <div className="font-bold" style={{ color: 'var(--color-text)' }}>
                {t('onboarding.contextSetResidency', 'Tax residency')}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {residency
                  ? `${residency.name} (${residency.code})`
                  : t('onboarding.contextResidencyNone', 'Not set yet')}
              </div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 style={{ color: 'var(--color-text-dim)', flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="mt-auto pt-6 flex flex-col gap-3">
          <PrimaryButton onClick={() => void persistAndContinue()} disabled={busy}>
            {t('onboarding.contextContinue', 'Continue')}
          </PrimaryButton>
          <button type="button" onClick={onSkip}
                  className="text-sm font-semibold py-2" style={{ color: 'var(--color-text-muted)' }}>
            {t('onboarding.contextSkip', 'Skip for now')}
          </button>
        </div>
      </div>
    </div>
  );
}
