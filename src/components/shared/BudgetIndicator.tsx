import { useEffect, useState } from 'react';
import { AlertTriangle, DollarSign } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';

interface BudgetStatus {
  budget: number;
  used: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  isNearLimit: boolean;
}

export function BudgetIndicator() {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const { isTeamMode, user } = useAuthStore();

  useEffect(() => {
    if (!isTeamMode || !user || user.id === 'solo') {
      setStatus(null);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setStatus(null);
      return;
    }

    fetch('/api/auth/me/budget', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch budget');
        return res.json();
      })
      .then((data) => {
        if (data.budget && data.budget.budget > 0) {
          setStatus(data.budget);
        } else {
          setStatus(null);
        }
      })
      .catch(() => setStatus(null));
  }, [isTeamMode, user]);

  if (!status || status.budget === 0) return null; // No budget = unlimited

  const color = status.isOverBudget
    ? 'text-adv-red'
    : status.isNearLimit
      ? 'text-adv-gold'
      : 'text-adv-teal';
  const bgColor = status.isOverBudget
    ? 'bg-adv-red/10'
    : status.isNearLimit
      ? 'bg-adv-gold/10'
      : 'bg-adv-teal/10';

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${bgColor} ${color} border ${status.isOverBudget ? 'border-adv-red/30' : status.isNearLimit ? 'border-adv-gold/30' : 'border-adv-teal/30'}`}
      title={`Token budget: ${status.used.toLocaleString()} / ${status.budget.toLocaleString()} (${Math.round(status.percentUsed)}%)`}
    >
      {status.isOverBudget && <AlertTriangle className="h-3.5 w-3.5" />}
      <DollarSign className="h-3.5 w-3.5" />
      <span className="font-medium">
        {status.used.toLocaleString()} / {status.budget.toLocaleString()}
      </span>
      <span className="opacity-75">({Math.round(status.percentUsed)}%)</span>
    </div>
  );
}
