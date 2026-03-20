import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, ArrowUpRight, ArrowDownLeft, Check, X, AlertTriangle } from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

interface SharedAtom {
  id: string; atom_content: string; atom_type: string; sentiment: string;
  direction: string; contact_hash: string; status: string;
  conflict_reason: string | null; shared_at: string;
}

export default function CommunitySharedKnowledgePage() {
  const navigate = useNavigate();
  const [atoms, setAtoms] = useState<SharedAtom[]>([]);
  const [bundles, setBundles] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleResolve = async (id: string, decision: 'accept' | 'reject') => {
    await fetchWithAuth(`/api/community/share/atom/${id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    fetchData();
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/community')} className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
            <Share2 className="h-6 w-6 text-adv-teal" /> Shared Knowledge
          </h1>
          <p className="text-sm text-adv-gray">Atoms and bundles exchanged with contacts</p>
        </div>
      </div>

      {loading ? <p className="text-sm text-adv-gray">Loading...</p> : (
        <div className="space-y-3">
          {atoms.length === 0 && bundles.length === 0 && (
            <div className="text-center py-16">
              <Share2 className="h-12 w-12 text-adv-gray mx-auto mb-3" />
              <p className="text-adv-gray">No knowledge shared yet</p>
              <p className="text-xs text-adv-gray mt-1">Share atoms with contacts from the Atoms page</p>
            </div>
          )}
          {atoms.map(a => (
            <div key={a.id} className={`rounded-lg border ${a.status === 'conflict' ? 'border-adv-gold/30' : 'border-adv-card'} bg-adv-card p-4`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {a.direction === 'sent' ? <ArrowUpRight className="h-4 w-4 text-adv-teal" /> : <ArrowDownLeft className="h-4 w-4 text-adv-blue" />}
                  <span className="text-xs text-adv-gray">{a.direction === 'sent' ? 'Sent to' : 'Received from'} {a.contact_hash?.slice(0, 12)}...</span>
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
    </div>
  );
}
