/**
 * MissionCard — clickable summary card for the mission list.
 */

import { Link } from 'react-router-dom';
import { Target, ChevronRight, AlertTriangle } from 'lucide-react';

export type MissionStatus = 'draft' | 'briefed' | 'active' | 'paused' | 'review' | 'completed' | 'aborted';
export type AutonomyLevel = 'check_in' | 'briefing' | 'full_autonomy';
export type Priority = 'low' | 'normal' | 'high' | 'critical';

export interface MissionSummary {
  id: string;
  title: string;
  objective: string;
  status: MissionStatus;
  autonomy_level: AutonomyLevel;
  priority: Priority;
  token_budget_max: number;
  token_budget_consumed: number;
  created_at: string;
  deadline: string | null;
}

const STATUS_META: Record<MissionStatus, { label: string; classes: string }> = {
  draft:     { label: 'Draft',      classes: 'text-adv-gray border-border bg-adv-dark' },
  briefed:   { label: 'Plan Ready', classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  active:    { label: 'Active',     classes: 'text-adv-teal border-adv-teal/40 bg-adv-teal/10' },
  paused:    { label: 'Paused',     classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10' },
  review:    { label: 'Review',     classes: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10' },
  completed: { label: 'Completed',  classes: 'text-adv-green border-adv-green/40 bg-adv-green/10' },
  aborted:   { label: 'Aborted',    classes: 'text-adv-red border-adv-red/40 bg-adv-red/10' },
};

const AUTONOMY_LABEL: Record<AutonomyLevel, string> = {
  check_in: 'Check-in',
  briefing: 'Briefing',
  full_autonomy: 'Full',
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function MissionCard({ mission }: { mission: MissionSummary }) {
  const status = STATUS_META[mission.status];
  const tokenPct = mission.token_budget_max > 0 ? mission.token_budget_consumed / mission.token_budget_max : 0;
  const budgetWarning = tokenPct >= 0.8;

  return (
    <Link
      to={`/missions/${mission.id}`}
      className="group block rounded-xl border border-border bg-adv-card hover:border-adv-teal/40 transition-colors"
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <Target className="h-5 w-5 text-adv-teal shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-adv-off-white truncate">{mission.title}</span>
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${status.classes}`}>
              {status.label}
            </span>
            <span className="text-[10px] text-adv-gray">Autonomy: {AUTONOMY_LABEL[mission.autonomy_level]}</span>
            {mission.priority !== 'normal' && (
              <span className={`text-[10px] uppercase tracking-wider font-medium ${mission.priority === 'critical' ? 'text-adv-red' : mission.priority === 'high' ? 'text-adv-gold' : 'text-adv-gray'}`}>
                {mission.priority}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-adv-gray line-clamp-2">{mission.objective}</p>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-adv-gray/80 flex-wrap">
            <span>Created {relativeTime(mission.created_at)}</span>
            {mission.deadline && (<><span>·</span><span>Due {new Date(mission.deadline).toLocaleDateString()}</span></>)}
            <span>·</span>
            <span className={budgetWarning ? 'text-adv-gold' : ''}>
              {budgetWarning && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
              {Math.round(tokenPct * 100)}% of {(mission.token_budget_max / 1000).toFixed(0)}k tokens
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-adv-gray group-hover:text-adv-teal shrink-0" />
      </div>
    </Link>
  );
}
