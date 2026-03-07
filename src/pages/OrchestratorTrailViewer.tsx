/**
 * OrchestratorTrailViewer.tsx
 *
 * Full-page reasoning trail viewer with timeline layout.
 * Route: /orchestrator/trail/:id
 *
 * Features:
 * - Timeline with expand/collapse per entry
 * - Narrative summary panel
 * - Confidence visualisation per step
 * - Entry type colour coding
 * - Metadata inspector
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, ChevronRight, Brain, Clock,
  CheckCircle, XCircle, AlertTriangle, Layers, Activity,
  FileText, ListTree, Zap, Shield, Info,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReasoningTrail {
  id: string;
  trigger_type: string;
  transparency_level: number;
  status: string;
  narrative_summary: string | null;
  total_entries: number;
  duration_ms: number | null;
  heartbeat_id: string | null;
  briefing_id: string | null;
  proposal_id: string | null;
  execution_id: string | null;
  total_reasoning_tokens: number | null;
  total_reasoning_cost_usd: number | null;
  created_at: string;
  completed_at: string | null;
}

interface ReasoningEntry {
  id: string;
  trail_id: string;
  sequence_number: number;
  entry_type: string;
  title: string;
  content: string;
  confidence: number | null;
  evidence: string | null;
  model_used: string | null;
  tokens_used: number | null;
  cost_usd: number | null;
  proposal_id: string | null;
  execution_id: string | null;
  metadata: string | null;
  created_at: string;
}

// ── Entry type config ──────────────────────────────────────────────────────────

const ENTRY_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  signal_detection:    { label: 'Signal Detection',    color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20',    icon: Activity },
  signal_assessment:   { label: 'Signal Assessment',   color: 'text-blue-300',    bg: 'bg-blue-300/10 border-blue-300/20',    icon: Activity },
  context_gathering:   { label: 'Context Gathering',   color: 'text-adv-gray',    bg: 'bg-white/5 border-white/10',           icon: Layers },
  proposal_reasoning:  { label: 'Proposal Reasoning',  color: 'text-adv-teal',    bg: 'bg-adv-teal-dim border-adv-teal/20',   icon: Brain },
  module_selection:    { label: 'Module Selection',    color: 'text-purple-400',  bg: 'bg-purple-400/10 border-purple-400/20', icon: Zap },
  input_configuration: { label: 'Input Config',        color: 'text-purple-300',  bg: 'bg-purple-300/10 border-purple-300/20', icon: Zap },
  execution_decision:  { label: 'Execution Decision',  color: 'text-adv-gold',    bg: 'bg-adv-gold/10 border-adv-gold/20',    icon: CheckCircle },
  quality_assessment:  { label: 'Quality Assessment',  color: 'text-green-400',   bg: 'bg-green-400/10 border-green-400/20',  icon: Shield },
  chain_reasoning:     { label: 'Chain Reasoning',     color: 'text-adv-teal',    bg: 'bg-adv-teal-dim border-adv-teal/20',   icon: ListTree },
  escalation_reasoning:{ label: 'Escalation',          color: 'text-adv-red',     bg: 'bg-adv-red/10 border-adv-red/20',      icon: AlertTriangle },
  pattern_recognition: { label: 'Pattern Recognition', color: 'text-yellow-400',  bg: 'bg-yellow-400/10 border-yellow-400/20', icon: Brain },
  pdp_alignment:       { label: 'PDP Alignment',       color: 'text-indigo-400',  bg: 'bg-indigo-400/10 border-indigo-400/20', icon: FileText },
  completion_summary:  { label: 'Summary',             color: 'text-adv-teal',    bg: 'bg-adv-teal-dim border-adv-teal/20',   icon: CheckCircle },
};

const DEFAULT_ENTRY_CONFIG = { label: 'Step', color: 'text-adv-gray', bg: 'bg-white/5 border-white/10', icon: Info };

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-adv-teal' : pct >= 40 ? 'bg-adv-gold' : 'bg-adv-red';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-adv-gray w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function OrchestratorTrailViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [trail, setTrail] = useState<ReasoningTrail | null>(null);
  const [entries, setEntries] = useState<ReasoningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orchestrator/trails/${id}`, { headers: getAuthHeader() })
      .then(r => r.json())
      .then((d: { trail: ReasoningTrail; entries: ReasoningEntry[] }) => {
        setTrail(d.trail);
        setEntries(d.entries);
        // Auto-expand key entry types
        const autoExpand = new Set(
          d.entries
            .filter(e => ['execution_decision', 'completion_summary', 'escalation_reasoning'].includes(e.entry_type))
            .map(e => e.id)
        );
        setExpanded(autoExpand);
      })
      .catch(() => setError('Failed to load reasoning trail'))
      .finally(() => setLoading(false));
  }, [id]);

  const toggleEntry = (entryId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(entries.map(e => e.id)));
  const collapseAll = () => setExpanded(new Set());

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-adv-gray animate-pulse">Loading reasoning trail...</div>
      </div>
    );
  }

  if (error || !trail) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-adv-gray hover:text-adv-off-white text-sm mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-adv-red/10 border border-adv-red/20 rounded-xl p-6 text-adv-red">
          {error ?? 'Trail not found'}
        </div>
      </div>
    );
  }

  const statusIcon = trail.status === 'completed'
    ? <CheckCircle className="w-4 h-4 text-adv-teal" />
    : trail.status === 'failed'
    ? <XCircle className="w-4 h-4 text-adv-red" />
    : <Clock className="w-4 h-4 text-adv-gray animate-spin" />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/orchestrator')}
          className="flex items-center gap-1.5 text-adv-gray hover:text-adv-off-white text-sm mt-0.5 shrink-0"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <ListTree className="w-5 h-5 text-adv-teal" />
            <h1 className="text-lg font-semibold text-adv-off-white">
              Reasoning Trail — {trail.trigger_type.replace(/_/g, ' ')}
            </h1>
            {statusIcon}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-adv-gray">
            <span>{formatTime(trail.created_at)}</span>
            {trail.duration_ms != null && <span>{trail.duration_ms}ms</span>}
            <span>{trail.total_entries} steps</span>
            {trail.total_reasoning_tokens != null && (
              <span>{trail.total_reasoning_tokens.toLocaleString()} tokens</span>
            )}
            {trail.total_reasoning_cost_usd != null && (
              <span>${trail.total_reasoning_cost_usd.toFixed(4)}</span>
            )}
            <span className="text-xs px-1.5 py-0.5 bg-white/5 rounded">
              Level {trail.transparency_level} transparency
            </span>
          </div>
        </div>
      </div>

      {/* ── Narrative summary ─────────────────────────────────────────── */}
      {trail.narrative_summary && (
        <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-adv-teal" />
            <span className="text-sm font-medium text-adv-teal">AI Narrative Summary</span>
          </div>
          <p className="text-sm text-adv-off-white leading-relaxed">{trail.narrative_summary}</p>
        </div>
      )}

      {/* ── Context links ─────────────────────────────────────────────── */}
      {(trail.briefing_id || trail.proposal_id || trail.execution_id) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {trail.briefing_id && (
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-adv-gray">
              Briefing: <code className="text-adv-off-white font-mono">{trail.briefing_id.substring(0, 8)}</code>
            </span>
          )}
          {trail.proposal_id && (
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-adv-gray">
              Proposal: <code className="text-adv-off-white font-mono">{trail.proposal_id.substring(0, 8)}</code>
            </span>
          )}
          {trail.execution_id && (
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-adv-gray">
              Execution: <code className="text-adv-off-white font-mono">{trail.execution_id.substring(0, 8)}</code>
            </span>
          )}
        </div>
      )}

      {/* ── Timeline controls ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-adv-off-white">
          Reasoning Steps
          <span className="ml-2 text-xs text-adv-gray font-normal">({entries.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            Expand all
          </button>
          <span className="text-adv-gray">·</span>
          <button
            onClick={collapseAll}
            className="text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* ── Timeline entries ──────────────────────────────────────────── */}
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[19px] top-6 bottom-4 w-px bg-white/5" aria-hidden />

        <div className="space-y-2">
          {entries.map((entry, index) => {
            const config = ENTRY_TYPE_CONFIG[entry.entry_type] ?? DEFAULT_ENTRY_CONFIG;
            const IconComponent = config.icon;
            const isExpanded = expanded.has(entry.id);
            const metadata = (() => {
              try { return entry.metadata ? JSON.parse(entry.metadata) as Record<string, unknown> : null; }
              catch { return null; }
            })();

            return (
              <div key={entry.id} className="flex gap-3">
                {/* Step dot */}
                <div className="relative flex-shrink-0 w-10 flex flex-col items-center">
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center z-10 mt-1.5 ${config.bg}`}>
                    <IconComponent className={`w-2.5 h-2.5 ${config.color}`} />
                  </div>
                  <span className="text-xs text-adv-gray mt-0.5">{index + 1}</span>
                </div>

                {/* Entry card */}
                <div className={`flex-1 min-w-0 border rounded-xl overflow-hidden mb-1 ${config.bg}`}>
                  <button
                    onClick={() => toggleEntry(entry.id)}
                    className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-white/3 transition-colors"
                  >
                    <span className={`text-xs font-medium uppercase tracking-wide shrink-0 ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-xs text-adv-off-white flex-1 truncate">{entry.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.confidence != null && (
                        <span className="text-xs text-adv-gray">{Math.round(entry.confidence * 100)}%</span>
                      )}
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-adv-gray" />
                        : <ChevronRight className="w-3.5 h-3.5 text-adv-gray" />
                      }
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                      {/* Confidence bar */}
                      {entry.confidence != null && (
                        <div>
                          <div className="text-xs text-adv-gray mb-1">Confidence</div>
                          <ConfidenceBar value={entry.confidence} />
                        </div>
                      )}

                      {/* Main content */}
                      <div>
                        <div className="text-xs text-adv-gray mb-1">Reasoning</div>
                        <p className="text-xs text-adv-off-white leading-relaxed whitespace-pre-wrap">
                          {entry.content}
                        </p>
                      </div>

                      {/* Evidence */}
                      {entry.evidence && entry.evidence !== '{}' && (
                        <div>
                          <div className="text-xs text-adv-gray mb-1">Evidence</div>
                          <pre className="text-xs text-adv-gray bg-adv-dark-2 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                            {entry.evidence}
                          </pre>
                        </div>
                      )}

                      {/* Metadata */}
                      {metadata && Object.keys(metadata).length > 0 && (
                        <div>
                          <div className="text-xs text-adv-gray mb-1">Metadata</div>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(metadata).map(([k, v]) => (
                              <span key={k} className="text-xs px-2 py-0.5 bg-white/5 rounded text-adv-gray">
                                <span className="text-adv-off-white">{k}:</span>{' '}
                                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Model / token info */}
                      {(entry.model_used || entry.tokens_used != null) && (
                        <div className="flex flex-wrap gap-3 text-xs text-adv-gray pt-1 border-t border-white/5">
                          {entry.model_used && <span>Model: {entry.model_used}</span>}
                          {entry.tokens_used != null && <span>{entry.tokens_used.toLocaleString()} tokens</span>}
                          {entry.cost_usd != null && <span>${entry.cost_usd.toFixed(5)}</span>}
                          <span>{formatTime(entry.created_at)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12 text-adv-gray text-sm">
          No reasoning entries recorded for this trail.
        </div>
      )}
    </div>
  );
}
