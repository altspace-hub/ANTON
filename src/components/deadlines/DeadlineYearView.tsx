import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Deadline } from './types';

interface DeadlineYearViewProps {
  deadlines: Deadline[];
  onSelectMonth: (year: number, month: number) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getLoadColor(count: number): { bg: string; text: string; label: string } {
  if (count === 0) return { bg: 'bg-adv-dark-2', text: 'text-adv-gray', label: 'None' };
  if (count <= 3) return { bg: 'bg-adv-green/15', text: 'text-adv-green', label: 'Light' };
  if (count <= 7) return { bg: 'bg-adv-gold/15', text: 'text-adv-gold', label: 'Moderate' };
  return { bg: 'bg-adv-red/15', text: 'text-adv-red', label: 'Heavy' };
}

export default function DeadlineYearView({
  deadlines,
  onSelectMonth,
}: DeadlineYearViewProps) {
  const [yearOffset, setYearOffset] = useState(0);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const displayYear = currentYear + yearOffset;

  // Count deadlines per month
  const countsByMonth = useMemo(() => {
    const counts: number[] = Array(12).fill(0);
    for (const d of deadlines) {
      const date = new Date(d.due_date);
      if (date.getFullYear() === displayYear) {
        counts[date.getMonth()]++;
      }
    }
    return counts;
  }, [deadlines, displayYear]);

  // Count critical/high deadlines per month for extra detail
  const criticalByMonth = useMemo(() => {
    const counts: number[] = Array(12).fill(0);
    for (const d of deadlines) {
      const date = new Date(d.due_date);
      if (
        date.getFullYear() === displayYear &&
        (d.priority === 'critical' || d.priority === 'high')
      ) {
        counts[date.getMonth()]++;
      }
    }
    return counts;
  }, [deadlines, displayYear]);

  return (
    <div>
      {/* Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => setYearOffset((o) => o - 1)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-adv-gray transition-colors hover:bg-adv-card hover:text-adv-off-white"
        >
          <ChevronLeft className="h-4 w-4" />
          {displayYear - 1}
        </button>

        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-adv-off-white">
            {displayYear}
          </h3>
          {yearOffset !== 0 && (
            <button
              onClick={() => setYearOffset(0)}
              className="rounded-lg px-3 py-1.5 text-sm text-adv-teal transition-colors hover:bg-adv-teal/10"
            >
              This Year
            </button>
          )}
        </div>

        <button
          onClick={() => setYearOffset((o) => o + 1)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-adv-gray transition-colors hover:bg-adv-card hover:text-adv-off-white"
        >
          {displayYear + 1}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 4x3 grid of month cards */}
      <div className="grid grid-cols-4 gap-4">
        {MONTH_NAMES.map((name, i) => {
          const count = countsByMonth[i];
          const critical = criticalByMonth[i];
          const load = getLoadColor(count);
          const isCurrentMonth =
            displayYear === currentYear && i === currentMonth;

          // Load bar width (max out at 12 deadlines)
          const barWidth = Math.min((count / 12) * 100, 100);

          return (
            <button
              key={i}
              onClick={() => onSelectMonth(displayYear, i)}
              className={`rounded-xl border p-4 text-left transition-all hover:shadow-lg ${
                isCurrentMonth
                  ? 'border-adv-teal/50 bg-adv-card shadow-adv-teal/5'
                  : 'border-border bg-adv-card hover:border-adv-teal/20'
              }`}
            >
              {/* Month name */}
              <div className="flex items-center justify-between">
                <h4
                  className={`text-sm font-semibold ${
                    isCurrentMonth ? 'text-adv-teal' : 'text-adv-off-white'
                  }`}
                >
                  {name}
                </h4>
                {isCurrentMonth && (
                  <span className="rounded bg-adv-teal/15 px-1.5 py-0.5 text-xs font-medium text-adv-teal">
                    Now
                  </span>
                )}
              </div>

              {/* Count */}
              <p className="mt-2 text-2xl font-bold text-adv-off-white">
                {count}
              </p>
              <p className="text-xs text-adv-gray">
                {count === 1 ? 'deadline' : 'deadlines'}
                {critical > 0 && (
                  <span className="text-adv-red"> ({critical} critical/high)</span>
                )}
              </p>

              {/* Load bar */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
                {count > 0 && (
                  <div
                    className={`h-full rounded-full transition-all ${
                      count > 7
                        ? 'bg-adv-red'
                        : count > 3
                        ? 'bg-adv-gold'
                        : 'bg-adv-green'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                )}
              </div>

              <p className={`mt-1 text-xs ${load.text}`}>{load.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
