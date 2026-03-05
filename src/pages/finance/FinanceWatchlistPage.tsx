/**
 * FinanceWatchlistPage.tsx
 *
 * Personal watchlist manager for tracking financial symbols.
 */

import { useState, useEffect } from 'react';
import { Star, Plus, Trash2, AlertTriangle, Loader2, X } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import { useSearchParams } from 'react-router-dom';

interface WatchlistItem {
  id: number;
  symbol: string;
  name: string;
  asset_type: 'stock' | 'etf' | 'crypto' | 'commodity' | 'index';
  notes: string;
  created_at: string;
}

const ASSET_TYPES = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'commodity', label: 'Commodity' },
  { value: 'index', label: 'Index' },
];

const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: 'bg-adv-blue/10 text-adv-blue',
  etf: 'bg-adv-teal-dim text-adv-teal',
  crypto: 'bg-purple-500/10 text-purple-400',
  commodity: 'bg-adv-gold/10 text-adv-gold',
  index: 'bg-adv-green/10 text-adv-green',
};

export default function FinanceWatchlistPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [symbol, setSymbol] = useState(searchParams.get('add') || '');
  const [name, setName] = useState(searchParams.get('name') || '');
  const [assetType, setAssetType] = useState<WatchlistItem['asset_type']>((searchParams.get('type') as WatchlistItem['asset_type']) || 'stock');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Auto-open form if pre-filled from market page
  useEffect(() => {
    if (searchParams.get('add')) setShowForm(true);
  }, []);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/watchlist', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!symbol.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/finance/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ symbol: symbol.toUpperCase().trim(), name, asset_type: assetType, notes }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to add');
      }
      const item = await res.json();
      setItems((prev) => [item, ...prev]);
      setSymbol('');
      setName('');
      setNotes('');
      setShowForm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleteId(id);
    try {
      await fetch(`/api/finance/watchlist/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // non-fatal
    } finally {
      setDeleteId(null);
    }
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleDateString('sv-SE');
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
              <Star className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">My Watchlist</h1>
              <p className="text-sm text-adv-gray">Track symbols for personal reference — no live prices</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Symbol'}
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-5">
        {/* Disclaimer */}
        <div className="flex items-start gap-3 rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adv-gold" />
          <p className="text-sm text-adv-gold">
            Watchlist is for tracking purposes only. No live prices without a market data API key.
          </p>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
            <h2 className="font-semibold text-adv-off-white">Add Symbol</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Symbol *</span>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. AAPL, BTC, OMXS30"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apple Inc."
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Asset type</span>
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as WatchlistItem['asset_type'])}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Notes (optional)</span>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why you're watching this"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                />
              </label>
            </div>
            {error && <p className="text-sm text-adv-red">{error}</p>}
            <button
              onClick={handleAdd}
              disabled={saving || !symbol.trim()}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to Watchlist
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-adv-gray">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading watchlist…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Star className="mb-3 h-10 w-10 text-adv-gray-med" />
            <h3 className="mb-1 font-semibold text-adv-off-white">Your watchlist is empty</h3>
            <p className="text-sm text-adv-gray">Add symbols to track them here.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs text-adv-gray">
                  <th className="px-5 py-3 text-left font-medium">Symbol</th>
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Notes</th>
                  <th className="px-5 py-3 text-left font-medium">Added</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-adv-dark-2 transition-colors">
                    <td className="px-5 py-3 text-sm font-semibold font-mono text-adv-off-white">{item.symbol}</td>
                    <td className="px-5 py-3 text-sm text-adv-off-white">{item.name || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ASSET_TYPE_COLORS[item.asset_type] || 'bg-adv-dark text-adv-gray'}`}>
                        {item.asset_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 max-w-[200px] truncate text-sm text-adv-gray">{item.notes || '—'}</td>
                    <td className="px-5 py-3 text-sm text-adv-gray-med">{formatDate(item.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleteId === item.id}
                        className="rounded p-1.5 text-adv-gray hover:bg-adv-red/10 hover:text-adv-red transition-colors disabled:opacity-50"
                      >
                        {deleteId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
