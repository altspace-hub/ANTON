import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, FolderKanban, Play, CheckCircle, Clock, Users, AlertTriangle,
  Loader2, XCircle, RefreshCw, FileText, Sparkles, UserPlus,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

type Tab = 'plan' | 'assignments' | 'progress' | 'activity';

interface Task {
  id: string; title: string; description: string; task_type: string;
  status: string; step_order: number; assigned_to: string;
  assigned_contact_name: string | null; estimated_hours: number | null;
  result_content: string | null; result_quality_score: number | null;
}

interface Activity {
  id: string; activity_type: string; summary: string; created_at: string;
}

interface CapMatch {
  taskId: string; taskTitle: string;
  candidates: Array<{ contactHash: string; name: string; score: number; trustLevel: string }>;
}

interface Dashboard {
  project: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  tasks: Task[];
  activity: Activity[];
  tasksByStatus: Record<string, number>;
  totalTasks: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-adv-gray', assigned: 'text-adv-blue', in_progress: 'text-adv-teal',
  review: 'text-adv-gold', completed: 'text-adv-green', blocked: 'text-adv-red',
  failed: 'text-adv-red', cancelled: 'text-adv-gray',
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle className="h-4 w-4 text-adv-green" />;
    case 'in_progress': return <Loader2 className="h-4 w-4 text-adv-teal animate-spin" />;
    case 'blocked': case 'failed': return <XCircle className="h-4 w-4 text-adv-red" />;
    case 'review': return <AlertTriangle className="h-4 w-4 text-adv-gold" />;
    case 'assigned': return <Users className="h-4 w-4 text-adv-blue" />;
    default: return <Clock className="h-4 w-4 text-adv-gray" />;
  }
}

export default function CommunityProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('plan');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [assembled, setAssembled] = useState('');
  const [capMatches, setCapMatches] = useState<CapMatch[]>([]);

  const fetchDashboard = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/community/projects/${id}/dashboard`);
      if (res.ok) setDashboard(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleGeneratePlan = async () => {
    if (!id || !dashboard?.project) return;
    setGenerating(true);
    try {
      const goal = (dashboard.project.project_goal as string) || (dashboard.project.name as string);
      await fetchWithAuth(`/api/community/projects/${id}/plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      await fetchDashboard();
    } catch { /* ignore */ } finally { setGenerating(false); }
  };

  const handleApprovePlan = async () => {
    if (!id || !dashboard?.plan) return;
    await fetchWithAuth(`/api/community/projects/${id}/plan/${(dashboard.plan as Record<string, unknown>).id}/approve`, { method: 'POST' });
    await fetchDashboard();
  };

  const handleFetchMatches = async () => {
    if (!id) return;
    const res = await fetchWithAuth(`/api/community/projects/${id}/capability-matches`);
    if (res.ok) setCapMatches(await res.json());
  };

  const handleAssign = async (taskId: string, type: 'self' | 'contact', contactHash?: string, contactName?: string) => {
    if (!id) return;
    await fetchWithAuth(`/api/community/projects/${id}/tasks/${taskId}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, contactHash, contactName }),
    });
    await fetchDashboard();
  };

  const handleSync = async () => {
    if (!id) return;
    await fetchWithAuth(`/api/community/projects/${id}/sync`, { method: 'POST' });
    await fetchDashboard();
  };

  const handleAssemble = async () => {
    if (!id) return;
    setAssembling(true);
    try {
      const res = await fetchWithAuth(`/api/community/projects/${id}/assemble`, { method: 'POST' });
      if (res.ok) { const data = await res.json(); setAssembled(data.content); }
    } catch { /* ignore */ } finally { setAssembling(false); }
  };

  if (loading) return <div className="min-h-screen p-6"><p className="text-sm text-adv-gray">Loading project...</p></div>;
  if (!dashboard?.project) return <div className="min-h-screen p-6"><p className="text-sm text-adv-gray">Project not found</p></div>;

  const project = dashboard.project;
  const plan = dashboard.plan as Record<string, unknown> | null;
  const tasks = dashboard.tasks;
  const totalTasks = dashboard.totalTasks;
  const tasksByStatus = dashboard.tasksByStatus;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'plan', label: `Plan (${totalTasks})` },
    { key: 'assignments', label: 'Assignments' },
    { key: 'progress', label: 'Progress' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/community/projects')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
            <FolderKanban className="h-6 w-6 text-adv-teal" /> {project.name as string}
          </h1>
          <p className="text-sm text-adv-gray">{project.project_goal as string}</p>
        </div>
        {totalTasks > 0 && (
          <div className="text-right">
            <div className="text-lg font-bold text-adv-teal">{project.overall_progress as number || 0}%</div>
            <div className="w-24 bg-adv-dark rounded-full h-2 mt-1">
              <div className="bg-adv-teal h-2 rounded-full transition-all" style={{ width: `${project.overall_progress || 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-adv-card pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key === 'assignments') handleFetchMatches(); }}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${tab === t.key ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Plan Tab */}
      {tab === 'plan' && (
        <div className="space-y-4">
          {!plan && totalTasks === 0 && (
            <div className="text-center py-12">
              <Sparkles className="h-10 w-10 text-adv-teal mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-adv-off-white">Generate an AI Plan</h2>
              <p className="text-sm text-adv-gray mb-4">ANTON will break your goal into executable tasks</p>
              <button onClick={handleGeneratePlan} disabled={generating}
                className="flex items-center gap-2 mx-auto rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark disabled:opacity-50">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {generating ? 'Generating...' : 'Generate Plan'}
              </button>
            </div>
          )}

          {plan && (
            <div className="rounded-xl border border-adv-card bg-adv-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-adv-off-white">Plan v{plan.plan_version as number}</h3>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${plan.status === 'active' ? 'bg-adv-green/20 text-adv-green' : 'bg-adv-gold/20 text-adv-gold'}`}>
                    {plan.status as string}
                  </span>
                  {plan.status === 'draft' && (
                    <button onClick={handleApprovePlan} className="rounded-lg bg-adv-green px-3 py-1 text-xs font-medium text-white">Approve</button>
                  )}
                  <button onClick={handleGeneratePlan} disabled={generating} className="rounded-lg border border-adv-card px-3 py-1 text-xs text-adv-gray hover:text-adv-teal">
                    {generating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-adv-gray">{plan.approach as string}</p>
              <p className="text-xs text-adv-gray">Estimated: {plan.estimated_total_hours as number}h total</p>
            </div>
          )}

          {tasks.length > 0 && (
            <div className="space-y-2">
              {tasks.map((t, i) => (
                <div key={t.id} className="rounded-xl border border-adv-card bg-adv-card p-3 flex items-start gap-3">
                  <div className="mt-0.5"><StatusIcon status={t.status} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-adv-gray">#{t.step_order}</span>
                      <h4 className="text-sm font-medium text-adv-off-white truncate">{t.title}</h4>
                    </div>
                    <p className="text-xs text-adv-gray mt-0.5 line-clamp-2">{t.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-adv-gray">
                      <span className={`rounded-full px-1.5 py-0.5 ${STATUS_COLORS[t.status] || 'text-adv-gray'} bg-adv-dark`}>{t.status}</span>
                      <span>{t.task_type}</span>
                      {t.estimated_hours && <span>{t.estimated_hours}h</span>}
                      {t.assigned_contact_name && <span className="text-adv-blue">Assigned: {t.assigned_contact_name}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assignments Tab */}
      {tab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={handleFetchMatches} className="flex items-center gap-1.5 rounded-lg bg-adv-card px-3 py-1.5 text-xs text-adv-gray hover:text-adv-teal">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Matches
            </button>
            <button onClick={handleSync} className="flex items-center gap-1.5 rounded-lg bg-adv-card px-3 py-1.5 text-xs text-adv-gray hover:text-adv-teal">
              <RefreshCw className="h-3.5 w-3.5" /> Sync Delegated
            </button>
          </div>

          {capMatches.length === 0 ? (
            <p className="text-sm text-adv-gray py-8 text-center">No pending tasks to assign. Generate a plan first.</p>
          ) : capMatches.map(m => (
            <div key={m.taskId} className="rounded-xl border border-adv-card bg-adv-card p-4 space-y-2">
              <h4 className="text-sm font-medium text-adv-off-white">{m.taskTitle || m.taskId}</h4>
              <div className="space-y-1">
                {m.candidates.map(c => (
                  <div key={c.contactHash} className="flex items-center justify-between rounded-lg bg-adv-dark-2 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-adv-off-white">{c.name}</span>
                      <span className="rounded-full bg-adv-card px-1.5 py-0.5 text-xs text-adv-gray">{c.trustLevel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-adv-teal font-medium">{c.score}pts</span>
                      <button onClick={() => handleAssign(m.taskId, c.contactHash === 'self' ? 'self' : 'contact', c.contactHash, c.name)}
                        className="flex items-center gap-1 rounded-lg bg-adv-teal/20 px-2 py-1 text-xs text-adv-teal hover:bg-adv-teal/30">
                        <UserPlus className="h-3 w-3" /> Assign
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Progress Tab */}
      {tab === 'progress' && (
        <div className="space-y-4">
          {/* Status summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['pending', 'assigned', 'in_progress', 'completed'].map(s => (
              <div key={s} className="rounded-xl border border-adv-card bg-adv-card p-3 text-center">
                <div className={`text-lg font-bold ${STATUS_COLORS[s]}`}>{tasksByStatus[s] || 0}</div>
                <div className="text-xs text-adv-gray capitalize">{s.replace('_', ' ')}</div>
              </div>
            ))}
          </div>

          {/* Assemble button */}
          {(tasksByStatus['completed'] || 0) > 0 && (
            <button onClick={handleAssemble} disabled={assembling}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark disabled:opacity-50">
              {assembling ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {assembling ? 'Assembling...' : 'Assemble Deliverables'}
            </button>
          )}

          {assembled && (
            <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-4">
              <h3 className="text-sm font-semibold text-adv-off-white mb-2">Assembled Deliverable</h3>
              <pre className="whitespace-pre-wrap text-xs text-adv-gray max-h-96 overflow-y-auto">{assembled}</pre>
            </div>
          )}

          {/* Task cards by status */}
          {tasks.length > 0 && (
            <div className="space-y-2">
              {tasks.map(t => (
                <div key={t.id} className="rounded-xl border border-adv-card bg-adv-card p-3 flex items-center gap-3">
                  <StatusIcon status={t.status} />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm text-adv-off-white truncate">{t.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-adv-gray">
                      <span className="capitalize">{t.status.replace('_', ' ')}</span>
                      {t.assigned_contact_name && <span>- {t.assigned_contact_name}</span>}
                      {t.result_quality_score && <span className="text-adv-teal">{t.result_quality_score}/10</span>}
                    </div>
                  </div>
                  {t.status === 'review' && (
                    <button className="rounded-lg bg-adv-green/20 px-2 py-1 text-xs text-adv-green">Review</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <div className="space-y-2">
          {dashboard.activity.length === 0 ? (
            <p className="text-sm text-adv-gray py-8 text-center">No activity yet</p>
          ) : dashboard.activity.map(a => (
            <div key={a.id} className="flex items-start gap-3 rounded-xl border border-adv-card bg-adv-card p-3">
              <div className="mt-0.5 h-2 w-2 rounded-full bg-adv-teal shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-adv-off-white">{a.summary}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-adv-gray">
                  <span className="capitalize">{a.activity_type.replace('_', ' ')}</span>
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
