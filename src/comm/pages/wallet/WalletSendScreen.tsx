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
 */
import { useMemo, useState } from 'react';
import { recordTx } from '../../services/transactions';

interface ParsedPayUri {
  ok: true;
  to: string;
  amountMicroFtc: bigint;
  ref: string | null;
  inv: string | null;
  expUnix: number | null;
}
interface ParseErr {
  ok: false;
  error: string;
}
type Parsed = ParsedPayUri | ParseErr;

interface Props {
  onBack: () => void;
  onSent: () => void;
}

export default function WalletSendScreen({ onBack, onSent }: Props) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<Parsed | null>(() => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return parsePayUri(trimmed);
  }, [input]);

  async function confirm() {
    if (!parsed || !parsed.ok) return;
    setSubmitting(true);
    setError(null);
    try {
      const ftc = Number(parsed.amountMicroFtc) / 1_000_000;
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
        txHash: null,
        jurisdictionAtTx: null,
        note: parsed.inv ? `Order ${parsed.inv} · ${ftc.toFixed(4)} FTC` : undefined,
      });
      onSent();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title="Send" onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Paste a merchant&apos;s <span className="font-mono text-[12px]">futurechain:pay</span> link,
          or a recipient&apos;s address.
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
                Amount
              </div>
              <div className="text-2xl font-semibold tabular-nums text-[var(--color-accent)]">
                {(Number(parsed.amountMicroFtc) / 1_000_000).toFixed(4)} FTC
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--color-accent-dim)]">
              <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
                To
              </div>
              <div className="mt-1 font-mono text-[12px] text-[var(--color-text)] break-all">
                {parsed.to}
              </div>
            </div>
            {parsed.inv && (
              <div className="mt-2 text-[11px] text-[var(--color-text-muted)] font-mono">
                Order {parsed.inv}
              </div>
            )}
          </div>
        )}

        {parsed && !parsed.ok && (
          <p className="mt-3 text-sm text-[var(--color-red)]">{parsed.error}</p>
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
          className="w-full py-4 rounded-xl font-bold text-base text-[var(--color-accent-fg)] bg-[var(--color-accent)] transition-opacity"
          style={{ opacity: (!parsed || !parsed.ok || submitting) ? 0.5 : 1 }}
        >
          {submitting ? 'Recording…' : 'Confirm & record'}
        </button>
        <p className="mt-2 text-center text-[11px] text-[var(--color-text-faint)]">
          v0: this records the tx for your ledger. Network broadcast
          lands with the FutureChain RPC client.
        </p>
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

/** Parse a `futurechain:pay?...` URI or a bare `fc_...` address. */
function parsePayUri(raw: string): Parsed {
  if (raw.startsWith('fc_')) {
    return { ok: false, error: 'Bare addresses need an amount. Paste a futurechain:pay link.' };
  }
  if (!raw.startsWith('futurechain:pay')) {
    return { ok: false, error: 'Not a futurechain:pay link.' };
  }
  let url: URL;
  try {
    // URL doesn't like custom schemes followed by `?` directly — rewrite
    // to a parseable form.
    url = new URL(raw.replace('futurechain:pay', 'https://x/pay'));
  } catch {
    return { ok: false, error: 'Could not parse the link.' };
  }
  const params = url.searchParams;
  const to = params.get('to');
  const amount = params.get('amount');
  if (!to || !to.startsWith('fc_')) {
    return { ok: false, error: 'Missing or invalid `to` address.' };
  }
  if (!amount) {
    return { ok: false, error: 'Missing `amount`.' };
  }
  let amountMicroFtc: bigint;
  try {
    amountMicroFtc = BigInt(amount);
    if (amountMicroFtc <= 0n) throw new Error('non-positive');
  } catch {
    return { ok: false, error: 'Amount must be a positive integer (micro-FTC).' };
  }
  const exp = params.get('exp');
  const expUnix = exp ? Number.parseInt(exp, 10) : null;
  if (expUnix && expUnix * 1000 < Date.now()) {
    return { ok: false, error: 'This payment link has expired.' };
  }
  return {
    ok: true,
    to,
    amountMicroFtc,
    ref: params.get('ref'),
    inv: params.get('inv'),
    expUnix,
  };
}
