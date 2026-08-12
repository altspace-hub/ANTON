import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  List, CheckCircle2, Clock, Play, Target, Plus, ChevronDown, ChevronRight,
  FileCode, TestTube, AlertTriangle, Loader2, Edit3, Save, X,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import ExecutionPlanPanel from '@/components/coding/ExecutionPlanPanel';
import CompletionRecord from '@/components/coding/CompletionRecord';
import ProgressView from '@/components/coding/ProgressView';
import WorkspaceApplyPanel from '@/components/coding/WorkspaceApplyPanel';
import WorkspaceTestPanel from '@/components/coding/WorkspaceTestPanel';
import ConversationThread from '@/components/shared/ConversationThread';
import { useSessionStore } from '@/stores/useSessionStore';
import { useClaude } from '@/hooks/useClaude';
import type {
  CodingRelease, CodingTask, CodingProject, ExecutionPlan,
  CompletionRecord as CompletionRecordType, ComplexityBand, CodingTaskStatus,
  WorkspaceApplyPreview, WorkspaceApplyResult, WorkspaceTestRunResult,
} from '@/lib/coding-types';

// ── Auth helper ─────────────────────────────────────────────────
function getAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('openexpert-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── JSON extractor from AI response ─────────────────────────────
function parseJsonFromResponse<T>(text: string): T | null {
  // Find the LAST ```json block (the completion record / execution plan is typically at the end)
  const regex = /```json\s*\n([\s\S]*?)\n```/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    lastMatch = match;
  }
  if (!lastMatch) return null;
  try {
    return JSON.parse(lastMatch[1]) as T;
  } catch {
    return null;
  }
}

// ── Status badge colors ─────────────────────────────────────────
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'completed': return 'bg-adv-green/10 text-adv-green';
    case 'in_progress': return 'bg-adv-teal-dim text-adv-teal';
    case 'planned': return 'bg-adv-blue/10 text-adv-blue';
    case 'planning': return 'bg-adv-gold/10 text-adv-gold';
    case 'review': return 'bg-adv-blue/10 text-adv-blue';
    case 'testing': return 'bg-adv-gold/10 text-adv-gold';
    case 'blocked': return 'bg-adv-red/10 text-adv-red';
    case 'cancelled': return 'bg-adv-gray-med/10 text-adv-gray';
    default: return 'bg-adv-dark text-adv-gray';
  }
}

function complexityBadgeClass(band: ComplexityBand): string {
  switch (band) {
    case 'small': return 'bg-adv-green/10 text-adv-green';
    case 'medium': return 'bg-adv-gold/10 text-adv-gold';
    case 'large': return 'bg-adv-red/10 text-adv-red';
    default: return 'bg-adv-dark text-adv-gray';
  }
}

// ── Types ────────────────────────────────────────────────────────
type Tab = 'planning' | 'tasks' | 'progress' | 'completion';
type ActiveMode = 'plan' | 'execute' | 'revise' | null;

interface EditReleaseForm {
  name: string;
  description: string;
  scope: string;
  acceptance_criteria: string;
  milestone_date: string;
}

interface AddTaskForm {
  title: string;
  description: string;
  complexity_band: ComplexityBand;
  acceptance_criteria: string;
}

const EMPTY_ADD_TASK: AddTaskForm = {
  title: '',
  description: '',
  complexity_band: 'medium',
  acceptance_criteria: '',
};

// ── Main Component ──────────────────────────────────────────────
export default function CodingLargeReleasePage() {
  const { projectId, releaseId } = useParams<{ projectId: string; releaseId: string }>();

  // ── Core data ─────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('tasks');
  const [release, setRelease] = useState<CodingRelease | null>(null);
  const [tasks, setTasks] = useState<CodingTask[]>([]);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(true);

  // ── UI state ──────────────────────────────────────────────────
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [editingRelease, setEditingRelease] = useState(false);
  const [editForm, setEditForm] = useState<EditReleaseForm | null>(null);
  const [savingRelease, setSavingRelease] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskForm, setAddTaskForm] = useState<AddTaskForm>(EMPTY_ADD_TASK);
  const [addingTask, setAddingTask] = useState(false);

  // ── Streaming / AI state ──────────────────────────────────────
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);

  // ── Workspace loop state (Wave 5.2) ───────────────────────────
  const [project, setProject] = useState<CodingProject | null>(null);
  const [applyPreviews, setApplyPreviews] = useState<Record<string, WorkspaceApplyPreview>>({});
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({});
  const [applyResults, setApplyResults] = useState<Record<string, WorkspaceApplyResult>>({});
  const [testResults, setTestResults] = useState<Record<string, WorkspaceTestRunResult>>({});
  const [reviseLoadingTaskId, setReviseLoadingTaskId] = useState<string | null>(null);
  const [pendingRevisionRunId, setPendingRevisionRunId] = useState<string | null>(null);

  // ── Session store integration ─────────────────────────────────
  const {
    messages, setModule, setAreaId, setSystemPrompt, clearSession,
  } = useSessionStore();

  const {
    runMessage, stopStreaming, isStreaming, streamingText, streamingThinking,
  } = useClaude();

  // ── Data fetching ─────────────────────────────────────────────
  const fetchRelease = useCallback(async () => {
    if (!projectId || !releaseId) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/releases/${releaseId}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setRelease(data);
      setTasks(data.tasks || []);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [projectId, releaseId]);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setProjectName(data.name);
      setProject(data as CodingProject);
    } catch {
      // Silently handle
    }
  }, [projectId]);

  useEffect(() => {
    fetchRelease();
    fetchProject();
  }, [fetchRelease, fetchProject]);

  // ── Watch for streaming completion to parse results ───────────
  useEffect(() => {
    if (isStreaming || !activeTaskId || !activeMode) return;

    // Find the last assistant message
    const lastMsg = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastMsg) return;

    if (activeMode === 'plan') {
      const plan = parseJsonFromResponse<ExecutionPlan>(lastMsg.content);
      if (plan) {
        // Save the plan to the task via PATCH
        savePlanToTask(activeTaskId, plan);
      }
    } else if (activeMode === 'execute') {
      const record = parseJsonFromResponse<CompletionRecordType>(lastMsg.content);
      if (record) {
        // Save the completion record via POST complete
        saveCompletionToTask(activeTaskId, record);
      }
      // Wave 5.2: parse file blocks server-side → deterministic diff → review gate.
      requestApplyPreview(activeTaskId, lastMsg.content, 'initial', null);
    } else if (activeMode === 'revise') {
      requestApplyPreview(activeTaskId, lastMsg.content, 'revision', pendingRevisionRunId);
      setPendingRevisionRunId(null);
    }

    // Reset active state
    setActiveTaskId(null);
    setActiveMode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // ── Apply-to-workspace preview (no writes — review gate) ──────
  const requestApplyPreview = useCallback(async (
    taskId: string,
    responseText: string,
    kind: 'initial' | 'revision',
    revisionOfTestRunId: string | null,
  ) => {
    if (!projectId) return;
    setApplyErrors((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}/apply/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ response_text: responseText, kind, revision_of_test_run_id: revisionOfTestRunId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApplyErrors((prev) => ({ ...prev, [taskId]: data.error || 'Could not build the apply preview.' }));
        return;
      }
      setApplyPreviews((prev) => ({ ...prev, [taskId]: data as WorkspaceApplyPreview }));
      setApplyResults((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    } catch {
      setApplyErrors((prev) => ({ ...prev, [taskId]: 'Could not reach the server for the apply preview.' }));
    }
  }, [projectId]);

  // ── One revision round from a real test failure ───────────────
  const handleRevise = useCallback(async (taskId: string, testRunId: string) => {
    if (!projectId || isStreaming) return;
    setReviseLoadingTaskId(taskId);
    try {
      clearSession();
      const res = await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ test_run_id: testRunId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApplyErrors((prev) => ({ ...prev, [taskId]: data.error || 'Failed to start the revision round' }));
        return;
      }
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
      setActiveTaskId(taskId);
      setActiveMode('revise');
      setPendingRevisionRunId(data.revision_of_test_run_id || testRunId);
      setExpandedTasks((prev) => new Set(prev).add(taskId));
      runMessage(data.revisePrompt);
    } catch (err) {
      console.error('Failed to start revision:', err);
    } finally {
      setReviseLoadingTaskId(null);
    }
  }, [projectId, isStreaming, clearSession, setModule, setAreaId, setSystemPrompt, runMessage]);

  // ── Save plan to task ─────────────────────────────────────────
  const savePlanToTask = useCallback(async (taskId: string, plan: ExecutionPlan) => {
    if (!projectId) return;
    try {
      await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ execution_plan: plan, status: 'planned' }),
      });
      // Refresh tasks
      fetchRelease();
    } catch (err) {
      console.error('Failed to save plan:', err);
    }
  }, [projectId, fetchRelease]);

  // ── Save completion record ────────────────────────────────────
  const saveCompletionToTask = useCallback(async (taskId: string, record: CompletionRecordType) => {
    if (!projectId) return;
    try {
      await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ completion_record: record }),
      });
      // Refresh tasks
      fetchRelease();
    } catch (err) {
      console.error('Failed to save completion record:', err);
    }
  }, [projectId, fetchRelease]);

  // ── Toggle task expansion ─────────────────────────────────────
  const toggleExpand = useCallback((taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  // ── Release edit ──────────────────────────────────────────────
  const handleEditRelease = useCallback(() => {
    if (!release) return;
    setEditForm({
      name: release.name || '',
      description: release.description || '',
      scope: release.scope || '',
      acceptance_criteria: (release.acceptance_criteria || []).join('\n'),
      milestone_date: release.milestone_date || '',
    });
    setEditingRelease(true);
  }, [release]);

  const handleCancelEdit = useCallback(() => {
    setEditingRelease(false);
    setEditForm(null);
  }, []);

  const handleSaveRelease = useCallback(async () => {
    if (!projectId || !releaseId || !editForm) return;
    setSavingRelease(true);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name,
        description: editForm.description,
        scope: editForm.scope,
        acceptance_criteria: editForm.acceptance_criteria.split('\n').filter((s) => s.trim()),
      };
      if (editForm.milestone_date) payload.milestone_date = editForm.milestone_date;

      const res = await fetch(`/api/coding/projects/${projectId}/releases/${releaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditingRelease(false);
        setEditForm(null);
        fetchRelease();
      }
    } catch (err) {
      console.error('Failed to save release:', err);
    } finally {
      setSavingRelease(false);
    }
  }, [projectId, releaseId, editForm, fetchRelease]);

  // ── Add task ──────────────────────────────────────────────────
  const handleAddTask = useCallback(async () => {
    if (!projectId || !releaseId || !addTaskForm.title.trim()) return;
    setAddingTask(true);
    try {
      const payload = {
        coding_release_id: releaseId,
        title: addTaskForm.title.trim(),
        description: addTaskForm.description.trim(),
        complexity_band: addTaskForm.complexity_band,
        acceptance_criteria: addTaskForm.acceptance_criteria.split('\n').filter((s) => s.trim()),
      };
      const res = await fetch(`/api/coding/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setAddTaskForm(EMPTY_ADD_TASK);
        setShowAddTask(false);
        fetchRelease();
      }
    } catch (err) {
      console.error('Failed to add task:', err);
    } finally {
      setAddingTask(false);
    }
  }, [projectId, releaseId, addTaskForm, fetchRelease]);

  // ── Generate plan ─────────────────────────────────────────────
  const handleGeneratePlan = useCallback(async (taskId: string) => {
    if (!projectId || isStreaming) return;
    setPlanLoading(true);

    try {
      // Clear previous session for fresh streaming context
      clearSession();

      const res = await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (!res.ok) throw new Error('Failed to generate plan prompt');
      const data = await res.json();

      // Configure session store
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);

      // Set active task for tracking
      setActiveTaskId(taskId);
      setActiveMode('plan');

      // Expand the task card to show streaming
      setExpandedTasks((prev) => new Set(prev).add(taskId));

      // Run the plan prompt
      runMessage(data.taskPlanPrompt);
    } catch (err) {
      console.error('Failed to generate plan:', err);
    } finally {
      setPlanLoading(false);
    }
  }, [projectId, isStreaming, clearSession, setModule, setAreaId, setSystemPrompt, runMessage]);

  // ── Execute task ──────────────────────────────────────────────
  const handleExecuteTask = useCallback(async (taskId: string) => {
    if (!projectId || isStreaming) return;
    setExecuteLoading(true);

    try {
      // Clear previous session for fresh streaming context
      clearSession();

      const res = await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to execute task' }));
        throw new Error(errData.error || 'Failed to execute task');
      }
      const data = await res.json();

      // Configure session store
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);

      // Set active task for tracking
      setActiveTaskId(taskId);
      setActiveMode('execute');

      // Expand the task card to show streaming
      setExpandedTasks((prev) => new Set(prev).add(taskId));

      // Run the execute prompt
      runMessage(data.executePrompt);
    } catch (err) {
      console.error('Failed to execute task:', err);
    } finally {
      setExecuteLoading(false);
    }
  }, [projectId, isStreaming, clearSession, setModule, setAreaId, setSystemPrompt, runMessage]);

  // ── Approve plan and execute ──────────────────────────────────
  const handleApproveAndExecute = useCallback((taskId: string) => {
    handleExecuteTask(taskId);
  }, [handleExecuteTask]);

  // ── Modify plan (re-run plan) ─────────────────────────────────
  const handleModifyPlan = useCallback((taskId: string) => {
    handleGeneratePlan(taskId);
  }, [handleGeneratePlan]);

  // ── Update task status ────────────────────────────────────────
  const handleUpdateTaskStatus = useCallback(async (taskId: string, status: CodingTaskStatus) => {
    if (!projectId) return;
    try {
      await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ status }),
      });
      fetchRelease();
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  }, [projectId, fetchRelease]);

  // ── Finalize release ──────────────────────────────────────────
  const handleFinalizeRelease = useCallback(async () => {
    if (!projectId || !releaseId) return;
    try {
      await fetch(`/api/coding/projects/${projectId}/releases/${releaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ status: 'completed' }),
      });
      fetchRelease();
    } catch (err) {
      console.error('Failed to finalize release:', err);
    }
  }, [projectId, releaseId, fetchRelease]);

  // ── Computed values ───────────────────────────────────────────
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === 'completed'), [tasks]);
  const inProgressTasks = useMemo(() => tasks.filter((t) => ['in_progress', 'planning'].includes(t.status)), [tasks]);
  const progress = useMemo(() => tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0, [tasks, completedTasks]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0, planning: 0, planned: 0, in_progress: 0, review: 0, testing: 0, completed: 0, blocked: 0, cancelled: 0,
    };
    tasks.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
    return counts;
  }, [tasks]);

  const completionStats = useMemo(() => {
    let totalFilesCreated = 0;
    let totalFilesModified = 0;
    let totalTestsPassed = 0;
    let totalTestsFailed = 0;
    completedTasks.forEach((t) => {
      if (t.completion_record) {
        totalFilesCreated += t.completion_record.files_created?.length || 0;
        totalFilesModified += t.completion_record.files_modified?.length || 0;
        totalTestsPassed += t.completion_record.tests_passed || 0;
        totalTestsFailed += t.completion_record.tests_failed || 0;
      }
    });
    return { totalFilesCreated, totalFilesModified, totalTestsPassed, totalTestsFailed };
  }, [completedTasks]);

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        <span className="ml-2 text-sm text-adv-gray">Loading release...</span>
      </div>
    );
  }

  if (!release) {
    return <div className="p-6 text-adv-gray">Release not found.</div>;
  }

  // ────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Breadcrumb */}
      <CodingBreadcrumb items={[
        { label: 'Coding Large', href: '/coding/large' },
        { label: projectName || 'Project', href: `/coding/large/project/${projectId}` },
        { label: `Release ${release.release_number}` },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-xl font-bold text-adv-white">
            <Target className="h-6 w-6 text-adv-gold" />
            Release {release.release_number}: {release.name}
          </h1>
          <p className="mt-1 text-sm text-adv-gray">{release.description}</p>
          {release.milestone_date && (
            <p className="mt-0.5 text-xs text-adv-gray">
              <Clock className="mr-1 inline h-3 w-3" />
              Milestone: {new Date(release.milestone_date).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-sm font-bold text-adv-white">{progress}%</span>
            <div className="mt-0.5 h-1.5 w-20 overflow-hidden rounded-full bg-adv-dark">
              <div className="h-full bg-adv-teal transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
            release.status === 'completed' ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gold/10 text-adv-gold'
          }`}>
            {release.status}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: 'planning' as const, label: 'Planning', icon: List },
          { id: 'tasks' as const, label: `Tasks (${tasks.length})`, icon: CheckCircle2 },
          { id: 'progress' as const, label: 'Progress', icon: Clock },
          { id: 'completion' as const, label: 'Completion', icon: Play },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === id ? 'border-adv-teal text-adv-teal' : 'border-transparent text-adv-gray hover:text-adv-off-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ═══════════ PLANNING TAB ═══════════ */}
      {tab === 'planning' && (
        <div className="space-y-4">
          {/* Edit mode or read-only */}
          {editingRelease && editForm ? (
            <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-adv-white">Edit Release</h3>
                <div className="flex gap-2">
                  <button onClick={handleCancelEdit} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors">
                    <X className="h-3 w-3" /> Cancel
                  </button>
                  <button
                    onClick={handleSaveRelease}
                    disabled={savingRelease}
                    className="flex items-center gap-1 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                  >
                    {savingRelease ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-gray">Release Name</label>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    placeholder="Release name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-gray">Milestone Date</label>
                  <input
                    type="date"
                    value={editForm.milestone_date}
                    onChange={(e) => setEditForm({ ...editForm, milestone_date: e.target.value })}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-adv-gray">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
                  placeholder="What this release delivers"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-adv-gray">Scope</label>
                <textarea
                  value={editForm.scope}
                  onChange={(e) => setEditForm({ ...editForm, scope: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
                  placeholder="Technical scope and boundaries"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-adv-gray">Acceptance Criteria (one per line)</label>
                <textarea
                  value={editForm.acceptance_criteria}
                  onChange={(e) => setEditForm({ ...editForm, acceptance_criteria: e.target.value })}
                  rows={5}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none font-mono"
                  placeholder="Each line becomes one acceptance criterion"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Read-only planning view */}
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-adv-white">Release Details</h3>
                  <button
                    onClick={handleEditRelease}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-teal hover:border-adv-teal transition-colors"
                  >
                    <Edit3 className="h-3 w-3" /> Edit Release
                  </button>
                </div>

                {release.scope && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Scope</h4>
                    <p className="text-sm text-adv-off-white whitespace-pre-wrap">{release.scope}</p>
                  </div>
                )}

                {release.milestone_date && (
                  <div className="mb-3">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Milestone Date</h4>
                    <p className="text-sm text-adv-off-white">{new Date(release.milestone_date).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-adv-card p-5">
                <h3 className="text-sm font-semibold text-adv-white mb-2">Acceptance Criteria</h3>
                <ul className="space-y-1">
                  {(release.acceptance_criteria || []).map((ac, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-adv-off-white">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-gray" />
                      {ac}
                    </li>
                  ))}
                  {(release.acceptance_criteria || []).length === 0 && (
                    <p className="text-xs text-adv-gray">No acceptance criteria defined</p>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TASKS TAB ═══════════ */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {/* Add Task Toggle */}
          {!showAddTask ? (
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2 rounded-lg border border-dashed border-adv-teal/40 px-4 py-3 text-xs font-medium text-adv-teal hover:border-adv-teal hover:bg-adv-teal/5 transition-colors w-full justify-center"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          ) : (
            /* Add Task Form */
            <div className="rounded-lg border border-adv-teal/30 bg-adv-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-adv-white">New Task</h3>
                <button onClick={() => { setShowAddTask(false); setAddTaskForm(EMPTY_ADD_TASK); }} className="text-adv-gray hover:text-adv-off-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-adv-gray">Title</label>
                <input
                  value={addTaskForm.title}
                  onChange={(e) => setAddTaskForm({ ...addTaskForm, title: e.target.value })}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  placeholder="Task title"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-adv-gray">Description</label>
                <textarea
                  value={addTaskForm.description}
                  onChange={(e) => setAddTaskForm({ ...addTaskForm, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
                  placeholder="What this task accomplishes"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-adv-gray">Complexity</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as ComplexityBand[]).map((band) => (
                    <button
                      key={band}
                      onClick={() => setAddTaskForm({ ...addTaskForm, complexity_band: band })}
                      className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
                        addTaskForm.complexity_band === band
                          ? band === 'small' ? 'bg-adv-green/20 text-adv-green ring-1 ring-adv-green/40'
                            : band === 'medium' ? 'bg-adv-gold/20 text-adv-gold ring-1 ring-adv-gold/40'
                            : 'bg-adv-red/20 text-adv-red ring-1 ring-adv-red/40'
                          : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'
                      }`}
                    >
                      {band.charAt(0).toUpperCase() + band.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-adv-gray">Acceptance Criteria (one per line)</label>
                <textarea
                  value={addTaskForm.acceptance_criteria}
                  onChange={(e) => setAddTaskForm({ ...addTaskForm, acceptance_criteria: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none font-mono"
                  placeholder="Each line becomes one criterion"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setShowAddTask(false); setAddTaskForm(EMPTY_ADD_TASK); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTask}
                  disabled={addingTask || !addTaskForm.title.trim()}
                  className="flex items-center gap-1 rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                >
                  {addingTask ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Create Task
                </button>
              </div>
            </div>
          )}

          {/* Task Cards */}
          {tasks.map((task) => {
            const isExpanded = expandedTasks.has(task.id);
            const isActiveTask = activeTaskId === task.id;
            const isStreamingThisTask = isActiveTask && isStreaming;

            return (
              <div key={task.id} className="rounded-lg border border-border bg-adv-card overflow-hidden">
                {/* Task header */}
                <button
                  onClick={() => toggleExpand(task.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-adv-dark/30 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-adv-gray" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-adv-gray" />
                  }
                  <span className="font-mono text-xs text-adv-gray">{task.task_number}</span>
                  <span className="flex-1 text-sm font-medium text-adv-off-white">{task.title}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${complexityBadgeClass(task.complexity_band)}`}>
                    {task.complexity_band}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(task.status)}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                    {/* Description */}
                    {task.description && (
                      <div>
                        <h4 className="text-xs font-medium uppercase tracking-wider text-adv-gray mb-1">Description</h4>
                        <p className="text-sm text-adv-off-white whitespace-pre-wrap">{task.description}</p>
                      </div>
                    )}

                    {/* Acceptance criteria */}
                    {task.acceptance_criteria && task.acceptance_criteria.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium uppercase tracking-wider text-adv-gray mb-1">Acceptance Criteria</h4>
                        <ul className="space-y-0.5">
                          {task.acceptance_criteria.map((ac, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-adv-gray" />
                              {ac}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Dependencies */}
                    {task.depends_on && task.depends_on.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium uppercase tracking-wider text-adv-gray mb-1">Dependencies</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {task.depends_on.map((dep) => {
                            const depTask = tasks.find((t) => t.id === dep);
                            return (
                              <span key={dep} className="rounded-full bg-adv-dark px-2.5 py-0.5 text-[11px] text-adv-gray font-mono">
                                {depTask ? `${depTask.task_number}: ${depTask.title}` : dep}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Action area based on task status ── */}

                    {/* Pending: Show "Generate Plan" button */}
                    {task.status === 'pending' && !isStreamingThisTask && (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => handleGeneratePlan(task.id)}
                          disabled={isStreaming || planLoading}
                          className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                        >
                          {planLoading && activeTaskId === task.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Play className="h-3.5 w-3.5" />
                          }
                          Generate Plan
                        </button>
                      </div>
                    )}

                    {/* Planning: Show streaming indicator.
                        'planned', not 'planning' — the latter is not a value coding_tasks
                        can hold, so this indicator had never once rendered. It is the
                        status the plan endpoint writes when it issues the prompt, which
                        is exactly when this spinner should appear. */}
                    {(task.status === 'planned' && isStreamingThisTask && activeMode === 'plan') && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-adv-teal" />
                          <span className="text-xs font-medium text-adv-teal">Generating execution plan...</span>
                          <button
                            onClick={stopStreaming}
                            className="ml-auto rounded-lg border border-border px-3 py-1 text-xs text-adv-gray hover:text-adv-red hover:border-adv-red transition-colors"
                          >
                            Stop
                          </button>
                        </div>
                        <div className="max-h-[400px] overflow-auto rounded-lg border border-border bg-adv-dark p-3">
                          <ConversationThread
                            messages={messages}
                            streamingText={streamingText}
                            streamingThinking={streamingThinking}
                            isStreaming={isStreaming}
                          />
                        </div>
                      </div>
                    )}

                    {/* Planned: Show ExecutionPlanPanel with approve/modify */}
                    {task.status === 'planned' && task.execution_plan && !isStreamingThisTask && (
                      <div className="pt-2">
                        <ExecutionPlanPanel
                          plan={task.execution_plan}
                          onApprove={() => handleApproveAndExecute(task.id)}
                          onModify={() => handleModifyPlan(task.id)}
                        />
                      </div>
                    )}

                    {/* In progress execution: Show streaming */}
                    {(task.status === 'in_progress' && isStreamingThisTask && activeMode === 'execute') && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-adv-teal" />
                          <span className="text-xs font-medium text-adv-teal">Executing task...</span>
                          <button
                            onClick={stopStreaming}
                            className="ml-auto rounded-lg border border-border px-3 py-1 text-xs text-adv-gray hover:text-adv-red hover:border-adv-red transition-colors"
                          >
                            Stop
                          </button>
                        </div>
                        <div className="max-h-[500px] overflow-auto rounded-lg border border-border bg-adv-dark p-3">
                          <ConversationThread
                            messages={messages}
                            streamingText={streamingText}
                            streamingThinking={streamingThinking}
                            isStreaming={isStreaming}
                          />
                        </div>
                      </div>
                    )}

                    {/* Show plan as readonly when task is in a post-plan state but not being streamed */}
                    {task.execution_plan && !['pending', 'planned', 'planning'].includes(task.status) && !isStreamingThisTask && (
                      <div className="pt-2">
                        <ExecutionPlanPanel plan={task.execution_plan} readonly />
                      </div>
                    )}

                    {/* Completed: Show CompletionRecord */}
                    {task.status === 'completed' && task.completion_record && (
                      <div className="pt-2">
                        <CompletionRecord record={task.completion_record} />
                      </div>
                    )}

                    {/* ── Wave 5.2: apply-to-workspace → real tests → one revise round ── */}
                    {applyErrors[task.id] && (
                      <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/5 px-3 py-2 text-xs text-adv-gold">
                        Apply to workspace: {applyErrors[task.id]}
                        {!project?.directory_path && (
                          <span className="block mt-0.5 text-adv-gray">
                            Bind a workspace directory on the project page (Workspace card) to enable file writes.
                          </span>
                        )}
                      </div>
                    )}

                    {applyPreviews[task.id] && (
                      <div className="pt-2">
                        <WorkspaceApplyPanel
                          projectId={projectId!}
                          preview={applyPreviews[task.id]}
                          onApplied={(result) => setApplyResults((prev) => ({ ...prev, [task.id]: result }))}
                        />
                      </div>
                    )}

                    {/* Real test execution — shown once files were applied (or task is done) and a workspace is bound */}
                    {project?.directory_path && (applyResults[task.id] || task.status === 'completed') && (
                      <div className="pt-2">
                        <WorkspaceTestPanel
                          projectId={projectId!}
                          taskId={task.id}
                          releaseId={releaseId}
                          testCommand={project?.test_command || null}
                          workspacePath={project?.directory_path || null}
                          onResult={(result) => setTestResults((prev) => ({ ...prev, [task.id]: result }))}
                        />
                      </div>
                    )}

                    {/* One revise round from a real failure — user stays in the loop */}
                    {testResults[task.id] && !testResults[task.id].passed && !isStreaming && (
                      <div className="pt-1">
                        <button
                          onClick={() => handleRevise(task.id, testResults[task.id].testRunId)}
                          disabled={reviseLoadingTaskId === task.id}
                          className="flex items-center gap-1.5 rounded-lg border border-adv-gold px-4 py-2 text-xs font-medium text-adv-gold hover:bg-adv-gold/10 transition-colors disabled:opacity-50"
                        >
                          {reviseLoadingTaskId === task.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Play className="h-3.5 w-3.5" />}
                          Revise from test failures (one AI round — you review the diff again)
                        </button>
                      </div>
                    )}

                    {/* Revision streaming */}
                    {isStreamingThisTask && activeMode === 'revise' && (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-adv-gold" />
                          <span className="text-xs font-medium text-adv-gold">Revising from real test failures...</span>
                          <button
                            onClick={stopStreaming}
                            className="ml-auto rounded-lg border border-border px-3 py-1 text-xs text-adv-gray hover:text-adv-red hover:border-adv-red transition-colors"
                          >
                            Stop
                          </button>
                        </div>
                        <div className="max-h-[400px] overflow-auto rounded-lg border border-border bg-adv-dark p-3">
                          <ConversationThread
                            messages={messages}
                            streamingText={streamingText}
                            streamingThinking={streamingThinking}
                            isStreaming={isStreaming}
                          />
                        </div>
                      </div>
                    )}

                    {/* Streaming finished for this task but not yet parsed -- show conversation */}
                    {isActiveTask && !isStreaming && activeMode && messages.length > 0 && (
                      <div className="pt-2">
                        <div className="max-h-[400px] overflow-auto rounded-lg border border-border bg-adv-dark p-3">
                          <ConversationThread
                            messages={messages}
                            streamingText={streamingText}
                            streamingThinking={streamingThinking}
                            isStreaming={isStreaming}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {tasks.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-adv-card/50 px-6 py-8 text-center">
              <Target className="mx-auto h-8 w-8 text-adv-gray" />
              <p className="mt-2 text-sm text-adv-gray">No tasks in this release yet.</p>
              <p className="text-xs text-adv-gray">Click "Add Task" above to create your first task.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ PROGRESS TAB ═══════════ */}
      {tab === 'progress' && (
        <div className="space-y-4">
          {/* Release progress bar */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-adv-white">Release Progress</h3>
              <span className="text-lg font-bold text-adv-teal">{progress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-adv-dark">
              <div className="h-full rounded-full bg-adv-teal transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-adv-gray">
              <span>{completedTasks.length} of {tasks.length} tasks completed</span>
              {tasks.length > 0 && completedTasks.length < tasks.length && (
                <span>{tasks.length - completedTasks.length} remaining</span>
              )}
            </div>
          </div>

          {/* Status breakdown */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <h3 className="text-sm font-semibold text-adv-white mb-3">Status Breakdown</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { key: 'pending', label: 'Pending', color: 'text-adv-gray' },
                { key: 'planning', label: 'Planning', color: 'text-adv-gold' },
                { key: 'planned', label: 'Planned', color: 'text-adv-blue' },
                { key: 'in_progress', label: 'In Progress', color: 'text-adv-teal' },
                { key: 'review', label: 'Review', color: 'text-adv-blue' },
                { key: 'testing', label: 'Testing', color: 'text-adv-gold' },
                { key: 'completed', label: 'Completed', color: 'text-adv-green' },
                { key: 'blocked', label: 'Blocked', color: 'text-adv-red' },
              ].map(({ key, label, color }) => (
                <div key={key} className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-center">
                  <span className={`text-lg font-bold ${color}`}>{statusCounts[key] || 0}</span>
                  <p className="text-xs text-adv-gray">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* In-progress tasks with ProgressView */}
          {inProgressTasks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-adv-white">Active Tasks</h3>
              {inProgressTasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-border bg-adv-card p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-adv-teal" />
                    <span className="font-mono text-xs text-adv-gray">{task.task_number}</span>
                    <span className="text-sm font-medium text-adv-off-white">{task.title}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(task.status)}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                  {task.progress_log && task.progress_log.length > 0 && (
                    <ProgressView entries={task.progress_log} />
                  )}
                </div>
              ))}
            </div>
          )}

          {tasks.length === 0 && (
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <p className="text-sm text-adv-gray text-center">No tasks to track. Create tasks in the Tasks tab first.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ COMPLETION TAB ═══════════ */}
      {tab === 'completion' && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <h3 className="text-sm font-semibold text-adv-white mb-3">Release Summary</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-adv-dark px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-adv-green" />
                  <span className="text-xl font-bold text-adv-green">{completedTasks.length}</span>
                </div>
                <span className="text-xs text-adv-gray">Tasks Completed</span>
              </div>
              <div className="rounded-lg border border-border bg-adv-dark px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <FileCode className="h-4 w-4 text-adv-teal" />
                  <span className="text-xl font-bold text-adv-teal">{completionStats.totalFilesCreated + completionStats.totalFilesModified}</span>
                </div>
                <span className="text-xs text-adv-gray">Files Created/Modified</span>
              </div>
              <div className="rounded-lg border border-border bg-adv-dark px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <TestTube className="h-4 w-4 text-adv-green" />
                  <span className="text-xl font-bold text-adv-green">{completionStats.totalTestsPassed}</span>
                </div>
                <span className="text-xs text-adv-gray">Tests Passed</span>
              </div>
              <div className="rounded-lg border border-border bg-adv-dark px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-adv-red" />
                  <span className="text-xl font-bold text-adv-red">{completionStats.totalTestsFailed}</span>
                </div>
                <span className="text-xs text-adv-gray">Tests Failed</span>
              </div>
            </div>
          </div>

          {/* Completed task list with CompletionRecord */}
          {completedTasks.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-adv-white">Completed Tasks</h3>
              {completedTasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-border bg-adv-card overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-adv-green" />
                    <span className="font-mono text-xs text-adv-gray">{task.task_number}</span>
                    <span className="flex-1 text-sm font-medium text-adv-off-white">{task.title}</span>
                    {task.completed_at && (
                      <span className="text-xs text-adv-gray">
                        <Clock className="mr-0.5 inline h-3 w-3" />
                        {new Date(task.completed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {task.completion_record && (
                    <div className="p-3">
                      <CompletionRecord record={task.completion_record} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-adv-card/50 px-6 py-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-adv-gray" />
              <p className="mt-2 text-sm text-adv-gray">No completed tasks yet.</p>
            </div>
          )}

          {/* Finalize release button */}
          {release.status !== 'completed' && completedTasks.length > 0 && completedTasks.length === tasks.length && (
            <div className="rounded-xl border border-adv-green/30 bg-adv-green/5 p-5 text-center">
              <h3 className="text-sm font-semibold text-adv-green mb-1">All tasks completed</h3>
              <p className="text-xs text-adv-gray mb-3">
                All {tasks.length} tasks are marked as completed. Ready to finalize this release.
              </p>
              <button
                onClick={handleFinalizeRelease}
                className="rounded-lg bg-adv-green px-6 py-2.5 text-sm font-medium text-white hover:bg-adv-green/80 transition-colors"
              >
                Finalize Release
              </button>
            </div>
          )}

          {release.status === 'completed' && (
            <div className="rounded-xl border border-adv-green/30 bg-adv-green/5 p-5 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-adv-green" />
              <h3 className="mt-2 text-sm font-semibold text-adv-green">Release Completed</h3>
              <p className="mt-1 text-xs text-adv-gray">
                This release has been finalized with {completedTasks.length} tasks completed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
