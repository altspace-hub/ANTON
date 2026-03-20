import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, CreditCard, ShoppingBag, Shield, Settings, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface FCStatus {
  connected: boolean;
  stubMode: boolean;
  nodeVersion: string | null;
  chainHeight: number | null;
}

export default function FCDashboardPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<FCStatus | null>(null);
  const [wallets, setWallets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [budget, setBudget] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, walletsRes, txRes, budgetRes, servicesRes] = await Promise.all([
        fetchWithAuth('/api/futurechain/status'),
        fetchWithAuth('/api/futurechain/wallets'),
        fetchWithAuth('/api/futurechain/transactions?limit=5'),
        fetchWithAuth('/api/futurechain/budget/state'),
        fetchWithAuth('/api/futurechain/marketplace/services'),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (walletsRes.ok) setWallets(await walletsRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      if (budgetRes.ok) setBudget(await budgetRes.json());
      if (servicesRes.ok) setServices(await servicesRes.json());
    } catch (err) { console.error('[FC] Dashboard error:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreateWallet = async (type: 'human' | 'agent') => {
    const name = type === 'human' ? 'My Wallet' : 'ANTON Agent';
    await fetchWithAuth(`/api/futurechain/wallets/${type}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    fetchAll();
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
            <Wallet className="h-6 w-6 text-adv-teal" /> FutureChain Payments
          </h1>
          <p className="text-sm text-adv-gray mt-0.5">Decentralised payment rails for the ANTON economy</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${status?.connected ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gold/10 text-adv-gold'}`}>
            <div className={`h-2 w-2 rounded-full ${status?.connected ? 'bg-adv-green' : 'bg-adv-gold'}`} />
            {status?.connected ? `Connected — v${status.nodeVersion}` : 'Demo Mode (No Node)'}
          </div>
          <button onClick={fetchAll} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Demo Mode Banner */}
      {status?.stubMode && (
        <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/5 px-4 py-3 text-sm text-adv-gold">
          Running in demo mode — all transactions are simulated. Connect a FutureChain node to go live.
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="flex items-center gap-2 text-adv-gray text-xs mb-2"><Wallet className="h-4 w-4" /> Wallets</div>
          <div className="text-2xl font-bold text-adv-off-white">{wallets.length}</div>
          <div className="text-xs text-adv-gray mt-1">{wallets.filter(w => w.wallet_type === 'human').length} human, {wallets.filter(w => w.wallet_type === 'agent').length} agent</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="flex items-center gap-2 text-adv-gray text-xs mb-2"><CreditCard className="h-4 w-4" /> Total Balance</div>
          <div className="text-2xl font-bold text-adv-teal">{wallets.reduce((s, w) => s + Number(w.balance_ftc || 0), 0).toFixed(2)} FTC</div>
          <div className="text-xs text-adv-gray mt-1">{status?.stubMode ? 'Demo balance' : 'Live balance'}</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="flex items-center gap-2 text-adv-gray text-xs mb-2"><ShoppingBag className="h-4 w-4" /> Services</div>
          <div className="text-2xl font-bold text-adv-off-white">{services.length}</div>
          <div className="text-xs text-adv-gray mt-1">marketplace listings</div>
        </div>
        <div className="rounded-xl border border-adv-card bg-adv-card p-4">
          <div className="flex items-center gap-2 text-adv-gray text-xs mb-2"><Shield className="h-4 w-4" /> Budget</div>
          <div className="text-2xl font-bold text-adv-off-white">{Number(budget?.total_spent_month_ftc || 0).toFixed(1)} FTC</div>
          <div className="text-xs text-adv-gray mt-1">spent this month</div>
        </div>
      </div>

      {/* Wallets Section */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <h2 className="text-lg font-semibold text-adv-off-white mb-4">Wallets</h2>
        {wallets.length === 0 ? (
          <div className="text-center py-8">
            <Wallet className="h-10 w-10 text-adv-gray mx-auto mb-3" />
            <p className="text-sm text-adv-gray mb-4">No wallets yet. Create your first wallet to start.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => handleCreateWallet('human')} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark">Create Human Wallet</button>
              <button onClick={() => handleCreateWallet('agent')} className="rounded-lg border border-adv-teal px-4 py-2 text-sm text-adv-teal">Create Agent Wallet</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {wallets.map(w => (
              <div key={w.id} className="flex items-center justify-between rounded-lg bg-adv-dark-2 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-adv-off-white">{w.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${w.wallet_type === 'human' ? 'bg-adv-blue/10 text-adv-blue' : 'bg-adv-teal/10 text-adv-teal'}`}>{w.wallet_type}</span>
                  </div>
                  <div className="text-xs text-adv-gray font-mono mt-1">{w.address}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-adv-teal">{Number(w.balance_ftc || 0).toFixed(2)} FTC</div>
                </div>
              </div>
            ))}
            {!wallets.find(w => w.wallet_type === 'human') && (
              <button onClick={() => handleCreateWallet('human')} className="rounded-lg border border-adv-teal/30 px-3 py-2 text-xs text-adv-teal hover:border-adv-teal">+ Create Human Wallet</button>
            )}
            {wallets.find(w => w.wallet_type === 'human') && !wallets.find(w => w.wallet_type === 'agent') && (
              <button onClick={() => handleCreateWallet('agent')} className="rounded-lg border border-adv-teal/30 px-3 py-2 text-xs text-adv-teal hover:border-adv-teal">+ Create Agent Wallet</button>
            )}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <h2 className="text-lg font-semibold text-adv-off-white mb-4">Recent Transactions</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-adv-gray text-center py-6">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between rounded-lg bg-adv-dark-2 px-4 py-2">
                <div>
                  <span className="text-sm text-adv-off-white">{Number(tx.amount_ftc).toFixed(2)} FTC</span>
                  <span className="text-xs text-adv-gray ml-2">→ {tx.to_address?.slice(0, 16)}...</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${tx.status === 'confirmed' ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gray/10 text-adv-gray'}`}>{tx.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
