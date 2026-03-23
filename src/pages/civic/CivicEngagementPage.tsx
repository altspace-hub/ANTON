/**
 * CivicEngagementPage.tsx
 *
 * Diagnostic flow wizard for a single civic engagement.
 * Six phases: Situation -> Mapping -> Eligibility -> Gap -> Complete -> Track
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Landmark,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  Send,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface CivicEngagement {
  id: string;
  title: string;
  goal: string | null;
  jurisdiction: string | null;
  domain: string | null;
  phase: Phase;
  urgency: string;
  created_at: string;
  updated_at: string;
}

interface GovProcess {
  id: string;
  engagement_id: string;
  authority: string;
  name: string;
  description: string | null;
  sequence: number;
  estimated_duration: string | null;
}

interface EligibilityCriterion {
  id: string;
  process_id: string;
  label: string;
  description: string | null;
  met: boolean;
}

interface RequiredDocument {
  id: string;
  engagement_id: string;
  process_id: string | null;
  name: string;
  description: string | null;
  status: 'needed' | 'in_progress' | 'ready' | 'submitted';
}

interface Submission {
  id: string;
  engagement_id: string;
  process_id: string;
  process_name: string;
  reference_number: string | null;
  submitted_at: string | null;
  deadline: string | null;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'returned';
  notes: string | null;
}

type Phase = 'situation' | 'mapping' | 'eligibility' | 'gap' | 'complete' | 'track';

// ── Constants ────────────────────────────────────────────────────────

const PHASES: { key: Phase; label: string }[] = [
  { key: 'situation',   label: 'Situation' },
  { key: 'mapping',     label: 'Mapping' },
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'gap',         label: 'Gap' },
  { key: 'complete',    label: 'Complete' },
  { key: 'track',       label: 'Track' },
];

const DOC_STATUS_STYLES: Record<string, { label: string; color: string }> = {
  needed:      { label: 'Needed',      color: 'text-adv-red bg-adv-red/10 border-adv-red/30' },
  in_progress: { label: 'In Progress', color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
  ready:       { label: 'Ready',       color: 'text-adv-green bg-adv-green/10 border-adv-green/30' },
  submitted:   { label: 'Submitted',   color: 'text-adv-teal bg-adv-teal-dim border-adv-teal/30' },
};

const SUBMISSION_STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft:        { label: 'Draft',        color: 'text-adv-gray bg-adv-dark border-border' },
  submitted:    { label: 'Submitted',    color: 'text-adv-blue bg-adv-blue/10 border-adv-blue/30' },
  under_review: { label: 'Under Review', color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
  approved:     { label: 'Approved',     color: 'text-adv-green bg-adv-green/10 border-adv-green/30' },
  rejected:     { label: 'Rejected',     color: 'text-adv-red bg-adv-red/10 border-adv-red/30' },
  returned:     { label: 'Returned',     color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
};

const JURISDICTIONS = [
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Iceland',
  'United Kingdom', 'Germany', 'France', 'Netherlands', 'Belgium',
  'United States', 'Canada', 'Australia', 'EU (cross-border)', 'Other',
];

const DOMAINS = [
  'Building & Planning', 'Tax & Revenue', 'Immigration',
  'Social Services', 'Healthcare', 'Education',
  'Business Registration', 'Environmental', 'Transport',
  'Justice & Legal', 'Employment', 'Pensions',
  'Property & Land', 'Licensing & Permits', 'Other',
];

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────────

export default function CivicEngagementPage() {
  const { engagementId } = useParams<{ engagementId: string }>();
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────

  const [engagement, setEngagement] = useState<CivicEngagement | null>(null);
  const [processes, setProcesses] = useState<GovProcess[]>([]);
  const [documents, setDocuments] = useState<RequiredDocument[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, EligibilityCriterion[]>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<Phase>('situation');
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(new Set());

  // Situation form state
  const [editGoal, setEditGoal] = useState('');
  const [editJurisdiction, setEditJurisdiction] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [docGenerating, setDocGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────

  const loadEngagement = useCallback(async () => {
    if (!engagementId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/civic/engagements/${engagementId}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error('Failed to load engagement');
      const data: CivicEngagement = await res.json();
      setEngagement(data);
      setActivePhase(data.phase);
      setEditGoal(data.goal ?? '');
      setEditJurisdiction(data.jurisdiction ?? '');
      setEditDomain(data.domain ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load engagement');
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  const loadProcesses = useCallback(async () => {
    if (!engagementId) return;
    try {
      const res = await fetch(`/api/civic/engagements/${engagementId}/processes`, {
        headers: getAuthHeader(),
      });
      if (res.ok) setProcesses(await res.json());
    } catch { /* ignore */ }
  }, [engagementId]);

  const loadDocuments = useCallback(async () => {
    if (!engagementId) return;
    try {
      const res = await fetch(`/api/civic/engagements/${engagementId}/documents`, {
        headers: getAuthHeader(),
      });
      if (res.ok) setDocuments(await res.json());
    } catch { /* ignore */ }
  }, [engagementId]);

  const loadSubmissions = useCallback(async () => {
    if (!engagementId) return;
    try {
      const res = await fetch(`/api/civic/engagements/${engagementId}/submissions`, {
        headers: getAuthHeader(),
      });
      if (res.ok) setSubmissions(await res.json());
    } catch { /* ignore */ }
  }, [engagementId]);

  const loadEligibility = useCallback(async (processId: string) => {
    try {
      const res = await fetch(`/api/civic/processes/${processId}/eligibility`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const criteria: EligibilityCriterion[] = await res.json();
        setEligibilityMap((prev) => ({ ...prev, [processId]: criteria }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadEngagement();
    loadProcesses();
    loadDocuments();
    loadSubmissions();
  }, [loadEngagement, loadProcesses, loadDocuments, loadSubmissions]);

  // ── Handlers ───────────────────────────────────────────────────────

  function toggleProcessExpanded(processId: string) {
    setExpandedProcesses((prev) => {
      const next = new Set(prev);
      if (next.has(processId)) {
        next.delete(processId);
      } else {
        next.add(processId);
        if (!eligibilityMap[processId]) {
          loadEligibility(processId);
        }
      }
      return next;
    });
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      // Save current form state
      await fetchWithAuth(`/api/civic/engagements/${engagementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editGoal.trim() || null,
          jurisdiction: editJurisdiction || null,
          domain: editDomain || null,
        }),
      });

      // Call AI analysis endpoint
      const context = `Goal: ${editGoal}\nJurisdiction: ${editJurisdiction || 'Not specified'}\nDomain: ${editDomain || 'General'}\n\nAnalyze this civic situation. Identify the relevant government processes, authorities involved, typical timelines, required documents, and eligibility criteria. Provide a step-by-step action plan.`;
      const res = await fetchWithAuth('/api/civic/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptType: 'situation', context }),
      });

      if (res.ok) {
        // Read SSE stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const evt = JSON.parse(line.slice(6));
                  if (evt.delta?.text) fullText += evt.delta.text;
                } catch {}
              }
            }
            setAiAnalysis(fullText);
          }
        }
      }

      await loadEngagement();
    } finally {
      setAnalyzing(false);
    }
  }

  function phaseIndex(phase: Phase): number {
    return PHASES.findIndex((p) => p.key === phase);
  }

  function canNavigateTo(phase: Phase): boolean {
    if (!engagement) return false;
    const engIdx = phaseIndex(engagement.phase);
    const targetIdx = phaseIndex(phase);
    // Can visit current phase and all prior phases, plus one ahead
    return targetIdx <= engIdx + 1;
  }

  function goToPhase(phase: Phase) {
    if (canNavigateTo(phase)) setActivePhase(phase);
  }

  function goNext() {
    const idx = phaseIndex(activePhase);
    if (idx < PHASES.length - 1) {
      const next = PHASES[idx + 1].key;
      if (canNavigateTo(next)) setActivePhase(next);
    }
  }

  function goPrev() {
    const idx = phaseIndex(activePhase);
    if (idx > 0) setActivePhase(PHASES[idx - 1].key);
  }

  // ── Loading / error states ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (error || !engagement) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <AlertCircle className="h-8 w-8 text-adv-red mx-auto mb-3" />
        <p className="mb-4 text-adv-red">{error ?? 'Engagement not found'}</p>
        <button
          onClick={() => navigate('/civic')}
          className="rounded-lg bg-adv-teal px-5 py-2 font-semibold text-adv-dark hover:bg-adv-teal-dark"
        >
          Back to Civic
        </button>
      </div>
    );
  }

  // ── Phase content renderers ────────────────────────────────────────

  function renderSituation() {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-adv-off-white mb-3">
            Describe your situation
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-adv-gray mb-1">Goal</label>
              <textarea
                value={editGoal}
                onChange={(e) => setEditGoal(e.target.value)}
                placeholder="What are you trying to accomplish? e.g. I want to apply for a building permit to extend my house..."
                rows={4}
                className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-adv-gray mb-1">Jurisdiction</label>
              <select
                value={editJurisdiction}
                onChange={(e) => setEditJurisdiction(e.target.value)}
                className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
              >
                <option value="">Select jurisdiction...</option>
                {JURISDICTIONS.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-adv-gray mb-1">Domain</label>
              <select
                value={editDomain}
                onChange={(e) => setEditDomain(e.target.value)}
                className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
              >
                <option value="">Select domain...</option>
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={analyzing || !editGoal.trim()}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Analyze Situation
        </button>

        {aiAnalysis && (
          <div className="mt-4 rounded-lg border border-adv-teal/30 bg-adv-dark p-4">
            <h3 className="text-xs font-semibold uppercase text-adv-teal mb-2">AI Analysis</h3>
            <div className="prose prose-invert prose-sm max-w-none text-adv-off-white whitespace-pre-wrap text-sm leading-relaxed">
              {aiAnalysis}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderMapping() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-adv-off-white">
            Government Processes
          </h3>
          <button className="flex items-center gap-1 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Add Process
          </button>
        </div>

        {processes.length === 0 ? (
          <div className="text-center py-12">
            <Landmark className="h-10 w-10 text-adv-gray mx-auto mb-3" />
            <p className="text-sm text-adv-gray">
              No processes identified yet. Run the Situation analysis to auto-detect processes, or add them manually.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {processes
              .sort((a, b) => a.sequence - b.sequence)
              .map((proc, idx) => (
                <div
                  key={proc.id}
                  className="bg-adv-dark-2 border border-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-xs font-bold text-adv-teal">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-adv-off-white text-sm">{proc.name}</h4>
                        <p className="text-xs text-adv-gray mt-0.5">{proc.authority}</p>
                        {proc.description && (
                          <p className="text-xs text-adv-gray mt-1">{proc.description}</p>
                        )}
                        {proc.estimated_duration && (
                          <p className="text-xs text-adv-gray mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Est. {proc.estimated_duration}
                          </p>
                        )}
                      </div>
                    </div>
                    <button className="p-1 text-adv-gray hover:text-adv-red transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  function renderEligibility() {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-adv-off-white">
          Eligibility Checks
        </h3>

        {processes.length === 0 ? (
          <p className="text-sm text-adv-gray py-8 text-center">
            Complete the Mapping phase first to identify processes.
          </p>
        ) : (
          <div className="space-y-3">
            {processes.map((proc) => {
              const isExpanded = expandedProcesses.has(proc.id);
              const criteria = eligibilityMap[proc.id] ?? [];
              const metCount = criteria.filter((c) => c.met).length;

              return (
                <div
                  key={proc.id}
                  className="bg-adv-dark-2 border border-border rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => toggleProcessExpanded(proc.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-adv-card/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-adv-off-white">{proc.name}</span>
                      {criteria.length > 0 && (
                        <span className="text-xs text-adv-gray">
                          {metCount}/{criteria.length} met
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-adv-gray" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-adv-gray" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 space-y-2">
                      {criteria.length === 0 ? (
                        <p className="text-xs text-adv-gray">
                          No eligibility criteria loaded yet.
                        </p>
                      ) : (
                        criteria.map((crit) => (
                          <div
                            key={crit.id}
                            className="flex items-start gap-2 py-1"
                          >
                            {crit.met ? (
                              <CheckCircle className="h-4 w-4 shrink-0 text-adv-green mt-0.5" />
                            ) : (
                              <XCircle className="h-4 w-4 shrink-0 text-adv-red mt-0.5" />
                            )}
                            <div>
                              <p className="text-sm text-adv-off-white">{crit.label}</p>
                              {crit.description && (
                                <p className="text-xs text-adv-gray mt-0.5">{crit.description}</p>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderGap() {
    const docsByStatus = {
      needed: documents.filter((d) => d.status === 'needed'),
      in_progress: documents.filter((d) => d.status === 'in_progress'),
      ready: documents.filter((d) => d.status === 'ready'),
      submitted: documents.filter((d) => d.status === 'submitted'),
    };

    return (
      <div className="space-y-6">
        <h3 className="text-sm font-semibold text-adv-off-white">
          Gap Analysis
        </h3>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-adv-dark-2 border border-border rounded-xl p-4">
            <p className="text-xs text-adv-gray uppercase tracking-wider mb-1">Documents Needed</p>
            <p className="text-xl font-bold text-adv-red">{docsByStatus.needed.length}</p>
          </div>
          <div className="bg-adv-dark-2 border border-border rounded-xl p-4">
            <p className="text-xs text-adv-gray uppercase tracking-wider mb-1">Ready</p>
            <p className="text-xl font-bold text-adv-green">
              {docsByStatus.ready.length + docsByStatus.submitted.length}
            </p>
          </div>
        </div>

        {/* Documents list */}
        {documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-10 w-10 text-adv-gray mx-auto mb-3" />
            <p className="text-sm text-adv-gray">
              No document requirements identified yet. Complete prior phases to generate gap analysis.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const statusStyle = DOC_STATUS_STYLES[doc.status] || DOC_STATUS_STYLES.needed;
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between bg-adv-dark-2 border border-border rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-adv-gray" />
                    <div className="min-w-0">
                      <p className="text-sm text-adv-off-white truncate">{doc.name}</p>
                      {doc.description && (
                        <p className="text-xs text-adv-gray truncate">{doc.description}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${statusStyle.color}`}
                  >
                    {statusStyle.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderComplete() {
    return (
      <div className="space-y-6">
        <h3 className="text-sm font-semibold text-adv-off-white">
          Document Preparation
        </h3>

        <p className="text-sm text-adv-gray">
          Prepare and generate required documents for submission. Documents marked "Ready" can be included in your submission package.
        </p>

        {documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-10 w-10 text-adv-gray mx-auto mb-3" />
            <p className="text-sm text-adv-gray">
              No documents to prepare. Complete the Gap phase first.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => {
              const statusStyle = DOC_STATUS_STYLES[doc.status] || DOC_STATUS_STYLES.needed;
              return (
                <div
                  key={doc.id}
                  className="bg-adv-dark-2 border border-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <FileText className="h-5 w-5 shrink-0 text-adv-gray mt-0.5" />
                      <div className="min-w-0">
                        <h4 className="text-sm font-medium text-adv-off-white">{doc.name}</h4>
                        {doc.description && (
                          <p className="text-xs text-adv-gray mt-1">{doc.description}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${statusStyle.color}`}
                    >
                      {statusStyle.label}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={async () => {
                        setDocGenerating(true);
                        setGeneratedDoc(null);
                        try {
                          const context = `Civic engagement: ${engagement?.title || ''}\nJurisdiction: ${engagement?.jurisdiction || ''}\nDomain: ${engagement?.domain || ''}\n\nGenerate the required document content for this civic/government process. Include all necessary sections, fields, and instructions.`;
                          const res = await fetchWithAuth('/api/civic/ai/analyze', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ promptType: 'documents', context }),
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
                                setGeneratedDoc(text);
                              }
                            }
                          }
                        } finally { setDocGenerating(false); }
                      }}
                      disabled={docGenerating}
                      className="flex items-center gap-1 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors px-2 py-1 rounded border border-adv-teal/30 hover:bg-adv-teal-dim disabled:opacity-50"
                    >
                      {docGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {docGenerating ? 'Generating...' : 'Generate with AI'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {generatedDoc && (
          <div className="mt-4 rounded-lg border border-adv-teal/30 bg-adv-dark p-4">
            <h3 className="text-xs font-semibold uppercase text-adv-teal mb-2">AI-Generated Document</h3>
            <div className="text-sm text-adv-off-white whitespace-pre-wrap leading-relaxed">{generatedDoc}</div>
          </div>
        )}
      </div>
    );
  }

  function renderTrack() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-adv-off-white">
            Active Submissions
          </h3>
          <button className="flex items-center gap-1 text-xs text-adv-teal hover:text-adv-teal-dark transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Record Submission
          </button>
        </div>

        {submissions.length === 0 ? (
          <div className="text-center py-12">
            <Send className="h-10 w-10 text-adv-gray mx-auto mb-3" />
            <p className="text-sm text-adv-gray">
              No submissions recorded yet. Submit your completed documents to begin tracking.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((sub) => {
              const statusStyle =
                SUBMISSION_STATUS_STYLES[sub.status] || SUBMISSION_STATUS_STYLES.draft;
              return (
                <div
                  key={sub.id}
                  className="bg-adv-dark-2 border border-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-medium text-adv-off-white">
                          {sub.process_name}
                        </h4>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyle.color}`}
                        >
                          {statusStyle.label}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-adv-gray">
                        {sub.reference_number && (
                          <span>Ref: {sub.reference_number}</span>
                        )}
                        {sub.submitted_at && (
                          <span>Submitted: {formatDate(sub.submitted_at)}</span>
                        )}
                        {sub.deadline && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Deadline: {formatDate(sub.deadline)}
                          </span>
                        )}
                      </div>
                      {sub.notes && (
                        <p className="mt-2 text-xs text-adv-gray">{sub.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const PHASE_RENDERERS: Record<Phase, () => React.ReactNode> = {
    situation: renderSituation,
    mapping: renderMapping,
    eligibility: renderEligibility,
    gap: renderGap,
    complete: renderComplete,
    track: renderTrack,
  };

  // ── Render ─────────────────────────────────────────────────────────

  const currentPhaseIdx = phaseIndex(activePhase);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Back nav + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/civic')}
          className="flex items-center gap-1 text-sm text-adv-gray hover:text-adv-teal transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Landmark className="h-5 w-5 text-adv-teal shrink-0" />
          <h1 className="text-lg font-bold text-adv-white truncate">{engagement.title}</h1>
        </div>
      </div>

      {/* Flow stepper */}
      <div className="bg-adv-card border border-border rounded-xl p-4">
        <div className="flex items-center">
          {PHASES.map((phase, idx) => {
            const isActive = phase.key === activePhase;
            const isCompleted = idx < phaseIndex(engagement.phase);
            const isCurrent = phase.key === engagement.phase;
            const canNav = canNavigateTo(phase.key);

            return (
              <div key={phase.key} className="flex items-center flex-1">
                <button
                  onClick={() => goToPhase(phase.key)}
                  disabled={!canNav}
                  className={`flex flex-col items-center gap-1.5 flex-1 transition-colors ${
                    canNav ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                      isActive
                        ? 'bg-adv-teal border-adv-teal text-adv-dark'
                        : isCompleted
                          ? 'bg-adv-green/20 border-adv-green text-adv-green'
                          : isCurrent
                            ? 'bg-adv-teal-dim border-adv-teal/50 text-adv-teal'
                            : 'bg-adv-dark-2 border-border text-adv-gray'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isActive ? 'text-adv-teal' : isCompleted ? 'text-adv-green' : 'text-adv-gray'
                    }`}
                  >
                    {phase.label}
                  </span>
                </button>
                {idx < PHASES.length - 1 && (
                  <div
                    className={`h-px flex-1 mx-1 ${
                      isCompleted ? 'bg-adv-green/40' : 'bg-border'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main content: phase content + info panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Phase content */}
        <div className="lg:col-span-2 bg-adv-card border border-border rounded-xl p-6">
          {PHASE_RENDERERS[activePhase]()}
        </div>

        {/* Info panel */}
        <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4 h-fit">
          <h3 className="text-xs font-semibold text-adv-gray uppercase tracking-wider">
            Engagement Summary
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-adv-gray">Title</p>
              <p className="text-adv-off-white">{engagement.title}</p>
            </div>
            {engagement.goal && (
              <div>
                <p className="text-xs text-adv-gray">Goal</p>
                <p className="text-adv-off-white line-clamp-3">{engagement.goal}</p>
              </div>
            )}
            {engagement.jurisdiction && (
              <div>
                <p className="text-xs text-adv-gray">Jurisdiction</p>
                <p className="text-adv-off-white">{engagement.jurisdiction}</p>
              </div>
            )}
            {engagement.domain && (
              <div>
                <p className="text-xs text-adv-gray">Domain</p>
                <p className="text-adv-off-white">{engagement.domain}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-adv-gray">Current Phase</p>
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full border border-adv-teal/30 text-adv-teal">
                {PHASES.find(p => p.key === engagement.phase)?.label || engagement.phase}
              </span>
            </div>
            <div>
              <p className="text-xs text-adv-gray">Processes</p>
              <p className="text-adv-off-white">{processes.length}</p>
            </div>
            <div>
              <p className="text-xs text-adv-gray">Documents</p>
              <p className="text-adv-off-white">{documents.length}</p>
            </div>
            <div>
              <p className="text-xs text-adv-gray">Created</p>
              <p className="text-adv-off-white">{formatDate(engagement.created_at)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Phase navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={goPrev}
          disabled={currentPhaseIdx === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-lg border border-border text-sm text-adv-gray hover:text-adv-off-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {currentPhaseIdx > 0 ? PHASES[currentPhaseIdx - 1].label : 'Previous'}
        </button>
        <span className="text-xs text-adv-gray">
          Step {currentPhaseIdx + 1} of {PHASES.length}
        </span>
        <button
          onClick={goNext}
          disabled={currentPhaseIdx >= PHASES.length - 1 || !canNavigateTo(PHASES[currentPhaseIdx + 1]?.key)}
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-adv-teal text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {currentPhaseIdx < PHASES.length - 1 ? PHASES[currentPhaseIdx + 1].label : 'Next'}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
