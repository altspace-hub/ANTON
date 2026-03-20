import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Save } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface BudgetRules {
  max_per_tx_ftc: number;
  max_daily_tx_count: number;
  max_daily_spend_ftc: number;
  max_monthly_spend_ftc: number;
  auto_approve_threshold_ftc: number;
  task_override_explanation: string;
}

interface SpendingState {
  total_spent_today_ftc: number;
  tx_count_today: number;
  total_spent_month_ftc: number;
  tx_count_month: number;
}

const DEFAULTS: BudgetRules = {
  max_per_tx_ftc: 100,
  max_daily_tx_count: 50,
  max_daily_spend_ftc: 500,
  max_monthly_spend_ftc: 5000,
  auto_approve_threshold_ftc: 10,
  task_override_explanation: '',
};

export default function FCBudgetPage() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<BudgetRules>({ ...DEFAULTS });
  const [state, setState] = useState<SpendingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rRes, sRes] = await Promise.all([
        fetchWithAuth('/api/futurechain/budget/rules'),
        fetchWithAuth('/api/futurechain/budget/state'),
      ]);
      if (rRes.ok) {
        const data = await rRes.json();
        if (data && Object.keys(data).length > 0) setRules(prev => ({ ...prev, ...data }));
      }
      if (sRes.ok) setState(await sRes.json());
    } catch { /* empty */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetchWithAuth('/api/futurechain/budget/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* empty */ }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none';
  const labelCls = 'block text-xs font-medium text-adv-gray mb-1';

  const pct = (spent: number, max: number) => max > 0 ? Math.min(100, (spent / max) * 100) : 0;

  return (
    <div className="min-h-screen p-6 space-y-6 max-w-3xl mx-auto">
      <button onClick={() => navigate('/futurechain')} className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal">
        <ArrowLeft className="h-4 w-4" /> Back to FutureChain
      </button>

      <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
        <Shield className="h-6 w-6 text-adv-teal" /> Budget Rules
      </h1>
      <p className="text-sm text-adv-gray">Control spending limits for human and agent wallets.</p>

      {/* Current Spending */}
      {state && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-adv-off-white">Current Spending</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-adv-gray mb-1">Daily Spend</div>
              <div className="text-lg font-bold text-adv-off-white">{Number(state.total_spent_today_ftc || 0).toFixed(2)} FTC</div>
              <div className="h-1.5 rounded-full bg-adv-dark-2 mt-1">
                <div className="h-full rounded-full bg-adv-teal" style={{ width: `${pct(state.total_spent_today_ftc || 0, rules.max_daily_spend_ftc)}%` }} />
              </div>
              <div className="text-xs text-adv-gray mt-0.5">{state.tx_count_today || 0} / {rules.max_daily_tx_count} transactions</div>
            </div>
            <div>
              <div className="text-xs text-adv-gray mb-1">Monthly Spend</div>
              <div className="text-lg font-bold text-adv-off-white">{Number(state.total_spent_month_ftc || 0).toFixed(2)} FTC</div>
              <div className="h-1.5 rounded-full bg-adv-dark-2 mt-1">
                <div className="h-full rounded-full bg-adv-teal" style={{ width: `${pct(state.total_spent_month_ftc || 0, rules.max_monthly_spend_ftc)}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rules Editor */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5 space-y-5">
        <h2 className="text-sm font-semibold text-adv-off-white">Budget Limits</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Max Per Transaction (FTC)</label>
            <input type="number" min="0" step="1" className={inputCls} value={rules.max_per_tx_ftc}
              onChange={e => setRules(p => ({ ...p, max_per_tx_ftc: Number(e.target.value) }))} />
            <input type="range" min="1" max="1000" className="w-full mt-1" value={rules.max_per_tx_ftc}
              onChange={e => setRules(p => ({ ...p, max_per_tx_ftc: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelCls}>Max Daily Transactions</label>
            <input type="number" min="0" step="1" className={inputCls} value={rules.max_daily_tx_count}
              onChange={e => setRules(p => ({ ...p, max_daily_tx_count: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelCls}>Max Daily Spend (FTC)</label>
            <input type="number" min="0" step="1" className={inputCls} value={rules.max_daily_spend_ftc}
              onChange={e => setRules(p => ({ ...p, max_daily_spend_ftc: Number(e.target.value) }))} />
            <input type="range" min="1" max="5000" className="w-full mt-1" value={rules.max_daily_spend_ftc}
              onChange={e => setRules(p => ({ ...p, max_daily_spend_ftc: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelCls}>Max Monthly Spend (FTC)</label>
            <input type="number" min="0" step="1" className={inputCls} value={rules.max_monthly_spend_ftc}
              onChange={e => setRules(p => ({ ...p, max_monthly_spend_ftc: Number(e.target.value) }))} />
            <input type="range" min="1" max="50000" className="w-full mt-1" value={rules.max_monthly_spend_ftc}
              onChange={e => setRules(p => ({ ...p, max_monthly_spend_ftc: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelCls}>Auto-Approve Threshold (FTC)</label>
            <input type="number" min="0" step="0.1" className={inputCls} value={rules.auto_approve_threshold_ftc}
              onChange={e => setRules(p => ({ ...p, auto_approve_threshold_ftc: Number(e.target.value) }))} />
            <p className="text-xs text-adv-gray mt-1">Transactions below this amount skip approval</p>
          </div>
          <div>
            <label className={labelCls}>Task Override Explanation</label>
            <input className={inputCls} value={rules.task_override_explanation}
              onChange={e => setRules(p => ({ ...p, task_override_explanation: e.target.value }))} placeholder="Reason for override..." />
            <p className="text-xs text-adv-gray mt-1">Required when agent exceeds auto-approve</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark disabled:opacity-40">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Budget Rules'}
        </button>
        {saved && <span className="text-sm text-adv-green">Rules saved successfully</span>}
      </div>
    </div>
  );
}
