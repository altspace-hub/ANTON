// ThreatPathsTab — list + create + drill-down for threat paths.
// Surfaces the residual heatmap at the top, then a list of threat-path
// cards with inline scoring + appetite controls.

import { useEffect, useState, useCallback } from 'react';
import { Plus, AlertCircle, RefreshCcw, Loader2 } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import StageExplainer from './StageExplainer';
import ResidualHeatMap from './ResidualHeatMap';
import ThreatPathCard, { type ThreatPathFull } from './ThreatPathCard';

interface Props {
  atlasId: string;
}

interface ThreatPathRow {
  id: string;
  path_code: string;
  name: string;
  description: string | null;
  fcp_domain: string | null;
}

const FCP_DOMAINS = ['amlcft','sanctions','fraud','abc','market_abuse','tax_evasion_facilitation','export_controls','modern_slavery'] as const;

export default function ThreatPathsTab({ atlasId }: Props) {
  const [paths, setPaths] = useState<ThreatPathRow[]>([]);
  const [fulls, setFulls] = useState<Record<string, ThreatPathFull>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/threat-paths`, { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const list: ThreatPathRow[] = data.threatPaths ?? [];
      setPaths(list);
      // Hydrate every path in parallel for the cards
      const fullPromises = await Promise.all(
        list.map(p => fetchWithAuth(`/api/atlas/${atlasId}/threat-paths/${p.id}`, { headers: getAuthHeader() })
          .then(r => r.ok ? r.json() : null)
          .then(d => d?.threatPath ? [p.id, d.threatPath as ThreatPathFull] as const : null)
          .catch(() => null))
      );
      const map: Record<string, ThreatPathFull> = {};
      for (const entry of fullPromises) if (entry) map[entry[0]] = entry[1];
      setFulls(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [atlasId]);

  useEffect(() => { void load(); }, [load]);

  const heatmapPaths = paths.map(p => {
    const full = fulls[p.id];
    return {
      path_code: p.path_code,
      name: p.name,
      inherent_score: full?.inherent?.inherent_score ?? null,
      residual_score: full?.residual?.residual_score ?? null,
      appetite_position: full?.appetite?.appetite_position ?? null,
    };
  });

  return (
    <div className="space-y-4">
      <StageExplainer stage={2} defaultOpen={paths.length === 0} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-adv-off-white">Threat paths</h2>
          <p className="text-[11px] text-adv-gray">{paths.length} paths · click "Score inherent" on any card to populate Stages 4-6.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={loading}
            className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setShowForm(s => !s)}
            className="rounded bg-adv-teal px-2.5 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> New path
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {showForm && (
        <NewPathForm atlasId={atlasId} nextCode={`TP-${paths.length + 1}`} onSaved={() => { setShowForm(false); void load(); }} onCancel={() => setShowForm(false)} />
      )}

      {paths.length > 0 && Object.keys(fulls).length > 0 && (
        <div className="overflow-x-auto">
          <ResidualHeatMap paths={heatmapPaths} />
        </div>
      )}

      {paths.length === 0 && !showForm ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-xs text-adv-off-white">No threat paths yet.</p>
          <p className="text-[11px] text-adv-gray mt-1">Add paths from your industry pack or describe bespoke ones for your business.</p>
          <button onClick={() => setShowForm(true)}
            className="mt-3 rounded bg-adv-teal px-2.5 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add the first one
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {paths.map(p => fulls[p.id]
            ? <ThreatPathCard key={p.id} full={fulls[p.id]} onChanged={() => void load()} />
            : <div key={p.id} className="rounded border border-border bg-adv-card p-3 text-[11px] text-adv-gray">{p.path_code} — {p.name} · loading…</div>
          )}
        </div>
      )}
    </div>
  );
}

function NewPathForm({ atlasId, nextCode, onSaved, onCancel }: { atlasId: string; nextCode: string; onSaved: () => void; onCancel: () => void }) {
  const [code, setCode] = useState(nextCode);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fcpDomain, setFcpDomain] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/threat-paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          path_code: code,
          name: name.trim(),
          description: description.trim() || undefined,
          fcp_domain: fcpDomain || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-adv-teal/30 bg-adv-teal/5 p-4 space-y-2">
      <div className="text-xs font-semibold text-adv-teal">New threat path</div>
      {error && <div className="text-[11px] text-adv-red flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</div>}
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[10px] text-adv-gray">
          Code
          <input type="text" value={code} onChange={e => setCode(e.target.value)} maxLength={40}
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white" />
        </label>
        <label className="text-[10px] text-adv-gray col-span-2">
          Name
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={200}
            placeholder="e.g. Subcontractor invoice fraud"
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white" />
        </label>
      </div>
      <label className="block text-[10px] text-adv-gray">
        Description (the story)
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={4000}
          placeholder="Two or three sentences telling the story of how this could unfold."
          className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white" />
      </label>
      <label className="block text-[10px] text-adv-gray">
        FCP domain (optional)
        <select value={fcpDomain} onChange={e => setFcpDomain(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white">
          <option value="">none / non-FCP</option>
          {FCP_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">Cancel</button>
        <button onClick={() => void submit()} disabled={submitting || !name.trim()}
          className="rounded bg-adv-teal px-2 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 inline-flex items-center gap-1">
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Add path
        </button>
      </div>
    </div>
  );
}
