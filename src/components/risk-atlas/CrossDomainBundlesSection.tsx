// CrossDomainBundlesSection — Addendum 1 / Stage 2 visualisation of
// threat-path bundles that thread multiple FCP domains. Real financial
// crime rarely stays in one domain; bundles tell the single causal
// story behind two or three disconnected-looking paths.
//
// Reads /api/atlas/:id/cross-domain-bundles. Lets the user create a new
// bundle (code + name + primary domain + member paths), add members,
// remove members, and delete the bundle. The board pack export will
// render bundles as a single story (left for the export pipeline to
// consume in a follow-up).

import { useCallback, useEffect, useState } from 'react';
import { Layers, Plus, X, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type FcpDomain =
  | 'amlcft' | 'sanctions' | 'fraud' | 'abc'
  | 'market_abuse' | 'tax_evasion_facilitation' | 'export_controls' | 'modern_slavery';

interface BundleMember {
  bundle_id: number;
  threat_path_id: string;
  role_in_bundle: 'entry' | 'middle' | 'exit' | 'amplifier';
  notes: string | null;
  created_at: string;
  path_code: string;
  name: string;
  fcp_domain: FcpDomain | null;
  residual_score: number | null;
}

interface BundleWithMembers {
  id: number;
  bundle_code: string;
  name: string;
  description: string | null;
  primary_domain: FcpDomain | null;
  members: BundleMember[];
}

interface ThreatPathSummary {
  id: string;
  path_code: string;
  name: string;
  fcp_domain: FcpDomain | null;
}

const FCP_DOMAINS: FcpDomain[] = ['amlcft','sanctions','fraud','abc','market_abuse','tax_evasion_facilitation','export_controls','modern_slavery'];

const DOMAIN_LABEL: Record<FcpDomain, string> = {
  amlcft: 'AML/CFT', sanctions: 'Sanctions', fraud: 'Fraud', abc: 'ABC',
  market_abuse: 'Market abuse', tax_evasion_facilitation: 'Tax evasion (facilitation)',
  export_controls: 'Export controls', modern_slavery: 'Modern slavery',
};

export default function CrossDomainBundlesSection({ atlasId }: { atlasId: string }) {
  const [bundles, setBundles] = useState<BundleWithMembers[]>([]);
  const [allPaths, setAllPaths] = useState<ThreatPathSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [b, p] = await Promise.all([
        fetchWithAuth(`/api/atlas/${atlasId}/cross-domain-bundles`, { headers: getAuthHeader() }),
        fetchWithAuth(`/api/atlas/${atlasId}/threat-paths`,        { headers: getAuthHeader() }),
      ]);
      const bData = await b.json(); const pData = await p.json();
      if (!b.ok) throw new Error(bData?.error || `HTTP ${b.status}`);
      if (!p.ok) throw new Error(pData?.error || `HTTP ${p.status}`);
      setBundles(bData.bundles ?? []);
      setAllPaths(pData.threatPaths ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [atlasId]);

  useEffect(() => { void load(); }, [load]);

  async function createBundle(input: { bundle_code: string; name: string; description: string; primary_domain: FcpDomain | ''; member_path_ids: string[] }): Promise<void> {
    setSubmitting(true); setErr(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/cross-domain-bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          bundle_code: input.bundle_code,
          name: input.name,
          description: input.description || undefined,
          primary_domain: input.primary_domain || undefined,
          member_path_ids: input.member_path_ids,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setShowForm(false);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSubmitting(false); }
  }

  async function addMember(bundleId: number, threatPathId: string): Promise<void> {
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/cross-domain-bundles/${bundleId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ threat_path_id: threatPathId, role_in_bundle: 'middle' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  async function removeMember(bundleId: number, threatPathId: string): Promise<void> {
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/cross-domain-bundles/${bundleId}/members/${threatPathId}`, {
        method: 'DELETE', headers: getAuthHeader(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  async function deleteBundle(bundleId: number): Promise<void> {
    if (!confirm('Delete this cross-domain bundle? Member paths are not deleted.')) return;
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/cross-domain-bundles/${bundleId}`, {
        method: 'DELETE', headers: getAuthHeader(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-adv-teal flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> Cross-domain path bundles
          {loading && <Loader2 className="h-3 w-3 animate-spin text-adv-gray" />}
        </h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:border-adv-teal hover:text-adv-teal">
            <Plus className="h-3 w-3" /> New bundle
          </button>
        )}
      </div>

      {err && (
        <div className="mb-2 rounded border border-adv-red/30 bg-adv-red/10 px-2 py-1 text-[11px] text-adv-red flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3" /> {err}
        </div>
      )}

      {showForm && (
        <BundleForm
          allPaths={allPaths}
          onCancel={() => setShowForm(false)}
          onSubmit={createBundle}
          submitting={submitting}
        />
      )}

      {bundles.length === 0 && !showForm && (
        <div className="rounded border border-dashed border-border p-4 text-center text-[11px] text-adv-gray">
          No cross-domain bundles yet. Group two or more threat paths that share a single causal story to surface them as one item to the board.
        </div>
      )}

      <div className="space-y-2">
        {bundles.map(b => (
          <BundleCard
            key={b.id}
            bundle={b}
            allPaths={allPaths}
            onAddMember={(pid) => addMember(b.id, pid)}
            onRemoveMember={(pid) => removeMember(b.id, pid)}
            onDelete={() => deleteBundle(b.id)}
          />
        ))}
      </div>
    </section>
  );
}

function BundleForm({ allPaths, onCancel, onSubmit, submitting }: {
  allPaths: ThreatPathSummary[];
  onCancel: () => void;
  onSubmit: (input: { bundle_code: string; name: string; description: string; primary_domain: FcpDomain | ''; member_path_ids: string[] }) => Promise<void>;
  submitting: boolean;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [primaryDomain, setPrimaryDomain] = useState<FcpDomain | ''>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  return (
    <div className="mb-3 rounded border border-border bg-adv-card p-3 space-y-2 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-[11px] text-adv-gray">
          Bundle code (e.g., XB-1)
          <input value={code} onChange={e => setCode(e.target.value)} maxLength={40} className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white" />
        </label>
        <label className="text-[11px] text-adv-gray">
          Name
          <input value={name} onChange={e => setName(e.target.value)} maxLength={200} placeholder="e.g., Baltic supply-chain exposure" className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white" />
        </label>
      </div>
      <label className="block text-[11px] text-adv-gray">
        Description (optional)
        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} rows={2} className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white" />
      </label>
      <label className="block text-[11px] text-adv-gray">
        Primary domain
        <select value={primaryDomain} onChange={e => setPrimaryDomain(e.target.value as FcpDomain | '')} className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white">
          <option value="">— none —</option>
          {FCP_DOMAINS.map(d => <option key={d} value={d}>{DOMAIN_LABEL[d]}</option>)}
        </select>
      </label>
      <div>
        <div className="text-[11px] text-adv-gray mb-1">Member threat paths ({selectedIds.size} selected)</div>
        <div className="max-h-48 overflow-y-auto rounded border border-border bg-adv-dark p-1 space-y-0.5">
          {allPaths.map(p => (
            <label key={p.id} className="flex items-center gap-2 px-1.5 py-1 hover:bg-adv-card cursor-pointer">
              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggle(p.id)} className="accent-adv-teal" />
              <span className="text-[11px] text-adv-off-white">{p.path_code} — {p.name}</span>
              {p.fcp_domain && <span className="text-[10px] text-adv-gray">[{DOMAIN_LABEL[p.fcp_domain]}]</span>}
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded border border-border px-3 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">Cancel</button>
        <button
          onClick={() => void onSubmit({ bundle_code: code.trim(), name: name.trim(), description: description.trim(), primary_domain: primaryDomain, member_path_ids: Array.from(selectedIds) })}
          disabled={submitting || !code.trim() || !name.trim()}
          className="rounded bg-adv-teal px-3 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 inline-flex items-center gap-1"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          Create bundle
        </button>
      </div>
    </div>
  );
}

function BundleCard({ bundle, allPaths, onAddMember, onRemoveMember, onDelete }: {
  bundle: BundleWithMembers;
  allPaths: ThreatPathSummary[];
  onAddMember: (pathId: string) => Promise<void>;
  onRemoveMember: (pathId: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [pickPath, setPickPath] = useState('');
  const memberIds = new Set(bundle.members.map(m => m.threat_path_id));
  const candidates = allPaths.filter(p => !memberIds.has(p.id));

  return (
    <div className="rounded border border-border bg-adv-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-adv-off-white">{bundle.bundle_code} — {bundle.name}</span>
            {bundle.primary_domain && (
              <span className="text-[10px] text-adv-teal border border-adv-teal/40 bg-adv-teal/10 rounded px-1.5 py-0.5">{DOMAIN_LABEL[bundle.primary_domain]}</span>
            )}
          </div>
          {bundle.description && <p className="mt-1 text-[11px] text-adv-gray">{bundle.description}</p>}
        </div>
        <button onClick={() => void onDelete()} className="rounded p-1 text-adv-gray hover:bg-adv-dark hover:text-adv-red" aria-label="Delete bundle">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {bundle.members.length === 0 && (
          <div className="text-[11px] text-adv-gray italic">No member paths yet.</div>
        )}
        {bundle.members.map(m => (
          <div key={m.threat_path_id} className="flex items-center justify-between gap-2 rounded border border-border bg-adv-dark px-2 py-1 text-[11px]">
            <div className="min-w-0 flex-1">
              <span className="font-medium text-adv-off-white">{m.path_code}</span>
              <span className="ml-1 text-adv-gray">— {m.name}</span>
              {m.fcp_domain && <span className="ml-2 text-[10px] text-adv-gray">[{DOMAIN_LABEL[m.fcp_domain]}]</span>}
              {m.residual_score != null && <span className="ml-2 text-[10px] text-adv-gray">residual {m.residual_score}/5</span>}
            </div>
            <button onClick={() => void onRemoveMember(m.threat_path_id)} className="rounded p-0.5 text-adv-gray hover:text-adv-red" aria-label="Remove">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {!adding && candidates.length > 0 && (
        <button onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1 text-[11px] text-adv-teal hover:text-adv-teal-dark">
          <Plus className="h-3 w-3" /> Add member
        </button>
      )}
      {adding && (
        <div className="mt-2 flex items-center gap-2">
          <select value={pickPath} onChange={e => setPickPath(e.target.value)} className="flex-1 rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white">
            <option value="">— pick a path —</option>
            {candidates.map(p => <option key={p.id} value={p.id}>{p.path_code} — {p.name}</option>)}
          </select>
          <button
            onClick={async () => { if (pickPath) { await onAddMember(pickPath); setPickPath(''); setAdding(false); } }}
            disabled={!pickPath}
            className="rounded bg-adv-teal px-2 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
          >Add</button>
          <button onClick={() => { setAdding(false); setPickPath(''); }} className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">Cancel</button>
        </div>
      )}
    </div>
  );
}
