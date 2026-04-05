import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, ArrowUpRight, ArrowDownLeft, Check, X, AlertTriangle, Plus, Send, Loader2 } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface SharedAtom {
  id: string; atom_content: string; atom_type: string; sentiment: string;
  direction: string; contact_hash: string; status: string;
  conflict_reason: string | null; shared_at: string;
}

interface Contact {
  id: number; contact_hash: string; display_name: string; status: string; endpoint: string | null;
}

interface KnowledgeAtom {
  id: string; content: string; atom_type: string; category: string; confidence: number;
}

export default function CommunitySharedKnowledgePage() {
  const navigate = useNavigate();
  const [atoms, setAtoms] = useState<SharedAtom[]>([]);
  const [bundles, setBundles] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [knowledgeAtoms, setKnowledgeAtoms] = useState<KnowledgeAtom[]>([]);
  const [selectedContact, setSelectedContact] = useState('');
  const [selectedAtoms, setSelectedAtoms] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/community/shared-knowledge?limit=50');
      if (res.ok) {
        const data = await res.json();
        setAtoms(data.atoms ?? []);
        setBundles(data.bundles ?? []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load contacts and knowledge atoms when share modal opens
  useEffect(() => {
    if (!showShare) return;
    async function load() {
      try {
        const [connRes, atomsRes] = await Promise.all([
          fetch('/api/community/connections', { headers: getAuthHeader() }),
          fetchWithAuth('/api/markets/atoms?limit=30&sort=importance'),
        ]);
        if (connRes.ok) {
          const data = await connRes.json();
          setContacts((Array.isArray(data) ? data : data.connections ?? [])
            .filter((c: Contact) => (c.status === 'active' || c.status === 'accepted') && c.endpoint));
        }
        if (atomsRes.ok) {
          const data = await atomsRes.json();
          setKnowledgeAtoms(data.atoms ?? data ?? []);
        }
      } catch { /* ignore */ }
    }
    load();
  }, [showShare]);

  const handleResolve = async (id: string, decision: 'accept' | 'reject') => {
    await fetchWithAuth(`/api/community/share/atom/${id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    fetchData();
  };

  async function handleShare() {
    if (!selectedContact || selectedAtoms.size === 0) return;
    setSharing(true);
    setShareResult(null);
    let shared = 0;
    for (const atomId of selectedAtoms) {
      try {
        const res = await fetchWithAuth(`/api/community/share/atom/${atomId}/${selectedContact}`, { method: 'POST' });
        if (res.ok) shared++;
      } catch { /* skip */ }
    }
    setShareResult(`Shared ${shared} atom(s) with contact`);
    setSharing(false);
    if (shared > 0) {
      setTimeout(() => { setShowShare(false); setSelectedAtoms(new Set()); setShareResult(null); fetchData(); }, 1500);
    }
  }

  function toggleAtom(id: string) {
    setSelectedAtoms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/community')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <Share2 className="h-6 w-6 text-adv-teal" /> Shared Knowledge
            </h1>
            <p className="text-sm text-adv-gray">Share and receive knowledge atoms between ANTON instances</p>
          </div>
        </div>
        <button onClick={() => setShowShare(true)}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark">
          <Share2 className="h-4 w-4" />
          Share Knowledge
        </button>
      </div>

      {loading ? <p className="text-sm text-adv-gray">Loading...</p> : (
        <div className="space-y-3">
          {atoms.length === 0 && bundles.length === 0 && (
            <div className="text-center py-16">
              <Share2 className="h-12 w-12 text-adv-gray mx-auto mb-3" />
              <p className="text-adv-gray">No knowledge shared yet</p>
              <button onClick={() => setShowShare(true)} className="mt-3 text-sm text-adv-teal hover:text-adv-teal-dark">
                Share knowledge atoms with a connected ANTON
              </button>
            </div>
          )}
          {atoms.map(a => (
            <div key={a.id} className={`rounded-lg border ${a.status === 'conflict' ? 'border-adv-gold/30' : 'border-adv-card'} bg-adv-card p-4`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {a.direction === 'sent' ? <ArrowUpRight className="h-4 w-4 text-adv-teal" /> : <ArrowDownLeft className="h-4 w-4 text-adv-blue" />}
                  <span className="text-xs text-adv-gray">{a.direction === 'sent' ? 'Sent to' : 'Received from'} {a.contact_hash?.slice(0, 15)}...</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.status === 'accepted' ? 'bg-adv-green/10 text-adv-green' :
                    a.status === 'pending' ? 'bg-adv-gold/10 text-adv-gold' :
                    a.status === 'conflict' ? 'bg-adv-red/10 text-adv-red' :
                    'bg-adv-gray/10 text-adv-gray'
                  }`}>{a.status}</span>
                  <span className="text-xs text-adv-gray">{new Date(a.shared_at).toLocaleDateString()}</span>
                </div>
              </div>
              <p className="text-sm text-adv-off-white">{a.atom_content}</p>
              {a.conflict_reason && <p className="text-xs text-adv-gold mt-1"><AlertTriangle className="h-3 w-3 inline mr-1" />{a.conflict_reason}</p>}
              {(a.status === 'pending' || a.status === 'conflict') && a.direction === 'received' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleResolve(a.id, 'accept')} className="flex items-center gap-1 rounded px-3 py-1 text-xs bg-adv-green/20 text-adv-green hover:bg-adv-green/30"><Check className="h-3 w-3" /> Accept</button>
                  <button onClick={() => handleResolve(a.id, 'reject')} className="flex items-center gap-1 rounded px-3 py-1 text-xs bg-adv-gray/20 text-adv-gray hover:bg-adv-gray/30"><X className="h-3 w-3" /> Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Share Knowledge Modal */}
      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowShare(false)}>
          <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-border bg-adv-dark-2 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-adv-off-white">Share Knowledge Atoms</h2>
              <button onClick={() => setShowShare(false)} className="text-adv-gray hover:text-adv-off-white"><X className="h-4 w-4" /></button>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm text-adv-gray">Share with</label>
              {contacts.length > 0 ? (
                <select value={selectedContact} onChange={e => setSelectedContact(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                  <option value="">Select a connected ANTON...</option>
                  {contacts.map(c => (
                    <option key={c.contact_hash} value={c.contact_hash}>
                      {c.display_name} ({c.contact_hash.slice(0, 15)}...)
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-adv-gold">No connected ANTONs with endpoints.</p>
              )}
            </div>

            <label className="mb-2 block text-sm text-adv-gray">Select atoms to share ({selectedAtoms.size} selected)</label>
            <div className="flex-1 overflow-y-auto space-y-1 mb-4 min-h-0">
              {knowledgeAtoms.length === 0 ? (
                <p className="text-sm text-adv-gray py-4 text-center">No knowledge atoms available. Run a module or the markets intelligence to generate atoms.</p>
              ) : knowledgeAtoms.map(a => (
                <button key={a.id} onClick={() => toggleAtom(a.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${
                    selectedAtoms.has(a.id)
                      ? 'border-adv-teal bg-adv-teal/10 text-adv-off-white'
                      : 'border-border bg-adv-card text-adv-gray hover:border-adv-teal/30'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="truncate flex-1">{a.content.slice(0, 100)}</span>
                    <span className="text-xs ml-2 shrink-0">{a.atom_type}</span>
                  </div>
                </button>
              ))}
            </div>

            {shareResult && <p className="mb-3 text-sm text-adv-green">{shareResult}</p>}

            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowShare(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
              <button onClick={handleShare}
                disabled={!selectedContact || selectedAtoms.size === 0 || sharing}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
                {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sharing ? 'Sharing...' : `Share ${selectedAtoms.size} Atom(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
