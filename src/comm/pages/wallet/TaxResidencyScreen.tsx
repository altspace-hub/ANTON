/**
 * TaxResidencyScreen — declared-residency capture.
 *
 * First-use prompt per FUTURECHAIN_TAX_RULES.md §7.1. The user picks
 * their jurisdiction from a list; we store the choice + timestamp.
 *
 * Bundled jurisdictions (full rule + supported computation) come from
 * @futurechain/sdk/tax bundledJurisdictionCodes(). Everything else
 * still appears in the picker but is annotated "refer to adviser" —
 * the engine returns a RefusalResult (§8.3) for those, and the
 * TaxPositionScreen surfaces a CSV-export-only path.
 *
 * Multi-residency / digital-nomad scenarios are out of scope per
 * §7.1 — the screen surfaces this if the user asks about it.
 */
import { useEffect, useState } from 'react';
import { tax } from '@futurechain/sdk';
import { saveResidency } from '../../services/tax-residency';

/** Common-locale jurisdictions surfaced in the picker. Order is by
 *  rough merchant population for the Phase-1 audience. The full set
 *  per FUTURECHAIN_TAX_RULES.md §6 lands as the engine activates more
 *  rules; until then non-bundled codes return RefusalResult and the
 *  position screen offers CSV export. */
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
];

interface Props {
  onDeclared: () => void;
  onBack?: () => void;
}

export default function TaxResidencyScreen({ onDeclared, onBack }: Props) {
  const [bundled, setBundled] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBundled(new Set(tax.bundledJurisdictionCodes().map((c) => c.toUpperCase())));
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
    onDeclared();
  }

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title="Tax residency" onBack={onBack} />

      <div className="px-5 pt-1 pb-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          Pick the country you&apos;re tax resident in. We use this to
          apply the right rules — it stays on this device.
        </p>
        <p className="mt-2 text-[11px] text-[var(--color-text-faint)] leading-relaxed">
          Per FutureChain&apos;s tax policy, residency is declared, not
          inferred from your location. Re-confirm yearly or whenever it
          changes. If you live in multiple countries during the year,
          talk to a tax adviser — Anton doesn&apos;t split jurisdictions.
        </p>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search…"
          className="mt-3 w-full p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)]"
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
                  onClick={() => pick(p.code, p.name)}
                  disabled={saving}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)] active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">{p.emoji}</span>
                    <div className="text-left min-w-0">
                      <div className="text-sm font-medium text-[var(--color-text)] truncate">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-faint)] font-mono">
                        {p.code}
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                    style={
                      supported
                        ? { backgroundColor: 'var(--color-green-dim)', color: 'var(--color-green)' }
                        : { backgroundColor: 'var(--color-gold-dim)', color: 'var(--color-gold)' }
                    }
                  >
                    {supported ? 'Supported' : 'Refer to adviser'}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <p className="text-center text-sm text-[var(--color-text-faint)] mt-4">
              No matches.
            </p>
          )}
        </ul>
      </div>
    </section>
  );
}

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-2">
      {onBack && (
        <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label="Back"
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <h2 className="text-lg font-bold text-[var(--color-text)]">{title}</h2>
    </div>
  );
}
