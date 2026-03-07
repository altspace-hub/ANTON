import { useState } from 'react';
import {
  Clock, CheckCircle2, Circle, ChevronDown, ChevronUp, Trash2, Check, Flag, Tag, GitBranch,
} from 'lucide-react';
import type { Deadline, DeadlineLabel } from './types';
import { PRIORITY_CONFIG, STATUS_CONFIG, formatRelativeDue, formatDate, parseLabels } from './types';

interface DeadlineCardProps {
  deadline: Deadline;
  labels: DeadlineLabel[];
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (deadline: Deadline) => void;
  compact?: boolean;
}

function getCardBorder(status: string, due: string): string {
  const now = new Date();
  const dueDate = new Date(due);
  const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (status === 'overdue') return 'border-adv-red/40';
  if (status === 'at_risk') return 'border-adv-gold/40';
  if (diffDays <= 7) return 'border-adv-gold/20';
  return 'border-border';
}

export default function DeadlineCard({ deadline: d, labels, onComplete, onDelete, onClick, compact }: DeadlineCardProps) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_CONFIG[d.priority] ?? PRIORITY_CONFIG.medium;
  const statusCfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.upcoming;
  const borderClass = getCardBorder(d.status, d.due_date);
  const isCompleted = d.status === 'completed';
  const deadlineLabels = parseLabels(d.labels);
  const matchedLabels = labels.filter(l => deadlineLabels.includes(l.id));

  if (compact) {
    return (
      <div
        onClick={() => onClick(d)}
        className={`cursor-pointer rounded-lg border p-2 transition-all hover:border-adv-teal/40 ${borderClass} ${isCompleted ? 'opacity-60' : ''} bg-adv-card`}
      >
        <p className={`text-xs font-medium ${isCompleted ? 'line-through text-adv-gray' : 'text-adv-off-white'}`}>
          {d.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`text-xs ${d.status === 'overdue' ? 'text-adv-red' : 'text-adv-gray'}`}>
            {formatRelativeDue(d.due_date)}
          </span>
          <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border bg-adv-card transition-all ${borderClass} ${isCompleted ? 'opacity-60' : ''}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); if (!isCompleted) onComplete(d.id); }}
            disabled={isCompleted}
            title={isCompleted ? 'Completed' : 'Mark complete'}
            className="mt-0.5 shrink-0 rounded-full p-0.5 text-adv-gray transition-colors hover:text-adv-teal disabled:cursor-default"
          >
            {isCompleted ? <CheckCircle2 className="h-5 w-5 text-adv-green" /> : <Circle className="h-5 w-5" />}
          </button>

          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onClick(d)}>
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-semibold ${isCompleted ? 'line-through text-adv-gray' : 'text-adv-off-white'}`}>
                {d.title}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
                className="shrink-0 text-adv-gray hover:text-adv-off-white transition-colors"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`flex items-center gap-1 text-xs ${
                d.status === 'overdue' ? 'text-adv-red font-semibold' :
                d.status === 'at_risk' ? 'text-adv-gold' : 'text-adv-gray'
              }`}>
                <Clock className="h-3 w-3" />
                {formatRelativeDue(d.due_date)}
              </span>

              <span className={`flex items-center gap-1 text-xs ${priority.color}`}>
                <Flag className="h-3 w-3" />
                {priority.label}
              </span>

              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.color}`}>
                {statusCfg.label}
              </span>

              <span className="flex items-center gap-1 rounded-full bg-adv-dark px-2 py-0.5 text-xs text-adv-gray">
                <Tag className="h-3 w-3" />
                {d.category}
              </span>

              {/* Label chips */}
              {matchedLabels.map(l => (
                <span key={l.id} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: l.color + '20', color: l.color }}>
                  {l.name}
                </span>
              ))}

              {/* Subtask indicator */}
              {d.subtask_count != null && d.subtask_count > 0 && (
                <span className="flex items-center gap-1 text-xs text-adv-gray">
                  <GitBranch className="h-3 w-3" />
                  {d.subtask_completed ?? 0}/{d.subtask_count}
                </span>
              )}
            </div>

            {d.earliest_start && d.status !== 'completed' && (
              <p className="mt-1 text-[11px] text-adv-gray">
                Start by: {formatDate(d.earliest_start)}
              </p>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 border-t border-border pt-3 pl-8">
            {d.description && (
              <p className="mb-2 text-xs leading-relaxed text-adv-gray">{d.description}</p>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-adv-gray">
              <span>Prep: {d.preparation_days}d</span>
              <span>Review: {d.review_days}d</span>
              <span>Buffer: {d.buffer_days}d</span>
              <span>Due: {formatDate(d.due_date)}</span>
              {d.completed_at && <span className="text-adv-green">Completed: {formatDate(d.completed_at)}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              {!isCompleted && (
                <button
                  onClick={(e) => { e.stopPropagation(); onComplete(d.id); }}
                  className="flex items-center gap-1 rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal transition-colors hover:bg-adv-teal/20"
                >
                  <Check className="h-3.5 w-3.5" />
                  Mark Complete
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(d.id); }}
                className="flex items-center gap-1 rounded-lg bg-adv-red/10 px-3 py-1.5 text-xs font-medium text-adv-red transition-colors hover:bg-adv-red/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
