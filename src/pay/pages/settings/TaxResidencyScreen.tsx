/**
 * TaxResidencyScreen — declared-residency capture.
 *
 * First-use prompt per FUTURECHAIN_TAX_RULES.md §7.1. The user picks
 * their jurisdiction from a list; we store the choice + timestamp.
 *
 * Bundled jurisdictions (full rule + supported computation) come from
 * @futurechain/sdk tax.activeJurisdictionCodes(). Everything else still
 * appears in the picker but is annotated "refer to adviser" — the engine
 * returns a RefusalResult (§8.3) for those.
 *
 * Multi-residency / digital-nomad scenarios are out of scope per §7.1.
 *
 * Ported from src/comm/pages/wallet/TaxResidencyScreen.tsx. Difference:
 * onDeclared reports (code, name) so the onboarding caller can seed the
 * ISO debtor country; Settings ignores the args.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tax } from '@futurechain/sdk';
import { saveResidency } from '../../services/tax-residency';

/** Common-locale jurisdictions surfaced in the picker. Order is by rough
 *  audience size for the Phase-1 rollout. Non-bundled codes still save —
 *  they just return RefusalResult from the engine until a rule activates. */
const PICKER: Array<{ code: string; name: string; emoji: string }> = [
  { code: 'SE', name: 'Sweden',         emoji: '🇸🇪' },
  { code: 'DE', name: 'Germany',        emoji: '🇩🇪' },
  { code: 'FR', name: 'France',         emoji: '🇫🇷' },
  { code: 'IT', name: 'Italy',          emoji: '🇮🇹' },
  { code: 'ES', name: 'Spain',          emoji: '🇪🇸' },
  { code: 'PT', name: 'Portugal',       emoji: '🇵🇹' },
  { code: 'NL', name: 'Netherlands',    emoji: '🇳🇱' },
  { code: 'GB', name: 'United Kingdom', emoji: '🇬🇧' },
  { code: 'IE', name: 'Ireland',        emoji: '🇮🇪' },
  { code: 'CH', name: 'Switzerland',    emoji: '🇨🇭' },
  { code: 'NO', name: 'Norway',         emoji: '🇳🇴' },
  { code: 'DK', name: 'Denmark',        emoji: '🇩🇰' },
  { code: 'FI', name: 'Finland',        emoji: '🇫🇮' },
  { code: 'AT', name: 'Austria',        emoji: '🇦🇹' },
  { code: 'BE', name: 'Belgium',        emoji: '🇧🇪' },
  { code: 'US', name: 'United States',  emoji: '🇺🇸' },
  { code: 'CA', name: 'Canada',         emoji: '🇨🇦' },
  { code: 'AU', name: 'Australia',      emoji: '🇦🇺' },
  { code: 'NZ', name: 'New Zealand',    emoji: '🇳🇿' },
  { code: 'SG', name: 'Singapore',      emoji: '🇸🇬' },
  { code: 'HK', name: 'Hong Kong',      emoji: '🇭🇰' },
  { code: 'JP', name: 'Japan',          emoji: '🇯🇵' },
  { code: 'AE', name: 'UAE',            emoji: '🇦🇪' },
  { code: 'ZA', name: 'South Africa',   emoji: '🇿🇦' },
  { code: 'NG', name: 'Nigeria',        emoji: '🇳🇬' },
  { code: 'KE', name: 'Kenya',          emoji: '🇰🇪' },
  { code: 'CY', name: 'Cyprus',         emoji: '🇨🇾' },
  { code: 'MT', name: 'Malta',          emoji: '🇲🇹' },
  { code: 'PL', name: 'Poland',         emoji: '🇵🇱' },
  { code: 'KR', name: 'South Korea',    emoji: '🇰🇷' },
  { code: 'IL', name: 'Israel',         emoji: '🇮🇱' },
  { code: 'BR', name: 'Brazil',         emoji: '🇧🇷' },
];

interface Props {
  /** Reports the chosen (ISO-3166-alpha-2, display name). The onboarding
   *  caller uses these to seed the ISO debtor country; Settings ignores them. */
  onDeclared: (code: string, name: string) => void;
  onBack?: () => void;
}

export default function TaxResidencyScreen({ onDeclared, onBack }: Props) {
  const { t } = useTranslation();
  const [bundled, setBundled] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // "Supported" badge maps to status='active' jurisdictions. If the SDK
    // throws or returns nothing, the set is just empty — every row then
    // reads "refer to adviser" and declarations still save fine.
    try {
      setBundled(new Set(tax.activeJurisdictionCodes().map((c) => c.toUpperCase())));
    } catch {
      setBundled(new Set());
    }
  }, []);

  const visible = filter.trim()
    ? PICKER.filter((p) =>
        p.name.toLowerCase().includes(filter.toLowerCase()) ||
        p.code.toLowerCase().includes(filter.toLowerCase()),
      )
    : PICKER;

  async function pick(code: string, name: string) {
    if (saving) return;
    setSaving(true);
    await saveResidency(code, name);
    onDeclared(code, name);
  }

  return (
    <section className="flex flex-col h-full safe-bottom"
             style={{ backgroundColor: 'var(--color-bg)' }}>
      <Header title={t('tax.residencyTitle', 'Tax residency')} onBack={onBack} />

      <div className="px-5 pt-1 pb-3">
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {t('tax.residencyHelp',
            'Pick the country you’re tax resident in. We use this to apply the right rules — it stays on this device.')}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-faint)' }}>
          {t('tax.residencyDeclared',
            'Residency is declared, not inferred from your location. Re-confirm yearly or whenever it changes. If you live in multiple countries during the year, talk to a tax adviser — ANTON doesn’t split jurisdictions.')}
        </p>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('common.search', 'Search')}
          className="mt-3 w-full p-3 rounded-xl text-sm"
          style={{ backgroundColor: 'var(--color-surface)',
                   border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <ul className="flex flex-col gap-1.5">
          {visible.map((p) => {
            const supported = bundled.has(p.code);
            return (
              <li key={p.code}>
                <button
                  type="button"
                  onClick={() => void pick(p.code, p.name)}
                  disabled={saving}
                  className="w-full flex items-center justify-between p-3 rounded-lg active:scale-[0.99] transition-transform"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border-soft)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">{p.emoji}</span>
                    <div className="text-left min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                        {p.name}
                      </div>
                      <div className="text-[11px] mono" style={{ color: 'var(--color-text-faint)' }}>
                        {p.code}
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                    style={
                      supported
                        ? { backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }
                        : { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }
                    }
                  >
                    {supported ? t('tax.supported', 'Supported') : t('tax.referToAdviser', 'Refer to adviser')}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <p className="text-center text-sm mt-4" style={{ color: 'var(--color-text-faint)' }}>
              {t('tax.noMatches', 'No matches.')}
            </p>
          )}
        </ul>
      </div>
    </section>
  );
}

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-2 safe-top">
      {onBack && (
        <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label="Back"
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{title}</h2>
    </div>
  );
}
