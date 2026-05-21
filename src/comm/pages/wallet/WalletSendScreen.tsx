/**
 * WalletSendScreen — paste a futurechain:pay URI (from a merchant QR)
 * or another Comm wallet's address, confirm, record.
 *
 * v0 simplification: no in-app camera QR scanner. The Comm App's
 * Capacitor plugin manifest includes @capacitor-mlkit/barcode-scanning
 * but wiring the camera permission + UI is its own follow-up. For
 * Phase 0 the user can:
 *   - Tap a futurechain:pay link from another app (the wallet
 *     handles the custom-scheme intent — wired in a later step)
 *   - Long-press copy the merchant's QR text and paste it here
 *
 * On confirm we record an outbound `send` tx. The on-chain broadcast
 * lives behind the FutureChain RPC client which is also a follow-up —
 * until then "send" means "the user paid out-of-band; record it for
 * the tax ledger."
 *
 * Phase 1: when a valid pay URI is parsed, an ISO 20022 PACS.008 draft
 * is assembled from the saved payer identity + the wallet address +
 * the QR's creditor party. The draft is shown in a collapsible block
 * and snapshotted on the recorded tx.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { pacs008 } from '@futurechain/sdk';
import { recordTx, loadBehaviorProfile } from '../../services/transactions';
import { loadWallet } from '../../services/wallet';
import { loadPayerIdentity } from '../../services/payment-identity';
import { loadMoneyProfile } from '../../services/money-profile';
import { assembleDraft, type CreditorParty } from '../../services/pacs008-draft';
import { assessPayment, type FraudAssessment } from '../../services/fraud-engine';
import { sendOnChain } from '../../services/payment';

interface ParsedPayUri {
  ok: true;
  to: string;
  amountMicroFtc: bigint;
  ref: string | null;
  inv: string | null;
  expUnix: number | null;
  /** Optional ISO 20022 creditor party (QR `cn/cc/cct/cst/cpc`). */
  creditor: CreditorParty | null;
}
/** Parse errors carry an i18n key (not a literal string) so the
 *  parser stays pure and the component owns the translation. */
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
  onSent: () => void;
}

export default function WalletSendScreen({ onBack, onSent }: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<pacs008.Pacs008Draft | null>(null);
  const [isoOpen, setIsoOpen] = useState(false);
  const [assessment, setAssessment] = useState<FraudAssessment | null>(null);
  const [armed, setArmed] = useState(false);

  const parsed = useMemo<Parsed | null>(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return parsePayUri(trimmed);
  }, [input]);

  // Assemble the ISO 20022 PACS.008 draft whenever a valid pay URI is
  // parsed. Reads the saved payer identity (debtor) + wallet address.
  useEffect(() => {
    let cancelled = false;
    if (!parsed || !parsed.ok) {
      setDraft(null);
      return;
    }
    const uri = parsed;
    void (async () => {
      try {
        const [identity, wallet] = await Promise.all([
          loadPayerIdentity(),
          loadWallet(),
        ]);
        if (cancelled) return;
        if (!wallet) {
          setDraft(null);
          return;
        }
        setDraft(assembleDraft(identity, wallet.address, {
          to: uri.to,
          amountMicroFtc: uri.amountMicroFtc,
          ref: uri.ref,
          creditor: uri.creditor,
        }));
      } catch {
        if (!cancelled) setDraft(null);
      }
    })();
    return () => { cancelled = true; };
  }, [parsed]);

  // Light fraud-engine assessment whenever a valid pay URI is parsed.
  // Compares the pending payment against the self-declared money
  // profile + the derived behaviour profile. Advisory only — it never
  // blocks a send, it just surfaces signals and (on a warning) asks
  // for a deliberate second tap.
  useEffect(() => {
    let cancelled = false;
    if (!parsed || !parsed.ok) {
      setAssessment(null);
      setArmed(false);
      return;
    }
    const uri = parsed;
    setArmed(false);
    void (async () => {
      try {
        const [money, behavior] = await Promise.all([
          loadMoneyProfile(),
          loadBehaviorProfile(),
        ]);
        if (cancelled) return;
        setAssessment(assessPayment(
          {
            amountMicroFtc: uri.amountMicroFtc,
            counterparty: uri.to,
            purpose: '', // Comm wallet txs carry no ADR-004 purpose
            expUnixSeconds: uri.expUnix ?? 0,
            now: Date.now(),
          },
          money,
          behavior,
        ));
      } catch {
        if (!cancelled) setAssessment(null);
      }
    })();
    return () => { cancelled = true; };
  }, [parsed]);

  async function confirm() {
    if (!parsed || !parsed.ok) return;
    // A 'warning'-level assessment takes a deliberate second tap — the
    // engine is advisory, never a hard block.
    if (assessment?.level === 'warning' && !armed) {
      setArmed(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ftc = Number(parsed.amountMicroFtc) / 1_000_000;

      // Phase G2 (May 21 2026): broadcast on-chain via the Bahnhof
      // public RPC hub. Biometric gate fires inside sendOnChain. On
      // success we have the real tx id; the tax ledger row is then
      // written with that id (replaces the prior `txHash: null`
      // local-only behaviour).
      const sent = await sendOnChain({
        to: parsed.to,
        amountMicroFtc: parsed.amountMicroFtc,
        remittanceText: parsed.ref ?? null,
        creditor: parsed.creditor
          ? { name: parsed.creditor.name, countryOfResidence: parsed.creditor.country }
          : null,
      });

      // Until the rate oracle lands, fiat value is left as 0 so the
      // tax engine sees the gap. The annual report flow will prompt
      // the user to fill missing fiat values.
      await recordTx({
        kind: 'send',
        counterparty: parsed.to,
        amountMicroFtc: parsed.amountMicroFtc.toString(),
        fiatValueAtTx: 0,
        fiatCurrency: 'SEK',
        ref: parsed.ref,
        txHash: sent.txId,
        jurisdictionAtTx: null,
        note: parsed.inv ? `Order ${parsed.inv} · ${ftc.toFixed(4)} FTC` : undefined,
        pacs008: draft ?? undefined,
        risk: assessment ?? undefined,
      });
      onSent();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title={t('wallet.sendTitle')} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          {t('wallet.sendHelp')}
        </p>

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
              <div className="mt-1 font-mono text-[12px] text-[var(--color-text)] break-all">
                {parsed.to}
              </div>
            </div>
            {parsed.inv && (
              <div className="mt-2 text-[11px] text-[var(--color-text-muted)] font-mono">
                {t('wallet.order', { id: parsed.inv })}
              </div>
            )}
          </div>
        )}

        {parsed && parsed.ok && draft && (
          <div className="mt-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsoOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-[var(--color-surface-muted)]"
              aria-expanded={isoOpen}
            >
              <span className="text-[13px] font-medium text-[var(--color-text)]">
                {t('wallet.iso.title')}
              </span>
              <span className="text-xs text-[var(--color-accent)]">
                {isoOpen ? t('common.close') : t('common.show')}
              </span>
            </button>
            {isoOpen && (
              <div className="px-4 pb-4 -mt-1">
                <IsoParty label={t('wallet.iso.debtor')} party={draft.debtor} />
                <IsoParty label={t('wallet.iso.creditor')} party={draft.creditor} />
                <IsoRow label={t('wallet.iso.purpose')} value={draft.purpose} mono />
                <IsoRow label={t('wallet.iso.reference')} value={draft.reference} mono />
                <p className="mt-3 text-[11px] text-[var(--color-text-faint)] leading-snug">
                  {t('wallet.iso.note')}
                </p>
              </div>
            )}
          </div>
        )}

        {parsed && parsed.ok && assessment && assessment.signals.length > 0 && (() => {
          const top = assessment.signals.some((s) => s.severity === 'warning') ? 'warning'
            : assessment.signals.some((s) => s.severity === 'caution') ? 'caution'
            : 'info';
          const tone = {
            warning: { bg: 'var(--color-red-dim)', line: 'var(--color-red)', fg: 'var(--color-red)' },
            caution: { bg: 'var(--color-gold-dim)', line: 'var(--color-gold)', fg: 'var(--color-gold)' },
            info:    { bg: 'var(--color-accent-soft)', line: 'var(--color-accent-dim)', fg: 'var(--color-text)' },
          }[top];
          return (
            <div className="mt-3 rounded-xl p-4"
                 style={{ backgroundColor: tone.bg, border: `1px solid ${tone.line}` }}>
              <div className="text-sm font-bold mb-2" style={{ color: tone.fg }}>
                {t(`fraud.title.${top}`)}
              </div>
              <div className="flex flex-col gap-1.5">
                {assessment.signals.map((s) => (
                  <div key={s.id} className="flex gap-2 items-start">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor:
                            s.severity === 'warning' ? 'var(--color-red)'
                            : s.severity === 'caution' ? 'var(--color-gold)'
                            : 'var(--color-text-faint)' }} />
                    <span className="text-sm text-[var(--color-text)]">
                      {t(s.messageKey, s.params)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {parsed && !parsed.ok && (
          <p className="mt-3 text-sm text-[var(--color-red)]">
            {t(`wallet.sendErr.${parsed.errorKey}`)}
          </p>
        )}

        {error && (
          <p className="mt-3 text-sm text-[var(--color-red)]">{error}</p>
        )}
      </div>

      <div className="px-5 pb-5">
        <button
          type="button"
          disabled={!parsed || !parsed.ok || submitting}
          onClick={confirm}
          className="w-full py-4 rounded-xl font-bold text-base text-[var(--color-accent-fg)] transition-opacity"
          style={{
            opacity: (!parsed || !parsed.ok || submitting) ? 0.5 : 1,
            backgroundColor: armed ? 'var(--color-error)' : 'var(--color-accent)',
          }}
        >
          {submitting ? t('wallet.recording')
            : armed ? t('fraud.payAnyway')
            : t('wallet.confirmRecord')}
        </button>
        {armed ? (
          <p className="mt-2 text-center text-[11px] text-[var(--color-red)]">
            {t('fraud.payAnywayHint')}
          </p>
        ) : (
          <p className="mt-2 text-center text-[11px] text-[var(--color-text-faint)]">
            {t('wallet.sendV0Note')}
          </p>
        )}
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

/** A single label/value row inside the ISO 20022 block. */
function IsoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className={`mt-0.5 text-[12px] text-[var(--color-text)] break-all${mono ? ' font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}

/** Render a PACS.008 party — name plus any address lines present. */
function IsoParty({ label, party }: {
  label: string;
  party: { name: string; address: string; country: string; city?: string; street?: string; postcode?: string };
}) {
  const addressLine = [party.street, party.postcode, party.city]
    .filter((p) => p && p.trim().length > 0)
    .join(', ');
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className="mt-0.5 text-[12px] text-[var(--color-text)]">{party.name}</div>
      {addressLine && (
        <div className="text-[11px] text-[var(--color-text-muted)]">{addressLine}</div>
      )}
      <div className="text-[11px] text-[var(--color-text-muted)]">{party.country}</div>
      <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-faint)] break-all">
        {party.address}
      </div>
    </div>
  );
}

/** Parse a `futurechain:pay?...` URI or a bare `fc_...` address.
 *  Pure — returns an i18n error KEY, not a translated string. */
function parsePayUri(raw: string): Parsed {
  if (raw.startsWith('fc_')) {
    return { ok: false, errorKey: 'bareAddress' };
  }
  if (!raw.startsWith('futurechain:pay')) {
    return { ok: false, errorKey: 'notPayLink' };
  }
  let url: URL;
  try {
    // URL doesn't like custom schemes followed by `?` directly — rewrite
    // to a parseable form.
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
  // Optional ISO 20022 creditor party (cn/cc/cct/cst/cpc). Present only
  // on QRs from a creditor-aware merchant app; absent on older QRs.
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
    ok: true,
    to,
    amountMicroFtc,
    ref: params.get('ref'),
    inv: params.get('inv'),
    expUnix,
    creditor,
  };
}
