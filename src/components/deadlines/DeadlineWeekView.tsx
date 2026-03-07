import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Deadline, DeadlineLabel } from './types';
import { PRIORITY_CONFIG, formatRelativeDue, parseLabels } from './types';

interface DeadlineWeekViewProps {
  deadlines: Deadline[];
  labels: DeadlineLabel[];
  onSelect: (d: Deadline) => void;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Get Monday of the week containing the given date. */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun,1=Mon,...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* ------------------------------------------------------------------ */
/*  Compact card for a day cell                                        */
/* ------------------------------------------------------------------ */

function DayCard({
  deadline,
  labels,
  onSelect,
}: {
  deadline: Deadline;
  labels: DeadlineLabel[];
  onSelect: (d: Deadline) => void;
}) {
  const prio = PRIORITY_CONFIG[deadline.priority];
  const dlLabels = parseLabels(deadline.labels);
  const matchedLabels = labels.filter((l) => dlLabels.includes(l.id));

  return (
    <button
      onClick={() => onSelect(deadline)}
      className="w-full rounded-lg border border-border bg-adv-dark-2 p-2 text-left transition-colors hover:border-adv-teal/40"
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${prio.dot}`} />
        <span className="truncate text-xs font-medium text-adv-off-white">
          {deadline.title}
        </span>
      </div>
      {matchedLabels.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {matchedLabels.slice(0, 2).map((l) => (
            <span
              key={l.id}
              className="rounded px-1 py-0.5 text-xs"
              style={{ backgroundColor: l.color + '22', color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Week View                                                     */
/* ------------------------------------------------------------------ */

export default function DeadlineWeekView({
  deadlines,
  labels,
  onSelect,
}: DeadlineWeekViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const monday = useMemo(() => {
    const m = getMonday(today);
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [today, weekOffset]);

  // Build array of 7 days
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [monday]);

  // Group deadlines by date key
  const groupedByDay = useMemo(() => {
    const map: Record<string, Deadline[]> = {};
    for (const d of days) {
      map[dateKey(d)] = [];
    }
    for (const dl of deadlines) {
      const key = dl.due_date.slice(0, 10);
      if (map[key]) {
        map[key].push(dl);
      }
    }
    return map;
  }, [deadlines, days]);

  const todayKey = dateKey(today);
  const sundayDate = days[6];
  const weekRange = `${formatShortDate(monday)} - ${formatShortDate(sundayDate)}`;

  return (
    <div>
      {/* Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-adv-gray transition-colors hover:bg-adv-card hover:text-adv-off-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev Week
        </button>

        <div className="text-center">
          <span className="text-sm font-medium text-adv-off-white">
            {weekRange}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-lg px-3 py-1.5 text-sm text-adv-teal transition-colors hover:bg-adv-teal/10"
            >
              This Week
            </button>
          )}
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-adv-gray transition-colors hover:bg-adv-card hover:text-adv-off-white"
          >
            Next Week
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const key = dateKey(day);
          const isToday = key === todayKey;
          const items = groupedByDay[key] || [];

          return (
            <div
              key={key}
              className={`flex flex-col rounded-xl border bg-adv-dark ${
                isToday ? 'border-adv-teal/30' : 'border-border'
              }`}
            >
              {/* Day header */}
              <div
                className={`px-3 py-2 text-center ${
                  isToday ? 'bg-adv-teal/5' : ''
                }`}
              >
                <p className="text-xs text-adv-gray">{DAY_NAMES[i]}</p>
                <p
                  className={`text-sm font-semibold ${
                    isToday ? 'text-adv-teal' : 'text-adv-off-white'
                  }`}
                >
                  {day.getDate()}
                </p>
              </div>

              {/* Deadlines */}
              <div className="flex flex-1 flex-col gap-1.5 px-2 pb-2">
                {items.length === 0 ? (
                  <p className="py-4 text-center text-xs text-adv-gray">
                    No deadlines
                  </p>
                ) : (
                  items.map((dl) => (
                    <DayCard
                      key={dl.id}
                      deadline={dl}
                      labels={labels}
                      onSelect={onSelect}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
