/**
 * FiatAmountInput — fiat-first amount entry with tap-to-swap.
 *
 * EU regulator guidance (EBA + MiCA Art. 66) and the Joint ESA crypto
 * warning (Oct 2025) both nudge retail wallets toward fiat-first
 * display: showing "100 SEK" first and "0.012 FTC" underneath is
 * "fair, clear, not misleading" for users who can't intuit FTC
 * values. Every major mobile wallet (Phantom, Coinbase Wallet,
 * MetaMask Mobile, Trust) defaults to this since 2023-24.
 *
 * Behaviour:
 *   • Primary input row is the user's preferred fiat (default SEK).
 *   • Secondary line shows the FTC equivalent at the current display
 *     rate, with rate timestamp + source ("at 8 130 SEK/FTC · 14:32 ·
 *     Bahnhof oracle"). When typing, the secondary updates live.
 *   • Tap-to-swap chevron flips primary ↔ secondary so a crypto-
 *     native user can enter FTC directly.
 *   • When no rate is available (until Bahnhof publishes its
 *     oracle), the secondary collapses to a single inline "Rate
 *     unavailable — fiat display disabled" notice and the primary
 *     forced to FTC. NO fabricated number is ever shown.
 *
 * Out-parameters:
 *   • onChangeMicroFtc(bigint) — the canonical thing being signed.
 *     Always µFTC regardless of which side the user typed in.
 *   • The component owns its own fiat string state to avoid the
 *     round-trip jitter you get when fiat→µFTC→fiat re-formats on
 *     every keystroke.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getDisplayQuote, getPreferredFiat, fiatToMicroFtc,
  type Quote, type FiatCurrency,
} from '../services/fx';

interface Props {
  /** Initial value as µFTC. Empty string → input starts blank. */
  initialMicroFtc?: bigint;
  /** Fires on every valid edit. Pass `0n` for empty / invalid. */
  onChangeMicroFtc: (micro: bigint) => void;
  /** Label above the input. */
  label?: string;
  /** Smaller helper text below — shown alongside the rate disclosure
   *  when a rate IS available, or alone when not. */
  helper?: string;
  /** Override preferred fiat (defaults to user setting, SEK). */
  fiat?: FiatCurrency;
}

type Mode = 'fiat' | 'ftc';

/** Format a date for the rate-timestamp pill, sv-SE style. */
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
}

function microFtcToString(micro: bigint): string {
  if (micro === 0n) return '';
  const whole = micro / 1_000_000n;
  const frac = micro % 1_000_000n;
  if (frac === 0n) return whole.toString();
  // Trim trailing zeros in the fractional part.
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

function ftcToMicro(str: string): bigint | null {
  const trimmed = str.trim();
  if (!trimmed) return 0n;
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const padded = (frac + '000000').slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(padded || '0');
}

export default function FiatAmountInput({
  initialMicroFtc = 0n, onChangeMicroFtc, label, helper, fiat,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('fiat');
  const [fiatStr, setFiatStr] = useState('');
  const [ftcStr, setFtcStr] = useState(microFtcToString(initialMicroFtc));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [activeFiat, setActiveFiat] = useState<FiatCurrency>(fiat ?? 'SEK');
  const initialised = useRef(false);

  // Initial preferred-fiat read + quote fetch. Re-runs on `fiat` prop
  // change so a parent can force the currency.
  useEffect(() => {
    void (async () => {
      const f = fiat ?? await getPreferredFiat();
      setActiveFiat(f);
      const q = await getDisplayQuote(f);
      setQuote(q);
      if (!q) {
        // No live rate → force FTC-only mode. The user can still
        // enter an FTC value; we just can't show a fiat companion.
        setMode('ftc');
      }
      initialised.current = true;
    })();
  }, [fiat]);

  // When the FTC value is edited, keep the fiat side derived so the
  // secondary label stays consistent. When the fiat value is edited,
  // the inverse. The mode flag dictates which is the source of truth.
  useEffect(() => {
    if (!initialised.current || mode !== 'fiat' || !quote) return;
    const micro = fiatToMicroFtc(fiatStr, quote);
    if (micro === null) {
      onChangeMicroFtc(0n);
      setFtcStr('');
      return;
    }
    setFtcStr(microFtcToString(micro));
    onChangeMicroFtc(micro);
  }, [fiatStr, quote, mode, onChangeMicroFtc]);

  useEffect(() => {
    if (!initialised.current || mode !== 'ftc') return;
    const micro = ftcToMicro(ftcStr);
    if (micro === null) {
      onChangeMicroFtc(0n);
      setFiatStr('');
      return;
    }
    onChangeMicroFtc(micro);
    if (quote) {
      const fiatVal = (Number(micro) / 1_000_000) * quote.fiatPerFtc;
      setFiatStr(fiatVal === 0 ? '' : fiatVal.toFixed(2));
    } else {
      setFiatStr('');
    }
  }, [ftcStr, quote, mode, onChangeMicroFtc]);

  function swap() {
    if (!quote) return; // Can't swap without a rate; collapsed UI.
    setMode(m => (m === 'fiat' ? 'ftc' : 'fiat'));
  }

  const rateAvailable = quote !== null;
  const primaryValue = mode === 'fiat' ? fiatStr : ftcStr;
  const setPrimary = mode === 'fiat' ? setFiatStr : setFtcStr;
  const primarySuffix = mode === 'fiat' ? activeFiat : 'FTC';

  const secondaryText = useMemo(() => {
    if (!rateAvailable) {
      return t('fx.rateUnavailable',
        'Rate unavailable — enter amount in FTC. Fiat display will return when the FutureChain oracle is live.');
    }
    if (mode === 'fiat') {
      return `= ${ftcStr || '0'} FTC`;
    }
    const display = fiatStr || '0.00';
    return `≈ ${display} ${activeFiat}`;
  }, [rateAvailable, mode, fiatStr, ftcStr, activeFiat, t]);

  return (
    <div className="rounded-xl p-4"
         style={{ backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)' }}>
      {label && (
        <label className="text-xs uppercase tracking-wider mb-1.5 block"
               style={{ color: 'var(--color-text-faint)' }}>
          {label}
        </label>
      )}

      <div className="flex items-baseline gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={primaryValue}
          onChange={(e) => setPrimary(e.target.value)}
          placeholder="0.00"
          className="flex-1 bg-transparent text-2xl font-bold mono outline-none"
          style={{ color: 'var(--color-text)' }}
        />
        <span className="text-xs uppercase tracking-wider shrink-0"
              style={{ color: 'var(--color-text-faint)' }}>
          {primarySuffix}
        </span>
        {rateAvailable && (
          <button type="button" onClick={swap}
                  className="p-1 rounded"
                  aria-label={t('fx.swap', 'Swap currency')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M7 16V6m0 0L4 9m3-3l3 3M17 8v10m0 0l3-3m-3 3l-3-3"
                    stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      <p className="text-xs mt-1.5"
         style={{ color: rateAvailable
                    ? 'var(--color-text-muted)'
                    : 'var(--color-warning, #C8881E)' }}>
        {secondaryText}
      </p>

      {rateAvailable && (
        <p className="text-[11px] mt-1"
           style={{ color: 'var(--color-text-faint)' }}>
          {t('fx.rateLabel', {
            rate: quote!.fiatPerFtc.toLocaleString('en-US', { maximumFractionDigits: 2 }),
            currency: activeFiat,
            at: formatTime(quote!.observedAt),
            source: quote!.source,
            defaultValue: 'Rate {{rate}} {{currency}}/FTC · {{at}} · {{source}}',
          })}
        </p>
      )}

      {helper && (
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          {helper}
        </p>
      )}
    </div>
  );
}
