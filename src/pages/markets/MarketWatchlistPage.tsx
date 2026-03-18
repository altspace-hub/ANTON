import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Eye, Plus, Trash2, Edit2, Check, X,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface WatchlistItem {
  id: string;
  symbol: string;
  name: string | null;
  asset_type: string;
  notes: string | null;
  created_at: string;
}

const ASSET_TYPE_COLORS: Record<string, string> = {
  stock: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30',
  etf: 'bg-adv-teal/10 text-adv-teal border-adv-teal/30',
  crypto: 'bg-purple-400/10 text-purple-400 border-purple-400/30',
  commodity: 'bg-adv-gold/10 text-adv-gold border-adv-gold/30',
  currency: 'bg-adv-green/10 text-adv-green border-adv-green/30',
  index: 'bg-adv-off-white/10 text-adv-off-white border-adv-off-white/30',
  bond: 'bg-orange-400/10 text-orange-400 border-orange-400/30',
};

export default function MarketWatchlistPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newAssetType, setNewAssetType] = useState('stock');
  const [newNotes, setNewNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/markets/watchlist');
      if (res.ok) setItems(await res.json() as WatchlistItem[]);
    } catch (err) {
      console.error('[MarketWatchlist] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    if (!newSymbol.trim()) return;
    try {
      await fetchWithAuth('/api/markets/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: newSymbol.toUpperCase(),
          name: newName || undefined,
          assetType: newAssetType,
          notes: newNotes || undefined,
        }),
      });
      setNewSymbol('');
      setNewName('');
      setNewNotes('');
      fetchItems();
    } catch (err) {
      console.error('[MarketWatchlist] Add error:', err);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      await fetchWithAuth(`/api/markets/watchlist/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes }),
      });
      setEditingId(null);
      setEditNotes('');
      fetchItems();
    } catch (err) {
      console.error('[MarketWatchlist] Update error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this item from your watchlist?')) return;
    try {
      await fetchWithAuth(`/api/markets/watchlist/${id}`, { method: 'DELETE' });
      fetchItems();
    } catch (err) {
      console.error('[MarketWatchlist] Delete error:', err);
    }
  };

  const startEdit = (item: WatchlistItem) => {
    setEditingId(item.id);
    setEditNotes(item.notes || '');
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/markets')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Eye className="h-6 w-6 text-adv-gold" />
              Watchlist
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">Track symbols and assets you are monitoring</p>
          </div>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Add Form */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-adv-off-white">Add to Watchlist</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-adv-gray mb-1">Symbol *</label>
            <input type="text" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} placeholder="AAPL"
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          </div>
          <div>
            <label className="block text-xs text-adv-gray mb-1">Name</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Apple Inc."
              className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
          </div>
          <div>
            <label className="block text-xs text-adv-gray mb-1">Asset Type</label>
            <select value={newAssetType} onChange={(e) => setNewAssetType(e.target.value)} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal">
              <option value="stock">Stock</option>
              <option value="etf">ETF</option>
              <option value="crypto">Crypto</option>
              <option value="commodity">Commodity</option>
              <option value="currency">Currency</option>
              <option value="index">Index</option>
              <option value="bond">Bond</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={handleAdd} disabled={!newSymbol.trim()} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-adv-gray mb-1">Notes</label>
          <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Why are you watching this?"
            rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
        </div>
      </div>

      {/* Watchlist Grid */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading watchlist...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Eye className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">Watchlist is empty</h2>
          <p className="text-sm text-adv-gray">Add symbols above to start tracking assets</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-adv-card bg-adv-card p-4 hover:border-adv-teal/30 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-bold text-adv-off-white">{item.symbol}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${ASSET_TYPE_COLORS[item.asset_type] || 'bg-adv-card text-adv-gray border-adv-gray/30'}`}>
                      {item.asset_type}
                    </span>
                  </div>
                  {item.name && (
                    <p className="text-sm text-adv-gray">{item.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => startEdit(item)} className="p-1.5 text-adv-gray hover:text-adv-teal transition-colors">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="p-1.5 text-adv-gray hover:text-adv-red transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {editingId === item.id ? (
                <div className="mt-2 space-y-2">
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes..."
                    rows={2} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal" />
                  <div className="flex gap-1">
                    <button onClick={() => handleUpdate(item.id)} className="flex items-center gap-1 rounded-md bg-adv-teal px-2 py-1 text-xs text-adv-dark hover:bg-adv-teal-dark">
                      <Check className="h-3 w-3" /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-md border border-adv-dark px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white">
                      <X className="h-3 w-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : item.notes ? (
                <p className="mt-2 text-xs text-adv-gray line-clamp-2">{item.notes}</p>
              ) : null}

              <p className="mt-2 text-xs text-adv-gray">Added {new Date(item.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
