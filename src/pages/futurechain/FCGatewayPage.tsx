import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plug, Copy, RefreshCw, Save, Shield, Activity, Eye, EyeOff } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface GatewayConfig {
  enabled: boolean;
  api_key_display: string;
  allow_balance_check: boolean;
  allow_contact_lookup: boolean;
  allow_send_payment: boolean;
  allow_create_transaction: boolean;
  max_per_transaction_ftc: number;
  max_daily_spend_ftc: number;
  require_approval_above_ftc: number;
  allowed_contacts_only: boolean;
  total_requests: number;
  total_payments_ftc: number;
}

interface AuditEntry {
  id: string;
  action: string;
  caller_id: string | null;
  response_status: string;
  amount_ftc: number | null;
  error: string | null;
  created_at: string;
}

interface GatewayStats {
  totalRequests: number;
  totalPayments: number;
  todayRequests: number;
  todayPayments: number;
}

export default function FCGatewayPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cRes, sRes, aRes] = await Promise.all([
        fetchWithAuth('/api/futurechain/gateway/config'),
        fetchWithAuth('/api/futurechain/gateway/stats'),
        fetchWithAuth('/api/futurechain/gateway/audit-log?limit=30'),
      ]);
      if (cRes.ok) setConfig(await cRes.json());
      if (sRes.ok) setStats(await sRes.json());
      if (aRes.ok) setAudit(await aRes.json());
    } catch { /* empty */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true); setSaved(false);
    try {
      const { api_key_display, total_requests, total_payments_ftc, ...body } = config;
      await fetchWithAuth('/api/futurechain/gateway/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch { /* empty */ }
    finally { setSaving(false); }
  };

  const handleRegenerate = async () => {
    if (!confirm('Regenerate API key? The old key will stop working immediately.')) return;
    try {
      const res = await fetchWithAuth('/api/futurechain/gateway/regenerate-key', { method: 'POST' });
      if (res.ok) { const data = await res.json(); setNewKey(data.apiKey); setShowKey(true); load(); }
    } catch { /* empty */ }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const inputCls = 'w-full rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-gray mb-1';
  const checkCls = 'h-4 w-4 rounded border-adv-card bg-adv-dark-2 text-adv-teal focus:ring-adv-teal accent-adv-teal';

  if (!config) return <div className="min-h-screen p-6 flex items-center justify-center"><span className="text-adv-gray text-sm">Loading gateway config...</span></div>;

  return (
    <div className="min-h-screen p-6 space-y-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/futurechain')} className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to FutureChain
      </button>

      <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
        <Plug className="h-6 w-6 text-adv-teal" /> Payment Gateway
      </h1>
      <p className="text-sm text-adv-gray">Allow external systems to send payments through ANTON via API key authentication.</p>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Requests', value: stats.totalRequests },
            { label: 'Total Payments', value: `${stats.totalPayments.toFixed(2)} FTC` },
            { label: 'Today Requests', value: stats.todayRequests },
            { label: 'Today Payments', value: `${stats.todayPayments.toFixed(2)} FTC` },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-adv-card bg-adv-card p-4">
              <div className="text-xs text-adv-gray">{s.label}</div>
              <div className="text-lg font-bold text-adv-off-white mt-1">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Enable + API Key */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-adv-off-white">Gateway Status</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className={`text-xs ${config.enabled ? 'text-adv-green' : 'text-adv-red'}`}>{config.enabled ? 'Enabled' : 'Disabled'}</span>
            <input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} className={checkCls} />
          </label>
        </div>

        <div>
          <label className={labelCls}>API Key</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white font-mono">
              {newKey && showKey ? newKey : config.api_key_display}
            </div>
            {newKey && (
              <button onClick={() => setShowKey(!showKey)} className="p-2 rounded-lg border border-adv-card text-adv-gray hover:text-adv-teal" title={showKey ? 'Hide' : 'Show'}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
            <button onClick={() => handleCopy(newKey ?? config.api_key_display)} className="p-2 rounded-lg border border-adv-card text-adv-gray hover:text-adv-teal" title="Copy">
              <Copy className="h-4 w-4" />
            </button>
            <button onClick={handleRegenerate} className="p-2 rounded-lg border border-adv-card text-adv-gray hover:text-adv-teal" title="Regenerate">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {copied && <div className="text-xs text-adv-green mt-1">Copied to clipboard</div>}
          {newKey && <div className="text-xs text-adv-gold mt-1">Save this key now -- it will not be shown again after page reload.</div>}
        </div>
      </div>

      {/* Permissions */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-adv-off-white">Permissions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { key: 'allow_balance_check' as const, label: 'Balance Check', desc: 'Read wallet balances' },
            { key: 'allow_contact_lookup' as const, label: 'Contact Lookup', desc: 'Look up contact payment addresses' },
            { key: 'allow_send_payment' as const, label: 'Send Payment', desc: 'Send FTC to contacts or addresses' },
            { key: 'allow_create_transaction' as const, label: 'Create Transaction', desc: 'Create draft transactions' },
          ].map(p => (
            <label key={p.key} className="flex items-start gap-3 p-3 rounded-lg border border-adv-dark-2 bg-adv-dark-2/50 cursor-pointer hover:border-adv-teal/30">
              <input type="checkbox" checked={!!config[p.key]} onChange={e => setConfig({ ...config, [p.key]: e.target.checked })} className={`${checkCls} mt-0.5`} />
              <div><div className="text-sm text-adv-off-white">{p.label}</div><div className="text-xs text-adv-gray">{p.desc}</div></div>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={!!config.allowed_contacts_only} onChange={e => setConfig({ ...config, allowed_contacts_only: e.target.checked })} className={checkCls} />
          <span className="text-sm text-adv-off-white">Payments to accepted contacts only</span>
        </label>
      </div>

      {/* Limits */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-adv-off-white flex items-center gap-2"><Shield className="h-4 w-4 text-adv-teal" /> Gateway Limits</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Max Per Transaction (FTC)</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={config.max_per_transaction_ftc}
              onChange={e => setConfig({ ...config, max_per_transaction_ftc: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>Max Daily Spend (FTC)</label>
            <input type="number" min="0" step="1" className={inputCls} value={config.max_daily_spend_ftc}
              onChange={e => setConfig({ ...config, max_daily_spend_ftc: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>Require Approval Above (FTC)</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={config.require_approval_above_ftc}
              onChange={e => setConfig({ ...config, require_approval_above_ftc: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark disabled:opacity-40">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        {saved && <span className="text-sm text-adv-green">Configuration saved</span>}
      </div>

      {/* Integration Guide */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <button onClick={() => setShowGuide(!showGuide)} className="flex items-center gap-2 text-sm font-semibold text-adv-off-white w-full">
          <Activity className="h-4 w-4 text-adv-teal" /> Integration Guide
          <span className="ml-auto text-xs text-adv-gray">{showGuide ? 'Hide' : 'Show'}</span>
        </button>
        {showGuide && (
          <div className="mt-4 space-y-3 text-sm text-adv-gray">
            <p>Use the gateway API to integrate payments into external systems. All requests go to <code className="text-adv-teal">/api/gateway/*</code>.</p>
            <div className="bg-adv-dark-2 rounded-lg p-3 font-mono text-xs whitespace-pre overflow-x-auto">{
`# Check gateway status
curl http://localhost:3001/api/gateway/status

# Get wallet balances
curl -H "x-gateway-key: YOUR_KEY" \\
  http://localhost:3001/api/gateway/balance

# Send payment
curl -X POST -H "x-gateway-key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"toAddress":"fc_...", "amount":5.0}' \\
  http://localhost:3001/api/gateway/pay

# List recent transactions
curl -H "x-gateway-key: YOUR_KEY" \\
  http://localhost:3001/api/gateway/transactions`
            }</div>
          </div>
        )}
      </div>

      {/* Audit Log */}
      {audit.length > 0 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-sm font-semibold text-adv-off-white mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-adv-teal" /> Audit Log</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-adv-gray border-b border-adv-dark-2">
                <th className="text-left py-2 pr-3">Time</th><th className="text-left py-2 pr-3">Action</th>
                <th className="text-left py-2 pr-3">Status</th><th className="text-right py-2 pr-3">Amount</th>
                <th className="text-left py-2">Caller</th>
              </tr></thead>
              <tbody>
                {audit.map(e => (
                  <tr key={e.id} className="border-b border-adv-dark-2/50">
                    <td className="py-1.5 pr-3 text-adv-gray">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-adv-off-white">{e.action}</td>
                    <td className="py-1.5 pr-3"><span className={e.response_status === 'success' ? 'text-adv-green' : 'text-adv-red'}>{e.response_status}</span></td>
                    <td className="py-1.5 pr-3 text-right text-adv-off-white">{e.amount_ftc != null ? `${Number(e.amount_ftc).toFixed(2)} FTC` : '--'}</td>
                    <td className="py-1.5 text-adv-gray font-mono">{e.caller_id ?? '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
