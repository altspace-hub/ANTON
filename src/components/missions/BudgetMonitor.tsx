/**
 * BudgetMonitor — token, time, and financial budget consumption display.
 */

import { Coins, Clock, Wallet } from 'lucide-react';

interface BudgetSnapshot {
  consumed: number;
  max: number;
  pct: number;
  warning: boolean;
  exceeded: boolean;
}

interface BudgetMonitorProps {
  tokens: BudgetSnapshot;
  time: { consumed_seconds: number; max_seconds: number; pct: number; warning: boolean; exceeded: boolean };
  financial: BudgetSnapshot;
}

function colorFor(pct: number, exceeded: boolean): string {
  if (exceeded) return 'bg-adv-red';
  if (pct >= 0.8) return 'bg-adv-gold';
  return 'bg-adv-teal';
}

function Bar({ icon, label, value, total, format, snapshot }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  total: string;
  format: 'tokens' | 'time' | 'money';
  snapshot: { pct: number; warning: boolean; exceeded: boolean };
}) {
  const pct = Math.max(0, Math.min(1, snapshot.pct));
  const widthPct = (pct * 100).toFixed(1);
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-[11px]">
        <span className="inline-flex items-center gap-1 text-adv-gray">
          {icon}
          {label}
        </span>
        <span className={snapshot.exceeded ? 'text-adv-red font-medium' : snapshot.warning ? 'text-adv-gold' : 'text-adv-off-white'}>
          {value} / {total}
          <span className="text-adv-gray/60 ml-1">({(pct * 100).toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-adv-dark border border-border overflow-hidden">
        <div className={`h-full transition-all ${colorFor(snapshot.pct, snapshot.exceeded)}`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function formatSeconds(s: number): string {
  if (s >= 86400) return `${(s / 86400).toFixed(1)}d`;
  if (s >= 3600) return `${(s / 3600).toFixed(1)}h`;
  if (s >= 60) return `${Math.round(s / 60)}m`;
  return `${s}s`;
}

export default function BudgetMonitor({ tokens, time, financial }: BudgetMonitorProps) {
  return (
    <div className="space-y-2.5">
      <Bar
        icon={<Coins className="h-3 w-3" />}
        label="Tokens"
        value={formatTokens(tokens.consumed)}
        total={formatTokens(tokens.max)}
        format="tokens"
        snapshot={tokens}
      />
      <Bar
        icon={<Clock className="h-3 w-3" />}
        label="Active time"
        value={formatSeconds(time.consumed_seconds)}
        total={formatSeconds(time.max_seconds)}
        format="time"
        snapshot={time}
      />
      {financial.max > 0 && (
        <Bar
          icon={<Wallet className="h-3 w-3" />}
          label="Spend"
          value={`$${financial.consumed.toFixed(2)}`}
          total={`$${financial.max.toFixed(2)}`}
          format="money"
          snapshot={financial}
        />
      )}
    </div>
  );
}
