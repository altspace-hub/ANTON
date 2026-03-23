/**
 * WalletScreen — FutureChain wallet balance, transactions, budget status.
 * Connects to existing fc_ API endpoints.
 */

import { useState, useEffect } from 'react';
import { getAuthHeader } from '../services/api';

interface Props { orgId: string; }

interface Wallet { id: string; name: string; wallet_type: string; address: string; balance_ftc: number; }
interface Transaction { id: string; amount_ftc: number; status: string; description: string; created_at: string; recipient_address: string; }

export default function WalletScreen({ orgId }: Props) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/futurechain/wallets', { headers: getAuthHeader() })
        .then(r => r.ok ? r.json() : [])
        .then(d => setWallets(Array.isArray(d) ? d : d.wallets || [])),
      fetch('/api/futurechain/transactions?limit=20', { headers: getAuthHeader() })
        .then(r => r.ok ? r.json() : [])
        .then(d => setTransactions(Array.isArray(d) ? d : d.transactions || [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  const totalBalance = wallets.reduce((sum, w) => sum + (Number(w.balance_ftc) || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
        <h1 className="text-lg font-bold text-adv-off-white">Wallet</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Balance card */}
            <div className="rounded-2xl border border-adv-teal/20 bg-gradient-to-br from-adv-teal/10 to-adv-teal/5 p-6 text-center">
              <p className="text-xs uppercase tracking-wider text-adv-gray mb-2">Total Balance</p>
              <p className="text-3xl font-bold text-adv-teal">{totalBalance.toFixed(2)} <span className="text-lg">FTC</span></p>
              {wallets.length > 0 && (
                <p className="mt-2 text-[10px] text-adv-gray font-mono">{wallets[0].address?.slice(0, 20)}...</p>
              )}
            </div>

            {/* Wallets */}
            {wallets.length > 0 && (
              <div>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">Wallets</h2>
                <div className="space-y-2">
                  {wallets.map(w => (
                    <div key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-adv-card px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-adv-off-white">{w.name}</span>
                        <span className="ml-2 rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray">{w.wallet_type}</span>
                      </div>
                      <span className="text-sm font-bold text-adv-teal">{Number(w.balance_ftc).toFixed(2)} FTC</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wallets.length === 0 && (
              <div className="text-center py-8 rounded-xl border border-dashed border-border bg-adv-card/30">
                <span className="text-3xl mb-3 block">💰</span>
                <p className="text-sm text-adv-off-white">No wallet yet</p>
                <p className="text-xs text-adv-gray mt-1">Set up a wallet in ANTON main under FutureChain settings</p>
              </div>
            )}

            {/* Recent transactions */}
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">Recent Transactions</h2>
              {transactions.length === 0 ? (
                <p className="text-center py-8 text-xs text-adv-gray">No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between rounded-xl border border-border bg-adv-card px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-adv-off-white">{tx.description || 'Transaction'}</p>
                        <p className="text-[10px] text-adv-gray">
                          {new Date(tx.created_at).toLocaleDateString()} &middot;
                          <span className={`ml-1 ${
                            tx.status === 'confirmed' ? 'text-adv-green' :
                            tx.status === 'failed' ? 'text-adv-red' :
                            'text-adv-gold'
                          }`}>{tx.status}</span>
                        </p>
                      </div>
                      <span className={`text-sm font-bold ${Number(tx.amount_ftc) < 0 ? 'text-adv-red' : 'text-adv-green'}`}>
                        {Number(tx.amount_ftc) >= 0 ? '+' : ''}{Number(tx.amount_ftc).toFixed(2)} FTC
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Budget info */}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <h3 className="text-xs font-semibold text-adv-off-white mb-2">About FutureChain</h3>
              <p className="text-[11px] text-adv-gray leading-relaxed">
                FutureChain (FTC) is ANTON's payment network for AI services. Premium queries, marketplace purchases,
                and delegated tasks are settled in FTC. Your organisation may provide a monthly FTC allowance for queries.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
