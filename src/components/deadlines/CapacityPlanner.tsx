import { useState, useEffect } from 'react';
import { BarChart2, ChevronRight } from 'lucide-react';
import type { WeekConflict } from './types';
import { apiGet } from './types';

export default function CapacityPlanner() {
  const [conflicts, setConflicts] = useState<WeekConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiGet<WeekConflict[]>('/api/deadlines/conflicts')
      .then(setConflicts)
      .catch(() => setConflicts([]))
      .finally(() => setLoading(false));
  }, [open]);

  function formatWeek(start: string): string {
    const d = new Date(start);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-adv-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-adv-teal" />
          <span className="text-sm font-semibold text-adv-off-white">Capacity Planner</span>
          <span className="text-xs text-adv-gray-med">Week-by-week load analysis</span>
        </div>
        <ChevronRight className={`h-4 w-4 text-adv-gray transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-5">
          {loading ? (
            <p className="pt-4 text-sm text-adv-gray-med">Loading capacity data...</p>
          ) : conflicts.length === 0 ? (
            <p className="pt-4 text-sm text-adv-gray-med">No capacity data available.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {conflicts.map((week) => {
                const pct = Math.round((week.allocatedHours / week.availableHours) * 100);
                return (
                  <div key={week.weekStart}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-adv-gray">
                        Week of {formatWeek(week.weekStart)}
                        {week.deadlines.length > 0 && (
                          <span className="ml-1.5 text-adv-gray-med">
                            ({week.deadlines.length} deadline{week.deadlines.length !== 1 ? 's' : ''})
                          </span>
                        )}
                      </span>
                      <span className={`font-medium ${week.overloaded ? 'text-adv-red' : pct > 80 ? 'text-adv-gold' : 'text-adv-gray'}`}>
                        {week.allocatedHours}h / {week.availableHours}h
                        {week.overloaded && ' — OVERLOADED'}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-adv-dark">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          week.overloaded ? 'bg-adv-red' : pct > 80 ? 'bg-adv-gold' : 'bg-adv-teal'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
