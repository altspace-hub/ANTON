/**
 * TalentCampaignPage.tsx
 *
 * Campaign workspace with tabs: Discovery, Candidates, Scoring, Ad, Assessments, Shortlist, Audit Trail.
 * Central hub for the entire hiring pipeline for a single campaign.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Users,
  Target,
  FileText,
  ClipboardCheck,
  ListChecks,
  ScrollText,
  Plus,
  Loader2,
  MessageSquare,
  Calendar,
  UserPlus,
  BarChart3,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Gavel,
  Check,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

type TabId = 'discovery' | 'candidates' | 'scoring' | 'assessments' | 'shortlist' | 'audit';

interface Campaign {
  id: string;
  title: string;
  department: string | null;
  hiring_manager: string | null;
  status: string;
  role_level: string | null;
  location: string | null;
  salary_range_min: number | null;
  salary_range_max: number | null;
  salary_currency: string;
  headcount: number;
  discovery_document: string;
  capability_map: string;
  scoring_framework: string;
  ad_content: string | null;
  ad_questions: string;
  created_at: string;
  updated_at: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  source: string;
  status: string;
  composite_score: number | null;
  is_internal: boolean;
  is_wildcard: boolean;
  created_at: string;
}

interface ScoringDimension {
  id: string;
  name: string;
  weight: number;
  category: string;
  knockout_minimum: number | null;
  sort_order: number;
}

interface AuditEntry {
  id: string;
  action: string;
  action_detail: string | null;
  actor: string;
  ai_model: string | null;
  eu_ai_act_category: string | null;
  created_at: string;
}

// ── Assessment shapes (from GET /talent/candidates/:id → assessments) ──────
// JSONB columns arrive as objects from Postgres; older rows may be JSON strings.
interface DimensionScore {
  dimension: string;
  score: number;
  reasoning?: string;
  confidence?: number;
}

interface Uncertainty {
  dimension: string;
  description: string;
  followupRecommended?: boolean;
}

interface BiasFinding {
  type: string;
  description: string;
  severity: string;
}

interface FrameworkDriftCheck {
  aligned: boolean;
  deviations: string[];
}

interface Assessment {
  id: string;
  candidate_id: string;
  assessor_type: 'primary' | 'bias_auditor' | string;
  model_used: string | null;
  dimension_scores: DimensionScore[] | string;
  composite_score: number | null;
  composite_percentage: number | null;
  reasoning: string | null;
  thinking_trace: string | null;
  confidence: number | null;
  wild_card_flag: boolean;
  wild_card_reasoning: string | null;
  uncertainties: Uncertainty[] | string;
  bias_findings: BiasFinding[] | string;
  framework_drift_check: FrameworkDriftCheck | string | null;
  assessed_at: string;
}

// JSONB may already be parsed (object) or a JSON string (defensive).
function parseJsonField<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
}

const TABS: { id: TabId; label: string; icon: typeof Search }[] = [
  { id: 'discovery', label: 'Discovery', icon: Search },
  { id: 'candidates', label: 'Candidates', icon: Users },
  { id: 'scoring', label: 'Scoring', icon: Target },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck },
  { id: 'shortlist', label: 'Shortlist', icon: ListChecks },
  { id: 'audit', label: 'Audit Trail', icon: ScrollText },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:               { label: 'New',        color: 'bg-adv-gray/20 text-adv-gray' },
  screening:         { label: 'Screening',  color: 'bg-adv-blue/20 text-adv-blue' },
  assessed:          { label: 'Assessed',   color: 'bg-purple-500/20 text-purple-400' },
  followup_sent:     { label: 'Follow-up',  color: 'bg-adv-gold/20 text-adv-gold' },
  shortlisted:       { label: 'Shortlisted', color: 'bg-adv-teal/20 text-adv-teal' },
  interview:         { label: 'Interview',  color: 'bg-orange-500/20 text-orange-400' },
  offer:             { label: 'Offer',      color: 'bg-adv-green/20 text-adv-green' },
  hired:             { label: 'Hired',      color: 'bg-adv-green/20 text-adv-green' },
  rejected:          { label: 'Rejected',   color: 'bg-adv-red/20 text-adv-red' },
  withdrawn:         { label: 'Withdrawn',  color: 'bg-adv-gray/20 text-adv-gray' },
};

export default function TalentCampaignPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dimensions, setDimensions] = useState<ScoringDimension[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('discovery');
  const [loading, setLoading] = useState(true);

  // Add candidate modal
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [newCandName, setNewCandName] = useState('');
  const [newCandEmail, setNewCandEmail] = useState('');
  const [newCandSource, setNewCandSource] = useState('direct');
  const [addingCandidate, setAddingCandidate] = useState(false);

  // Add dimension modal
  const [showAddDim, setShowAddDim] = useState(false);
  const [newDimName, setNewDimName] = useState('');
  const [newDimWeight, setNewDimWeight] = useState('20');
  const [newDimCategory, setNewDimCategory] = useState('custom');
  const [addingDim, setAddingDim] = useState(false);

  // Assessments tab
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [assessingId, setAssessingId] = useState<string | null>(null);
  const [assessError, setAssessError] = useState<string | null>(null);
  // Human-decision (EU AI Act Art. 14) affordance
  const [recordingDecision, setRecordingDecision] = useState(false);
  const [decisionDone, setDecisionDone] = useState(false);

  const loadCampaign = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await fetchWithAuth(`/api/talent/campaigns/${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        setCampaign(data.campaign);
        setStats(data.stats ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const loadCandidates = useCallback(async () => {
    if (!campaignId) return;
    const res = await fetchWithAuth(`/api/talent/campaigns/${campaignId}/candidates`);
    if (res.ok) {
      const data = await res.json();
      setCandidates(data.candidates ?? []);
    }
  }, [campaignId]);

  const loadDimensions = useCallback(async () => {
    if (!campaignId) return;
    const res = await fetchWithAuth(`/api/talent/campaigns/${campaignId}/scoring-dimensions`);
    if (res.ok) {
      const data = await res.json();
      setDimensions(data.dimensions ?? []);
    }
  }, [campaignId]);

  const loadAudit = useCallback(async () => {
    if (!campaignId) return;
    const res = await fetchWithAuth(`/api/talent/campaigns/${campaignId}/audit-trail`);
    if (res.ok) {
      const data = await res.json();
      setAuditTrail(data.auditTrail ?? []);
    }
  }, [campaignId]);

  useEffect(() => {
    loadCampaign();
    loadCandidates();
    loadDimensions();
    loadAudit();
  }, [loadCampaign, loadCandidates, loadDimensions, loadAudit]);

  async function addCandidate() {
    if (!newCandName.trim() || !campaignId) return;
    setAddingCandidate(true);
    try {
      const res = await fetchWithAuth(`/api/talent/campaigns/${campaignId}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCandName,
          email: newCandEmail || undefined,
          source: newCandSource,
        }),
      });
      if (res.ok) {
        setShowAddCandidate(false);
        setNewCandName('');
        setNewCandEmail('');
        setNewCandSource('direct');
        await loadCandidates();
        await loadAudit();
      }
    } finally {
      setAddingCandidate(false);
    }
  }

  async function addDimension() {
    if (!newDimName.trim() || !campaignId) return;
    setAddingDim(true);
    try {
      const res = await fetchWithAuth(`/api/talent/campaigns/${campaignId}/scoring-dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDimName,
          weight: Number(newDimWeight) || 20,
          category: newDimCategory,
        }),
      });
      if (res.ok) {
        setShowAddDim(false);
        setNewDimName('');
        setNewDimWeight('20');
        setNewDimCategory('custom');
        await loadDimensions();
      }
    } finally {
      setAddingDim(false);
    }
  }

  // ── Assessment: load existing assessments for the selected candidate ─────
  const loadAssessments = useCallback(async (candidateId: string) => {
    setLoadingAssessments(true);
    setAssessError(null);
    setDecisionDone(false);
    try {
      const res = await fetchWithAuth(`/api/talent/candidates/${candidateId}`);
      if (!res.ok) {
        setAssessments([]);
        setAssessError('Could not load this candidate.');
        return;
      }
      const data = await res.json();
      setAssessments((data.assessments ?? []) as Assessment[]);
    } catch {
      setAssessments([]);
      setAssessError('Could not load this candidate.');
    } finally {
      setLoadingAssessments(false);
    }
  }, []);

  function selectCandidateForAssessment(candidateId: string) {
    setSelectedCandidateId(candidateId);
    setActiveTab('assessments');
    void loadAssessments(candidateId);
  }

  // ── Assessment: trigger the dual-model run (primary + bias auditor) ──────
  async function runAssessment(candidateId: string) {
    setAssessingId(candidateId);
    setAssessError(null);
    try {
      const res = await fetchWithAuth(`/api/talent/candidates/${candidateId}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        let reason = 'Assessment failed. Check that the scoring framework is defined and the candidate has a CV or responses.';
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') reason = body.error;
        } catch { /* keep default */ }
        setAssessError(reason);
        return;
      }
      // The assess endpoint returns ids + composite; the rich rows live in
      // talent_assessments and come back via GET /candidates/:id.
      await loadAssessments(candidateId);
      await loadCandidates();
      await loadAudit();
    } catch {
      setAssessError('Assessment request failed. The server may be unreachable.');
    } finally {
      setAssessingId(null);
    }
  }

  // ── Human decision (EU AI Act Art. 14 — human oversight of AI scoring) ───
  async function recordHumanReview(candidateId: string) {
    if (!campaignId) return;
    setRecordingDecision(true);
    try {
      const res = await fetchWithAuth(`/api/talent/campaigns/${campaignId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId,
          contextType: 'ranking_override',
          decision: 'reviewed',
          reasoning: 'Recruiter reviewed the AI assessment and bias-auditor verdict (Art. 14 human oversight).',
        }),
      });
      if (res.ok) {
        setDecisionDone(true);
        await loadAudit();
      }
    } finally {
      setRecordingDecision(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-adv-dark">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex h-full items-center justify-center bg-adv-dark">
        <p className="text-adv-gray">Campaign not found</p>
      </div>
    );
  }

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/talent')} className="text-adv-gray hover:text-adv-off-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-lg font-semibold text-adv-off-white">{campaign.title}</h1>
            <div className="flex items-center gap-3 text-xs text-adv-gray">
              {campaign.department && <span>{campaign.department}</span>}
              {campaign.role_level && <span className="capitalize">{campaign.role_level}</span>}
              {campaign.location && <span>{campaign.location}</span>}
              <span className="text-adv-teal capitalize">{campaign.status.replace('_', ' ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <div className="font-bold text-adv-off-white">{stats.totalCandidates as number ?? 0}</div>
              <div className="text-xs text-adv-gray">Candidates</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-adv-teal">{stats.assessed as number ?? 0}</div>
              <div className="text-xs text-adv-gray">Assessed</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-adv-green">{stats.shortlisted as number ?? 0}</div>
              <div className="text-xs text-adv-gray">Shortlisted</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-adv-teal/10 text-adv-teal'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* ── Discovery Tab ─────────────────────────────────────── */}
        {activeTab === 'discovery' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="text-sm font-medium text-adv-off-white mb-3">Team Discovery</h3>
              <p className="text-sm text-adv-gray mb-4">
                Start a guided conversation to map your team's capabilities, identify gaps, and define what this hire actually needs.
                Use the <strong className="text-adv-teal">Talent Discovery</strong> module from the sidebar to run the discovery session.
              </p>
              <div className="flex items-center gap-3 text-xs text-adv-gray">
                <span>Capability Map: {campaign.capability_map && campaign.capability_map !== '{}' ? 'Populated' : 'Not yet created'}</span>
                <span>Discovery Document: {campaign.discovery_document && campaign.discovery_document !== '{}' ? 'Available' : 'Pending'}</span>
              </div>
            </div>
            {campaign.ad_content && (
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <h3 className="text-sm font-medium text-adv-off-white mb-3">Job Ad</h3>
                <div className="prose prose-sm prose-invert max-w-none text-adv-gray whitespace-pre-wrap">
                  {campaign.ad_content}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Candidates Tab ────────────────────────────────────── */}
        {activeTab === 'candidates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-adv-off-white">
                Candidates ({candidates.length})
              </h3>
              <button
                onClick={() => setShowAddCandidate(true)}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Candidate
              </button>
            </div>

            {candidates.length === 0 ? (
              <div className="text-center py-12 text-sm text-adv-gray">
                No candidates yet. Add candidates manually or publish the ad to receive applications.
              </div>
            ) : (
              <div className="space-y-2">
                {candidates.map(c => {
                  const st = STATUS_LABELS[c.status] ?? STATUS_LABELS.new;
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-adv-off-white">{c.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>
                            {st.label}
                          </span>
                          {c.is_internal && (
                            <span className="rounded-full bg-adv-blue/20 px-2 py-0.5 text-xs font-medium text-adv-blue">
                              Internal
                            </span>
                          )}
                          {c.is_wildcard && (
                            <span className="rounded-full bg-adv-gold/20 px-2 py-0.5 text-xs font-medium text-adv-gold">
                              Wild Card
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-adv-gray">
                          {c.email && <span>{c.email}</span>}
                          <span className="capitalize">{c.source.replace('_', ' ')}</span>
                        </div>
                      </div>
                      {c.composite_score !== null && (
                        <div className="text-right">
                          <div className={`text-lg font-bold ${c.composite_score >= 75 ? 'text-adv-green' : c.composite_score >= 55 ? 'text-adv-gold' : 'text-adv-red'}`}>
                            {c.composite_score}%
                          </div>
                          <div className="text-xs text-adv-gray">Score</div>
                        </div>
                      )}
                      <button
                        onClick={() => selectCandidateForAssessment(c.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-adv-teal/40 px-3 py-1.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/10"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        {c.composite_score !== null ? 'View' : 'Assess'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Scoring Tab ───────────────────────────────────────── */}
        {activeTab === 'scoring' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-adv-off-white">
                  Assessment Framework ({dimensions.length} dimensions)
                </h3>
                <p className="text-xs text-adv-gray mt-1">
                  Total weight: {totalWeight}% {totalWeight !== 100 && <span className="text-adv-gold">(should be 100%)</span>}
                </p>
              </div>
              <button
                onClick={() => setShowAddDim(true)}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Dimension
              </button>
            </div>

            {dimensions.length === 0 ? (
              <div className="text-center py-12 text-sm text-adv-gray">
                No scoring dimensions defined yet. Add dimensions to create the Assessment Framework.
              </div>
            ) : (
              <div className="space-y-2">
                {dimensions.map(d => (
                  <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-adv-off-white">{d.name}</span>
                        <span className="rounded-full bg-adv-gray/10 px-2 py-0.5 text-xs text-adv-gray capitalize">
                          {d.category.replace('_', ' ')}
                        </span>
                      </div>
                      {d.knockout_minimum && (
                        <div className="text-xs text-adv-gold mt-1">
                          Knockout minimum: {d.knockout_minimum}/5
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-adv-teal">{d.weight}%</div>
                    </div>
                    {/* Weight bar */}
                    <div className="w-20 h-2 rounded-full bg-adv-dark overflow-hidden">
                      <div className="h-full rounded-full bg-adv-teal" style={{ width: `${Math.min(d.weight, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Assessments Tab ───────────────────────────────────── */}
        {activeTab === 'assessments' && (
          <div className="space-y-4">
            {/* Candidate picker */}
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-adv-off-white">Dual-model candidate assessment</h3>
                  <p className="text-xs text-adv-gray mt-1">
                    A primary assessor scores against your published framework; an independent
                    second model audits that scoring for bias. Final hiring decisions stay with you (EU AI Act Art. 14).
                  </p>
                </div>
                <select
                  value={selectedCandidateId ?? ''}
                  onChange={e => {
                    const id = e.target.value || null;
                    setSelectedCandidateId(id);
                    if (id) void loadAssessments(id);
                    else setAssessments([]);
                  }}
                  className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none max-w-[14rem]"
                >
                  <option value="">Select a candidate…</option>
                  {candidates.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {selectedCandidateId && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => runAssessment(selectedCandidateId)}
                    disabled={assessingId === selectedCandidateId || dimensions.length === 0}
                    className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
                  >
                    {assessingId === selectedCandidateId
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Assessing…</>
                      : <><Sparkles className="h-4 w-4" /> {assessments.length > 0 ? 'Re-run assessment' : 'Run assessment'}</>}
                  </button>
                  {dimensions.length === 0 && (
                    <span className="text-xs text-adv-gold">Define scoring dimensions first (Scoring tab).</span>
                  )}
                  {assessingId === selectedCandidateId && (
                    <span className="text-xs text-adv-gray">Running primary assessor + bias auditor — this can take a moment.</span>
                  )}
                </div>
              )}

              {assessError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 px-3 py-2 text-xs text-adv-red">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{assessError}</span>
                </div>
              )}
            </div>

            {/* No selection */}
            {!selectedCandidateId && (
              <div className="text-center py-10 text-sm text-adv-gray">
                Select a candidate above, or use the <span className="text-adv-teal">Assess</span> button on the Candidates tab.
              </div>
            )}

            {/* Loading */}
            {selectedCandidateId && loadingAssessments && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-adv-teal" />
              </div>
            )}

            {/* Empty (selected, loaded, no assessment yet) */}
            {selectedCandidateId && !loadingAssessments && assessments.length === 0 && !assessError && (
              <div className="text-center py-10 text-sm text-adv-gray">
                No assessment yet for this candidate. Click <span className="text-adv-teal">Run assessment</span> to score them.
              </div>
            )}

            {/* Results */}
            {selectedCandidateId && !loadingAssessments && assessments.length > 0 && (() => {
              const primary = assessments.find(a => a.assessor_type === 'primary');
              const bias = assessments.find(a => a.assessor_type === 'bias_auditor');
              const dimScores = primary ? parseJsonField<DimensionScore[]>(primary.dimension_scores, []) : [];
              const uncertainties = primary ? parseJsonField<Uncertainty[]>(primary.uncertainties, []) : [];
              const biasFindings = bias ? parseJsonField<BiasFinding[]>(bias.bias_findings, []) : [];
              const drift = bias ? parseJsonField<FrameworkDriftCheck | null>(bias.framework_drift_check, null) : null;
              const composite = primary?.composite_percentage ?? null;
              const sevColor = (s: string) =>
                s === 'high' ? 'text-adv-red bg-adv-red/10 border-adv-red/40'
                : s === 'medium' ? 'text-adv-gold bg-adv-gold/10 border-adv-gold/40'
                : 'text-adv-gray bg-adv-gray/10 border-border';

              return (
                <div className="space-y-4">
                  {/* ── Primary assessment ─────────────────────────── */}
                  {primary && (
                    <div className="rounded-xl border border-border bg-adv-card p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="h-4 w-4 text-adv-teal" />
                          <h3 className="text-sm font-medium text-adv-off-white">Primary assessment</h3>
                          {primary.model_used && (
                            <span className="text-xs text-adv-blue">{primary.model_used}</span>
                          )}
                        </div>
                        {composite !== null && (
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${composite >= 75 ? 'text-adv-green' : composite >= 55 ? 'text-adv-gold' : 'text-adv-red'}`}>
                              {composite}%
                            </div>
                            <div className="text-xs text-adv-gray">
                              Composite{primary.confidence != null && ` · confidence ${Math.round(primary.confidence * 100)}%`}
                            </div>
                          </div>
                        )}
                      </div>

                      {primary.wild_card_flag && (
                        <div className="mb-3 flex items-start gap-2 rounded-lg border border-adv-gold/40 bg-adv-gold/10 px-3 py-2 text-xs text-adv-gold">
                          <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                          <span><strong>Wild card.</strong> {primary.wild_card_reasoning ?? 'Unconventional profile worth a closer look.'}</span>
                        </div>
                      )}

                      {/* Dimension scores */}
                      {dimScores.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {dimScores.map((d, i) => (
                            <div key={i} className="rounded-lg border border-border bg-adv-dark px-3 py-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-adv-off-white">{d.dimension}</span>
                                <span className="text-sm font-bold text-adv-teal">{d.score}/5</span>
                              </div>
                              {d.reasoning && <p className="text-xs text-adv-gray mt-1">{d.reasoning}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Overall reasoning */}
                      {primary.reasoning && (
                        <div className="mb-3">
                          <h4 className="text-xs font-medium text-adv-gray uppercase tracking-wide mb-1">Reasoning</h4>
                          <p className="text-sm text-adv-gray whitespace-pre-wrap">{primary.reasoning}</p>
                        </div>
                      )}

                      {/* Stated uncertainties */}
                      {uncertainties.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-adv-gray uppercase tracking-wide mb-1">Stated uncertainties</h4>
                          <ul className="space-y-1">
                            {uncertainties.map((u, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-adv-gray">
                                <span className="text-adv-gold mt-0.5">•</span>
                                <span>
                                  <strong className="text-adv-off-white">{u.dimension}:</strong> {u.description}
                                  {u.followupRecommended && <span className="text-adv-blue"> (follow-up recommended)</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {primary.thinking_trace && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-adv-blue">Show reasoning trace</summary>
                          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-adv-dark p-3 text-xs text-adv-gray whitespace-pre-wrap">{primary.thinking_trace}</pre>
                        </details>
                      )}
                    </div>
                  )}

                  {/* ── Independent bias auditor ───────────────────── */}
                  {bias && (
                    <div className="rounded-xl border border-border bg-adv-card p-5">
                      <div className="flex items-center gap-2 mb-3">
                        {biasFindings.some(f => f.severity === 'high')
                          ? <ShieldAlert className="h-4 w-4 text-adv-red" />
                          : <ShieldCheck className="h-4 w-4 text-adv-green" />}
                        <h3 className="text-sm font-medium text-adv-off-white">Independent bias auditor</h3>
                        {bias.model_used && <span className="text-xs text-adv-blue">{bias.model_used}</span>}
                      </div>

                      <p className="text-xs text-adv-gray mb-3">
                        A second model — independent of the assessor — reviewed the scoring for proxy
                        discrimination, framework drift, consistency, and language bias.
                      </p>

                      {/* Framework alignment verdict */}
                      {drift && (
                        <div className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                          drift.aligned
                            ? 'border-adv-green/40 bg-adv-green/10 text-adv-green'
                            : 'border-adv-gold/40 bg-adv-gold/10 text-adv-gold'}`}>
                          {drift.aligned ? <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" /> : <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />}
                          <span>
                            <strong>{drift.aligned ? 'Aligned with the published framework.' : 'Possible framework drift.'}</strong>
                            {drift.deviations.length > 0 && <> Deviations: {drift.deviations.join('; ')}</>}
                          </span>
                        </div>
                      )}

                      {/* Findings */}
                      {biasFindings.length > 0 ? (
                        <div className="space-y-2">
                          {biasFindings.map((f, i) => (
                            <div key={i} className={`rounded-lg border px-3 py-2 ${sevColor(f.severity)}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium capitalize">{f.type.replace(/_/g, ' ')}</span>
                                <span className="text-xs font-bold uppercase">{f.severity}</span>
                              </div>
                              <p className="text-xs mt-1 opacity-90">{f.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-adv-green">
                          <ShieldCheck className="h-4 w-4" />
                          No bias findings raised by the auditor.
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Human decision (Art. 14) ───────────────────── */}
                  <div className="rounded-xl border border-adv-blue/30 bg-adv-blue/5 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Gavel className="h-4 w-4 text-adv-blue" />
                      <h3 className="text-sm font-medium text-adv-off-white">Human oversight (EU AI Act Art. 14)</h3>
                    </div>
                    <p className="text-xs text-adv-gray mb-3">
                      This AI assessment is advisory. A human must make the final candidate-affecting decision.
                      Recording your review logs it to the audit trail for accountability.
                    </p>
                    {decisionDone ? (
                      <div className="flex items-center gap-2 text-sm text-adv-green">
                        <Check className="h-4 w-4" /> Human review recorded in the audit trail.
                      </div>
                    ) : (
                      <button
                        onClick={() => recordHumanReview(selectedCandidateId)}
                        disabled={recordingDecision}
                        className="flex items-center gap-2 rounded-lg border border-adv-blue/50 px-4 py-2 text-sm font-medium text-adv-blue hover:bg-adv-blue/10 disabled:opacity-50"
                      >
                        {recordingDecision ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
                        Record human review
                      </button>
                    )}
                    <p className="text-[11px] text-adv-gray/60 mt-2">
                      Last assessed: {assessments[0]?.assessed_at ? new Date(assessments[0].assessed_at).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Shortlist Tab ─────────────────────────────────────── */}
        {activeTab === 'shortlist' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="text-sm font-medium text-adv-off-white mb-2">Shortlist Management</h3>
              <p className="text-sm text-adv-gray">
                Shortlist and interview preparation coming in Session 5. Will include drag-to-shortlist,
                comparative analysis, and AI-generated interview questions.
              </p>
            </div>
          </div>
        )}

        {/* ── Audit Trail Tab ───────────────────────────────────── */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-adv-off-white">
              Audit Trail ({auditTrail.length} entries)
            </h3>
            <p className="text-xs text-adv-gray">
              EU AI Act Art. 12 — Every AI-assisted action is logged for transparency and accountability.
            </p>

            {auditTrail.length === 0 ? (
              <div className="text-center py-12 text-sm text-adv-gray">
                No audit entries yet.
              </div>
            ) : (
              <div className="space-y-1">
                {auditTrail.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-border bg-adv-card px-4 py-2.5">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-adv-teal shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-adv-off-white">{entry.action.replace(/_/g, ' ')}</span>
                        {entry.ai_model && (
                          <span className="text-xs text-adv-blue">{entry.ai_model}</span>
                        )}
                        {entry.eu_ai_act_category && (
                          <span className="text-xs text-adv-gold">{entry.eu_ai_act_category}</span>
                        )}
                      </div>
                      {entry.action_detail && (
                        <p className="text-xs text-adv-gray mt-0.5">{entry.action_detail}</p>
                      )}
                      <div className="text-xs text-adv-gray/60 mt-0.5">
                        {entry.actor} &middot; {new Date(entry.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Candidate Modal */}
      {showAddCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-border bg-adv-dark-2 p-6">
            <h2 className="mb-4 text-lg font-semibold text-adv-off-white">Add Candidate</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">Name <span className="text-adv-red">*</span></label>
                <input type="text" value={newCandName} onChange={e => setNewCandName(e.target.value)}
                  placeholder="Full name" autoFocus
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">Email</label>
                <input type="email" value={newCandEmail} onChange={e => setNewCandEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">Source</label>
                <select value={newCandSource} onChange={e => setNewCandSource(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                  <option value="direct">Direct Application</option>
                  <option value="referral">Referral</option>
                  <option value="agency">Agency</option>
                  <option value="internal">Internal</option>
                  <option value="ad_response">Ad Response</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => { setShowAddCandidate(false); setNewCandName(''); setNewCandEmail(''); }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
              <button onClick={addCandidate} disabled={!newCandName.trim() || addingCandidate}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
                {addingCandidate ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Dimension Modal */}
      {showAddDim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-border bg-adv-dark-2 p-6">
            <h2 className="mb-4 text-lg font-semibold text-adv-off-white">Add Scoring Dimension</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-adv-gray">Dimension Name <span className="text-adv-red">*</span></label>
                <input type="text" value={newDimName} onChange={e => setNewDimName(e.target.value)}
                  placeholder="e.g., Technical Skills, Domain Experience" autoFocus
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-adv-gray">Weight (%)</label>
                  <input type="number" min="1" max="100" value={newDimWeight} onChange={e => setNewDimWeight(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-adv-gray">Category</label>
                  <select value={newDimCategory} onChange={e => setNewDimCategory(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                    <option value="technical">Technical</option>
                    <option value="experience">Experience</option>
                    <option value="education">Education</option>
                    <option value="team_complementarity">Team Fit</option>
                    <option value="problem_solving">Problem Solving</option>
                    <option value="leadership">Leadership</option>
                    <option value="growth_potential">Growth Potential</option>
                    <option value="cultural">Cultural</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => { setShowAddDim(false); setNewDimName(''); }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
              <button onClick={addDimension} disabled={!newDimName.trim() || addingDim}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
                {addingDim ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Dimension
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
