import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, RefreshCw, Plus } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface WalletInfo {
  id: string;
  name: string;
  address: string;
  wallet_type: 'human' | 'agent';
  balance_ftc: number;
  utxo_count: number;
  balance_updated_at: string | null;
  is_active: boolean;
  created_at: string;
}

export default function FCWalletsPage() {
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/futurechain/wallets');
      if (res.ok) setWallets(await res.json());
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (type: 'human' | 'agent') => {
    const name = type === 'human' ? 'My Wallet' : 'ANTON Agent';
    await fetchWithAuth(`/api/futurechain/wallets/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    load();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchWithAuth('/api/futurechain/wallets/refresh-balances', { method: 'POST' });
      await load();
    } catch { /* empty */ }
    finally { setRefreshing(false); }
  };

  const hasHuman = wallets.some(w => w.wallet_type === 'human');
  const hasAgent = wallets.some(w => w.wallet_type === 'agent');

  return (
    <div className="min-h-screen p-6 space-y-6">
      <button onClick={() => navigate('/futurechain')} className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to FutureChain
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
          <Wallet className="h-6 w-6 text-adv-teal" /> Wallets
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-xs text-adv-gray hover:text-adv-teal">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Balances
          </button>
          {!hasHuman && (
            <button onClick={() => handleCreate('human')} className="flex items-center gap-1 rounded-lg bg-adv-teal px-3 py-2 text-xs font-medium text-adv-dark">
              <Plus className="h-3.5 w-3.5" /> Human Wallet
            </button>
          )}
          {hasHuman && !hasAgent && (
            <button onClick={() => handleCreate('agent')} className="flex items-center gap-1 rounded-lg border border-adv-teal px-3 py-2 text-xs text-adv-teal">
              <Plus className="h-3.5 w-3.5" /> Agent Wallet
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-adv-gray text-center py-12">Loading wallets...</p>
      ) : wallets.length === 0 ? (
        <div className="rounded-xl border border-adv-card bg-adv-card p-10 text-center">
          <Wallet className="h-12 w-12 text-adv-gray mx-auto mb-4" />
          <p className="text-adv-gray mb-4">No wallets yet. Create your first wallet to start using FutureChain.</p>
          <button onClick={() => handleCreate('human')} className="rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark">
            Create Human Wallet
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wallets.map(w => (
            <div key={w.id} className="rounded-xl border border-adv-card bg-adv-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-adv-teal" />
                  <span className="font-semibold text-adv-off-white">{w.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${w.wallet_type === 'human' ? 'bg-adv-blue/10 text-adv-blue' : 'bg-adv-teal/10 text-adv-teal'}`}>
                    {w.wallet_type}
                  </span>
                </div>
                <span className={`text-xs ${w.is_active ? 'text-adv-green' : 'text-adv-gray'}`}>
                  {w.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-2xl font-bold text-adv-teal mb-2">{Number(w.balance_ftc || 0).toFixed(2)} FTC</div>
              <div className="text-xs font-mono text-adv-gray truncate mb-1">{w.address}</div>
              <div className="flex items-center justify-between text-xs text-adv-gray mt-3">
                <span>{w.utxo_count} UTXOs</span>
                <span>Created {new Date(w.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
