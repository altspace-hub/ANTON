import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  FolderOpen,
  Plus,
  Compass,
  ArrowRight,
  ArrowLeft,
  Send,
  FileCode,
  FolderInput,
  Save,
  CheckCircle2,
  Circle,
  Loader2,
  Users,
  Target,
  ShieldAlert,
  Network,
  AlertTriangle,
  FileText,
  Sparkles,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import ConversationThread from '@/components/shared/ConversationThread';
import ThinkingControls from '@/components/shared/ThinkingControls';
import StatusIndicator from '@/components/shared/StatusIndicator';
import ExportBar from '@/components/shared/ExportBar';
import { useClaude } from '@/hooks/useClaude';
import { useSessionStore } from '@/stores/useSessionStore';
import { useExport } from '@/hooks/useExport';
import type { CodingProject } from '@/lib/coding-types';
import type { ThinkingLevel } from '@/lib/types';

// ── Auth helper ─────────────────────────────────────────────────
function getAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('openexpert-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Types ───────────────────────────────────────────────────────
type View = 'landing' | 'create' | 'onboarding' | 'discovery';

interface DiscoveryPhase {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const DISCOVERY_PHASES: DiscoveryPhase[] = [
  { id: 'stakeholders', label: 'Stakeholder Analysis', icon: Users, description: 'Identify key stakeholders and their needs' },
  { id: 'requirements', label: 'Requirements', icon: Target, description: 'Functional and non-functional requirements' },
  { id: 'constraints', label: 'Constraints', icon: ShieldAlert, description: 'Technical, regulatory, and business constraints' },
  { id: 'integrations', label: 'Integrations', icon: Network, description: 'Systems, APIs, and data flows' },
  { id: 'risks', label: 'Risks', icon: AlertTriangle, description: 'Risk identification and mitigation strategies' },
];

// ── Main Component ──────────────────────────────────────────────
export default function CodingLargeDiscoveryPage() {
  const navigate = useNavigate();

  // ── View state ──
  const [view, setView] = useState<View>('landing');
  const [projects, setProjects] = useState<CodingProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // ── Create form ──
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectGoals, setProjectGoals] = useState('');
  const [projectStakeholders, setProjectStakeholders] = useState('');
  const [projectConstraints, setProjectConstraints] = useState('');
  const [hasExistingCodebase, setHasExistingCodebase] = useState(false);

  // ── Project tracking ──
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<{ name: string; description: string; goals: string } | null>(null);

  // ── Onboarding (Phase 0) ──
  const [codeInput, setCodeInput] = useState('');
  const [codeInputMode, setCodeInputMode] = useState<'paste' | 'path'>('paste');
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineComplete, setBaselineComplete] = useState(false);
  const [baselineSaving, setBaselineSaving] = useState(false);

  // ── Discovery (Phase 1) ──
  const [followUpInput, setFollowUpInput] = useState('');
  const [discoveryStarted, setDiscoveryStarted] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [finalizationStarted, setFinalizationStarted] = useState(false);
  const [finalizationComplete, setFinalizationComplete] = useState(false);
  const [finalDocumentContent, setFinalDocumentContent] = useState('');
  const [activeDiscoveryPhases, setActiveDiscoveryPhases] = useState<Set<string>>(new Set());
  const [apiError, setApiError] = useState<string | null>(null);

  // ── Hooks ──
  const {
    runMessage,
    stopStreaming,
    isStreaming,
    streamingText,
    streamingThinking,
    messages,
    lastInputTokens,
    lastOutputTokens,
    model,
  } = useClaude();

  const {
    setModule,
    setAreaId,
    setThinking,
    setCreativity,
    setSystemPrompt,
    clearSession,
    thinking,
  } = useSessionStore();

  const { doExport, isExporting } = useExport();

  // ── Refs ──
  const followUpRef = useRef<HTMLTextAreaElement>(null);
  const codeInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load projects on mount ──
  useEffect(() => {
    setLoadingProjects(true);
    fetch('/api/coding/projects', { headers: getAuthHeader() })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoadingProjects(false);
      })
      .catch(() => setLoadingProjects(false));
  }, []);

  // ── Track finalized document from messages ──
  useEffect(() => {
    if (finalizationStarted && !isStreaming && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant' && lastMsg.content) {
        setFinalDocumentContent(lastMsg.content);
        setFinalizationComplete(true);
      }
    }
  }, [finalizationStarted, isStreaming, messages]);

  // ── Track baseline completion ──
  useEffect(() => {
    if (view === 'onboarding' && baselineLoading && !isStreaming && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant' && lastMsg.content) {
        setBaselineComplete(true);
        setBaselineLoading(false);
      }
    }
  }, [view, baselineLoading, isStreaming, messages]);

  // ── Detect discovery phases from conversation ──
  useEffect(() => {
    if (view !== 'discovery') return;
    const allText = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content.toLowerCase())
      .join(' ');
    const phases = new Set<string>();
    if (/stakeholder|user|persona|audience/.test(allText)) phases.add('stakeholders');
    if (/requirement|feature|functionality|use.?case|user.?stor/.test(allText)) phases.add('requirements');
    if (/constraint|limitation|regulation|compliance|budget|timeline/.test(allText)) phases.add('constraints');
    if (/integrat|api|system|data.?flow|external|third.?party/.test(allText)) phases.add('integrations');
    if (/risk|threat|mitigation|vulnerability|concern/.test(allText)) phases.add('risks');
    setActiveDiscoveryPhases(phases);
  }, [view, messages]);

  // ── Create project handler ──
  const handleCreateProject = useCallback(async () => {
    if (!projectName.trim()) return;
    setApiError(null);

    try {
      const res = await fetch('/api/coding/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
          tier: 'large',
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Failed to create project' }));
        setApiError(errBody.error || 'Failed to create project');
        return;
      }

      const project = await res.json();
      setProjectId(project.id);
      setProjectData({
        name: projectName,
        description: projectDescription,
        goals: projectGoals,
      });

      // Update project with optional fields if provided
      if (projectGoals || projectStakeholders || projectConstraints) {
        const updatePayload: Record<string, string> = {};
        if (projectGoals) updatePayload.goals = projectGoals;
        if (projectStakeholders) updatePayload.stakeholders = projectStakeholders;
        if (projectConstraints) updatePayload.constraints = projectConstraints;

        await fetch(`/api/coding/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(updatePayload),
        }).catch(() => {}); // non-fatal
      }

      // Clear any previous session and configure for the appropriate phase
      clearSession();

      if (hasExistingCodebase) {
        setView('onboarding');
      } else {
        // Jump directly to discovery for new projects
        startDiscovery(project.id);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      setApiError('Network error creating project. Please try again.');
    }
  }, [
    projectName,
    projectDescription,
    projectGoals,
    projectStakeholders,
    projectConstraints,
    hasExistingCodebase,
    clearSession,
  ]);

  // ── Start baseline assessment (Phase 0) ──
  const startBaseline = useCallback(async () => {
    if (!projectId || !codeInput.trim() || isStreaming) return;
    setApiError(null);
    setBaselineLoading(true);
    setBaselineComplete(false);

    try {
      const payload: Record<string, string> = {};
      if (codeInputMode === 'paste') {
        payload.code = codeInput;
      } else {
        payload.directoryPath = codeInput;
      }

      const res = await fetch(`/api/coding/projects/${projectId}/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Baseline request failed' }));
        setApiError(errBody.error || 'Baseline request failed');
        setBaselineLoading(false);
        return;
      }

      const data = await res.json();

      // Configure session
      if (data.moduleId) setModule(data.moduleId);
      if (data.areaId) setAreaId(data.areaId);
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
      setThinking('investigate');
      setCreativity('strict');

      // Run the baseline prompt through Claude
      await runMessage(data.baselinePrompt);
    } catch (err) {
      console.error('Baseline failed:', err);
      setApiError('Failed to start baseline assessment. Please try again.');
      setBaselineLoading(false);
    }
  }, [projectId, codeInput, codeInputMode, isStreaming, runMessage, setModule, setAreaId, setSystemPrompt, setThinking, setCreativity]);

  // ── Save baseline and continue to discovery ──
  const handleSaveBaselineAndContinue = useCallback(async () => {
    if (!projectId || isStreaming) return;
    setBaselineSaving(true);
    setApiError(null);

    try {
      // Get the last assistant message as the baseline summary
      const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
      const summary = lastAssistantMessage?.content || '';

      await fetch(`/api/coding/projects/${projectId}/baseline/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ summary }),
      });

      // Clear session and transition to discovery
      clearSession();
      startDiscovery(projectId);
    } catch (err) {
      console.error('Failed to save baseline:', err);
      setApiError('Failed to save baseline. Please try again.');
    } finally {
      setBaselineSaving(false);
    }
  }, [projectId, isStreaming, messages, clearSession]);

  // ── Start discovery (Phase 1) ──
  const startDiscovery = useCallback(
    async (pid: string) => {
      setView('discovery');
      setDiscoveryStarted(false);
      setDiscoveryLoading(true);
      setFinalizationStarted(false);
      setFinalizationComplete(false);
      setFinalDocumentContent('');
      setApiError(null);

      try {
        const contextPayload: Record<string, string> = {};
        if (projectGoals) contextPayload.goals = projectGoals;
        if (projectStakeholders) contextPayload.stakeholders = projectStakeholders;
        if (projectConstraints) contextPayload.constraints = projectConstraints;

        const res = await fetch(`/api/coding/projects/${pid}/discovery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(contextPayload),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: 'Discovery request failed' }));
          setApiError(errBody.error || 'Discovery request failed');
          setDiscoveryLoading(false);
          return;
        }

        const data = await res.json();

        // Configure session for discovery
        if (data.moduleId) setModule(data.moduleId);
        if (data.areaId) setAreaId(data.areaId);
        if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);
        setThinking('think_hard');
        setCreativity('balanced');

        setDiscoveryStarted(true);
        setDiscoveryLoading(false);

        // Run the initial discovery prompt
        await runMessage(data.discoveryPrompt);
      } catch (err) {
        console.error('Discovery failed:', err);
        setApiError('Failed to start discovery. Please try again.');
        setDiscoveryLoading(false);
      }
    },
    [projectGoals, projectStakeholders, projectConstraints, runMessage, setModule, setAreaId, setSystemPrompt, setThinking, setCreativity],
  );

  // ── Send follow-up message in discovery ──
  const handleSendFollowUp = useCallback(async () => {
    if (!followUpInput.trim() || isStreaming) return;
    const msg = followUpInput;
    setFollowUpInput('');
    await runMessage(msg);
  }, [followUpInput, isStreaming, runMessage]);

  // ── Finalize discovery ──
  const handleFinalizeDiscovery = useCallback(async () => {
    if (!projectId || isStreaming) return;
    setFinalizationStarted(true);
    setFinalizationComplete(false);
    setApiError(null);

    try {
      // Build summary from conversation
      const conversationSummary = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
        .join('\n\n');

      const res = await fetch(`/api/coding/projects/${projectId}/discovery/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ summary: conversationSummary }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Finalization request failed' }));
        setApiError(errBody.error || 'Finalization request failed');
        setFinalizationStarted(false);
        return;
      }

      const data = await res.json();

      // Update system prompt for finalization if provided
      if (data.systemPromptOverride) setSystemPrompt(data.systemPromptOverride);

      // Run the finalization prompt to generate the formal document
      await runMessage(data.finalizationPrompt);
    } catch (err) {
      console.error('Finalization failed:', err);
      setApiError('Failed to finalize discovery. Please try again.');
      setFinalizationStarted(false);
    }
  }, [projectId, isStreaming, messages, setSystemPrompt, runMessage]);

  // ── Keyboard shortcut for follow-up ──
  const handleFollowUpKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isStreaming) {
        e.preventDefault();
        handleSendFollowUp();
      }
    },
    [isStreaming, handleSendFollowUp],
  );

  // ── Handle thinking change ──
  const handleThinkingChange = useCallback(
    (level: ThinkingLevel) => {
      setThinking(level);
    },
    [setThinking],
  );

  // ── Export handler ──
  const handleExport = useCallback(
    (format: string) => {
      const content = finalDocumentContent || messages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n\n---\n\n');
      doExport(format, content, `discovery-${projectData?.name || 'project'}`);
    },
    [finalDocumentContent, messages, projectData, doExport],
  );

  // ── Get last assistant content for export ──
  const lastAssistantContent = finalDocumentContent
    || messages.filter((m) => m.role === 'assistant').map((m) => m.content).pop()
    || '';

  // ═════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <CodingBreadcrumb
        items={[
          { label: 'Coding Large', href: '/coding/large' },
          ...(view === 'onboarding'
            ? [{ label: projectData?.name || 'Onboarding' }]
            : view === 'discovery'
              ? [{ label: projectData?.name || 'Discovery' }]
              : [{ label: 'New Project' }]),
        ]}
      />

      {/* Page Header */}
      <div>
        <h1 className="flex items-center gap-3 text-xl font-bold text-adv-white">
          <Building2 className="h-6 w-6 text-adv-gold" />
          {view === 'onboarding'
            ? 'Phase 0 -- Codebase Onboarding'
            : view === 'discovery'
              ? 'Phase 1 -- Discovery & Requirements'
              : 'Coding Large -- Professional Development'}
        </h1>
        <p className="mt-1 text-sm text-adv-gray">
          {view === 'onboarding'
            ? 'Baseline assessment of your existing codebase before planning improvements'
            : view === 'discovery'
              ? 'AI-led requirements gathering, stakeholder analysis, and project scoping'
              : 'Full AI-led software development with 7-phase lifecycle and governance'}
        </p>
      </div>

      {/* Error banner */}
      {apiError && (
        <div className="flex items-center gap-2 rounded-lg border border-adv-red/30 bg-adv-red/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-adv-red" />
          <p className="text-sm text-adv-red">{apiError}</p>
          <button onClick={() => setApiError(null)} className="ml-auto text-xs text-adv-red hover:text-adv-red/70">
            Dismiss
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* VIEW: LANDING                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      {view === 'landing' && (
        <div className="space-y-6">
          {/* Start Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              onClick={() => {
                setHasExistingCodebase(true);
                setView('create');
              }}
              className="group rounded-xl border-2 border-adv-gold bg-adv-card p-5 text-left transition-all hover:shadow-lg hover:shadow-adv-gold/5"
            >
              <FolderOpen className="h-8 w-8 text-adv-gold" />
              <h3 className="mt-3 text-lg font-semibold text-adv-white">Existing Codebase</h3>
              <p className="mt-1 text-sm text-adv-gray">
                Start with Phase 0 -- baseline assessment of your current code
              </p>
              <span className="mt-3 flex items-center gap-1 text-xs text-adv-gold">
                Phase 0: Onboarding <ArrowRight className="h-3 w-3" />
              </span>
            </button>

            <button
              onClick={() => {
                setHasExistingCodebase(false);
                setView('create');
              }}
              className="group rounded-xl border-2 border-adv-teal bg-adv-card p-5 text-left transition-all hover:shadow-lg hover:shadow-adv-teal/5"
            >
              <Plus className="h-8 w-8 text-adv-teal" />
              <h3 className="mt-3 text-lg font-semibold text-adv-white">New Project</h3>
              <p className="mt-1 text-sm text-adv-gray">
                Start with Phase 1 -- discovery and requirements gathering
              </p>
              <span className="mt-3 flex items-center gap-1 text-xs text-adv-teal">
                Phase 1: Discovery <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          </div>

          {/* Existing Projects */}
          {loadingProjects ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-adv-gray" />
              <span className="ml-2 text-sm text-adv-gray">Loading projects...</span>
            </div>
          ) : (
            projects.length > 0 && (
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <h2 className="mb-3 text-sm font-semibold text-adv-white">Your Projects</h2>
                <div className="space-y-2">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/coding/large/project/${p.id}`)}
                      className="flex w-full items-center gap-3 rounded-lg bg-adv-dark px-4 py-3 text-left transition-colors hover:bg-adv-dark-2"
                    >
                      <Compass className="h-5 w-5 text-adv-gold" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-adv-off-white">{p.name}</span>
                        <p className="truncate text-xs text-adv-gray">{p.description || 'No description'}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === 'completed'
                            ? 'bg-adv-green/10 text-adv-green'
                            : p.status === 'paused'
                              ? 'bg-adv-gray/10 text-adv-gray'
                              : 'bg-adv-gold/10 text-adv-gold'
                        }`}
                      >
                        {p.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* VIEW: CREATE                                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      {view === 'create' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-adv-white">
              {hasExistingCodebase ? 'Onboard Existing Codebase' : 'Create New Project'}
            </h2>

            {/* Project Name */}
            <div>
              <label className="block text-xs font-medium text-adv-gray">
                Project Name <span className="text-adv-red">*</span>
              </label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold/30"
                placeholder="My Project"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-adv-gray">Description</label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                className="mt-1 h-20 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold/30 resize-none"
                placeholder="What are you building?"
              />
            </div>

            {/* Goals */}
            <div>
              <label className="block text-xs font-medium text-adv-gray">
                Goals <span className="text-adv-gray">(optional)</span>
              </label>
              <textarea
                value={projectGoals}
                onChange={(e) => setProjectGoals(e.target.value)}
                className="mt-1 h-20 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold/30 resize-none"
                placeholder="What are the primary objectives? What does success look like?"
              />
            </div>

            {/* Key Stakeholders */}
            <div>
              <label className="block text-xs font-medium text-adv-gray">
                Key Stakeholders <span className="text-adv-gray">(optional)</span>
              </label>
              <textarea
                value={projectStakeholders}
                onChange={(e) => setProjectStakeholders(e.target.value)}
                className="mt-1 h-16 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold/30 resize-none"
                placeholder="Who will use, own, or be affected by this project?"
              />
            </div>

            {/* Known Constraints */}
            <div>
              <label className="block text-xs font-medium text-adv-gray">
                Known Constraints <span className="text-adv-gray">(optional)</span>
              </label>
              <textarea
                value={projectConstraints}
                onChange={(e) => setProjectConstraints(e.target.value)}
                className="mt-1 h-16 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold/30 resize-none"
                placeholder="Budget limits, technology requirements, regulatory constraints, timeline..."
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setView('landing');
                setApiError(null);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-adv-dark px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
            <button
              onClick={handleCreateProject}
              disabled={!projectName.trim()}
              className="rounded-lg bg-adv-gold px-6 py-2.5 text-sm font-semibold text-adv-dark hover:bg-adv-gold/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create & Start {hasExistingCodebase ? 'Onboarding' : 'Discovery'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* VIEW: ONBOARDING (Phase 0)                            */}
      {/* ═══════════════════════════════════════════════════════ */}
      {view === 'onboarding' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Panel: Code Input */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-adv-card p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-adv-white">Provide Your Code</h3>
                <p className="mt-1 text-xs text-adv-gray">
                  Paste code directly or provide a folder path for analysis.
                </p>
              </div>

              {/* Input mode toggle */}
              <div className="flex gap-1 rounded-lg bg-adv-dark p-1">
                <button
                  onClick={() => setCodeInputMode('paste')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    codeInputMode === 'paste'
                      ? 'bg-adv-gold/10 text-adv-gold border border-adv-gold/30'
                      : 'text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  <FileCode className="h-3 w-3" />
                  Paste Code
                </button>
                <button
                  onClick={() => setCodeInputMode('path')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    codeInputMode === 'path'
                      ? 'bg-adv-gold/10 text-adv-gold border border-adv-gold/30'
                      : 'text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  <FolderInput className="h-3 w-3" />
                  Folder Path
                </button>
              </div>

              {/* Input area */}
              {codeInputMode === 'paste' ? (
                <textarea
                  ref={codeInputRef}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  disabled={baselineLoading || baselineComplete}
                  className="h-80 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 font-mono text-xs text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold/30 resize-none disabled:opacity-60"
                  placeholder="Paste your code here...&#10;&#10;Include key files, configuration, and any relevant documentation."
                />
              ) : (
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  disabled={baselineLoading || baselineComplete}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold/30 disabled:opacity-60"
                  placeholder="C:\Users\you\Projects\my-app or /home/you/projects/my-app"
                />
              )}

              {/* Run Baseline button */}
              {!baselineComplete && (
                <button
                  onClick={startBaseline}
                  disabled={!codeInput.trim() || isStreaming || baselineLoading}
                  className="w-full rounded-lg bg-adv-gold px-4 py-2.5 text-sm font-semibold text-adv-dark hover:bg-adv-gold/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {baselineLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Run Baseline Assessment
                    </>
                  )}
                </button>
              )}

              {/* Save & Continue button */}
              {baselineComplete && !isStreaming && (
                <button
                  onClick={handleSaveBaselineAndContinue}
                  disabled={baselineSaving}
                  className="w-full rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {baselineSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Baseline & Continue to Discovery
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Status */}
            <StatusIndicator
              inputTokens={lastInputTokens}
              outputTokens={lastOutputTokens}
              model={model}
              isStreaming={isStreaming}
            />
          </div>

          {/* Right Panel: Conversation */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-adv-white">
                <FileText className="h-4 w-4 text-adv-gold" />
                Baseline Assessment
              </h3>

              {messages.length === 0 && !isStreaming ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileCode className="h-12 w-12 text-adv-gray/50" />
                  <p className="mt-4 text-sm text-adv-gray">
                    Paste your code or provide a folder path, then click
                    <span className="font-semibold text-adv-gold"> Run Baseline Assessment</span> to begin.
                  </p>
                  <p className="mt-1 text-xs text-adv-gray">
                    Claude will analyze your codebase for architecture, quality, and improvement opportunities.
                  </p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                  <ConversationThread
                    messages={messages}
                    streamingText={streamingText}
                    streamingThinking={streamingThinking}
                    isStreaming={isStreaming}
                    moduleId="coding-large"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* VIEW: DISCOVERY (Phase 1)                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      {view === 'discovery' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Sidebar */}
          <div className="lg:col-span-3 space-y-4">
            {/* Phase Progress */}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">
                Discovery Progress
              </h3>
              <div className="space-y-2">
                {DISCOVERY_PHASES.map((phase) => {
                  const Icon = phase.icon;
                  const isActive = activeDiscoveryPhases.has(phase.id);
                  return (
                    <div
                      key={phase.id}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                        isActive
                          ? 'bg-adv-gold/5 border border-adv-gold/20'
                          : 'bg-adv-dark/50'
                      }`}
                    >
                      {isActive ? (
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-adv-gold" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 flex-shrink-0 text-adv-gray" />
                      )}
                      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-adv-gold' : 'text-adv-gray'}`} />
                      <div className="min-w-0">
                        <span className={`block font-medium ${isActive ? 'text-adv-off-white' : 'text-adv-gray'}`}>
                          {phase.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-adv-gray">
                Phases are detected from the conversation automatically.
              </p>
            </div>

            {/* Project Info */}
            {projectData && (
              <div className="rounded-xl border border-border bg-adv-card p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
                  Project
                </h3>
                <p className="text-sm font-medium text-adv-off-white">{projectData.name}</p>
                {projectData.description && (
                  <p className="mt-1 text-xs text-adv-gray">{projectData.description}</p>
                )}
                {projectData.goals && (
                  <div className="mt-2 border-t border-border pt-2">
                    <p className="text-xs font-medium uppercase text-adv-gray">Goals</p>
                    <p className="mt-0.5 text-xs text-adv-gray">{projectData.goals}</p>
                  </div>
                )}
              </div>
            )}

            {/* Thinking Controls */}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <ThinkingControls value={thinking} onChange={handleThinkingChange} />
            </div>

            {/* Status Indicator */}
            <StatusIndicator
              inputTokens={lastInputTokens}
              outputTokens={lastOutputTokens}
              model={model}
              isStreaming={isStreaming}
            />
          </div>

          {/* Center: Conversation */}
          <div className="lg:col-span-9 flex flex-col">
            <div className="flex-1 rounded-xl border border-border bg-adv-card p-5">
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
                  <Compass className="h-4 w-4 text-adv-gold" />
                  {finalizationStarted ? 'Discovery Document' : 'Discovery Conversation'}
                </h3>
                {discoveryStarted && !finalizationStarted && (
                  <span className="flex items-center gap-1.5 rounded-full bg-adv-gold/10 px-2.5 py-1 text-xs font-medium text-adv-gold">
                    <div className="h-1.5 w-1.5 rounded-full bg-adv-gold animate-pulse" />
                    Active
                  </span>
                )}
                {finalizationComplete && (
                  <span className="flex items-center gap-1.5 rounded-full bg-adv-green/10 px-2.5 py-1 text-xs font-medium text-adv-green">
                    <CheckCircle2 className="h-3 w-3" />
                    Complete
                  </span>
                )}
              </div>

              {/* Loading state */}
              {discoveryLoading && !discoveryStarted && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-adv-gold" />
                  <p className="mt-4 text-sm text-adv-gray">Preparing discovery session...</p>
                </div>
              )}

              {/* Conversation */}
              {(discoveryStarted || messages.length > 0 || isStreaming) && (
                <div className="max-h-[calc(100vh-420px)] overflow-y-auto pr-1">
                  <ConversationThread
                    messages={messages}
                    streamingText={streamingText}
                    streamingThinking={streamingThinking}
                    isStreaming={isStreaming}
                    moduleId="coding-large"
                  />
                </div>
              )}

              {/* Empty state when discovery not yet started and not loading */}
              {!discoveryStarted && !discoveryLoading && messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Compass className="h-12 w-12 text-adv-gray/50" />
                  <p className="mt-4 text-sm text-adv-gray">
                    Discovery will begin shortly...
                  </p>
                </div>
              )}
            </div>

            {/* Follow-up input area */}
            {discoveryStarted && !finalizationComplete && (
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <textarea
                    ref={followUpRef}
                    value={followUpInput}
                    onChange={(e) => setFollowUpInput(e.target.value)}
                    onKeyDown={handleFollowUpKeyDown}
                    disabled={isStreaming}
                    rows={3}
                    className="flex-1 rounded-lg border border-border bg-adv-card px-3 py-2.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-gold/30 resize-none disabled:opacity-60"
                    placeholder="Respond to Claude's questions or add more context... (Ctrl+Enter to send)"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleSendFollowUp}
                      disabled={!followUpInput.trim() || isStreaming}
                      className="flex h-10 items-center gap-1.5 rounded-lg bg-adv-gold px-4 text-sm font-semibold text-adv-dark hover:bg-adv-gold/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Send message (Ctrl+Enter)"
                    >
                      {isStreaming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send
                    </button>
                    {isStreaming && (
                      <button
                        onClick={stopStreaming}
                        className="flex h-8 items-center justify-center rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 text-xs text-adv-red hover:bg-adv-red/10 transition-colors"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                {!isStreaming && !finalizationStarted && messages.length >= 4 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleFinalizeDiscovery}
                      className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark transition-colors"
                    >
                      <FileText className="h-4 w-4" />
                      Finalize Discovery
                    </button>
                    <p className="text-xs text-adv-gray">
                      When ready, finalize to generate the formal discovery document.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Export and proceed area after finalization */}
            {finalizationComplete && !isStreaming && (
              <div className="mt-4 space-y-3">
                <ExportBar
                  content={lastAssistantContent}
                  availableFormats={['md', 'docx', 'pdf']}
                  onExport={handleExport}
                  isExporting={isExporting}
                />

                <div className="flex items-center gap-3 rounded-xl border border-adv-teal/30 bg-adv-teal/5 p-4">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-adv-teal" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-adv-off-white">
                      Discovery phase complete
                    </p>
                    <p className="text-xs text-adv-gray">
                      The discovery document has been generated. Proceed to architecture design.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/coding/large/project/${projectId}/architecture`)}
                    className="flex items-center gap-2 rounded-lg bg-adv-gold px-5 py-2.5 text-sm font-semibold text-adv-dark hover:bg-adv-gold/80 transition-colors"
                  >
                    Proceed to Architecture
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
