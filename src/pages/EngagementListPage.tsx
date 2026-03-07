/**
 * EngagementListPage.tsx
 * Lists all active engagements and provides a "New Engagement" entry point.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Plus, Clock, ChevronRight, Archive, Copy,
  CheckCircle, Circle, Loader2, Search, Filter, FolderOpen, Link2
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

interface Engagement {
  id: string;
  title: string;
  engagement_type: 'full' | 'lite';
  status: string;
  your_organisation: string | null;
  client_name: string | null;
  domain_areas: string;
  scope_count: number;
  resource_count: number;
  iteration_count: number;
  created_at: string;
  updated_at: string;
  project_id: string | null;
}

interface Project {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  setup:               { label: 'Setup',           color: 'text-adv-gray bg-adv-dark border-border' },
  scope_agreement:     { label: 'Scope',           color: 'text-adv-blue bg-adv-blue/10 border-adv-blue/30' },
  client_intelligence: { label: 'Intelligence',    color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
  resource_collection: { label: 'Resources',       color: 'text-adv-teal bg-adv-teal-dim border-adv-teal/30' },
  configuration:       { label: 'Config',          color: 'text-adv-teal bg-adv-teal-dim border-adv-teal/30' },
  workstream_planning: { label: 'Planning',        color: 'text-adv-teal bg-adv-teal-dim border-adv-teal/30' },
  execution:           { label: 'Executing',       color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
  review:              { label: 'Review',          color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30' },
  quality_gate:        { label: 'Quality Gate',    color: 'text-adv-green bg-adv-green/10 border-adv-green/30' },
  completed:           { label: 'Completed',       color: 'text-adv-green bg-adv-green/10 border-adv-green/30' },
};

const PHASE_ORDER = ['setup','scope_agreement','client_intelligence','resource_collection','configuration','workstream_planning','execution','review','quality_gate','completed'];

function phaseProgress(status: string): number {
  const idx = PHASE_ORDER.indexOf(status);
  return idx < 0 ? 0 : Math.round((idx / (PHASE_ORDER.length - 1)) * 100);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function EngagementListPage() {
  const navigate = useNavigate();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [newType, setNewType] = useState<'full' | 'lite'>('full');
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<'all' | 'personal' | 'in-project'>('all');
  const [linkingEngId, setLinkingEngId] = useState<string | null>(null);

  useEffect(() => {
    loadEngagements();
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const res = await fetch('/api/projects', { headers: getAuthHeader() });
      if (res.ok) setProjects(await res.json());
    } catch { /* ignore */ }
  }

  async function loadEngagements() {
    try {
      const res = await fetch('/api/engagements', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setEngagements(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createEngagement() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ title: newTitle, engagement_type: newType, client_name: newClient, your_organisation: newOrg }),
      });
      if (res.ok) {
        const eng = await res.json();
        navigate(`/engagements/${eng.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function archiveEngagement(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/engagements/${id}`, { method: 'DELETE', headers: getAuthHeader() });
    setEngagements(prev => prev.filter(e => e.id !== id));
  }

  async function linkToProject(engId: string, projectId: string | null, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/engagements/${engId}/project`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ project_id: projectId }),
    });
    setLinkingEngId(null);
    loadEngagements();
  }

  const filtered = engagements
    .filter(e => filter === 'all' ? true : filter === 'personal' ? !e.project_id : !!e.project_id)
    .filter(e =>
      !search || e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.client_name || '').toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-white flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-adv-teal" />
            Engagement Tasks
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Structured lifecycle manager — from engagement letter to final deliverable
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Engagement
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-adv-gray" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search engagements..."
          className="w-full bg-adv-card border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-3">
        {(['all', 'personal', 'in-project'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-adv-teal-dim text-adv-teal border border-adv-teal/30'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            {f === 'all' ? 'All' : f === 'personal' ? 'Personal' : 'In Project'}
          </button>
        ))}
      </div>

      {/* Engagement list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Briefcase className="h-12 w-12 text-adv-gray mx-auto mb-4" />
          <p className="text-adv-gray text-sm">
            {search ? 'No engagements match your search.' : 'No engagements yet. Start with "New Engagement".'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(eng => {
            const st = STATUS_LABELS[eng.status] || STATUS_LABELS.setup;
            const progress = phaseProgress(eng.status);
            let domains: string[] = [];
            try { domains = JSON.parse(eng.domain_areas || '[]'); } catch { /**/ }
            return (
              <div
                key={eng.id}
                onClick={() => navigate(`/engagements/${eng.id}`)}
                className="bg-adv-card border border-border rounded-xl p-5 cursor-pointer hover:border-adv-teal/40 transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-adv-off-white text-base truncate">{eng.title}</h3>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${st.color}`}>
                        {st.label}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full border border-border text-adv-gray">
                        {eng.engagement_type === 'full' ? 'Full' : 'Lite'}
                      </span>
                      {eng.project_id && (() => {
                        const proj = projects.find(p => p.id === eng.project_id);
                        return proj ? (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-adv-teal/30 text-adv-teal bg-adv-teal-dim">
                            <FolderOpen className="h-3 w-3" />
                            {proj.name}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <p className="mt-1 text-sm text-adv-gray">
                      {[eng.your_organisation, eng.client_name].filter(Boolean).join(' → ')}
                      {domains.length > 0 && <span className="ml-2 text-adv-gray">· {domains.slice(0, 2).join(', ')}</span>}
                    </p>
                    {/* Progress bar */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-1 bg-adv-dark-2 rounded-full overflow-hidden">
                        <div className="h-full bg-adv-teal rounded-full transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs text-adv-gray whitespace-nowrap">{progress}% complete</span>
                    </div>
                    {/* Stats */}
                    <div className="mt-3 flex items-center gap-4 text-xs text-adv-gray">
                      <span>{eng.scope_count} scope items</span>
                      <span>{eng.resource_count} resources</span>
                      {eng.iteration_count > 0 && <span>{eng.iteration_count} iteration{eng.iteration_count !== 1 ? 's' : ''}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(eng.updated_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => archiveEngagement(eng.id, e)}
                      title="Archive"
                      className="p-1.5 rounded text-adv-gray hover:text-adv-red hover:bg-adv-red/10 transition-colors"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={e => { e.stopPropagation(); setLinkingEngId(linkingEngId === eng.id ? null : eng.id); }}
                        title="Link to project"
                        className="p-1.5 rounded text-adv-gray hover:text-adv-teal hover:bg-adv-teal-dim transition-colors"
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                      {linkingEngId === eng.id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-48 bg-adv-card border border-border rounded-lg shadow-xl z-10 py-1"
                          onClick={e => e.stopPropagation()}
                        >
                          {eng.project_id && (
                            <button
                              onClick={e => linkToProject(eng.id, null, e)}
                              className="w-full text-left px-3 py-2 text-xs text-adv-red hover:bg-adv-red/10 transition-colors"
                            >
                              Remove from project
                            </button>
                          )}
                          {projects.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-adv-gray">No projects yet</p>
                          ) : (
                            projects.map(p => (
                              <button
                                key={p.id}
                                onClick={e => linkToProject(eng.id, p.id, e)}
                                className="w-full text-left px-3 py-2 text-xs text-adv-off-white hover:bg-adv-card/80 transition-colors"
                              >
                                {p.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-adv-teal" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Engagement Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-adv-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-5">
            <h2 className="text-lg font-semibold text-adv-white">New Engagement</h2>

            {/* Entry type toggle */}
            <div>
              <p className="text-xs text-adv-gray mb-2">Entry type</p>
              <div className="grid grid-cols-2 gap-2">
                {(['full', 'lite'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setNewType(t)}
                    className={`p-3 rounded-lg border text-sm text-left transition-all ${
                      newType === t
                        ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                        : 'border-border text-adv-gray hover:border-adv-gray-med'
                    }`}
                  >
                    <div className="font-medium">{t === 'full' ? 'Full Engagement' : 'Lite Engagement'}</div>
                    <div className="text-[11px] mt-0.5 opacity-70">
                      {t === 'full' ? 'Upload engagement letter / contract' : 'Internal task, no formal letter'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-adv-gray mb-1">Engagement title *</label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createEngagement()}
                  placeholder="e.g. AMLR Gap Assessment — Nordea Q2 2026"
                  className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Your organisation</label>
                  <input
                    value={newOrg}
                    onChange={e => setNewOrg(e.target.value)}
                    placeholder="e.g. openEXPERT"
                    className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                  />
                </div>
                <div>
                  <label className="block text-xs text-adv-gray mb-1">Client</label>
                  <input
                    value={newClient}
                    onChange={e => setNewClient(e.target.value)}
                    placeholder="e.g. Nordea"
                    className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-adv-gray hover:text-adv-off-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createEngagement}
                disabled={!newTitle.trim() || creating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Engagement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
