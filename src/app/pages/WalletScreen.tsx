/**
 * WalletScreen — FutureChain wallet (Evolution light theme).
 *
 * May-3 IRE pass: full migration off legacy adv-* dark classes,
 * standardized hierarchy, light tokens for status colors.
 */

import { useState, useEffect } from 'react';
import { getOrgWallet } from '../services/api';
import { Ico, Pill, SectionLabel, Spinner } from '../components/ui';

interface Props { orgId: string; }

interface Wallet { id: string; name: string; wallet_type: string; address: string; balance_ftc: number | string; }
interface Transaction { id: string; amount_ftc: number | string; status: string; description: string; created_at: string; recipient_address: string; }

function statusTone(s: string): 'green' | 'red' | 'gold' | 'neutral' {
  if (s === 'confirmed') return 'green';
  if (s === 'failed')    return 'red';
  if (s === 'pending')   return 'gold';
  return 'neutral';
}

/** Postgres NUMERIC fields ride the wire as strings; coerce + format. */
function formatFtc(v: number | string | null | undefined): string {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

export default function WalletScreen({ orgId }: Props) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOrgWallet(orgId, 20)
      .then(data => {
        if (cancelled) return;
        setWallets((data.wallets ?? []) as unknown as Wallet[]);
        setTransactions((data.transactions ?? []) as unknown as Transaction[]);
        setError(null);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load wallet'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  const totalBalance = wallets.reduce((sum, w) => {
    const n = typeof w.balance_ftc === 'number' ? w.balance_ftc : Number(w.balance_ftc);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-5">
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            Wallet
          </h1>

          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-r2)] px-3 py-2 text-[12px]"
              style={{
                background: 'var(--color-red-dim)',
                color: 'var(--color-red)',
                border: '1px solid var(--color-red)',
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              {/* Balance card */}
              <div
                className="rounded-[var(--radius-r3)] px-5 py-6 text-center"
                style={{
                  background: 'var(--color-accent-soft)',
                  border: '1px solid var(--color-accent-dim)',
                }}
              >
                <p
                  className="mb-2 font-mono text-[10px] font-semibold uppercase"
                  style={{ color: 'var(--color-accent-dark)', letterSpacing: '0.6px' }}
                >
                  Total Balance
                </p>
                <p
                  style={{
                    fontSize: 32, fontWeight: 700,
                    color: 'var(--color-accent)',
                    letterSpacing: '-0.6px',
                    lineHeight: 1.05,
                  }}
                >
                  {formatFtc(totalBalance)}
                  <span style={{ fontSize: 16, marginLeft: 6, fontWeight: 600 }}>FTC</span>
                </p>
                {wallets.length > 0 && wallets[0].address && (
                  <p
                    className="mt-2 truncate font-mono text-[10px]"
                    style={{ color: 'var(--color-accent-dark)', opacity: 0.75 }}
                  >
                    {wallets[0].address.slice(0, 24)}…
                  </p>
                )}
              </div>

              {/* Wallets */}
              {wallets.length > 0 && (
                <section>
                  <SectionLabel className="mb-2.5">Wallets</SectionLabel>
                  <div
                    className="overflow-hidden rounded-[var(--radius-r2)]"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {wallets.map((w, i) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between px-3.5 py-3"
                        style={{
                          borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                        }}
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span
                            className="text-[14px] font-semibold"
                            style={{ color: 'var(--color-text)' }}
                          >
                            {w.name}
                          </span>
                          <Pill tone="neutral" mono>{w.wallet_type.toUpperCase()}</Pill>
                        </div>
                        <span
                          className="text-[14px] font-bold"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          {formatFtc(w.balance_ftc)} FTC
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {wallets.length === 0 && (
                <div
                  className="flex flex-col items-center rounded-[var(--radius-r2)] py-8"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px dashed var(--color-border)',
                  }}
                >
                  <span
                    className="mb-3 inline-flex"
                    style={{ color: 'var(--color-text-faint)' }}
                  >
                    <Ico name="wallet" size={28} />
                  </span>
                  <p className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                    No wallet yet
                  </p>
                  <p className="mt-1 max-w-[260px] text-center text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                    Set up a wallet in your ANTON instance under FutureChain settings.
                  </p>
                </div>
              )}

              {/* Transactions */}
              <section>
                <SectionLabel className="mb-2.5">Recent Transactions</SectionLabel>
                {transactions.length === 0 ? (
                  <div
                    className="rounded-[var(--radius-r2)] py-6 text-center"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                      No transactions yet
                    </p>
                  </div>
                ) : (
                  <div
                    className="overflow-hidden rounded-[var(--radius-r2)]"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {transactions.map((tx, i) => {
                      const amt = typeof tx.amount_ftc === 'number' ? tx.amount_ftc : Number(tx.amount_ftc);
                      const negative = Number.isFinite(amt) && amt < 0;
                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between px-3.5 py-3"
                          style={{
                            borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-[13.5px] font-semibold"
                              style={{ color: 'var(--color-text)' }}
                            >
                              {tx.description || 'Transaction'}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                                {new Date(tx.created_at).toLocaleDateString()}
                              </span>
                              <Pill tone={statusTone(tx.status)} mono>
                                {tx.status.toUpperCase()}
                              </Pill>
                            </div>
                          </div>
                          <span
                            className="text-[13.5px] font-bold"
                            style={{
                              color: negative ? 'var(--color-red)' : 'var(--color-green)',
                            }}
                          >
                            {negative ? '' : '+'}{formatFtc(tx.amount_ftc)} FTC
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* About */}
              <div
                className="rounded-[var(--radius-r2)] px-4 py-3.5"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <h3
                  className="mb-1.5 text-[12px] font-semibold"
                  style={{ color: 'var(--color-text)' }}
                >
                  About FutureChain
                </h3>
                <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                  FutureChain (FTC) is ANTON's payment network for AI services. Premium queries,
                  marketplace purchases, and delegated tasks are settled in FTC. Your organisation may
                  provide a monthly FTC allowance.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
