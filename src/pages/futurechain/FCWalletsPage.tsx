import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, RefreshCw, Plus, AlertTriangle, Copy, Check } from 'lucide-react';
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
  const [seedBackup, setSeedBackup] = useState<{ mnemonic: string; address: string } | null>(null);

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
    // Real-mode human wallets return the 24-word BIP-39 recovery phrase EXACTLY
    // ONCE so the user can write it down for offline backup. Capture it and gate
    // the workspace behind a backup-confirmation modal before it is gone forever.
    // Stub-mode / agent wallets return no mnemonic — nothing to back up.
    try {
      const res = await fetchWithAuth(`/api/futurechain/wallets/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { mnemonic?: unknown; address?: unknown } | null;
        if (data && typeof data.mnemonic === 'string' && data.mnemonic.length > 0) {
          setSeedBackup({ mnemonic: data.mnemonic, address: typeof data.address === 'string' ? data.address : '' });
          return; // refresh AFTER the user confirms they saved the phrase
        }
      }
    } catch { /* network error — fall through to refresh the list */ }
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

      {seedBackup && (
        <SeedBackupModal
          mnemonic={seedBackup.mnemonic}
          address={seedBackup.address}
          onDone={() => { setSeedBackup(null); load(); }}
        />
      )}
    </div>
  );
}

/**
 * One-time recovery-phrase backup gate. A real-mode wallet is self-custody and
 * irreversible: the 24-word BIP-39 phrase is the ONLY way to recover it and is
 * shown exactly once. This modal forces the user to acknowledge they've saved it
 * (and warns about key loss) before the phrase is discarded. It is deliberately
 * NOT dismissable by backdrop click — only the gated "continue" button closes it.
 */
function SeedBackupModal({
  mnemonic, address, onDone,
}: { mnemonic: string; address: string; onDone: () => void }) {
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);
  const words = mnemonic.trim().split(/\s+/);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable — the on-screen words are the backup */ }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="seed-title"
         className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border border-adv-gold/40 bg-adv-card p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-adv-gold shrink-0 mt-0.5" />
          <div>
            <h2 id="seed-title" className="text-lg font-bold text-adv-off-white">Back up your recovery phrase</h2>
            <p className="text-sm text-adv-gray mt-1">
              These 24 words are the <strong className="text-adv-off-white">only</strong> way to recover this
              self-custody wallet. Write them on paper and store them somewhere private. They are shown{' '}
              <strong className="text-adv-off-white">once</strong> and never again.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-xs text-adv-off-white space-y-1">
          <p>• If you lose this phrase, your FTC is <strong>gone forever</strong> — no one, including ANTON, can recover it.</p>
          <p>• Anyone who sees these words can take your funds. Never share them, photograph them, or type them into a website.</p>
          <p>• This wallet is self-custody: you alone control it and are responsible for it.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {words.map((w, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-adv-card bg-adv-dark/40 px-2.5 py-1.5">
              <span className="text-xs text-adv-gray tabular-nums w-5 text-right">{i + 1}</span>
              <span className="font-mono text-sm text-adv-off-white">{w}</span>
            </div>
          ))}
        </div>

        {address ? (
          <p className="text-xs text-adv-gray">Wallet address: <span className="font-mono break-all">{address}</span></p>
        ) : null}

        <button onClick={copy} type="button"
          className="flex items-center gap-1.5 rounded-lg border border-adv-card px-3 py-2 text-xs text-adv-gray hover:text-adv-teal">
          {copied ? <Check className="h-3.5 w-3.5 text-adv-green" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied — paper is safer than the clipboard' : 'Copy phrase'}
        </button>

        <label className="flex items-start gap-2 cursor-pointer pt-1">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          <span className="text-sm text-adv-off-white">
            I have written down my recovery phrase and understand that if I lose it, my funds cannot be recovered.
          </span>
        </label>

        <button onClick={onDone} disabled={!ack} type="button"
          className="w-full rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark disabled:opacity-40 disabled:cursor-not-allowed">
          I've saved it — continue
        </button>
      </div>
    </div>
  );
}
