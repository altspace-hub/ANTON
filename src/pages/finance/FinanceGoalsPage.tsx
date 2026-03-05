/**
 * FinanceGoalsPage.tsx
 *
 * Financial goals tracker — set targets, track progress, mark updates.
 */

import { useState, useEffect } from 'react';
import { Target, Plus, X, Loader2, TrendingUp, AlertTriangle, Calendar } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

interface Goal {
  id: number;
  goal_type: 'savings' | 'purchase' | 'retirement' | 'debt_payoff';
  title: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date: string;
  monthly_contribution: number;
  created_at: string;
}

const GOAL_TYPES = [
  { value: 'savings', label: 'Savings', color: 'bg-adv-teal-dim text-adv-teal' },
  { value: 'purchase', label: 'Purchase', color: 'bg-adv-blue/10 text-adv-blue' },
  { value: 'retirement', label: 'Retirement', color: 'bg-adv-green/10 text-adv-green' },
  { value: 'debt_payoff', label: 'Debt Payoff', color: 'bg-adv-red/10 text-adv-red' },
];

function goalTypeColor(type: string) {
  return GOAL_TYPES.find((t) => t.value === type)?.color ?? 'bg-adv-dark text-adv-gray';
}

function formatCurrency(amount: number, currency = 'SEK') {
  return amount.toLocaleString('sv-SE', { style: 'currency', currency, maximumFractionDigits: 0 });
}

function monthsUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.max(0, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
}

function isOnTrack(goal: Goal): boolean {
  if (!goal.target_date || goal.monthly_contribution <= 0) return true;
  const months = monthsUntil(goal.target_date);
  const projected = goal.current_amount + goal.monthly_contribution * months;
  return projected >= goal.target_amount;
}

export default function FinanceGoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progressGoal, setProgressGoal] = useState<Goal | null>(null);
  const [progressAmount, setProgressAmount] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    goal_type: 'savings' as Goal['goal_type'],
    title: '',
    target_amount: '',
    currency: 'SEK',
    target_date: '',
    monthly_contribution: '',
  });

  useEffect(() => {
    loadGoals();
  }, []);

  async function loadGoals() {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/goals', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setGoals(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!formData.title.trim() || !formData.target_amount) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/finance/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          ...formData,
          target_amount: Number(formData.target_amount),
          monthly_contribution: Number(formData.monthly_contribution) || 0,
          current_amount: 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create goal');
      }
      const goal = await res.json();
      setGoals((prev) => [goal, ...prev]);
      setShowForm(false);
      setFormData({ goal_type: 'savings', title: '', target_amount: '', currency: 'SEK', target_date: '', monthly_contribution: '' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkProgress() {
    if (!progressGoal || !progressAmount) return;
    setUpdatingId(progressGoal.id);
    try {
      const res = await fetch(`/api/finance/goals/${progressGoal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ current_amount: Number(progressAmount) }),
      });
      if (res.ok) {
        setGoals((prev) =>
          prev.map((g) => g.id === progressGoal.id ? { ...g, current_amount: Number(progressAmount) } : g)
        );
        setProgressGoal(null);
        setProgressAmount('');
      }
    } catch {
      // non-fatal
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-green/10">
              <Target className="h-5 w-5 text-adv-green" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">Financial Goals</h1>
              <p className="text-sm text-adv-gray">Track targets and stay on course</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Goal'}
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-5">
        {/* Add form */}
        {showForm && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
            <h2 className="font-semibold text-adv-off-white">New Goal</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs text-adv-gray">Title *</span>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Buy a car, Emergency fund, Pay off student loan"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Goal type</span>
                <select value={formData.goal_type} onChange={(e) => setFormData({ ...formData, goal_type: e.target.value as Goal['goal_type'] })}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                  {GOAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Currency</span>
                <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                  <option value="SEK">SEK</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Target amount *</span>
                <input type="number" value={formData.target_amount} onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                  placeholder="e.g. 100000"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Monthly contribution</span>
                <input type="number" value={formData.monthly_contribution} onChange={(e) => setFormData({ ...formData, monthly_contribution: e.target.value })}
                  placeholder="e.g. 3000"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-adv-gray">Target date</span>
                <input type="date" value={formData.target_date} onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
            </div>
            {error && <p className="text-sm text-adv-red">{error}</p>}
            <button onClick={handleAdd} disabled={saving || !formData.title.trim() || !formData.target_amount}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Goal
            </button>
          </div>
        )}

        {/* Mark Progress modal */}
        {progressGoal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-adv-dark/80 p-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-adv-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-adv-off-white">Update Progress</h3>
                <button onClick={() => setProgressGoal(null)} className="text-adv-gray hover:text-adv-off-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-adv-gray">
                Current: <span className="text-adv-off-white font-semibold">{formatCurrency(progressGoal.current_amount, progressGoal.currency)}</span>
                {' '}/ Target: <span className="text-adv-off-white font-semibold">{formatCurrency(progressGoal.target_amount, progressGoal.currency)}</span>
              </p>
              <label className="space-y-1 block">
                <span className="text-xs text-adv-gray">New current amount ({progressGoal.currency})</span>
                <input type="number" value={progressAmount} onChange={(e) => setProgressAmount(e.target.value)}
                  placeholder={String(progressGoal.current_amount)}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
              </label>
              <div className="flex gap-2">
                <button onClick={handleMarkProgress} disabled={!progressAmount || updatingId !== null}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
                  {updatingId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
                <button onClick={() => setProgressGoal(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Goals list */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-adv-gray">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading goals…</span>
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="mb-3 h-10 w-10 text-adv-gray-med" />
            <h3 className="mb-1 font-semibold text-adv-off-white">No goals yet</h3>
            <p className="text-sm text-adv-gray">Add your first financial goal to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {goals.map((goal) => {
              const pct = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
              const onTrack = isOnTrack(goal);
              const months = goal.target_date ? monthsUntil(goal.target_date) : null;

              return (
                <div key={goal.id} className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${goalTypeColor(goal.goal_type)}`}>
                          {goal.goal_type.replace('_', ' ')}
                        </span>
                        <span className={`text-xs font-medium ${onTrack ? 'text-adv-green' : 'text-adv-gold'}`}>
                          {onTrack ? 'On track' : 'Behind'}
                        </span>
                      </div>
                      <h3 className="font-semibold text-adv-off-white">{goal.title}</h3>
                    </div>
                    <TrendingUp className={`h-5 w-5 shrink-0 mt-1 ${onTrack ? 'text-adv-green' : 'text-adv-gold'}`} />
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-adv-gray">{formatCurrency(goal.current_amount, goal.currency)}</span>
                      <span className="font-semibold text-adv-off-white">{pct}%</span>
                      <span className="text-adv-gray">{formatCurrency(goal.target_amount, goal.currency)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-adv-dark">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-adv-green' : onTrack ? 'bg-adv-teal' : 'bg-adv-gold'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-adv-gray">
                    {goal.monthly_contribution > 0 && (
                      <span>{formatCurrency(goal.monthly_contribution, goal.currency)}/mo</span>
                    )}
                    {goal.target_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {months !== null ? `${months} months left` : ''}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => { setProgressGoal(goal); setProgressAmount(String(goal.current_amount)); }}
                    className="w-full rounded-lg border border-adv-teal/30 bg-adv-teal-dim py-2 text-sm font-medium text-adv-teal hover:bg-adv-teal hover:text-adv-dark transition-colors"
                  >
                    Mark Progress
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Disclaimer */}
        <div className="flex items-start gap-3 rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adv-gold" />
          <p className="text-sm text-adv-gold">
            Educational tool only. On-track calculations assume constant contributions and do not account for interest or inflation.
          </p>
        </div>
      </div>
    </div>
  );
}
