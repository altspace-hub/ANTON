import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Send } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface Wallet { id: string; name: string; address: string; wallet_type: string; }
interface Tx {
  id: string; tx_id: string | null; from_address: string; to_address: string;
  amount_ftc: number; status: string; wallet_type: string;
  pacs008_fields: Record<string, unknown>; remittance_parsed: Record<string, unknown> | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-adv-green/10 text-adv-green',
  submitted: 'bg-adv-blue/10 text-adv-blue',
  pending_approval: 'bg-adv-gold/10 text-adv-gold',
  draft: 'bg-adv-gray/10 text-adv-gray',
  failed: 'bg-adv-red/10 text-adv-red',
  rejected: 'bg-adv-red/10 text-adv-red',
  approved: 'bg-adv-teal/10 text-adv-teal',
};

export default function FCTransactionsPage() {
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ fromAddress: '', toAddress: '', amountFtc: '', purpose: '', nature: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, tRes] = await Promise.all([
        fetchWithAuth('/api/futurechain/wallets'),
        fetchWithAuth('/api/futurechain/transactions'),
      ]);
      if (wRes.ok) setWallets(await wRes.json());
      if (tRes.ok) setTransactions(await tRes.json());
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    if (!form.fromAddress || !form.toAddress || !form.amountFtc) return;
    setSending(true);
    try {
      const wallet = wallets.find(w => w.address === form.fromAddress);
      const res = await fetchWithAuth('/api/futurechain/transactions/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAddress: form.fromAddress,
          toAddress: form.toAddress,
          amountFtc: Number(form.amountFtc),
          walletType: wallet?.wallet_type ?? 'human',
          purpose: form.purpose,
          nature: form.nature,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ fromAddress: '', toAddress: '', amountFtc: '', purpose: '', nature: '' });
        await load();
      }
    } catch { /* empty */ }
    finally { setSending(false); }
  };

  const inputCls = 'w-full rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-gray mb-1';

  return (
    <div className="min-h-screen p-6 space-y-6">
      <button onClick={() => navigate('/futurechain')} className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to FutureChain
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-adv-teal" /> Transactions
        </h1>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark">
          <Send className="h-3.5 w-3.5" /> New Transaction
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-adv-off-white">Build Transaction</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>From Wallet *</label>
              <select className={inputCls} value={form.fromAddress} onChange={e => setForm(p => ({ ...p, fromAddress: e.target.value }))}>
                <option value="">Select wallet...</option>
                {wallets.map(w => <option key={w.id} value={w.address}>{w.name} ({w.address.slice(0, 12)}...)</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>To Address *</label>
              <input className={inputCls} value={form.toAddress} onChange={e => setForm(p => ({ ...p, toAddress: e.target.value }))} placeholder="fc_..." />
            </div>
            <div>
              <label className={labelCls}>Amount (FTC) *</label>
              <input type="number" step="0.01" min="0" className={inputCls} value={form.amountFtc} onChange={e => setForm(p => ({ ...p, amountFtc: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Purpose</label>
              <input className={inputCls} value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} placeholder="Service payment" />
            </div>
            <div>
              <label className={labelCls}>Nature</label>
              <input className={inputCls} value={form.nature} onChange={e => setForm(p => ({ ...p, nature: e.target.value }))} placeholder="AI service" />
            </div>
          </div>
          <button onClick={handleSend} disabled={sending || !form.fromAddress || !form.toAddress || !form.amountFtc}
            className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark disabled:opacity-40">
            {sending ? 'Building...' : 'Build & Submit'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-adv-gray text-center py-12">Loading transactions...</p>
      ) : transactions.length === 0 ? (
        <div className="rounded-xl border border-adv-card bg-adv-card p-10 text-center">
          <CreditCard className="h-12 w-12 text-adv-gray mx-auto mb-4" />
          <p className="text-adv-gray">No transactions yet</p>
        </div>
      ) : (
        <div className="rounded-xl border border-adv-card bg-adv-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-adv-dark-2 text-adv-gray text-xs">
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">From</th>
                <th className="text-left px-4 py-3">To</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} className="border-b border-adv-dark-2 last:border-0 hover:bg-adv-dark-2/50">
                  <td className="px-4 py-3 font-medium text-adv-teal">{Number(tx.amount_ftc).toFixed(2)} FTC</td>
                  <td className="px-4 py-3 font-mono text-xs text-adv-gray">{tx.from_address.slice(0, 12)}...</td>
                  <td className="px-4 py-3 font-mono text-xs text-adv-gray">{tx.to_address.slice(0, 12)}...</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[tx.status] ?? 'bg-adv-gray/10 text-adv-gray'}`}>{tx.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-adv-gray">{new Date(tx.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length > 0 && transactions[0].remittance_parsed && (
            <div className="border-t border-adv-dark-2 px-4 py-3">
              <span className="text-xs text-adv-gray">Remittance info available for latest transaction</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
