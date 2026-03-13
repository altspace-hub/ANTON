import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, RefreshCcw, FileScan, Gavel, GitCompareArrows, Rss,
  ShieldAlert, BarChart3, PackageCheck, ClipboardList,
  Play, ChevronRight, ArrowLeft, Check, Loader2, Circle,
  Square, Download, Plus, Pencil, Trash2, Clock, X, Pause, ToggleLeft, ToggleRight,
  Sparkles, Database, Globe, Mail, FileInput, FileOutput, GitBranch, Timer, UserCheck,
} from 'lucide-react';
import { WORKFLOWS, WORKFLOW_CATEGORY_LABELS, getWorkflowsByCategory } from '@/lib/workflow-definitions';
import type { WorkflowDefinition, WorkflowStep } from '@/lib/workflow-definitions';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { streamMessage } from '@/lib/api';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Bell, RefreshCcw, FileScan, Gavel, GitCompareArrows, Rss,
  ShieldAlert, BarChart3, PackageCheck, ClipboardList,
};

// ── Schedule types & helpers ──────────────────────────────────

interface WorkflowSchedule {
  id: number;
  workflow_id: string;
  cron_expression: string;
  is_active: number;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
}

const CRON_PRESETS = [
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every Monday at 8am', value: '0 8 * * 1' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Weekdays at 9am', value: '0 9 * * 1-5' },
  { label: 'First day of month', value: '0 0 1 * *' },
  { label: 'Custom', value: 'custom' },
] as const;

function cronToHuman(expr: string): string {
  const presets: Record<string, string> = {
    '0 9 * * *': 'Every day at 9:00 AM',
    '0 8 * * 1': 'Every Monday at 8:00 AM',
    '0 * * * *': 'Every hour',
    '0 9 * * 1-5': 'Weekdays at 9:00 AM',
    '0 0 1 * *': 'First day of each month',
  };
  return presets[expr] ?? expr;
}

function isValidCron(expr: string): boolean {
  // Basic 5-part cron validation
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const ranges = [
    [0, 59],   // minute
    [0, 23],   // hour
    [1, 31],   // day of month
    [1, 12],   // month
    [0, 7],    // day of week
  ];
  return parts.every((part, i) => {
    if (part === '*') return true;
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      return n >= ranges[i][0] && n <= ranges[i][1];
    }
    // Allow ranges, lists, step values
    if (/^[\d\-,\/\*]+$/.test(part)) return true;
    return false;
  });
}

// ── Schedule Modal ────────────────────────────────────────────

function ScheduleModal({
  workflowId,
  workflowLabel,
  onClose,
}: {
  workflowId: string;
  workflowLabel: string;
  onClose: () => void;
}) {
  const [schedules, setSchedules] = useState<WorkflowSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<string>('0 9 * * *');
  const [customCron, setCustomCron] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeCronExpr = selectedPreset === 'custom' ? customCron : selectedPreset;
  const cronIsValid = isValidCron(activeCronExpr);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/schedules`);
      if (res.ok) setSchedules(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  const handleSave = async () => {
    if (!cronIsValid) { setError('Please enter a valid cron expression.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron_expression: activeCronExpr }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Failed to save schedule');
        return;
      }
      setSelectedPreset('0 9 * * *');
      setCustomCron('');
      await fetchSchedules();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (schedule: WorkflowSchedule) => {
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: schedule.is_active ? 0 : 1 }),
      });
      if (res.ok) await fetchSchedules();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (scheduleId: number) => {
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/schedules/${scheduleId}`, {
        method: 'DELETE',
      });
      if (res.ok) await fetchSchedules();
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-adv-card p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal/10 text-adv-teal">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-adv-white">Schedule Workflow</h2>
              <p className="text-xs text-adv-gray truncate max-w-[240px]">{workflowLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preset selector */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-adv-off-white">Run frequency</label>
          <div className="grid grid-cols-3 gap-2">
            {CRON_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setSelectedPreset(preset.value)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  selectedPreset === preset.value
                    ? 'border-adv-teal bg-adv-teal/10 text-adv-teal shadow-sm shadow-adv-teal/20'
                    : 'border-border text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom cron input */}
        {selectedPreset === 'custom' && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
              Cron expression
            </label>
            <input
              type="text"
              value={customCron}
              onChange={(e) => { setCustomCron(e.target.value); setError(''); }}
              placeholder="e.g. 0 9 * * 1-5"
              className={`w-full rounded-lg border px-3 py-2 text-sm font-mono text-adv-off-white bg-adv-dark placeholder:text-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 transition-colors ${
                customCron && !cronIsValid
                  ? 'border-adv-red focus:border-adv-red'
                  : 'border-border focus:border-adv-teal'
              }`}
            />
            <p className="mt-1 text-[11px] text-adv-gray">
              Format: minute hour day-of-month month day-of-week
            </p>
          </div>
        )}

        {/* Human-readable preview */}
        {activeCronExpr && cronIsValid && (
          <div className="mb-4 rounded-lg border border-adv-teal/20 bg-adv-teal-soft px-3 py-2">
            <p className="text-xs text-adv-teal">
              Runs: {cronToHuman(activeCronExpr)}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mb-3 text-xs text-adv-red">{error}</p>
        )}

        {/* Save button */}
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving || !cronIsValid}
          className="mb-5 w-full rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Schedule'}
        </button>

        {/* Existing schedules */}
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">
            Active schedules
          </h3>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-adv-teal" />
            </div>
          ) : schedules.length === 0 ? (
            <p className="py-3 text-center text-xs text-adv-gray">No schedules yet</p>
          ) : (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-adv-off-white truncate">{s.cron_expression}</p>
                    <p className="text-[11px] text-adv-gray">{cronToHuman(s.cron_expression)}</p>
                    {s.last_run_at && (
                      <p className="text-xs text-adv-gray">
                        Last run: {new Date(s.last_run_at).toLocaleString()} · {s.run_count}x
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => { void handleToggle(s); }}
                    title={s.is_active ? 'Pause schedule' : 'Resume schedule'}
                    className="shrink-0 transition-colors"
                  >
                    {s.is_active ? (
                      <ToggleRight className="h-5 w-5 text-adv-teal hover:text-adv-teal-dark" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-adv-gray hover:text-adv-off-white" />
                    )}
                  </button>
                  <button
                    onClick={() => { void handleDelete(s.id); }}
                    title="Delete schedule"
                    className="shrink-0 text-adv-gray hover:text-adv-red transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface StepState {
  status: StepStatus;
  output: string;
  inputValues: Record<string, string>;
}

export default function WorkflowsPage() {
  const navigate = useNavigate();
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({});
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [schedulingWorkflow, setSchedulingWorkflow] = useState<WorkflowDefinition | null>(null);

  const { model, thinking, systemPrompt } = useSessionStore();
  const { customWorkflows, deleteWorkflow } = useWorkflowStore();

  const grouped = getWorkflowsByCategory();
  const categoryOrder = ['monitoring', 'assessment', 'advisory', 'reporting', 'comparison'];

  // ── Workflow Selection View ──────────────────────────────

  const selectWorkflow = (wf: WorkflowDefinition) => {
    setSelectedWorkflow(wf);
    setCurrentStepIdx(0);
    const initial: Record<string, StepState> = {};
    wf.steps.forEach(s => {
      initial[s.id] = { status: 'pending', output: '', inputValues: {} };
    });
    setStepStates(initial);
  };

  if (!selectedWorkflow) {
    return (
      <>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-adv-white">Workflows</h1>
            <p className="mt-1 text-sm text-adv-gray">
              Automated multi-step processes. Select a workflow to configure and run it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/workflows/build-ai')}
              className="flex items-center gap-2 rounded-lg border border-adv-teal/40 bg-adv-teal/10 px-4 py-2.5 text-sm font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Build with AI
            </button>
            <button
              onClick={() => navigate('/workflows/builder')}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Manually
            </button>
          </div>
        </div>

        {/* Custom workflows section */}
        {customWorkflows.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-adv-teal">
              Your Custom Workflows
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {customWorkflows.map((wf) => {
                const Icon = iconMap[wf.icon] || ClipboardList;
                return (
                  <div
                    key={wf.id}
                    className="group relative flex items-start gap-4 rounded-xl border border-adv-teal/20 bg-adv-card p-4 text-left transition-all hover:border-adv-teal/30 hover:shadow-lg hover:shadow-adv-teal/5"
                  >
                    <button
                      onClick={() => selectWorkflow(wf)}
                      className="absolute inset-0 z-0"
                    />
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal/10 text-adv-teal">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-adv-white group-hover:text-adv-teal transition-colors">
                        {wf.label}
                      </div>
                      <p className="mt-1 text-xs text-adv-gray leading-relaxed">{wf.description || 'No description'}</p>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-adv-gray">
                        <span>{wf.steps.length} steps</span>
                        <span>{wf.estimatedTime}</span>
                      </div>
                    </div>
                    <div className="relative z-10 flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSchedulingWorkflow(wf); }}
                        className="p-1.5 text-adv-gray hover:text-adv-teal transition-colors"
                        title="Schedule workflow"
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/workflows/builder/${wf.id}`); }}
                        className="p-1.5 text-adv-gray hover:text-adv-teal transition-colors"
                        title="Edit workflow"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }}
                        className="p-1.5 text-adv-gray hover:text-adv-red transition-colors"
                        title="Delete workflow"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pre-built workflows */}
        <div className="space-y-6">
          {categoryOrder.map((cat) => {
            const workflows = grouped[cat];
            if (!workflows) return null;
            return (
              <div key={cat}>
                <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-adv-gray">
                  {WORKFLOW_CATEGORY_LABELS[cat]}
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {workflows.map((wf) => {
                    const Icon = iconMap[wf.icon] || Bell;
                    return (
                      <div
                        key={wf.id}
                        className="group relative flex items-start gap-4 rounded-xl border border-border bg-adv-card p-4 text-left transition-all hover:border-adv-teal/30 hover:shadow-lg hover:shadow-adv-teal/5"
                      >
                        <button
                          onClick={() => selectWorkflow(wf)}
                          className="absolute inset-0 z-0"
                          aria-label={`Open ${wf.label}`}
                        />
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal/10 text-adv-teal">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-adv-white group-hover:text-adv-teal transition-colors">
                            {wf.label}
                          </div>
                          <p className="mt-1 text-xs text-adv-gray leading-relaxed">{wf.description}</p>
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-adv-gray">
                            <span>{wf.steps.length} steps</span>
                            <span>{wf.estimatedTime}</span>
                            <div className="flex gap-1">
                              {wf.tags.slice(0, 3).map(t => (
                                <span key={t} className="rounded bg-adv-dark px-1.5 py-0.5">{t}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="relative z-10 flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSchedulingWorkflow(wf); }}
                            className="p-1.5 text-adv-gray opacity-0 group-hover:opacity-100 hover:text-adv-teal transition-all"
                            title="Schedule workflow"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                          <ChevronRight className="h-4 w-4 text-adv-gray opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule modal */}
      {schedulingWorkflow && (
        <ScheduleModal
          workflowId={schedulingWorkflow.id}
          workflowLabel={schedulingWorkflow.label}
          onClose={() => setSchedulingWorkflow(null)}
        />
      )}
      </>
    );
  }

  // ── Workflow Execution View ──────────────────────────────

  const currentStep = selectedWorkflow.steps[currentStepIdx];
  const currentState = stepStates[currentStep?.id];
  const allDone = selectedWorkflow.steps.every(s => stepStates[s.id]?.status === 'done');

  const updateStepState = (stepId: string, updates: Partial<StepState>) => {
    setStepStates(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], ...updates },
    }));
  };

  const updateInputValue = (stepId: string, fieldId: string, value: string) => {
    setStepStates(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        inputValues: { ...prev[stepId].inputValues, [fieldId]: value },
      },
    }));
  };

  // Resolve template variables from all previous step outputs and inputs
  const resolveTemplate = (template: string): string => {
    let resolved = template;
    for (const step of selectedWorkflow.steps) {
      const state = stepStates[step.id];
      if (!state) continue;
      // Replace input field variables
      for (const [key, value] of Object.entries(state.inputValues)) {
        resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
    }
    return resolved;
  };

  const runClaudeStep = async (step: WorkflowStep) => {
    updateStepState(step.id, { status: 'running', output: '' });
    setIsRunning(true);
    const controller = new AbortController();
    setAbortController(controller);

    // Build context from previous steps
    const previousOutputs = selectedWorkflow.steps
      .filter(s => stepStates[s.id]?.status === 'done' && stepStates[s.id]?.output)
      .map(s => stepStates[s.id].output)
      .join('\n\n---\n\n');

    const prompt = resolveTemplate(step.config.promptTemplate || '');
    const fullMessage = previousOutputs
      ? `Context from previous analysis steps:\n\n${previousOutputs}\n\n---\n\nNow, for this step:\n\n${prompt}`
      : prompt;

    try {
      let output = '';
      const stream = streamMessage({
        model,
        thinking: (step.config.thinking as 'think' | 'think_hard' | 'investigate') || thinking,
        creativity: (step.config.creativity as 'strict' | 'balanced' | 'creative') || 'balanced',
        systemPrompt: systemPrompt || 'You are Anton, an expert AI assistant for Financial Crime Prevention consultants.',
        userMessage: fullMessage,
        history: [],
        outputFormats: step.config.outputFormat ? [step.config.outputFormat] : [],
        knowledgeSources: {
          modes: {
            claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
            onlineReference: { enabled: false, urls: [], fetchDepth: 'full' },
            localFolder: { enabled: false, folderPaths: [], recursive: true },
            combinedMode: { enabled: false, priority: 'merged', instructions: '' },
          },
        },
      }, controller.signal);

      for await (const event of stream) {
        if (event.type === 'text_delta') {
          output += event.content;
          updateStepState(step.id, { output, status: 'running' });
        } else if (event.type === 'error') {
          updateStepState(step.id, { status: 'error', output: `Error: ${event.message}` });
          setIsRunning(false);
          return;
        }
      }

      updateStepState(step.id, { status: 'done', output });
      // Auto-advance to next step
      if (currentStepIdx < selectedWorkflow.steps.length - 1) {
        setCurrentStepIdx(currentStepIdx + 1);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        updateStepState(step.id, { status: 'error', output: `Error: ${(error as Error).message}` });
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };

  // Run any non-Claude step via the backend execute-step endpoint
  const runServerStep = async (step: WorkflowStep) => {
    updateStepState(step.id, { status: 'running', output: '' });
    setIsRunning(true);

    // Build context from all completed previous steps
    const context: Record<string, unknown> = {};
    for (const s of selectedWorkflow.steps) {
      const state = stepStates[s.id];
      if (state?.status === 'done') {
        context[s.id] = { output: state.output, ...state.inputValues };
      }
    }

    try {
      const res = await fetch('/api/workflows/execute-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, context }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        updateStepState(step.id, { status: 'error', output: `Error: ${err.error ?? 'Unknown error'}` });
        return;
      }
      const result = await res.json() as { summary: string; output: Record<string, unknown> };
      updateStepState(step.id, {
        status: 'done',
        output: result.summary || JSON.stringify(result.output, null, 2),
      });
      if (currentStepIdx < selectedWorkflow.steps.length - 1) {
        setCurrentStepIdx(currentStepIdx + 1);
      }
    } catch (error) {
      updateStepState(step.id, { status: 'error', output: `Error: ${(error as Error).message}` });
    } finally {
      setIsRunning(false);
    }
  };

  const handleStepAction = () => {
    if (!currentStep) return;
    if (currentStep.type === 'input') {
      updateStepState(currentStep.id, { status: 'done' });
      if (currentStepIdx < selectedWorkflow.steps.length - 1) {
        setCurrentStepIdx(currentStepIdx + 1);
      }
    } else if (currentStep.type === 'claude') {
      runClaudeStep(currentStep);
    } else if (currentStep.type === 'export') {
      updateStepState(currentStep.id, { status: 'done', output: 'Export ready. Use the export buttons on each step output.' });
      if (currentStepIdx < selectedWorkflow.steps.length - 1) {
        setCurrentStepIdx(currentStepIdx + 1);
      }
    } else {
      // All other step types (data, api, db, notification, wait, checkpoint, etc.) → backend
      void runServerStep(currentStep);
    }
  };

  const handleStop = () => {
    abortController?.abort();
    setIsRunning(false);
  };

  const Icon = iconMap[selectedWorkflow.icon] || Bell;

  return (
    <div className="flex h-full gap-6">
      {/* Left: Step navigator */}
      <div className="w-[300px] shrink-0 overflow-auto">
        <button
          onClick={() => setSelectedWorkflow(null)}
          className="mb-4 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Back to workflows
        </button>

        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-adv-teal/10 text-adv-teal">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-adv-white">{selectedWorkflow.label}</h2>
            <p className="mt-0.5 text-[11px] text-adv-gray">{selectedWorkflow.estimatedTime}</p>
          </div>
        </div>

        {/* Step list */}
        <div className="space-y-1">
          {selectedWorkflow.steps.map((step, idx) => {
            const state = stepStates[step.id];
            const isActive = idx === currentStepIdx;
            return (
              <button
                key={step.id}
                onClick={() => !isRunning && setCurrentStepIdx(idx)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'bg-adv-teal-dim border border-adv-teal/30'
                    : 'hover:bg-adv-card border border-transparent'
                }`}
              >
                {/* Step status icon */}
                <div className="shrink-0">
                  {state?.status === 'done' ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-adv-green/20 text-adv-green">
                      <Check className="h-3 w-3" />
                    </div>
                  ) : state?.status === 'running' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-adv-teal" />
                  ) : state?.status === 'error' ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-adv-red/20 text-adv-red">
                      <span className="text-xs font-bold">!</span>
                    </div>
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-adv-gray-med text-adv-gray">
                      <span className="text-xs">{idx + 1}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-medium ${isActive ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-adv-gray truncate">{step.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Run all / status */}
        {allDone && (
          <div className="mt-4 rounded-lg border border-adv-green/30 bg-adv-green/5 p-3 text-center">
            <Check className="mx-auto h-5 w-5 text-adv-green" />
            <p className="mt-1 text-xs text-adv-green font-medium">Workflow complete</p>
          </div>
        )}
      </div>

      {/* Right: Current step content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {currentStep && (
          <>
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-adv-white">
                Step {currentStepIdx + 1}: {currentStep.label}
              </h3>
              <p className="text-xs text-adv-gray">{currentStep.description}</p>
            </div>

            {/* Input step */}
            {currentStep.type === 'input' && currentStep.config.inputFields && (
              <div className="flex-1 overflow-auto rounded-xl border border-border bg-adv-card p-4">
                <div className="space-y-4">
                  {currentStep.config.inputFields.map((field) => (
                    <div key={field.id}>
                      <label className="mb-1 block text-sm text-adv-off-white">
                        {field.label}
                        {field.required && <span className="ml-1 text-adv-red">*</span>}
                      </label>
                      {field.type === 'select' ? (
                        <select
                          value={currentState?.inputValues[field.id] || ''}
                          onChange={(e) => updateInputValue(currentStep.id, field.id, e.target.value)}
                          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                        >
                          <option value="">Select...</option>
                          {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          value={currentState?.inputValues[field.id] || ''}
                          onChange={(e) => updateInputValue(currentStep.id, field.id, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                          rows={4}
                        />
                      ) : field.type === 'file' ? (
                        <div className="rounded-lg border-2 border-dashed border-border p-4 text-center text-xs text-adv-gray">
                          File upload — paste content in the text field above for now
                        </div>
                      ) : (
                        <input
                          type={field.type}
                          value={currentState?.inputValues[field.id] || ''}
                          onChange={(e) => updateInputValue(currentStep.id, field.id, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Server-side steps (data, api, db, notification, wait, checkpoint, etc.) */}
            {!['input', 'claude', 'export'].includes(currentStep.type) && (
              <div className="flex-1 overflow-auto rounded-xl border border-border bg-adv-card p-4">
                {currentState?.status === 'pending' && (
                  <div className="space-y-4">
                    {/* Step type badge */}
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2.5 py-0.5 text-[11px] font-medium text-adv-teal">
                        {currentStep.type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-adv-gray">runs on server</span>
                    </div>
                    {/* Config summary */}
                    <div className="rounded-lg border border-border bg-adv-dark p-3 text-xs font-mono text-adv-gray">
                      <p className="mb-1 text-xs uppercase tracking-wider text-adv-gray">Step configuration</p>
                      {Object.entries(currentStep.config)
                        .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
                        .slice(0, 8)
                        .map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="text-adv-gray shrink-0">{k}:</span>
                            <span className="text-adv-off-white truncate">
                              {typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 80)}
                            </span>
                          </div>
                        ))}
                    </div>
                    <p className="text-xs text-adv-gray">Click "Run Step" to execute this step on the server.</p>
                  </div>
                )}
                {currentState?.status === 'running' && (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-adv-teal" />
                    <span className="text-xs text-adv-teal">Executing on server…</span>
                  </div>
                )}
                {(currentState?.status === 'done' || currentState?.status === 'error') && (
                  <div className={`whitespace-pre-wrap text-sm ${currentState.status === 'error' ? 'text-adv-red' : 'text-adv-off-white'}`}>
                    {currentState.output}
                  </div>
                )}
              </div>
            )}

            {/* Claude / export step — show output */}
            {(currentStep.type === 'claude' || currentStep.type === 'export') && (
              <div className="flex-1 overflow-auto rounded-xl border border-border bg-adv-card p-4">
                {currentState?.status === 'pending' && (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <p className="text-sm text-adv-gray">Click "Run Step" to execute this analysis step.</p>
                      {currentStep.config.thinking && (
                        <p className="mt-1 text-[11px] text-adv-gray">
                          Thinking level: {currentStep.config.thinking}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {currentState?.status === 'running' && (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-adv-teal" />
                      <span className="text-xs text-adv-teal">Analyzing...</span>
                    </div>
                    <div className="prose prose-invert prose-sm max-w-none text-adv-off-white whitespace-pre-wrap">
                      {currentState.output}
                    </div>
                  </div>
                )}
                {(currentState?.status === 'done' || currentState?.status === 'error') && (
                  <div className="prose prose-invert prose-sm max-w-none text-adv-off-white whitespace-pre-wrap">
                    {currentState.output}
                  </div>
                )}
              </div>
            )}

            {/* Show previous step outputs for completed steps */}
            {currentState?.status === 'done' && currentStep.type !== 'input' && (
              <div className="mt-2 flex justify-end">
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(currentState.output);
                  }}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-adv-gray hover:text-adv-off-white"
                >
                  <Download className="h-3 w-3" /> Copy output
                </button>
              </div>
            )}

            {/* Action button */}
            <div className="mt-3 flex items-center gap-2">
              {isRunning ? (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 rounded-lg bg-adv-red px-4 py-2.5 text-sm font-medium text-white hover:bg-adv-red/80 transition-colors"
                >
                  <Square className="h-4 w-4" /> Stop
                </button>
              ) : (
                <button
                  onClick={handleStepAction}
                  disabled={currentState?.status === 'done' && currentStepIdx >= selectedWorkflow.steps.length - 1}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                >
                  {currentState?.status === 'done' ? (
                    currentStepIdx < selectedWorkflow.steps.length - 1 ? (
                      <>
                        <ChevronRight className="h-4 w-4" /> Next Step
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Complete
                      </>
                    )
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      {currentStep.type === 'input' ? 'Continue' : 'Run Step'}
                    </>
                  )}
                </button>
              )}

              {currentState?.status === 'done' && currentStepIdx < selectedWorkflow.steps.length - 1 && (
                <button
                  onClick={() => setCurrentStepIdx(currentStepIdx + 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                >
                  Skip to next
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
