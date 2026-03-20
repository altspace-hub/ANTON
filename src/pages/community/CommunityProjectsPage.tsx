import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FolderKanban, Plus, Users, Clock, CheckCircle } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

export default function CommunityProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState('');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/community/projects');
      if (res.ok) setProjects(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreate = async () => {
    if (!newName.trim() || !newGoal.trim()) return;
    const res = await fetchWithAuth('/api/community/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, goal: newGoal }),
    });
    if (res.ok) {
      const { id } = await res.json();
      navigate(`/community/projects/${id}`);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/community')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3"><FolderKanban className="h-6 w-6 text-adv-teal" /> Collaborative Projects</h1>
            <p className="text-sm text-adv-gray">ANTON-orchestrated projects with networked team members</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"><Plus className="h-4 w-4" /> New Project</button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
          <h2 className="text-lg font-semibold text-adv-off-white">New Collaborative Project</h2>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Project name" className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none" />
          <textarea value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="Project goal — what do you want to achieve?" rows={3} className="w-full rounded-lg border border-adv-dark bg-adv-dark-2 px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!newName.trim() || !newGoal.trim()} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark disabled:opacity-50">Create & Plan</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-adv-dark px-4 py-2 text-sm text-adv-gray">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-adv-gray">Loading...</p> : projects.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-adv-off-white">No collaborative projects yet</h2>
          <p className="text-sm text-adv-gray">Create a project and ANTON will plan, delegate, and orchestrate</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <div key={p.id as string} onClick={() => navigate(`/community/projects/${p.id}`)} className="rounded-xl border border-adv-card bg-adv-card p-4 cursor-pointer hover:border-adv-teal/30 transition-colors">
              <h3 className="text-sm font-semibold text-adv-off-white">{p.name as string}</h3>
              <p className="text-xs text-adv-gray mt-1 line-clamp-2">{p.project_goal as string}</p>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-adv-gray">
                  <Users className="h-3.5 w-3.5" /> {p.project_type as string}
                </div>
                <div className="flex items-center gap-1">
                  {Number(p.overall_progress) > 0 && (
                    <div className="w-16 bg-adv-dark rounded-full h-1.5">
                      <div className="bg-adv-teal h-1.5 rounded-full" style={{ width: `${p.overall_progress}%` }} />
                    </div>
                  )}
                  <span className="text-xs text-adv-gray">{(p.overall_progress as number) || 0}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
