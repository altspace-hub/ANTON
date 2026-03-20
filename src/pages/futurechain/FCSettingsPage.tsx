import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

export default function FCSettingsPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; version?: string } | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/futurechain/config');
      if (res.ok) setConfig(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    await fetchWithAuth('/api/futurechain/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    fetchConfig();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchWithAuth('/api/futurechain/health-check', { method: 'POST' });
      if (res.ok) setTestResult(await res.json());
      else setTestResult({ connected: false });
    } catch { setTestResult({ connected: false }); }
    finally { setTesting(false); }
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/futurechain')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
            <Settings className="h-6 w-6 text-adv-teal" /> FutureChain Settings
          </h1>
          <p className="text-sm text-adv-gray">Configure connection to FutureChain node</p>
        </div>
      </div>

      {loading ? <p className="text-sm text-adv-gray">Loading...</p> : (
        <div className="space-y-6">
          {/* Connection Config */}
          <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
            <h2 className="text-lg font-semibold text-adv-off-white">Node Connection</h2>

            <div>
              <label className="block text-xs text-adv-gray mb-1">Node URL</label>
              <input value={String(config.node_url ?? 'http://localhost:8545')}
                onChange={e => setConfig({ ...config, node_url: e.target.value })}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                placeholder="http://localhost:8545" />
            </div>

            <div>
              <label className="block text-xs text-adv-gray mb-1">CLI Binary Path</label>
              <input value={String(config.cli_binary_path ?? 'futurechain')}
                onChange={e => setConfig({ ...config, cli_binary_path: e.target.value })}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                placeholder="futurechain" />
            </div>

            <div>
              <label className="block text-xs text-adv-gray mb-1">Wallet Directory</label>
              <input value={String(config.wallet_dir ?? '~/.futurechain/wallets')}
                onChange={e => setConfig({ ...config, wallet_dir: e.target.value })}
                className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                placeholder="~/.futurechain/wallets" />
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handleSave} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark">Save Settings</button>
              <button onClick={handleTest} disabled={testing}
                className="flex items-center gap-2 rounded-lg border border-adv-teal px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/10 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
                Test Connection
              </button>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 rounded-lg px-4 py-3 ${testResult.connected ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-red/10 text-adv-red'}`}>
                {testResult.connected ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {testResult.connected ? `Connected — ${testResult.version ?? 'FutureChain node'}` : 'Connection failed — node not reachable'}
              </div>
            )}
          </div>

          {/* Current Status */}
          <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-3">
            <h2 className="text-lg font-semibold text-adv-off-white">Current Status</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between"><span className="text-adv-gray">Connected</span><span className={config.connected ? 'text-adv-green' : 'text-adv-red'}>{config.connected ? 'Yes' : 'No'}</span></div>
              <div className="flex justify-between"><span className="text-adv-gray">Demo Mode</span><span className={config.stub_mode ? 'text-adv-gold' : 'text-adv-green'}>{config.stub_mode ? 'Yes (simulated)' : 'No (live)'}</span></div>
              <div className="flex justify-between"><span className="text-adv-gray">Node Version</span><span className="text-adv-off-white">{String(config.node_version ?? 'N/A')}</span></div>
              <div className="flex justify-between"><span className="text-adv-gray">Chain Height</span><span className="text-adv-off-white">{config.chain_height ? Number(config.chain_height).toLocaleString() : 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-adv-gray">PACS.008 Support</span><span className="text-adv-off-white">{config.pacs008_support ? 'Yes' : 'No'}</span></div>
              <div className="flex justify-between"><span className="text-adv-gray">Two-Tier Storage</span><span className="text-adv-off-white">{config.two_tier_storage ? 'Yes' : 'No'}</span></div>
            </div>
          </div>

          {/* Info */}
          <div className="rounded-xl border border-adv-blue/20 bg-adv-blue/5 p-5 text-sm text-adv-gray">
            <p className="font-medium text-adv-blue mb-2">About FutureChain</p>
            <p>FutureChain is a PACS.008 ISO 20022-native blockchain designed for professional AI agent commerce. When connected, ANTON can send and receive payments for delegated tasks, marketplace services, and collaborative projects.</p>
            <p className="mt-2">Without a node, ANTON operates in demo mode — all transactions are simulated locally.</p>
          </div>
        </div>
      )}
    </div>
  );
}
