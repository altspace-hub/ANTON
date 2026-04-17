// ControlsTab — list + create controls; cascading recalc handled server-side.

import { useEffect, useState, useCallback } from 'react';
import { Plus, AlertCircle, RefreshCcw, Loader2, Shield } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import StageExplainer from './StageExplainer';

interface Props { atlasId: string }

interface ControlRow {
  id: string;
  control_code: string;
  name: string;
  description: string | null;
  type: 'prevent' | 'detect' | 'respond';
  strength: 'strong' | 'adequate' | 'weak';
  evidence: string | null;
  owner_role: string | null;
}

interface VulnRow { id: string; vuln_code: string; name: string; severity: number }

const STRENGTH_META = {
  strong:   { dot: 'bg-adv-green', border: 'border-adv-green/40 bg-adv-green/10' },
  adequate: { dot: 'bg-adv-gold',  border: 'border-adv-gold/40 bg-adv-gold/10' },
  weak:     { dot: 'bg-adv-red',   border: 'border-adv-red/40 bg-adv-red/10' },
};

export default function ControlsTab({ atlasId }: Props) {
  const [controls, setControls] = useState<ControlRow[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<VulnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cRes, vRes] = await Promise.all([
        fetchWithAuth(`/api/atlas/${atlasId}/controls`, { headers: getAuthHeader() }),
        fetchWithAuth(`/api/atlas/${atlasId}/vulnerabilities`, { headers: getAuthHeader() }),
      ]);
      const cd = await cRes.json();
      const vd = await vRes.json();
      if (!cRes.ok) throw new Error(cd?.error || `HTTP ${cRes.status}`);
      if (!vRes.ok) throw new Error(vd?.error || `HTTP ${vRes.status}`);
      setControls(cd.controls ?? []);
      setVulnerabilities(vd.vulnerabilities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [atlasId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <StageExplainer stage={5} defaultOpen={controls.length === 0} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-adv-off-white">Controls</h2>
          <p className="text-[11px] text-adv-gray">{controls.length} controls. Strong requires evidence on file.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={loading}
            className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setShowForm(s => !s)} disabled={vulnerabilities.length === 0}
            title={vulnerabilities.length === 0 ? 'Add vulnerabilities first to link controls' : ''}
            className="rounded bg-adv-teal px-2.5 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus className="h-3 w-3" /> New control
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
        <NewControlForm atlasId={atlasId} nextCode={`C-${controls.length + 1}`} vulnerabilities={vulnerabilities}
          onSaved={() => { setShowForm(false); void load(); }} onCancel={() => setShowForm(false)} />
      )}

      {controls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Shield className="h-6 w-6 text-adv-gray mx-auto mb-2" />
          <p className="text-xs text-adv-off-white">No controls yet.</p>
          <p className="text-[11px] text-adv-gray mt-1">Controls reduce inherent risk via the Strong/Adequate/Weak rollup.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-adv-card divide-y divide-border">
          {controls.map(c => (
            <div key={c.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-block w-2 h-2 rounded-full ${STRENGTH_META[c.strength].dot}`} />
                  <span className="text-xs font-medium text-adv-off-white">{c.control_code} — {c.name}</span>
                  <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${STRENGTH_META[c.strength].border}`}>
                    {c.strength}
                  </span>
                  <span className="text-[10px] text-adv-gray">[{c.type}]</span>
                  {c.owner_role && <span className="text-[10px] text-adv-gray">· owner: {c.owner_role}</span>}
                </div>
                {c.description && <p className="mt-1 text-[11px] text-adv-gray">{c.description}</p>}
                {c.evidence && (
                  <p className="mt-1 text-[10px] text-adv-green/80">
                    <span className="font-semibold">Evidence:</span> {c.evidence}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewControlForm({ atlasId, nextCode, vulnerabilities, onSaved, onCancel }: {
  atlasId: string; nextCode: string; vulnerabilities: VulnRow[];
  onSaved: () => void; onCancel: () => void;
}) {
  const [code, setCode] = useState(nextCode);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'prevent' | 'detect' | 'respond'>('prevent');
  const [strength, setStrength] = useState<'strong' | 'adequate' | 'weak'>('adequate');
  const [evidence, setEvidence] = useState('');
  const [ownerRole, setOwnerRole] = useState('');
  const [linkedVulns, setLinkedVulns] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evidenceRequired = strength === 'strong';
  const evidenceMissing = evidenceRequired && evidence.trim().length < 5;

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          control_code: code,
          name: name.trim(),
          description: description.trim() || undefined,
          type, strength,
          evidence: evidence.trim() || undefined,
          owner_role: ownerRole.trim() || undefined,
          vulnerability_links: Array.from(linkedVulns).map(vid => ({ vulnerability_id: vid, type })),
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
      <div className="text-xs font-semibold text-adv-teal">New control</div>
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
            placeholder="e.g. Dual-control above payment threshold"
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white" />
        </label>
      </div>

      <label className="block text-[10px] text-adv-gray">
        Description
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={4000}
          className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white" />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label className="text-[10px] text-adv-gray">
          Type
          <select value={type} onChange={e => setType(e.target.value as 'prevent' | 'detect' | 'respond')}
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white">
            <option value="prevent">Prevent</option>
            <option value="detect">Detect</option>
            <option value="respond">Respond</option>
          </select>
        </label>
        <label className="text-[10px] text-adv-gray">
          Strength
          <select value={strength} onChange={e => setStrength(e.target.value as 'strong' | 'adequate' | 'weak')}
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white">
            <option value="strong">Strong (-2)</option>
            <option value="adequate">Adequate (-1)</option>
            <option value="weak">Weak (0)</option>
          </select>
        </label>
        <label className="text-[10px] text-adv-gray">
          Owner role
          <input type="text" value={ownerRole} onChange={e => setOwnerRole(e.target.value)} maxLength={200}
            placeholder="e.g. Finance lead"
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white" />
        </label>
      </div>

      <label className={`block text-[10px] ${evidenceMissing ? 'text-adv-red' : 'text-adv-gray'}`}>
        Evidence {evidenceRequired && <span className="text-adv-red">(required for Strong, ≥5 chars)</span>}
        <textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows={2} maxLength={4000}
          placeholder="Specific, dated, retrievable. e.g. 'Bank workflow screenshot 2026-04-12 + dual-signed sample payment'"
          className={`mt-1 w-full rounded border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white ${evidenceMissing ? 'border-adv-red' : 'border-border'}`} />
      </label>

      <div>
        <div className="text-[10px] text-adv-gray mb-1">Vulnerabilities this control covers</div>
        <div className="max-h-40 overflow-y-auto space-y-0.5 rounded border border-border bg-adv-dark p-2">
          {vulnerabilities.length === 0 && <div className="text-[10px] text-adv-gray italic">No vulnerabilities yet — add some on the Vulnerabilities surface first.</div>}
          {vulnerabilities.map(v => (
            <label key={v.id} className="flex items-center gap-2 text-[11px] text-adv-off-white">
              <input type="checkbox" checked={linkedVulns.has(v.id)}
                onChange={(e) => {
                  setLinkedVulns(prev => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(v.id); else next.delete(v.id);
                    return next;
                  });
                }}
                className="accent-adv-teal" />
              {v.vuln_code} — {v.name} <span className="text-adv-gray">(severity {v.severity})</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">Cancel</button>
        <button onClick={() => void submit()}
          disabled={submitting || !name.trim() || evidenceMissing}
          className="rounded bg-adv-teal px-2 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 inline-flex items-center gap-1">
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Add control
        </button>
      </div>
    </div>
  );
}
