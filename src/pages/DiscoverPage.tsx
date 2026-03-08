import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Send, Sprout, TreePine, Trees, Mountain,
  ChevronRight, Pause, Play, Download, FileText, ArrowRight,
  Loader2, CheckCircle2, Circle, Lightbulb, Target, Zap, TrendingUp,
  RefreshCw, Trash2, Clock, X, Calendar, Shield,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchWithAuth } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────

type DiscoveryTier = 'lite' | 'standard' | 'professional' | 'expert';
type DiscoveryPhase = 'context' | 'work_mapping' | 'pain_finding' | 'readiness' | 'opportunity_mapping' | 'action_planning';

interface DiscoveryState {
  tier: DiscoveryTier;
  phase: DiscoveryPhase;
  userProfile: {
    role: string;
    industry: string;
    organizationSize: string;
    aiExperience: string;
  };
  workActivities: Array<{ id: string; description: string; painLevel: number }>;
  painPoints: Array<{ id: string; description: string; theme: string; impact: string }>;
  workflows: Array<{ id: string; name: string; totalTime: number; automationPotential: string }>;
  readinessScores: {
    technology: number;
    peopleCulture: number;
    governance: number;
    leadership: number;
    total: number;
    level: string;
    criticalGaps: string[];
  };
  opportunities: unknown[];
  nonAiFindings: unknown[];
  integrationAssessment: Array<{ systemName: string; systemType: string; integrationLevel: string; aiReadiness: string }>;
  governanceItems: Array<{ area: string; recommendation: string; priority: string }>;
  businessCase: Array<{ category: string; estimatedAnnualBenefit: number; estimatedCost: number; roi: number; timeToValue: string }>;
  executiveBriefing: string;
  activePack: string | null;
  packData: Record<string, unknown>;
  followUpScheduled: boolean;
  phaseSummaries: Array<{ phase: string; summary: string; keyFindings: string[] }>;
  contextStrategy: string;
  inferredNeeds: string[];
  suggestedModules: Array<{ moduleId: string; moduleName: string; areaName: string; confidenceScore: number; matchReason: string }>;
  completedPhases: string[];
  currentPhaseProgress: number;
  canGenerateOutput: boolean;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  confidenceLevel: number;
}

interface SessionSummary {
  id: string;
  tier: string;
  status: string;
  started_at: string;
  last_active_at: string;
  phase: string;
  progress: number;
}

interface Insights {
  topPainTheme: string | null;
  earlyModuleMatches: Array<{ name: string; area: string; confidence: number }>;
  estimatedOpportunity: string | null;
  quickWinSpotted: string | null;
  phaseInsight: string | null;
}

interface DiscoveryOutput {
  id: string;
  contentMd: string;
  moduleMatches: Array<{ moduleName: string; areaName: string; matchReason: string; estimatedTimeSavings: string; effortToStart: string; bestFor: string }>;
  actionPlan: Array<{ action: string; owner: string; timeline: string; priority: string }>;
  metrics: Record<string, unknown>;
  nonAiFindings: Array<{ description: string; realSolution: string; priority: string }>;
  executiveBriefing?: string;
  governanceRecommendations?: Array<{ area: string; recommendation: string; priority: string }>;
}

interface DiscoveryPack {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  activationKeywords: string[];
  status: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const PHASE_LABELS: Record<DiscoveryPhase, string> = {
  context: 'Understanding You',
  work_mapping: 'Mapping Your Work',
  pain_finding: 'Finding Pain Points',
  readiness: 'Readiness Check',
  opportunity_mapping: 'Mapping Opportunities',
  action_planning: 'Building Your Plan',
};

const TIER_PHASES: Record<DiscoveryTier, DiscoveryPhase[]> = {
  lite: ['context', 'work_mapping', 'pain_finding', 'readiness', 'action_planning'],
  standard: ['context', 'work_mapping', 'pain_finding', 'readiness', 'opportunity_mapping', 'action_planning'],
  professional: ['context', 'work_mapping', 'pain_finding', 'readiness', 'opportunity_mapping', 'action_planning'],
  expert: ['context', 'work_mapping', 'pain_finding', 'readiness', 'opportunity_mapping', 'action_planning'],
};

const TIER_INFO = [
  {
    id: 'lite' as DiscoveryTier,
    icon: Sprout,
    label: 'Lite',
    time: '15-30 min',
    audience: 'Personal',
    output: 'AI Starter Map',
    description: 'Quick personal exploration of where AI can help in your work',
    color: 'bg-adv-green/10 border-adv-green/30 hover:border-adv-green',
    iconColor: 'text-adv-green',
  },
  {
    id: 'standard' as DiscoveryTier,
    icon: TreePine,
    label: 'Standard',
    time: '1-2 hours',
    audience: 'Team',
    output: 'Opportunity Report',
    description: 'Team-level discovery with workflow mapping and pain quantification',
    color: 'bg-adv-teal/10 border-adv-teal/30 hover:border-adv-teal',
    iconColor: 'text-adv-teal',
  },
  {
    id: 'professional' as DiscoveryTier,
    icon: Trees,
    label: 'Professional',
    time: '3-4 hours',
    audience: 'Organization',
    output: 'Adoption Roadmap',
    description: 'Full organizational assessment with business case and phased roadmap',
    color: 'bg-adv-blue/10 border-adv-blue/30 hover:border-adv-blue',
    iconColor: 'text-adv-blue',
  },
  {
    id: 'expert' as DiscoveryTier,
    icon: Mountain,
    label: 'Expert',
    time: 'Full day',
    audience: 'Function',
    output: 'Transformation Plan',
    description: 'Domain-specific deep dive with consulting-grade deliverables',
    color: 'bg-adv-gold/10 border-adv-gold/30 hover:border-adv-gold',
    iconColor: 'text-adv-gold',
  },
];

// ── Main Component ───────────────────────────────────────────────────────

export default function DiscoverPage() {
  // View state
  const [view, setView] = useState<'landing' | 'conversation' | 'output'>('landing');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<DiscoveryState | null>(null);
  const [previousSessions, setPreviousSessions] = useState<SessionSummary[]>([]);

  // Conversation
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Insights
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Output
  const [output, setOutput] = useState<DiscoveryOutput | null>(null);

  // Error
  const [error, setError] = useState<string | null>(null);

  // Phase 3-5 state
  const [availablePacks, setAvailablePacks] = useState<DiscoveryPack[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);

  // Load previous sessions on mount
  useEffect(() => {
    fetch('/api/discovery/sessions', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(sessions => setPreviousSessions(sessions))
      .catch(() => {});

    // Load available packs
    fetch('/api/discovery/packs', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(packs => setAvailablePacks(packs))
      .catch(() => {});
  }, []);

  // Auto-scroll conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.conversationHistory]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [userInput]);

  // Fetch insights after each conversation turn (debounced)
  const fetchInsights = useCallback(async (sid: string) => {
    if (!sid) return;
    setInsightLoading(true);
    try {
      const res = await fetch(`/api/discovery/sessions/${sid}/insights`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
      }
    } catch {
      // Insight failures are non-critical
    } finally {
      setInsightLoading(false);
    }
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────

  async function startNewSession(tier: DiscoveryTier) {
    setError(null);
    try {
      // Create session
      const createRes = await fetchWithAuth('/api/discovery/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (!createRes.ok) throw new Error('Failed to create session');
      const { id } = await createRes.json();
      setSessionId(id);

      // Get opening message
      setIsProcessing(true);
      const startRes = await fetch(`/api/discovery/sessions/${id}/start`, { headers: getAuthHeader() });
      if (!startRes.ok) throw new Error('Failed to start conversation');
      const { response, state: newState } = await startRes.json();
      setState(newState);
      setView('conversation');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setIsProcessing(false);
    }
  }

  async function resumeSession(sid: string) {
    setError(null);
    try {
      const res = await fetch(`/api/discovery/sessions/${sid}`, { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Session not found');
      const session = await res.json();
      setSessionId(sid);
      setState(session.state);

      if (session.status === 'completed' && session.output_id) {
        // Load output
        const outRes = await fetch(`/api/discovery/sessions/${sid}/output`, { headers: getAuthHeader() });
        if (outRes.ok) {
          setOutput(await outRes.json());
          setView('output');
        } else {
          setView('conversation');
        }
      } else {
        setView('conversation');
        fetchInsights(sid);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resume session');
    }
  }

  async function deleteSession(sid: string) {
    try {
      await fetchWithAuth(`/api/discovery/sessions/${sid}`, { method: 'DELETE' });
      setPreviousSessions(prev => prev.filter(s => s.id !== sid));
    } catch {
      // ignore
    }
  }

  async function upgradeTier(newTier: DiscoveryTier) {
    if (!sessionId) return;
    try {
      const res = await fetchWithAuth(`/api/discovery/sessions/${sessionId}/upgrade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newTier }),
      });
      if (!res.ok) throw new Error('Upgrade failed');
      // Refresh session state
      const sessionRes = await fetch(`/api/discovery/sessions/${sessionId}`, { headers: getAuthHeader() });
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        setState(session.state);
      }
      setShowUpgradeModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade tier');
    }
  }

  async function scheduleFollowUp(type: string) {
    if (!sessionId) return;
    try {
      const scheduledDate = new Date();
      if (type === '30_day') scheduledDate.setDate(scheduledDate.getDate() + 30);
      else if (type === '60_day') scheduledDate.setDate(scheduledDate.getDate() + 60);
      else scheduledDate.setDate(scheduledDate.getDate() + 90);

      await fetchWithAuth(`/api/discovery/sessions/${sessionId}/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, scheduledDate: scheduledDate.toISOString().split('T')[0] }),
      });
      setShowFollowUpModal(false);
    } catch {
      // ignore
    }
  }

  async function activatePack(packId: string) {
    if (!sessionId) return;
    try {
      await fetchWithAuth(`/api/discovery/sessions/${sessionId}/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      // Refresh state
      const res = await fetch(`/api/discovery/sessions/${sessionId}`, { headers: getAuthHeader() });
      if (res.ok) {
        const session = await res.json();
        setState(session.state);
      }
    } catch {
      // ignore
    }
  }

  async function sendMessage() {
    if (!userInput.trim() || isProcessing || !sessionId) return;
    setError(null);

    const message = userInput.trim();
    setUserInput('');
    setIsProcessing(true);

    // Optimistically add user message
    setState(prev => prev ? {
      ...prev,
      conversationHistory: [...prev.conversationHistory, { role: 'user' as const, content: message }],
    } : prev);

    try {
      const res = await fetchWithAuth(`/api/discovery/sessions/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to process response');
      }
      const { response, state: newState, phaseChanged } = await res.json();
      setState(newState);

      // Fetch insights in background
      fetchInsights(sessionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsProcessing(false);
    }
  }

  async function generateReport() {
    if (!sessionId || isGenerating) return;
    setError(null);
    setIsGenerating(true);

    try {
      const res = await fetchWithAuth(`/api/discovery/sessions/${sessionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to generate report');
      const data = await res.json();
      setOutput(data);
      setView('output');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function downloadMarkdown() {
    if (!output?.contentMd) return;
    const blob = new Blob([output.contentMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discovery-report.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportReport(format: 'docx' | 'pdf') {
    if (!sessionId) return;
    try {
      const res = await fetchWithAuth(`/api/discovery/sessions/${sessionId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `discovery-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Export to ${format} failed. Try downloading as .md instead.`);
    }
  }

  // ── Render: Landing Page ─────────────────────────────────────────────

  if (view === 'landing') {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-adv-teal/10">
            <Search className="h-7 w-7 text-adv-teal" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-adv-white">Let's Discover Together</h1>
          <p className="mx-auto max-w-xl text-sm text-adv-gray">
            ANTON can help you find where AI creates the most value in your work. It starts with understanding what you do and where it hurts.
          </p>
        </div>

        {/* Tier Selection */}
        <div className="mb-8">
          <h2 className="mb-4 text-center text-sm font-medium text-adv-off-white">How deep would you like to go?</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIER_INFO.map(tier => {
              const Icon = tier.icon;
              return (
                <button
                  key={tier.id}
                  onClick={() => startNewSession(tier.id)}
                  disabled={isProcessing}
                  className={`group rounded-xl border p-5 text-left transition-all ${tier.color} ${isProcessing ? 'opacity-50' : ''}`}
                >
                  <Icon className={`mb-3 h-8 w-8 ${tier.iconColor}`} />
                  <div className="mb-1 text-base font-semibold text-adv-white">{tier.label}</div>
                  <div className="mb-2 text-xs text-adv-gray">{tier.time} · {tier.audience}</div>
                  <div className="mb-3 text-xs text-adv-off-white leading-relaxed">{tier.description}</div>
                  <div className="flex items-center gap-1 text-xs font-medium text-adv-teal">
                    <FileText className="h-3.5 w-3.5" />
                    {tier.output}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-adv-gray">
            Not sure? Start with Lite — you can always go deeper later.
          </p>
        </div>

        {/* Previous Sessions */}
        {previousSessions.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 text-sm font-medium text-adv-off-white">Previous Discovery Sessions</h2>
            <div className="space-y-2">
              {previousSessions.map(session => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-adv-card p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                      session.status === 'completed' ? 'bg-adv-green/10 text-adv-green' :
                      session.status === 'active' ? 'bg-adv-teal/10 text-adv-teal' :
                      'bg-adv-gray/10 text-adv-gray'
                    }`}>
                      {session.status}
                    </div>
                    <div>
                      <div className="text-sm text-adv-off-white capitalize">{session.tier} Discovery</div>
                      <div className="flex items-center gap-2 text-xs text-adv-gray">
                        <Clock className="h-3 w-3" />
                        {new Date(session.started_at).toLocaleDateString()}
                        <span className="text-adv-gray">·</span>
                        {PHASE_LABELS[session.phase as DiscoveryPhase] || session.phase}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => resumeSession(session.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors"
                    >
                      {session.status === 'completed' ? 'View' : 'Resume'}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => deleteSession(session.id)}
                      className="rounded-lg p-1.5 text-adv-gray hover:text-adv-red transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-adv-red/10 border border-adv-red/30 p-3 text-sm text-adv-red">
            {error}
          </div>
        )}

        {isProcessing && (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-adv-teal">
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting your discovery session...
          </div>
        )}
      </div>
    );
  }

  // ── Render: Conversation ─────────────────────────────────────────────

  if (view === 'conversation' && state) {
    const phases = TIER_PHASES[state.tier];
    const currentPhaseIdx = phases.indexOf(state.phase);
    const overallProgress = Math.round(
      ((state.completedPhases.length + state.currentPhaseProgress / 100) / phases.length) * 100
    );

    return (
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Left: Progress Panel */}
        <div className="hidden w-56 shrink-0 border-r border-border bg-adv-dark-2 p-4 lg:block">
          <div className="mb-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-adv-gray">Discovery Progress</div>
            <div className="mb-1 text-lg font-bold text-adv-teal">{overallProgress}%</div>
            <div className="h-1.5 rounded-full bg-adv-card">
              <div
                className="h-1.5 rounded-full bg-adv-teal transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          <div className="mb-4 text-xs text-adv-gray capitalize">{state.tier} Discovery</div>

          <div className="space-y-1">
            {phases.map((phase, idx) => {
              const isComplete = state.completedPhases.includes(phase);
              const isCurrent = phase === state.phase;
              return (
                <div
                  key={phase}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                    isCurrent ? 'bg-adv-teal/10 text-adv-teal' :
                    isComplete ? 'text-adv-green' : 'text-adv-gray'
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : isCurrent ? (
                    <div className="relative h-3.5 w-3.5 shrink-0">
                      <Circle className="h-3.5 w-3.5" />
                      <div className="absolute inset-0.5 rounded-full bg-adv-teal animate-pulse" />
                    </div>
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{PHASE_LABELS[phase]}</span>
                </div>
              );
            })}
          </div>

          {/* Quick Stats */}
          {(state.workActivities.length > 0 || state.painPoints.length > 0) && (
            <div className="mt-6 space-y-2 border-t border-border pt-4">
              <div className="text-xs font-medium text-adv-gray uppercase tracking-wider">Captured</div>
              {state.workActivities.length > 0 && (
                <div className="text-xs text-adv-off-white">
                  {state.workActivities.length} work activities
                </div>
              )}
              {state.workflows?.length > 0 && (
                <div className="text-xs text-adv-off-white">
                  {state.workflows.length} workflow(s) mapped
                </div>
              )}
              {state.painPoints.length > 0 && (
                <div className="text-xs text-adv-off-white">
                  {state.painPoints.length} pain points
                </div>
              )}
              {state.integrationAssessment?.length > 0 && (
                <div className="text-xs text-adv-off-white">
                  {state.integrationAssessment.length} systems assessed
                </div>
              )}
              {state.businessCase?.length > 0 && (
                <div className="text-xs text-adv-off-white">
                  {state.businessCase.length} business case items
                </div>
              )}
              {state.governanceItems?.length > 0 && (
                <div className="text-xs text-adv-off-white">
                  {state.governanceItems.length} governance items
                </div>
              )}
              {state.userProfile.role && (
                <div className="text-xs text-adv-gray">
                  {state.userProfile.role}
                </div>
              )}
              {state.userProfile.industry && (
                <div className="text-xs text-adv-gray">
                  {state.userProfile.industry}
                </div>
              )}
            </div>
          )}

          {/* Session Controls */}
          <div className="mt-6 space-y-2 border-t border-border pt-4">
            <button
              onClick={() => { setView('landing'); setSessionId(null); setState(null); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              <ArrowRight className="h-3 w-3 rotate-180" />
              Back to Discover
            </button>
            {state.tier !== 'expert' && (
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
              >
                <TrendingUp className="h-3 w-3" />
                Upgrade Tier
              </button>
            )}
            {state.activePack && (
              <div className="mt-2 rounded-lg bg-adv-gold/10 px-2 py-1.5 text-xs text-adv-gold">
                Pack: {state.activePack}
              </div>
            )}
          </div>

          {state.contextStrategy === 'summarized' && (
            <div className="mt-4 rounded-lg bg-adv-blue/10 px-2 py-1.5 text-xs text-adv-blue">
              Using progressive summarization
            </div>
          )}
        </div>

        {/* Upgrade Modal */}
        {showUpgradeModal && state && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-adv-dark-2 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-adv-white">Upgrade Discovery Tier</h3>
                <button onClick={() => setShowUpgradeModal(false)} className="text-adv-gray hover:text-adv-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-4 text-xs text-adv-gray">
                Upgrade to go deeper. All your current progress will be preserved.
              </p>
              <div className="space-y-2">
                {TIER_INFO.filter(t => {
                  const order = ['lite', 'standard', 'professional', 'expert'];
                  return order.indexOf(t.id) > order.indexOf(state.tier);
                }).map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => upgradeTier(t.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${t.color}`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-5 w-5 ${t.iconColor}`} />
                        <div>
                          <div className="text-sm font-medium text-adv-white">{t.label}</div>
                          <div className="text-xs text-adv-gray">{t.time} · {t.output}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Center: Conversation */}
        <div className="flex flex-1 flex-col">
          {/* Top bar (mobile) */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2 lg:hidden">
            <div className="flex items-center gap-2">
              <button onClick={() => { setView('landing'); setSessionId(null); setState(null); }} className="text-adv-gray">
                <ArrowRight className="h-4 w-4 rotate-180" />
              </button>
              <span className="text-sm font-medium text-adv-off-white capitalize">{state.tier} Discovery</span>
            </div>
            <div className="text-xs text-adv-teal">{overallProgress}%</div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-2xl space-y-4">
              {state.conversationHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-adv-teal/10 text-adv-off-white'
                      : 'bg-adv-card text-adv-off-white'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm prose-invert max-w-none">
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {isProcessing && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-xl bg-adv-card px-4 py-3 text-sm text-adv-gray">
                    <Loader2 className="h-4 w-4 animate-spin text-adv-teal" />
                    ANTON is thinking...
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t border-border bg-adv-dark-2 p-4">
            <div className="mx-auto max-w-2xl">
              {/* Generate Report Button */}
              {state.canGenerateOutput && !isGenerating && (
                <div className="mb-3 flex items-center justify-center">
                  <button
                    onClick={generateReport}
                    className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    Generate Discovery Report
                  </button>
                </div>
              )}

              {isGenerating && (
                <div className="mb-3 flex items-center justify-center gap-2 text-sm text-adv-teal">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating your discovery report...
                </div>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer..."
                  disabled={isProcessing || isGenerating}
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-border bg-adv-card px-4 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={!userInput.trim() || isProcessing || isGenerating}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-adv-teal text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50 disabled:hover:bg-adv-teal"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-adv-gray">
                <span>Phase: {PHASE_LABELS[state.phase]}</span>
                <span>Press Enter to send · Shift+Enter for new line</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Insight Panel */}
        <div className="hidden w-64 shrink-0 border-l border-border bg-adv-dark-2 p-4 xl:block">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-adv-gray">Emerging Insights</span>
            {insightLoading && <Loader2 className="h-3 w-3 animate-spin text-adv-teal" />}
          </div>

          {insights ? (
            <div className="space-y-4">
              {insights.topPainTheme && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-adv-off-white">
                    <Target className="h-3.5 w-3.5 text-adv-red" />
                    Top Pain Theme
                  </div>
                  <p className="text-xs text-adv-gray leading-relaxed">{insights.topPainTheme}</p>
                </div>
              )}

              {insights.earlyModuleMatches.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-adv-off-white">
                    <Lightbulb className="h-3.5 w-3.5 text-adv-gold" />
                    Early Module Matches
                  </div>
                  <div className="space-y-1">
                    {insights.earlyModuleMatches.map((m, i) => (
                      <div key={i} className="flex items-center justify-between rounded bg-adv-card px-2 py-1">
                        <span className="text-xs text-adv-off-white truncate">{m.name}</span>
                        <span className="text-xs text-adv-gray">{Math.round(m.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insights.estimatedOpportunity && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-adv-off-white">
                    <TrendingUp className="h-3.5 w-3.5 text-adv-green" />
                    Estimated Opportunity
                  </div>
                  <p className="text-xs text-adv-teal font-medium">{insights.estimatedOpportunity}</p>
                </div>
              )}

              {insights.quickWinSpotted && (
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-adv-off-white">
                    <Zap className="h-3.5 w-3.5 text-adv-teal" />
                    Quick Win Spotted
                  </div>
                  <p className="text-xs text-adv-gray leading-relaxed">{insights.quickWinSpotted}</p>
                </div>
              )}

              {insights.phaseInsight && (
                <div className="rounded-lg bg-adv-teal-soft p-2">
                  <p className="text-xs text-adv-teal leading-relaxed">{insights.phaseInsight}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-adv-gray">
              Insights will appear as the conversation progresses...
            </div>
          )}

          {/* Discovery Pack (Expert tier) */}
          {state?.tier === 'expert' && availablePacks.length > 0 && !state.activePack && (
            <div className="mt-6 border-t border-border pt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">Discovery Packs</div>
              <p className="mb-2 text-xs text-adv-gray">Activate a domain pack for specialized questions</p>
              <div className="space-y-1.5">
                {availablePacks.map(pack => (
                  <button
                    key={pack.id}
                    onClick={() => activatePack(pack.id)}
                    className="w-full rounded-lg border border-border bg-adv-card p-2 text-left hover:border-adv-gold transition-colors"
                  >
                    <div className="text-xs font-medium text-adv-off-white">{pack.name}</div>
                    <div className="text-xs text-adv-gray">{pack.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {state?.activePack && (
            <div className="mt-6 border-t border-border pt-4">
              <div className="mb-1 text-xs font-medium text-adv-gold">Active Pack</div>
              <div className="text-xs text-adv-off-white capitalize">{state.activePack}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Output View ──────────────────────────────────────────────

  if (view === 'output' && output) {
    return (
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Report Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 flex items-center justify-between">
              <button
                onClick={() => { setView('landing'); setSessionId(null); setState(null); setOutput(null); }}
                className="flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-teal transition-colors"
              >
                <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                Back to Discover
              </button>
              <button
                onClick={downloadMarkdown}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download .md
              </button>
            </div>

            <div className="prose prose-sm prose-invert max-w-none rounded-xl border border-border bg-adv-card p-8">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {output.contentMd}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Action Sidebar */}
        <div className="hidden w-72 shrink-0 border-l border-border bg-adv-dark-2 p-4 lg:block overflow-y-auto">
          <h3 className="mb-4 text-sm font-semibold text-adv-white">Take Action</h3>

          {/* Module Recommendations */}
          {output.moduleMatches.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">Recommended Modules</div>
              <div className="space-y-2">
                {output.moduleMatches.map((m, i) => (
                  <div key={i} className="rounded-lg border border-border bg-adv-card p-3">
                    <div className="mb-1 text-sm font-medium text-adv-teal">{m.moduleName}</div>
                    <div className="mb-1 text-xs text-adv-gray">{m.areaName}</div>
                    <p className="text-xs text-adv-off-white leading-relaxed">{m.matchReason}</p>
                    {m.estimatedTimeSavings && (
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-adv-green">
                        <Clock className="h-3 w-3" />
                        {m.estimatedTimeSavings}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Plan */}
          {output.actionPlan.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">Action Plan</div>
              <div className="space-y-1.5">
                {output.actionPlan.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-adv-card px-3 py-2">
                    <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      a.priority === 'high' ? 'bg-adv-red' : a.priority === 'medium' ? 'bg-adv-gold' : 'bg-adv-green'
                    }`} />
                    <div>
                      <div className="text-xs text-adv-off-white">{a.action}</div>
                      {a.timeline && <div className="text-xs text-adv-gray">{a.timeline}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Non-AI Findings */}
          {output.nonAiFindings.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">Non-AI Findings</div>
              <div className="space-y-2">
                {output.nonAiFindings.map((f, i) => (
                  <div key={i} className="rounded-lg border border-adv-gold/20 bg-adv-gold/5 p-3">
                    <div className="text-xs text-adv-off-white">{f.description}</div>
                    <div className="mt-1 text-xs text-adv-gold">{f.realSolution}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Executive Briefing */}
          {output.executiveBriefing && (
            <div className="mb-6">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">Executive Briefing</div>
              <div className="rounded-lg border border-adv-teal/20 bg-adv-teal-soft p-3">
                <p className="text-xs text-adv-off-white leading-relaxed">{output.executiveBriefing}</p>
              </div>
            </div>
          )}

          {/* Governance Recommendations */}
          {output.governanceRecommendations && output.governanceRecommendations.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">Governance</div>
              <div className="space-y-1.5">
                {output.governanceRecommendations.map((g, i) => (
                  <div key={i} className="rounded-lg bg-adv-card px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 shrink-0 rounded-full ${
                        g.priority === 'high' ? 'bg-adv-red' : g.priority === 'medium' ? 'bg-adv-gold' : 'bg-adv-green'
                      }`} />
                      <div className="text-xs font-medium text-adv-off-white">{g.area}</div>
                    </div>
                    <p className="mt-1 text-xs text-adv-gray">{g.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Follow-Up Scheduling */}
          <div className="mb-4 border-t border-border pt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">Follow-Up</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => scheduleFollowUp('30_day')}
                className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal transition-colors"
              >
                30 days
              </button>
              <button
                onClick={() => scheduleFollowUp('60_day')}
                className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal transition-colors"
              >
                60 days
              </button>
              <button
                onClick={() => scheduleFollowUp('90_day')}
                className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal transition-colors"
              >
                90 days
              </button>
            </div>
          </div>

          {/* Export */}
          <div className="border-t border-border pt-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-adv-gray">Export Report</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadMarkdown}
                className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal transition-colors"
              >
                .md
              </button>
              <button
                onClick={() => exportReport('docx')}
                className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal transition-colors"
              >
                .docx
              </button>
              <button
                onClick={() => exportReport('pdf')}
                className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal transition-colors"
              >
                .pdf
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
    </div>
  );
}
