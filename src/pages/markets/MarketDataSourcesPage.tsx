import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Database, Plus, RefreshCw, Trash2, Edit2, Check, X,
  ExternalLink, CheckCircle2, AlertCircle, Clock,
  Package, Loader2,
} from 'lucide-react';
import { fetchWithAuth, exportMarketDataSourceConfigAnton } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface DataSource {
  id: string;
  name: string;
  source_type: string;
  provider: string;
  config: string;
  fetch_interval_hours: number;
  is_active: number;
  last_fetch_at: string | null;
  last_fetch_status: string | null;
  last_fetch_error: string | null;
  items_fetched_total: number;
  quality_score: number;
  created_at: string;
}

const PROVIDERS = [
  { value: 'alpha_vantage', label: 'Alpha Vantage', description: 'Stock prices, fundamentals, forex, crypto' },
  { value: 'finnhub', label: 'Finnhub', description: 'Real-time quotes, market news, sentiment' },
  { value: 'marketaux', label: 'Marketaux', description: 'Financial news with entity tagging' },
  { value: 'fmp', label: 'Financial Modeling Prep', description: 'Global prices, news, calendar, fundamentals (250/day)' },
  { value: 'eodhd', label: 'EODHD', description: 'OMX Stockholm, EU, India, Japan EOD prices (20/day)' },
  { value: 'rss', label: 'RSS Feed', description: 'Market news feeds — no API key required' },
  { value: 'custom', label: 'Custom API', description: 'Custom REST endpoint' },
];

export default function MarketDataSourcesPage() {
  const navigate = useNavigate();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [fetchingSource, setFetchingSource] = useState<string | null>(null);
  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done'>('idle');

  const handleExportConfig = async () => {
    if (exportState !== 'idle') return;
    setExportState('loading');
    try {
      const blob = await exportMarketDataSourceConfigAnton();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'market-data-source-config.anton';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportState('done');
      setTimeout(() => setExportState('idle'), 2500);
    } catch (err) {
      console.error('[Export] Error:', err);
      setExportState('idle');
    }
  };

  // Create form state
  const [newName, setNewName] = useState('');
  const [newProvider, setNewProvider] = useState('alpha_vantage');
  const [newSymbols, setNewSymbols] = useState('');
  const [newApiKeyEnv, setNewApiKeyEnv] = useState('');
  const [newInterval, setNewInterval] = useState(6);
  const [newRssUrl, setNewRssUrl] = useState('');
  const [newExchange, setNewExchange] = useState('US');
  const [newDataType, setNewDataType] = useState('price');

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/markets/sources?active=false');
      if (!res.ok) throw new Error('Failed to load sources');
      const rawSources = await res.json() as DataSource[];
      setSources(rawSources.map(s => ({
        ...s,
        fetch_interval_hours: Number(s.fetch_interval_hours) || 0,
        items_fetched_total: Number(s.items_fetched_total) || 0,
        quality_score: Number(s.quality_score) || 0,
      })));
    } catch (err) {
      console.error('[MarketDataSources] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const config: Record<string, unknown> = {};
    if (newApiKeyEnv.trim()) config.api_key_env = newApiKeyEnv.trim();
    if (newSymbols.trim()) config.symbols = newSymbols.split(',').map(s => s.trim()).filter(Boolean);
    if (newProvider === 'rss' && newRssUrl.trim()) config.url = newRssUrl.trim();
    if (newProvider === 'eodhd' && newExchange) config.exchange = newExchange;
    if (newProvider === 'fmp' && newDataType) config.data_type = newDataType;

    try {
      const res = await fetchWithAuth('/api/markets/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          provider: newProvider,
          config,
          fetchIntervalHours: newInterval,
        }),
      });
      if (!res.ok) throw new Error('Failed to create source');
      setShowCreate(false);
      setNewName('');
      setNewSymbols('');
      setNewApiKeyEnv('');
      fetchSources();
    } catch (err) {
      console.error('[MarketDataSources] Create error:', err);
    }
  };

  const handleFetch = async (sourceId: string) => {
    setFetchingSource(sourceId);
    try {
      await fetchWithAuth(`/api/markets/sources/${sourceId}/fetch`, { method: 'POST' });
      fetchSources();
    } catch (err) {
      console.error('[MarketDataSources] Fetch error:', err);
    } finally {
      setFetchingSource(null);
    }
  };

  const handleToggleActive = async (source: DataSource) => {
    try {
      await fetchWithAuth(`/api/markets/sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !source.is_active }),
      });
      fetchSources();
    } catch (err) {
      console.error('[MarketDataSources] Toggle error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this data source and all its raw data?')) return;
    try {
      await fetchWithAuth(`/api/markets/sources/${id}`, { method: 'DELETE' });
      fetchSources();
    } catch (err) {
      console.error('[MarketDataSources] Delete error:', err);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/markets')}
            className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Database className="h-6 w-6 text-adv-blue" />
              Market Data Sources
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">
              Connect to market data providers — Alpha Vantage, Finnhub, Marketaux, FMP, EODHD, RSS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportConfig}
            disabled={exportState === 'loading'}
            className="flex items-center gap-1.5 rounded-md border border-adv-teal/30 bg-adv-dark px-3 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-card transition-colors disabled:opacity-50"
            title="Export as .anton bundle"
          >
            {exportState === 'loading' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</>
            ) : exportState === 'done' ? (
              <><Check className="h-3.5 w-3.5" /> Downloaded</>
            ) : (
              <><Package className="h-3.5 w-3.5" /> Export .anton</>
            )}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Source
          </button>
        </div>
      </div>

      <MarketDisclaimer compact />

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">New Data Source</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-adv-gray mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. US Equities - Alpha Vantage"
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-adv-gray mb-1">Provider</label>
              <select
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label} — {p.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-adv-gray mb-1">API Key Env Variable</label>
              <input
                type="text"
                value={newApiKeyEnv}
                onChange={(e) => setNewApiKeyEnv(e.target.value)}
                placeholder="e.g. ALPHA_VANTAGE_API_KEY"
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
              />
              <p className="mt-1 text-xs text-adv-gray">Environment variable name (never store keys directly)</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-adv-gray mb-1">Symbols (comma-separated)</label>
              <input
                type="text"
                value={newSymbols}
                onChange={(e) => setNewSymbols(e.target.value)}
                placeholder="e.g. AAPL, MSFT, GOOGL, AMZN"
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
              />
            </div>
            {newProvider === 'rss' && (
              <div>
                <label className="block text-xs font-medium text-adv-gray mb-1">RSS Feed URL</label>
                <input
                  type="url"
                  value={newRssUrl}
                  onChange={(e) => setNewRssUrl(e.target.value)}
                  placeholder="https://feeds.example.com/market-news.xml"
                  className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus:border-adv-teal"
                />
                <p className="mt-1 text-xs text-adv-gray">No API key needed for RSS feeds</p>
              </div>
            )}
            {newProvider === 'eodhd' && (
              <div>
                <label className="block text-xs font-medium text-adv-gray mb-1">Exchange</label>
                <select
                  value={newExchange}
                  onChange={(e) => setNewExchange(e.target.value)}
                  className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
                >
                  <option value="ST">OMX Stockholm (.ST)</option>
                  <option value="XETRA">XETRA / Germany (.DE)</option>
                  <option value="NSE">India NSE (.NS)</option>
                  <option value="TSE">Japan TSE (.T)</option>
                  <option value="US">US (default)</option>
                </select>
              </div>
            )}
            {newProvider === 'fmp' && (
              <div>
                <label className="block text-xs font-medium text-adv-gray mb-1">Data Type</label>
                <select
                  value={newDataType}
                  onChange={(e) => setNewDataType(e.target.value)}
                  className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
                >
                  <option value="price">Prices</option>
                  <option value="news">News</option>
                  <option value="event">Economic Calendar</option>
                  <option value="fundamental">Fundamentals</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-adv-gray mb-1">Fetch Interval (hours)</label>
              <input
                type="number"
                value={newInterval}
                onChange={(e) => setNewInterval(parseInt(e.target.value, 10) || 6)}
                min={1}
                max={168}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Create Source
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="flex items-center gap-2 rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sources List */}
      {loading ? (
        <p className="text-sm text-adv-gray">Loading data sources...</p>
      ) : sources.length === 0 ? (
        <div className="text-center py-16">
          <Database className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">No data sources yet</h2>
          <p className="text-sm text-adv-gray mb-4">
            Connect to Alpha Vantage, Finnhub, or Marketaux to start ingesting market data
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add First Source
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => {
            let config: Record<string, unknown> = {};
            try { config = JSON.parse(source.config); } catch { /* empty */ }
            const symbols = (config.symbols as string[] | undefined) ?? [];

            return (
              <div
                key={source.id}
                className={`rounded-xl border bg-adv-card p-4 transition-colors ${
                  source.is_active ? 'border-adv-card' : 'border-adv-dark opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${source.is_active ? 'bg-adv-teal/10 text-adv-teal' : 'bg-adv-dark text-adv-gray'}`}>
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-adv-off-white">{source.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-adv-gray capitalize">{source.provider.replace('_', ' ')}</span>
                        <span className="text-xs text-adv-gray">|</span>
                        <span className="text-xs text-adv-gray">Every {source.fetch_interval_hours}h</span>
                        {symbols.length > 0 && (
                          <>
                            <span className="text-xs text-adv-gray">|</span>
                            <span className="text-xs text-adv-gray">{symbols.join(', ')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Status indicator */}
                    <div className="flex items-center gap-1.5">
                      {source.last_fetch_status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-adv-green" />
                      )}
                      {source.last_fetch_status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-adv-red" />
                      )}
                      {!source.last_fetch_status && (
                        <Clock className="h-4 w-4 text-adv-gray" />
                      )}
                      <span className="text-xs text-adv-gray">
                        {source.items_fetched_total} items
                      </span>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => handleFetch(source.id)}
                      disabled={fetchingSource === source.id}
                      className="rounded-lg border border-adv-dark px-2.5 py-1.5 text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${fetchingSource === source.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(source)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                        source.is_active
                          ? 'border-adv-green/30 text-adv-green hover:bg-adv-green/10'
                          : 'border-adv-gray/30 text-adv-gray hover:text-adv-off-white'
                      }`}
                    >
                      {source.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="rounded-lg border border-adv-dark px-2.5 py-1.5 text-xs text-adv-gray hover:text-adv-red hover:border-adv-red transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {source.last_fetch_error && (
                  <div className="mt-2 rounded-lg bg-adv-red/5 border border-adv-red/20 px-3 py-2 text-xs text-adv-red">
                    {source.last_fetch_error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
