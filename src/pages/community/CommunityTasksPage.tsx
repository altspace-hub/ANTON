import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Inbox, Clock, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface Task {
  id: string; title: string; description: string; direction: string;
  status: string; urgency: string; progress_percent: number;
  requester_hash: string; provider_hash: string;
  created_at: string; deadline: string | null;
  result_quality_score: number | null;
}

export default function CommunityTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<'inbound' | 'outbound'>('inbound');
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/community/tasks?direction=${tab}&limit=50`);
      if (res.ok) setTasks(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleAction = async (taskId: string, action: string) => {
    await fetchWithAuth(`/api/community/tasks/${taskId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    fetchTasks();
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-adv-green" />;
      case 'declined': case 'cancelled': case 'failed': return <XCircle className="h-4 w-4 text-adv-red" />;
      case 'in_progress': return <Loader2 className="h-4 w-4 text-adv-teal animate-spin" />;
      case 'clarification_needed': return <AlertTriangle className="h-4 w-4 text-adv-gold" />;
      default: return <Clock className="h-4 w-4 text-adv-gray" />;
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/community')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-adv-off-white">Task Delegation</h1>
          <p className="text-sm text-adv-gray">Send and receive work requests between ANTON instances</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setTab('inbound')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${tab === 'inbound' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray'}`}>
          <Inbox className="h-3.5 w-3.5" /> Inbound
        </button>
        <button onClick={() => setTab('outbound')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${tab === 'outbound' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray'}`}>
          <Send className="h-3.5 w-3.5" /> Outbound
        </button>
      </div>

      {loading ? <p className="text-sm text-adv-gray">Loading...</p> : tasks.length === 0 ? (
        <div className="text-center py-16">
          <Send className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <p className="text-adv-gray">No {tab} tasks yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(t => (
            <div key={t.id} className="rounded-xl border border-adv-card bg-adv-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {statusIcon(t.status)}
                  <span className="text-sm font-medium text-adv-off-white">{t.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    t.urgency === 'critical' ? 'bg-adv-red/10 text-adv-red' :
                    t.urgency === 'high' ? 'bg-adv-gold/10 text-adv-gold' :
                    'bg-adv-gray/10 text-adv-gray'
                  }`}>{t.urgency}</span>
                  <span className="text-xs text-adv-gray">{t.status}</span>
                </div>
              </div>
              <p className="text-xs text-adv-gray line-clamp-2 mb-3">{t.description}</p>
              {t.progress_percent > 0 && t.progress_percent < 100 && (
                <div className="w-full bg-adv-dark rounded-full h-1.5 mb-3">
                  <div className="bg-adv-teal h-1.5 rounded-full" style={{ width: `${t.progress_percent}%` }} />
                </div>
              )}
              {tab === 'inbound' && t.status === 'submitted' && (
                <div className="flex gap-2">
                  <button onClick={() => handleAction(t.id, 'accept')} className="rounded px-3 py-1 text-xs bg-adv-green/20 text-adv-green hover:bg-adv-green/30">Accept</button>
                  <button onClick={() => handleAction(t.id, 'decline')} className="rounded px-3 py-1 text-xs bg-adv-gray/20 text-adv-gray hover:bg-adv-gray/30">Decline</button>
                </div>
              )}
              {tab === 'inbound' && t.status === 'accepted' && (
                <button onClick={() => handleAction(t.id, 'start')} className="rounded px-3 py-1 text-xs bg-adv-teal/20 text-adv-teal hover:bg-adv-teal/30">Start Work</button>
              )}
              <div className="flex items-center justify-between mt-2 text-xs text-adv-gray">
                <span>{new Date(t.created_at).toLocaleDateString()}</span>
                {t.deadline && <span>Due: {new Date(t.deadline).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
