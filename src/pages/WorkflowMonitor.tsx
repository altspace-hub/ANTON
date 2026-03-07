import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Circle, XCircle, Loader2, AlertTriangle,
  ChevronDown, ChevronRight, Play, SkipForward, Ban, Edit3, Eye,
  Clock, Brain,
} from 'lucide-react';
import type { WorkflowDefinition, WorkflowStepType } from '@/lib/workflow-definitions';
import CheckpointMemoryPanel from '../features/intelligence/CheckpointMemoryPanel';

// ── Types matching the server's response ────────────────────────

type ExecutionMode = 'guided' | 'automatic' | 'scheduled';
type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface StepResult {
  stepId: string;
  stepIndex: number;
  status: StepStatus;
  startedAt: string;
  completedAt?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

interface ExecutionState {
  id: string;
  workflowId: string;
  mode: ExecutionMode;
  status: ExecutionStatus;
  currentStepIndex: number;
  currentStep?: { id: string; label: string; type: WorkflowStepType; description: string; config: Record<string, unknown> } | null;
  totalSteps: number;
  stepResults: StepResult[];
  context: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

interface WorkflowMonitorProps {
  executionId?: string;
  workflow?: WorkflowDefinition;
  onClose?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────

function statusColor(status: StepStatus | ExecutionStatus): string {
  switch (status) {
    case 'completed': return 'text-adv-green';
    case 'running': return 'text-adv-teal';
    case 'failed': return 'text-adv-red';
    case 'skipped': return 'text-adv-gray-med';
    case 'paused': return 'text-adv-gold';
    case 'aborted': return 'text-adv-red';
    default: return 'text-adv-gray-med';
  }
}

function StatusIcon({ status, size = 'h-4 w-4' }: { status: StepStatus | ExecutionStatus; size?: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className={`${size} text-adv-green`} />;
    case 'running': return <Loader2 className={`${size} text-adv-teal animate-spin`} />;
    case 'failed': return <XCircle className={`${size} text-adv-red`} />;
    case 'skipped': return <SkipForward className={`${size} text-adv-gray-med`} />;
    case 'paused': return <AlertTriangle className={`${size} text-adv-gold`} />;
    case 'aborted': return <Ban className={`${size} text-adv-red`} />;
    default: return <Circle className={`${size} text-adv-gray-med`} />;
  }
}

function formatDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function JsonViewer({ data, label }: { data: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const str = JSON.stringify(data, null, 2);
  if (!str || str === '{}' || str === 'null') return null;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-adv-gray-med hover:text-adv-off-white transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {expanded && (
        <pre className="mt-1 max-h-40 overflow-y-auto rounded bg-adv-dark-2 p-2 text-[10px] text-adv-off-white">
          {str}
        </pre>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

export default function WorkflowMonitor({ executionId: propExecId, workflow, onClose }: WorkflowMonitorProps) {
  const { executionId: routeExecId } = useParams<{ executionId: string }>();
  const navigate = useNavigate();
  const execId = propExecId || routeExecId;

  const [execution, setExecution] = useState<ExecutionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [modifyMode, setModifyMode] = useState(false);
  const [modifyText, setModifyText] = useState('{}');
  const [actionLoading, setActionLoading] = useState(false);
  const [diagMap, setDiagMap] = useState<Record<number, { text: string | null; loading: boolean }>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!execId) return;
    try {
      const res = await fetch(`/api/workflows/executions/${execId}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ExecutionState = await res.json();
      setExecution(data);
      setLoading(false);
      setError(null);

      // Stop polling when terminal state reached
      if (['completed', 'failed', 'aborted'].includes(data.status)) {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }, [execId]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  const handleContinue = async (decisionData?: { decision: string; reasoning: string; isOverride: boolean }) => {
    if (!execId || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/workflows/executions/${execId}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decisionData ?? {}),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to continue');
      await fetchStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleModify = async () => {
    if (!execId || actionLoading) return;
    setActionLoading(true);
    try {
      const modifications = JSON.parse(modifyText);
      const res = await fetch(`/api/workflows/executions/${execId}/modify-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifications }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to modify');
      setModifyMode(false);
      await fetchStatus();
    } catch (err) {
      setError(`Modify failed: ${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!execId || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/workflows/executions/${execId}/skip-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to skip');
      await fetchStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAbort = async () => {
    if (!execId || actionLoading) return;
    if (!window.confirm('Abort workflow execution?')) return;
    setActionLoading(true);
    try {
      await fetch(`/api/workflows/executions/${execId}/abort`, { method: 'POST' });
      await fetchStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const diagnoseStep = async (result: StepResult, stepLabel: string) => {
    const idx = result.stepIndex;
    setDiagMap((prev) => ({ ...prev, [idx]: { text: null, loading: true } }));
    try {
      const r = await fetch('/api/ai-assist/workflow-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepLabel, errorMessage: result.error ?? 'Unknown error', stepType: 'workflow-step', input: result.input }),
      });
      if (r.ok) {
        const data = await r.json() as { diagnosis: string; likelyCause: string; fix: string };
        setDiagMap((prev) => ({ ...prev, [idx]: { text: `**${data.likelyCause}** — ${data.diagnosis}\n\n**Fix:** ${data.fix}`, loading: false } }));
      } else {
        setDiagMap((prev) => ({ ...prev, [idx]: { text: null, loading: false } }));
      }
    } catch {
      setDiagMap((prev) => ({ ...prev, [idx]: { text: null, loading: false } }));
    }
  };

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const workflowSteps = workflow?.steps ?? execution?.currentStep ? [execution!.currentStep!] : [];
  const allSteps = workflow?.steps ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        <span className="ml-2 text-sm text-adv-gray">Loading execution...</span>
      </div>
    );
  }

  if (error && !execution) {
    return (
      <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 p-4">
        <p className="text-sm text-adv-red">Error: {error}</p>
      </div>
    );
  }

  if (!execution) return null;

  const isPaused = execution.status === 'paused';
  const isTerminal = ['completed', 'failed', 'aborted'].includes(execution.status);
  const progressPct = execution.totalSteps > 0
    ? Math.round((execution.currentStepIndex / execution.totalSteps) * 100)
    : 0;

  // Is the current paused step a checkpoint?
  const currentStepIsCheckpoint = execution.currentStep?.type === 'checkpoint';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onClose ? (
            <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors">
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          ) : (
            <button onClick={() => navigate('/workflows')} className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors">
              <ArrowLeft className="h-3 w-3" /> Workflows
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusIcon status={execution.status} />
          <span className={`text-sm font-medium capitalize ${statusColor(execution.status)}`}>
            {execution.status}
          </span>
          {!isTerminal && (
            <button
              onClick={handleAbort}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-lg border border-adv-red/30 px-3 py-1.5 text-xs text-adv-red hover:bg-adv-red/10 transition-colors disabled:opacity-50"
            >
              <Ban className="h-3 w-3" />
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Execution info bar */}
      <div className="rounded-xl border border-border bg-adv-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-adv-off-white">
              {workflow?.label ?? execution.workflowId}
            </p>
            <p className="mt-0.5 text-[10px] text-adv-gray-med">
              Mode: <span className="capitalize text-adv-off-white">{execution.mode}</span>
              {' · '}
              Started: {new Date(execution.startedAt).toLocaleTimeString()}
              {execution.completedAt && ` · Duration: ${formatDuration(execution.startedAt, execution.completedAt)}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-adv-gray-med">
              Step {Math.min(execution.currentStepIndex + 1, execution.totalSteps)} / {execution.totalSteps}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-adv-dark">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              execution.status === 'failed' ? 'bg-adv-red'
              : execution.status === 'aborted' ? 'bg-adv-gray-med'
              : 'bg-adv-teal'
            }`}
            style={{ width: `${isTerminal && execution.status === 'completed' ? 100 : progressPct}%` }}
          />
        </div>
      </div>

      {/* Checkpoint review panel */}
      {isPaused && currentStepIsCheckpoint && execution.currentStep && (
        <div className="rounded-xl border border-adv-gold/40 bg-adv-gold/10 p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-adv-gold" />
            <h3 className="text-sm font-semibold text-adv-gold">Human Review Required</h3>
          </div>
          <p className="mb-4 text-sm text-adv-off-white">
            {(execution.currentStep.config as { checkpointMessage?: string }).checkpointMessage || 'Please review the current workflow state before continuing.'}
          </p>

          {/* Context summary */}
          <div className="mb-4 rounded-lg border border-border bg-adv-dark p-3">
            <h4 className="mb-2 text-[11px] font-medium text-adv-gray">Current Context</h4>
            <pre className="max-h-48 overflow-y-auto text-[10px] text-adv-off-white">
              {JSON.stringify(execution.context, null, 2)}
            </pre>
          </div>

          {/* Institutional Memory panel */}
          <div className="mb-4">
            <CheckpointMemoryPanel
              workflowId={execution.workflowId}
              stepIndex={execution.currentStepIndex}
              aiRecommendation="approve"
              onDecision={(decision, reasoning, isOverride) => {
                handleContinue({ decision, reasoning, isOverride });
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleContinue()}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve & Continue (Quick)
            </button>
            <button
              onClick={() => { setModifyMode(true); setModifyText(JSON.stringify(execution.context, null, 2)); }}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white disabled:opacity-50 transition-colors"
            >
              <Edit3 className="h-4 w-4" />
              Modify Context
            </button>
            <button
              onClick={handleSkip}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white disabled:opacity-50 transition-colors"
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Guided mode: approve/modify/skip panel */}
      {isPaused && !currentStepIsCheckpoint && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-4">
          <div className="mb-2 flex items-center gap-2">
            <Eye className="h-4 w-4 text-adv-teal" />
            <h3 className="text-sm font-semibold text-adv-teal">Guided Mode — Step Review</h3>
          </div>
          <p className="mb-3 text-xs text-adv-gray-med">
            Step {execution.currentStepIndex + 1} has completed. Review the output, then choose an action.
          </p>

          {/* Last step output */}
          {execution.stepResults.length > 0 && (
            <div className="mb-3 rounded-lg border border-border bg-adv-dark p-3">
              <h4 className="mb-1 text-[11px] font-medium text-adv-gray">Step Output</h4>
              <pre className="max-h-32 overflow-y-auto text-[10px] text-adv-off-white">
                {JSON.stringify(execution.stepResults[execution.stepResults.length - 1]?.output, null, 2)}
              </pre>
            </div>
          )}

          {modifyMode ? (
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-adv-gray">
                Edit context (JSON) — changes will be merged into workflow context:
              </label>
              <textarea
                value={modifyText}
                onChange={(e) => setModifyText(e.target.value)}
                className="h-40 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 font-mono text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
              />
              {error && <p className="text-[10px] text-adv-red">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleModify}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
                >
                  Save & Continue
                </button>
                <button
                  onClick={() => setModifyMode(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleContinue()}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                <Play className="h-3.5 w-3.5" />
                Approve & Continue
              </button>
              <button
                onClick={() => { setModifyMode(true); setModifyText(JSON.stringify(execution.stepResults[execution.stepResults.length - 1]?.output ?? {}, null, 2)); }}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-50 transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Modify
              </button>
              <button
                onClick={handleSkip}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-50 transition-colors"
              >
                <SkipForward className="h-3.5 w-3.5" />
                Skip Next Step
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {execution.error && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 p-3">
          <p className="text-xs text-adv-red">Error: {execution.error}</p>
        </div>
      )}

      {/* Step list */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-adv-gray">Steps</h3>
        {allSteps.map((step, idx) => {
          const result = execution.stepResults.find((r) => r.stepIndex === idx);
          const isCurrent = execution.currentStepIndex === idx && !isTerminal;
          const stepStatus: StepStatus =
            result?.status ?? (idx < execution.currentStepIndex ? 'completed' : 'pending');
          const isExpanded = expandedSteps.has(idx);

          return (
            <div
              key={step.id}
              className={`rounded-xl border overflow-hidden transition-colors ${
                isCurrent ? 'border-adv-teal/40 bg-adv-card' : 'border-border bg-adv-card'
              }`}
            >
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-adv-dark-2/50 transition-colors"
                onClick={() => toggleStep(idx)}
              >
                <StatusIcon
                  status={isCurrent && execution.status === 'running' ? 'running' : stepStatus}
                  size="h-4 w-4"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-adv-gray-med">Step {idx + 1}</span>
                    <span className="text-xs font-medium text-adv-off-white">{step.label}</span>
                    <span className="rounded bg-adv-dark px-1.5 py-0.5 text-[10px] text-adv-gray-med">{step.type}</span>
                    {isCurrent && execution.status === 'paused' && (
                      <span className="rounded bg-adv-gold/20 px-1.5 py-0.5 text-[10px] font-medium text-adv-gold">waiting for review</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {result && (
                    <span className="text-[10px] text-adv-gray-med flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(result.startedAt, result.completedAt)}
                    </span>
                  )}
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray-med" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-gray-med" />}
                </div>
              </button>

              {isExpanded && result && (
                <div className="border-t border-border px-4 py-3 space-y-2">
                  {result.error && (
                    <div className="rounded bg-adv-red/10 border border-adv-red/20 px-2 py-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[10px] text-adv-red">{result.error}</p>
                        <button
                          onClick={() => void diagnoseStep(result, step.label)}
                          disabled={diagMap[idx]?.loading}
                          className="shrink-0 flex items-center gap-1 rounded border border-adv-teal/40 bg-adv-teal/10 px-2 py-0.5 text-[10px] text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors"
                        >
                          {diagMap[idx]?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                          Diagnose
                        </button>
                      </div>
                      {diagMap[idx]?.text && (
                        <div className="mt-2 rounded bg-adv-teal/5 border border-adv-teal/20 px-2 py-1.5 text-[10px] text-adv-off-white whitespace-pre-wrap">
                          {diagMap[idx].text}
                        </div>
                      )}
                    </div>
                  )}
                  <JsonViewer data={result.input} label="Input" />
                  <JsonViewer data={result.output} label="Output" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion summary */}
      {execution.status === 'completed' && (
        <div className="rounded-xl border border-adv-green/30 bg-adv-green/10 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-adv-green" />
            <div>
              <p className="text-sm font-semibold text-adv-green">Workflow completed</p>
              <p className="text-[10px] text-adv-gray-med">
                Total duration: {formatDuration(execution.startedAt, execution.completedAt)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
