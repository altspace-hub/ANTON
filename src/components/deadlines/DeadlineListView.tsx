import { RefreshCw, AlertCircle } from 'lucide-react';
import type { Deadline, DeadlineLabel, FilterType } from './types';
import DeadlineCard from './DeadlineCard';

const FILTER_LABELS: Record<FilterType, string> = {
  all: 'All',
  today: 'Today',
  week: 'This Week',
  overdue: 'Overdue',
  at_risk: 'At Risk',
};

interface DeadlineListViewProps {
  deadlines: Deadline[];
  labels: DeadlineLabel[];
  filter: FilterType;
  onFilterChange: (f: FilterType) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onSelect: (d: Deadline) => void;
  onRefresh: () => void;
}

export default function DeadlineListView({
  deadlines,
  labels,
  filter,
  onFilterChange,
  onComplete,
  onDelete,
  onSelect,
  onRefresh,
}: DeadlineListViewProps) {
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Compute filter counts
  const overdueCount = deadlines.filter(d => d.status === 'overdue').length;
  const atRiskCount = deadlines.filter(d => d.status === 'at_risk').length;
  const todayCount = deadlines.filter(d => {
    const due = new Date(d.due_date);
    return due <= todayEnd && due >= now;
  }).length;
  const weekCount = deadlines.filter(d => {
    const due = new Date(d.due_date);
    return due <= weekEnd;
  }).length;

  function getFilterCount(f: FilterType): number {
    switch (f) {
      case 'overdue': return overdueCount;
      case 'at_risk': return atRiskCount;
      case 'today': return todayCount;
      case 'week': return weekCount;
      case 'all': return deadlines.length;
    }
  }

  // Apply filter
  const filtered = deadlines.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return d.status === 'overdue';
    if (filter === 'at_risk') return d.status === 'at_risk';
    if (filter === 'today') {
      const due = new Date(d.due_date);
      return due <= todayEnd && due >= now;
    }
    if (filter === 'week') {
      const due = new Date(d.due_date);
      return due <= weekEnd;
    }
    return true;
  });

  // Separate parent deadlines and subtasks
  const parentDeadlines = filtered.filter(d => !d.parent_id);
  const subtaskMap = new Map<string, Deadline[]>();
  filtered.forEach(d => {
    if (d.parent_id) {
      const existing = subtaskMap.get(d.parent_id) ?? [];
      existing.push(d);
      subtaskMap.set(d.parent_id, existing);
    }
  });

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => {
          const count = getFilterCount(f);
          return (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-adv-teal text-adv-dark'
                  : 'border border-border bg-adv-card text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {FILTER_LABELS[f]}
              {count > 0 && filter !== f && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  (f === 'overdue' || f === 'at_risk') ? 'bg-adv-red/20 text-adv-red' : 'bg-adv-dark text-adv-gray-med'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={onRefresh}
          className="ml-auto rounded-lg border border-border bg-adv-card p-1.5 text-adv-gray transition-colors hover:text-adv-teal"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Deadline cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-adv-card p-10 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-adv-gray-med" />
          <p className="text-sm text-adv-gray-med">
            {filter === 'all'
              ? 'No deadlines yet. Click "Add Task" to create one.'
              : `No deadlines match the "${FILTER_LABELS[filter]}" filter.`}
          </p>
          {filter !== 'all' && (
            <button onClick={() => onFilterChange('all')} className="mt-2 text-xs text-adv-teal hover:underline">
              Show all deadlines
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {parentDeadlines.map((d) => (
            <div key={d.id}>
              <DeadlineCard
                deadline={d}
                labels={labels}
                onComplete={onComplete}
                onDelete={onDelete}
                onClick={onSelect}
              />
              {/* Subtasks indented */}
              {subtaskMap.has(d.id) && (
                <div className="ml-8 mt-1 space-y-1">
                  {subtaskMap.get(d.id)!.map(sub => (
                    <DeadlineCard
                      key={sub.id}
                      deadline={sub}
                      labels={labels}
                      onComplete={onComplete}
                      onDelete={onDelete}
                      onClick={onSelect}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Orphan subtasks (parent not in filtered set) */}
          {filtered
            .filter(d => d.parent_id && !parentDeadlines.some(p => p.id === d.parent_id))
            .map(d => (
              <DeadlineCard
                key={d.id}
                deadline={d}
                labels={labels}
                onComplete={onComplete}
                onDelete={onDelete}
                onClick={onSelect}
              />
            ))
          }
        </div>
      )}
    </div>
  );
}
