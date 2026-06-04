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
import ManualPayForm from './ManualPayForm';
import { renderAddressSegments } from '../../services/address-book';
import type { Recipient } from '../../services/recipients';
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
  /** Optional schedule id (`sched`) — present when this URI was
   *  synthesized from a scheduled-payment reminder. The review step
   *  calls recordFire(sched) on a successful send to roll the schedule
   *  forward to its next window. */
  sched: string | null;
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
  /** Open the camera scanner. */
  onScan: () => void;
  /** #93 — a recipient chosen from the Send picker. When set, the screen shows
   *  a locked recipient card + a pre-filled form (address hidden); the scan
   *  button + paste tab are suppressed. Null/undefined = the open compose. */
  recipient?: Recipient | null;
}

export default function WalletSendScreen({ onBack, onReview, onScan, recipient }: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  /** Structured form (default — type a complete payment) vs paste a link. */
  const [manualSub, setManualSub] = useState<'form' | 'paste'>('form');

  const parsed = useMemo<Parsed | null>(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return parsePayUri(trimmed);
  }, [input]);

  /** A complete URI assembled by the manual form → parse + go to review. */
  function handleManualUri(uri: string) {
    const p = parsePayUri(uri);
    if (p.ok) onReview(p);
  }

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title={t('wallet.sendTitle')} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        {/* #93 — chosen recipient: locked card + pre-filled form, no scan/paste. */}
        {recipient ? (
          <>
            <LockedRecipientCard recipient={recipient} />
            <ManualPayForm
              onSubmit={handleManualUri}
              lockRecipient
              initial={{
                address: recipient.address,
                // Only seed a REAL name — never the abbreviated-address
                // fallback, which would otherwise ship as the PACS.008 cn.
                name: recipient.nameIsReal ? recipient.name : undefined,
                country: recipient.country,
                city: recipient.city,
                street: recipient.street,
                postcode: recipient.postcode,
              }}
            />
          </>
        ) : (<>
        <button type="button" onClick={onScan}
                className="w-full mb-3 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M4 12h16"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('scan.title', 'Scan to pay')}
        </button>

        {/* Structured form (default — type a complete payment) vs paste a link. */}
        <div className="flex gap-2 mb-4 p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
          {(['form', 'paste'] as const).map((sub) => (
            <button key={sub} type="button" onClick={() => setManualSub(sub)}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: manualSub === sub ? 'var(--color-accent)' : 'transparent',
                             color: manualSub === sub ? 'var(--color-accent-fg)' : 'var(--color-text-body)' }}>
              {sub === 'form' ? t('manualPay.tabForm', 'Enter details') : t('manualPay.tabPaste', 'Paste link')}
            </button>
          ))}
        </div>

        {manualSub === 'form' ? (
          <ManualPayForm onSubmit={handleManualUri} />
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-muted)] mb-3">{t('wallet.sendHelp')}</p>
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
                  <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">{t('wallet.amount')}</div>
                  <div className="text-2xl font-semibold tabular-nums text-[var(--color-accent)]">
                    {(Number(parsed.amountMicroFtc) / 1_000_000).toFixed(4)} FTC
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--color-accent-dim)]">
                  <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">{t('wallet.to')}</div>
                  <div className="mt-1 font-mono text-[12px] text-[var(--color-text)] break-all">{parsed.to}</div>
                </div>
                {parsed.inv && (
                  <div className="mt-2 text-[11px] text-[var(--color-text-muted)] font-mono">{t('wallet.order', { id: parsed.inv })}</div>
                )}
              </div>
            )}
            {parsed && !parsed.ok && (
              <p className="mt-3 text-sm text-[var(--color-red)]">{t(`wallet.sendErr.${parsed.errorKey}`)}</p>
            )}
            <div className="mt-4">
              <PrimaryButton onClick={() => { if (parsed && parsed.ok) onReview(parsed); }}
                             disabled={!parsed || !parsed.ok}>
                {t('wallet.reviewContinue', 'Continue to review')}
              </PrimaryButton>
            </div>
          </>
        )}
        </>)}
      </div>
    </section>
  );
}

/** #93 — "Paying" card shown when a recipient was chosen from the picker. The
 *  address is rendered read-only + segmented (the editable field is hidden). */
function LockedRecipientCard({ recipient }: { recipient: Recipient }) {
  const { t } = useTranslation();
  const segments = renderAddressSegments(recipient.address);
  return (
    <div className="rounded-2xl p-4 mb-5"
         style={{ backgroundColor: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-dim)' }}>
      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-faint)' }}>
        {t('send.payingLabel', 'Paying')}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-sm font-bold"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
          {(recipient.name.trim()[0] || '?').toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="font-bold truncate" style={{ color: 'var(--color-text)' }}>{recipient.name}</div>
          {recipient.starred && <span className="text-xs" style={{ color: 'var(--color-accent)' }}>★</span>}
        </div>
      </div>
      <div className="font-mono text-xs mt-2 break-all">
        {segments.map((seg, i) => (
          <span key={i} style={{ color: seg.secure ? 'var(--color-text-body)' : 'var(--color-text-faint)' }}>
            {seg.text}{i < segments.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </div>
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
  return {
    ok: true, to, amountMicroFtc, ref: params.get('ref'), inv: params.get('inv'),
    expUnix, creditor, sched: params.get('sched'),
  };
}
