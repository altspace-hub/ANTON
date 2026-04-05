import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Inbox, Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Plus, X, FileText } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface Task {
  id: string; title: string; description: string; direction: string;
  status: string; urgency: string; progress_percent: number;
  requester_hash: string; provider_hash: string;
  result_content: string | null;
  created_at: string; deadline: string | null;
  result_quality_score: number | null;
}

interface Contact {
  id: number; contact_hash: string; display_name: string; status: string;
  delegation_trust_level: string | null; endpoint: string | null;
}

export default function CommunityTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState<'inbound' | 'outbound'>('inbound');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // Create task form
  const [newProvider, setNewProvider] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUrgency, setNewUrgency] = useState('normal');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/community/tasks?direction=${tab}&limit=50`);
      if (res.ok) setTasks(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    async function loadContacts() {
      try {
        const res = await fetch('/api/community/connections', { headers: getAuthHeader() });
        if (res.ok) {
          const data = await res.json();
          setContacts((Array.isArray(data) ? data : data.connections ?? []).filter((c: Contact) =>
            (c.status === 'active' || c.status === 'accepted') && c.endpoint
          ));
        }
      } catch { /* ignore */ }
    }
    loadContacts();
  }, []);

  const handleAction = async (taskId: string, action: string) => {
    await fetchWithAuth(`/api/community/tasks/${taskId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    fetchTasks();
  };

  async function handleCreate() {
    if (!newProvider || !newTitle.trim() || !newDescription.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetchWithAuth('/api/community/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerHash: newProvider,
          title: newTitle,
          description: newDescription,
          urgency: newUrgency,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewProvider('');
        setNewTitle('');
        setNewDescription('');
        setNewUrgency('normal');
        setTab('outbound');
        fetchTasks();
      } else {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error ?? 'Failed to create task');
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setCreating(false);
    }
  }

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/community')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white">Task Delegation</h1>
            <p className="text-sm text-adv-gray">Send and receive work between ANTON instances</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
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
          {tab === 'outbound' && (
            <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-adv-teal hover:text-adv-teal-dark">
              Delegate a task to another ANTON
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(t => (
            <div key={t.id} className="rounded-xl border border-adv-card bg-adv-card p-4">
              <button className="w-full text-left" onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}>
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
                    <span className="text-xs text-adv-gray capitalize">{t.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                <p className="text-xs text-adv-gray line-clamp-2">{t.description}</p>
              </button>

              {t.progress_percent > 0 && t.progress_percent < 100 && (
                <div className="w-full bg-adv-dark rounded-full h-1.5 mt-3">
                  <div className="bg-adv-teal h-1.5 rounded-full" style={{ width: `${t.progress_percent}%` }} />
                </div>
              )}

              {/* Expanded: show result */}
              {expandedTask === t.id && t.result_content && (
                <div className="mt-3 rounded-lg border border-border bg-adv-dark-2 p-3">
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-adv-teal">
                    <FileText className="h-3.5 w-3.5" /> Result
                  </div>
                  <div className="text-sm text-adv-off-white whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {t.result_content}
                  </div>
                </div>
              )}

              {tab === 'inbound' && t.status === 'submitted' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleAction(t.id, 'accept')} className="rounded px-3 py-1 text-xs bg-adv-green/20 text-adv-green hover:bg-adv-green/30">Accept</button>
                  <button onClick={() => handleAction(t.id, 'decline')} className="rounded px-3 py-1 text-xs bg-adv-gray/20 text-adv-gray hover:bg-adv-gray/30">Decline</button>
                </div>
              )}
              {tab === 'outbound' && t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleAction(t.id, 'cancel')} className="rounded px-3 py-1 text-xs bg-adv-gray/20 text-adv-gray hover:bg-adv-gray/30">Cancel</button>
                </div>
              )}
              <div className="flex items-center justify-between mt-2 text-xs text-adv-gray">
                <span>{new Date(t.created_at).toLocaleDateString()}</span>
                {t.deadline && <span>Due: {new Date(t.deadline).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Task Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-adv-dark-2 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-adv-off-white">Delegate Task to Another ANTON</h2>
              <button onClick={() => setShowCreate(false)} className="text-adv-gray hover:text-adv-off-white"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-adv-gray">Send to <span className="text-adv-red">*</span></label>
                {contacts.length > 0 ? (
                  <select value={newProvider} onChange={e => setNewProvider(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                    <option value="">Select a connected ANTON...</option>
                    {contacts.map(c => (
                      <option key={c.contact_hash} value={c.contact_hash}>
                        {c.display_name} ({c.contact_hash.slice(0, 15)}...)
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-adv-gold">No connected ANTONs with P2P endpoints. Add a contact with an endpoint first.</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-adv-gray">Task Title <span className="text-adv-red">*</span></label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g., Analyze EU AI Act Article 14 compliance risks"
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-sm text-adv-gray">Description <span className="text-adv-red">*</span></label>
                <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)}
                  placeholder="Describe what you need the other ANTON to do. Be specific about the expected output format and level of detail."
                  rows={5}
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none resize-none" />
              </div>

              <div>
                <label className="mb-1 block text-sm text-adv-gray">Urgency</label>
                <select value={newUrgency} onChange={e => setNewUrgency(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            {createError && <p className="mt-3 text-sm text-adv-red">{createError}</p>}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
              <button onClick={handleCreate}
                disabled={!newProvider || !newTitle.trim() || !newDescription.trim() || creating}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {creating ? 'Sending...' : 'Delegate Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
