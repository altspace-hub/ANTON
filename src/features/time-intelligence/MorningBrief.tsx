import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, AlertTriangle, Clock, AlertCircle, ArrowRight, BarChart2 } from 'lucide-react';

interface Deadline {
  id: string;
  title: string;
  due_date: string;
  status: 'upcoming' | 'in_progress' | 'review' | 'completed' | 'overdue' | 'at_risk';
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

interface MorningBrief {
  overdue: Deadline[];
  dueToday: Deadline[];
  atRisk: Deadline[];
  dueThisWeek: Deadline[];
  allocatedHoursThisWeek: number;
  availableHoursThisWeek: number;
  capacityWarning: boolean;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return `${Math.abs(diffDays)} days late`;
  if (diffDays === -1) return 'due yesterday';
  if (diffDays === 0) return 'due today';
  if (diffDays === 1) return 'due tomorrow';
  if (diffDays < 7) return `due in ${diffDays} days`;
  return `due ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

export default function MorningBrief() {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/deadlines/morning-brief', { headers: { ...getAuthHeader() } })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load brief');
        return r.json() as Promise<MorningBrief>;
      })
      .then(setBrief)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const totalUrgent = (brief?.overdue?.length ?? 0) + (brief?.dueToday?.length ?? 0) + (brief?.atRisk?.length ?? 0);

  if (loading) {
    return (
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-5">
        <div className="flex items-center gap-2 text-adv-gray">
          <Calendar className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Loading today's brief...</span>
        </div>
      </div>
    );
  }

  if (error || !brief) {
    // Silently hide if there's no deadline data yet
    return null;
  }

  const hasAnything =
    (brief.overdue?.length ?? 0) > 0 ||
    (brief.dueToday?.length ?? 0) > 0 ||
    (brief.atRisk?.length ?? 0) > 0 ||
    (brief.dueThisWeek?.length ?? 0) > 0 ||
    brief.capacityWarning;

  if (!hasAnything) {
    return (
      <div className="mb-6 rounded-xl border border-border bg-adv-card px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-adv-teal" />
            <span className="text-sm font-semibold text-adv-teal">Today's Brief</span>
          </div>
          <Link to="/deadlines" className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors">
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-2 text-xs text-adv-gray">No upcoming deadlines. You're all clear.</p>
      </div>
    );
  }

  const capacityPct = Math.round((brief.allocatedHoursThisWeek / brief.availableHoursThisWeek) * 100);

  return (
    <div className={`mb-6 rounded-xl border bg-adv-card px-5 py-4 ${totalUrgent > 0 ? 'border-adv-gold/30' : 'border-border'}`}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className={`h-4 w-4 ${totalUrgent > 0 ? 'text-adv-gold' : 'text-adv-teal'}`} />
          <span className={`text-sm font-semibold ${totalUrgent > 0 ? 'text-adv-gold' : 'text-adv-teal'}`}>
            Today's Brief
          </span>
          {totalUrgent > 0 && (
            <span className="rounded-full bg-adv-red/20 px-2 py-0.5 text-xs font-semibold text-adv-red">
              {totalUrgent} urgent
            </span>
          )}
        </div>
        <Link to="/deadlines" className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors">
          View All <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-3">
        {/* Overdue */}
        {brief.overdue.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-adv-red" />
              <span className="text-xs font-semibold text-adv-red uppercase tracking-wide">
                Overdue ({brief.overdue.length})
              </span>
            </div>
            <ul className="ml-5 space-y-0.5">
              {brief.overdue.slice(0, 3).map((d) => (
                <li key={d.id} className="text-xs text-adv-off-white">
                  <span className="font-medium">{d.title}</span>
                  <span className="ml-1 text-adv-red">&mdash; {formatDueDate(d.due_date)}</span>
                </li>
              ))}
              {brief.overdue.length > 3 && (
                <li className="text-xs text-adv-gray">+{brief.overdue.length - 3} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Due Today */}
        {brief.dueToday.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-adv-gold" />
              <span className="text-xs font-semibold text-adv-gold uppercase tracking-wide">
                Due Today ({brief.dueToday.length})
              </span>
            </div>
            <ul className="ml-5 space-y-0.5">
              {brief.dueToday.slice(0, 3).map((d) => (
                <li key={d.id} className="text-xs text-adv-off-white">
                  <span className="font-medium">{d.title}</span>
                </li>
              ))}
              {brief.dueToday.length > 3 && (
                <li className="text-xs text-adv-gray">+{brief.dueToday.length - 3} more</li>
              )}
            </ul>
          </div>
        )}

        {/* At Risk */}
        {brief.atRisk.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-adv-gold" />
              <span className="text-xs font-semibold text-adv-gold uppercase tracking-wide">
                At Risk ({brief.atRisk.length})
              </span>
            </div>
            <ul className="ml-5 space-y-0.5">
              {brief.atRisk.slice(0, 2).map((d) => (
                <li key={d.id} className="text-xs text-adv-off-white">
                  <span className="font-medium">{d.title}</span>
                  <span className="ml-1 text-adv-gray">&mdash; should have started</span>
                </li>
              ))}
              {brief.atRisk.length > 2 && (
                <li className="text-xs text-adv-gray">+{brief.atRisk.length - 2} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Due This Week (compact) */}
        {brief.dueThisWeek.length > 0 && (
          <div className="text-xs text-adv-gray">
            <span className="font-medium text-adv-off-white">{brief.dueThisWeek.length}</span> more due this week
          </div>
        )}

        {/* Capacity bar */}
        <div className="border-t border-border pt-2">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5 text-adv-gray" />
              <span className="text-xs text-adv-gray">This week</span>
            </div>
            <span className={`text-xs font-medium ${capacityPct > 100 ? 'text-adv-red' : capacityPct > 80 ? 'text-adv-gold' : 'text-adv-gray'}`}>
              {brief.allocatedHoursThisWeek}h of {brief.availableHoursThisWeek}h ({capacityPct}%)
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-adv-dark">
            <div
              className={`h-1.5 rounded-full transition-all ${
                capacityPct > 100 ? 'bg-adv-red' : capacityPct > 80 ? 'bg-adv-gold' : 'bg-adv-teal'
              }`}
              style={{ width: `${Math.min(capacityPct, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
