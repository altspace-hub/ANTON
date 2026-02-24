import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2, BarChart3, List, CheckCircle2, AlertTriangle, Activity, DollarSign,
  Plus, ArrowRight, ExternalLink, Filter, GitBranch, ChevronDown, ChevronRight,
  Play, FileText, Clock, Target, TestTube, MessageSquare,
  Shield, Wrench, TrendingUp, BarChart, AlertCircle, RefreshCw, Zap,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import ExecutionPlanPanel from '@/components/coding/ExecutionPlanPanel';
import CompletionRecord from '@/components/coding/CompletionRecord';
import ExportAntonButton from '@/components/coding/ExportAntonButton';
import QualityScore from '@/components/coding/QualityScore';
import VersionHistory from '@/components/coding/VersionHistory';
import ConversationThread from '@/components/shared/ConversationThread';
import { useSessionStore } from '@/stores/useSessionStore';
import { useClaude } from '@/hooks/useClaude';
import { CODING_PHASES } from '@/lib/coding-types';
import type { CodingProject, CodingRelease, CodingTask, CodingReview, CodingTechDebt, CodingChange } from '@/lib/coding-types';

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'releases' | 'tasks' | 'reviews' | 'governance' | 'cost' | 'activity';

interface ActivityItem {
  id: string;
  type: 'task' | 'review' | 'change' | 'test' | 'release';
  title: string;
  status: string;
  timestamp: string;
  detail?: string;
}

interface ReleaseFormData {
  name: string;
  description: string;
  scope: string;
  acceptance_criteria: string;
  milestone_date: string;
}

const EMPTY_RELEASE_FORM: ReleaseFormData = {
  name: '',
  description: '',
  scope: '',
  acceptance_criteria: '',
  milestone_date: '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('openexpert-token');
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'completed': return 'bg-adv-green/10 text-adv-green';
    case 'in_progress': return 'bg-adv-teal-dim text-adv-teal';
    case 'testing': return 'bg-adv-blue/10 text-adv-blue';
    case 'review': return 'bg-adv-gold/10 text-adv-gold';
    case 'blocked': return 'bg-adv-red/10 text-adv-red';
    case 'cancelled': return 'bg-adv-red/10 text-adv-red';
    case 'planned': return 'bg-adv-dark text-adv-gray';
    case 'pending': return 'bg-adv-dark text-adv-gray';
    default: return 'bg-adv-dark text-adv-gray';
  }
}

function complexityBadge(band: string): string {
  switch (band) {
    case 'small': return 'bg-adv-green/10 text-adv-green';
    case 'medium': return 'bg-adv-gold/10 text-adv-gold';
    case 'large': return 'bg-adv-red/10 text-adv-red';
    default: return 'bg-adv-dark text-adv-gray';
  }
}

function verdictBadge(verdict: string): string {
  switch (verdict) {
    case 'endorse': return 'bg-adv-green/10 text-adv-green';
    case 'flag': return 'bg-adv-gold/10 text-adv-gold';
    case 'dissent': return 'bg-adv-red/10 text-adv-red';
    default: return 'bg-adv-dark text-adv-gray';
  }
}

function activityIcon(type: string) {
  switch (type) {
    case 'task': return <CheckCircle2 className="h-3.5 w-3.5 text-adv-teal" />;
    case 'review': return <MessageSquare className="h-3.5 w-3.5 text-adv-gold" />;
    case 'change': return <GitBranch className="h-3.5 w-3.5 text-adv-blue" />;
    case 'test': return <TestTube className="h-3.5 w-3.5 text-adv-green" />;
    case 'release': return <Target className="h-3.5 w-3.5 text-adv-gold" />;
    default: return <Activity className="h-3.5 w-3.5 text-adv-gray" />;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTimestamp(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function CodingLargeProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // Data state
  const [tab, setTab] = useState<Tab>('overview');
  const [project, setProject] = useState<CodingProject | null>(null);
  const [releases, setReleases] = useState<CodingRelease[]>([]);
  const [tasks, setTasks] = useState<CodingTask[]>([]);
  const [reviews, setReviews] = useState<CodingReview[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Release creation state
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [releaseForm, setReleaseForm] = useState<ReleaseFormData>(EMPTY_RELEASE_FORM);
  const [creatingRelease, setCreatingRelease] = useState(false);

  // Task filters
  const [taskReleaseFilter, setTaskReleaseFilter] = useState<string>('all');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('all');

  // Review filter
  const [reviewTypeFilter, setReviewTypeFilter] = useState<string>('all');

  // Tech debt & changes state
  const [techDebt, setTechDebt] = useState<CodingTechDebt[]>([]);
  const [changes, setChanges] = useState<CodingChange[]>([]);
  const [costData, setCostData] = useState<{ estimate: any; actual: any } | null>(null);

  // Tech debt form
  const [showTechDebtForm, setShowTechDebtForm] = useState(false);
  const [techDebtForm, setTechDebtForm] = useState({ title: '', description: '', severity: 'medium' as string, owner: '' });

  // Change proposal form
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeForm, setChangeForm] = useState({ change_type: 'task' as string, change_level: 'task' as string, title: '', rationale: '' });

  // Expanded items
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);

  // Quality score
  const [qualityScore, setQualityScore] = useState<{ score: number; dimensions?: Record<string, number> } | null>(null);

  // Streaming state for task plan/execute
  const [streamingContext, setStreamingContext] = useState<{ type: 'plan' | 'execute' | 'release_plan'; targetId: string } | null>(null);

  // Streaming via useClaude
  const { setModule, setAreaId, setSystemPrompt } = useSessionStore();
  const { runMessage, isStreaming, streamingText, streamingThinking, messages, stopStreaming } = useClaude();

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setProject(data);
      setReleases(data.releases || []);
      setTasks(data.tasks || []);
      setReviews(data.reviews || []);
      if (data.techDebt) setTechDebt(data.techDebt);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchActivity = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/activity`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setActivityItems(Array.isArray(data) ? data : data.items || []);
    } catch {
      // silently fail
    }
  }, [projectId]);

  const fetchTechDebt = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/tech-debt`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setTechDebt(Array.isArray(data) ? data : data.items || []);
    } catch {
      // silently fail
    }
  }, [projectId]);

  const fetchChanges = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/changes`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setChanges(Array.isArray(data) ? data : data.items || []);
    } catch {
      // silently fail
    }
  }, [projectId]);

  const fetchCostData = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/cost`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setCostData(data);
    } catch {
      // silently fail
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Fire-and-forget quality score fetch for the project
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/coding/projects/${projectId}/quality-score`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data.score === 'number') {
          setQualityScore({ score: data.score, dimensions: data.dimensions });
        }
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (tab === 'activity') {
      fetchActivity();
    }
    if (tab === 'governance') {
      fetchTechDebt();
      fetchChanges();
    }
    if (tab === 'cost') {
      fetchCostData();
    }
  }, [tab, fetchActivity, fetchTechDebt, fetchChanges, fetchCostData]);

  // ── Release Creation ───────────────────────────────────────────────────────

  const handleCreateRelease = useCallback(async () => {
    if (!projectId || !releaseForm.name.trim()) return;
    setCreatingRelease(true);
    try {
      const body = {
        name: releaseForm.name.trim(),
        description: releaseForm.description.trim(),
        scope: releaseForm.scope.trim(),
        acceptance_criteria: releaseForm.acceptance_criteria
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        milestone_date: releaseForm.milestone_date || undefined,
      };
      const res = await fetch(`/api/coding/projects/${projectId}/releases`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setReleaseForm(EMPTY_RELEASE_FORM);
        setShowReleaseForm(false);
        await fetchProject(); // refresh data
      }
    } catch {
      // silently fail
    } finally {
      setCreatingRelease(false);
    }
  }, [projectId, releaseForm, fetchProject]);

  // ── Generate Task Breakdown for Release ────────────────────────────────────

  const handleGenerateTaskBreakdown = useCallback(async (releaseId: string) => {
    if (!projectId || isStreaming) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/releases/${releaseId}/plan`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      // Configure session store for streaming
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
      setStreamingContext({ type: 'release_plan', targetId: releaseId });
      await runMessage(data.prompt);
    } catch {
      // silently fail
    }
  }, [projectId, isStreaming, runMessage, setModule, setAreaId, setSystemPrompt]);

  // ── Generate Plan for Task ─────────────────────────────────────────────────

  const handleGenerateTaskPlan = useCallback(async (taskId: string) => {
    if (!projectId || isStreaming) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}/plan`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
      setStreamingContext({ type: 'plan', targetId: taskId });
      await runMessage(data.prompt);
    } catch {
      // silently fail
    }
  }, [projectId, isStreaming, tasks, runMessage, setModule, setAreaId, setSystemPrompt]);

  // ── Execute Task ───────────────────────────────────────────────────────────

  const handleExecuteTask = useCallback(async (taskId: string) => {
    if (!projectId || isStreaming) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/tasks/${taskId}/execute`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
      setStreamingContext({ type: 'execute', targetId: taskId });
      await runMessage(data.prompt);
    } catch {
      // silently fail
    }
  }, [projectId, isStreaming, runMessage, setModule, setAreaId, setSystemPrompt]);

  // ── Tech Debt CRUD ────────────────────────────────────────────────────────

  const handleCreateTechDebt = useCallback(async () => {
    if (!projectId || !techDebtForm.title.trim()) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/tech-debt`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: techDebtForm.title.trim(),
          description: techDebtForm.description.trim(),
          severity: techDebtForm.severity,
          owner: techDebtForm.owner.trim() || undefined,
        }),
      });
      if (res.ok) {
        setTechDebtForm({ title: '', description: '', severity: 'medium', owner: '' });
        setShowTechDebtForm(false);
        await fetchTechDebt();
      }
    } catch {
      // silently fail
    }
  }, [projectId, techDebtForm, fetchTechDebt]);

  const handleUpdateTechDebtStatus = useCallback(async (debtId: string, newStatus: string) => {
    if (!projectId) return;
    try {
      await fetch(`/api/coding/projects/${projectId}/tech-debt/${debtId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchTechDebt();
    } catch {
      // silently fail
    }
  }, [projectId, fetchTechDebt]);

  // ── Change Management ────────────────────────────────────────────────────

  const handleCreateChange = useCallback(async () => {
    if (!projectId || !changeForm.title.trim()) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/changes`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          change_type: changeForm.change_type,
          change_level: changeForm.change_level,
          title: changeForm.title.trim(),
          rationale: changeForm.rationale.trim() || undefined,
        }),
      });
      if (res.ok) {
        setChangeForm({ change_type: 'task', change_level: 'task', title: '', rationale: '' });
        setShowChangeForm(false);
        await fetchChanges();
      }
    } catch {
      // silently fail
    }
  }, [projectId, changeForm, fetchChanges]);

  const handleUpdateChangeStatus = useCallback(async (changeId: string, newStatus: string) => {
    if (!projectId) return;
    try {
      await fetch(`/api/coding/projects/${projectId}/changes/${changeId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchChanges();
    } catch {
      // silently fail
    }
  }, [projectId, fetchChanges]);

  const handleImpactAnalysis = useCallback(async (changeId: string) => {
    if (!projectId || isStreaming) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/changes/${changeId}/impact`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
      setStreamingContext({ type: 'plan', targetId: `impact-${changeId}` });
      await runMessage(data.prompt || data.impactPrompt);
    } catch {
      // silently fail
    }
  }, [projectId, isStreaming, runMessage, setModule, setAreaId, setSystemPrompt]);

  // ── Alignment Check & Operational Readiness ──────────────────────────────

  const handleAlignmentCheck = useCallback(async () => {
    if (!projectId || isStreaming) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/alignment-check`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
      setStreamingContext({ type: 'plan', targetId: 'alignment' });
      await runMessage(data.alignmentPrompt || data.prompt);
    } catch {
      // silently fail
    }
  }, [projectId, isStreaming, runMessage, setModule, setAreaId, setSystemPrompt]);

  const handleOperationalReadiness = useCallback(async () => {
    if (!projectId || isStreaming) return;
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/operational-readiness`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
      setStreamingContext({ type: 'plan', targetId: 'readiness' });
      await runMessage(data.readinessPrompt || data.prompt);
    } catch {
      // silently fail
    }
  }, [projectId, isStreaming, runMessage, setModule, setAreaId, setSystemPrompt]);

  // ── Navigate ───────────────────────────────────────────────────────────────

  const navigateToRelease = useCallback((releaseId: string) => {
    navigate(`/coding/large/project/${projectId}/releases/${releaseId}`);
  }, [navigate, projectId]);

  const navigateToArchitecture = useCallback(() => {
    navigate(`/coding/large/project/${projectId}/architecture`);
  }, [navigate, projectId]);

  // ── Computed Values ────────────────────────────────────────────────────────

  const completedReleases = releases.filter((r) => r.status === 'completed').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const reviewVerdicts = {
    endorse: reviews.filter((r) => r.verdict === 'endorse').length,
    flag: reviews.filter((r) => r.verdict === 'flag').length,
    dissent: reviews.filter((r) => r.verdict === 'dissent').length,
  };
  const totalCost = project?.cost_actual?.total_cost_usd ?? 0;
  const currentPhase = CODING_PHASES.find((p) => p.number === project?.current_phase);
  const techDebtCount = techDebt.filter((td) => td.status === 'open' || td.status === 'in_progress').length;
  const changesCount = changes.filter((c) => c.status === 'proposed').length;

  // Filtered tasks
  const filteredTasks = tasks.filter((t) => {
    if (taskReleaseFilter !== 'all' && t.coding_release_id !== taskReleaseFilter) return false;
    if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) return false;
    return true;
  });

  // Filtered reviews
  const filteredReviews = reviews.filter((r) => {
    if (reviewTypeFilter !== 'all' && r.review_type !== reviewTypeFilter) return false;
    return true;
  });

  // Recent activity for overview (last 5)
  const recentActivity = activityItems.slice(0, 5);

  // Unique task statuses for filter
  const taskStatuses = Array.from(new Set(tasks.map((t) => t.status)));

  // Unique review types for filter
  const reviewTypes = Array.from(new Set(reviews.map((r) => r.review_type)));

  // Release progress helper
  const getReleaseProgress = useCallback((releaseId: string) => {
    const releaseTasks = tasks.filter((t) => t.coding_release_id === releaseId);
    if (releaseTasks.length === 0) return 0;
    const completed = releaseTasks.filter((t) => t.status === 'completed').length;
    return Math.round((completed / releaseTasks.length) * 100);
  }, [tasks]);

  const getReleaseTaskCount = useCallback((releaseId: string) => {
    return tasks.filter((t) => t.coding_release_id === releaseId).length;
  }, [tasks]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-adv-gray text-sm">Loading project...</span>
      </div>
    );
  }

  if (!project) {
    return <div className="p-6 text-adv-gray">Project not found</div>;
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'releases', label: 'Releases', icon: List, count: releases.length },
    { id: 'tasks', label: 'Tasks', icon: CheckCircle2, count: tasks.length },
    { id: 'reviews', label: 'Reviews', icon: AlertTriangle, count: reviews.length },
    { id: 'governance', label: 'Governance', icon: Shield, count: techDebtCount + changesCount },
    { id: 'cost', label: 'Cost', icon: DollarSign },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <CodingBreadcrumb items={[
        { label: 'Coding Large', href: '/coding/large' },
        { label: project.name },
      ]} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-xl font-bold text-adv-white">
            <Building2 className="h-6 w-6 text-adv-gold" />
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-adv-gray">{project.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
            project.status === 'completed' ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gold/10 text-adv-gold'
          }`}>
            {currentPhase?.label || project.status}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-adv-dark px-3 py-1 text-xs text-adv-gray">
            <DollarSign className="h-3 w-3" />
            ${totalCost.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Phase Progress ──────────────────────────────────────────────────── */}
      <div className="flex gap-1">
        {CODING_PHASES.map((phase) => (
          <div
            key={phase.number}
            className={`flex-1 rounded-sm py-1 text-center text-[10px] ${
              phase.number < project.current_phase ? 'bg-adv-green/20 text-adv-green' :
              phase.number === project.current_phase ? 'bg-adv-gold/20 text-adv-gold font-medium' :
              'bg-adv-dark text-adv-gray-med'
            }`}
            title={phase.label}
          >
            {phase.number}
          </div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === id ? 'border-adv-teal text-adv-teal' : 'border-transparent text-adv-gray hover:text-adv-off-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />{label}
            {count !== undefined && count > 0 && (
              <span className="ml-1 rounded-full bg-adv-card px-1.5 text-[10px]">{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* OVERVIEW TAB                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Project Summary Card */}
          <div className="rounded-lg border border-border bg-adv-card p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-adv-white">Project Summary</h2>
                <p className="mt-2 text-sm leading-relaxed text-adv-off-white">
                  {project.description || 'No description set.'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-adv-gray">Status:</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(project.status)}`}>
                      {project.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-adv-gray">Phase:</span>
                    <span className="text-xs font-medium text-adv-off-white">
                      {currentPhase ? `${currentPhase.number}. ${currentPhase.label}` : 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tech Stack Badges */}
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase text-adv-gray">Tech Stack</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(project.tech_stack || []).map((t) => (
                  <span key={t} className="rounded-full bg-adv-teal-dim px-2.5 py-0.5 text-xs text-adv-teal">{t}</span>
                ))}
                {(project.tech_stack || []).length === 0 && (
                  <span className="text-xs text-adv-gray">Not yet defined</span>
                )}
              </div>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Releases */}
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-adv-gray">Releases</h3>
                <GitBranch className="h-4 w-4 text-adv-teal" />
              </div>
              <p className="mt-2 text-2xl font-bold text-adv-white">{releases.length}</p>
              <p className="text-xs text-adv-gray">
                {completedReleases} completed / {releases.length} total
              </p>
              {releases.length > 0 && (
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-adv-dark">
                  <div
                    className="bg-adv-green transition-all"
                    style={{ width: `${(completedReleases / releases.length) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Tasks */}
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-adv-gray">Tasks</h3>
                <CheckCircle2 className="h-4 w-4 text-adv-teal" />
              </div>
              <p className="mt-2 text-2xl font-bold text-adv-white">{tasks.length}</p>
              <p className="text-xs text-adv-gray">
                {completedTasks} completed / {tasks.length} total
              </p>
              {tasks.length > 0 && (
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-adv-dark">
                  <div
                    className="bg-adv-green transition-all"
                    style={{ width: `${(completedTasks / tasks.length) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Reviews */}
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-adv-gray">Reviews</h3>
                <AlertTriangle className="h-4 w-4 text-adv-gold" />
              </div>
              <p className="mt-2 text-2xl font-bold text-adv-white">{reviews.length}</p>
              <div className="mt-1 flex items-center gap-2 text-[10px]">
                <span className="text-adv-green">{reviewVerdicts.endorse} endorse</span>
                <span className="text-adv-gray-med">|</span>
                <span className="text-adv-gold">{reviewVerdicts.flag} flag</span>
                <span className="text-adv-gray-med">|</span>
                <span className="text-adv-red">{reviewVerdicts.dissent} dissent</span>
              </div>
            </div>

            {/* Cost */}
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-adv-gray">Cost</h3>
                <DollarSign className="h-4 w-4 text-adv-gold" />
              </div>
              <p className="mt-2 text-2xl font-bold text-adv-white">${totalCost.toFixed(2)}</p>
              <p className="text-xs text-adv-gray">spent</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-lg border border-border bg-adv-card p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase text-adv-gray">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setTab('releases'); setShowReleaseForm(true); }}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Release
              </button>
              <button
                onClick={navigateToArchitecture}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-dark px-4 py-2 text-xs font-medium text-adv-off-white hover:bg-adv-card transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Architecture
              </button>
              <button
                onClick={handleAlignmentCheck}
                disabled={isStreaming}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-dark px-4 py-2 text-xs font-medium text-adv-off-white hover:bg-adv-card transition-colors disabled:opacity-50"
              >
                <Target className="h-3.5 w-3.5" />
                Run Alignment Check
              </button>
              <button
                onClick={() => setTab('governance')}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-dark px-4 py-2 text-xs font-medium text-adv-off-white hover:bg-adv-card transition-colors"
              >
                <Shield className="h-3.5 w-3.5" />
                Governance
                {techDebtCount > 0 && (
                  <span className="rounded-full bg-adv-gold/10 px-1.5 text-[10px] font-medium text-adv-gold">
                    {techDebtCount} debt
                  </span>
                )}
              </button>
              {projectId && (
                <ExportAntonButton
                  type="blueprint"
                  id={projectId}
                  label="Export Blueprint"
                />
              )}
            </div>
          </div>

          {/* Quality Score (if available) */}
          {qualityScore && (
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase text-adv-gray">Project Quality</h3>
              <QualityScore
                score={qualityScore.score}
                dimensions={qualityScore.dimensions}
              />
            </div>
          )}

          {/* Architecture Version History */}
          {projectId && (
            <VersionHistory
              entityType="coding-architecture"
              entityId={projectId}
            />
          )}

          {/* Recent Activity Feed */}
          <div className="rounded-lg border border-border bg-adv-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-adv-gray">Recent Activity</h3>
              <button
                onClick={() => { setTab('activity'); fetchActivity(); }}
                className="flex items-center gap-1 text-[10px] text-adv-teal hover:text-adv-teal-dark transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {recentActivity.length > 0 ? (
              <div className="space-y-2">
                {recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded border border-border bg-adv-dark px-3 py-2">
                    {activityIcon(item.type)}
                    <span className="flex-1 truncate text-xs text-adv-off-white">{item.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusBadge(item.status)}`}>
                      {item.status}
                    </span>
                    <span className="text-[10px] text-adv-gray-med">{formatTimestamp(item.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-adv-gray">No recent activity. Activity will appear as you work on the project.</p>
            )}
          </div>

          {/* Streaming output for alignment check */}
          {streamingContext?.targetId === 'alignment' && (isStreaming || messages.length > 0) && (
            <div className="rounded-lg border border-border bg-adv-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase text-adv-gray">Alignment Check</h3>
              <ConversationThread
                messages={messages}
                streamingText={streamingText}
                streamingThinking={streamingThinking}
                isStreaming={isStreaming}
              />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* RELEASES TAB                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'releases' && (
        <div className="space-y-4">
          {/* Create Release Button / Inline Form */}
          {!showReleaseForm ? (
            <button
              onClick={() => setShowReleaseForm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Release
            </button>
          ) : (
            <div className="rounded-lg border border-adv-teal/30 bg-adv-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-adv-white">New Release</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Name *</label>
                  <input
                    type="text"
                    value={releaseForm.name}
                    onChange={(e) => setReleaseForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. v1.0 - Core Foundation"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Description</label>
                  <input
                    type="text"
                    value={releaseForm.description}
                    onChange={(e) => setReleaseForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description of what this release delivers"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Scope</label>
                  <input
                    type="text"
                    value={releaseForm.scope}
                    onChange={(e) => setReleaseForm((f) => ({ ...f, scope: e.target.value }))}
                    placeholder="e.g. Authentication, API layer, Dashboard"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Acceptance Criteria</label>
                  <textarea
                    value={releaseForm.acceptance_criteria}
                    onChange={(e) => setReleaseForm((f) => ({ ...f, acceptance_criteria: e.target.value }))}
                    placeholder="One criterion per line..."
                    rows={4}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-none"
                  />
                  <p className="mt-0.5 text-[10px] text-adv-gray-med">One acceptance criterion per line</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Milestone Date</label>
                  <input
                    type="date"
                    value={releaseForm.milestone_date}
                    onChange={(e) => setReleaseForm((f) => ({ ...f, milestone_date: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleCreateRelease}
                    disabled={creatingRelease || !releaseForm.name.trim()}
                    className="rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                  >
                    {creatingRelease ? 'Creating...' : 'Create Release'}
                  </button>
                  <button
                    onClick={() => { setShowReleaseForm(false); setReleaseForm(EMPTY_RELEASE_FORM); }}
                    className="rounded-lg border border-border bg-adv-dark px-4 py-2 text-xs text-adv-off-white hover:bg-adv-card transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Release List */}
          {releases.length === 0 && !showReleaseForm && (
            <p className="text-sm text-adv-gray">No releases yet. Create one to start planning.</p>
          )}

          {releases.map((r) => {
            const progress = getReleaseProgress(r.id);
            const taskCount = getReleaseTaskCount(r.id);
            return (
              <div
                key={r.id}
                className="group rounded-lg border border-border bg-adv-card transition-colors hover:border-adv-teal/30"
              >
                {/* Main card — clickable */}
                <div
                  className="cursor-pointer p-4"
                  onClick={() => navigateToRelease(r.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-adv-dark text-xs font-bold text-adv-gold">
                        R{r.release_number}
                      </span>
                      <div>
                        <h4 className="text-sm font-medium text-adv-white group-hover:text-adv-teal transition-colors">
                          {r.name}
                        </h4>
                        {r.description && (
                          <p className="mt-0.5 text-xs text-adv-gray">{r.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                      <ArrowRight className="h-4 w-4 text-adv-gray-med opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Task count + Progress bar + Milestone */}
                  <div className="mt-3 flex items-center gap-4">
                    <span className="flex items-center gap-1 text-[10px] text-adv-gray">
                      <CheckCircle2 className="h-3 w-3" />
                      {taskCount} tasks
                    </span>
                    {taskCount > 0 && (
                      <div className="flex flex-1 items-center gap-2">
                        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-adv-dark">
                          <div
                            className="bg-adv-teal transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-adv-gray">{progress}%</span>
                      </div>
                    )}
                    {r.milestone_date && (
                      <span className="flex items-center gap-1 text-[10px] text-adv-gray">
                        <Clock className="h-3 w-3" />
                        {formatDate(r.milestone_date)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Generate Task Breakdown button */}
                <div className="flex items-center gap-2 border-t border-border px-4 py-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleGenerateTaskBreakdown(r.id); }}
                    disabled={isStreaming}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-medium text-adv-teal hover:bg-adv-teal-dim transition-colors disabled:opacity-50"
                  >
                    <Play className="h-3 w-3" />
                    Generate Task Breakdown
                  </button>
                </div>

                {/* Streaming output for task breakdown */}
                {streamingContext?.type === 'release_plan' && streamingContext.targetId === r.id && (isStreaming || messages.length > 0) && (
                  <div className="border-t border-border p-4">
                    <ConversationThread
                      messages={messages}
                      streamingText={streamingText}
                      streamingThinking={streamingThinking}
                      isStreaming={isStreaming}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TASKS TAB                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-adv-gray" />
              <span className="text-xs text-adv-gray">Filter:</span>
            </div>
            <select
              value={taskReleaseFilter}
              onChange={(e) => setTaskReleaseFilter(e.target.value)}
              className="rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="all">All Releases</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>Release {r.release_number}: {r.name}</option>
              ))}
            </select>
            <select
              value={taskStatusFilter}
              onChange={(e) => setTaskStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="all">All Statuses</option>
              {taskStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="ml-auto text-[10px] text-adv-gray">
              {filteredTasks.length} of {tasks.length} tasks
            </span>
          </div>

          {/* Task List */}
          {filteredTasks.length === 0 && (
            <p className="text-sm text-adv-gray">
              {tasks.length === 0 ? 'No tasks yet. Create a release first.' : 'No tasks match current filters.'}
            </p>
          )}

          {filteredTasks.map((t) => {
            const isExpanded = expandedTaskId === t.id;
            return (
              <div key={t.id} className="rounded-lg border border-border bg-adv-card">
                {/* Task header — click to expand */}
                <button
                  onClick={() => setExpandedTaskId(isExpanded ? null : t.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-adv-teal" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-adv-gray" />
                  }
                  <span className="font-mono text-xs text-adv-gray">{t.task_number}</span>
                  <span className="flex-1 truncate text-sm text-adv-off-white">{t.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(t.status)}`}>
                    {t.status}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${complexityBadge(t.complexity_band)}`}>
                    {t.complexity_band}
                  </span>
                  {t.assigned_role && (
                    <span className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray">
                      {t.assigned_role}
                    </span>
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    {/* Description */}
                    {t.description && (
                      <div>
                        <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-adv-gray">Description</h4>
                        <p className="text-sm leading-relaxed text-adv-off-white">{t.description}</p>
                      </div>
                    )}

                    {/* Acceptance Criteria */}
                    {t.acceptance_criteria && t.acceptance_criteria.length > 0 && (
                      <div>
                        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray">Acceptance Criteria</h4>
                        <ul className="space-y-1">
                          {t.acceptance_criteria.map((ac, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-adv-gray" />
                              {ac}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Execution Plan (readonly) */}
                    {t.execution_plan && (
                      <ExecutionPlanPanel plan={t.execution_plan} readonly className="mt-2" />
                    )}

                    {/* Completion Record */}
                    {t.status === 'completed' && t.completion_record && (
                      <CompletionRecord record={t.completion_record} className="mt-2" />
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      {(t.status === 'pending' || t.status === 'planned') && !t.execution_plan && (
                        <button
                          onClick={() => handleGenerateTaskPlan(t.id)}
                          disabled={isStreaming}
                          className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Generate Plan
                        </button>
                      )}
                      {t.execution_plan && t.status !== 'completed' && t.status !== 'in_progress' && (
                        <button
                          onClick={() => handleExecuteTask(t.id)}
                          disabled={isStreaming}
                          className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Execute
                        </button>
                      )}
                    </div>

                    {/* Streaming output for this task */}
                    {streamingContext && streamingContext.targetId === t.id && (isStreaming || messages.length > 0) && (
                      <div className="mt-3 rounded-lg border border-border bg-adv-dark p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs font-medium text-adv-teal">
                            {streamingContext.type === 'plan' ? 'Generating Plan...' : 'Executing Task...'}
                          </span>
                          {isStreaming && (
                            <button
                              onClick={stopStreaming}
                              className="text-[10px] text-adv-red hover:text-adv-red/80"
                            >
                              Stop
                            </button>
                          )}
                        </div>
                        <ConversationThread
                          messages={messages}
                          streamingText={streamingText}
                          streamingThinking={streamingThinking}
                          isStreaming={isStreaming}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* REVIEWS TAB                                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'reviews' && (
        <div className="space-y-4">
          {/* Filter by review type */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-adv-gray" />
              <span className="text-xs text-adv-gray">Filter:</span>
            </div>
            <select
              value={reviewTypeFilter}
              onChange={(e) => setReviewTypeFilter(e.target.value)}
              className="rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value="all">All Types</option>
              {reviewTypes.map((rt) => (
                <option key={rt} value={rt}>{rt}</option>
              ))}
            </select>
            <span className="ml-auto text-[10px] text-adv-gray">
              {filteredReviews.length} of {reviews.length} reviews
            </span>
          </div>

          {/* Review List */}
          {filteredReviews.length === 0 && (
            <p className="text-sm text-adv-gray">
              {reviews.length === 0 ? 'No reviews yet.' : 'No reviews match current filter.'}
            </p>
          )}

          {filteredReviews.map((r) => {
            const isExpanded = expandedReviewId === r.id;
            return (
              <div key={r.id} className="rounded-lg border border-border bg-adv-card">
                <button
                  onClick={() => setExpandedReviewId(isExpanded ? null : r.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-adv-teal" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-adv-gray" />
                  }
                  <div className="flex flex-1 items-center gap-3">
                    <span className="text-sm font-medium text-adv-off-white">{r.reviewer_persona_id}</span>
                    <span className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray">{r.review_type}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                    r.verdict ? verdictBadge(r.verdict) : statusBadge(r.status)
                  }`}>
                    {r.verdict || r.status}
                  </span>
                  <span className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray">{r.status}</span>
                </button>

                {isExpanded && (
                  <div className="space-y-3 border-t border-border px-4 py-4">
                    {/* Findings */}
                    {r.findings && (
                      <div>
                        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray">Findings</h4>
                        <div className="rounded border border-border bg-adv-dark p-3">
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-adv-off-white">{r.findings}</p>
                        </div>
                      </div>
                    )}

                    {/* Recommendations */}
                    {r.recommendations && (
                      <div>
                        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray">Recommendations</h4>
                        <div className="rounded border border-border bg-adv-dark p-3">
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-adv-off-white">{r.recommendations}</p>
                        </div>
                      </div>
                    )}

                    {/* Severity Summary */}
                    {r.severity_summary && Object.keys(r.severity_summary).length > 0 && (
                      <div>
                        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray">Severity Summary</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(r.severity_summary).map(([key, count]) => (
                            <span key={key} className="rounded-full bg-adv-dark px-2.5 py-0.5 text-[10px] text-adv-off-white">
                              {key}: <strong>{count}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-[10px] text-adv-gray-med">
                      {r.is_mandatory && (
                        <span className="text-adv-gold">Mandatory</span>
                      )}
                      <span>Requested: {formatTimestamp(r.review_requested_at)}</span>
                      {r.review_completed_at && (
                        <span>Completed: {formatTimestamp(r.review_completed_at)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* GOVERNANCE TAB                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'governance' && (
        <div className="space-y-6">

          {/* ── Tech Debt Section ─────────────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray">
                <Wrench className="mr-1.5 inline h-3.5 w-3.5" />
                Tech Debt
              </h3>
              <button
                onClick={() => setShowTechDebtForm((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Tech Debt
              </button>
            </div>

            {/* Inline form */}
            {showTechDebtForm && (
              <div className="mb-4 rounded-lg border border-adv-teal/30 bg-adv-card p-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Title *</label>
                  <input
                    type="text"
                    value={techDebtForm.title}
                    onChange={(e) => setTechDebtForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Missing error handling in auth module"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Description</label>
                  <textarea
                    value={techDebtForm.description}
                    onChange={(e) => setTechDebtForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Describe the tech debt and its impact..."
                    rows={3}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-adv-off-white">Severity</label>
                    <select
                      value={techDebtForm.severity}
                      onChange={(e) => setTechDebtForm((f) => ({ ...f, severity: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-adv-off-white">Owner</label>
                    <input
                      type="text"
                      value={techDebtForm.owner}
                      onChange={(e) => setTechDebtForm((f) => ({ ...f, owner: e.target.value }))}
                      placeholder="Optional"
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleCreateTechDebt}
                    disabled={!techDebtForm.title.trim()}
                    className="rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setShowTechDebtForm(false); setTechDebtForm({ title: '', description: '', severity: 'medium', owner: '' }); }}
                    className="rounded-lg border border-border bg-adv-dark px-4 py-2 text-xs text-adv-off-white hover:bg-adv-card transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Tech debt list */}
            {techDebt.length === 0 && !showTechDebtForm && (
              <p className="text-sm text-adv-gray">No tech debt items recorded.</p>
            )}
            <div className="space-y-2">
              {techDebt.map((td) => (
                <div key={td.id} className="rounded-lg border border-border bg-adv-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-adv-off-white">{td.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          td.severity === 'critical' ? 'bg-adv-red/10 text-adv-red' :
                          td.severity === 'high' ? 'bg-adv-red/10 text-adv-red' :
                          td.severity === 'medium' ? 'bg-adv-gold/10 text-adv-gold' :
                          'bg-adv-green/10 text-adv-green'
                        }`}>
                          {td.severity}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          td.status === 'resolved' ? 'bg-adv-green/10 text-adv-green' :
                          td.status === 'accepted_risk' ? 'bg-adv-gold/10 text-adv-gold' :
                          td.status === 'deferred' ? 'bg-adv-blue/10 text-adv-blue' :
                          td.status === 'in_progress' ? 'bg-adv-teal-dim text-adv-teal' :
                          'bg-adv-dark text-adv-gray'
                        }`}>
                          {td.status.replace('_', ' ')}
                        </span>
                      </div>
                      {td.description && (
                        <p className="mt-1 text-xs text-adv-gray leading-relaxed">{td.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-adv-gray-med">
                        {td.owner && <span>Owner: {td.owner}</span>}
                        {td.target_release_id && <span>Target release: {td.target_release_id}</span>}
                      </div>
                    </div>
                    {td.status === 'open' && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleUpdateTechDebtStatus(td.id, 'resolved')}
                          className="rounded px-2 py-1 text-[10px] font-medium text-adv-green hover:bg-adv-green/10 transition-colors"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => handleUpdateTechDebtStatus(td.id, 'deferred')}
                          className="rounded px-2 py-1 text-[10px] font-medium text-adv-blue hover:bg-adv-blue/10 transition-colors"
                        >
                          Defer
                        </button>
                        <button
                          onClick={() => handleUpdateTechDebtStatus(td.id, 'accepted_risk')}
                          className="rounded px-2 py-1 text-[10px] font-medium text-adv-gold hover:bg-adv-gold/10 transition-colors"
                        >
                          Accept Risk
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Change Management Section ─────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray">
                <RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />
                Change Management
              </h3>
              <button
                onClick={() => setShowChangeForm((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Propose Change
              </button>
            </div>

            {/* Inline form */}
            {showChangeForm && (
              <div className="mb-4 rounded-lg border border-adv-teal/30 bg-adv-card p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-adv-off-white">Change Type</label>
                    <select
                      value={changeForm.change_type}
                      onChange={(e) => setChangeForm((f) => ({ ...f, change_type: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                    >
                      <option value="task">Task</option>
                      <option value="release">Release</option>
                      <option value="goal">Goal</option>
                      <option value="architecture">Architecture</option>
                      <option value="stack">Stack</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-adv-off-white">Change Level</label>
                    <select
                      value={changeForm.change_level}
                      onChange={(e) => setChangeForm((f) => ({ ...f, change_level: e.target.value }))}
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                    >
                      <option value="task">Task</option>
                      <option value="release">Release</option>
                      <option value="project">Project</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Title *</label>
                  <input
                    type="text"
                    value={changeForm.title}
                    onChange={(e) => setChangeForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Switch from REST to GraphQL for API layer"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-off-white">Rationale</label>
                  <textarea
                    value={changeForm.rationale}
                    onChange={(e) => setChangeForm((f) => ({ ...f, rationale: e.target.value }))}
                    placeholder="Why is this change needed?"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleCreateChange}
                    disabled={!changeForm.title.trim()}
                    className="rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                  >
                    Submit Proposal
                  </button>
                  <button
                    onClick={() => { setShowChangeForm(false); setChangeForm({ change_type: 'task', change_level: 'task', title: '', rationale: '' }); }}
                    className="rounded-lg border border-border bg-adv-dark px-4 py-2 text-xs text-adv-off-white hover:bg-adv-card transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Change list */}
            {changes.length === 0 && !showChangeForm && (
              <p className="text-sm text-adv-gray">No change proposals yet.</p>
            )}
            <div className="space-y-2">
              {changes.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-adv-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-adv-off-white">{c.title}</span>
                        <span className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray">
                          {c.change_type}
                        </span>
                        <span className="rounded-full bg-adv-dark px-2 py-0.5 text-[10px] text-adv-gray">
                          {c.change_level}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          c.status === 'proposed' ? 'bg-adv-gold/10 text-adv-gold' :
                          c.status === 'approved' ? 'bg-adv-green/10 text-adv-green' :
                          c.status === 'implemented' ? 'bg-adv-teal-dim text-adv-teal' :
                          'bg-adv-red/10 text-adv-red'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                      {c.rationale && (
                        <p className="mt-1 text-xs text-adv-gray leading-relaxed">{c.rationale}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleImpactAnalysis(c.id)}
                        disabled={isStreaming}
                        className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-adv-teal hover:bg-adv-teal-dim transition-colors disabled:opacity-50"
                      >
                        <Zap className="h-3 w-3" />
                        Impact Analysis
                      </button>
                      {c.status === 'proposed' && (
                        <>
                          <button
                            onClick={() => handleUpdateChangeStatus(c.id, 'approved')}
                            className="rounded px-2 py-1 text-[10px] font-medium text-adv-green hover:bg-adv-green/10 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleUpdateChangeStatus(c.id, 'rejected')}
                            className="rounded px-2 py-1 text-[10px] font-medium text-adv-red hover:bg-adv-red/10 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Streaming output for impact analysis */}
                  {streamingContext?.targetId === `impact-${c.id}` && (isStreaming || messages.length > 0) && (
                    <div className="mt-3 rounded-lg border border-border bg-adv-dark p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-adv-teal">Impact Analysis</span>
                        {isStreaming && (
                          <button onClick={stopStreaming} className="text-[10px] text-adv-red hover:text-adv-red/80">Stop</button>
                        )}
                      </div>
                      <ConversationThread
                        messages={messages}
                        streamingText={streamingText}
                        streamingThinking={streamingThinking}
                        isStreaming={isStreaming}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Goal Alignment Section ────────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray">
                <Target className="mr-1.5 inline h-3.5 w-3.5" />
                Goal Alignment
              </h3>
              <button
                onClick={handleAlignmentCheck}
                disabled={isStreaming}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Run Alignment Check
              </button>
            </div>
            <p className="text-xs text-adv-gray mb-3">
              Verify that current releases, tasks, and architecture remain aligned with the project goals and constraints.
            </p>
            {streamingContext?.targetId === 'alignment' && (isStreaming || messages.length > 0) && (
              <div className="rounded-lg border border-border bg-adv-dark p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-adv-teal">Alignment Check</span>
                  {isStreaming && (
                    <button onClick={stopStreaming} className="text-[10px] text-adv-red hover:text-adv-red/80">Stop</button>
                  )}
                </div>
                <ConversationThread
                  messages={messages}
                  streamingText={streamingText}
                  streamingThinking={streamingThinking}
                  isStreaming={isStreaming}
                />
              </div>
            )}
          </div>

          {/* ── Operational Readiness Section ─────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray">
                <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
                Operational Readiness
              </h3>
              <button
                onClick={handleOperationalReadiness}
                disabled={isStreaming}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5" />
                Run Readiness Check
              </button>
            </div>
            <p className="text-xs text-adv-gray mb-3">
              Assess deployment readiness including documentation, testing coverage, monitoring, and runbooks.
            </p>
            {streamingContext?.targetId === 'readiness' && (isStreaming || messages.length > 0) && (
              <div className="rounded-lg border border-border bg-adv-dark p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-adv-teal">Operational Readiness</span>
                  {isStreaming && (
                    <button onClick={stopStreaming} className="text-[10px] text-adv-red hover:text-adv-red/80">Stop</button>
                  )}
                </div>
                <ConversationThread
                  messages={messages}
                  streamingText={streamingText}
                  streamingThinking={streamingThinking}
                  isStreaming={isStreaming}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* COST TAB                                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'cost' && (
        <div className="space-y-6">

          {/* Cost Summary Card */}
          <div className="rounded-lg border border-border bg-adv-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-adv-white">Cost Summary</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-adv-dark p-4 text-center">
                <p className="text-xs text-adv-gray">Total Spent</p>
                <p className="mt-1 text-2xl font-bold text-adv-gold">
                  ${(costData?.actual?.total_cost_usd ?? project?.cost_actual?.total_cost_usd ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg bg-adv-dark p-4 text-center">
                <p className="text-xs text-adv-gray">Input Tokens</p>
                <p className="mt-1 text-lg font-bold text-adv-off-white">
                  {(costData?.actual?.total_input_tokens ?? project?.cost_actual?.total_input_tokens ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-adv-dark p-4 text-center">
                <p className="text-xs text-adv-gray">Output Tokens</p>
                <p className="mt-1 text-lg font-bold text-adv-off-white">
                  {(costData?.actual?.total_output_tokens ?? project?.cost_actual?.total_output_tokens ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Cost by Phase */}
          {(() => {
            const byPhase = costData?.actual?.by_phase ?? project?.cost_actual?.by_phase ?? {};
            const phaseEntries = Object.entries(byPhase) as [string, { input: number; output: number; cost_usd: number }][];
            if (phaseEntries.length === 0) return null;
            const maxCost = Math.max(...phaseEntries.map(([, v]) => v.cost_usd), 0.01);
            return (
              <div className="rounded-lg border border-border bg-adv-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-adv-white">
                  <BarChart className="mr-1.5 inline h-4 w-4 text-adv-teal" />
                  Cost by Phase
                </h3>
                <div className="space-y-3">
                  {phaseEntries.map(([phaseName, phaseData]) => {
                    const barWidth = (phaseData.cost_usd / maxCost) * 100;
                    const phaseLabel = CODING_PHASES.find((p) => p.id === phaseName)?.label || phaseName;
                    return (
                      <div key={phaseName}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-adv-off-white">{phaseLabel}</span>
                          <span className="text-xs font-medium text-adv-gold">${phaseData.cost_usd.toFixed(2)}</span>
                        </div>
                        <div className="flex h-4 overflow-hidden rounded bg-adv-dark">
                          <div
                            className="rounded bg-adv-teal transition-all"
                            style={{ width: `${Math.max(barWidth, 1)}%` }}
                          />
                        </div>
                        <div className="mt-0.5 flex items-center gap-4 text-[10px] text-adv-gray-med">
                          <span>In: {phaseData.input.toLocaleString()} tokens</span>
                          <span>Out: {phaseData.output.toLocaleString()} tokens</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Cost Estimate vs Actual */}
          {(() => {
            const estimate = costData?.estimate ?? project?.cost_estimate;
            if (!estimate || (!estimate.optimistic && !estimate.realistic && !estimate.pessimistic)) return null;
            const actual = costData?.actual?.total_cost_usd ?? project?.cost_actual?.total_cost_usd ?? 0;
            return (
              <div className="rounded-lg border border-border bg-adv-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-adv-white">
                  <TrendingUp className="mr-1.5 inline h-4 w-4 text-adv-teal" />
                  Estimate vs Actual
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  {estimate.optimistic && (
                    <div className="rounded-lg border border-border bg-adv-dark p-3 text-center">
                      <p className="text-[10px] uppercase text-adv-gray">Optimistic</p>
                      <p className="mt-1 text-lg font-bold text-adv-green">${estimate.optimistic.total_cost_usd.toFixed(2)}</p>
                      <p className="text-[10px] text-adv-gray-med">{estimate.optimistic.total_tokens?.toLocaleString()} tokens</p>
                    </div>
                  )}
                  {estimate.realistic && (
                    <div className="rounded-lg border border-border bg-adv-dark p-3 text-center">
                      <p className="text-[10px] uppercase text-adv-gray">Realistic</p>
                      <p className="mt-1 text-lg font-bold text-adv-gold">${estimate.realistic.total_cost_usd.toFixed(2)}</p>
                      <p className="text-[10px] text-adv-gray-med">{estimate.realistic.total_tokens?.toLocaleString()} tokens</p>
                    </div>
                  )}
                  {estimate.pessimistic && (
                    <div className="rounded-lg border border-border bg-adv-dark p-3 text-center">
                      <p className="text-[10px] uppercase text-adv-gray">Pessimistic</p>
                      <p className="mt-1 text-lg font-bold text-adv-red">${estimate.pessimistic.total_cost_usd.toFixed(2)}</p>
                      <p className="text-[10px] text-adv-gray-med">{estimate.pessimistic.total_tokens?.toLocaleString()} tokens</p>
                    </div>
                  )}
                  <div className="rounded-lg border border-adv-teal/30 bg-adv-dark p-3 text-center">
                    <p className="text-[10px] uppercase text-adv-teal">Actual</p>
                    <p className="mt-1 text-lg font-bold text-adv-white">${actual.toFixed(2)}</p>
                    <p className="text-[10px] text-adv-gray-med">
                      {(costData?.actual?.total_input_tokens ?? project?.cost_actual?.total_input_tokens ?? 0) +
                       (costData?.actual?.total_output_tokens ?? project?.cost_actual?.total_output_tokens ?? 0)
                      } tokens
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Token Usage Detail */}
          <div className="rounded-lg border border-border bg-adv-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-adv-white">Token Usage</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-adv-dark p-4">
                <p className="text-xs text-adv-gray">Total Input Tokens</p>
                <p className="mt-1 text-xl font-bold text-adv-off-white">
                  {(costData?.actual?.total_input_tokens ?? project?.cost_actual?.total_input_tokens ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-adv-dark p-4">
                <p className="text-xs text-adv-gray">Total Output Tokens</p>
                <p className="mt-1 text-xl font-bold text-adv-off-white">
                  {(costData?.actual?.total_output_tokens ?? project?.cost_actual?.total_output_tokens ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ACTIVITY TAB                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'activity' && (
        <div className="space-y-3">
          {activityItems.length === 0 && (
            <p className="text-sm text-adv-gray">No activity recorded yet. Activity will appear as tasks, reviews, and changes are processed.</p>
          )}

          {activityItems.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border bg-adv-card px-4 py-3">
              <div className="mt-0.5">
                {activityIcon(item.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-adv-off-white">{item.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge(item.status)}`}>
                    {item.status}
                  </span>
                </div>
                {item.detail && (
                  <p className="mt-0.5 text-xs text-adv-gray">{item.detail}</p>
                )}
              </div>
              <span className="shrink-0 flex items-center gap-1 text-[10px] text-adv-gray-med">
                <Clock className="h-3 w-3" />
                {formatTimestamp(item.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
