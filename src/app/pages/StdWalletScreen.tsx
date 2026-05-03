/**
 * StdWalletScreen — Standard mode "Money" (Evolution design).
 *
 * Per design/screens-standard.jsx StdWalletScreen:
 *   • "Money · Your FutureChain account" (no 0xA7…c91 hashes)
 *   • 44px balance number on accent-coloured card
 *   • Big Send / Receive 2x1 grid (stacked icons + labels)
 *   • Recent list — 44px circular icons (in/out arrows), 16px who,
 *     14px sub, 17px amount on the right (green for in, ink for out)
 *
 * v1: no real wallet endpoint exists yet for the companion. We render
 * an honest empty state (with the design layout intact) so the screen
 * is visually complete; a follow-up phase wires a real wallet provider.
 */

import { useEffect, useState } from 'react';
import { Ico, Spinner, ErrorPill } from '../components/ui';
import { getOrgWallet } from '../services/api';

interface Props {
  orgId: string;
  onBack: () => void;
}

interface RecentRow {
  who: string;
  sub: string;
  amt: string;
  t: string;
  isIn: boolean;
}

interface WalletApi { balance_ftc?: number | string }
interface TxApi {
  id: string;
  amount_ftc?: number | string;
  direction?: 'in' | 'out';
  counterparty?: string | null;
  memo?: string | null;
  created_at?: string;
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function formatAmt(raw: number | string | undefined, isIn: boolean): string {
  if (raw == null) return '—';
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return '—';
  return `${isIn ? '+' : '−'}€${Math.abs(n).toFixed(2)}`;
}

export default function StdWalletScreen({ orgId, onBack }: Props): JSX.Element {
  // F24: wire to real /api/app/org/:orgId/wallet adapter (added in B5).
  const [balance, setBalance] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrgWallet(orgId, 12)
      .then(data => {
        if (cancelled) return;
        const wallets = (data.wallets ?? []) as unknown as WalletApi[];
        const txs = (data.transactions ?? []) as unknown as TxApi[];
        const totalRaw = wallets.reduce((sum, w) => {
          const n = typeof w.balance_ftc === 'number' ? w.balance_ftc : Number(w.balance_ftc ?? 0);
          return Number.isFinite(n) ? sum + n : sum;
        }, 0);
        setBalance(`€${totalRaw.toFixed(2)}`);
        setRecent(
          txs.map(t => {
            const isIn = t.direction !== 'out';
            return {
              who: t.counterparty || (isIn ? 'Incoming' : 'Outgoing'),
              sub: t.memo || (isIn ? 'Received' : 'Sent'),
              amt: formatAmt(t.amount_ftc, isIn),
              t: relativeTime(t.created_at),
              isIn,
            };
          })
        );
      })
      .catch(() => { if (!cancelled) setError('Couldn\'t reach your wallet.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-start gap-3 px-[18px] py-3"
        style={{ background: 'var(--color-bg)' }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="-ml-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center"
        >
          <Ico name="chevronLeft" color="var(--color-text)" size={26} />
        </button>
        <div className="flex-1">
          <div
            className="text-[var(--color-text)]"
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.1 }}
          >
            Money
          </div>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">
            Your FutureChain account
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
        {error && (
          <div className="mb-3">
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          </div>
        )}

        {/* Balance card */}
        <div
          className="mb-4 rounded-[var(--radius-r3)] p-5 text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          <div className="text-sm opacity-90">Available balance</div>
          <div
            className="leading-none"
            style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-1.5px', marginTop: 6 }}
          >
            {balance ?? '€—'}
          </div>
          <div className="mt-1 text-[13px] opacity-85">FutureChain · euro</div>
        </div>

        {/* Send / Receive */}
        <div className="mb-6 flex gap-2.5">
          <button
            disabled={balance === null}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-[var(--radius-r2)] py-4 disabled:opacity-50"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontSize: 16, fontWeight: 700, color: 'var(--color-text)',
            }}
          >
            <Ico name="arrowUp" color="var(--color-text)" size={22} />
            Send
          </button>
          <button
            disabled={balance === null}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-[var(--radius-r2)] py-4 disabled:opacity-50"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontSize: 16, fontWeight: 700, color: 'var(--color-text)',
            }}
          >
            <Ico name="qr" color="var(--color-text)" size={22} />
            Receive
          </button>
        </div>

        {/* Recent */}
        <div
          className="mb-2.5 font-bold uppercase text-[var(--color-text-muted)]"
          style={{ fontSize: 13, letterSpacing: '0.4px' }}
        >
          Recent
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : recent.length === 0 ? (
          <div
            className="rounded-[var(--radius-r3)] p-4 text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div
              className="text-[var(--color-text)]"
              style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px' }}
            >
              No money activity yet.
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Recent transactions will appear here as you use your FutureChain account.
            </p>
          </div>
        ) : (
          recent.map((r, i) => (
            <div
              key={`${r.who}-${i}`}
              className="flex items-center gap-3.5 px-1 py-3.5"
              style={{
                borderBottom: i < recent.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
              }}
            >
              <div
                className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: r.isIn ? 'var(--color-green-dim)' : 'var(--color-surface-alt)',
                  color: r.isIn ? 'var(--color-green)' : 'var(--color-text)',
                }}
                aria-hidden="true"
              >
                <Ico name={r.isIn ? 'arrowUp' : 'arrowUp'} size={20} color="currentColor" />
              </div>
              <div className="flex-1">
                <div className="text-[16px] font-semibold text-[var(--color-text)]">{r.who}</div>
                <div className="text-[13px] text-[var(--color-text-muted)]">{r.sub} · {r.t}</div>
              </div>
              <div
                className="font-bold"
                style={{
                  fontSize: 17,
                  letterSpacing: '-0.2px',
                  color: r.isIn ? 'var(--color-green)' : 'var(--color-text)',
                }}
              >
                {r.amt}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
