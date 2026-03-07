import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle, Play, Check } from 'lucide-react';

interface Assignment {
  id: string;
  execution_id: string;
  workflow_id: string;
  workflow_name: string;
  step_index: number;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  due_at: string | null;
  sla_hours: number | null;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'reassigned';
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  execution_status: string;
}

function statusBadge(status: Assignment['status']) {
  const map: Record<Assignment['status'], { bg: string; text: string; icon?: React.ReactNode }> = {
    pending:     { bg: 'bg-adv-gray-med/20', text: 'text-adv-gray', icon: <Clock className="h-3 w-3" /> },
    in_progress: { bg: 'bg-adv-blue/20', text: 'text-adv-blue', icon: <Play className="h-3 w-3" /> },
    completed:   { bg: 'bg-adv-teal/20', text: 'text-adv-teal', icon: <CheckCircle className="h-3 w-3" /> },
    overdue:     { bg: 'bg-adv-red/20', text: 'text-adv-red', icon: <AlertTriangle className="h-3 w-3" /> },
    reassigned:  { bg: 'bg-adv-gold/20', text: 'text-adv-gold' },
  };
  return map[status] ?? { bg: 'bg-adv-gray-med/20', text: 'text-adv-gray' };
}

function formatDueDate(dueAt: string | null): { label: string; urgent: boolean } {
  if (!dueAt) return { label: 'No deadline', urgent: false };
  const diff = new Date(dueAt).getTime() - Date.now();
  const hours = diff / 3600000;
  if (hours < 0) return { label: 'Overdue', urgent: true };
  if (hours < 1) return { label: `${Math.round(hours * 60)}m left`, urgent: true };
  if (hours < 24) return { label: `${hours.toFixed(1)}h left`, urgent: hours < 4 };
  return { label: `${Math.ceil(hours / 24)}d left`, urgent: false };
}

async function updateStatus(id: string, status: string) {
  await fetch(`/api/canvas/assignments/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export default function TeamWorkloadView() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    async function fetchAssignments() {
      try {
        const res = await fetch('/api/canvas/my-assignments');
        if (res.ok) {
          setAssignments(await res.json());
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchAssignments();
  }, [refreshTrigger]);

  async function handleStart(id: string) {
    await updateStatus(id, 'in_progress');
    setRefreshTrigger((t) => t + 1);
  }

  async function handleComplete(id: string) {
    await updateStatus(id, 'completed');
    setRefreshTrigger((t) => t + 1);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-adv-card p-4 text-center text-sm text-adv-gray">
        Loading workflow tasks...
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-adv-card p-6 text-center">
        <Clock className="mx-auto mb-2 h-8 w-8 text-adv-gray" />
        <p className="text-sm text-adv-gray">No workflow tasks assigned to you</p>
      </div>
    );
  }

  // Sort by urgency: overdue first, then due soonest
  const sorted = [...assignments].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1;
    if (a.status !== 'overdue' && b.status === 'overdue') return 1;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  return (
    <div className="space-y-3">
      {sorted.map((assignment) => {
        const badge = statusBadge(assignment.status);
        const due = formatDueDate(assignment.due_at);
        return (
          <div
            key={assignment.id}
            className={`group rounded-xl border transition-all ${
              assignment.status === 'overdue'
                ? 'border-adv-red/40 bg-adv-red/5'
                : due.urgent
                ? 'border-adv-gold/30 bg-adv-gold/5'
                : 'border-border bg-adv-card hover:border-adv-teal/30'
            } p-4`}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="mb-0.5 truncate text-sm font-semibold text-adv-white">
                  {assignment.workflow_name || `Workflow ${assignment.workflow_id.slice(0, 8)}`}
                </h4>
                <p className="text-xs text-adv-gray">
                  Step {assignment.step_index + 1} · assigned by {assignment.assigned_by}
                </p>
              </div>
              <div className={`flex items-center gap-1 rounded-full px-2 py-1 ${badge.bg} ${badge.text}`}>
                {badge.icon}
                <span className="text-xs font-medium capitalize">
                  {assignment.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            {assignment.notes && (
              <p className="mb-2 text-xs leading-relaxed text-adv-gray">{assignment.notes}</p>
            )}

            <div className="mb-3 flex items-center gap-3 text-xs text-adv-gray">
              <div className="flex items-center gap-1">
                <Clock className={`h-3 w-3 ${due.urgent ? 'text-adv-red' : ''}`} />
                <span className={due.urgent ? 'font-medium text-adv-red' : ''}>{due.label}</span>
              </div>
              {assignment.started_at && (
                <span className="text-adv-gray/70">
                  Started {new Date(assignment.started_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {assignment.status === 'pending' && (
                <button
                  onClick={() => handleStart(assignment.id)}
                  className="flex items-center gap-1 rounded-lg border border-adv-blue bg-adv-blue/10 px-3 py-1.5 text-xs font-medium text-adv-blue transition-colors hover:bg-adv-blue/20"
                >
                  <Play className="h-3 w-3" />
                  Start
                </button>
              )}
              {assignment.status === 'in_progress' && (
                <button
                  onClick={() => handleComplete(assignment.id)}
                  className="flex items-center gap-1 rounded-lg border border-adv-teal bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal transition-colors hover:bg-adv-teal/20"
                >
                  <Check className="h-3 w-3" />
                  Mark Complete
                </button>
              )}
              {assignment.status === 'overdue' && (
                <button
                  onClick={() => handleStart(assignment.id)}
                  className="flex items-center gap-1 rounded-lg border border-adv-red bg-adv-red/10 px-3 py-1.5 text-xs font-medium text-adv-red transition-colors hover:bg-adv-red/20"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Start (Overdue)
                </button>
              )}
              <a
                href={`/workflows/${assignment.execution_id}`}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-adv-gray transition-colors hover:border-adv-teal hover:text-adv-teal"
              >
                View Workflow
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
