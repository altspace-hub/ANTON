/**
 * TaskGraphView — vertical task list with status, dependencies, and outputs.
 *
 * Phase 1 renders the DAG as an indented vertical list. Phase 2 will swap in
 * a proper graph visualisation (e.g. ReactFlow) when parallel groups land.
 */

import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, AlertCircle, Pause, ChevronDown, ChevronRight, Clock, Hexagon } from 'lucide-react';

export type TaskStatus = 'queued' | 'active' | 'completed' | 'failed' | 'skipped' | 'blocked' | 'paused';
export type TaskType = 'llm' | 'research' | 'analysis' | 'export' | 'review' | 'notification' | 'checkpoint' | 'conditional' | 'parallel_group' | 'browser' | 'api_call' | 'database_query';

export interface TaskNode {
  id: string;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  sort_order: number;
  parent_task_id: string | null;
  output_summary: string | null;
  output_full: string | null;
  actual_tokens_consumed: number;
  estimated_tokens: number | null;
  retry_count: number;
  last_error: string | null;
  provider: string | null;
  model: string | null;
}

export interface DependencyEdge {
  task_id: string;
  depends_on_task_id: string;
}

interface TaskGraphViewProps {
  tasks: TaskNode[];
  dependencies: DependencyEdge[];
  onApprove?: (taskId: string) => Promise<void>;
  onReject?: (taskId: string, feedback: string) => Promise<void>;
}

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  queued:    <Clock className="h-3.5 w-3.5 text-adv-gray" />,
  active:    <Loader2 className="h-3.5 w-3.5 text-adv-teal animate-spin" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-adv-green" />,
  failed:    <AlertCircle className="h-3.5 w-3.5 text-adv-red" />,
  skipped:   <Circle className="h-3.5 w-3.5 text-adv-gray/50" />,
  blocked:   <AlertCircle className="h-3.5 w-3.5 text-adv-gold" />,
  paused:    <Pause className="h-3.5 w-3.5 text-adv-gold" />,
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: 'Queued', active: 'Active', completed: 'Done',
  failed: 'Failed', skipped: 'Skipped', blocked: 'Blocked', paused: 'Awaiting human',
};

function TaskCard({ task, depends, dependents, onApprove, onReject }: {
  task: TaskNode;
  depends: TaskNode[];
  dependents: TaskNode[];
  onApprove?: (id: string) => Promise<void>;
  onReject?: (id: string, feedback: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(task.status === 'active' || task.status === 'paused');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isCheckpoint = task.task_type === 'checkpoint';
  const awaitingHuman = isCheckpoint && task.status === 'paused';

  async function handleApprove() {
    if (!onApprove) return;
    setSubmitting(true);
    try { await onApprove(task.id); } finally { setSubmitting(false); }
  }
  async function handleReject() {
    if (!onReject || !feedback.trim()) return;
    setSubmitting(true);
    try {
      await onReject(task.id, feedback.trim());
      setFeedback('');
      setShowRejectForm(false);
    } finally { setSubmitting(false); }
  }

  return (
    <div className={`rounded-lg border ${awaitingHuman ? 'border-adv-gold/40 bg-adv-gold/5' : 'border-border bg-adv-card'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-start gap-2 text-left hover:bg-adv-dark/30 transition-colors"
      >
        {STATUS_ICON[task.status]}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isCheckpoint && <Hexagon className="h-3 w-3 text-adv-gold" />}
            <span className="text-xs font-medium text-adv-off-white">{task.title}</span>
            <span className="text-[10px] text-adv-gray">{STATUS_LABEL[task.status]}</span>
            <span className="text-[10px] text-adv-gray/60">{task.task_type}</span>
            {task.actual_tokens_consumed > 0 && (
              <span className="text-[10px] text-adv-gray/60">{task.actual_tokens_consumed.toLocaleString()} tok</span>
            )}
            {task.retry_count > 0 && (
              <span className="text-[10px] text-adv-gold">retry {task.retry_count}</span>
            )}
          </div>
          {task.description && (
            <p className="mt-0.5 text-[11px] text-adv-gray line-clamp-1">{task.description}</p>
          )}
        </div>
        {expanded ? <ChevronDown className="h-3 w-3 text-adv-gray" /> : <ChevronRight className="h-3 w-3 text-adv-gray" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
          {depends.length > 0 && (
            <div className="text-[10px] text-adv-gray">
              <span className="font-semibold">Depends on:</span> {depends.map(d => d.title).join(', ')}
            </div>
          )}
          {dependents.length > 0 && (
            <div className="text-[10px] text-adv-gray">
              <span className="font-semibold">Unblocks:</span> {dependents.map(d => d.title).join(', ')}
            </div>
          )}

          {task.last_error && (
            <div className="rounded border border-adv-red/30 bg-adv-red/10 px-2 py-1.5 text-[11px] text-adv-red">
              {task.last_error}
            </div>
          )}

          {task.output_full && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-adv-gray font-semibold mb-1">Output</div>
              <pre className="rounded border border-border bg-adv-dark p-2 text-[11px] text-adv-off-white whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                {task.output_full}
              </pre>
              {task.provider && task.model && (
                <div className="mt-1 text-[10px] text-adv-gray">via {task.provider}/{task.model}</div>
              )}
            </div>
          )}

          {awaitingHuman && (onApprove || onReject) && (
            <div className="pt-2 border-t border-adv-gold/20">
              <div className="text-[11px] text-adv-gold font-medium mb-1">
                Awaiting your approval
              </div>
              {!showRejectForm ? (
                <div className="flex items-center gap-2">
                  {onApprove && (
                    <button
                      onClick={handleApprove}
                      disabled={submitting}
                      className="rounded border border-adv-green/40 bg-adv-green/10 px-2.5 py-1 text-[11px] text-adv-green hover:bg-adv-green/20 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Approve
                    </button>
                  )}
                  {onReject && (
                    <button
                      onClick={() => setShowRejectForm(true)}
                      className="rounded border border-adv-red/40 bg-adv-red/10 px-2.5 py-1 text-[11px] text-adv-red hover:bg-adv-red/20 inline-flex items-center gap-1"
                    >
                      <AlertCircle className="h-3 w-3" />
                      Reject with feedback
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="What needs to change?"
                    rows={3}
                    className="w-full rounded border border-adv-red/30 bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-red focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowRejectForm(false); setFeedback(''); }}
                      className="rounded border border-border px-2 py-1 text-[10px] text-adv-gray hover:text-adv-off-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={submitting || !feedback.trim()}
                      className="rounded bg-adv-red px-2.5 py-1 text-[10px] font-medium text-white hover:bg-adv-red/80 disabled:opacity-50"
                    >
                      {submitting ? 'Submitting…' : 'Submit feedback'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskGraphView({ tasks, dependencies, onApprove, onReject }: TaskGraphViewProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-adv-card/30 p-8 text-center text-xs text-adv-gray italic">
        No tasks yet. Generate a plan to populate the task graph.
      </div>
    );
  }

  const tasksById = new Map(tasks.map(t => [t.id, t]));
  const depsByTask = new Map<string, TaskNode[]>();
  const reverseDepsByTask = new Map<string, TaskNode[]>();
  for (const t of tasks) { depsByTask.set(t.id, []); reverseDepsByTask.set(t.id, []); }
  for (const d of dependencies) {
    const dep = tasksById.get(d.depends_on_task_id);
    const dependent = tasksById.get(d.task_id);
    if (dep && dependent) {
      depsByTask.get(d.task_id)?.push(dep);
      reverseDepsByTask.get(d.depends_on_task_id)?.push(dependent);
    }
  }

  return (
    <ul className="space-y-2">
      {tasks.map(t => (
        <li key={t.id}>
          <TaskCard
            task={t}
            depends={depsByTask.get(t.id) ?? []}
            dependents={reverseDepsByTask.get(t.id) ?? []}
            onApprove={onApprove}
            onReject={onReject}
          />
        </li>
      ))}
    </ul>
  );
}
