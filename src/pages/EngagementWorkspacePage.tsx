/**
 * EngagementWorkspacePage.tsx
 * Main workspace for a single engagement. Shows phase navigation sidebar
 * and renders the current phase component in the main content area.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Loader2, CheckCircle, Circle, AlertCircle,
  Briefcase, FileText, Users, FolderOpen, Star, Settings,
  GitBranch, Play, Search, ShieldCheck, Clock, Link2
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import EngagementSetup from '@/components/engagement/EngagementSetup';
import EngagementScopeAgreement from '@/components/engagement/EngagementScopeAgreement';
import EngagementClientIntelligence from '@/components/engagement/EngagementClientIntelligence';
import EngagementExpertConfig from '@/components/engagement/EngagementExpertConfig';
import EngagementResourceCollection from '@/components/engagement/EngagementResourceCollection';
import EngagementGoodExample from '@/components/engagement/EngagementGoodExample';
import EngagementWorkstreamPlanning from '@/components/engagement/EngagementWorkstreamPlanning';
import EngagementTeamPanel from '@/components/engagement/EngagementTeamPanel';
import EngagementExecution from '@/components/engagement/EngagementExecution';
import EngagementReview from '@/components/engagement/EngagementReview';
import EngagementQualityGate from '@/components/engagement/EngagementQualityGate';

export interface EngagementData {
  id: string;
  title: string;
  engagement_type: 'full' | 'lite';
  status: string;
  your_organisation: string | null;
  client_name: string | null;
  domain_areas: string;
  engagement_brief: string;
  quality_blueprint: string;
  thinking_level: string;
  expert_panel: string;
  review_modes: string;
  knowledge_config: string;
  workstream_plan_confirmed: number;
  enable_as_benchmark: number;
  scope_confirmed_at: string | null;
  documents: EngagementDocument[];
  scope_items: ScopeItem[];
  workstreams: Workstream[];
  resources: Resource[];
  deliverables: Deliverable[];
  boundaries: Boundary[];
  client_intelligence: ClientIntelligence | null;
  iterations: Iteration[];
  stakeholders: Stakeholder[];
  peer_benchmarks: PeerBenchmark[];
  quality_gate: QualityGate | null;
  rag_directory_path: string | null;
  project_id: string | null;
  user_id: string | null;
  updated_at: string;
}

export interface EngagementDocument {
  id: string;
  document_type: 'engagement_letter' | 'project_plan' | 'good_example';
  file_name: string;
  file_path: string;
  extracted_content: string | null;
  extraction_summary: string;
  uploaded_at: string;
}

export interface ScopeItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  workstream_id: string | null;
  methodology: string;
  status: 'confirmed' | 'modified' | 'added' | 'removed';
  sort_order: number;
}

export interface Workstream {
  id: string;
  title: string;
  description: string | null;
  expert_panel: string;
  thinking_level: string | null;
  timeline_start: string | null;
  timeline_end: string | null;
  execution_status: 'pending' | 'blocked' | 'ready' | 'executing' | 'review' | 'completed';
  sort_order: number;
}

export interface Resource {
  id: string;
  category: 'documents' | 'meetings' | 'regulations' | 'data' | 'code' | 'good_example' | 'other';
  title: string;
  file_path: string | null;
  url: string | null;
  status: 'uploaded' | 'processing' | 'reviewed' | 'not_available' | 'coming_later';
  extracted_content: string | null;
  uploaded_at: string;
}

export interface Deliverable {
  id: string;
  title: string;
  format: string | null;
  description: string | null;
  delivery_date: string | null;
  status: string;
}

export interface Boundary {
  id: string;
  boundary_type: 'assumption' | 'exclusion' | 'limitation' | 'risk';
  description: string;
  source: string | null;
}

export interface ClientIntelligence {
  id: string;
  client_name: string;
  division_department: string | null;
  region_jurisdiction: string | null;
  products_in_scope: string;
  regulatory_supervisors: string;
  recent_regulatory_history: string;
  business_model_description: string | null;
  engagement_trigger: string | null;
  client_maturity_signal: string | null;
  sensitivities: string | null;
}

export interface Iteration {
  id: string;
  workstream_id: string | null;
  iteration_number: number;
  output_content: string | null;
  thinking_content: string | null;
  gap_analysis: string;
  confidence_assessment: string;
  status: 'draft' | 'reviewed' | 'approved' | 'superseded';
  expert_reviews?: string | null;
  created_at: string;
}

export interface Stakeholder {
  id: string;
  name: string;
  role: string | null;
  organisation: string | null;
  contact_info: string | null;
  stakeholder_type: 'delivery_team' | 'client_contact' | 'other';
  expertise_areas: string;   // JSON array string
  notes: string | null;
  created_at: string;
}

export interface PeerBenchmark {
  id: string;
  benchmark_type: 'web_search' | 'internal';
  source_engagement_id: string | null;
  anonymized_label: string;
  domain: string | null;
  scope_similarity: string | null;   // descriptive text e.g. "High — matches Nordic bank AML scope"
  maturity_data: string | null;   // JSON
  key_findings: string | null;    // JSON array
  search_query: string | null;
  created_at: string;
}

export interface QualityGate {
  id: string;
  iteration_id: string | null;
  scope_completeness: string | null;    // JSON { score, addressed, partial, missing, notes }
  blueprint_alignment: string | null;   // JSON { score, structure_match, tone_match, deviations, notes }
  cross_consistency: string | null;     // JSON { score, conflicts, notes }
  assumptions_section: string | null;   // text (generated)
  executive_summary: string | null;     // text (generated)
  expert_reviews: string | null;        // JSON { devil_advocate, regulatory, client_perspective, pragmatist }
  overall_score: number | null;
  release_ready: number;   // 0 | 1
  blockers: string | null; // JSON array
  status: string;
  created_at: string;
}

// ── Phase definitions ────────────────────────────────────────────────────────

interface Phase {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  statusKey: string;
  mvp: boolean;
}

const PHASES: Phase[] = [
  { id: 'setup',                label: 'Setup & Context',        shortLabel: 'Setup',          icon: FileText,     statusKey: 'setup',               mvp: true },
  { id: 'team',                 label: 'Team Setup',             shortLabel: 'Team',           icon: Users,        statusKey: 'setup',               mvp: true },
  { id: 'scope_agreement',      label: 'Scope Agreement',        shortLabel: 'Scope',          icon: CheckCircle,  statusKey: 'scope_agreement',     mvp: true },
  { id: 'client_intelligence',  label: 'Client Intelligence',    shortLabel: 'Intelligence',   icon: Users,        statusKey: 'client_intelligence', mvp: true },
  { id: 'expert_config',        label: 'Expert Configuration',   shortLabel: 'Expert Config',  icon: Settings,     statusKey: 'client_intelligence', mvp: true },
  { id: 'resource_collection',  label: 'Resource Collection',    shortLabel: 'Resources',      icon: FolderOpen,   statusKey: 'resource_collection', mvp: true },
  { id: 'good_example',         label: 'Good Example',           shortLabel: 'Blueprint',      icon: Star,         statusKey: 'resource_collection', mvp: true },
  { id: 'workstream_planning',  label: 'Workstream Planning',    shortLabel: 'Plan',           icon: GitBranch,    statusKey: 'resource_collection', mvp: true },
  { id: 'execution',            label: 'Execution',              shortLabel: 'Execute',        icon: Play,         statusKey: 'execution',           mvp: true },
  { id: 'review',               label: 'Review & Iteration',     shortLabel: 'Review',         icon: Search,       statusKey: 'review',              mvp: true },
  { id: 'quality_gate',         label: 'Quality Gate',           shortLabel: 'Quality',        icon: ShieldCheck,  statusKey: 'quality_gate',        mvp: true },
];

const STATUS_PHASE_MAP: Record<string, string> = {
  setup:               'setup',
  scope_agreement:     'scope_agreement',
  client_intelligence: 'client_intelligence',
  configuration:       'expert_config',
  resource_collection: 'resource_collection',
  workstream_planning: 'workstream_planning',
  execution:           'execution',
  review:              'review',
  quality_gate:        'quality_gate',
  completed:           'quality_gate',
};

export default function EngagementWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState('setup');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [showProjectLink, setShowProjectLink] = useState(false);

  useEffect(() => {
    if (id) {
      loadEngagement();
      loadProjects();
    }
  }, [id]);

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects', { headers: getAuthHeader() });
      if (res.ok) setProjects(await res.json());
    } catch { /* ignore */ }
  }

  async function loadEngagement() {
    setLoading(true);
    try {
      const res = await fetch(`/api/engagements/${id}`, { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setEngagement(data);
        // Set active phase from current status
        setActivePhase(STATUS_PHASE_MAP[data.status] || 'setup');
      } else {
        navigate('/engagements');
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!id) return;
    const res = await fetch(`/api/engagements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEngagement(prev => prev ? { ...prev, ...updated } : prev);
    }
  }

  async function linkToProject(projectId: string | null) {
    if (!id) return;
    const res = await fetch(`/api/engagements/${id}/project`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEngagement(prev => prev ? { ...prev, ...updated } : prev);
    }
    setShowProjectLink(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (!engagement) return null;

  const phaseStatuses = getPhaseStatuses(engagement);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Phase navigation sidebar */}
      <div className="w-56 shrink-0 bg-adv-dark-2 border-r border-border flex flex-col">
        {/* Back button + title */}
        <div className="px-4 py-4 border-b border-border">
          <button
            onClick={() => navigate('/engagements')}
            className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors mb-3"
          >
            <ChevronLeft className="h-3 w-3" />
            All Engagements
          </button>
          <div className="flex items-start gap-2">
            <Briefcase className="h-4 w-4 text-adv-teal shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-adv-off-white leading-tight truncate">{engagement.title}</p>
              {engagement.client_name && (
                <p className="text-[10px] text-adv-gray-med mt-0.5 truncate">{engagement.client_name}</p>
              )}
              {engagement.project_id && (() => {
                const proj = projects.find(p => p.id === engagement.project_id);
                return proj ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-adv-teal truncate">
                    <FolderOpen className="h-3 w-3 shrink-0" />
                    <span className="truncate">{proj.name}</span>
                  </div>
                ) : null;
              })()}
              {!engagement.project_id && projects.length > 0 && (
                <div className="relative mt-1">
                  <button
                    onClick={() => setShowProjectLink(!showProjectLink)}
                    className="flex items-center gap-1 text-[10px] text-adv-gray-med hover:text-adv-teal transition-colors"
                  >
                    <Link2 className="h-3 w-3" />
                    Link to project
                  </button>
                  {showProjectLink && (
                    <div className="absolute left-0 top-full mt-1 w-44 bg-adv-card border border-border rounded-lg shadow-xl z-20 py-1">
                      {projects.map(p => (
                        <button
                          key={p.id}
                          onClick={() => linkToProject(p.id)}
                          className="w-full text-left px-3 py-2 text-xs text-adv-off-white hover:bg-adv-dark-2 transition-colors"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Phases */}
        <div className="flex-1 overflow-y-auto py-2">
          {PHASES.map((phase, idx) => {
            const st = phaseStatuses[phase.id];
            const isActive = activePhase === phase.id;
            const Icon = phase.icon;
            return (
              <button
                key={phase.id}
                onClick={() => setActivePhase(phase.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-adv-teal-dim text-adv-teal border-r-2 border-adv-teal'
                    : 'text-adv-gray hover:text-adv-off-white hover:bg-adv-card/50'
                }`}
              >
                <StatusDot status={st} />
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-adv-teal' : 'text-adv-gray-med'}`} />
                <span className="flex-1 text-left text-xs">{phase.shortLabel}</span>
                {!phase.mvp && (
                  <span className="text-[9px] bg-adv-gold/10 text-adv-gold border border-adv-gold/20 rounded px-1">Soon</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Phase progress indicator */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-adv-gray-med">Progress</span>
            <span className="text-[10px] text-adv-teal">{getOverallProgress(engagement.status)}%</span>
          </div>
          <div className="h-1 bg-adv-dark rounded-full overflow-hidden">
            <div
              className="h-full bg-adv-teal rounded-full transition-all"
              style={{ width: `${getOverallProgress(engagement.status)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-adv-dark">
        {activePhase === 'setup' && (
          <EngagementSetup
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => { updateStatus('scope_agreement'); setActivePhase('scope_agreement'); }}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'team' && (
          <EngagementTeamPanel
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => setActivePhase('scope_agreement')}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'scope_agreement' && (
          <EngagementScopeAgreement
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => { updateStatus('client_intelligence'); setActivePhase('client_intelligence'); }}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'client_intelligence' && (
          <EngagementClientIntelligence
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => setActivePhase('expert_config')}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'expert_config' && (
          <EngagementExpertConfig
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => { updateStatus('resource_collection'); setActivePhase('resource_collection'); }}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'resource_collection' && (
          <EngagementResourceCollection
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => setActivePhase('good_example')}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'good_example' && (
          <EngagementGoodExample
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => setActivePhase('workstream_planning')}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'workstream_planning' && (
          <EngagementWorkstreamPlanning
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => { updateStatus('execution'); setActivePhase('execution'); }}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'execution' && (
          <EngagementExecution
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => { updateStatus('review'); setActivePhase('review'); }}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'review' && (
          <EngagementReview
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onNext={() => { updateStatus('quality_gate'); setActivePhase('quality_gate'); }}
            onReExecute={() => setActivePhase('execution')}
            onReload={loadEngagement}
          />
        )}
        {activePhase === 'quality_gate' && (
          <EngagementQualityGate
            engagement={engagement}
            onUpdate={(updates) => setEngagement(prev => prev ? { ...prev, ...updates } : prev)}
            onReload={loadEngagement}
          />
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type PhaseStatus = 'done' | 'active' | 'pending';

function getPhaseStatuses(engagement: EngagementData): Record<string, PhaseStatus> {
  const order = ['setup','team','scope_agreement','client_intelligence','expert_config','resource_collection','good_example','workstream_planning','execution','review','quality_gate'];
  const currentPhaseIdx = order.indexOf(STATUS_PHASE_MAP[engagement.status] || 'setup');
  return Object.fromEntries(order.map((p, i) => [
    p,
    i < currentPhaseIdx ? 'done' : i === currentPhaseIdx ? 'active' : 'pending'
  ]));
}

function getOverallProgress(status: string): number {
  const order = ['setup','scope_agreement','client_intelligence','resource_collection','execution','review','quality_gate','completed'];
  const idx = order.indexOf(status);
  return idx < 0 ? 0 : Math.round((idx / (order.length - 1)) * 100);
}

function StatusDot({ status }: { status: PhaseStatus }) {
  if (status === 'done') return <div className="w-2 h-2 rounded-full bg-adv-teal shrink-0" />;
  if (status === 'active') return <div className="w-2 h-2 rounded-full bg-adv-teal shrink-0 ring-2 ring-adv-teal/40" />;
  return <div className="w-2 h-2 rounded-full bg-adv-dark border border-border shrink-0" />;
}
