import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Plus, Trash2, Pencil, Check, X, Clock, MessageSquare, ChevronDown, ChevronRight, Link2, Unlink, FileText, StickyNote, Users, BarChart3, Brain, Loader2 } from 'lucide-react';
import { fetchProjects, createProject, deleteProject, updateProject, fetchProject, fetchSessions, assignSessionToProject } from '@/lib/api';
import { MODULES, AREAS } from '@/lib/constants';
import type { Session } from '@/lib/types';
import ProjectFiles from '@/components/projects/ProjectFiles';
import ProjectNotes from '@/components/projects/ProjectNotes';
import ProjectMembers from '@/components/projects/ProjectMembers';
import { useSettingsStore } from '@/stores/useSettingsStore';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  session_count: number;
  created_at: string;
  updated_at: string;
}

interface ProjectStats {
  totals: {
    session_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost: number;
    avg_quality: number;
  };
  byModule: Array<{ module_id: string; count: number }>;
  recentActivity: Array<{ created_at: string; module_id: string; model: string; estimated_cost_usd: number }>;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const AREA_COLORS: Record<string, { dot: string; text: string }> = {
  fcp:              { dot: 'bg-adv-teal',   text: 'text-adv-teal' },
  legal:            { dot: 'bg-adv-blue',   text: 'text-adv-blue' },
  audit:            { dot: 'bg-adv-gold',   text: 'text-adv-gold' },
  consulting:       { dot: 'bg-adv-green',  text: 'text-adv-green' },
  banking:          { dot: 'bg-adv-blue',   text: 'text-adv-blue' },
  risk:             { dot: 'bg-adv-red',    text: 'text-adv-red' },
  cyber:            { dot: 'bg-adv-teal',   text: 'text-adv-teal' },
  'data-analytics': { dot: 'bg-adv-blue',   text: 'text-adv-blue' },
  esg:              { dot: 'bg-adv-green',  text: 'text-adv-green' },
  strategy:         { dot: 'bg-adv-gold',   text: 'text-adv-gold' },
  investment:       { dot: 'bg-adv-teal',   text: 'text-adv-teal' },
  'project-mgmt':   { dot: 'bg-adv-green',  text: 'text-adv-green' },
};

const DEFAULT_AREA_COLOR = { dot: 'bg-adv-gray', text: 'text-adv-gray' };

function getAreaForModule(moduleId: string) {
  const area = AREAS.find((a) => a.moduleIds.includes(moduleId as never));
  if (!area) return null;
  return { id: area.id, label: area.shortLabel, colors: AREA_COLORS[area.id] ?? DEFAULT_AREA_COLOR };
}

const PROJECT_TEMPLATES = [
  { id: 'amlr-implementation', name: 'AMLR Implementation', description: 'End-to-end AMLR 2024/1624 gap analysis, remediation planning, and policy updates.' },
  { id: 'client-onboarding', name: 'Client Engagement', description: 'Full consulting engagement: proposal, gap analysis, deliverables, and reporting.' },
  { id: 'regulatory-response', name: 'Regulatory Response', description: 'Respond to a regulatory finding, inspection, or supervisory enquiry.' },
];

interface ScaffoldData {
  description: string;
  recommendedModules: { id: string; reason: string }[];
  suggestedDeadlines: { title: string; dayOffset: number }[];
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [scaffoldLoading, setScaffoldLoading] = useState(false);
  const [scaffoldData, setScaffoldData] = useState<ScaffoldData | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectSessions, setProjectSessions] = useState<Session[]>([]);
  const [activeTab, setActiveTab] = useState<'sessions' | 'files' | 'notes' | 'members' | 'stats'>('sessions');
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const { deploymentMode } = useSettingsStore();
  const isTeamMode = deploymentMode === 'team';

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab !== 'stats' || !expandedProjectId) return;
    setStatsLoading(true);
    const token = localStorage.getItem('openexpert-token');
    const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};
    fetch(`/api/projects/${expandedProjectId}/stats`, { credentials: 'include', headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setProjectStats(data); setStatsLoading(false); })
      .catch(() => setStatsLoading(false));
  }, [activeTab, expandedProjectId]);

  const runAiScaffold = async () => {
    if (!newName.trim()) return;
    setScaffoldLoading(true);
    try {
      const r = await fetch('/api/ai-assist/project-scaffold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ name: newName.trim(), goal: newDesc.trim(), availableModuleIds: MODULES.map((m) => m.id) }),
      });
      if (r.ok) {
        const data = await r.json() as ScaffoldData;
        setScaffoldData(data);
        if (data.description && !newDesc.trim()) setNewDesc(data.description);
      }
    } catch { /* ignore */ } finally { setScaffoldLoading(false); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const project = await createProject({ name: newName.trim(), description: newDesc.trim() || undefined });
    setProjects((prev) => [project, ...prev]);
    setNewName('');
    setNewDesc('');
    setScaffoldData(null);
    setShowNew(false);
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    await updateProject(id, { name: editName.trim() });
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name: editName.trim() } : p));
    setEditingId(null);
  };

  const toggleExpand = async (projectId: string) => {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
      setProjectSessions([]);
      return;
    }
    setExpandedProjectId(projectId);
    setActiveTab('sessions');
    try {
      const data = await fetchProject(projectId);
      setProjectSessions(data?.sessions || []);
    } catch {
      setProjectSessions([]);
    }
  };

  const openSessionPicker = async () => {
    setShowSessionPicker(true);
    setSessionSearch('');
    try {
      const sessions: Session[] = await fetchSessions(undefined, { hasOutput: true, limit: 100 });
      setAllSessions(sessions);
    } catch {
      setAllSessions([]);
    }
  };

  const handleAssignSession = async (sessionId: string) => {
    if (!expandedProjectId) return;
    try {
      await assignSessionToProject(sessionId, expandedProjectId);
      // Refresh project sessions
      const data = await fetchProject(expandedProjectId);
      setProjectSessions(data?.sessions || []);
      // Update session count in project list
      setProjects((prev) => prev.map((p) =>
        p.id === expandedProjectId ? { ...p, session_count: (data?.sessions?.length || 0) } : p
      ));
    } catch { /* ignore */ }
  };

  const handleUnassignSession = async (sessionId: string) => {
    if (!expandedProjectId) return;
    try {
      await assignSessionToProject(sessionId, null);
      setProjectSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setProjects((prev) => prev.map((p) =>
        p.id === expandedProjectId ? { ...p, session_count: Math.max(0, p.session_count - 1) } : p
      ));
    } catch { /* ignore */ }
  };

  const filteredPickerSessions = allSessions.filter((s) => {
    // Exclude sessions already in this project
    if (projectSessions.some((ps) => ps.id === s.id)) return false;
    if (!sessionSearch) return true;
    return s.title.toLowerCase().includes(sessionSearch.toLowerCase());
  });

  const handleCreateFromTemplate = async (template: typeof PROJECT_TEMPLATES[0]) => {
    const project = await createProject({ name: template.name, description: template.description });
    setProjects((prev) => [project, ...prev]);
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-white">Projects</h1>
          <p className="mt-1 text-sm text-adv-gray">Group related sessions into projects. Track progress across modules and areas.</p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* New project form */}
      {showNew && (
        <div className="mb-6 rounded-xl border border-adv-teal/30 bg-adv-card p-4">
          <div className="mb-3 text-sm font-medium text-adv-off-white">New Project</div>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Project name"
            className="mb-2 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="mb-2 w-full resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
          />
          <button
            onClick={runAiScaffold}
            disabled={scaffoldLoading || !newName.trim()}
            className="mb-3 flex items-center gap-1.5 rounded border border-adv-teal/40 bg-adv-teal/10 px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors"
          >
            {scaffoldLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            {scaffoldLoading ? 'Scaffolding…' : 'AI Scaffold'}
          </button>
          {scaffoldData && (
            <div className="mb-3 rounded-lg border border-adv-teal/20 bg-adv-teal-soft p-3 space-y-2">
              {scaffoldData.recommendedModules.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-adv-teal mb-1">Recommended modules</p>
                  <div className="flex flex-wrap gap-1">
                    {scaffoldData.recommendedModules.map((m) => {
                      const mod = MODULES.find((x) => x.id === m.id);
                      return (
                        <span key={m.id} className="rounded-full bg-adv-teal/10 border border-adv-teal/20 px-2 py-0.5 text-xs text-adv-teal" title={m.reason}>
                          {mod?.shortLabel || m.id}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {scaffoldData.suggestedDeadlines.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-adv-off-white mb-1">Suggested milestones</p>
                  <ul className="space-y-0.5">
                    {scaffoldData.suggestedDeadlines.map((d, i) => (
                      <li key={i} className="text-xs text-adv-gray">
                        <span className="text-adv-off-white">{d.title}</span>
                        {d.dayOffset > 0 && <span className="text-adv-gray"> · day {d.dayOffset}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
            >
              Create
            </button>
            <button onClick={() => setShowNew(false)} className="rounded-lg border border-border px-4 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Templates */}
      {projects.length === 0 && (
        <div className="mb-6">
          <div className="mb-3 text-sm font-medium text-adv-off-white">Start from a template</div>
          <div className="grid grid-cols-3 gap-3">
            {PROJECT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleCreateFromTemplate(t)}
                className="rounded-xl border border-border bg-adv-card p-4 text-left transition-all hover:border-adv-teal/30 hover:shadow-lg"
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <div className="text-sm font-medium text-adv-off-white">{t.name}</div>
                <div className="mt-1 text-xs text-adv-gray leading-relaxed">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Project list */}
      {projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((project) => {
            const isExpanded = expandedProjectId === project.id;
            return (
            <div
              key={project.id}
              className="group relative rounded-xl border border-border bg-adv-card transition-all hover:border-adv-teal/20"
            >
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleExpand(project.id)}
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal hover:bg-adv-teal/20 transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    {editingId === project.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(project.id); if (e.key === 'Escape') setEditingId(null); }}
                          className="min-w-0 flex-1 rounded border border-adv-teal bg-adv-dark px-2 py-0.5 text-sm text-adv-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                        />
                        <button onClick={() => handleRename(project.id)} className="text-adv-teal hover:text-adv-teal-dark"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-adv-gray hover:text-adv-red"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <h3
                        className="text-sm font-semibold text-adv-white cursor-pointer hover:text-adv-teal transition-colors"
                        onClick={() => toggleExpand(project.id)}
                      >
                        {project.name}
                      </h3>
                    )}
                    {project.description && <p className="mt-0.5 text-xs text-adv-gray">{project.description}</p>}
                    <div className="mt-2 flex items-center gap-3 text-xs text-adv-gray">
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{project.session_count} sessions</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRelativeTime(project.updated_at)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${project.status === 'active' ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gray-med/10 text-adv-gray'}`}>
                        {project.status}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div className="absolute right-4 top-4 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
                  <button
                    onClick={() => toggleExpand(project.id)}
                    className="rounded p-1.5 text-adv-gray hover:text-adv-teal transition-colors"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => { setEditingId(project.id); setEditName(project.name); }}
                    className="rounded p-1.5 text-adv-gray hover:text-adv-teal transition-colors"
                    title="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="rounded p-1.5 text-adv-gray hover:text-adv-red transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded: tabbed project detail */}
              {isExpanded && (
                <div className="border-t border-border bg-adv-dark-2">
                  {/* Tab bar */}
                  <div className="flex items-center gap-1 border-b border-border px-5 pt-3">
                    {([
                      { id: 'sessions' as const, label: 'Sessions', icon: MessageSquare, count: projectSessions.length },
                      { id: 'files' as const, label: 'Files', icon: FileText },
                      { id: 'notes' as const, label: 'Notes', icon: StickyNote },
                      ...(isTeamMode ? [{ id: 'members' as const, label: 'Members', icon: Users }] : []),
                      { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
                    ] as const).map(tab => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                            activeTab === tab.id
                              ? 'text-adv-teal border-b-2 border-adv-teal -mb-px'
                              : 'text-adv-gray hover:text-adv-off-white'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {tab.label}
                          {'count' in tab && typeof tab.count === 'number' && tab.count > 0 && (
                            <span className="opacity-60">({tab.count})</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab content */}
                  <div className="px-5 py-4">
                    {activeTab === 'sessions' && (
                      <>
                        {projectSessions.length === 0 ? (
                          <div className="text-center py-2">
                            <p className="text-xs text-adv-gray mb-3">No sessions in this project yet.</p>
                            <button
                              onClick={openSessionPicker}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal transition-colors hover:bg-adv-teal/20"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Add sessions to this project
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {projectSessions.map((session) => {
                              const areaInfo = getAreaForModule(session.module_id);
                              const mod = MODULES.find((m) => m.id === session.module_id);
                              return (
                                <div key={session.id} className="group/session flex items-center gap-2">
                                  <Link
                                    to={`/module/${session.module_id}?session=${session.id}`}
                                    className="flex flex-1 items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-3 hover:border-adv-teal/30 transition-colors"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-adv-off-white truncate">{session.title}</p>
                                      <p className="text-xs text-adv-gray mt-0.5">
                                        {mod?.shortLabel || session.module_id} · {formatRelativeTime(session.updated_at || session.created_at)}
                                      </p>
                                    </div>
                                    {areaInfo && (
                                      <span className={`flex items-center gap-1.5 shrink-0 text-xs font-medium ${areaInfo.colors.text}`}>
                                        <span className={`h-2 w-2 rounded-full ${areaInfo.colors.dot}`} />
                                        {areaInfo.label}
                                      </span>
                                    )}
                                  </Link>
                                  <button
                                    onClick={() => handleUnassignSession(session.id)}
                                    className="shrink-0 rounded p-1.5 text-adv-gray opacity-0 transition-all hover:text-adv-red group-hover/session:opacity-100"
                                    title="Remove from project"
                                  >
                                    <Unlink className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                            <button
                              onClick={openSessionPicker}
                              className="mt-2 flex items-center gap-1.5 text-xs text-adv-teal/70 hover:text-adv-teal transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add more sessions
                            </button>
                          </div>
                        )}

                        {/* Session picker modal */}
                        {showSessionPicker && (
                          <div className="mt-3 rounded-xl border border-adv-teal/30 bg-adv-card p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <span className="text-sm font-medium text-adv-off-white">Add session to project</span>
                              <button onClick={() => setShowSessionPicker(false)} className="text-adv-gray hover:text-adv-off-white">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <input
                              autoFocus
                              value={sessionSearch}
                              onChange={(e) => setSessionSearch(e.target.value)}
                              placeholder="Search sessions..."
                              className="mb-3 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                            />
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {filteredPickerSessions.length === 0 ? (
                                <p className="py-2 text-center text-xs text-adv-gray">
                                  {allSessions.length === 0 ? 'No sessions found. Run a module first.' : 'No matching sessions available.'}
                                </p>
                              ) : (
                                filteredPickerSessions.slice(0, 20).map((s) => {
                                  const mod = MODULES.find((m) => m.id === s.module_id);
                                  return (
                                    <button
                                      key={s.id}
                                      onClick={() => { handleAssignSession(s.id); setShowSessionPicker(false); }}
                                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-adv-teal-dim"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-adv-off-white">{s.title}</p>
                                        <p className="text-xs text-adv-gray">
                                          {mod?.shortLabel || s.module_id} · {formatRelativeTime(s.updated_at || s.created_at)}
                                        </p>
                                      </div>
                                      <Link2 className="h-3.5 w-3.5 shrink-0 text-adv-teal" />
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {activeTab === 'files' && (
                      <ProjectFiles projectId={project.id} projectName={project.name} />
                    )}

                    {activeTab === 'notes' && (
                      <ProjectNotes projectId={project.id} />
                    )}

                    {activeTab === 'members' && isTeamMode && (
                      <ProjectMembers projectId={project.id} />
                    )}

                    {activeTab === 'stats' && (
                      <div className="space-y-4">
                        {statsLoading && (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin h-6 w-6 border-2 border-adv-teal border-t-transparent rounded-full" />
                          </div>
                        )}
                        {!statsLoading && projectStats && (
                          <>
                            {/* 4 metric cards */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 bg-adv-card rounded-lg border border-white/5">
                                <div className="text-xs text-adv-gray mb-1">Sessions</div>
                                <div className="text-xl font-semibold text-adv-off-white">{projectStats.totals.session_count}</div>
                              </div>
                              <div className="p-3 bg-adv-card rounded-lg border border-white/5">
                                <div className="text-xs text-adv-gray mb-1">Tokens Used</div>
                                <div className="text-xl font-semibold text-adv-off-white">
                                  {formatTokens(projectStats.totals.total_input_tokens + projectStats.totals.total_output_tokens)}
                                </div>
                              </div>
                              <div className="p-3 bg-adv-card rounded-lg border border-white/5">
                                <div className="text-xs text-adv-gray mb-1">Est. Cost</div>
                                <div className="text-xl font-semibold text-adv-off-white">
                                  ${(projectStats.totals.total_cost ?? 0).toFixed(2)}
                                </div>
                              </div>
                              <div className="p-3 bg-adv-card rounded-lg border border-white/5">
                                <div className="text-xs text-adv-gray mb-1">Avg Quality</div>
                                <div className="text-xl font-semibold flex items-center gap-2">
                                  {projectStats.totals.avg_quality > 0 ? (
                                    <>
                                      <span className={
                                        projectStats.totals.avg_quality >= 8 ? 'text-adv-green' :
                                        projectStats.totals.avg_quality >= 6 ? 'text-adv-gold' : 'text-adv-red'
                                      }>{projectStats.totals.avg_quality.toFixed(1)}</span>
                                      <span className="text-adv-gray text-sm">/ 10</span>
                                    </>
                                  ) : <span className="text-adv-gray">&mdash;</span>}
                                </div>
                              </div>
                            </div>

                            {/* Module breakdown */}
                            {projectStats.byModule.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-adv-gray mb-2 uppercase tracking-wide">Sessions by Module</h4>
                                <div className="space-y-2">
                                  {projectStats.byModule.map(item => {
                                    const max = projectStats.byModule[0].count;
                                    const pct = (item.count / max) * 100;
                                    return (
                                      <div key={item.module_id} className="flex items-center gap-2">
                                        <span className="text-xs text-adv-gray w-28 shrink-0 truncate">{item.module_id}</span>
                                        <div className="flex-1 h-2 bg-adv-dark rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-adv-teal rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                        <span className="text-xs text-adv-gray w-6 text-right">{item.count}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Recent activity */}
                            {projectStats.recentActivity.length > 0 && (
                              <div>
                                <h4 className="text-xs font-medium text-adv-gray mb-2 uppercase tracking-wide">Recent Activity</h4>
                                <div className="space-y-1.5">
                                  {projectStats.recentActivity.map((entry, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs">
                                      <span className="text-adv-gray w-16 shrink-0">{formatRelativeTime(entry.created_at)}</span>
                                      <span className="px-1.5 py-0.5 bg-adv-card text-adv-off-white rounded text-xs truncate max-w-24">{entry.module_id || '\u2014'}</span>
                                      <span className="text-adv-gray truncate flex-1">{entry.model?.split('-').slice(1,3).join(' ') ?? '\u2014'}</span>
                                      {entry.estimated_cost_usd > 0 && (
                                        <span className="text-adv-gray shrink-0">${entry.estimated_cost_usd.toFixed(3)}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
          <FolderOpen className="mx-auto mb-3 h-10 w-10 text-adv-gray" />
          <p className="text-sm font-medium text-adv-gray">No projects yet</p>
          <p className="mt-1 text-xs text-adv-gray">Create a project to organise your sessions and track progress across modules.</p>
        </div>
      )}
    </div>
  );
}
