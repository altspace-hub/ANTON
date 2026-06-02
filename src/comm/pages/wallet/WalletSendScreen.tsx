/**
 * WalletSendScreen — compose step of the send flow (#79 wallet parity).
 *
 * Paste a futurechain:pay URI (from a merchant QR) or another wallet's address,
 * preview the amount + recipient, then continue to WalletReviewScreen which
 * shows the fee + total, runs the gates, and signs. (Before #79 this screen also
 * did the review + confirm; that moved to WalletReviewScreen so the flow mirrors
 * Pay's Scan → Review → sign.)
 *
 * The camera QR scanner lands in Phase 6; for now paste a futurechain:pay link or
 * long-press-copy the merchant's QR text.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import type { CreditorParty } from '../../services/pacs008-draft';

export interface ParsedPayUri {
  ok: true;
  to: string;
  amountMicroFtc: bigint;
  ref: string | null;
  inv: string | null;
  expUnix: number | null;
  /** Optional ISO 20022 creditor party (QR `cn/cc/cct/cst/cpc`). */
  creditor: CreditorParty | null;
}
/** Parse errors carry an i18n key (not a literal string) so the parser stays
 *  pure and the component owns the translation. */
type ParseErrorKey =
  | 'bareAddress' | 'notPayLink' | 'parseFailed'
  | 'missingTo' | 'missingAmount' | 'badAmount' | 'expired';
interface ParseErr {
  ok: false;
  errorKey: ParseErrorKey;
}
type Parsed = ParsedPayUri | ParseErr;

interface Props {
  onBack: () => void;
  /** Advance to the review step with the parsed, valid pay URI. */
  onReview: (parsed: ParsedPayUri) => void;
}

export default function WalletSendScreen({ onBack, onReview }: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');

  const parsed = useMemo<Parsed | null>(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return parsePayUri(trimmed);
  }, [input]);

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title={t('wallet.sendTitle')} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        <p className="text-sm text-[var(--color-text-muted)] mb-4">{t('wallet.sendHelp')}</p>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder="futurechain:pay?to=fc_...&amount=...&ref=..."
          className="w-full p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] font-mono text-[12px] text-[var(--color-text)] resize-none"
          spellCheck={false}
          autoCapitalize="off"
        />

        {parsed && parsed.ok && (
          <div className="mt-4 p-4 rounded-xl bg-[var(--color-accent-soft)] border border-[var(--color-accent-dim)]">
            <div className="flex justify-between items-baseline">
              <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
                {t('wallet.amount')}
              </div>
              <div className="text-2xl font-semibold tabular-nums text-[var(--color-accent)]">
                {(Number(parsed.amountMicroFtc) / 1_000_000).toFixed(4)} FTC
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--color-accent-dim)]">
              <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
                {t('wallet.to')}
              </div>
              <div className="mt-1 font-mono text-[12px] text-[var(--color-text)] break-all">{parsed.to}</div>
            </div>
            {parsed.inv && (
              <div className="mt-2 text-[11px] text-[var(--color-text-muted)] font-mono">
                {t('wallet.order', { id: parsed.inv })}
              </div>
            )}
          </div>
        )}

        {parsed && !parsed.ok && (
          <p className="mt-3 text-sm text-[var(--color-red)]">{t(`wallet.sendErr.${parsed.errorKey}`)}</p>
        )}
      </div>

      <div className="px-5 pb-5">
        <PrimaryButton onClick={() => { if (parsed && parsed.ok) onReview(parsed); }}
                       disabled={!parsed || !parsed.ok}>
          {t('wallet.reviewContinue', 'Continue to review')}
        </PrimaryButton>
      </div>
    </section>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-3">
      <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label="Back"
              style={{ color: 'var(--color-text-muted)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 className="text-lg font-bold text-[var(--color-text)]">{title}</h2>
    </div>
  );
}

/** Parse a `futurechain:pay?...` URI or a bare `fc_...` address.
 *  Pure — returns an i18n error KEY, not a translated string. */
export function parsePayUri(raw: string): Parsed {
  if (raw.startsWith('fc_')) {
    return { ok: false, errorKey: 'bareAddress' };
  }
  if (!raw.startsWith('futurechain:pay')) {
    return { ok: false, errorKey: 'notPayLink' };
  }
  let url: URL;
  try {
    url = new URL(raw.replace('futurechain:pay', 'https://x/pay'));
  } catch {
    return { ok: false, errorKey: 'parseFailed' };
  }
  const params = url.searchParams;
  const to = params.get('to');
  const amount = params.get('amount');
  if (!to || !to.startsWith('fc_')) {
    return { ok: false, errorKey: 'missingTo' };
  }
  if (!amount) {
    return { ok: false, errorKey: 'missingAmount' };
  }
  let amountMicroFtc: bigint;
  try {
    amountMicroFtc = BigInt(amount);
    if (amountMicroFtc <= 0n) throw new Error('non-positive');
  } catch {
    return { ok: false, errorKey: 'badAmount' };
  }
  const exp = params.get('exp');
  const expUnix = exp ? Number.parseInt(exp, 10) : null;
  if (expUnix && expUnix * 1000 < Date.now()) {
    return { ok: false, errorKey: 'expired' };
  }
  // Optional ISO 20022 creditor party (cn/cc/cct/cst/cpc).
  let creditor: CreditorParty | null = null;
  const cn = params.get('cn');
  if (cn) {
    creditor = {
      name: cn,
      country: params.get('cc') ?? 'SE',
      city: params.get('cct') ?? undefined,
      street: params.get('cst') ?? undefined,
      postcode: params.get('cpc') ?? undefined,
    };
  }
  return { ok: true, to, amountMicroFtc, ref: params.get('ref'), inv: params.get('inv'), expUnix, creditor };
}
