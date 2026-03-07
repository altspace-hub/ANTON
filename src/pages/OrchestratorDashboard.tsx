/**
 * OrchestratorDashboard.tsx
 *
 * ANTON Orchestrator — Main Dashboard (Phase 1: Observer)
 *
 * Shows:
 * - Current stage + progression bar
 * - Latest briefing with proposal cards + rating buttons
 * - Briefing history list
 * - Heartbeat status + kill switch
 * - Config panel
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Activity, FileText, Zap, CheckCircle, XCircle,
  Clock, AlertTriangle, TrendingDown, ChevronRight,
  Play, Pause, RotateCcw, Settings, RefreshCw, ChevronDown,
  ShieldAlert, Radar, Calendar, BarChart2, Layers,
  ThumbsUp, ThumbsDown, ListTree,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAuthHeader } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrchestratorStage {
  current_stage: number;
  stage_entered_at: string;
  total_briefings: number;
  total_proposals: number;
  proposals_rated: number;
  proposals_good_or_relevant: number;
  proposals_irrelevant_or_wrong: number;
}

interface OrchestratorConfig {
  heartbeat_enabled: number;
  heartbeat_interval_minutes: number;
  briefing_schedule: string;
  radar_urgency_threshold: number;
  quality_decline_threshold: number;
  deadline_alert_days: number;
  orchestrator_paused: number;
  fully_disabled: number;
  paused_at: string | null;
}

interface Heartbeat {
  ran_at: string;
  signals_checked: number;
  signals_significant: number;
  action_taken: string;
  duration_ms: number | null;
  status: string;
}

interface BriefingSummary {
  id: string;
  period: string;
  signals_read: number;
  proposals_count: number;
  status: string;
  created_at: string;
}

interface Proposal {
  id: string;
  signal_source: string;
  signal_summary: string;
  action_type: string;
  proposed_action: string;
  confidence_score: number;
  urgency_score: number;
  rationale: string;
  estimated_effort: string | null;
  human_rating: string | null;
  human_feedback: string | null;
  status: string;
}

interface BriefingDetail {
  id: string;
  period: string;
  content: string;
  signals_read: number;
  proposals_count: number;
  status: string;
  created_at: string;
}

interface Execution {
  id: string;
  proposal_id: string;
  workflow_run_id: string | null;
  initiated_by: string;
  initiated_at: string;
  outcome: string | null;
  completed_at: string | null;
  human_satisfaction: string | null;
  human_notes: string | null;
  proposed_action: string | null;
  action_type: string | null;
  signal_source: string | null;
}

interface ReasoningTrail {
  id: string;
  trigger_type: string;
  status: string;
  total_entries: number;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
  briefing_id: string | null;
  proposal_id: string | null;
}

interface ReasoningEntry {
  id: string;
  entry_type: string;
  sequence_number: number;
  title: string;
  content: string;
  confidence: number | null;
  duration_ms: number | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGE_NAMES = ['', 'Observer', 'Proposal Manager', 'Supervised Orchestrator', 'Autonomous Orchestrator'];
const STAGE_DESCRIPTIONS = [
  '',
  'Watching platform signals and generating situational briefings. No execution capability.',
  'Generating complete workflow execution plans. Requires human approval for every action.',
  'Auto-executing validated recurring patterns. Novel workflows still require approval.',
  'Full autonomous management with intelligent workflow chaining and proactive recommendations.',
];

const SIGNAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  radar: Radar,
  deadline: Calendar,
  quality: BarChart2,
  pattern: Layers,
  workflow: Activity,
  assignment: Clock,
  compliance: ShieldAlert,
  apprentice: Brain,
  proactive: Zap,
};

const SIGNAL_COLOURS: Record<string, string> = {
  radar: 'text-adv-blue',
  deadline: 'text-adv-gold',
  quality: 'text-purple-400',
  pattern: 'text-adv-teal',
  workflow: 'text-adv-gray',
  assignment: 'text-orange-400',
  compliance: 'text-adv-red',
  apprentice: 'text-emerald-400',
  proactive: 'text-adv-teal',
};

const RATING_OPTIONS = [
  { value: 'good_catch', label: 'Good Catch', className: 'bg-adv-green/20 text-green-400 border-green-400/30 hover:bg-adv-green/30' },
  { value: 'relevant', label: 'Relevant', className: 'bg-adv-teal-dim text-adv-teal border-adv-teal/30 hover:bg-adv-teal-dim/70' },
  { value: 'low_priority', label: 'Low Priority', className: 'bg-adv-card text-adv-gray border-adv-gray/20 hover:bg-white/5' },
  { value: 'irrelevant', label: 'Irrelevant', className: 'bg-adv-red/10 text-red-400 border-red-400/20 hover:bg-adv-red/20' },
  { value: 'wrong', label: 'Wrong', className: 'bg-adv-red/20 text-red-300 border-red-300/20 hover:bg-adv-red/30' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function urgencyBadge(score: number): string {
  if (score >= 0.85) return 'bg-adv-red/20 text-red-400 border-red-400/30';
  if (score >= 0.65) return 'bg-adv-gold/20 text-adv-gold border-adv-gold/30';
  return 'bg-adv-teal-dim text-adv-teal border-adv-teal/30';
}

function urgencyLabel(score: number): string {
  if (score >= 0.85) return 'HIGH';
  if (score >= 0.65) return 'MEDIUM';
  return 'LOW';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function stage1ProgressPercent(stage: OrchestratorStage): number {
  if (stage.current_stage > 1) return 100;
  const checks = [
    Math.min(stage.total_briefings / 20, 1),
    Math.min(stage.total_proposals / 50, 1),
    Math.min(stage.proposals_rated / 10, 1),
    stage.proposals_rated > 0
      ? Math.min(stage.proposals_good_or_relevant / stage.proposals_rated / 0.6, 1)
      : 0,
  ];
  return Math.round((checks.reduce((a, b) => a + b, 0) / checks.length) * 100);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OrchestratorDashboard() {
  const [stage, setStage] = useState<OrchestratorStage | null>(null);
  const [config, setConfig] = useState<OrchestratorConfig | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<Heartbeat | null>(null);
  const [briefings, setBriefings] = useState<BriefingSummary[]>([]);
  const [activeBriefing, setActiveBriefing] = useState<BriefingDetail | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [trails, setTrails] = useState<ReasoningTrail[]>([]);
  const [activeTrail, setActiveTrail] = useState<{ trail: ReasoningTrail; entries: ReasoningEntry[] } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTrails, setShowTrails] = useState(false);
  const [showExecutions, setShowExecutions] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/orchestrator/status', { headers: getAuthHeader() });
      if (!r.ok) return;
      const data = await r.json();
      setStage(data.stage);
      setConfig(data.config);
      setLastHeartbeat(data.lastHeartbeat);
      setUnreadCount(data.unreadBriefings ?? 0);
      setApiConfigured(data.apiConfigured ?? false);
    } catch { /* ignore */ }
  }, []);

  const fetchBriefings = useCallback(async () => {
    try {
      const r = await fetch('/api/orchestrator/briefings?limit=10', { headers: getAuthHeader() });
      if (!r.ok) return;
      const data = await r.json();
      setBriefings(data.briefings ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadBriefing = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/orchestrator/briefings/${id}`, { headers: getAuthHeader() });
      if (!r.ok) return;
      const data = await r.json();
      setActiveBriefing(data.briefing);
      setProposals(data.proposals ?? []);
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }, []);

  const fetchExecutions = useCallback(async () => {
    try {
      const r = await fetch('/api/orchestrator/executions?limit=10', { headers: getAuthHeader() });
      if (!r.ok) return;
      const data = await r.json();
      setExecutions(data.executions ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchTrails = useCallback(async () => {
    try {
      const r = await fetch('/api/orchestrator/trails?limit=10', { headers: getAuthHeader() });
      if (!r.ok) return;
      const data = await r.json();
      setTrails(data.trails ?? []);
    } catch { /* ignore */ }
  }, []);

  const loadTrail = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/orchestrator/trails/${id}`, { headers: getAuthHeader() });
      if (!r.ok) return;
      const data = await r.json();
      setActiveTrail({ trail: data.trail, entries: data.entries ?? [] });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchStatus();
      await fetchBriefings();
      await fetchExecutions();
      await fetchTrails();
      setLoading(false);
    })();
  }, [fetchStatus, fetchBriefings, fetchExecutions, fetchTrails]);

  // Auto-load latest briefing
  useEffect(() => {
    if (briefings.length > 0 && !activeBriefing) {
      loadBriefing(briefings[0].id);
    }
  }, [briefings, activeBriefing, loadBriefing]);

  const generateBriefing = async () => {
    if (!apiConfigured) {
      setStatusMsg('Anthropic API key not configured');
      return;
    }
    setGenerating(true);
    setStatusMsg('');
    try {
      const r = await fetch('/api/orchestrator/briefings/generate', {
        method: 'POST',
        headers: getAuthHeader(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setStatusMsg(`Briefing generated — ${data.result?.signalCount ?? 0} signals analysed`);
      await fetchBriefings();
      await fetchStatus();
      if (data.result?.briefingId) {
        await loadBriefing(data.result.briefingId);
      }
    } catch (err) {
      setStatusMsg(`Error: ${String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const rateProposal = async (proposalId: string, rating: string) => {
    try {
      await fetch(`/api/orchestrator/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ human_rating: rating }),
      });
      setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, human_rating: rating } : p));
      // Update stage metrics display
      await fetchStatus();
    } catch { /* ignore */ }
  };

  const approveProposal = async (proposalId: string) => {
    try {
      const r = await fetch(`/api/orchestrator/proposals/${proposalId}/approve`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json();
        setStatusMsg(`Approval failed: ${err.error}`);
        return;
      }
      setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'approved', human_rating: 'good_catch' } : p));
      await fetchExecutions();
      await fetchTrails();
      setStatusMsg('Proposal approved — execution record created');
    } catch (err) {
      setStatusMsg(`Error: ${String(err)}`);
    }
  };

  const rejectProposal = async (proposalId: string) => {
    try {
      await fetch(`/api/orchestrator/proposals/${proposalId}/reject`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: 'rejected', human_rating: 'wrong' } : p));
      setStatusMsg('Proposal rejected');
    } catch { /* ignore */ }
  };

  const handlePause = async () => {
    const paused = config?.orchestrator_paused;
    try {
      await fetch(`/api/orchestrator/${paused ? 'resume' : 'pause'}`, {
        method: 'POST',
        headers: getAuthHeader(),
      });
      await fetchStatus();
    } catch { /* ignore */ }
  };

  const handleReset = async () => {
    if (!confirm('Reset Orchestrator to Stage 1 (Observer)? All progression metrics will be cleared.')) return;
    try {
      await fetch('/api/orchestrator/reset', { method: 'POST', headers: getAuthHeader() });
      await fetchStatus();
      setStatusMsg('Orchestrator reset to Stage 1');
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-adv-gray animate-pulse">Loading Orchestrator...</div>
      </div>
    );
  }

  const paused = config?.orchestrator_paused === 1;
  const progressPct = stage ? stage1ProgressPercent(stage) : 0;

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 max-w-7xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Brain className="w-7 h-7 text-adv-teal" />
            <h1 className="text-2xl font-semibold text-adv-white">ANTON Orchestrator</h1>
            {paused && (
              <span className="bg-adv-gold/20 text-adv-gold border border-adv-gold/30 text-xs px-2 py-0.5 rounded-full">
                PAUSED
              </span>
            )}
            {!apiConfigured && (
              <span className="bg-adv-red/20 text-red-400 border border-red-400/30 text-xs px-2 py-0.5 rounded-full">
                API NOT CONFIGURED
              </span>
            )}
          </div>
          <p className="text-adv-gray text-sm">
            {STAGE_DESCRIPTIONS[stage?.current_stage ?? 1]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={generateBriefing}
            disabled={generating || !apiConfigured}
            className="flex items-center gap-2 bg-adv-teal hover:bg-adv-teal-dark disabled:opacity-40 text-adv-dark text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {generating ? 'Generating...' : 'Generate Briefing'}
          </button>
          <button
            onClick={handlePause}
            className={`flex items-center gap-1 text-sm px-3 py-2 rounded-lg border transition-colors ${paused ? 'border-adv-teal/30 text-adv-teal hover:bg-adv-teal-dim' : 'border-adv-gray/20 text-adv-gray hover:bg-white/5'}`}
          >
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={() => setShowConfig(v => !v)}
            className="p-2 text-adv-gray hover:text-adv-off-white border border-adv-gray/20 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="mb-4 bg-adv-card border border-adv-teal/20 text-adv-teal text-sm px-4 py-2 rounded-lg">
          {statusMsg}
        </div>
      )}

      {/* ── Stage + Stats row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Stage card */}
        <div className="bg-adv-card border border-white/5 rounded-xl p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-adv-gray uppercase tracking-wide mb-0.5">Current Stage</p>
              <p className="text-adv-white font-semibold text-lg">
                Stage {stage?.current_stage ?? 1}: {STAGE_NAMES[stage?.current_stage ?? 1]}
              </p>
            </div>
            <div className="text-right text-xs text-adv-gray">
              {lastHeartbeat ? (
                <>
                  <div className="flex items-center gap-1 justify-end">
                    <span className={`w-1.5 h-1.5 rounded-full ${lastHeartbeat.status === 'ok' ? 'bg-adv-green' : 'bg-adv-red'}`} />
                    Heartbeat {lastHeartbeat.status === 'ok' ? 'active' : 'error'}
                  </div>
                  <div className="text-adv-gray-med">{formatTime(lastHeartbeat.ran_at)}</div>
                </>
              ) : (
                <span className="text-adv-gray-med">No heartbeats yet</span>
              )}
            </div>
          </div>

          {stage?.current_stage === 1 && (
            <div>
              <div className="flex justify-between text-xs text-adv-gray mb-1">
                <span>Progress to Stage 2: Proposal Manager</span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full bg-adv-dark-2 rounded-full h-2 mb-3">
                <div
                  className="bg-adv-teal h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  { label: 'Briefings', current: stage.total_briefings, target: 20 },
                  { label: 'Proposals', current: stage.total_proposals, target: 50 },
                  { label: 'Ratings given', current: stage.proposals_rated, target: 10 },
                  {
                    label: 'Good/Relevant rate',
                    current: stage.proposals_rated > 0 ? Math.round(stage.proposals_good_or_relevant / stage.proposals_rated * 100) : 0,
                    target: 60,
                    suffix: '%',
                  },
                ].map(item => (
                  <div key={item.label} className="bg-adv-dark-2 rounded-lg p-2">
                    <div className="text-adv-gray mb-0.5">{item.label}</div>
                    <div className={`font-medium ${item.current >= item.target ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                      {item.current}{item.suffix ?? ''} / {item.target}{item.suffix ?? ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(stage?.current_stage ?? 1) > 1 && (
            <div className="text-sm text-adv-gray">
              Stage {stage!.current_stage} since {formatTime(stage!.stage_entered_at)}.
              Briefings: {stage!.total_briefings} | Proposals: {stage!.total_proposals} | Approval rate: {
                stage!.proposals_rated > 0
                  ? `${Math.round(stage!.proposals_good_or_relevant / stage!.proposals_rated * 100)}%`
                  : 'n/a'
              }
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="bg-adv-card border border-white/5 rounded-xl p-4">
          <p className="text-xs text-adv-gray uppercase tracking-wide mb-3">Quick Stats</p>
          <div className="space-y-3">
            {[
              { icon: FileText, label: 'Total briefings', value: stage?.total_briefings ?? 0 },
              { icon: Brain, label: 'Total proposals', value: stage?.total_proposals ?? 0 },
              { icon: CheckCircle, label: 'Ratings given', value: stage?.proposals_rated ?? 0 },
              { icon: Activity, label: 'Unread briefings', value: unreadCount },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-adv-gray">
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </div>
                <span className="text-adv-off-white font-medium text-sm">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/5">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-red transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Observer
            </button>
          </div>
        </div>
      </div>

      {/* ── Config panel (collapsible) ─────────────────────────────────────── */}
      {showConfig && config && (
        <div className="bg-adv-card border border-white/5 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-medium text-adv-off-white mb-3">Orchestrator Configuration</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Heartbeat interval', value: `${config.heartbeat_interval_minutes} min` },
              { label: 'Briefing schedule', value: config.briefing_schedule },
              { label: 'Radar urgency threshold', value: `≥ ${Math.round(config.radar_urgency_threshold * 100)}%` },
              { label: 'Quality decline threshold', value: `≥ ${config.quality_decline_threshold} pts` },
              { label: 'Deadline alert window', value: `${config.deadline_alert_days} days` },
              { label: 'Heartbeat enabled', value: config.heartbeat_enabled ? 'Yes' : 'No' },
              { label: 'Status', value: config.orchestrator_paused ? `Paused (${config.paused_at ? formatTime(config.paused_at) : ''})` : 'Active' },
            ].map(item => (
              <div key={item.label}>
                <p className="text-adv-gray text-xs mb-0.5">{item.label}</p>
                <p className="text-adv-off-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content: briefing + proposals ────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Proposals column */}
        <div className="xl:col-span-1">
          <div className="bg-adv-card border border-white/5 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-medium text-adv-off-white">
                Proposals
                {proposals.length > 0 && (
                  <span className="ml-2 bg-adv-teal/20 text-adv-teal text-xs px-1.5 py-0.5 rounded-full">
                    {proposals.length}
                  </span>
                )}
              </h2>
              <span className="text-xs text-adv-gray">Rate to progress</span>
            </div>

            {proposals.length === 0 ? (
              <div className="p-6 text-center text-adv-gray text-sm">
                {briefings.length === 0
                  ? 'Generate your first briefing to see proposals'
                  : 'No proposals in this briefing'}
              </div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
                {proposals.map(p => {
                  const IconComp = SIGNAL_ICONS[p.signal_source] ?? Brain;
                  const colClass = SIGNAL_COLOURS[p.signal_source] ?? 'text-adv-teal';
                  return (
                    <div key={p.id} className="p-4">
                      {/* Header */}
                      <div className="flex items-start gap-2 mb-2">
                        <IconComp className={`w-4 h-4 mt-0.5 shrink-0 ${colClass}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${urgencyBadge(p.urgency_score)}`}>
                              {urgencyLabel(p.urgency_score)}
                            </span>
                            <span className="text-[10px] text-adv-gray capitalize">{p.signal_source}</span>
                          </div>
                          <p className="text-xs text-adv-gray leading-snug line-clamp-2">{p.signal_summary}</p>
                        </div>
                      </div>

                      {/* Proposed action */}
                      <div className="bg-adv-dark-2 rounded-lg p-2 mb-2">
                        <p className="text-xs text-adv-off-white leading-snug">{p.proposed_action}</p>
                        {p.estimated_effort && (
                          <p className="text-[10px] text-adv-gray mt-1">{p.estimated_effort}</p>
                        )}
                      </div>

                      {/* Confidence */}
                      <div className="flex items-center gap-2 text-[10px] text-adv-gray mb-2">
                        <span>Confidence: {Math.round(p.confidence_score * 100)}%</span>
                        <span>·</span>
                        <span className="capitalize">{p.action_type.replace(/_/g, ' ')}</span>
                      </div>

                      {/* Action buttons — Approve/Reject (Stage 2+) or Rate (Stage 1) */}
                      {p.human_rating || p.status === 'approved' || p.status === 'rejected' ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle className={`w-3 h-3 ${p.status === 'rejected' ? 'text-adv-red' : 'text-adv-teal'}`} />
                          <span className={`text-[10px] capitalize ${p.status === 'rejected' ? 'text-adv-red' : 'text-adv-teal'}`}>
                            {p.status === 'approved' ? 'Approved — executing' : p.status === 'rejected' ? 'Rejected' : p.human_rating!.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ) : (stage?.current_stage ?? 1) >= 2 ? (
                        /* Stage 2+: Approve / Reject execution buttons */
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => approveProposal(p.id)}
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border bg-adv-green/20 text-green-400 border-green-400/30 hover:bg-adv-green/30 transition-colors"
                          >
                            <ThumbsUp className="w-3 h-3" />
                            Approve
                          </button>
                          <button
                            onClick={() => rejectProposal(p.id)}
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border bg-adv-red/10 text-red-400 border-red-400/20 hover:bg-adv-red/20 transition-colors"
                          >
                            <ThumbsDown className="w-3 h-3" />
                            Reject
                          </button>
                          <span className="text-adv-gray-med text-[9px] ml-1">or rate:</span>
                          {RATING_OPTIONS.slice(0, 3).map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => rateProposal(p.id, opt.value)}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${opt.className}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        /* Stage 1: Rating only */
                        <div className="flex flex-wrap gap-1">
                          {RATING_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => rateProposal(p.id, opt.value)}
                              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${opt.className}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Briefing content + history */}
        <div className="xl:col-span-2 space-y-4">

          {/* Active briefing */}
          <div className="bg-adv-card border border-white/5 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-adv-teal" />
                <h2 className="text-sm font-medium text-adv-off-white">
                  {activeBriefing
                    ? `${activeBriefing.period.charAt(0).toUpperCase() + activeBriefing.period.slice(1)} Briefing — ${formatTime(activeBriefing.created_at)}`
                    : 'Latest Briefing'}
                </h2>
              </div>
              {activeBriefing && (
                <span className="text-xs text-adv-gray">{activeBriefing.signals_read} signals</span>
              )}
            </div>

            <div className="p-4">
              {!activeBriefing ? (
                <div className="text-center py-12 text-adv-gray">
                  <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm mb-1">No briefings yet</p>
                  <p className="text-xs">Click "Generate Briefing" to run the first cycle</p>
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none
                  prose-headings:text-adv-off-white prose-headings:font-semibold
                  prose-p:text-adv-gray prose-p:leading-relaxed
                  prose-strong:text-adv-off-white
                  prose-ul:text-adv-gray prose-li:text-adv-gray
                  prose-code:text-adv-teal prose-code:bg-adv-dark-2 prose-code:px-1 prose-code:rounded
                  prose-blockquote:border-adv-teal/30 prose-blockquote:text-adv-gray">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeBriefing.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>

          {/* Briefing history */}
          <div className="bg-adv-card border border-white/5 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowHistory(v => !v)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/2 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-adv-gray" />
                <span className="text-sm font-medium text-adv-off-white">Briefing History</span>
                {unreadCount > 0 && (
                  <span className="bg-adv-teal/20 text-adv-teal text-xs px-1.5 py-0.5 rounded-full">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-adv-gray transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>

            {showHistory && (
              <div className="border-t border-white/5 divide-y divide-white/5">
                {briefings.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-adv-gray">No briefings generated yet</p>
                ) : (
                  briefings.map(b => (
                    <button
                      key={b.id}
                      onClick={() => loadBriefing(b.id)}
                      className={`w-full px-4 py-3 flex items-center justify-between hover:bg-white/2 transition-colors text-left ${activeBriefing?.id === b.id ? 'bg-adv-teal-dim' : ''}`}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm text-adv-off-white capitalize">{b.period} briefing</span>
                          {b.status === 'unread' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-adv-teal" />
                          )}
                        </div>
                        <div className="text-xs text-adv-gray">
                          {formatTime(b.created_at)} · {b.signals_read} signals · {b.proposals_count} proposals
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-adv-gray shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Executions log (Phase 2+) ──────────────────────────────────────── */}
      {executions.length > 0 && (
        <div className="mt-6 bg-adv-card border border-white/5 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowExecutions(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-adv-teal" />
              <span className="text-sm font-medium text-adv-off-white">Execution Log</span>
              <span className="bg-adv-teal/20 text-adv-teal text-xs px-1.5 py-0.5 rounded-full">{executions.length}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-adv-gray transition-transform ${showExecutions ? 'rotate-180' : ''}`} />
          </button>

          {showExecutions && (
            <div className="border-t border-white/5 divide-y divide-white/5">
              {executions.map(ex => (
                <div key={ex.id} className="px-4 py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-adv-off-white truncate">{ex.proposed_action ?? 'Approved proposal'}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-adv-gray">
                      <span className="capitalize">{ex.action_type?.replace(/_/g, ' ') ?? ex.initiated_by}</span>
                      <span>·</span>
                      <span>{formatTime(ex.initiated_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      ex.outcome === 'success' ? 'bg-adv-green/20 text-green-400 border-green-400/30' :
                      ex.outcome === 'failed' ? 'bg-adv-red/20 text-red-400 border-red-400/30' :
                      ex.outcome ? 'bg-adv-gold/20 text-adv-gold border-adv-gold/30' :
                      'bg-adv-teal-dim text-adv-teal border-adv-teal/30'
                    }`}>
                      {ex.outcome ?? 'pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reasoning Trails ───────────────────────────────────────────────── */}
      {trails.length > 0 && (
        <div className="mt-4 bg-adv-card border border-white/5 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowTrails(v => !v)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ListTree className="w-4 h-4 text-adv-gray" />
              <span className="text-sm font-medium text-adv-off-white">Reasoning Trails</span>
              <span className="bg-adv-gray/20 text-adv-gray text-xs px-1.5 py-0.5 rounded-full">{trails.length}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-adv-gray transition-transform ${showTrails ? 'rotate-180' : ''}`} />
          </button>

          {showTrails && (
            <div className="border-t border-white/5">
              <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                {trails.map(t => (
                  <button
                    key={t.id}
                    onClick={() => loadTrail(t.id)}
                    className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/2 transition-colors text-left ${activeTrail?.trail.id === t.id ? 'bg-adv-teal-dim' : ''}`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs text-adv-off-white capitalize">{t.trigger_type.replace(/_/g, ' ')}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded ${t.status === 'completed' ? 'text-adv-teal' : t.status === 'failed' ? 'text-adv-red' : 'text-adv-gray'}`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-adv-gray-med">
                        {formatTime(t.created_at)} · {t.total_entries} steps
                        {t.duration_ms ? ` · ${t.duration_ms}ms` : ''}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-adv-gray shrink-0" />
                  </button>
                ))}
              </div>

              {/* Active trail detail */}
              {activeTrail && (
                <div className="border-t border-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-medium text-adv-off-white">
                      Trail: {activeTrail.trail.trigger_type.replace(/_/g, ' ')} — {activeTrail.entries.length} steps
                    </h4>
                    <button
                      onClick={() => setActiveTrail(null)}
                      className="text-[10px] text-adv-gray hover:text-adv-off-white"
                    >
                      close
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {activeTrail.entries.map(entry => (
                      <div key={entry.id} className="bg-adv-dark-2 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-medium uppercase tracking-wide text-adv-teal px-1.5 py-0.5 bg-adv-teal-dim rounded">
                            {entry.entry_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-adv-off-white">{entry.title}</span>
                          {entry.confidence != null && (
                            <span className="ml-auto text-[10px] text-adv-gray">{Math.round(entry.confidence * 100)}%</span>
                          )}
                        </div>
                        <p className="text-[10px] text-adv-gray leading-relaxed whitespace-pre-line line-clamp-4">
                          {entry.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Footer: phase info ─────────────────────────────────────────────── */}
      <div className="mt-6 bg-adv-teal-soft border border-adv-teal/10 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-adv-teal mt-0.5 shrink-0" />
          <div className="text-xs text-adv-gray">
            {(stage?.current_stage ?? 1) >= 2 ? (
              <><strong className="text-adv-teal">Phase 2: Proposal Manager</strong> — Proposals can now be
              approved for execution. Each approval creates an execution record. Approve or reject proposals using the
              buttons on each card. All decisions are captured in the Reasoning Trail for full auditability.</>
            ) : (
              <><strong className="text-adv-teal">Phase 1: Observer Stage</strong> — The Orchestrator reads all platform signals
              and generates situational briefings. Rate proposals to help it learn and progress to Stage 2 (Proposal Manager),
              where proposals can be approved for execution.</>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
