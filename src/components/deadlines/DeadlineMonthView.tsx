import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Deadline, DeadlineLabel } from './types';
import { PRIORITY_CONFIG, formatRelativeDue, parseLabels } from './types';

interface DeadlineMonthViewProps {
  deadlines: Deadline[];
  labels: DeadlineLabel[];
  onSelect: (d: Deadline) => void;
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Build the 6-row grid of day cells for a month. */
function buildCalendarGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  // weekday of the 1st, adjusted to Mon=0
  let startDay = first.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - startDay);

  const rows: Date[][] = [];
  const cursor = new Date(gridStart);

  for (let r = 0; r < 6; r++) {
    const row: Date[] = [];
    for (let c = 0; c < 7; c++) {
      row.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/*  Mini-card shown when a day is expanded                             */
/* ------------------------------------------------------------------ */

function MiniCard({
  deadline,
  labels,
  onSelect,
}: {
  deadline: Deadline;
  labels: DeadlineLabel[];
  onSelect: (d: Deadline) => void;
}) {
  const prio = PRIORITY_CONFIG[deadline.priority];
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect(deadline);
      }}
      className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-adv-dark-2"
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${prio.dot}`} />
      <span className="truncate text-xs text-adv-off-white">
        {deadline.title}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Month View                                                    */
/* ------------------------------------------------------------------ */

export default function DeadlineMonthView({
  deadlines,
  labels,
  onSelect,
}: DeadlineMonthViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayKey = dateKey(today);

  const grid = useMemo(
    () => buildCalendarGrid(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth]
  );

  // Index deadlines by date
  const deadlinesByDate = useMemo(() => {
    const map: Record<string, Deadline[]> = {};
    for (const d of deadlines) {
      const key = d.due_date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    return map;
  }, [deadlines]);

  const monthLabel = currentMonth.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  function prevMonth() {
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
    );
    setExpandedDay(null);
  }

  function nextMonth() {
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
    );
    setExpandedDay(null);
  }

  function goToday() {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setExpandedDay(null);
  }

  return (
    <div>
      {/* Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-adv-gray transition-colors hover:bg-adv-card hover:text-adv-off-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev Month
        </button>

        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-adv-off-white">
            {monthLabel}
          </h3>
          {!sameMonth(currentMonth, today) && (
            <button
              onClick={goToday}
              className="rounded-lg px-3 py-1.5 text-sm text-adv-teal transition-colors hover:bg-adv-teal/10"
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={nextMonth}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-adv-gray transition-colors hover:bg-adv-card hover:text-adv-off-white"
        >
          Next Month
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAY_HEADERS.map((dh) => (
          <div
            key={dh}
            className="py-1 text-center text-xs font-medium text-adv-gray"
          >
            {dh}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.flat().map((day) => {
          const key = dateKey(day);
          const isToday = key === todayKey;
          const isCurrentMonth = sameMonth(day, currentMonth);
          const items = deadlinesByDate[key] || [];
          const isExpanded = expandedDay === key;

          return (
            <div
              key={key}
              onClick={() =>
                setExpandedDay(isExpanded ? null : items.length > 0 ? key : null)
              }
              className={`min-h-[80px] rounded-lg border p-1.5 transition-colors ${
                isToday
                  ? 'border-adv-teal/40 bg-adv-teal/5'
                  : 'border-border bg-adv-dark'
              } ${!isCurrentMonth ? 'opacity-40' : ''} ${
                items.length > 0 ? 'cursor-pointer hover:border-adv-teal/20' : ''
              }`}
            >
              {/* Date number */}
              <p
                className={`text-xs font-medium ${
                  isToday
                    ? 'text-adv-teal'
                    : isCurrentMonth
                    ? 'text-adv-off-white'
                    : 'text-adv-gray'
                }`}
              >
                {day.getDate()}
              </p>

              {/* Dots or expanded cards */}
              {isExpanded ? (
                <div className="mt-1 flex flex-col gap-0.5">
                  {items.map((dl) => (
                    <MiniCard
                      key={dl.id}
                      deadline={dl}
                      labels={labels}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              ) : (
                items.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {items.map((dl) => {
                      const prio = PRIORITY_CONFIG[dl.priority];
                      return (
                        <span
                          key={dl.id}
                          className={`h-2 w-2 rounded-full ${prio.dot}`}
                          title={dl.title}
                        />
                      );
                    })}
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
