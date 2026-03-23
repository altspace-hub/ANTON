/**
 * GrowPipelinePage.tsx
 *
 * Pipeline / Kanban view of opportunities for the Grow Pillar.
 * Route: /grow/pipeline
 *
 * Supports toggle between Kanban and List view.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Target,
  LayoutGrid,
  List,
  Plus,
  Loader2,
  AlertCircle,
  DollarSign,
  Building2,
  Percent,
  CalendarDays,
  X,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  title: string;
  organisation_name: string | null;
  organisation_id: string | null;
  stage: string;
  value: number;
  probability: number;
  expected_close: string | null;
  next_action: string | null;
  contact_name: string | null;
  created_at: string;
}

// Backend returns an array of per-stage summaries — compute totals client-side
interface StageSummary {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
  opportunity_count: number;
  total_value: number;
  avg_probability: number;
}

interface PipelineSummary {
  total_value: number;
  weighted_value: number;
  total_count: number;
}

interface StageDefinition {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES: StageDefinition[] = [
  { key: 'prospect', label: 'Prospect', color: 'text-adv-blue', bgColor: 'bg-adv-blue/10', borderColor: 'border-adv-blue/30' },
  { key: 'qualified', label: 'Qualified', color: 'text-adv-teal', bgColor: 'bg-adv-teal-dim', borderColor: 'border-adv-teal/30' },
  { key: 'proposal', label: 'Proposal', color: 'text-adv-gold', bgColor: 'bg-adv-gold/10', borderColor: 'border-adv-gold/30' },
  { key: 'negotiation', label: 'Negotiation', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
  { key: 'won', label: 'Won', color: 'text-adv-green', bgColor: 'bg-adv-green/10', borderColor: 'border-adv-green/30' },
  { key: 'lost', label: 'Lost', color: 'text-adv-red', bgColor: 'bg-adv-red/10', borderColor: 'border-adv-red/30' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  const v = Number(value) || 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getStageDefinition(stageKey: string): StageDefinition {
  return PIPELINE_STAGES.find((s) => s.key === stageKey) ?? PIPELINE_STAGES[0];
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-3">
      <Icon className="h-4 w-4 text-adv-teal" />
      <div>
        <p className="text-lg font-bold text-adv-off-white">{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-adv-gray">{label}</p>
      </div>
    </div>
  );
}

function KanbanCard({ opp }: { opp: Opportunity }) {
  return (
    <div className="rounded-lg border border-border bg-adv-dark-2 p-3 transition hover:border-adv-teal/30">
      <p className="text-sm font-medium text-adv-off-white leading-snug">{opp.title}</p>
      {opp.organisation_name && (
        <p className="mt-1 flex items-center gap-1 text-xs text-adv-gray">
          <Building2 className="h-3 w-3" />
          {opp.organisation_name}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-adv-teal">{formatCurrency(opp.value)}</span>
        <span className="flex items-center gap-0.5 text-xs text-adv-gray">
          <Percent className="h-3 w-3" />
          {opp.probability}%
        </span>
      </div>
      {opp.next_action && (
        <p className="mt-2 text-[10px] text-adv-gray line-clamp-1">
          Next: {opp.next_action}
        </p>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GrowPipelinePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState<PipelineSummary>({ total_value: 0, weighted_value: 0, total_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showAddForm, setShowAddForm] = useState(searchParams.get('action') === 'add');

  // Add form state
  const [newTitle, setNewTitle] = useState('');
  const [newOrganisation, setNewOrganisation] = useState('');
  const [newStage, setNewStage] = useState('prospect');
  const [newValue, setNewValue] = useState('');
  const [newProbability, setNewProbability] = useState('50');
  const [newExpectedClose, setNewExpectedClose] = useState('');
  const [newNextAction, setNewNextAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiPipelineResult, setAiPipelineResult] = useState<string | null>(null);

  async function loadData() {
    try {
      setError(null);
      const [oppRes, summaryRes] = await Promise.all([
        fetch('/api/grow/opportunities', { headers: getAuthHeader() }),
        fetch('/api/grow/pipeline/summary', { headers: getAuthHeader() }),
      ]);
      if (!oppRes.ok) throw new Error('Failed to load opportunities');
      const oppData = await oppRes.json();
      setOpportunities(Array.isArray(oppData) ? oppData : oppData.opportunities ?? []);
      if (summaryRes.ok) {
        const stages: StageSummary[] = await summaryRes.json();
        // Compute totals from per-stage array
        const activeStages = stages.filter(s => !s.is_won && !s.is_lost);
        const totalValue = activeStages.reduce((sum, s) => sum + (Number(s.total_value) || 0), 0);
        const totalCount = activeStages.reduce((sum, s) => sum + (Number(s.opportunity_count) || 0), 0);
        const weightedValue = activeStages.reduce((sum, s) => sum + (Number(s.total_value) || 0) * (Number(s.avg_probability) || 0) / 100, 0);
        setSummary({ total_value: totalValue, weighted_value: weightedValue, total_count: totalCount });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAddOpportunity() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/grow/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newOrganisation.trim() || undefined,
          stageId: newStage || undefined,
          value: parseFloat(newValue) || 0,
          probability: parseInt(newProbability) || 50,
          expectedCloseDate: newExpectedClose || undefined,
          nextAction: newNextAction.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to create opportunity');
      }
      setNewTitle('');
      setNewOrganisation('');
      setNewStage('prospect');
      setNewValue('');
      setNewProbability('50');
      setNewExpectedClose('');
      setNewNextAction('');
      setShowAddForm(false);
      setSearchParams({});
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create opportunity');
    } finally {
      setSaving(false);
    }
  }

  // Group opportunities by stage for kanban
  const oppsByStage = PIPELINE_STAGES.reduce<Record<string, Opportunity[]>>((acc, stage) => {
    acc[stage.key] = opportunities.filter((o) => o.stage === stage.key);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col overflow-hidden bg-adv-dark">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/grow')}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-adv-gray transition hover:bg-adv-card hover:text-adv-off-white"
              aria-label="Back to Grow"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
              <Target className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">Pipeline</h1>
              <p className="text-xs text-adv-gray">
                {opportunities.length} opportunit{opportunities.length !== 1 ? 'ies' : 'y'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex rounded-lg border border-border bg-adv-card">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === 'kanban'
                    ? 'bg-adv-teal text-adv-dark'
                    : 'text-adv-gray hover:text-adv-off-white'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-xs font-medium transition ${
                  viewMode === 'list'
                    ? 'bg-adv-teal text-adv-dark'
                    : 'text-adv-gray hover:text-adv-off-white'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark"
            >
              <Plus className="h-4 w-4" />
              New Opportunity
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 max-w-3xl">
          <SummaryCard icon={DollarSign} label="Total Value" value={formatCurrency(summary.total_value)} />
          <SummaryCard icon={Target} label="Weighted Value" value={formatCurrency(summary.weighted_value)} />
          <SummaryCard icon={CalendarDays} label="Total Opportunities" value={summary.total_count} />
          <button
            onClick={async () => {
              setAiAnalyzing(true);
              setAiPipelineResult(null);
              try {
                const oppList = opportunities.map(o => `- ${o.title}: ${o.stage || 'unknown stage'}, value ${formatCurrency(o.value)}, prob ${o.probability}%`).join('\n');
                const context = `Pipeline has ${opportunities.length} opportunities, total value ${formatCurrency(summary.total_value)}, weighted ${formatCurrency(summary.weighted_value)}.\n\nOpportunities:\n${oppList}\n\nAnalyze this pipeline: health assessment, risks, recommended actions, and priorities.`;
                const res = await fetchWithAuth('/api/grow/ai/analyze', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ promptType: 'pipeline', context }),
                });
                if (res.ok) {
                  const reader = res.body?.getReader();
                  const decoder = new TextDecoder();
                  let text = '';
                  if (reader) {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
                        if (line.startsWith('data: ')) {
                          try { const e = JSON.parse(line.slice(6)); if (e.delta?.text) text += e.delta.text; } catch {}
                        }
                      }
                      setAiPipelineResult(text);
                    }
                  }
                }
              } finally { setAiAnalyzing(false); }
            }}
            disabled={aiAnalyzing || opportunities.length === 0}
            className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-card px-4 py-3 text-sm text-adv-teal hover:bg-adv-teal/10 transition-colors disabled:opacity-50 col-span-3 justify-center"
          >
            {aiAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiAnalyzing ? 'Analyzing...' : 'Analyze Pipeline'}
          </button>
        </div>

        {aiPipelineResult && (
          <div className="rounded-lg border border-adv-teal/30 bg-adv-dark p-4 max-w-4xl">
            <h3 className="text-xs font-semibold uppercase text-adv-teal mb-2">Pipeline Analysis</h3>
            <div className="text-sm text-adv-off-white whitespace-pre-wrap leading-relaxed">{aiPipelineResult}</div>
          </div>
        )}

        {/* Add Opportunity Form */}
        {showAddForm && (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 max-w-4xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-adv-off-white">New Opportunity</h3>
              <button
                onClick={() => { setShowAddForm(false); setSearchParams({}); }}
                className="text-adv-gray transition hover:text-adv-off-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-adv-gray">Title *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="DORA compliance assessment"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Organisation</label>
                <input
                  type="text"
                  value={newOrganisation}
                  onChange={(e) => setNewOrganisation(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Stage</label>
                <select
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Value ($)</label>
                <input
                  type="number"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="50000"
                  min="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Probability (%)</label>
                <input
                  type="number"
                  value={newProbability}
                  onChange={(e) => setNewProbability(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="50"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Expected Close</label>
                <input
                  type="date"
                  value={newExpectedClose}
                  onChange={(e) => setNewExpectedClose(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Next Action</label>
                <input
                  type="text"
                  value={newNextAction}
                  onChange={(e) => setNewNextAction(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none"
                  placeholder="Schedule intro call"
                />
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-adv-red">{error}</p>}
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowAddForm(false); setSearchParams({}); }}
                className="rounded-lg px-4 py-2 text-sm text-adv-gray transition hover:text-adv-off-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddOpportunity}
                disabled={saving || !newTitle.trim()}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Saving...' : 'Create Opportunity'}
              </button>
            </div>
          </div>
        )}

        {/* Loading / Error */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
          </div>
        ) : error && !showAddForm ? (
          <div className="flex flex-col items-center py-16 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-adv-gray" />
            <p className="text-sm text-adv-red">{error}</p>
          </div>
        ) : opportunities.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Target className="mb-3 h-10 w-10 text-adv-gray" />
            <p className="text-sm text-adv-gray">
              No opportunities yet. Create your first to start tracking your pipeline.
            </p>
          </div>
        ) : viewMode === 'kanban' ? (
          /* ── Kanban view ──────────────────────────────────────────── */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINE_STAGES.map((stage) => {
              const stageOpps = oppsByStage[stage.key] ?? [];
              return (
                <div
                  key={stage.key}
                  className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-adv-card"
                >
                  {/* Column header */}
                  <div className={`flex items-center justify-between border-b px-4 py-3 ${stage.borderColor}`}>
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${stage.bgColor.replace('/10', '')} ${stage.color.replace('text-', 'bg-')}`} />
                      <span className={`text-xs font-semibold ${stage.color}`}>{stage.label}</span>
                    </div>
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-adv-dark px-1.5 text-[10px] font-medium text-adv-gray">
                      {stageOpps.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 space-y-2 p-3">
                    {stageOpps.length === 0 ? (
                      <p className="py-6 text-center text-xs text-adv-gray">No items</p>
                    ) : (
                      stageOpps.map((opp) => <KanbanCard key={opp.id} opp={opp} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── List view ────────────────────────────────────────────── */
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-adv-dark-2">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">Organisation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">Stage</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-adv-gray">Value</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-adv-gray">Probability</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">Expected Close</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-adv-gray">Next Action</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp) => {
                  const stageDef = getStageDefinition(opp.stage);
                  return (
                    <tr
                      key={opp.id}
                      className="cursor-pointer border-b border-border bg-adv-card transition hover:bg-adv-dark-2"
                    >
                      <td className="px-4 py-3 font-medium text-adv-off-white whitespace-nowrap">{opp.title}</td>
                      <td className="px-4 py-3 text-adv-gray whitespace-nowrap">{opp.organisation_name ?? '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${stageDef.color} ${stageDef.bgColor} ${stageDef.borderColor}`}>
                          {stageDef.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-adv-teal whitespace-nowrap">{formatCurrency(opp.value)}</td>
                      <td className="px-4 py-3 text-right text-adv-gray whitespace-nowrap">{opp.probability}%</td>
                      <td className="px-4 py-3 text-adv-gray whitespace-nowrap">{formatDate(opp.expected_close)}</td>
                      <td className="px-4 py-3 text-adv-gray max-w-[200px] truncate">{opp.next_action ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
