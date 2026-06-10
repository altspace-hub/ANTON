/**
 * MissionDashboardPage — live mission view.
 *
 * Shows: mission header, status, budget monitor, task graph (with checkpoint
 * approve/reject), activity feed. Provides controls to decompose, approve
 * plan, advance, pause, resume, abort. Polls every 5s while active.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Target, ChevronLeft, RefreshCcw, AlertCircle, Sparkles,
  Play, Pause, Square, FastForward, CheckCircle2,
  LayoutDashboard, Send, Wallet, Network, Plus, X,
} from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import TaskGraphView, { type TaskNode, type DependencyEdge } from '../../components/missions/TaskGraphView';
import ActivityFeed from '../../components/missions/ActivityFeed';
import BudgetMonitor from '../../components/missions/BudgetMonitor';
import DeliveriesTab from '../../components/missions/DeliveriesTab';
import PaymentsTab from '../../components/missions/PaymentsTab';
import OutboundDelegationsTab from '../../components/missions/OutboundDelegationsTab';

type TabKey = 'overview' | 'deliveries' | 'payments' | 'delegations';
const TABS: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview',    label: 'Overview',    icon: LayoutDashboard },
  { key: 'deliveries',  label: 'Deliveries',  icon: Send },
  { key: 'payments',    label: 'Payments',    icon: Wallet },
  { key: 'delegations', label: 'Delegations', icon: Network },
];

type MissionStatus = 'draft' | 'briefed' | 'active' | 'paused' | 'review' | 'completed' | 'aborted';
type AutonomyLevel = 'check_in' | 'briefing' | 'full_autonomy';

interface Mission {
  id: string;
  title: string;
  objective: string;
  context: string | null;
  success_criteria: string;
  status: MissionStatus;
  autonomy_level: AutonomyLevel;
  priority: string;
  token_budget_max: number;
  token_budget_consumed: number;
  time_budget_max_seconds: number;
  time_active_max_seconds: number;
  time_active_consumed_seconds: number;
  financial_budget_max: number;
  financial_budget_consumed: number;
  template_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
}

interface MissionState {
  mission: Mission;
  tasks: TaskNode[];
  dependencies: DependencyEdge[];
  activity_count: number;
  decisions_count: number;
}

interface ActivityEntry {
  id: number;
  timestamp: string;
  activity_type: string;
  description: string | null;
  task_id: string | null;
  tokens_consumed: number;
}

interface BudgetSnapshot {
  consumed: number; max: number; pct: number; warning: boolean; exceeded: boolean;
}
interface BudgetData {
  tokens: BudgetSnapshot;
  time: { consumed_seconds: number; max_seconds: number; pct: number; warning: boolean; exceeded: boolean };
  financial: BudgetSnapshot;
}

// Task editor (Wave-2 2A.5) — add/edit tasks while the plan is draft/briefed.
// Action types are first-class here: this is how a human arms an api_call /
// browser task (e.g. pasting the approved subject/body into a Gmail send).
const TASK_TYPE_OPTIONS = [
  'llm', 'research', 'analysis', 'export', 'review', 'notification',
  'checkpoint', 'conditional', 'api_call', 'browser', 'database_query',
] as const;
type EditableTaskType = (typeof TASK_TYPE_OPTIONS)[number];
const ACTION_TASK_TYPES: ReadonlySet<string> = new Set(['api_call', 'browser', 'database_query']);

interface TaskEditorState {
  mode: 'add' | 'edit';
  task?: TaskNode;
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

export default function MissionDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<MissionState | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | null>(null);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [stateRes, actRes, budgetRes] = await Promise.all([
        fetchWithAuth(`/api/missions/${id}`, { headers: getAuthHeader() }),
        fetchWithAuth(`/api/missions/${id}/activity?limit=100`, { headers: getAuthHeader() }),
        fetchWithAuth(`/api/missions/${id}/budget`, { headers: getAuthHeader() }),
      ]);
      const stateData = await stateRes.json();
      if (!stateRes.ok) throw new Error(stateData?.error || `HTTP ${stateRes.status}`);
      setState(stateData.state);
      const actData = await actRes.json();
      if (actRes.ok) setActivity(actData.activity ?? []);
      const budgetData = await budgetRes.json();
      if (budgetRes.ok) setBudget(budgetData.budget);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Poll every 5s while live
  useEffect(() => {
    if (!state) return;
    const live = state.mission.status === 'active' || state.mission.status === 'briefed';
    if (!live) return;
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadAll();
    }, 5000);
    return () => clearInterval(iv);
  }, [state, loadAll]);

  async function action(path: string, body: Record<string, unknown> = {}): Promise<void> {
    if (!id) return;
    setActioning(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/missions/${id}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActioning(false);
    }
  }

  async function handleApproveCheckpoint(taskId: string): Promise<void> {
    await action(`/tasks/${taskId}/approve`, {});
  }
  async function handleRejectCheckpoint(taskId: string, feedback: string): Promise<void> {
    await action(`/tasks/${taskId}/reject`, { feedback });
  }

  if (loading && !state) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <BackLink />
        <div className="mt-6 text-center text-sm text-adv-gray">Loading mission…</div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <BackLink />
        <div className="mt-6 rounded-xl border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error || 'Mission not found'}
        </div>
      </div>
    );
  }

  const { mission, tasks, dependencies } = state;
  const status = STATUS_META[mission.status];
  const planEditable = mission.status === 'draft' || mission.status === 'briefed';
  const completed = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;
  const progressPct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <BackLink />

      {/* Header */}
      <div className="rounded-xl border border-border bg-adv-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Target className="h-6 w-6 text-adv-teal shrink-0" />
              <h1 className="text-xl font-semibold text-adv-off-white">{mission.title}</h1>
              <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${status.classes}`}>
                {status.label}
              </span>
              <span className="text-[10px] text-adv-gray">Autonomy: {mission.autonomy_level.replace('_', '-')}</span>
            </div>
            <p className="mt-3 text-sm text-adv-off-white whitespace-pre-wrap">{mission.objective}</p>
            <p className="mt-2 text-xs text-adv-gray">
              <span className="font-semibold">Success criteria:</span> {mission.success_criteria}
            </p>
            {mission.context && (
              <p className="mt-1 text-xs text-adv-gray whitespace-pre-wrap">
                <span className="font-semibold">Context:</span> {mission.context}
              </p>
            )}
          </div>
          <button
            onClick={() => void loadAll()}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Progress + actions */}
        <div className="mt-4 space-y-3">
          {total > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-adv-gray mb-1">
                <span>Progress</span>
                <span>{completed} / {total} tasks</span>
              </div>
              <div className="h-1.5 rounded-full bg-adv-dark border border-border overflow-hidden">
                <div className="h-full bg-adv-teal transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            {mission.status === 'draft' && (
              <button
                onClick={() => void action('/decompose')}
                disabled={actioning}
                className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate plan
              </button>
            )}
            {mission.status === 'briefed' && (
              <>
                <button
                  onClick={() => void action('/approve-plan')}
                  disabled={actioning}
                  className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve plan & start
                </button>
                <button
                  onClick={() => void action('/decompose')}
                  disabled={actioning}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Re-decompose
                </button>
              </>
            )}
            {mission.status === 'active' && (
              <>
                <button
                  onClick={() => void action('/advance')}
                  disabled={actioning}
                  className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FastForward className="h-3.5 w-3.5" />
                  {actioning ? 'Working…' : 'Advance — run next task'}
                </button>
                <button
                  onClick={() => void action('/pause', { reason: 'Paused by user' })}
                  disabled={actioning}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </button>
              </>
            )}
            {planEditable && (
              <button
                onClick={() => setTaskEditor({ mode: 'add' })}
                disabled={actioning}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add task
              </button>
            )}
            {(mission.status === 'paused' || mission.status === 'review') && (
              <button
                onClick={() => void action('/resume')}
                disabled={actioning}
                className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </button>
            )}
            {mission.status !== 'completed' && mission.status !== 'aborted' && (
              <button
                onClick={() => {
                  if (!confirm('Abort this mission? It cannot be resumed.')) return;
                  void action('/abort', { reason: 'Aborted by user' });
                }}
                disabled={actioning}
                className="rounded-lg border border-adv-red/30 px-3 py-1.5 text-xs text-adv-red/80 hover:text-adv-red hover:border-adv-red/60 inline-flex items-center gap-1.5 disabled:opacity-50 ml-auto"
              >
                <Square className="h-3.5 w-3.5" />
                Abort
              </button>
            )}
          </div>

          {error && (
            <div className="rounded border border-adv-red/30 bg-adv-red/10 px-2 py-1.5 text-[11px] text-adv-red flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap ${
                active ? 'border-adv-teal text-adv-teal' : 'border-transparent text-adv-gray hover:text-adv-off-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">Task graph</h2>
              <TaskGraphView
                tasks={tasks}
                dependencies={dependencies}
                missionId={id}
                onApprove={handleApproveCheckpoint}
                onReject={handleRejectCheckpoint}
                onParallelReviewCreated={() => void loadAll()}
                editable={planEditable}
                onEditTask={(task) => setTaskEditor({ mode: 'edit', task })}
              />
            </section>
          </div>

          <aside className="space-y-4">
            {budget && (
              <div className="rounded-xl border border-border bg-adv-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal mb-3">Budget</h3>
                <BudgetMonitor tokens={budget.tokens} time={budget.time} financial={budget.financial} />
              </div>
            )}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal mb-2">Activity</h3>
              <ActivityFeed entries={activity} />
            </div>
          </aside>
        </div>
      )}

      {tab === 'deliveries' && id && <DeliveriesTab missionId={id} />}
      {tab === 'payments' && id && <PaymentsTab missionId={id} />}
      {tab === 'delegations' && id && <OutboundDelegationsTab missionId={id} />}

      {taskEditor && id && (
        <TaskEditorModal
          missionId={id}
          editor={taskEditor}
          tasks={tasks}
          dependencies={dependencies}
          onClose={() => setTaskEditor(null)}
          onSaved={() => { setTaskEditor(null); void loadAll(); }}
        />
      )}
    </div>
  );
}

/**
 * Add/edit a task while the mission is draft/briefed. Prompt-style types get
 * a prompt textarea; action types (api_call / browser / database_query)
 * expose module_config as JSON so the human can arm real actions (e.g. set
 * the Gmail send params + credential id) before approving the plan.
 */
function TaskEditorModal({ missionId, editor, tasks, dependencies, onClose, onSaved }: {
  missionId: string;
  editor: TaskEditorState;
  tasks: TaskNode[];
  dependencies: DependencyEdge[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = editor.mode === 'edit' ? editor.task : undefined;
  const initialConfig: Record<string, unknown> = { ...(editing?.module_config ?? {}) };
  const initialPrompt = typeof initialConfig.prompt === 'string' ? initialConfig.prompt : '';
  const initialCheckpointMsg = typeof initialConfig.checkpoint_message === 'string' ? initialConfig.checkpoint_message : '';
  delete initialConfig.prompt;
  delete initialConfig.checkpoint_message;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [taskType, setTaskType] = useState<EditableTaskType>(
    (editing && (TASK_TYPE_OPTIONS as readonly string[]).includes(editing.task_type) ? editing.task_type : 'llm') as EditableTaskType,
  );
  const [description, setDescription] = useState(editing?.description ?? '');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [checkpointMessage, setCheckpointMessage] = useState(initialCheckpointMsg);
  const [configJson, setConfigJson] = useState(
    Object.keys(initialConfig).length > 0 ? JSON.stringify(initialConfig, null, 2) : '{}',
  );
  const [dependsOn, setDependsOn] = useState<Set<string>>(() => new Set(
    editing ? dependencies.filter(d => d.task_id === editing.id).map(d => d.depends_on_task_id) : [],
  ));
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const isAction = ACTION_TASK_TYPES.has(taskType);
  const dependsCandidates = tasks.filter(t => t.id !== editing?.id);

  function toggleDep(taskId: string): void {
    setDependsOn(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }

  async function save(): Promise<void> {
    setEditorError(null);
    if (!title.trim()) { setEditorError('Title is required'); return; }
    let moduleConfig: Record<string, unknown> = {};
    if (isAction) {
      try {
        const parsed: unknown = JSON.parse(configJson || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be a JSON object');
        moduleConfig = parsed as Record<string, unknown>;
      } catch (e) {
        setEditorError(`module_config is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        task_type: taskType,
        description: description.trim() || undefined,
        prompt: prompt.trim() || undefined,
        checkpoint_message: taskType === 'checkpoint' ? (checkpointMessage.trim() || undefined) : undefined,
        module_config: isAction ? moduleConfig : undefined,
        depends_on: [...dependsOn],
      };
      const url = editor.mode === 'add'
        ? `/api/missions/${missionId}/tasks`
        : `/api/missions/${missionId}/tasks/${editing!.id}`;
      const res = await fetchWithAuth(url, {
        method: editor.mode === 'add' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-adv-card p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-adv-off-white">
            {editor.mode === 'add' ? 'Add task' : `Edit task — ${editing?.title}`}
          </h3>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-off-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <label className="block text-[11px] text-adv-gray mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            placeholder="Short imperative title"
          />
        </div>

        <div>
          <label className="block text-[11px] text-adv-gray mb-1">Type</label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as EditableTaskType)}
            className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
          >
            {TASK_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[11px] text-adv-gray mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
          />
        </div>

        {!isAction && taskType !== 'checkpoint' && (
          <div>
            <label className="block text-[11px] text-adv-gray mb-1">Prompt (what the task should do)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
          </div>
        )}

        {taskType === 'checkpoint' && (
          <div>
            <label className="block text-[11px] text-adv-gray mb-1">Checkpoint message (shown to the human)</label>
            <textarea
              value={checkpointMessage}
              onChange={(e) => setCheckpointMessage(e.target.value)}
              rows={3}
              className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
          </div>
        )}

        {isAction && (
          <div>
            <label className="block text-[11px] text-adv-gray mb-1">
              module_config (JSON)
              {taskType === 'api_call' && ' — requires "url"'}
              {taskType === 'browser' && ' — requires "service_id" + "workflow_id"'}
              {taskType === 'database_query' && ' — requires "query"'}
            </label>
            <textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] font-mono text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
          </div>
        )}

        {dependsCandidates.length > 0 && (
          <div>
            <label className="block text-[11px] text-adv-gray mb-1">Depends on</label>
            <div className="max-h-32 overflow-y-auto rounded border border-border bg-adv-dark p-2 space-y-1">
              {dependsCandidates.map(t => (
                <label key={t.id} className="flex items-center gap-2 text-[11px] text-adv-off-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dependsOn.has(t.id)}
                    onChange={() => toggleDep(t.id)}
                    className="accent-[#2DD4A8]"
                  />
                  <span className="truncate">{t.title}</span>
                  <span className="text-adv-gray/60">({t.task_type})</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {editorError && (
          <div className="rounded border border-adv-red/30 bg-adv-red/10 px-2 py-1.5 text-[11px] text-adv-red flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {editorError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : editor.mode === 'add' ? 'Add task' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/missions" className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
      <ChevronLeft className="h-3.5 w-3.5" />
      Back to Missions
    </Link>
  );
}
