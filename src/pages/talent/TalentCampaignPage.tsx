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
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="text-sm font-medium text-adv-off-white mb-2">Candidate Assessment</h3>
              <p className="text-sm text-adv-gray">
                Assessment engine coming in Session 4. Will include dual-model assessment (primary + bias auditor),
                scoring against the published framework, wild card detection, and follow-up question generation.
              </p>
            </div>
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
